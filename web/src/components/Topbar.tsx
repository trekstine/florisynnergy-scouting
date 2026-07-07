"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import type { SessionUser } from "@/lib/types";

export function Topbar({ user }: { user: SessionUser | null }) {
  const router = useRouter();
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
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        Naivasha Rose Estate
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
            {initials}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold leading-tight text-ink">{user?.name}</p>
            <p className="text-xs capitalize text-ink-faint">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </header>
  );
}
