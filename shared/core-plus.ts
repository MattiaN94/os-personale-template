import {
  budgetVarianceMonthly, cashFlowMonthly, deadlineReliability, financialPositionSummary,
  liquidityRunway, netWorthStatistics, portfolioPositions, portfolioSummary, provenanceMix,
  type AnalyticsRecord,
} from './analytics'

export interface CoreRecord {
  id: string
  kind: string
  title: string
  effective_date: string
  state: string
  evidence_status?: string
  payload: Record<string, unknown>
}

export interface CoreSource {
  id: string
  source_type: string
  state: string
  coverage_start?: string | null
  coverage_end?: string | null
  source_date?: string | null
  expected_refresh_days?: number | null
}

export interface DataHealthDomain {
  domain: 'profile' | 'finance' | 'health' | 'home' | 'deadlines' | 'documents'
  status: 'complete' | 'partial' | 'stale' | 'missing'
  score: number
  last_update: string | null
  record_count: number
  verified_source_count: number
  estimated_count: number
  planned_count: number
  next_action: string
}

interface CorePlusInput {
  records: CoreRecord[]
  pending: Array<{ id: string; source_label?: string | null; risk_reason?: string | null; created_at: string }>
  sources: CoreSource[]
  issues: Array<{ severity: string; code: string; message: string }>
  documents: Array<{ id: string; state: string; created_at: string }>
  health_imported_record_count?: number
  sleep: Array<{ id: string; observed_on: string; valid_hours?: number | null }>
  workouts: Array<{ id: string; observed_on: string; duration_minutes?: number | null }>
  today: string
}

const financialKinds = new Set(['investment','account_balance','financial_snapshot','asset_valuation','liability_snapshot','mortgage_snapshot','pension_snapshot','insurance_policy','transaction','recurring_commitment','budget_target'])
const healthKinds = new Set(['measurement','lab_result','medication','diagnosis','vaccination','appointment'])
const homeKinds = new Set(['utility_bill','insurance_policy','recurring_commitment','asset_valuation'])
const financeSources = new Set(['bank_statement','investment_statement','loan_statement','tax_document','payroll_document','official_portal_export'])
const healthSources = new Set(['healthcare_record','apple_health_export','medical_report','prescription','lab_report'])
const homeSources = new Set(['insurer_document','utility_invoice','property_document','contract'])

function category(record: CoreRecord) { return String(record.payload.category ?? '') }
function isCategory(record: CoreRecord, value: string) { return category(record) === value }
function maxDate(values: Array<string | null | undefined>) { return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null }
function daysBetween(from: string, to: string) { return Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) }
function inRange(value: string, start: string, end: string) { return value >= start && value <= end }
function isoShift(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
function monthStart(date: string) { return `${date.slice(0, 7)}-01` }
function previousMonthStart(date: string) { const value = new Date(`${monthStart(date)}T12:00:00Z`); value.setUTCMonth(value.getUTCMonth() - 1); return value.toISOString().slice(0, 10) }
function number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }

function sourceDomain(source: CoreSource) {
  if (financeSources.has(source.source_type)) return 'finance'
  if (healthSources.has(source.source_type)) return 'health'
  if (homeSources.has(source.source_type)) return 'home'
  if (source.source_type === 'calendar') return 'deadlines'
  return 'documents'
}

function domainRecords(records: CoreRecord[], domain: DataHealthDomain['domain']) {
  if (domain === 'profile') return records.filter((row) => isCategory(row, 'profile.constitution'))
  if (domain === 'finance') return records.filter((row) => financialKinds.has(row.kind) || /^(portfolio|finance|isee)\./.test(category(row)))
  if (domain === 'health') return records.filter((row) => healthKinds.has(row.kind) || category(row) === 'check_in' || /^(health|nutrition)\./.test(category(row)))
  if (domain === 'home') return records.filter((row) => homeKinds.has(row.kind) || /^(property|vehicle|maintenance|warranty|mobility)(\.|$)/.test(category(row)))
  if (domain === 'deadlines') return records.filter((row) => ['deadline','appointment'].includes(row.kind))
  return []
}

function dataHealth(input: CorePlusInput) {
  const domains: DataHealthDomain['domain'][] = ['profile','finance','health','home','deadlines','documents']
  return domains.map((domain): DataHealthDomain => {
    const records = domainRecords(input.records, domain)
    const confirmedDocuments = input.documents.filter((row) => row.state === 'confirmed')
    const supplementalCount = domain === 'health' ? Number(input.health_imported_record_count || (input.sleep.length + input.workouts.length)) : 0
    const relevantSources = input.sources.filter((source) => sourceDomain(source) === domain)
    const verified = relevantSources.filter((source) => source.state === 'verified')
    const lastUpdate = domain === 'documents'
      ? maxDate(confirmedDocuments.map((row) => row.created_at.slice(0, 10)))
      : maxDate([...records.map((row) => row.effective_date), ...verified.map((source) => source.coverage_end || source.source_date)])
    const expectedDays = Math.min(...verified.map((source) => Number(source.expected_refresh_days || 0)).filter(Boolean), domain === 'health' ? 45 : domain === 'finance' ? 45 : domain === 'deadlines' ? 90 : 365)
    const stale = lastUpdate ? daysBetween(lastUpdate, input.today) > expectedDays : false
    const sourceRequired = ['finance','health','home','documents'].includes(domain)
    const hasContent = domain === 'documents' ? confirmedDocuments.length > 0 : records.length + supplementalCount > 0
    // The sourcing credit is conditional on there being content to source:
    // domains that need no external source would otherwise earn it while still
    // empty, reporting a non-zero index for a workspace holding no data at all.
    const score = (hasContent ? 45 : 0)
      + (hasContent && (!sourceRequired || verified.length > 0) ? 25 : 0)
      + (lastUpdate ? stale ? 5 : 30 : 0)
    let status: DataHealthDomain['status'] = 'missing'
    if (hasContent && stale) status = 'stale'
    else if (score >= 85) status = 'complete'
    else if (score > 0) status = 'partial'
    const actions: Record<DataHealthDomain['domain'], string> = {
      profile: 'Completa la Costituzione personale',
      finance: 'Carica saldi e posizioni ufficiali riferiti alla stessa data',
      health: 'Verifica l’ultimo export sanitario disponibile',
      home: 'Aggiungi contratti, polizze, bollette e manutenzioni principali',
      deadlines: 'Registra le prossime scadenze importanti',
      documents: 'Archivia e verifica almeno una fonte originale',
    }
    return {
      domain,
      status,
      score,
      last_update: lastUpdate,
      record_count: domain === 'documents' ? confirmedDocuments.length : records.length + supplementalCount,
      verified_source_count: verified.length,
      estimated_count: records.filter((row) => row.evidence_status === 'estimated').length,
      planned_count: records.filter((row) => row.evidence_status === 'planned').length,
      next_action: status === 'complete' ? 'Nessuna azione urgente' : actions[domain],
    }
  })
}

function periodStats(input: CorePlusInput, start: string, end: string) {
  const records = input.records.filter((row) => inRange(row.effective_date, start, end))
  const transactions = records.filter((row) => row.kind === 'transaction')
  const sleep = input.sleep.filter((row) => inRange(row.observed_on, start, end) && typeof row.valid_hours === 'number' && row.valid_hours > 0 && row.valid_hours <= 24)
  return {
    from: start,
    to: end,
    confirmed_records: records.length,
    investments_eur: records.filter((row) => row.kind === 'investment').reduce((sum, row) => sum + number(row.payload.amount), 0),
    income_eur: transactions.filter((row) => row.payload.direction === 'income').reduce((sum, row) => sum + number(row.payload.amount), 0),
    expenses_eur: transactions.filter((row) => row.payload.direction === 'expense').reduce((sum, row) => sum + number(row.payload.amount), 0),
    workouts: input.workouts.filter((row) => inRange(row.observed_on, start, end)).length,
    sleep_days: sleep.length,
    average_sleep_hours: sleep.length ? sleep.reduce((sum, row) => sum + number(row.valid_hours), 0) / sleep.length : null,
    check_ins: records.filter((row) => isCategory(row, 'check_in')).length,
    deadlines_completed: records.filter((row) => row.kind === 'deadline' && row.payload.status === 'completed').length,
  }
}

// Materiality thresholds. A comparison is surfaced only when it clears the bar,
// and the bar is always stated in the caveat so no number looks more meaningful
// than it is. Four workouts against three is arithmetic, not an insight.
const MATERIAL = {
  targetDriftPoints: 0.05,
  concentrationWeight: 0.30,
  netWorthChange: 0.05,
  savingsRatePoints: 0.05,
  runwayMonths: 3,
  estimatedShare: 0.20,
  onTimeRatio: 0.80,
  workoutDelta: 2,
  sleepHours: 0.5,
}

function percent(value: number, digits = 1) { return `${(value * 100).toFixed(digits)}%` }

export function buildCorePlus(input: CorePlusInput) {
  const health = dataHealth(input)
  const deadlines = input.records
    .filter((row) => row.kind === 'deadline' && row.payload.status === 'open')
    .sort((a, b) => String(a.payload.due_at).localeCompare(String(b.payload.due_at)))
  const priorities: Array<Record<string, unknown>> = []
  for (const row of input.pending.slice(0, 2)) priorities.push({ kind: 'confirmation', title: row.source_label || 'Aggiornamento da confermare', detail: row.risk_reason || 'Controllo umano richiesto', target_view: 'confirmations', severity: 'warning' })
  for (const row of deadlines.filter((item) => String(item.payload.due_at).slice(0, 10) <= isoShift(input.today, 14)).slice(0, 2)) priorities.push({ kind: 'deadline', title: row.title, detail: String(row.payload.category || 'Scadenza'), target_view: 'deadlines', due_at: row.payload.due_at, severity: String(row.payload.due_at).slice(0, 10) < input.today ? 'blocking' : 'info' })
  for (const issue of input.issues.filter((row) => row.severity === 'blocking').slice(0, 1)) priorities.push({ kind: 'quality', title: issue.message, detail: issue.code, target_view: 'sources', severity: 'blocking' })
  if (priorities.length < 3) for (const row of health.filter((item) => item.status !== 'complete')) priorities.push({ kind: 'data_health', title: row.next_action, detail: `${row.domain}: ${row.status}`, target_view: row.domain === 'profile' ? 'settings' : row.domain === 'documents' ? 'documents' : row.domain, severity: row.status === 'missing' ? 'warning' : 'info' })

  const currentWeek = periodStats(input, isoShift(input.today, -6), input.today)
  const previousWeek = periodStats(input, isoShift(input.today, -13), isoShift(input.today, -7))
  const currentMonth = periodStats(input, monthStart(input.today), input.today)
  const previousMonthStartValue = previousMonthStart(input.today)
  const previousMonthEnd = isoShift(monthStart(input.today), -1)
  const previousMonth = periodStats(input, previousMonthStartValue, previousMonthEnd)
  const recentSleep = currentWeek
  const priorSleep = previousWeek
  const currentThirty = input.workouts.filter((row) => inRange(row.observed_on, isoShift(input.today, -29), input.today)).length
  const previousThirty = input.workouts.filter((row) => inRange(row.observed_on, isoShift(input.today, -59), isoShift(input.today, -30))).length
  const insights: Array<Record<string, unknown>> = []
  const sleepDelta = recentSleep.average_sleep_hours != null && priorSleep.average_sleep_hours != null
    ? recentSleep.average_sleep_hours - priorSleep.average_sleep_hours : null
  if (recentSleep.sleep_days >= 3 && priorSleep.sleep_days >= 3 && sleepDelta != null && Math.abs(sleepDelta) >= MATERIAL.sleepHours) {
    insights.push({ domain: 'health', title: 'Sonno medio settimanale', summary: `${recentSleep.average_sleep_hours!.toFixed(1)} h contro ${priorSleep.average_sleep_hours!.toFixed(1)} h nella settimana precedente`, evidence: [`${recentSleep.sleep_days} notti recenti`, `${priorSleep.sleep_days} notti precedenti`], confidence: 'medium', caveat: `Mostrato oltre ${MATERIAL.sleepHours} h di scarto. Confronto osservazionale: non dimostra cause.` })
  }
  if (Math.abs(currentThirty - previousThirty) >= MATERIAL.workoutDelta) {
    insights.push({ domain: 'health', title: 'Allenamenti negli ultimi 30 giorni', summary: `${currentThirty} sessioni contro ${previousThirty} nei 30 giorni precedenti`, evidence: [`${currentThirty + previousThirty} sessioni con data verificata`], confidence: 'high', caveat: `Mostrato oltre ${MATERIAL.workoutDelta} sessioni di scarto. Non misura intensità o recupero.` })
  }
  if (currentMonth.investments_eur > 0) {
    insights.push({ domain: 'finance', title: 'Nuovo capitale investito nel mese', summary: `${currentMonth.investments_eur.toFixed(2)} EUR da eventi confermati`, evidence: [`Periodo ${currentMonth.from} / ${currentMonth.to}`], confidence: 'high', caveat: 'Flusso in ingresso, separato da guadagni e perdite di mercato.' })
  }

  const analytics = input.records as unknown as AnalyticsRecord[]
  const holdings = portfolioPositions(analytics)
  const portfolio = portfolioSummary(holdings)
  const drift = portfolio.rows.filter((row) => row.targetGap != null && Math.abs(row.targetGap) >= MATERIAL.targetDriftPoints)
    .sort((a, b) => Math.abs(b.targetGap!) - Math.abs(a.targetGap!))
  if (drift.length) {
    insights.push({ domain: 'finance', title: 'Portafoglio fuori dai pesi obiettivo', summary: `${drift.length} strument${drift.length === 1 ? 'o' : 'i'} oltre la soglia; il maggiore è ${drift[0].instrument} a ${percent(drift[0].targetGap!)} dal target`, evidence: drift.slice(0, 4).map((row) => `${row.instrument}: ${percent(row.actualWeight)} contro ${percent(row.validTarget!)}`), confidence: 'high', caveat: `Mostrato oltre ${percent(MATERIAL.targetDriftPoints, 0)} di scostamento. Il ribilanciamento ha costi e implicazioni fiscali non calcolati qui.` })
  }
  if (portfolio.topWeight != null && portfolio.topWeight >= MATERIAL.concentrationWeight) {
    insights.push({ domain: 'finance', title: 'Concentrazione del portafoglio', summary: `Il primo strumento pesa ${percent(portfolio.topWeight)}${portfolio.effectivePositions == null ? '' : `, con ${portfolio.effectivePositions.toFixed(1)} posizioni equivalenti`}`, evidence: [`${portfolio.rows.length} strumenti correnti`, `HHI ${portfolio.concentrationHhi.toFixed(3)}`], confidence: 'high', caveat: `Mostrato oltre ${percent(MATERIAL.concentrationWeight, 0)} sul primo strumento. La concentrazione non è di per sé un errore.` })
  }

  const worthSeries = input.records
    .filter((row) => row.kind === 'financial_snapshot' && String(row.payload.metric_key) === 'net_worth')
    .map((row) => ({ date: row.effective_date, value: number(row.payload.amount) }))
  const worth = netWorthStatistics(worthSeries)
  if (worth.change12MonthsPercentage != null && Math.abs(worth.change12MonthsPercentage) >= MATERIAL.netWorthChange) {
    insights.push({ domain: 'finance', title: 'Variazione del patrimonio su 12 mesi', summary: `${worth.change12Months! >= 0 ? '+' : ''}${worth.change12Months!.toFixed(2)} EUR (${percent(worth.change12MonthsPercentage)}) rispetto allo stesso mese dell'anno prima`, evidence: [`${worth.monthlyValues.length} mesi con rilevamento`], confidence: 'medium', caveat: `Mostrato oltre ${percent(MATERIAL.netWorthChange, 0)}. Include versamenti e prelievi: non è un rendimento.` })
  }

  const flows = cashFlowMonthly(analytics)
  const rate = (rows: typeof flows) => {
    const income = rows.reduce((sum, row) => sum + row.income, 0)
    return income > 0 ? (income - rows.reduce((sum, row) => sum + row.expenses, 0)) / income : null
  }
  const recentRate = rate(flows.slice(-3))
  const priorRate = rate(flows.slice(-6, -3))
  if (recentRate != null && priorRate != null && Math.abs(recentRate - priorRate) >= MATERIAL.savingsRatePoints) {
    insights.push({ domain: 'finance', title: 'Tasso di risparmio in movimento', summary: `${percent(recentRate)} negli ultimi 3 mesi contro ${percent(priorRate)} nei 3 precedenti`, evidence: [`${flows.slice(-6).length} mesi con movimenti riconciliati`], confidence: 'medium', caveat: `Mostrato oltre ${percent(MATERIAL.savingsRatePoints, 0)} di scarto. Calcolato su movimenti registrati, non su tutti i conti.` })
  }

  const positions = financialPositionSummary(analytics)
  const runway = liquidityRunway(positions.liquidity, flows)
  if (runway.runwayMonths != null && runway.runwayMonths < MATERIAL.runwayMonths) {
    insights.push({ domain: 'finance', title: 'Copertura di liquidità sotto la soglia', summary: `${runway.runwayMonths.toFixed(1)} mesi di spesa coperti dalla liquidità disponibile`, evidence: [`Spesa media su ${runway.observedMonths} mesi`, `Liquidità ${positions.liquidity.toFixed(2)} EUR`], confidence: 'medium', caveat: `Mostrato sotto ${MATERIAL.runwayMonths} mesi. Considera solo i saldi di conto registrati.` })
  }

  const budget = budgetVarianceMonthly(analytics, input.today.slice(0, 7))
  if (budget.usageRatio != null && budget.overBudgetCategories > 0) {
    insights.push({ domain: 'finance', title: 'Budget del mese superato per categoria', summary: `${budget.overBudgetCategories} categori${budget.overBudgetCategories === 1 ? 'a' : 'e'} oltre il budget; utilizzo complessivo ${percent(budget.usageRatio)}`, evidence: budget.rows.filter((row) => row.variance != null && row.variance < 0).slice(0, 4).map((row) => `${row.category}: ${row.actual.toFixed(2)} su ${row.budget!.toFixed(2)} EUR`), confidence: 'high', caveat: budget.unbudgetedValue > 0 ? `${budget.unbudgetedValue.toFixed(2)} EUR di spese senza budget non entrano nel confronto.` : 'Mese in corso: il confronto si completa a fine periodo.' })
  }

  const reliability = deadlineReliability(analytics, input.today)
  if (reliability.completed >= 3 && reliability.onTimeRatio != null && reliability.onTimeRatio < MATERIAL.onTimeRatio) {
    insights.push({ domain: 'deadlines', title: 'Scadenze chiuse in ritardo', summary: `${reliability.onTime} su ${reliability.completed} chiuse entro la data (${percent(reliability.onTimeRatio)})`, evidence: [`${reliability.late} chiusure oltre la scadenza`, `${reliability.openOverdue} ancora aperte e scadute`], confidence: 'medium', caveat: `Mostrato sotto ${percent(MATERIAL.onTimeRatio, 0)} di puntualità. La data di conferma è l'unica prova disponibile del ritardo.` })
  }

  // One insight about provenance, not two mutually exclusive ones: the share is
  // reported when computable, and crossing the threshold sharpens the caveat
  // rather than replacing the card with a differently titled one.
  const provenance = provenanceMix(analytics)
  const estimates = input.records.filter((row) => row.evidence_status === 'estimated')
  if (estimates.length) {
    const share = provenance.estimatedRatio
    const aboveThreshold = share != null && share >= MATERIAL.estimatedShare
    insights.push({
      domain: 'quality',
      title: 'Stime ancora da sostituire',
      summary: share == null
        ? `${estimates.length} valori non provengono ancora da una fonte primaria`
        : `${estimates.length} valori su ${provenance.verified + provenance.declared + provenance.estimated} con evidenza sono stime (${percent(share)}); ${percent(provenance.verifiedRatio ?? 0)} è verificato`,
      evidence: estimates.slice(0, 4).map((row) => row.title),
      confidence: 'high',
      caveat: aboveThreshold
        ? `Oltre la soglia del ${percent(MATERIAL.estimatedShare, 0)}: sostituire le stime con fonti primarie cambierebbe le sintesi. Le stime restano visibili e non prevalgono sui valori verificati.`
        : 'Le stime restano visibili e non prevalgono sui valori verificati.',
    })
  }

  const commitments = input.records.filter((row) => row.kind === 'recurring_commitment'
    && (!row.payload.starts_on || String(row.payload.starts_on) <= input.today)
    && (!row.payload.ends_on || String(row.payload.ends_on) >= input.today))
  const monthlyCommitments = commitments.reduce((sum, row) => {
    const amount = number(row.payload.amount)
    const cadence = String(row.payload.cadence)
    return sum + (cadence === 'annual' ? amount / 12 : cadence === 'quarterly' ? amount / 3 : cadence === 'weekly' ? amount * 52 / 12 : cadence === 'monthly' ? amount : 0)
  }, 0)

  return {
    brief: {
      generated_for: input.today,
      priorities: priorities.slice(0, 3),
      pending_confirmations: input.pending.length,
      open_deadlines: deadlines.length,
      monthly_commitments_eur: monthlyCommitments,
      check_in_due: !input.records.some((row) => isCategory(row, 'check_in') && row.effective_date === input.today),
    },
    data_health: { score: Math.round(health.reduce((sum, row) => sum + row.score, 0) / health.length), domains: health },
    reviews: { weekly: { current: currentWeek, previous: previousWeek }, monthly: { current: currentMonth, previous: previousMonth } },
    insights,
  }
}
