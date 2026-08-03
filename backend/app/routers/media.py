"""Scouting photo uploads.

Scouts attach a photo to a disease/pest observation as evidence. We accept a
multipart upload, write it to a local directory served at ``/media`` (mounted
in ``main.py``), and hand back a *relative* URL. Relative on purpose: the
mobile app already knows its own backend base URL (from the login session)
and can prefix it, while the web portal proxies ``/media/*`` straight through
to the API (see ``web/src/app/media/[...path]/route.ts``) — so neither client
needs to know the API's real, possibly-internal-only, host.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from ..deps import get_current_employee
from ..models import Employee

router = APIRouter(prefix="/media", tags=["media"])

MEDIA_DIR = Path(__file__).resolve().parent.parent.parent / "media"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB — phone camera photos, not raw dumps.


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile,
    _: Employee = Depends(get_current_employee),
) -> dict[str, str]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{suffix}"
    destination = MEDIA_DIR / filename

    size = 0
    with destination.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "Image too large (max 15 MB).",
                )
            out.write(chunk)

    return {"url": f"/media/{filename}"}
