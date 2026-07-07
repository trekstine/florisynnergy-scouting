import type { Pressure, RecStatus, ScoutingFor, VerificationMethod } from "./types";

export const PRESSURE_HEX: Record<Pressure, string> = {
  none: "#94a3b8",
  low: "#10b981",
  medium: "#f59e0b",
  high: "#dc2626",
};

export const PRESSURE_LABEL: Record<Pressure, string> = {
  none: "No data",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const SCOUTING_LABEL: Record<ScoutingFor, string> = {
  disease: "Disease",
  pest: "Pest",
  lure: "Lure",
  sticky_trap: "Sticky Trap",
};

export const VERIFICATION_LABEL: Record<VerificationMethod, string> = {
  gps: "GPS",
  qr_code: "QR code",
  pin_bypass: "PIN bypass",
  manual: "Manual",
};

/** GPS / QR are trusted geofence proofs; PIN-bypass and manual are not. */
export function isVerified(method: VerificationMethod): boolean {
  return method === "gps" || method === "qr_code";
}

export const REC_STATUS_LABEL: Record<RecStatus, string> = {
  open: "Open",
  planned: "Planned",
  actioned: "Actioned",
  resolved: "Resolved",
};

export const REC_STATUS_HEX: Record<RecStatus, string> = {
  open: "#dc2626",
  planned: "#f59e0b",
  actioned: "#2563eb",
  resolved: "#059669",
};

/** Severity 0–5 → a green→red heat color. */
export function severityHex(sev: number): string {
  const s = Math.max(0, Math.min(5, sev));
  const scale = ["#e2e8f0", "#bbf7d0", "#fde68a", "#fdba74", "#f87171", "#dc2626"];
  return scale[Math.round(s)] ?? "#e2e8f0";
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function relativeTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v).getTime();
  if (Number.isNaN(d)) return "—";
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(v);
}
