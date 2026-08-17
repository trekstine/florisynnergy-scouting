"use client";

import {
  Bug,
  ClipboardList,
  Droplets,
  FileText,
  LayoutDashboard,
  Map,
  Settings,
  SprayCan,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/Logo";

/**
 * Deep-green grouped sidebar. Day-to-day pages live in the main groups;
 * configuration (farm mapping, workforce, reference data) moved under the
 * pinned Settings entry at the bottom → /settings hub.
 */
const GROUPS: {
  label: string;
  items: { href: string; label: string; icon: typeof Map }[];
}[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/map", label: "Pressure Map", icon: Map },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/scouting", label: "Scouting", icon: ClipboardList },
      { href: "/scouting/rounds", label: "Scouting Reports", icon: FileText },
      { href: "/recommendations", label: "Recommendations", icon: Bug },
      { href: "/spray", label: "Spray Programs", icon: SprayCan },
      { href: "/fertigation", label: "Fertigation", icon: Droplets },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "/analytics", label: "Analytics", icon: TrendingUp }],
  },
];

/** The configuration pages nested under the Settings hub. */
export const SETTINGS_CHILDREN = [
  { href: "/mapping", label: "Farm Mapping" },
  { href: "/workforce", label: "Workforce" },
  { href: "/reference", label: "Reference Data" },
  { href: "/approvals", label: "Approval Signatures" },
];

/** Routes that belong to the Settings area (hub + its three sub-pages). */
export const SETTINGS_ROUTES = ["/settings", ...SETTINGS_CHILDREN.map((c) => c.href)];

/**
 * Every href the rail can highlight. Used to resolve nesting: /scouting/rounds
 * sits under /scouting, so a plain prefix test would light up both. The longest
 * matching entry wins instead.
 */
const ALL_HREFS = [
  ...GROUPS.flatMap((g) => g.items.map((i) => i.href)),
  ...SETTINGS_ROUTES,
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Map;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-white/60 hover:bg-white/5 hover:text-white"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />
      )}
      <Icon size={17} strokeWidth={2} />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (pathname !== href && !pathname.startsWith(`${href}/`)) return false;
    const best = ALL_HREFS.filter(
      (h) => pathname === h || pathname.startsWith(`${h}/`),
    ).sort((a, b) => b.length - a.length)[0];
    return best === href;
  };
  const settingsActive = SETTINGS_ROUTES.some(isActive);

  return (
    <nav className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-brand-900 to-[#03301f]">
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/dashboard">
          <Logo tone="light" />
        </Link>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavItem {...item} active={isActive(item.href)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        <NavItem
          href="/settings"
          label="Settings"
          icon={Settings}
          active={settingsActive}
        />

        {/* Configuration pages are only reachable through here, so once you're
            inside the area they expand — otherwise moving from Workforce to
            Reference Data means bouncing off the hub every time. */}
        {settingsActive && (
          <ul className="ml-[26px] mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
            {SETTINGS_CHILDREN.map((c) => (
              <li key={c.href}>
                <Link
                  href={c.href}
                  className={`block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                    isActive(c.href)
                      ? "font-semibold text-white"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 px-3 text-[10px] font-medium text-white/25">
          Florisynergy IPM · v1.0
        </p>
      </div>
    </nav>
  );
}
