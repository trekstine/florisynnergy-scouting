"""E-signing for approval sheets.

A spray approval is the document that says a named person authorised putting a
specific chemical, at a specific dose, on a specific block. On paper that is a
signature. Here it is a drawn mark, a re-entered PIN, a timestamp, a device,
and — the part that actually carries the weight — a hash of exactly what was
on the sheet at the moment of signing.

Three rules hold the thing together:

* **Signing re-authenticates.** A session left open on a shared office machine
  must not be able to approve a spray, so the PIN is asked for again.
* **Signing freezes.** Once a program carries a live signature it cannot be
  edited. Otherwise the signature would drift away from what was approved.
* **Nothing is deleted.** A withdrawn approval is voided with a reason and
  stays on the record, because the fact that somebody signed and then thought
  better of it is itself worth keeping.

This is a business control, not a legal opinion. Whether an electronic
signature satisfies a particular regulator or contract is a question for the
farm's own counsel.
"""
from __future__ import annotations

import base64
import binascii
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..models import ApprovalSlot, Employee, Signature, SprayRecord
from ..routers.media import MEDIA_DIR
from ..schemas import (
    ApprovalSlotIn,
    ApprovalSlotOut,
    ApprovalSlotUpdate,
    ApprovalState,
    SignatureOut,
    SignatureSlotState,
    SignRequest,
    VoidRequest,
)
from ..security import verify_secret
from ..services.signing import hash_spray_program

router = APIRouter(prefix="/approvals", tags=["approvals"])

DOC_SPRAY = "spray_program"

# What a farm gets before anyone configures anything. Chosen to match the
# paper sheet these replace rather than to be minimal — a farm that only wants
# one signature can retire the other two in Settings.
DEFAULT_SLOTS = [
    ("Prepared by", "Raised the program and calculated the dose", None, 0),
    ("Approved by", "Authorises the chemical, the dose and the spend", "supervisor", 1),
    ("Received by", "Collected the chemical and carried out the spray", None, 2),
]


# ───────────────────────────── Slot configuration ────────────────────────────
async def _slots_for(db: AsyncSession, farm_id: int | None) -> list[ApprovalSlot]:
    """The slots in force, seeding a farm's first set on demand.

    Seeding here rather than in a migration means a farm added next year gets
    a working sheet without anyone remembering to configure one.
    """
    rows = list(
        (
            await db.execute(
                select(ApprovalSlot)
                .where(ApprovalSlot.is_active.is_(True))
                .order_by(ApprovalSlot.position, ApprovalSlot.id)
            )
        ).scalars().all()
    )
    if rows:
        return rows

    for label, hint, role, position in DEFAULT_SLOTS:
        db.add(
            ApprovalSlot(
                farm_id=farm_id,
                label=label,
                hint=hint,
                required_role=role,
                position=position,
            )
        )
    await db.commit()
    return list(
        (
            await db.execute(
                select(ApprovalSlot)
                .where(ApprovalSlot.is_active.is_(True))
                .order_by(ApprovalSlot.position, ApprovalSlot.id)
            )
        ).scalars().all()
    )


@router.get("/slots", response_model=list[ApprovalSlotOut])
async def list_slots(
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    return await _slots_for(db, None)


@router.post("/slots", response_model=ApprovalSlotOut, status_code=status.HTTP_201_CREATED)
async def create_slot(
    payload: ApprovalSlotIn,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin")),
):
    slot = ApprovalSlot(**payload.model_dump())
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return slot


@router.patch("/slots/{slot_id}", response_model=ApprovalSlotOut)
async def update_slot(
    slot_id: int,
    payload: ApprovalSlotUpdate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin")),
):
    slot = await db.get(ApprovalSlot, slot_id)
    if slot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Signature line not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(slot, field, value)
    await db.commit()
    await db.refresh(slot)
    return slot


@router.delete("/slots/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin")),
):
    """Retire a signature line.

    Deactivated rather than deleted: sheets already signed against it must
    still be able to say what that person was signing as.
    """
    slot = await db.get(ApprovalSlot, slot_id)
    if slot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Signature line not found")
    slot.is_active = False
    await db.commit()


# ──────────────────────────── Document resolution ────────────────────────────
async def _spray_rows(db: AsyncSession, program_id: str) -> list[SprayRecord]:
    rows = list(
        (
            await db.execute(
                select(SprayRecord).where(SprayRecord.program_id == program_id)
            )
        ).scalars().all()
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spray program not found")
    return rows


async def _current_hash(db: AsyncSession, doc_type: str, doc_id: str) -> str:
    if doc_type != DOC_SPRAY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unknown document type '{doc_type}'"
        )
    return hash_spray_program(await _spray_rows(db, doc_id))


async def _signatures(
    db: AsyncSession, doc_type: str, doc_id: str
) -> list[Signature]:
    return list(
        (
            await db.execute(
                select(Signature)
                .where(
                    Signature.document_type == doc_type,
                    Signature.document_id == doc_id,
                )
                .order_by(Signature.signed_at)
            )
        ).scalars().all()
    )


async def _state(
    db: AsyncSession, doc_type: str, doc_id: str, farm_id: int | None = None
) -> ApprovalState:
    slots = await _slots_for(db, farm_id)
    sigs = await _signatures(db, doc_type, doc_id)
    live = [s for s in sigs if s.voided_at is None]
    current = await _current_hash(db, doc_type, doc_id)

    by_slot = {s.slot_id: s for s in live if s.slot_id is not None}
    slot_states = [
        SignatureSlotState(
            slot=ApprovalSlotOut.model_validate(slot),
            signature=(
                SignatureOut.model_validate(by_slot[slot.id])
                if slot.id in by_slot
                else None
            ),
        )
        for slot in slots
    ]

    slot_ids = {s.id for s in slots}
    orphans = [
        SignatureOut.model_validate(s)
        for s in live
        if s.slot_id is None or s.slot_id not in slot_ids
    ]

    # The first live signature fixes what was agreed; later ones must match it.
    signed_hash = live[0].content_hash if live else None
    required = [s for s in slots if s.is_required]

    return ApprovalState(
        document_type=doc_type,
        document_id=doc_id,
        slots=slot_states,
        orphan_signatures=orphans,
        current_hash=current,
        signed_hash=signed_hash,
        intact=signed_hash is None or signed_hash == current,
        locked=bool(live),
        complete=bool(required)
        and all(st.signature is not None for st in slot_states if st.slot.is_required),
        signed_count=len(live),
        required_count=len(required),
    )


@router.get("/{document_type}/{document_id}", response_model=ApprovalState)
async def approval_state(
    document_type: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    """The sheet's signature state, and whether it still matches what was signed."""
    return await _state(db, document_type, document_id)


# ───────────────────────────────── Signing ───────────────────────────────────
def _save_signature_image(data_url: str | None) -> str | None:
    """Write the drawn mark to the media store.

    Taken as a data URL in the signing request rather than uploaded first, so
    the mark and the act of signing are one atomic step — there is no window
    where an image exists that nobody has yet signed with.
    """
    if not data_url:
        return None
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The signature must be a PNG data URL."
        )
    raw = data_url[len(prefix):]
    try:
        blob = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Corrupt signature image.")
    if len(blob) > 2 * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Signature image too large."
        )

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    name = f"sig_{uuid.uuid4().hex}.png"
    (MEDIA_DIR / name).write_bytes(blob)
    return f"/media/{name}"


@router.post("/{document_type}/{document_id}/sign", response_model=ApprovalState)
async def sign(
    document_type: str,
    document_id: str,
    payload: SignRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(get_current_employee),
):
    slot = await db.get(ApprovalSlot, payload.slot_id)
    if slot is None or not slot.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Signature line not found")

    if slot.required_role and current.role != slot.required_role:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"“{slot.label}” must be signed by a {slot.required_role}.",
        )

    # Re-authenticate. This is the whole reason the PIN is in the payload.
    if not verify_secret(payload.pin, current.pin_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That PIN is not correct.")

    existing = await _signatures(db, document_type, document_id)
    live = [s for s in existing if s.voided_at is None]
    if any(s.slot_id == slot.id for s in live):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"“{slot.label}” has already been signed. Void it first to re-sign.",
        )

    current_hash = await _current_hash(db, document_type, document_id)

    # A second signer must be agreeing to the same document as the first.
    if live and live[0].content_hash != current_hash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This sheet has changed since it was first signed. Void the existing "
            "signatures and start the approval again.",
        )

    image_url = _save_signature_image(payload.signature_image)

    signature = Signature(
        document_type=document_type,
        document_id=document_id,
        slot_id=slot.id,
        slot_label=slot.label,
        employee_id=current.id,
        signer_name=current.name,
        signer_role=current.role,
        image_url=image_url,
        content_hash=current_hash,
        signed_at=datetime.now(timezone.utc),
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
    )
    db.add(signature)
    await db.commit()

    state = await _state(db, document_type, document_id)

    # Every required line signed: file the sheet automatically, so the e-filing
    # copy is produced rather than remembered.
    if state.complete and document_type == DOC_SPRAY:
        await _archive_signed_sheet(db, document_id, state)
        state = await _state(db, document_type, document_id)

    return state


@router.post("/{document_type}/{document_id}/void/{signature_id}", response_model=ApprovalState)
async def void_signature(
    document_type: str,
    document_id: str,
    signature_id: int,
    payload: VoidRequest,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    """Withdraw a signature, with a reason. It stays on the record."""
    sig = await db.get(Signature, signature_id)
    if sig is None or sig.document_id != document_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Signature not found")
    if sig.voided_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That signature is already void.")

    sig.voided_at = datetime.now(timezone.utc)
    sig.voided_by = current.id
    sig.void_reason = payload.reason
    await db.commit()
    return await _state(db, document_type, document_id)


@router.get("/{document_type}/{document_id}/history", response_model=list[SignatureOut])
async def signature_history(
    document_type: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    """Every signature ever applied, voided ones included."""
    return [
        SignatureOut.model_validate(s)
        for s in await _signatures(db, document_type, document_id)
    ]


async def _archive_signed_sheet(
    db: AsyncSession, program_id: str, state: ApprovalState
) -> None:
    """Render the fully-signed sheet to PDF and file it against the program."""
    from ..models import SprayAttachment
    from ..services.approval_pdf import render_approval_pdf

    rows = await _spray_rows(db, program_id)
    already = (
        await db.execute(
            select(SprayAttachment).where(
                SprayAttachment.program_id == program_id,
                SprayAttachment.kind == "signed_approval",
            )
        )
    ).scalars().first()
    if already is not None:
        return  # Already filed; signing a re-opened sheet re-files on the next completion.

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    name = f"approval_{program_id[:8]}_{uuid.uuid4().hex[:8]}.pdf"
    destination: Path = MEDIA_DIR / name
    try:
        size = render_approval_pdf(destination, rows, state)
    except Exception:
        # A PDF that will not render must never cost somebody their signature.
        return

    db.add(
        SprayAttachment(
            program_id=program_id,
            filename=name,
            url=f"/media/{name}",
            content_type="application/pdf",
            size_bytes=size,
            kind="signed_approval",
            note="Generated when the last required signature was applied.",
        )
    )
    await db.commit()
