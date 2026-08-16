"use client";

import { ArrowRight, Bug, ClipboardCheck, Map, Users } from "lucide-react";
import Link from "next/link";

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
 * Settings — a hub over the four pages where configuration actually happens.
 *
 * The previous version listed twelve rows leading to four destinations: five
 * of them all landed on Reference data. That promised a structure the app does
 * not have, and a section rail that never tracked scrolling made it worse. One
 * card per real destination is the honest shape — what you see is what you can
 * open, and each card says what is inside it before you go.
 */
export default function SettingsPage() {
  const greenhouses = useGreenhouses();
  const employees = useEmployees();
  const varieties = useVarieties();
  const pests = usePests();
  const diseases = useDiseases();
  const chemicals = useChemicals();
  const etlRules = useEtlRules();
  const slots = useApprovalSlots();

  const beds = (greenhouses.data ?? []).reduce((s, g) => s + (g.bed_count ?? 0), 0);
  const scouts = (employees.data ?? []).filter((e) => e.role === "scout").length;
  const admins = (employees.data ?? []).filter((e) => e.role !== "scout").length;

  /** Counts read as "—" until they load, rather than flashing a wrong zero. */
  const n = (v: number | undefined, unit: string, plural = `${unit}s`) =>
    v == null ? `— ${plural}` : `${v} ${v === 1 ? unit : plural}`;

  const AREAS = [
    {
      href: "/mapping",
      icon: Map,
      title: "Farm & blocks",
      blurb:
        "Greenhouse geofences drawn on satellite imagery, the beds inside them, and the QR codes scouts scan where GPS struggles under polythene.",
      items: [
        n(greenhouses.data?.length, "greenhouse"),
        greenhouses.data ? n(beds, "bed") : "— beds",
        "QR check-in codes",
      ],
    },
    {
      href: "/workforce",
      icon: Users,
      title: "People & access",
      blurb:
        "Who captures observations in the field, who reviews and approves in the portal, and the device PIN each of them signs in with.",
      items: [
        employees.data ? n(scouts, "scout") : "— scouts",
        employees.data ? n(admins, "supervisor or admin", "supervisors & admins") : "— accounts",
        "Device PINs",
      ],
    },
    {
      href: "/reference",
      icon: Bug,
      title: "Agronomy reference",
      blurb:
        "The vocabulary the whole system reasons in — what can be found, on what, treated with what — plus the thresholds that raise a recommendation.",
      items: [
        n(varieties.data?.length, "variety", "varieties"),
        n(pests.data?.length, "pest"),
        n(diseases.data?.length, "disease"),
        n(chemicals.data?.length, "chemical"),
        n(etlRules.data?.length, "ETL override", "ETL overrides"),
      ],
    },
    {
      href: "/approvals",
      icon: ClipboardCheck,
      title: "Compliance & approvals",
      blurb:
        "The signature lines every spray approval sheet carries. Once every required line is signed the programme locks and a signed PDF is filed against it.",
      items: [
        n(slots.data?.filter((s) => s.is_active).length, "signature line"),
        "Signing order",
        "Who may sign each line",
      ],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-12 pt-6">
      <header className="border-b border-line pb-4">
        <h1 className="text-xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Four places to configure this farm. Everything else in the portal reads
          from what is set here.
        </p>
      </header>

      <div className="grid gap-4 pt-6 md:grid-cols-2">
        {AREAS.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="group flex flex-col rounded-xl border border-line bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <area.icon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  {area.title}
                  <ArrowRight
                    size={14}
                    className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                  />
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  {area.blurb}
                </p>
              </div>
            </div>

            {/* What is inside, stated on the card rather than promised by a row
                that leads to the same page as the four rows above it. */}
            <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {area.items.map((item) => (
                <li
                  key={item}
                  className="rounded-md bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </div>

      <footer className="mt-8 flex items-center gap-4 border-t border-line pt-5">
        <LogoMark size={32} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Florisynergy IPM</p>
          <p className="text-xs text-ink-faint">
            Version 1.0 · Geofenced scouting, spraying and agronomy. Scouts capture
            in the mobile app; everything syncs here.
          </p>
        </div>
      </footer>
    </div>
  );
}
