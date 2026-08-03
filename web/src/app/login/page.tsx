"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Logo, LogoMark } from "@/components/Logo";
import { ErrorBox } from "@/components/ui";

/* ────────────────────────────────────────────────────────────────────────
   Brand canvas: a stylised live view of the farm — greenhouse beds that
   breathe with pest pressure, swept by a geofence radar, with pollen
   drifting up the panel. The product's own visual language as artwork.

   Deterministic by design: no Math.random and no Date at render time, so
   server and client markup match and nothing hydrates twice.
   ──────────────────────────────────────────────────────────────────────── */

const COLS = 9;
const ROWS = 6;
const PRESSURE = ["#10b981", "#34d399", "#f59e0b", "#dc2626"] as const;

/** Deterministic pseudo-random in [0,1) — stable across server & client. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const BEDS = Array.from({ length: COLS * ROWS }, (_, i) => {
  const h = hash(i);
  // Mostly healthy with a few hot spots — reads as a real farm, not noise.
  const level = h > 0.93 ? 3 : h > 0.82 ? 2 : h > 0.5 ? 1 : 0;
  return {
    i,
    color: PRESSURE[level],
    delay: `${(hash(i + 99) * 5.5).toFixed(2)}s`,
    base: level === 0 ? 0.16 : level === 1 ? 0.3 : 0.55,
  };
});

const POLLEN = Array.from({ length: 12 }, (_, i) => ({
  i,
  left: `${(hash(i + 7) * 96).toFixed(1)}%`,
  size: 2 + Math.round(hash(i + 23) * 4),
  duration: `${(14 + hash(i + 41) * 12).toFixed(1)}s`,
  delay: `${(hash(i + 61) * 14).toFixed(1)}s`,
}));

function LiveFarmCanvas() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2">
        <div
          className="grid h-full w-full gap-[7px]"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            transform: "rotateX(52deg) rotateZ(-42deg)",
          }}
        >
          {BEDS.map((b) => (
            <span
              key={b.i}
              className="bed-tile rounded-[3px]"
              style={{
                backgroundColor: b.color,
                opacity: b.base,
                animationDelay: b.delay,
              }}
            />
          ))}
        </div>

        <svg
          className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2"
          viewBox="0 0 200 200"
          aria-hidden
        >
          {[92, 68, 44].map((r) => (
            <circle
              key={r}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="white"
              strokeOpacity="0.12"
              strokeWidth="0.7"
              strokeDasharray="2.5 3.5"
            />
          ))}
        </svg>
        <div className="radar-sweep absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full [background:conic-gradient(from_0deg,transparent_0deg,rgba(52,211,153,0.2)_18deg,transparent_46deg)]" />
      </div>

      {POLLEN.map((p) => (
        <span
          key={p.i}
          className="pollen absolute bottom-0 rounded-full bg-brand-200"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* vignette so text always wins over the artwork */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(2,28,18,0.75)_100%)]" />
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-[#021c12] p-10 lg:flex lg:w-[52%]">
      <LiveFarmCanvas />

      <div className="petal-in relative">
        <Logo tone="light" size={38} />
      </div>

      <p className="relative max-w-sm text-[2rem] font-bold leading-[1.15] tracking-tight text-white">
        Every bloom scouted.
        <br />
        <span className="text-brand-400">Every threat seen early.</span>
      </p>

      <p className="relative text-[11px] text-white/30">
        Naivasha Rose Estate
      </p>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/dashboard";

  const [deviceId, setDeviceId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Time-of-day greeting, set after mount so SSR and client markup agree.
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(
      h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
    );
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_identifier: deviceId, pin }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.detail ?? "Login failed");
        return;
      }
      router.replace(from);
      router.refresh();
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "peer w-full rounded-xl border border-line bg-surface px-4 pb-2.5 pt-6 text-sm font-medium text-ink outline-none transition-all placeholder:text-transparent focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100";
  const label =
    "pointer-events-none absolute left-4 top-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-2 peer-focus:text-[11px] peer-focus:uppercase peer-focus:tracking-wide peer-focus:text-brand-700";

  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="rise-in w-full max-w-sm">
          <div className="mb-9 lg:hidden">
            <Logo size={38} />
          </div>
          <div className="mb-9 hidden lg:block">
            <LogoMark size={42} />
          </div>

          <h1 className="text-[1.875rem] font-bold leading-tight tracking-tight text-ink">
            {greeting}
          </h1>
          <p className="mt-1.5 text-sm text-ink-faint">
            Sign in to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-3.5">
            {error && <ErrorBox message={error} />}

            <div className="relative">
              <input
                id="device"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="device"
                autoComplete="username"
                required
                className={field}
              />
              <label htmlFor="device" className={label}>
                Device identifier
              </label>
            </div>

            <div className="relative">
              <input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="pin"
                autoComplete="current-password"
                inputMode="numeric"
                required
                className={field}
              />
              <label htmlFor="pin" className={label}>
                PIN
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-xs text-ink-faint">
            Scouts capture observations in the mobile app.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
