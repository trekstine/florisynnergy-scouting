"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ScoutingBehindLink } from "@/components/ScoutingBehindLink";
import { Badge, Button, ErrorBox, Select, Spinner, TextInput } from "@/components/ui";
import { api, V1 } from "@/lib/client-api";
import { SCOUTING_LABEL, bedLabel, formatDate, formatDateTime, severityHex } from "@/lib/format";
import {
  useAddAttachment,
  useAttachments,
  useDeleteAttachment,
  useScouting,
  useUpdateProgramStatus,
} from "@/lib/hooks";
import type { Effectiveness, ProgramStatus, SprayRecord } from "@/lib/types";

const STEPS: { id: ProgramStatus; label: string; hint: string }[] = [
  { id: "planned", label: "Planned", hint: "Authorised, not yet sprayed" },
  { id: "applied", label: "Applied", hint: "The spray went out" },
  { id: "reviewed", label: "Reviewed", hint: "Follow-up round assessed" },
];

const EFFECTIVENESS: { id: Effectiveness; label: string; hex: string }[] = [
  { id: "effective", label: "Effective", hex: "#059669" },
  { id: "partial", label: "Partially effective", hex: "#b45309" },
  { id: "ineffective", label: "Not effective", hex: "#b91c1c" },
];

export const STATUS_HEX: Record<ProgramStatus, string> = {
  planned: "#64748b",
  applied: "#0891b2",
  reviewed: "#059669",
};

/**
 * Everything that happens to a spray program *after* it is created: was it
 * actually applied, did it work, and where is the signed paperwork.
 *
 * Rendered on the program page, so the status, the paperwork and the scouting
 * that justified the spray are all readable on one screen.
 */
export function SprayProgramPanel({
  programId,
  records,
  canEdit = true,
}: {
  programId: string;
  records: SprayRecord[];
  canEdit?: boolean;
}) {
  const head = records[0]!;
  const status: ProgramStatus = head.program_status ?? "planned";

  return (
    <div className="space-y-4">
      <Lifecycle programId={programId} head={head} status={status} canEdit={canEdit} />
      <Attachments programId={programId} canEdit={canEdit} />
      <ScoutingBehind
        greenhouseId={head.greenhouse_id}
        upto={head.scout_report_date ?? head.start_date}
      />
    </div>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────
function Lifecycle({
  programId,
  head,
  status,
  canEdit,
}: {
  programId: string;
  head: SprayRecord;
  status: ProgramStatus;
  canEdit: boolean;
}) {
  const update = useUpdateProgramStatus();
  const [open, setOpen] = useState<ProgramStatus | null>(null);
  const [appliedAt, setAppliedAt] = useState(
    (head.start_date ?? new Date().toISOString()).slice(0, 10),
  );
  const [comment, setComment] = useState(head.review_comment ?? "");
  const [effect, setEffect] = useState<Effectiveness | "">(head.effectiveness ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(next: ProgramStatus) {
    setError(null);
    try {
      await update.mutateAsync({
        programId,
        status: next,
        applied_at: next === "planned" ? null : `${appliedAt}T06:00:00Z`,
        review_comment: next === "reviewed" ? comment || null : null,
        effectiveness: next === "reviewed" ? effect || null : null,
      });
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the program.");
    }
  }

  const idx = STEPS.findIndex((s) => s.id === status);

  return (
    <section className="rounded-xl border border-line bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h4 className="text-sm font-bold text-ink">Program status</h4>
        <Badge color={STATUS_HEX[status]}>
          {STEPS.find((s) => s.id === status)?.label ?? status}
        </Badge>
        {head.applied_at && (
          <span className="text-xs text-ink-faint">
            Applied {formatDate(head.applied_at)}
          </span>
        )}
        {head.reviewed_at && (
          <span className="text-xs text-ink-faint">
            · Reviewed {formatDate(head.reviewed_at)}
          </span>
        )}
      </header>

      <div className="p-4">
        <ErrorBox message={error} />

        {/* The three states, with the current one marked. */}
        <ol className="flex flex-wrap items-stretch gap-2">
          {STEPS.map((s, i) => {
            const done = i <= idx;
            return (
              <li key={s.id} className="min-w-[150px] flex-1">
                <div
                  className="h-full rounded-lg border p-3"
                  style={{
                    borderColor: done ? `${STATUS_HEX[s.id]}66` : "#e2e8f0",
                    backgroundColor: done ? `${STATUS_HEX[s.id]}12` : "#fff",
                  }}
                >
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"
                     style={{ color: done ? STATUS_HEX[s.id] : "#64748b" }}>
                    {done && <Check size={13} />}
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{s.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {head.review_comment && (
          <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">
              Effectiveness review
            </p>
            {head.effectiveness && (
              <p
                className="mt-0.5 text-sm font-bold"
                style={{
                  color:
                    EFFECTIVENESS.find((e) => e.id === head.effectiveness)?.hex ?? "#0f172a",
                }}
              >
                {EFFECTIVENESS.find((e) => e.id === head.effectiveness)?.label}
              </p>
            )}
            <p className="mt-0.5 text-sm text-ink-soft">{head.review_comment}</p>
          </div>
        )}

        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status !== "applied" && status !== "reviewed" && (
              <Button variant="outline" onClick={() => setOpen("applied")}>
                Mark as applied
              </Button>
            )}
            {status !== "planned" && (
              <Button variant="outline" onClick={() => setOpen("reviewed")}>
                {status === "reviewed" ? "Edit review" : "Record effectiveness review"}
              </Button>
            )}
            {status !== "planned" && (
              <button
                onClick={() => save("planned")}
                className="text-xs font-semibold text-ink-faint hover:text-ink hover:underline"
              >
                Reset to planned
              </button>
            )}
            {update.isPending && <Loader2 size={15} className="animate-spin text-ink-faint" />}
          </div>
        )}

        {/* Mark applied */}
        {open === "applied" && (
          <div className="mt-3 rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-semibold text-ink">When did the spray go out?</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <TextInput
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="max-w-[11rem]"
              />
              <Button onClick={() => save("applied")} disabled={update.isPending}>
                Confirm applied
              </Button>
              <Button variant="outline" onClick={() => setOpen(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Review after the follow-up round */}
        {open === "reviewed" && (
          <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-semibold text-ink">
              Effectiveness, after the follow-up scouting round
            </p>
            <Select
              value={effect}
              onChange={(e) => setEffect(e.target.value as Effectiveness | "")}
              className="max-w-xs"
            >
              <option value="">Select a verdict…</option>
              {EFFECTIVENESS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </Select>
            <TextInput
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What the follow-up round showed, and what you'd do differently"
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => save("reviewed")} disabled={update.isPending}>
                Save review
              </Button>
              <Button variant="outline" onClick={() => setOpen(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Attachments ─────────────────────────────────────────────────────────────
function Attachments({ programId, canEdit }: { programId: string; canEdit: boolean }) {
  const list = useAttachments(programId);
  const add = useAddAttachment();
  const remove = useDeleteAttachment();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      // Two steps on purpose: the file goes to the media store, then the
      // program records a reference to it. Keeps binary handling in one place.
      const form = new FormData();
      form.append("file", file);
      const { url } = await api.upload<{ url: string }>(`${V1}/media/upload`, form);
      await add.mutateAsync({
        programId,
        filename: file.name,
        url,
        content_type: file.type || null,
        size_bytes: file.size,
        kind: /approval/i.test(file.name) ? "approval_sheet" : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const files = list.data ?? [];

  return (
    <section className="rounded-xl border border-line bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Paperclip size={15} className="text-ink-faint" />
          Documents
          {files.length > 0 && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-faint">
              {files.length}
            </span>
          )}
        </h4>
        {canEdit && (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {busy ? "Uploading…" : "Attach a file"}
            <input
              type="file"
              className="hidden"
              onChange={onFile}
              disabled={busy}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
            />
          </label>
        )}
      </header>

      <div className="p-4">
        <ErrorBox message={error} />
        {list.isLoading ? (
          <Spinner />
        ) : files.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Nothing filed yet. Attach the signed approval sheet here and it stays with
            the application it authorises.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <FileCheck2 size={15} className="shrink-0 text-brand-700" />
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-brand-700 hover:underline"
                >
                  {f.filename}
                </a>
                {f.kind === "approval_sheet" && <Badge color="#059669">Approval sheet</Badge>}
                <span className="shrink-0 text-xs text-ink-faint">
                  {formatDate(f.uploaded_at)}
                </span>
                {canEdit && (
                  <button
                    onClick={() => remove.mutate({ programId, id: f.id })}
                    title="Remove"
                    className="shrink-0 rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Scouting behind this block, inline ──────────────────────────────────────
function ScoutingBehind({
  greenhouseId,
  upto,
}: {
  greenhouseId: number | null;
  upto: string | null;
}) {
  const [open, setOpen] = useState(false);
  const scouting = useScouting(
    open && greenhouseId
      ? { greenhouse_id: greenhouseId, end: upto ?? undefined, limit: 500 }
      : undefined,
  );

  if (greenhouseId == null) return null;

  const findings = (scouting.data ?? [])
    .filter((r) => r.severity > 0)
    .sort((a, b) => b.severity - a.severity || b.recorded_at.localeCompare(a.recorded_at));
  const rounds = new Set((scouting.data ?? []).map((r) => r.batch_id).filter(Boolean));

  return (
    <section className="rounded-xl border border-line bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface"
      >
        {open ? (
          <ChevronDown size={15} className="text-ink-faint" />
        ) : (
          <ChevronRight size={15} className="text-ink-faint" />
        )}
        <ClipboardList size={15} className="text-ink-faint" />
        <span className="text-sm font-bold text-ink">Scouting behind this block</span>
        <span className="text-xs text-ink-faint">
          {open ? "" : "expands here, no new tab"}
        </span>
      </button>

      {open && (
        <div className="border-t border-line p-4">
          {scouting.isLoading ? (
            <Spinner />
          ) : findings.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No findings recorded on this block before the application date.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-ink-faint">
                {findings.length} finding{findings.length === 1 ? "" : "s"} across{" "}
                {rounds.size} round{rounds.size === 1 ? "" : "s"}, up to{" "}
                {upto ? formatDate(upto) : "the application"}. Worst first.
              </p>
              <ul className="divide-y divide-line">
                {findings.slice(0, 12).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
                      style={{ backgroundColor: severityHex(r.severity) }}
                    >
                      {r.severity}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">
                        {r.bed_code ? bedLabel(r.bed_code) : "Block-level"}
                      </span>
                      <span className="text-ink-faint">
                        {" "}
                        · {SCOUTING_LABEL[r.scouting_for]} · {formatDateTime(r.recorded_at)}
                      </span>
                    </span>
                    <Link
                      href={`/scouting/${r.id}`}
                      target="_blank"
                      className="shrink-0 text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <ScoutingBehindLink
                  greenhouseId={greenhouseId}
                  reportDate={upto}
                  label="Open the full scouting report"
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
