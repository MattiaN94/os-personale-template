PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS regulatory_rules (
  id TEXT PRIMARY KEY,
  rule_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  domain TEXT NOT NULL CHECK (domain IN ('home','mobility','benefits','isee','documents')),
  jurisdiction TEXT NOT NULL DEFAULT 'IT',
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('legal','manufacturer','recommended','monitor')),
  recurrence_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(recurrence_json)),
  applicability_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(applicability_json)),
  source_publisher TEXT NOT NULL,
  source_url TEXT NOT NULL,
  effective_from TEXT,
  effective_to TEXT,
  last_verified_at TEXT NOT NULL,
  next_review_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','review_due','superseded')),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  UNIQUE(rule_key, version, jurisdiction)
);

CREATE INDEX IF NOT EXISTS regulatory_rules_active_idx
  ON regulatory_rules(domain, jurisdiction, state, next_review_at);

CREATE TABLE IF NOT EXISTS benefit_opportunities (
  id TEXT PRIMARY KEY,
  benefit_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK (category IN ('utilities','home','mobility','person','appliances','tax')),
  jurisdiction TEXT NOT NULL DEFAULT 'IT',
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  eligibility_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(eligibility_json)),
  source_publisher TEXT NOT NULL,
  source_url TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  application_deadline TEXT,
  last_verified_at TEXT NOT NULL,
  next_review_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'monitoring' CHECK (state IN ('open','monitoring','closed','superseded')),
  UNIQUE(benefit_key, version, jurisdiction)
);

CREATE INDEX IF NOT EXISTS benefit_opportunities_review_idx
  ON benefit_opportunities(jurisdiction, state, next_review_at);

CREATE TABLE IF NOT EXISTS monitor_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  monitor_key TEXT NOT NULL CHECK (monitor_key IN ('benefits.monthly','regulations.monthly','vehicle.valuation.quarterly','data.quality.monthly')),
  scheduled_for TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'due' CHECK (state IN ('due','completed','dismissed')),
  summary TEXT,
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(workspace_id, monitor_key, scheduled_for)
);

CREATE INDEX IF NOT EXISTS monitor_runs_due_idx
  ON monitor_runs(workspace_id, state, scheduled_for);

INSERT OR IGNORE INTO regulatory_rules
  (id, rule_key, version, domain, jurisdiction, title, rule_type, recurrence_json, applicability_json, source_publisher, source_url, effective_from, last_verified_at, next_review_at, notes)
VALUES
  ('rule-auto-revisione-it-v1', 'vehicle.revision', 1, 'mobility', 'IT', 'Revisione periodica autovettura', 'legal',
   '{"first_interval_months":48,"interval_months":24,"remind_days_before":[60,30,7]}',
   '{"vehicle_types":["passenger_car","camper","motorcycle"],"mass_max_kg":3500}',
   'Ministero delle Infrastrutture e dei Trasporti', 'https://www.ilportaledellautomobilista.it/web/portale-automobilista/veicoli/revisioni', '2026-01-01', '2026-08-13', '2026-09-01',
   'Prima revisione dopo quattro anni dalla prima immatricolazione; successive ogni due anni. Casi speciali possono avere frequenza annuale.'),
  ('rule-auto-rca-it-v1', 'vehicle.rca', 1, 'mobility', 'IT', 'Scadenza RC Auto', 'legal',
   '{"interval_months":12,"remind_days_before":[45,30,7,1],"grace_days":15}', '{}',
   'IVASS', 'https://www.ivass.it/consumatori/quesiti/r.c.auto/index.html', '2026-01-01', '2026-08-13', '2026-09-01',
   'La RC Auto non si rinnova tacitamente; la copertura resta normalmente operante per i quindici giorni successivi alla scadenza.'),
  ('rule-auto-bollo-it-v1', 'vehicle.road_tax', 1, 'mobility', 'IT', 'Bollo auto regionale', 'legal',
   '{"interval_months":12,"remind_days_before":[30,7,1],"requires_exact_due_date":true}', '{"region_required":true}',
   'ACI', 'https://aci.gov.it/servizio/calcola-online-il-bollo-ed-il-superbollo/', '2026-01-01', '2026-08-13', '2026-09-01',
   'Importo, termine, riduzioni ed esenzioni dipendono anche dalla Regione e dalle caratteristiche del veicolo.'),
  ('rule-auto-gomme-it-v1', 'vehicle.tires.seasonal', 1, 'mobility', 'IT', 'Dotazioni invernali', 'legal',
   '{"season_start":"11-15","season_end":"04-15","change_window_days":30,"remind_days_before":[30,14,1]}', '{"local_ordinance_required":true}',
   'Polizia di Stato', 'https://questure.poliziadistato.it/Alessandria/articolo/28576554a3b113cbd098612641', '2026-01-01', '2026-08-13', '2026-10-01',
   'La regola pratica nazionale dipende dalle ordinanze degli enti proprietari delle strade; verificare sempre il territorio percorso.'),
  ('rule-auto-tagliando-v1', 'vehicle.service', 1, 'mobility', 'IT', 'Tagliando e manutenzione programmata', 'manufacturer',
   '{"requires_manual_interval":true,"remind_days_before":[45,30,7]}', '{"manual_required":true}',
   'Costruttore del veicolo', 'https://aci.gov.it/servizio/costi-chilometrici-di-esercizio/', '2026-01-01', '2026-08-13', '2027-02-13',
   'Intervallo da libretto di uso e manutenzione o piano ufficiale del costruttore; non viene inventata una scadenza universale.'),
  ('rule-auto-safety-v1', 'vehicle.safety_components', 1, 'mobility', 'IT', 'Pneumatici, freni e componenti di sicurezza', 'manufacturer',
   '{"requires_condition_check":true,"remind_days_before":[30,7]}', '{"manual_required":true}',
   'Costruttore del veicolo', 'https://aci.gov.it/codice-della-strada/art-192/', '2026-01-01', '2026-08-13', '2027-02-13',
   'La sostituzione dipende da usura, età, chilometraggio, condizioni e limiti del costruttore. L app crea controlli, non date di sostituzione certe.'),
  ('rule-caldaia-it-v1', 'home.boiler.maintenance', 1, 'home', 'IT', 'Manutenzione impianto termico', 'manufacturer',
   '{"requires_manual_interval":true,"remind_days_before":[60,30,7]}', '{"installer_or_manufacturer_instructions_required":true,"region_required":true}',
   'Gazzetta Ufficiale - DPR 74/2013', 'https://www.gazzettaufficiale.it/eli/gu/2013/06/27/149/sg/pdf', '2013-07-12', '2026-08-13', '2026-10-01',
   'Periodicità della manutenzione secondo installatore o fabbricante; il controllo di efficienza dipende da combustibile, potenza e disciplina regionale.'),
  ('rule-benefit-monitor-v1', 'benefits.monthly_review', 1, 'benefits', 'IT', 'Verifica mensile agevolazioni', 'monitor',
   '{"interval_months":1,"remind_days_before":[0]}', '{}',
   'Personal OS - fonti pubbliche ufficiali', 'https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.Portale-unico-ISEE.html', '2026-08-01', '2026-08-13', '2026-09-01',
   'Il monitor deve consultare fonti ufficiali nazionali, regionali e comunali; i risultati restano proposte fino alla conferma.' );

INSERT OR IGNORE INTO benefit_opportunities
  (id, benefit_key, version, title, category, jurisdiction, summary, eligibility_json, source_publisher, source_url, valid_from, valid_to, last_verified_at, next_review_at, state)
VALUES
  ('benefit-utility-social-2026-v1', 'utility.social.2026', 1, 'Bonus sociali luce, gas, acqua e rifiuti', 'utilities', 'IT',
   'Riconoscimento automatico con DSU valida quando l ISEE e i requisiti di intestazione della fornitura rientrano nelle soglie vigenti.',
   '{"isee_max":9796,"large_family_isee_max":20000,"large_family_min_children":4,"requires_dsu":true,"requires_household_contract_holder":true}',
   'ARERA', 'https://www.arera.it/consumatori/bonus-sociale/bonus-sociale-per-disagio-economico/quali-sono-i-requisiti', '2026-01-01', '2026-12-31', '2026-08-13', '2026-09-01', 'open'),
  ('benefit-home-renovation-2026-v1', 'home.renovation.2026', 1, 'Detrazione recupero edilizio 2026', 'home', 'IT',
   'Detrazione ordinaria del 36 percento, elevata al 50 percento per proprietario o titolare di diritto reale sull abitazione principale, nei limiti e per gli interventi ammessi.',
   '{"primary_home_rate":0.50,"ordinary_rate":0.36,"requires_eligible_work":true,"requires_traceable_payment":true}',
   'Agenzia delle Entrate', 'https://infoprecompilata.agenziaentrate.gov.it/portale/semplificata-mod-oneri-immobili', '2026-01-01', '2026-12-31', '2026-08-13', '2026-09-01', 'open'),
  ('benefit-enea-notice-2026-v1', 'home.enea.2026', 1, 'Comunicazione ENEA per interventi agevolati', 'home', 'IT',
   'Per gli interventi soggetti a comunicazione, la scheda descrittiva va trasmessa nel termine applicabile; il portale 2026 è stato aggiornato il 25 giugno.',
   '{"deadline_days":90,"requires_eligible_energy_work":true}',
   'ENEA', 'https://bonusfiscali.enea.it/', '2026-01-01', '2026-12-31', '2026-08-13', '2026-09-01', 'open'),
  ('benefit-wallbox-2026-v1', 'mobility.wallbox.2026', 1, 'Contributo infrastruttura di ricarica domestica', 'mobility', 'IT',
   'Il DPCM Automotive 2026 prevede un contributo dell 80 percento entro i massimali indicati, soggetto ai provvedimenti attuativi e alle risorse disponibili.',
   '{"rate":0.80,"person_cap":1500,"condominium_cap":8000,"implementation_check_required":true}',
   'MIMIT', 'https://www.mimit.gov.it/images/stories/normativa/allegati/DPCM_Automotive_2026-nf.pdf', '2026-01-01', '2030-03-31', '2026-08-13', '2026-09-01', 'monitoring');

INSERT OR IGNORE INTO monitor_runs
  (id, workspace_id, monitor_key, scheduled_for, state, summary, created_at)
SELECT lower(hex(randomblob(16))), id, 'benefits.monthly', '2026-08-01', 'due',
       'Verificare novita nazionali, regionali e comunali su bonus e agevolazioni.', CURRENT_TIMESTAMP
FROM workspaces;

INSERT OR IGNORE INTO monitor_runs
  (id, workspace_id, monitor_key, scheduled_for, state, summary, created_at)
SELECT lower(hex(randomblob(16))), id, 'regulations.monthly', '2026-08-01', 'due',
       'Ricontrollare regole e scadenze legali usate per casa e mobilita.', CURRENT_TIMESTAMP
FROM workspaces;
