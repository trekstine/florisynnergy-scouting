"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, V1 } from "./client-api";
import type {
  AnalyticsSummary,
  Bed,
  BedPressure,
  BreakdownRow,
  Chemical,
  ComplianceResult,
  Disease,
  Employee,
  EtlAudit,
  EtlRule,
  Filters,
  Greenhouse,
  GreenhousePressure,
  Pest,
  PestMatrixCell,
  Recommendation,
  RecommendationOutcome,
  ScoutingRecord,
  ScoutSummary,
  SeverityBucket,
  SprayCostRow,
  SprayRecord,
  TrendPoint,
  Variety,
} from "./types";

export function filterQS(f: Filters = {}): string {
  const qs = new URLSearchParams();
  if (f.start) qs.set("start", f.start);
  if (f.end) qs.set("end", f.end);
  if (f.greenhouse_id) qs.set("greenhouse_id", String(f.greenhouse_id));
  if (f.pest_id) qs.set("pest_id", String(f.pest_id));
  if (f.disease_id) qs.set("disease_id", String(f.disease_id));
  if (f.variety_code) qs.set("variety_code", f.variety_code);
  if (f.scouting_for) qs.set("scouting_for", f.scouting_for);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const fkey = (f: Filters = {}) =>
  [
    f.start,
    f.end,
    f.greenhouse_id,
    f.pest_id,
    f.disease_id,
    f.variety_code,
    f.scouting_for,
  ].join("|");

// ── Geofencing ──
export const useGreenhouses = () =>
  useQuery({ queryKey: ["greenhouses"], queryFn: () => api.get<Greenhouse[]>(`${V1}/greenhouses`) });

export const useBeds = (greenhouseId: number | null) =>
  useQuery({
    queryKey: ["beds", greenhouseId],
    queryFn: () => api.get<Bed[]>(`${V1}/greenhouses/${greenhouseId}/beds`),
    enabled: greenhouseId != null,
  });

export function useCreateGreenhouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; qr_code_hash: string; boundary: number[][]; code?: string }) =>
      api.post<Greenhouse>(`${V1}/greenhouses`, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["greenhouses"] });
      qc.invalidateQueries({ queryKey: ["pressure"] });
    },
  });
}

export function useDeleteGreenhouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`${V1}/greenhouses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["greenhouses"] });
      qc.invalidateQueries({ queryKey: ["pressure"] });
    },
  });
}

export function useCreateBed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ greenhouseId, code }: { greenhouseId: number; code: string }) =>
      api.post<Bed>(`${V1}/greenhouses/${greenhouseId}/beds`, { code }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["beds", v.greenhouseId] }),
  });
}

// ── Reference ──
export const useVarieties = () =>
  useQuery({ queryKey: ["varieties"], queryFn: () => api.get<Variety[]>(`${V1}/varieties`) });
export const usePests = () =>
  useQuery({ queryKey: ["pests"], queryFn: () => api.get<Pest[]>(`${V1}/pests`) });
export const useDiseases = () =>
  useQuery({ queryKey: ["diseases"], queryFn: () => api.get<Disease[]>(`${V1}/diseases`) });
export const useChemicals = () =>
  useQuery({ queryKey: ["chemicals"], queryFn: () => api.get<Chemical[]>(`${V1}/chemicals`) });

export function useCreateRef<T>(kind: "varieties" | "pests" | "diseases") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<T>(`${V1}/${kind}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [kind] }),
  });
}

export function useUpdateRef<T>(kind: "pests" | "diseases") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch<T>(`${V1}/${kind}/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [kind] });
      qc.invalidateQueries({ queryKey: ["etl-rules"] });
      qc.invalidateQueries({ queryKey: ["etl-audit"] });
    },
  });
}

// ── ETL override rules + governance history ──
export const useEtlRules = () =>
  useQuery({ queryKey: ["etl-rules"], queryFn: () => api.get<EtlRule[]>(`${V1}/etl-rules`) });

export const useEtlAudit = () =>
  useQuery({ queryKey: ["etl-audit"], queryFn: () => api.get<EtlAudit[]>(`${V1}/etl-rules/audit`) });

export function useCreateEtlRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<EtlRule>(`${V1}/etl-rules`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etl-rules"] });
      qc.invalidateQueries({ queryKey: ["etl-audit"] });
    },
  });
}

export function useDeleteEtlRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`${V1}/etl-rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etl-rules"] });
      qc.invalidateQueries({ queryKey: ["etl-audit"] });
    },
  });
}

// ── Workforce ──
export const useEmployees = () =>
  useQuery({ queryKey: ["employees"], queryFn: () => api.get<Employee[]>(`${V1}/employees`) });

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post<Employee>(`${V1}/employees`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch<Employee>(`${V1}/employees/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

// ── Records ──
export const useScouting = (params?: {
  greenhouse_id?: number;
  scouting_for?: string;
  scout_id?: number;
  start?: string;
  end?: string;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.greenhouse_id) qs.set("greenhouse_id", String(params.greenhouse_id));
  if (params?.scouting_for) qs.set("scouting_for", params.scouting_for);
  if (params?.scout_id) qs.set("scout_id", String(params.scout_id));
  if (params?.start) qs.set("start", params.start);
  if (params?.end) qs.set("end", params.end);
  if (params?.limit) qs.set("limit", String(params.limit));
  const s = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: ["scouting", s],
    queryFn: () => api.get<ScoutingRecord[]>(`${V1}/scouting${s}`),
  });
};

export const useSpray = () =>
  useQuery({ queryKey: ["spray"], queryFn: () => api.get<SprayRecord[]>(`${V1}/spray`) });

// ── Analytics (filter-aware) ──
export const useSummary = (f: Filters) =>
  useQuery({
    queryKey: ["summary", fkey(f)],
    queryFn: () => api.get<AnalyticsSummary>(`${V1}/analytics/summary${filterQS(f)}`),
  });

export const useTrend = (f: Filters) =>
  useQuery({
    queryKey: ["trend", fkey(f)],
    queryFn: () => api.get<TrendPoint[]>(`${V1}/analytics/trend${filterQS(f)}`),
  });

export const useBreakdown = (dim: string, f: Filters) =>
  useQuery({
    queryKey: ["breakdown", dim, fkey(f)],
    queryFn: () => api.get<BreakdownRow[]>(`${V1}/analytics/breakdown?dim=${dim}&${filterQS(f).slice(1)}`),
  });

export const useSeverityDist = (f: Filters) =>
  useQuery({
    queryKey: ["severity-dist", fkey(f)],
    queryFn: () => api.get<SeverityBucket[]>(`${V1}/analytics/severity-distribution${filterQS(f)}`),
  });

export const usePressure = (f: Filters = {}) =>
  useQuery({
    queryKey: ["pressure", fkey(f)],
    queryFn: () => api.get<GreenhousePressure[]>(`${V1}/analytics/pressure${filterQS(f)}`),
    refetchInterval: 30_000,
  });

export const usePoints = (f: Filters = {}) =>
  useQuery({
    queryKey: ["points", fkey(f)],
    queryFn: () => api.get<{ lat: number; lng: number; severity: number }[]>(`${V1}/analytics/points${filterQS(f)}`),
  });

export const useBedPressure = (greenhouseId: number | null, f: Filters = {}) =>
  useQuery({
    queryKey: ["bed-pressure", greenhouseId, fkey(f)],
    queryFn: () =>
      api.get<BedPressure[]>(
        `${V1}/analytics/bed-pressure?greenhouse_id=${greenhouseId}&${filterQS(f).slice(1)}`,
      ),
    enabled: greenhouseId != null,
  });

export const usePestMatrix = (f: Filters = {}) =>
  useQuery({ queryKey: ["pest-matrix", fkey(f)], queryFn: () => api.get<PestMatrixCell[]>(`${V1}/analytics/pest-matrix${filterQS(f)}`) });
export const useScoutSummary = (f: Filters = {}) =>
  useQuery({ queryKey: ["scouts", fkey(f)], queryFn: () => api.get<ScoutSummary[]>(`${V1}/analytics/scouts${filterQS(f)}`) });
export const useSprayCost = () =>
  useQuery({ queryKey: ["spray-cost"], queryFn: () => api.get<SprayCostRow[]>(`${V1}/analytics/spray-cost`) });

// ── Recommendations ──
export const useRecommendations = (status?: string) => {
  const s = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["recommendations", s],
    queryFn: () => api.get<Recommendation[]>(`${V1}/recommendations${s}`),
  });
};

export function useUpdateRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch<Recommendation>(`${V1}/recommendations/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });
}

export function useCreateRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      greenhouse_id: number;
      bed_code?: string | null;
      pest_id?: number | null;
      disease_id?: number | null;
      trigger_severity?: number;
      note?: string | null;
    }) => api.post<Recommendation>(`${V1}/recommendations`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });
}

export const useRecOutcomes = () =>
  useQuery({
    queryKey: ["rec-outcomes"],
    queryFn: () => api.get<RecommendationOutcome[]>(`${V1}/recommendations/outcomes`),
  });

export const useCompliance = (recId: number, chemicalId: number | null | undefined) =>
  useQuery({
    queryKey: ["compliance", recId, chemicalId],
    queryFn: () =>
      api.get<ComplianceResult>(
        `${V1}/recommendations/${recId}/compliance${chemicalId ? `?chemical_id=${chemicalId}` : ""}`,
      ),
    enabled: chemicalId != null,
  });

export function useVerifyRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Recommendation>(`${V1}/recommendations/${id}/verify`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: ["rec-outcomes"] });
    },
  });
}

export function useReopenRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.post<Recommendation>(`${V1}/recommendations/${id}/reopen`, reason ? { reason } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: ["rec-outcomes"] });
    },
  });
}

export function useSprayFromRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body?: Record<string, unknown> }) =>
      api.post<SprayRecord>(`${V1}/recommendations/${id}/spray`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: ["rec-outcomes"] });
      qc.invalidateQueries({ queryKey: ["spray"] });
      qc.invalidateQueries({ queryKey: ["spray-cost"] });
      qc.invalidateQueries({ queryKey: ["compliance"] });
    },
  });
}
