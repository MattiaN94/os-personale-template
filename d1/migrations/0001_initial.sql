PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  document_type TEXT NOT NULL CHECK (length(document_type) BETWEEN 1 AND 80),
  document_date TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'personal' CHECK (sensitivity IN ('normal','personal','financial','health','identity','highly_restricted')),
  state TEXT NOT NULL DEFAULT 'staged' CHECK (state IN ('staged','confirmed','superseded','rejected','quarantined')),
  content_sha256 TEXT CHECK (content_sha256 IS NULL OR (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  encrypted_content_sha256 TEXT CHECK (encrypted_content_sha256 IS NULL OR (length(encrypted_content_sha256) = 64 AND encrypted_content_sha256 NOT GLOB '*[^0-9a-f]*')),
  encrypted_object_key TEXT,
  byte_count INTEGER CHECK (byte_count IS NULL OR byte_count > 0),
  media_type TEXT,
  encryption_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(encryption_metadata_json)),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_content_hash_unique
  ON documents(workspace_id, content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'manual_statement','official_portal_export','bank_statement','investment_statement','loan_statement',
    'insurer_document','utility_invoice','healthcare_record','apple_health_export','medical_report',
    'prescription','lab_report','tax_document','payroll_document','property_document','receipt',
    'contract','calendar','import_package','calculation','other'
  )),
  provider TEXT,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  original_document_id TEXT REFERENCES documents(id) ON DELETE RESTRICT,
  external_reference TEXT,
  coverage_start TEXT,
  coverage_end TEXT,
  source_date TEXT,
  source_sha256 TEXT CHECK (source_sha256 IS NULL OR (length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*')),
  reliability TEXT NOT NULL CHECK (reliability IN ('primary_authoritative','institution_issued','user_confirmed','derived','estimate')),
  state TEXT NOT NULL DEFAULT 'pending_review' CHECK (state IN ('pending_review','verified','superseded','rejected')),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS sources_hash_unique
  ON sources(workspace_id, source_sha256)
  WHERE source_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS operation_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner','gpt','import','system')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('direct_user_statement','document_extraction','import','calculation','integration')),
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  source_label TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','confirmed','rejected')),
  requires_confirmation INTEGER NOT NULL DEFAULT 1 CHECK (requires_confirmation IN (0,1)),
  risk_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  decided_by TEXT,
  UNIQUE(workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS operation_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL REFERENCES operation_batches(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN (
    'investment','account_balance','financial_snapshot','asset_valuation','liability_snapshot','mortgage_snapshot',
    'pension_snapshot','insurance_policy','transaction','recurring_commitment','budget_target','utility_bill',
    'measurement','lab_result','medication','diagnosis','vaccination','appointment','deadline','event','document','fact','note'
  )),
  effective_date TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','confirmed','superseded','rejected','contested','archived')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 32768),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('normal','personal','financial','health','identity','highly_restricted')),
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  supersedes_item_id TEXT REFERENCES operation_items(id) ON DELETE RESTRICT,
  source_document_id TEXT REFERENCES documents(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  CHECK (supersedes_item_id IS NULL OR supersedes_item_id <> id),
  CHECK (state <> 'confirmed' OR confirmed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS operation_items_current_idx ON operation_items(workspace_id, kind, effective_date DESC, state);
CREATE INDEX IF NOT EXISTS operation_items_batch_idx ON operation_items(batch_id);
CREATE INDEX IF NOT EXISTS operation_items_title_idx ON operation_items(workspace_id, title COLLATE NOCASE);

CREATE VIEW IF NOT EXISTS current_operation_items AS
SELECT * FROM operation_items WHERE state = 'confirmed';

CREATE TABLE IF NOT EXISTS document_excerpts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL,
  masked_text TEXT NOT NULL CHECK (length(masked_text) BETWEEN 1 AND 12000),
  page_labels_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(page_labels_json)),
  purpose TEXT NOT NULL CHECK (length(purpose) BETWEEN 1 AND 200),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  intended_sensitivity TEXT NOT NULL CHECK (intended_sensitivity IN ('normal','personal','financial','health','identity','highly_restricted')),
  created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('health_workbook','apple_health_export','financial_baseline','csv','other')),
  source_name TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'staged' CHECK (state IN ('staged','pending_review','verified','superseded','rejected','failed')),
  expected_counts_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(expected_counts_json)),
  actual_counts_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(actual_counts_json)),
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  UNIQUE(workspace_id, source_sha256)
);

CREATE TABLE IF NOT EXISTS health_daily_metrics (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  import_source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  observed_on TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  source_label TEXT NOT NULL,
  unit TEXT NOT NULL,
  record_count INTEGER,
  value_sum REAL,
  value_avg REAL,
  value_min REAL,
  value_max REAL,
  value_first REAL,
  value_last REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, import_source_id, observed_on, metric_key, source_label)
);

CREATE TABLE IF NOT EXISTS sleep_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  import_source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  observed_on TEXT NOT NULL,
  detected_hours REAL,
  valid_hours REAL,
  efficiency REAL CHECK (efficiency IS NULL OR efficiency BETWEEN 0 AND 1),
  core_minutes REAL,
  deep_minutes REAL,
  rem_minutes REAL,
  awake_minutes REAL,
  source_status TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, import_source_id, observed_on)
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  import_source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  observed_on TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  duration_minutes REAL,
  distance_km REAL,
  energy_kcal REAL,
  average_heart_rate REAL,
  maximum_heart_rate REAL,
  running_speed_kmh REAL,
  route_file_name TEXT,
  source_label TEXT,
  source_row INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, import_source_id, source_row)
);

CREATE TABLE IF NOT EXISTS google_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_email TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  scope TEXT NOT NULL CHECK (scope = 'https://www.googleapis.com/auth/calendar.events.owned'),
  state TEXT NOT NULL DEFAULT 'connected' CHECK (state IN ('connected','revoked','error')),
  encrypted_refresh_token TEXT,
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  last_sync_at TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS google_calendar_sync_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  operation_item_id TEXT NOT NULL REFERENCES operation_items(id) ON DELETE RESTRICT,
  google_event_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','synced','error')),
  error_code TEXT,
  last_synced_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, operation_item_id)
);

CREATE TABLE IF NOT EXISTS api_rate_windows (
  actor_id TEXT NOT NULL,
  route_group TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY(actor_id, route_group, window_start)
);

CREATE TABLE IF NOT EXISTS data_quality_issues (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  operation_item_id TEXT REFERENCES operation_items(id) ON DELETE RESTRICT,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','blocking')),
  code TEXT NOT NULL,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','accepted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  object_key TEXT,
  state TEXT NOT NULL CHECK (state IN ('started','completed','failed','skipped')),
  row_counts_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(row_counts_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  actor_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner','gpt','import','system')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_workspace_idx ON audit_events(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS deadlines_payload_idx ON operation_items(workspace_id, kind, state, effective_date);
CREATE INDEX IF NOT EXISTS source_review_idx ON sources(workspace_id, state, reliability);

CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'append-only audit'); END;
CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'append-only audit'); END;
CREATE TRIGGER IF NOT EXISTS operation_items_no_delete
BEFORE DELETE ON operation_items BEGIN SELECT RAISE(ABORT, 'versioned records cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS operation_batches_no_delete
BEFORE DELETE ON operation_batches BEGIN SELECT RAISE(ABORT, 'operation history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS sources_no_delete
BEFORE DELETE ON sources BEGIN SELECT RAISE(ABORT, 'source history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS documents_no_delete
BEFORE DELETE ON documents BEGIN SELECT RAISE(ABORT, 'document metadata cannot be deleted'); END;
