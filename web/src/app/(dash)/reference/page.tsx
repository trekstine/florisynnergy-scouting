"use client";

import { History, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Button, Card, ErrorBox, Field, PageHeader, Select, Spinner, TextInput } from "@/components/ui";
import { money, relativeTime } from "@/lib/format";
import {
  useChemicals,
  useCreateEtlRule,
  useCreateRef,
  useDeleteEtlRule,
  useDiseases,
  useEmployees,
  useEtlAudit,
  useEtlRules,
  useGreenhouses,
  usePests,
  useUpdateRef,
  useVarieties,
} from "@/lib/hooks";
import type { Disease, EtlRule, Pest, Variety } from "@/lib/types";

type Tab = "varieties" | "pests" | "diseases" | "chemicals" | "etl" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "varieties", label: "Varieties" },
  { key: "pests", label: "Pests" },
  { key: "diseases", label: "Diseases" },
  { key: "chemicals", label: "Chemicals" },
  { key: "etl", label: "ETL rules" },
  { key: "history", label: "History" },
];

export default function ReferencePage() {
  const [tab, setTab] = useState<Tab>("pests");
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Reference Data" subtitle="Varieties, pests, diseases, chemicals & ETL rules" />
      <div className="px-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg border px-3.5 py-2 text-sm font-semibold ${
                tab === t.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-soft"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "varieties" && <Varieties />}
        {tab === "pests" && <Pests />}
        {tab === "diseases" && <Diseases />}
        {tab === "chemicals" && <Chemicals />}
        {tab === "etl" && <EtlRules />}
        {tab === "history" && <EtlHistory />}
      </div>
    </div>
  );
}

const THRESHOLDS = [1, 2, 3, 4, 5];

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
  const update = useUpdateRef<Pest>("pests");
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
            {THRESHOLDS.map((n) => <option key={n} value={n}>{n}</option>)}
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
            <label className="flex items-center gap-2 text-xs text-ink-faint">
              base ETL
              <Select
                className="w-16"
                value={p.threshold}
                onChange={(e) => update.mutate({ id: p.id, body: { threshold: Number(e.target.value) } })}
              >
                {THRESHOLDS.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Diseases() {
  const q = useDiseases();
  const create = useCreateRef<unknown>("diseases");
  const update = useUpdateRef<Disease>("diseases");
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
            {THRESHOLDS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Button type="submit" disabled={create.isPending}>Add disease</Button>
        <div className="w-full"><ErrorBox message={err} /></div>
      </form>
      <ul className="divide-y divide-line">
        {(q.data ?? []).map((d) => (
          <li key={d.id} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm font-medium text-ink">{d.name}</span>
            <label className="flex items-center gap-2 text-xs text-ink-faint">
              base ETL
              <Select
                className="w-16"
                value={d.threshold}
                onChange={(e) => update.mutate({ id: d.id, body: { threshold: Number(e.target.value) } })}
              >
                {THRESHOLDS.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EtlRules() {
  const rules = useEtlRules();
  const pests = usePests();
  const diseases = useDiseases();
  const varieties = useVarieties();
  const greenhouses = useGreenhouses();
  const employees = useEmployees();
  const create = useCreateEtlRule();
  const remove = useDeleteEtlRule();

  const [agentKind, setAgentKind] = useState<"pest" | "disease">("pest");
  const [agentId, setAgentId] = useState("");
  const [varietyId, setVarietyId] = useState("");
  const [greenhouseId, setGreenhouseId] = useState("");
  const [market, setMarket] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const pestName = useMemo(() => new Map<number, string>((pests.data ?? []).map((p) => [p.id, p.name])), [pests.data]);
  const diseaseName = useMemo(() => new Map<number, string>((diseases.data ?? []).map((d) => [d.id, d.name])), [diseases.data]);
  const varietyName = useMemo(() => new Map<number, string>((varieties.data ?? []).map((v: Variety) => [v.id, v.name])), [varieties.data]);
  const ghName = useMemo(() => new Map<number, string>((greenhouses.data ?? []).map((g) => [g.id, g.name])), [greenhouses.data]);
  const empName = useMemo(() => new Map<number, string>((employees.data ?? []).map((e) => [e.id, e.name])), [employees.data]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!agentId) { setErr("Pick a pest or disease"); return; }
    try {
      await create.mutateAsync({
        pest_id: agentKind === "pest" ? Number(agentId) : null,
        disease_id: agentKind === "disease" ? Number(agentId) : null,
        variety_id: varietyId ? Number(varietyId) : null,
        greenhouse_id: greenhouseId ? Number(greenhouseId) : null,
        threshold: Number(threshold),
        market: market.trim() || null,
        reason: reason.trim() || null,
      });
      setAgentId(""); setVarietyId(""); setGreenhouseId(""); setMarket(""); setReason("");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    }
  }

  function scopeChips(r: EtlRule) {
    const chips: string[] = [];
    if (r.variety_id) chips.push(`variety: ${varietyName.get(r.variety_id) ?? r.variety_id}`);
    if (r.greenhouse_id) chips.push(`block: ${ghName.get(r.greenhouse_id) ?? r.greenhouse_id}`);
    if (r.market) chips.push(`market: ${r.market}`);
    if (chips.length === 0) chips.push("farm-wide");
    return chips;
  }

  return (
    <Card>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <Field label="Agent">
          <Select value={agentKind} onChange={(e) => { setAgentKind(e.target.value as "pest" | "disease"); setAgentId(""); }} className="w-28">
            <option value="pest">Pest</option>
            <option value="disease">Disease</option>
          </Select>
        </Field>
        <Field label={agentKind === "pest" ? "Pest" : "Disease"}>
          <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-44">
            <option value="">Select…</option>
            {(agentKind === "pest" ? pests.data ?? [] : diseases.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Variety (optional)">
          <Select value={varietyId} onChange={(e) => setVarietyId(e.target.value)} className="w-40">
            <option value="">Any</option>
            {(varieties.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
        <Field label="Block (optional)">
          <Select value={greenhouseId} onChange={(e) => setGreenhouseId(e.target.value)} className="w-40">
            <option value="">Any</option>
            {(greenhouses.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Market"><TextInput value={market} onChange={(e) => setMarket(e.target.value)} placeholder="EU" className="w-28" /></Field>
        <Field label="Threshold">
          <Select value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-16">
            {THRESHOLDS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Reason"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Zero-tolerance export block" className="w-56" /></Field>
        <Button type="submit" disabled={create.isPending}>Add rule</Button>
        <div className="w-full"><ErrorBox message={err} /></div>
      </form>

      <p className="border-b border-line px-5 py-2 text-xs text-ink-faint">
        Overrides win over the base ETL by specificity: variety + block beats variety, beats block, beats base. On a tie the stricter (lower) threshold applies.
      </p>

      {rules.isLoading ? (
        <div className="p-5"><Spinner /></div>
      ) : (rules.data ?? []).length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-faint">No override rules — every agent uses its base ETL.</p>
      ) : (
        <ul className="divide-y divide-line">
          {(rules.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <Badge color="#f59e0b">ETL {r.threshold}</Badge>
              <div className="min-w-0">
                <span className="text-sm font-medium text-ink">
                  {r.pest_id ? pestName.get(r.pest_id) ?? `Pest #${r.pest_id}` : r.disease_id ? diseaseName.get(r.disease_id) ?? `Disease #${r.disease_id}` : "—"}
                </span>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {scopeChips(r).map((c) => (
                    <span key={c} className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-soft">{c}</span>
                  ))}
                </div>
                {r.reason && <p className="mt-0.5 text-xs text-ink-faint">{r.reason}</p>}
                <p className="mt-0.5 text-xs text-ink-faint">
                  {r.created_by ? `by ${empName.get(r.created_by) ?? `#${r.created_by}`} · ` : ""}
                  {relativeTime(r.created_at)}
                </p>
              </div>
              <button
                onClick={() => remove.mutate(r.id)}
                disabled={remove.isPending}
                className="ml-auto rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-red-600"
                aria-label="Delete rule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const AUDIT_ACTION: Record<string, { label: string; hex: string }> = {
  threshold_change: { label: "Threshold changed", hex: "#f59e0b" },
  rule_created: { label: "Rule created", hex: "#059669" },
  rule_deleted: { label: "Rule removed", hex: "#dc2626" },
};

function EtlHistory() {
  const audit = useEtlAudit();
  const employees = useEmployees();
  const empName = useMemo(
    () => new Map<number, string>((employees.data ?? []).map((e) => [e.id, e.name])),
    [employees.data],
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <History className="h-4 w-4 text-ink-faint" />
        <span className="text-sm font-semibold text-ink">ETL change history</span>
        <span className="ml-auto text-xs text-ink-faint">who changed what, and why</span>
      </div>
      {audit.isLoading ? (
        <div className="p-5"><Spinner /></div>
      ) : (audit.data ?? []).length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-faint">
          No threshold changes recorded yet. Edit a base ETL or add an override rule to start the trail.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {(audit.data ?? []).map((a) => {
            const meta = AUDIT_ACTION[a.action] ?? { label: a.action, hex: "#94a3b8" };
            return (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <Badge color={meta.hex}>{meta.label}</Badge>
                <div className="min-w-0">
                  <p className="text-sm text-ink">{a.summary ?? `${a.entity} #${a.entity_id}`}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {a.employee_id ? (empName.get(a.employee_id) ?? `#${a.employee_id}`) : "system"} ·{" "}
                    {relativeTime(a.created_at)}
                    {a.reason ? ` · ${a.reason}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
