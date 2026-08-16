"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/Logo";
import {
  useApprovalSlots,
  useChemicals,
  useDiseases,
  useEmployees,
  useEtlRules,
  useGreenhouses,
  usePests,
  useVarieties,
} from "@/lib/hooks";

/**
 * Settings — the configuration surface, deliberately styled as a settings
 * page and not a dashboard: a section rail on the left, dense label/value
 * rows on the right. No KPI tiles, no charts, no hover-lift cards. Numbers
 * appear only as quiet status text, because here they describe *what is
 * configured*, not *how the farm is doing*.
 */

const SECTIONS = [
  { id: "farm", label: "Farm setup" },
  { id: "people", label: "People & access" },
  { id: "approvals", label: "Compliance & approvals" },
  { id: "agronomy", label: "Agronomy reference" },
  { id: "rules", label: "Detection rules" },
  { id: "about", label: "About" },
] as const;

export default function SettingsPage() {
  const greenhouses = useGreenhouses();
  const employees = useEmployees();
  const varieties = useVarieties();
  const pests = usePests();
  const diseases = useDiseases();
  const chemicals = useChemicals();
  const etlRules = useEtlRules();
  const slots = useApprovalSlots();

  const [active, setActive] = useState<string>("farm");

  const beds = (greenhouses.data ?? []).reduce((s, g) => s + (g.bed_count ?? 0), 0);
  const scouts = (employees.data ?? []).filter((e) => e.role === "scout").length;
  const admins = (employees.data ?? []).filter((e) => e.role !== "scout").length;

  const n = (v: number | undefined, unit: string, plural = `${unit}s`) =>
    v == null ? "—" : `${v} ${v === 1 ? unit : plural}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-12 pt-6">
      <header className="border-b border-line pb-4">
        <h1 className="text-xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Configuration for this farm — geometry, people, agronomy vocabulary and the
          rules that raise recommendations.
        </p>
      </header>

      <div className="flex gap-8 pt-6">
        {/* Section rail */}
        <nav className="hidden w-44 shrink-0 lg:block">
          <ul className="sticky top-4 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active === s.id
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-ink-faint hover:bg-surface hover:text-ink"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-8">
          <Section id="farm" title="Farm setup">
            <Row
              href="/mapping"
              label="Greenhouse boundaries"
              hint="Draw geofences on satellite imagery. Scouts can only submit from inside one."
              value={n(greenhouses.data?.length, "greenhouse")}
            />
            <Row
              href="/mapping"
              label="Beds"
              hint="The pressure index divides by beds scouted, so every bed must be registered."
              value={greenhouses.data ? n(beds, "bed") : "—"}
            />
            <Row
              href="/mapping"
              label="QR check-in codes"
              hint="Fallback verification where GPS is unreliable under polythene."
              value="Per greenhouse"
            />
          </Section>

          <Section id="people" title="People & access">
            <Row
              href="/workforce"
              label="Scouts"
              hint="Field staff who capture observations in the mobile app."
              value={employees.data ? n(scouts, "scout") : "—"}
            />
            <Row
              href="/workforce"
              label="Supervisors & admins"
              hint="Portal access for reviewing records and approving spray programs."
              value={employees.data ? n(admins, "account") : "—"}
            />
            <Row
              href="/workforce"
              label="Device PINs"
              hint="Each scout signs in on one registered device with a 4-digit PIN."
              value="Managed per employee"
            />
          </Section>

          <Section id="approvals" title="Compliance & approvals">
            <Row
              href="/approvals"
              label="Approval signatures"
              hint="Who must sign a spray approval sheet, and in what order. Signing locks the programme and files a signed PDF."
              value={n(slots.data?.filter((s) => s.is_active).length, "line")}
            />
          </Section>

          <Section id="agronomy" title="Agronomy reference">
            <Row
              href="/reference"
              label="Varieties"
              hint="Crop varieties available when recording an observation."
              value={n(varieties.data?.length, "variety", "varieties")}
            />
            <Row
              href="/reference"
              label="Pests"
              hint="Includes the per-pest severity ETL and pressure-index threshold."
              value={n(pests.data?.length, "pest")}
            />
            <Row
              href="/reference"
              label="Diseases"
              hint="Includes the per-disease severity ETL and pressure-index threshold."
              value={n(diseases.data?.length, "disease")}
            />
            <Row
              href="/reference"
              label="Chemical catalogue"
              hint="Products, prices, WHO class, RAC group, PHI and REI. Importable from FloriSynergy."
              value={n(chemicals.data?.length, "product")}
            />
            <Row
              href="/reference"
              label="ETL override rules"
              hint="Tighter thresholds for a specific variety or greenhouse, with an audit trail."
              value={n(etlRules.data?.length, "rule")}
            />
          </Section>

          <Section
            id="rules"
            title="Detection rules"
            note="These are system-wide and apply to every block. Per-pest values are edited under Reference data."
          >
            <Fact
              label="Pressure index"
              value="Σ severity ÷ beds scouted"
              hint="Beds visited with nothing found count as 0, so they dilute the index."
            />
            <Fact
              label="Hotspot severity"
              value="≥ 4"
              hint="A single observation at or above this raises an alert regardless of the block index."
            />
            <Fact
              label="Action required when"
              value="index ≥ ETL  OR  severity ≥ 4"
              hint="Either condition alone is enough to open a recommendation."
            />
            <Fact
              label="Movement dwell cap"
              value="45 min"
              hint="Longer gaps between records are treated as a break, not time spent on a bed."
            />
          </Section>

          <Section id="about" title="About">
            <div className="flex items-center gap-4 px-4 py-4">
              <LogoMark size={36} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Florisynergy IPM</p>
                <p className="text-xs text-ink-faint">
                  Version 1.0 · Geofenced scouting, spraying and agronomy. Scouts capture
                  in the mobile app; everything syncs here.
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </h2>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
        {children}
      </div>
      {note && <p className="mt-2 text-xs text-ink-faint">{note}</p>}
    </section>
  );
}

/** A row that navigates somewhere to be changed. */
function Row({
  href,
  label,
  hint,
  value,
}: {
  href: string;
  label: string;
  hint: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">{hint}</span>
      </span>
      <span className="shrink-0 text-xs text-ink-soft">{value}</span>
      <ChevronRight
        size={15}
        className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** A row that states how the system behaves — nothing to click. */
function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">{hint}</span>
      </span>
      <span className="shrink-0 rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-ink-soft">
        {value}
      </span>
    </div>
  );
}
