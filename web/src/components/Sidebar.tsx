"use client";

import {
  Bug,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Leaf,
  Map,
  PenTool,
  SprayCan,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Pressure Map", icon: Map },
  { href: "/mapping", label: "Farm Mapping", icon: PenTool },
  { href: "/scouting", label: "Scouting", icon: ClipboardList },
  { href: "/recommendations", label: "Recommendations", icon: Bug },
  { href: "/spray", label: "Spray Programs", icon: SprayCan },
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/reference", label: "Reference Data", icon: FlaskConical },
  { href: "/workforce", label: "Workforce", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex w-64 shrink-0 flex-col border-r border-line bg-white">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
          <Leaf className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-ink">FloriSynergy</p>
          <p className="text-xs font-medium text-ink-faint">Scouting</p>
        </div>
      </div>
      <ul className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-soft hover:bg-surface hover:text-ink"
                }`}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={2} size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
