// Mirrors the FastAPI backend schemas (app/schemas.py).

export type Role = "scout" | "supervisor" | "admin";
export type ScoutingFor = "disease" | "pest" | "lure" | "sticky_trap";
export type VerificationMethod = "gps" | "qr_code" | "pin_bypass" | "manual";
export type RecStatus = "open" | "planned" | "actioned" | "resolved";
export type Pressure = "none" | "low" | "medium" | "high";

/** [lng, lat] vertex (GeoJSON axis order). */
export type Coordinate = [number, number];

export interface SessionUser {
  employee_id: number;
  name: string;
  role: Role;
}

export interface Farm {
  id: number;
  name: string;
  code: string | null;
}

export interface Greenhouse {
  id: number;
  farm_id: number | null;
  name: string;
  code: string | null;
  qr_code_hash: string;
  boundary: Coordinate[];
  bed_count: number;
  created_at?: string | null;
}

export interface Bed {
  id: number;
  greenhouse_id: number;
  code: string;
  boundary: Coordinate[] | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
}

export interface Employee {
  id: number;
  name: string;
  role: Role;
  device_identifier: string | null;
  is_active: boolean;
}

export interface Variety {
  id: number;
  code: string;
  name: string;
  crop: string;
  color: string | null;
  is_active: boolean;
}

export interface Pest {
  id: number;
  name: string;
  category: string | null;
  threshold: number;
  is_active: boolean;
}

export interface Disease {
  id: number;
  name: string;
  threshold: number;
  is_active: boolean;
}

export interface Chemical {
  id: number;
  name: string;
  product: string | null;
  who_class: string | null;
  rac_code: string | null;
  active_ingredient1: string | null;
  target1: string | null;
  rei: string | null;
  buying_price: number | null;
}

export interface ScoutingRecord {
  id: number;
  batch_id: string | null;
  greenhouse_id: number | null;
  bed_code: string | null;
  scout_id: number | null;
  scouting_for: ScoutingFor;
  variety_code: string | null;
  pest_id: number | null;
  disease_id: number | null;
  stage: string | null;
  location_on_plant: string | null;
  severity: number;
  fcm_count: number;
  sticky_trap_bug_count: number;
  lure_bug_count: number;
  beneficials_count: number;
  notes: string | null;
  session_comment: string | null;
  image_url: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  verification_method: VerificationMethod;
  flagged: boolean;
  flag_reason: string | null;
  recorded_at: string;
}

export interface SprayRecord {
  id: number;
  program_id: string | null;
  recommendation_id: number | null;
  greenhouse_id: number | null;
  bed_code: string | null;
  variety_code: string | null;
  product: string | null;
  rate: string | null;
  coverage: string | null;
  who_class: string | null;
  qty: number | null;
  cost_of_chemical: number | null;
  phi_days: number | null;
  safe_harvest_date: string | null;
  start_date: string | null;
  recorded_at: string;
}

export type OutcomeVerdict =
  | "no_data"
  | "resolved_ready"
  | "recovering"
  | "not_responding";

export interface RecommendationOutcome {
  recommendation_id: number;
  baseline_severity: number | null;
  latest_severity: number | null;
  latest_observed_at: string | null;
  observations_since: number;
  effective_threshold: number;
  delta: number | null;
  verdict: OutcomeVerdict;
}

export interface EtlRule {
  id: number;
  pest_id: number | null;
  disease_id: number | null;
  variety_id: number | null;
  greenhouse_id: number | null;
  threshold: number;
  market: string | null;
  reason: string | null;
  created_by: number | null;
  created_at: string;
}

export type ComplianceLevel = "block" | "warn" | "info";

export interface ComplianceIssue {
  level: ComplianceLevel;
  code: string;
  message: string;
}

export interface ComplianceResult {
  issues: ComplianceIssue[];
  blocked: boolean;
}

export interface EtlAudit {
  id: number;
  employee_id: number | null;
  entity: "pest" | "disease" | "rule";
  entity_id: number | null;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  summary: string | null;
  created_at: string;
}

export interface GreenhousePressure {
  greenhouse_id: number;
  name: string;
  centroid: [number, number];
  boundary: Coordinate[];
  records: number;
  max_severity: number;
  avg_severity: number;
  over_threshold: number;
  pressure: Pressure;
}

export interface PestMatrixCell {
  pest: string;
  greenhouse: string;
  records: number;
  avg_severity: number;
}

export interface ComplianceIssue {
  level: "block" | "warn" | "info";
  code: string;
  message: string;
}

/** What one product would cost and constrain — computed server-side, not saved. */
export interface SprayPreview {
  chemical_id: number;
  name: string;
  product: string | null;
  type_of_application: string | null;
  rate: string | null;
  area_ha: number | null;
  qty: number | null;
  volume_of_water: string | null;
  buying_price: number | null;
  cost_of_chemical: number | null;
  who_class: string | null;
  rac_code: string | null;
  active_ingredient1: string | null;
  target1: string | null;
  target2: string | null;
  rei: string | null;
  phi_days: number | null;
  safe_harvest_date: string | null;
  issues: ComplianceIssue[];
  blocked: boolean;
}

export interface SprayProgramResult {
  program_id: string;
  records: SprayRecord[];
  total_cost: number;
  safe_harvest_date: string | null;
}

export interface ScoutSummary {
  scout_id: number;
  name: string;
  records: number;
  greenhouses_visited: number;
  last_seen: string | null;
}

export interface SprayCostRow {
  greenhouse: string;
  programs: number;
  products: number;
  total_cost: number;
}

export interface Filters {
  start?: string;
  end?: string;
  greenhouse_id?: number;
  pest_id?: number;
  disease_id?: number;
  variety_code?: string;
  scout_id?: number;
  scouting_for?: ScoutingFor | "";
}

export interface KpiDelta {
  value: number;
  previous: number;
  delta_pct: number | null;
}

export interface AnalyticsSummary {
  start: string;
  end: string;
  records: KpiDelta;
  avg_severity: KpiDelta;
  over_threshold: KpiDelta;
  open_recommendations: number;
  active_scouts: KpiDelta;
  spray_cost: KpiDelta;
  beneficials: number;
  by_type: Record<string, number>;
}

export interface TrendPoint {
  date: string;
  records: number;
  avg_severity: number;
  over_threshold: number;
}

export interface BreakdownRow {
  key: string;
  records: number;
  avg_severity: number;
  over_threshold: number;
}

export interface SeverityBucket {
  severity: number;
  count: number;
}

export interface BedPressure {
  bed_code: string;
  records: number;
  avg_severity: number;
  max_severity: number;
  over_threshold: number;
  pressure: Pressure;
}

export interface Recommendation {
  id: number;
  greenhouse_id: number | null;
  bed_code: string | null;
  pest_id: number | null;
  disease_id: number | null;
  recommended_chemical_id: number | null;
  status: RecStatus;
  trigger_severity: number;
  baseline_severity: number | null;
  post_severity: number | null;
  effective_threshold: number | null;
  threshold_source: string | null;
  note: string | null;
  outcome_note: string | null;
  reopened_count: number;
  created_at: string;
  resolved_at: string | null;
}
