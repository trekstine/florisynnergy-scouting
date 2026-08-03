"use client";

import { ChevronRight, LogOut, MapPin } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { SessionUser } from "@/lib/types";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/map": "Pressure Map",
  "/scouting": "Scouting",
  "/recommendations": "Recommendations",
  "/spray": "Spray Programs",
  "/analytics": "Analytics",
  "/settings": "Settings",
  "/mapping": "Farm Mapping",
  "/workforce": "Workforce",
  "/reference": "Reference Data",
};

/** Sub-pages that live under the Settings hub get a breadcrumb. */
const SETTINGS_CHILDREN = new Set(["/mapping", "/workforce", "/reference"]);

export function Topbar({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const pathname = usePathname();

  const base = "/" + (pathname.split("/")[1] ?? "");
  const title = PAGE_TITLES[base] ?? "FloriSynergy";
  const inSettings = SETTINGS_CHILDREN.has(base);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm">
          {inSettings && (
            <>
              <span className="font-medium text-ink-faint">Settings</span>
              <ChevronRight size={14} className="text-ink-faint" />
            </>
          )}
          <h1 className="font-bold tracking-tight text-ink">{title}</h1>
        </div>
        <span className="hidden items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 md:inline-flex">
          <MapPin size={11} />
          Naivasha Rose Estate
        </span>
      </div>

      <div className="flex items-center gap-4">
        <p className="hidden text-xs font-medium text-ink-faint lg:block">{today}</p>
        <div className="h-5 w-px bg-line" />
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-xs font-bold text-white">
            {initials}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold leading-tight text-ink">{user?.name}</p>
            <p className="text-xs capitalize text-ink-faint">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
