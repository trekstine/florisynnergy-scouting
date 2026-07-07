"use client";

import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { MappingMap } from "@/components/map";
import { Button, Card, CardHeader, ErrorBox, Field, TextInput } from "@/components/ui";
import { useCreateGreenhouse, useDeleteGreenhouse, useGreenhouses } from "@/lib/hooks";
import type { Coordinate } from "@/lib/types";

type Mode = "rectangle" | "polygon";

function box(a: Coordinate, b: Coordinate): Coordinate[] {
  const [minLng, maxLng] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [minLat, maxLat] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ];
}

function autoQr(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `GH_${slug || "UNNAMED"}_SEC_A_VERIFIED_SECURE`;
}

export default function MappingPage() {
  const greenhouses = useGreenhouses();
  const createGh = useCreateGreenhouse();
  const deleteGh = useDeleteGreenhouse();

  const [mode, setMode] = useState<Mode>("rectangle");
  const [vertices, setVertices] = useState<Coordinate[]>([]);
  const [cursor, setCursor] = useState<Coordinate | null>(null);
  const [name, setName] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rectComplete = mode === "rectangle" && vertices.length === 4;
  const canSave = rectComplete || (mode === "polygon" && vertices.length >= 3);

  const preview = useMemo<Coordinate[] | null>(() => {
    if (mode === "rectangle" && vertices.length === 1 && cursor) return box(vertices[0]!, cursor);
    return null;
  }, [mode, vertices, cursor]);

  function handleClick(lat: number, lng: number) {
    const pt: Coordinate = [lng, lat];
    if (mode === "rectangle") {
      if (vertices.length === 0 || vertices.length === 4) setVertices([pt]);
      else setVertices(box(vertices[0]!, pt));
    } else {
      setVertices((p) => [...p, pt]);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setVertices([]);
    setCursor(null);
    setError(null);
  }

  function reset() {
    setVertices([]);
    setCursor(null);
    setName("");
    setQr("");
    setError(null);
  }

  async function save() {
    setError(null);
    if (!canSave) return setError("Draw a greenhouse boundary first.");
    if (!name.trim()) return setError("Name is required.");
    try {
      await createGh.mutateAsync({
        name: name.trim(),
        qr_code_hash: (qr.trim() || autoQr(name)).trim(),
        boundary: vertices,
      });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  }

  const hint =
    mode === "rectangle"
      ? vertices.length === 0
        ? "Click the first corner."
        : rectComplete
          ? "Rectangle ready — name it & save, or click to redraw."
          : "Click the opposite corner."
      : `Click each corner · ${vertices.length} point${vertices.length === 1 ? "" : "s"}`;

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        {greenhouses.data && (
          <MappingMap
            greenhouses={greenhouses.data}
            draft={vertices}
            preview={preview}
            onMapClick={handleClick}
            onMouseMove={(lat, lng) => setCursor([lng, lat])}
          />
        )}
        <div className="absolute left-3 top-3 z-[1000] rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink shadow-card">
          {hint}
        </div>
      </div>

      <aside className="w-96 shrink-0 space-y-4 overflow-auto border-l border-line bg-surface p-4">
        <Card>
          <CardHeader title="Draw greenhouse" subtitle="Trace the boundary on the satellite map" />
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              {(["rectangle", "polygon"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    mode === m ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-soft"
                  }`}
                >
                  {m === "rectangle" ? "Rectangle" : "Freeform"}
                </button>
              ))}
            </div>
            <ErrorBox message={error} />
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Greenhouse 21" />
            </Field>
            <Field label="QR code hash (auto from name if blank)">
              <TextInput
                value={qr}
                onChange={(e) => setQr(e.target.value)}
                placeholder={name ? autoQr(name) : "GH_…_SEC_A_VERIFIED_SECURE"}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => (mode === "rectangle" ? setVertices([]) : setVertices((p) => p.slice(0, -1)))}
                disabled={!vertices.length}
              >
                {mode === "rectangle" ? "Reset shape" : "Undo point"}
              </Button>
              <Button variant="ghost" className="flex-1" onClick={reset}>
                Clear
              </Button>
            </div>
            <Button className="w-full" onClick={save} disabled={createGh.isPending || !canSave}>
              {createGh.isPending ? "Saving…" : "Save greenhouse"}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title={`Greenhouses (${greenhouses.data?.length ?? 0})`} />
          <ul className="divide-y divide-line">
            {(greenhouses.data ?? []).map((g) => (
              <li key={g.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium text-ink">{g.name}</span>
                  <span className="ml-2 text-xs text-ink-faint">{g.bed_count} beds</span>
                </div>
                <button
                  className="text-ink-faint hover:text-red-600"
                  disabled={deleteGh.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${g.name}? Removes its beds & records.`)) deleteGh.mutate(g.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
