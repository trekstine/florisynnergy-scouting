"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Logo, LogoMark } from "@/components/Logo";
import { ErrorBox } from "@/components/ui";

/* ─────────────────────────────────────────────────────────────────────────
   Split card floating on an organic background, with a flat-vector rose-farm
   scene on the green panel: polytunnel greenhouses on rolling hills, drifting
   clouds, and rows of roses in the farm's own variety colours.

   Hand-built SVG — no external assets, and every position is hardcoded, so
   server and client markup always match.
   ───────────────────────────────────────────────────────────────────────── */

/** Rose row colours mirror the seeded varieties (Red Naomi, Avalanche White,
 *  Pink Floyd, Gold Strike, Orange Crush). */
const ROSE_COLORS = ["#f87171", "#fecdd3", "#fb7185", "#fbbf24", "#fb923c"];

/** Three rows of roses; nearer rows sit lower and render larger. */
const ROSE_ROWS = [
  { y: 224, r: 3.4, count: 11, startX: 32, gap: 34 },
  { y: 243, r: 4, count: 10, startX: 16, gap: 41 },
  { y: 263, r: 4.6, count: 9, startX: 34, gap: 45 },
];

/** Polytunnel greenhouse — an arch with ribs and a doorway. */
function Tunnel({
  x,
  y,
  w,
  h,
  delay,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  delay: string;
}) {
  const ribs = [0.28, 0.5, 0.72];
  return (
    <g className="tunnel-in" style={{ animationDelay: delay }}>
      {/* arch body */}
      <path
        d={`M${x} ${y} L${x} ${y - h * 0.45} Q${x} ${y - h} ${x + w / 2} ${y - h} Q${x + w} ${y - h} ${x + w} ${y - h * 0.45} L${x + w} ${y} Z`}
        fill="white"
        fillOpacity="0.16"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* structural ribs */}
      {ribs.map((t) => {
        const rx = x + w * t;
        const arch = Math.sin(Math.PI * t);
        return (
          <line
            key={t}
            x1={rx}
            y1={y}
            x2={rx}
            y2={y - h * (0.45 + 0.55 * arch)}
            stroke="white"
            strokeOpacity="0.3"
            strokeWidth="1.1"
          />
        );
      })}
      {/* doorway */}
      <rect
        x={x + w / 2 - w * 0.11}
        y={y - h * 0.34}
        width={w * 0.22}
        height={h * 0.34}
        rx="2"
        fill="#04301f"
        fillOpacity="0.5"
      />
    </g>
  );
}

/** Flat-vector rose farm: hills, polytunnels, rose rows, drifting clouds. */
function FarmScene() {
  return (
    <svg
      viewBox="0 0 420 290"
      className="mx-auto h-auto w-full max-w-md"
      role="img"
      aria-label="Illustration of polytunnel greenhouses on a rose farm"
    >
      {/* sun */}
      <circle cx="348" cy="52" r="26" fill="#f0c060" fillOpacity="0.28" />
      <circle cx="348" cy="52" r="16" fill="#f0c060" fillOpacity="0.85" />

      {/* drifting clouds — clipped to the frame so they wrap cleanly */}
      <g clipPath="url(#scene-clip)">
        <g className="cloud-drift" style={{ animationDuration: "44s" }}>
          <g fill="white" fillOpacity="0.9">
            <ellipse cx="40" cy="58" rx="20" ry="11" />
            <ellipse cx="58" cy="54" rx="15" ry="14" />
            <ellipse cx="74" cy="59" rx="16" ry="10" />
          </g>
        </g>
        <g
          className="cloud-drift"
          style={{ animationDuration: "62s", animationDelay: "-28s" }}
        >
          <g fill="white" fillOpacity="0.55">
            <ellipse cx="30" cy="96" rx="15" ry="8" />
            <ellipse cx="44" cy="93" rx="12" ry="11" />
            <ellipse cx="57" cy="97" rx="12" ry="7" />
          </g>
        </g>
      </g>

      {/* rolling hills */}
      <path
        d="M0 178 Q90 146 190 172 Q290 198 420 162 L420 290 L0 290 Z"
        fill="#0a4a30"
      />
      <path
        d="M0 200 Q110 172 220 196 Q320 218 420 190 L420 290 L0 290 Z"
        fill="#0d5c3c"
      />

      {/* polytunnels standing on the mid hill */}
      <Tunnel x={38} y={200} w={92} h={54} delay="120ms" />
      <Tunnel x={148} y={206} w={104} h={62} delay="220ms" />
      <Tunnel x={272} y={198} w={88} h={50} delay="320ms" />

      {/* foreground field */}
      <path
        d="M0 214 Q120 196 240 214 Q340 229 420 208 L420 290 L0 290 Z"
        fill="#10714a"
      />

      {/* rose rows — bushes with blooms */}
      {ROSE_ROWS.map((row, ri) =>
        Array.from({ length: row.count }, (_, i) => {
          const cx = row.startX + i * row.gap;
          const color = ROSE_COLORS[(i + ri) % ROSE_COLORS.length]!;
          return (
            <g key={`${ri}-${i}`}>
              {/* bush */}
              <ellipse
                cx={cx}
                cy={row.y + row.r * 1.1}
                rx={row.r * 2.1}
                ry={row.r * 1.25}
                fill="#16855a"
              />
              {/* bloom */}
              <circle
                className="bloom-pop"
                cx={cx}
                cy={row.y}
                r={row.r}
                fill={color}
                style={{ animationDelay: `${420 + ri * 130 + i * 45}ms` }}
              />
            </g>
          );
        }),
      )}

      <defs>
        <clipPath id="scene-clip">
          <rect x="0" y="0" width="420" height="180" />
        </clipPath>
      </defs>
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/dashboard";

  const [deviceId, setDeviceId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Time-of-day greeting, set after mount so SSR and client markup agree.
  const [greeting, setGreeting] = useState("Welcome");
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

  const inputCls =
    "w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-ink-faint/70 focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-800">
      {/* ── Organic background shapes ── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-32 -top-40 h-[26rem] w-[26rem] rounded-full bg-[#d8a657] opacity-90" />
        <div className="absolute -bottom-48 -right-32 h-[34rem] w-[34rem] rounded-full bg-[#d8a657] opacity-90" />
        <div className="absolute -bottom-24 left-1/4 h-[22rem] w-[30rem] rounded-full bg-brand-900/60" />
      </div>

      {/* ── Floating card ── */}
      <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-8">
        <div className="rise-in grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-2">
          {/* Form side */}
          <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
            <Logo size={38} />

            <div className="mt-10">
              <p className="text-sm font-medium text-ink-faint">{greeting}</p>
              <h1 className="mt-1 text-4xl font-bold tracking-tight text-ink">
                Log In
              </h1>
            </div>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              {error && <ErrorBox message={error} />}

              <div>
                <label
                  htmlFor="device"
                  className="mb-1.5 block text-sm font-medium text-ink-soft"
                >
                  Device identifier
                </label>
                <input
                  id="device"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="Your device ID"
                  autoComplete="username"
                  required
                  className={inputCls}
                />
              </div>

              <div>
                <label
                  htmlFor="pin"
                  className="mb-1.5 block text-sm font-medium text-ink-soft"
                >
                  PIN
                </label>
                <div className="relative">
                  <input
                    id="pin"
                    type={showPin ? "text" : "password"}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Your PIN"
                    autoComplete="current-password"
                    inputMode="numeric"
                    required
                    className={`${inputCls} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink-soft"
                  >
                    {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <p className="mt-2 text-right text-sm text-ink-faint">
                  Forgotten your PIN? Ask your administrator.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Signing in…
                  </>
                ) : (
                  "Log In"
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-ink-faint">
              Field scouts capture observations in the{" "}
              <span className="font-semibold text-ink-soft">mobile app</span>.
            </p>
          </div>

          {/* Brand side */}
          <div className="relative hidden bg-brand-800 p-3 lg:block">
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-white/25 bg-gradient-to-br from-brand-800 via-brand-900 to-[#022c1c] px-9 py-10">
              {/* soft blobs inside the panel */}
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/[0.04]" />
                <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/[0.04]" />
              </div>

              <div className="relative flex justify-end">
                <div className="text-right">
                  <p className="text-xl font-bold leading-tight text-white">
                    Flori<span className="text-brand-400">Synergy</span>
                  </p>
                  <p className="text-xs font-medium text-white/50">( Scouting )</p>
                </div>
              </div>

              <div className="relative">
                <FarmScene />
              </div>

              <div className="relative text-center">
                <h2 className="text-3xl font-bold leading-tight text-white">
                  Every bloom scouted
                </h2>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55">
                  Geofenced field scouting and threshold-driven action from the
                  greenhouse bed to your dashboard, in{" "}
                  <span className="font-semibold text-brand-400">real time</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-only mark so the brand still reads on small screens */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 lg:hidden">
        <LogoMark size={26} />
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
