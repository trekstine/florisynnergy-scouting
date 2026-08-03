"use client";

import {
  ArrowRight,
  FlaskConical,
  PenTool,
  Users,
} from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/components/Logo";
import { PageHeader } from "@/components/ui";
import {
  useChemicals,
  useDiseases,
  useEmployees,
  useGreenhouses,
  usePests,
  useVarieties,
} from "@/lib/hooks";

/**
 * Settings hub — the landing page for everything that configures the farm
 * rather than runs it: geometry (mapping), people (workforce), and agronomy
 * vocabulary (reference data). Each card shows live counts so an admin can
 * see at a glance what's set up and what's still empty.
 */
export default function SettingsPage() {
  const greenhouses = useGreenhouses();
  const employees = useEmployees();
  const varieties = useVarieties();
  const pests = usePests();
  const diseases = useDiseases();
  const chemicals = useChemicals();

  const bedCount = (greenhouses.data ?? []).reduce(
    (sum, g) => sum + (g.bed_count ?? 0),
    0,
  );
  const scoutCount = (employees.data ?? []).filter(
    (e) => e.role === "scout",
  ).length;

  const cards = [
    {
      href: "/mapping",
      icon: PenTool,
      color: "#059669",
      title: "Farm Mapping",
      description:
        "Draw greenhouse geofence boundaries, register beds, and manage QR codes for check-in verification.",
      stats: [
        { label: "Greenhouses", value: greenhouses.data?.length },
        { label: "Beds", value: greenhouses.data ? bedCount : undefined },
      ],
    },
    {
      href: "/workforce",
      icon: Users,
      color: "#2563eb",
      title: "Workforce",
      description:
        "Manage scouts, supervisors, and admins — devices, PINs, roles, and active status.",
      stats: [
        { label: "Employees", value: employees.data?.length },
        { label: "Scouts", value: employees.data ? scoutCount : undefined },
      ],
    },
    {
      href: "/reference",
      icon: FlaskConical,
      color: "#7c3aed",
      title: "Reference Data",
      description:
        "Varieties, pests, diseases, chemicals, and the economic thresholds that trigger recommendations.",
      stats: [
        { label: "Varieties", value: varieties.data?.length },
        { label: "Pests", value: pests.data?.length },
        { label: "Diseases", value: diseases.data?.length },
        { label: "Chemicals", value: chemicals.data?.length },
      ],
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Settings"
        subtitle="Configure the farm — geometry, people, and agronomy reference data"
      />

      <div className="grid gap-4 px-6 lg:grid-cols-3">
        {cards.map(({ href, icon: Icon, color, title, description, stats }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border border-line bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${color}14` }}
              >
                <Icon size={21} style={{ color }} />
              </div>
              <ArrowRight
                size={18}
                className="text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-brand-600"
              />
            </div>
            <h2 className="text-base font-bold text-ink">{title}</h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-faint">
              {description}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-lg font-bold leading-tight text-ink">
                    {s.value ?? "—"}
                  </p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {/* About strip */}
      <div className="px-6">
        <div className="flex items-center gap-4 rounded-xl border border-line bg-white p-5 shadow-card">
          <LogoMark size={40} />
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">FloriSynergy Scouting · v1.0</p>
            <p className="text-xs text-ink-faint">
              Geofenced scouting, spraying &amp; agronomy platform. Scouts capture in
              the mobile app; everything syncs here in real time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
