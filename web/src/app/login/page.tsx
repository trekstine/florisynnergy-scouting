"use client";

import { Leaf } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button, ErrorBox, Field, TextInput } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/dashboard";

  const [deviceId, setDeviceId] = useState("web-admin");
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600">
            <Leaf className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">FloriSynergy Scouting</h1>
            <p className="text-sm text-ink-faint">Admin portal</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBox message={error} />
          <Field label="Device identifier">
            <TextInput value={deviceId} onChange={(e) => setDeviceId(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="PIN">
            <TextInput
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="current-password"
              inputMode="numeric"
              required
            />
          </Field>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-xs text-ink-faint">Scouts use the mobile app.</p>
        </form>
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
