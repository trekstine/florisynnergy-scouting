"use client";

import {
  AlertTriangle,
  Check,
  FileCheck2,
  Lock,
  PenLine,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";

import { SignaturePad } from "@/components/SignaturePad";
import { Button, ErrorBox, Spinner, TextInput } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  useApprovalState,
  useMe,
  useSign,
  useVoidSignature,
} from "@/lib/hooks";
import type { SignatureSlotState } from "@/lib/types";

/**
 * The signature block on an approval sheet.
 *
 * A signature here is a drawn mark, a re-entered PIN, a timestamp and a hash
 * of exactly what was on the sheet at the time. The hash is what stops this
 * being decoration: the portal recomputes it on every view, so a programme
 * edited after approval is reported rather than quietly re-presented as
 * approved.
 */
export function ApprovalSignatures({
  documentId,
  documentType = "spray_program",
}: {
  documentId: string;
  documentType?: string;
}) {
  const q = useApprovalState(documentId, documentType);
  const me = useMe();
  const [signing, setSigning] = useState<SignatureSlotState | null>(null);

  if (q.isLoading) {
    return (
      <section className="rounded-xl border border-line bg-white p-5 print:border-0">
        <Spinner label="Loading approvals…" />
      </section>
    );
  }
  if (q.isError || !q.data) return null;

  const state = q.data;

  return (
    <section className="rounded-xl border border-line bg-white print:border-0">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 print:hidden">
        <h3 className="text-sm font-bold text-ink">Approval signatures</h3>
        <span className="text-xs text-ink-faint">
          {state.signed_count} of {state.required_count} required
        </span>
        {state.locked && (
          <span
            className="flex items-center gap-1 text-xs font-semibold text-ink-soft"
            title="A signed programme cannot be edited — void the signatures first."
          >
            <Lock size={11} /> Locked
          </span>
        )}
      </header>

      {/* The verdict comes first, because it decides whether anything below
          can be relied on at all. */}
      {!state.intact ? (
        <div className="m-5 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3 print:m-0 print:mb-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700" />
          <div>
            <p className="text-sm font-bold text-red-900">
              This programme changed after it was signed
            </p>
            <p className="mt-0.5 text-xs text-red-800">
              The signatures below were given against different content. Void
              them and approve the programme again — do not spray against this
              sheet.
            </p>
          </div>
        </div>
      ) : state.complete ? (
        <div className="m-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 print:m-0 print:mb-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-bold text-emerald-900">
              Fully approved and unchanged since signing
            </p>
            <p className="mt-0.5 text-xs text-emerald-800">
              Verified against the content fingerprint recorded at signing.
            </p>
          </div>
        </div>
      ) : null}

      {/* One block per configured line. */}
      <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        {state.slots.map((st) => (
          <SlotBlock
            key={st.slot.id}
            state={st}
            canSign={
              !st.signature &&
              state.intact &&
              (!st.slot.required_role || me.data?.role === st.slot.required_role)
            }
            onSign={() => setSigning(st)}
            documentId={documentId}
            documentType={documentType}
            canVoid={me.data?.role === "admin" || me.data?.role === "supervisor"}
          />
        ))}
      </div>

      {/* The fingerprint, printed with the sheet so a paper copy can be
          checked against the record it came from. */}
      {/* <footer className="border-t border-line px-5 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-faint">
          Content fingerprint (SHA-256)
        </p>
        <p className="mt-0.5 break-all font-mono text-[10px] text-ink-soft">
          {state.signed_hash ?? state.current_hash}
        </p>
        {state.signed_hash && state.signed_hash !== state.current_hash && (
          <p className="mt-1 break-all font-mono text-[10px] text-red-700">
            now: {state.current_hash}
          </p>
        )}
      </footer> */}

      {signing && (
        <SignDialog
          state={signing}
          documentId={documentId}
          documentType={documentType}
          onClose={() => setSigning(null)}
        />
      )}
    </section>
  );
}

function SlotBlock({
  state,
  canSign,
  canVoid,
  onSign,
  documentId,
  documentType,
}: {
  state: SignatureSlotState;
  canSign: boolean;
  canVoid: boolean;
  onSign: () => void;
  documentId: string;
  documentType: string;
}) {
  const voidSig = useVoidSignature();
  const sig = state.signature;

  async function withdraw() {
    const reason = prompt(
      `Why is “${state.slot.label}” being withdrawn? This is kept on the record.`,
    );
    if (!reason || reason.trim().length < 3) return;
    await voidSig.mutateAsync({
      documentId,
      documentType,
      signatureId: sig!.id,
      reason: reason.trim(),
    });
  }

  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        {state.slot.label}
        {!state.slot.is_required && " (optional)"}
      </p>
      {state.slot.hint && (
        <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
          {state.slot.hint}
        </p>
      )}

      <div className="mt-2 flex h-16 items-end border-b border-line">
        {sig?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sig.image_url}
            alt={`${sig.signer_name}'s signature`}
            className="max-h-16 object-contain"
          />
        ) : sig ? (
          <span className="flex items-center gap-1 pb-1 text-sm font-semibold text-emerald-700">
            <Check size={14} /> Signed
          </span>
        ) : null}
      </div>

      {sig ? (
        <div className="mt-1.5">
          <p className="text-sm font-semibold text-ink">{sig.signer_name}</p>
          <p className="text-[11px] capitalize text-ink-faint">
            {sig.signer_role} · {formatDateTime(sig.signed_at)}
          </p>
          {canVoid && (
            <button
              onClick={withdraw}
              disabled={voidSig.isPending}
              className="mt-1 text-[11px] font-semibold text-ink-faint hover:text-red-700 hover:underline disabled:opacity-50 print:hidden"
            >
              Withdraw this signature
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1.5 print:hidden">
          {canSign ? (
            <Button variant="outline" onClick={onSign}>
              <PenLine size={14} /> Sign
            </Button>
          ) : (
            <p className="text-[11px] text-ink-faint">
              {state.slot.required_role
                ? `Awaiting a ${state.slot.required_role}`
                : "Awaiting signature"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SignDialog({
  state,
  documentId,
  documentType,
  onClose,
}: {
  state: SignatureSlotState;
  documentId: string;
  documentType: string;
  onClose: () => void;
}) {
  const sign = useSign();
  const me = useMe();
  const [image, setImage] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!image) {
      setError("Draw your signature before confirming.");
      return;
    }
    if (!pin.trim()) {
      setError("Enter your PIN to confirm it is you signing.");
      return;
    }
    setError(null);
    try {
      await sign.mutateAsync({
        documentId,
        documentType,
        slot_id: state.slot.id,
        pin: pin.trim(),
        signature_image: image,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the signature.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 print:hidden">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-ink">
              Sign as &ldquo;{state.slot.label}&rdquo;
            </h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              {me.data?.name}
              {me.data?.role && ` · ${me.data.role}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <ErrorBox message={error} />

          <SignaturePad onChange={setImage} />

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Confirm with your PIN
            </label>
            <TextInput
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="••••"
              className="max-w-[10rem]"
            />
            {/* Why we ask again for someone who is plainly already signed in. */}
            <p className="mt-1 text-xs text-ink-faint">
              Asked again at the moment of signing, so a session left open on a
              shared machine cannot approve a spray.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="flex items-start gap-2 text-xs text-ink-soft">
              <FileCheck2 size={14} className="mt-0.5 shrink-0 text-ink-faint" />
              Signing records your name, role, the time, this device and a
              fingerprint of the programme exactly as it stands. The programme
              is then locked against edits.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={sign.isPending || !image || !pin.trim()}>
            <PenLine size={15} />
            {sign.isPending ? "Signing…" : "Confirm signature"}
          </Button>
        </div>
      </div>
    </div>
  );
}
