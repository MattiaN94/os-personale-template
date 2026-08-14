PRAGMA foreign_keys = ON;

ALTER TABLE operation_items
  ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'declared'
  CHECK (evidence_status IN ('verified','declared','estimated','planned'));

ALTER TABLE sources
  ADD COLUMN expected_refresh_days INTEGER
  CHECK (expected_refresh_days IS NULL OR expected_refresh_days BETWEEN 1 AND 3650);

ALTER TABLE sources
  ADD COLUMN last_reviewed_at TEXT;

ALTER TABLE data_quality_issues
  ADD COLUMN domain TEXT
  CHECK (domain IS NULL OR domain IN ('profile','finance','health','home','deadlines','documents','system'));

CREATE INDEX IF NOT EXISTS operation_items_category_idx
  ON operation_items(workspace_id, kind, json_extract(payload_json, '$.category'), state, effective_date DESC);

CREATE INDEX IF NOT EXISTS operation_items_evidence_idx
  ON operation_items(workspace_id, evidence_status, state, effective_date DESC);

CREATE INDEX IF NOT EXISTS sources_freshness_idx
  ON sources(workspace_id, state, coverage_end DESC, source_date DESC);
