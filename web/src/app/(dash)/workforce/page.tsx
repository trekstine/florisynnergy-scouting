"use client";

import { useState } from "react";

import { Badge, Button, Card, CardHeader, ErrorBox, Field, PageHeader, Select, Spinner, TextInput } from "@/components/ui";
import { useCreateEmployee, useEmployees, useUpdateEmployee } from "@/lib/hooks";
import type { Role } from "@/lib/types";

const ROLE_HEX: Record<Role, string> = {
  scout: "#10b981",
  supervisor: "#7c3aed",
  admin: "#0f172a",
};

export default function WorkforcePage() {
  const employees = useEmployees();
  const update = useUpdateEmployee();

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Workforce" subtitle="Scouts, supervisors & admins" />
      <div className="space-y-5 px-6">
        <AddEmployee />
        <Card>
          <CardHeader title={`Team (${employees.data?.length ?? 0})`} />
          {employees.isLoading ? <div className="p-5"><Spinner /></div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-semibold">Name</th>
                  <th className="px-3 py-2.5 font-semibold">Role</th>
                  <th className="px-3 py-2.5 font-semibold">Device</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(employees.data ?? []).map((e) => (
                  <tr key={e.id} className="hover:bg-surface">
                    <td className="px-5 py-2.5 font-medium">{e.name}</td>
                    <td className="px-3 py-2.5"><Badge color={ROLE_HEX[e.role]}>{e.role}</Badge></td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-faint">{e.device_identifier ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge color={e.is_active ? "#10b981" : "#94a3b8"}>{e.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="outline"
                        className="!px-2.5 !py-1 text-xs"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: e.id, body: { is_active: !e.is_active } })}
                      >
                        {e.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

function AddEmployee() {
  const create = useCreateEmployee();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("scout");
  const [device, setDevice] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Name is required.");
    try {
      await create.mutateAsync({
        name: name.trim(),
        role,
        device_identifier: device.trim() || undefined,
        pin: pin.trim() || undefined,
      });
      setName(""); setDevice(""); setPin("");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed to add.");
    }
  }

  return (
    <Card>
      <CardHeader title="Add team member" />
      <form onSubmit={add} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <div className="md:col-span-4"><ErrorBox message={err} /></div>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="scout">Scout</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Field label="Device ID"><TextInput value={device} onChange={(e) => setDevice(e.target.value)} placeholder="scout-device-05" /></Field>
        <Field label="PIN"><TextInput value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="4-digit" /></Field>
        <div className="md:col-span-4">
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add member"}</Button>
        </div>
      </form>
    </Card>
  );
}
