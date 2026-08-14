PRAGMA foreign_keys = ON;

CREATE TABLE data_quality_issues_clean (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_id TEXT REFERENCES sources(id) ON DELETE RESTRICT,
  operation_item_id TEXT REFERENCES operation_items(id) ON DELETE RESTRICT,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','blocking')),
  code TEXT NOT NULL,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','accepted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  domain TEXT CHECK (domain IS NULL OR domain IN ('profile','finance','health','home','deadlines','documents','system'))
);

INSERT INTO data_quality_issues_clean
  (id, workspace_id, source_id, operation_item_id, severity, code, message, state, created_at, resolved_at, domain)
SELECT id, workspace_id, source_id, operation_item_id, severity, code, message, state, created_at, resolved_at,
       CASE
         WHEN domain IS NULL OR domain IN ('profile','finance','health','home','deadlines','documents','system') THEN domain
         ELSE 'system'
       END
FROM data_quality_issues;

DROP TABLE data_quality_issues;
ALTER TABLE data_quality_issues_clean RENAME TO data_quality_issues;

CREATE INDEX data_quality_issues_open_idx
  ON data_quality_issues(workspace_id, state, severity, created_at DESC);
