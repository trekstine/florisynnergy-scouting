"use client";

import { useState } from "react";

import { Badge, Button, Card, ErrorBox, Field, PageHeader, Select, Spinner, TextInput } from "@/components/ui";
import {
  useChemicals,
  useCreateRef,
  useDiseases,
  usePests,
  useVarieties,
} from "@/lib/hooks";
import { money } from "@/lib/format";

type Tab = "varieties" | "pests" | "diseases" | "chemicals";

export default function ReferencePage() {
  const [tab, setTab] = useState<Tab>("varieties");
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Reference Data" subtitle="Varieties, pests, diseases & chemicals" />
      <div className="px-6">
        <div className="mb-4 flex gap-2">
          {(["varieties", "pests", "diseases", "chemicals"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg border px-3.5 py-2 text-sm font-semibold capitalize ${
                tab === t ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-soft"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "varieties" && <Varieties />}
        {tab === "pests" && <Pests />}
        {tab === "diseases" && <Diseases />}
        {tab === "chemicals" && <Chemicals />}
      </div>
    </div>
  );
}

function Varieties() {
  const q = useVarieties();
  const create = useCreateRef<unknown>("varieties");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await create.mutateAsync({ code: code.trim(), name: name.trim() });
      setCode(""); setName("");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    }
  }
  return (
    <Card>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <Field label="Code"><TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="RED" /></Field>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Red Naomi" /></Field>
        <Button type="submit" disabled={create.isPending}>Add variety</Button>
        <div className="w-full"><ErrorBox message={err} /></div>
      </form>
      {q.isLoading ? <div className="p-5"><Spinner /></div> : (
        <ul className="grid grid-cols-2 gap-px bg-line md:grid-cols-3">
          {(q.data ?? []).map((v) => (
            <li key={v.id} className="flex items-center gap-2 bg-white px-4 py-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: v.color ?? "#cbd5e1" }} />
              <span className="text-sm font-medium text-ink">{v.name}</span>
              <span className="ml-auto text-xs text-ink-faint">{v.code}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Pests() {
  const q = usePests();
  const create = useCreateRef<unknown>("pests");
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("3");
  const [err, setErr] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await create.mutateAsync({ name: name.trim(), threshold: Number(threshold) });
      setName("");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    }
  }
  return (
    <Card>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <Field label="Pest name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Thrips" /></Field>
        <Field label="ETL threshold">
          <Select value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-24">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Button type="submit" disabled={create.isPending}>Add pest</Button>
        <div className="w-full"><ErrorBox message={err} /></div>
      </form>
      <ul className="divide-y divide-line">
        {(q.data ?? []).map((p) => (
          <li key={p.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <span className="text-sm font-medium text-ink">{p.name}</span>
              {p.category && <span className="ml-2 text-xs text-ink-faint">{p.category}</span>}
            </div>
            <Badge color="#f59e0b">ETL {p.threshold}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Diseases() {
  const q = useDiseases();
  const create = useCreateRef<unknown>("diseases");
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("3");
  const [err, setErr] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await create.mutateAsync({ name: name.trim(), threshold: Number(threshold) });
      setName("");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    }
  }
  return (
    <Card>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <Field label="Disease name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Downy Mildew" /></Field>
        <Field label="ETL threshold">
          <Select value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-24">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Button type="submit" disabled={create.isPending}>Add disease</Button>
        <div className="w-full"><ErrorBox message={err} /></div>
      </form>
      <ul className="divide-y divide-line">
        {(q.data ?? []).map((d) => (
          <li key={d.id} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm font-medium text-ink">{d.name}</span>
            <Badge color="#f59e0b">ETL {d.threshold}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Chemicals() {
  const q = useChemicals();
  return (
    <Card>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-5 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">AI</th>
              <th className="px-3 py-2.5 font-semibold">Target</th>
              <th className="px-3 py-2.5 font-semibold">WHO</th>
              <th className="px-3 py-2.5 font-semibold">RAC</th>
              <th className="px-3 py-2.5 font-semibold">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(q.data ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-surface">
                <td className="px-5 py-2.5 font-medium">{c.name}</td>
                <td className="px-3 py-2.5">{c.active_ingredient1 ?? "—"}</td>
                <td className="px-3 py-2.5">{c.target1 ?? "—"}</td>
                <td className="px-3 py-2.5">{c.who_class ? <Badge>{c.who_class}</Badge> : "—"}</td>
                <td className="px-3 py-2.5">{c.rac_code ?? "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{money(c.buying_price)}</td>
              </tr>
            ))}
            {q.data?.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-ink-faint">No chemicals.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
