"use client";

import { MapPin, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Logo, LogoMark } from "@/components/Logo";
import { Button, ErrorBox, Field, TextInput } from "@/components/ui";

/** Decorative brand panel — pure SVG/CSS, no image assets to ship. */
function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-[#022c1c] p-10 lg:flex lg:w-[46%]">
      {/* oversized watermark bloom */}
      <svg
        className="pointer-events-none absolute -bottom-40 -right-40 h-[560px] w-[560px] opacity-[0.07]"
        viewBox="0 0 48 48"
        fill="none"
      >
        {[0, 72, 144, 216, 288].map((deg) => (
          <path
            key={deg}
            d="M24 4 C32 12 32.4 20 24 24 C15.6 20 16 12 24 4 Z"
            fill="white"
            transform={`rotate(${deg} 24 24)`}
          />
        ))}
        <circle cx="24" cy="24" r="4" fill="white" />
      </svg>
      {/* dotted geofence rings */}
      <svg
        className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 opacity-10"
        viewBox="0 0 100 100"
        fill="none"
      >
        {[48, 36, 24].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            stroke="white"
            strokeWidth="0.7"
            strokeDasharray="2.4 3"
          />
        ))}
      </svg>

      <Logo tone="light" size={40} />

      <div className="relative">
        <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
          Every bloom scouted.
          <br />
          Every threat <span className="text-brand-400">seen early.</span>
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
          Geofenced field scouting, threshold-driven recommendations, and spray
          compliance — from the greenhouse bed to this dashboard, in real time.
        </p>

        <div className="mt-8 space-y-3">
          {[
            {
              icon: MapPin,
              text: "GPS-verified capture inside greenhouse boundaries",
            },
            {
              icon: ShieldCheck,
              text: "Economic thresholds raise interventions automatically",
            },
            {
              icon: Smartphone,
              text: "Offline-first mobile app for scouts in the field",
            },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Icon size={15} className="text-brand-400" />
              </span>
              <p className="text-sm font-medium text-white/80">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="relative text-xs text-white/35">
        © {new Date().getFullYear()} FloriSynergy · Naivasha Rose Estate
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

  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />

      {/* form side */}
      <div className="flex flex-1 items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm">
          {/* logo shows here on small screens where the panel is hidden */}
          <div className="mb-8 lg:hidden">
            <Logo size={40} />
          </div>

          <div className="mb-8 hidden lg:block">
            <LogoMark size={44} />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-ink-faint">
            Sign in to the admin portal to manage your farm.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <ErrorBox message={error} />
            <Field label="Device identifier">
              <TextInput
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="e.g. web-admin"
                autoComplete="username"
                required
              />
            </Field>
            <Field label="PIN">
              <TextInput
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                autoComplete="current-password"
                inputMode="numeric"
                required
              />
            </Field>
            <Button type="submit" disabled={loading} className="w-full !py-2.5">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-8 flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-3">
            <Smartphone size={16} className="shrink-0 text-brand-600" />
            <p className="text-xs text-ink-faint">
              Field scouts don&apos;t sign in here — they use the FloriSynergy
              mobile app.
            </p>
          </div>
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
