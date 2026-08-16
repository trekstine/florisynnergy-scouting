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
  /** Pressure-index ETL: Σ(per-bed severity) ÷ beds scouted, per block. */
  pressure_threshold: number;
  is_active: boolean;
}

export interface Disease {
  id: number;
  name: string;
  threshold: number;
  pressure_threshold: number;
  is_active: boolean;
}

export interface Chemical {
  id: number;
  name: string;
  product: string | null;
  type_of_application: string | null;
  rate: string | null;
  who_class: string | null;
  rac_code: string | null;
  active_ingredient1: string | null;
  target1: string | null;
  target2: string | null;
  rei: string | null;
  buying_price: number | null;
  /** Dosing fields — the spray builder needs these to price a product. */
  rate_per_ha: number | null;
  water_rate_l_per_ha: number | null;
  phi_days: number | null;
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
  partition_no: string | null;
  variety_code: string | null;
  product: string | null;
  type_of_application: string | null;
  rate: string | null;
  volume_of_water: string | null;
  coverage: string | null;
  who_class: string | null;
  rac_code: string | null;
  rei: string | null;
  active_ingredient1: string | null;
  active_ingredient2: string | null;
  target1: string | null;
  target2: string | null;
  chemical_id: number | null;
  scout_id: number | null;
  area_ha: number | null;
  qty: number | null;
  buying_price: number | null;
  cost_of_chemical: number | null;
  phi_days: number | null;
  safe_harvest_date: string | null;
  comments: string | null;
  start_date: string | null;
  start_time: string | null;
  scout_report_date: string | null;
  program_status: ProgramStatus;
  applied_at: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  effectiveness: Effectiveness | null;
  recorded_at: string;
}

/** Planned before it is sprayed; reviewed only after a follow-up round. */
export type ProgramStatus = "planned" | "applied" | "reviewed";
export type Effectiveness = "effective" | "partial" | "ineffective";

export interface SprayAttachment {
  id: number;
  program_id: string;
  filename: string;
  url: string;
  content_type: string | null;
  size_bytes: number | null;
  kind: string | null;
  note: string | null;
  uploaded_by: number | null;
  uploaded_at: string;
}

/** A spray program as seen from the scouting side of the loop. */
export interface ProgramSummary {
  program_id: string;
  greenhouse_id: number | null;
  greenhouse: string | null;
  bed_code: string | null;
  start_date: string | null;
  products: string[];
  total_cost: number;
  program_status: ProgramStatus;
  safe_harvest_date: string | null;
  recommendation_id: number | null;
  attachments: number;
}

/** One scouting round — what a farm calls a scouting report. */
export interface RoundSummary {
  batch_id: string;
  greenhouse_id: number | null;
  greenhouse: string | null;
  greenhouse_code: string | null;
  scout_id: number | null;
  scout: string | null;
  started_at: string;
  ended_at: string;
  records: number;
  beds: number;
  findings: number;
  max_severity: number;
  session_comment: string | null;
  agents: string[];
  pests: string[];
  diseases: string[];
  varieties: string[];
  clean_beds: number;
  hotspots: number;
  beneficials: number;
  photos: number;
  flagged: number;
  duration_minutes: number;
  programs: number;
}

export interface RoundRecommendation {
  id: number;
  status: RecStatus;
  note: string | null;
  outcome_note: string | null;
  trigger_severity: number;
  bed_code: string | null;
  created_at: string;
}

export interface RoundDetail {
  round: RoundSummary;
  entries: ScoutingRecord[];
  recommendations: RoundRecommendation[];
  programs: ProgramSummary[];
}

export interface ScoutingHistoryPoint {
  id: number;
  severity: number;
  recorded_at: string;
  is_this: boolean;
}

/** One observation plus its session, its history, and the loop it started. */
export interface ScoutingDetail {
  record: ScoutingRecord;
  greenhouse: string | null;
  greenhouse_code: string | null;
  pest: string | null;
  disease: string | null;
  variety: string | null;
  scout: string | null;
  session_records: number;
  session_beds: number;
  session_started_at: string | null;
  session_ended_at: string | null;
  recommendation_id: number | null;
  recommendation_note: string | null;
  recommendation_status: RecStatus | null;
  recommendation_outcome: string | null;
  sprays: SprayRecord[];
  history: ScoutingHistoryPoint[];
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
  /** Worst active issue, e.g. "Powdery Mildew severity 4 detected on Bed 4". */
  headline: string | null;
}

/** Per-greenhouse, per-agent pressure — pests and diseases never blended. */
export interface AgentPressure {
  greenhouse_id: number;
  agent_kind: "pest" | "disease";
  agent_id: number;
  agent_name: string;
  records: number;
  beds_observed: number;
  beds_scouted: number;
  total_severity: number;
  pressure_index: number;
  max_severity: number;
  hotspot_bed: string | null;
  pressure_threshold: number;
  over_etl: boolean;
  hotspot: boolean;
  action_required: boolean;
}

/** One day's reading for one pest or disease. */
export interface AgentTrendPoint {
  date: string;
  agent_kind: "pest" | "disease";
  agent_name: string;
  records: number;
  avg_severity: number;
  max_severity: number;
}

export interface PestMatrixCell {
  pest: string;
  kind: "pest" | "disease";
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
  beds_visited: number;
  last_seen: string | null;
}

export interface MovementStop {
  started_at: string;
  ended_at: string;
  minutes: number | null;
  greenhouse_id: number | null;
  greenhouse: string;
  bed_code: string | null;
  records: number;
  max_severity: number;
  agents: string[];
}

export interface MovementDay {
  date: string;
  records: number;
  beds: number;
  greenhouses: string[];
  first_seen: string;
  last_seen: string;
  active_minutes: number;
  stops: MovementStop[];
}

export interface ScoutMovement {
  scout_id: number;
  name: string;
  days: MovementDay[];
  total_records: number;
  total_beds: number;
  active_minutes: number;
  median_minutes_per_bed: number | null;
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
  /** Beds where this agent/variety was seen — shown on hover. */
  beds: string[];
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
