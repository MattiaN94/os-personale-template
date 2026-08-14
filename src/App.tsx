import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowDownRight, Bell, CalendarDays, Check, ChevronRight, Download,
  BookOpenCheck, CircleAlert, Clock3, Database, ExternalLink, FileCheck2, FileLock2, FileText, Gauge, HeartPulse,
  Eye, EyeOff, History, Home, Landmark, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut,
  Menu, MoreHorizontal, Plus, RefreshCw, Repeat2, Search, Settings, ShieldCheck, Sparkles,
  TrendingUp, Upload, WalletCards, X,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import './App.css'
import { accessLogout, consumeUploadGrant, decideBatch, decideSource, getDashboard, getSession, liveMode, proposeOperations, runBackup, verifyBackup, verifyUploadGrant } from './lib/api'
import { downloadDecryptedDocument, uploadEncryptedDocument } from './lib/documents'
import { extractTextLocally } from './lib/extraction'
import { importHealthPackage } from './lib/healthImport'
import { connectGoogleCalendar, disconnectGoogleCalendar, syncGoogleCalendar } from './lib/calendar'
import { maskSensitiveText } from '../shared/sanitization'
import { proposalComparison } from '../shared/proposal-review'
import { europeRomeDateTime } from '../shared/time'
import { financialPositionSummary } from '../shared/analytics'
import { FinanceAdvanced, HealthAdvanced, HomeAdvanced, type BenefitOpportunity, type HealthMetricCatalog, type MonitorRun, type RegulatoryRule } from './modules/SpecialistModules'

type View = 'overview' | 'finance' | 'health' | 'home' | 'deadlines' | 'insights' | 'documents' | 'sources' | 'confirmations' | 'history' | 'settings'

interface Session { email: string }
interface Workspace { id: string; name: string }
interface Batch { id: string; source_label: string | null; risk_reason: string | null; created_at: string; state: string; operation_items?: Item[] }
interface Item {
  id: string
  kind: string
  title: string
  effective_date: string
  state: string
  payload?: Record<string, unknown>
  supersedes_item_id?: string | null
  previous?: { id: string; title: string; effective_date: string; payload: Record<string, unknown> } | null
}
interface Deadline { id: string; title: string; due_at: string; category: string; precision: string; remind_days_before: number[]; status: string }
interface Snapshot { id: string; observed_on: string; metric_key: string; amount: number; precision: string }
interface Investment { id: string; occurred_on: string; instrument_code: string; amount: number | null; state: string }
interface Measurement { id: string; measured_at: string; metric_key: string; value_numeric: number; unit: string; state: string }
interface CanonicalRecord { id: string; kind: string; title: string; effective_date: string; state: string; confidence: number; evidence_status?: string; supersedes_item_id?: string | null; payload: Record<string, unknown> }
interface DailyHealthMetric { id: string; observed_on: string; metric_key: string; source_label: string; unit: string; record_count: number | null; value_sum: number | null; value_avg: number | null; value_min: number | null; value_max: number | null; value_first: number | null; value_last: number | null }
interface SleepRow { id: string; observed_on: string; detected_hours: number | null; valid_hours: number | null; efficiency: number | null; core_minutes: number | null; deep_minutes: number | null; rem_minutes: number | null; awake_minutes: number | null; source_status: string | null }
interface WorkoutRow { id: string; observed_on: string; activity_type: string; duration_minutes: number | null; distance_km: number | null; energy_kcal: number | null; average_heart_rate: number | null; maximum_heart_rate: number | null; running_speed_kmh: number | null; source_label: string | null }
interface DocumentRow { id: string; title: string; document_type: string; document_date: string | null; sensitivity: string; state: string; created_at: string }
interface AuditRow { id: number; action: string; entity_type: string; occurred_at: string }
interface CalendarConnection { state: string; last_sync_at: string | null; error_code: string | null }
interface SourceRow { id: string; source_type: string; provider: string | null; label: string; coverage_start: string | null; coverage_end: string | null; source_date: string | null; reliability: string; state: string; expected_refresh_days?: number | null; last_reviewed_at?: string | null; created_at: string }
interface QualityIssue { id: string; severity: string; code: string; message: string; state: string; created_at: string }
interface ImportRow { id: string; source_name: string; source_type: string; state: string; expected_counts: Record<string, number>; actual_counts: Record<string, number>; imported_at: string }
interface SystemStatus { database: boolean; access: boolean; gpt: boolean; documents: boolean; backups: boolean; calendar: boolean; latest_backup: { id: string; state: string; completed_at: string | null; error_code: string | null; row_counts: Record<string, number> } | null }
interface BriefPriority { kind: string; title: string; detail: string; target_view: string; due_at?: string; severity: string }
interface DailyBrief { generated_for: string; priorities: BriefPriority[]; pending_confirmations: number; open_deadlines: number; monthly_commitments_eur: number; check_in_due: boolean }
interface DataHealthDomain { domain: string; status: string; score: number; last_update: string | null; record_count: number; verified_source_count: number; estimated_count: number; planned_count: number; next_action: string }
interface DataHealth { score: number; domains: DataHealthDomain[] }
interface PeriodStats { from: string; to: string; confirmed_records: number; investments_eur: number; income_eur: number; expenses_eur: number; workouts: number; sleep_days: number; average_sleep_hours: number | null; check_ins: number; deadlines_completed: number }
interface ReviewComparison { current: PeriodStats; previous: PeriodStats }
interface Insight { domain: string; title: string; summary: string; evidence: string[]; confidence: string; caveat: string }

interface DashboardState {
  pending: Batch[]
  deadlines: Deadline[]
  snapshots: Snapshot[]
  investments: Investment[]
  measurements: Measurement[]
  records: CanonicalRecord[]
  record_coverage: { returned: number; total: number; truncated: boolean; coverage_start: string | null; coverage_end: string | null }
  health_daily_metrics: DailyHealthMetric[]
  health_metric_catalog: HealthMetricCatalog[]
  sleep: SleepRow[]
  workouts: WorkoutRow[]
  documents: DocumentRow[]
  audit: AuditRow[]
  calendar: CalendarConnection | null
  sources: SourceRow[]
  quality_issues: QualityIssue[]
  imports: ImportRow[]
  brief: DailyBrief
  data_health: DataHealth
  reviews: { weekly: ReviewComparison; monthly: ReviewComparison }
  insights: Insight[]
  regulatory_rules: RegulatoryRule[]
  benefits: BenefitOpportunity[]
  monitors: MonitorRun[]
  system: SystemStatus
}

const emptySystem: SystemStatus = { database: false, access: false, gpt: false, documents: false, backups: false, calendar: false, latest_backup: null }
const emptyPeriod: PeriodStats = { from: '', to: '', confirmed_records: 0, investments_eur: 0, income_eur: 0, expenses_eur: 0, workouts: 0, sleep_days: 0, average_sleep_hours: null, check_ins: 0, deadlines_completed: 0 }
const emptyBrief: DailyBrief = { generated_for: '', priorities: [], pending_confirmations: 0, open_deadlines: 0, monthly_commitments_eur: 0, check_in_due: true }
const emptyState: DashboardState = { pending: [], deadlines: [], snapshots: [], investments: [], measurements: [], records: [], record_coverage: { returned: 0, total: 0, truncated: false, coverage_start: null, coverage_end: null }, health_daily_metrics: [], health_metric_catalog: [], sleep: [], workouts: [], documents: [], audit: [], calendar: null, sources: [], quality_issues: [], imports: [], brief: emptyBrief, data_health: { score: 0, domains: [] }, reviews: { weekly: { current: emptyPeriod, previous: emptyPeriod }, monthly: { current: emptyPeriod, previous: emptyPeriod } }, insights: [], regulatory_rules: [], benefits: [], monitors: [], system: emptySystem }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(liveMode)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!liveMode) return
    getSession()
      .then((result) => setSession({ email: result.email }))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'access_failed'))
      .finally(() => setLoading(false))
  }, [])

  if (!liveMode) return <LocalSetupRequired />
  if (loading) return <FullScreenLoader />
  if (error || !session) return <AccessFailure code={error || 'access_failed'} />
  if (window.location.pathname.startsWith('/upload')) return <ProtectedCloudflareUpload />
  return <Shell />
}

function LocalSetupRequired() {
  return <main className="auth-screen"><section className="auth-panel"><BrandMark/><div><p className="eyebrow">Ambiente locale</p><h1>API non avviata</h1><p className="auth-subtitle">Avvia il Worker locale e imposta VITE_LIVE_API=true. Nessun dato dimostrativo viene caricato.</p></div></section></main>
}

async function reconnectAccess() {
  const registrations = await window.navigator.serviceWorker?.getRegistrations().catch(() => []) ?? []
  await Promise.all(registrations.map((registration) => registration.unregister()))
  // Re-enter the protected origin so Access can negotiate the current login URL.
  window.location.replace(`${window.location.origin}/?reauth=${Date.now()}`)
}

function AccessFailure({ code }: { code: string }) {
  const sessionIssue = ['access_session_unavailable','access_session_expired','unauthorized','invalid_access_token','unexpected_api_response'].includes(code)
  const message = sessionIssue ? 'La sessione Cloudflare Access e scaduta o non e raggiungibile. Nessun dato e stato esposto.' : 'Cloudflare Access non ha convalidato questa sessione. Nessun dato e stato esposto.'
  return <main className="auth-screen"><section className="auth-panel" aria-labelledby="access-title"><BrandMark/><div><p className="eyebrow">Accesso chiuso</p><h1 id="access-title">Personal OS non disponibile</h1><p className="auth-subtitle">{message}</p></div><p className="form-error"><CircleAlert />{sessionIssue ? 'Sessione da rinnovare' : code}</p><button className="primary wide" onClick={reconnectAccess}><RefreshCw/> Accedi di nuovo</button></section></main>
}

function ProtectedCloudflareUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [extract, setExtract] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Link protetto pronto')
  const [complete, setComplete] = useState(false)
  const rawToken = window.location.hash.slice(1)

  const submit = async () => {
    if (!file || passphrase.length < 12 || !rawToken) return
    setBusy(true)
    try {
      setStatus('Verifica link monouso')
      const tokenHash = await hashText(rawToken)
      const grant = await verifyUploadGrant(tokenHash)
      // Extraction runs before the one-time link is consumed, and its failure
      // never blocks the archiving the link was issued for.
      const { excerpt, note } = extract ? await extractExcerpt(file, setStatus) : { excerpt: '', note: '' }
      setStatus('Consumo link monouso')
      await consumeUploadGrant(tokenHash)
      setStatus('Cifratura sul dispositivo')
      await uploadEncryptedDocument({ file, passphrase, workspaceId: grant.workspace_id, sensitivity: grant.intended_sensitivity, maskedExcerpt: excerpt.slice(0, 4000) })
      window.history.replaceState({}, '', '/upload-complete')
      setComplete(true)
      setStatus(`Documento cifrato e archiviato; fonte da verificare${note}`)
    } catch { setStatus('Link non valido, scaduto o gia utilizzato') }
    setBusy(false)
  }

  return <main className="auth-screen"><section className="auth-panel protected-upload" aria-labelledby="upload-title"><BrandMark/><div><p className="eyebrow">Caricamento protetto</p><h1 id="upload-title">Documento sensibile</h1><p className="auth-subtitle">Cifratura sul dispositivo; la passphrase non viene inviata.</p></div>{complete ? <div className="upload-complete"><FileCheck2/><strong>{status}</strong><a className="primary" href="/">Apri dashboard</a></div> : <><label className="file-picker"><Upload/><span>{file?.name ?? 'Seleziona PDF o immagine'}</span><input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/></label><label className="field"><span>Passphrase archivio</span><input type="password" autoComplete="off" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Minimo 12 caratteri"/></label><label className="check-row"><input type="checkbox" checked={extract} onChange={(event) => setExtract(event.target.checked)}/><span>Autorizza al GPT un estratto mascherato per 60 minuti</span></label><button className="primary wide" disabled={!file || passphrase.length < 12 || busy} onClick={submit}>{busy ? <LoaderCircle className="spin"/> : <FileLock2/>} Cifra e archivia</button><p className="protected-status">{status}</p></>}</section></main>
}

function Shell() {
  const requestedView = new URLSearchParams(window.location.search).get('view') as View | null
  const [view, setView] = useState<View>(requestedView && ['overview','finance','health','home','deadlines','insights','documents','sources','confirmations','history','settings'].includes(requestedView) ? requestedView : 'overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [data, setData] = useState<DashboardState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState('')
  const [toast, setToast] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [privacyMode, setPrivacyMode] = useState(() => window.localStorage.getItem('personal-os-privacy') === 'blurred')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getDashboard<DashboardState & { workspace: Workspace }>()
      setWorkspace(result.workspace)
      setData(result)
      setAccessError('')
    } catch (reason) {
      setAccessError(reason instanceof Error ? reason.message : 'access_failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [view])
  useEffect(() => { window.localStorage.setItem('personal-os-privacy', privacyMode ? 'blurred' : 'visible') }, [privacyMode])

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3000) }
  const nav = [
    ['overview', 'Oggi', LayoutDashboard], ['finance', 'Patrimonio', Landmark], ['health', 'Salute', HeartPulse],
    ['home', 'Casa e tutele', Home], ['deadlines', 'Scadenze', CalendarDays], ['insights', 'Insights', TrendingUp], ['documents', 'Documenti', FileLock2],
    ['sources', 'Fonti dati', Database], ['confirmations', 'Conferme', FileCheck2], ['history', 'Storico', History], ['settings', 'Impostazioni', Settings],
  ] as const

  if (accessError) return <AccessFailure code={accessError} />

  return (
    <div className={`app-shell ${privacyMode ? 'privacy-mode' : ''}`}>
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-head"><BrandMark compact /><button className="icon-button mobile-only" title="Chiudi menu" onClick={() => setMobileNav(false)}><X /></button></div>
        <nav>{nav.map(([key, label, Icon]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => { setView(key); setMobileNav(false) }}><Icon /><span>{label}</span>{key === 'confirmations' && data.pending.length > 0 && <b>{data.pending.length}</b>}</button>)}</nav>
        <div className="sidebar-foot"><div className="privacy-status"><ShieldCheck /><span><strong>Privato</strong><small>Cloudflare Access</small></span></div><button className="icon-button" title="Esci" onClick={accessLogout}><LogOut /></button></div>
      </aside>
      {mobileNav && <button className="scrim" aria-label="Chiudi menu" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-only" title="Apri menu" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="search-box"><Search /><input aria-label="Cerca" placeholder="Cerca nello storico" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />{searchQuery && <button title="Azzera ricerca" onClick={() => setSearchQuery('')}><X /></button>}</div>
          <div className="top-actions">
            <button className={`icon-button privacy-toggle ${privacyMode ? 'active' : ''}`} aria-pressed={privacyMode} title={privacyMode ? 'Mostra dati sensibili' : 'Offusca dati sensibili'} onClick={() => setPrivacyMode((current) => !current)}>{privacyMode ? <EyeOff /> : <Eye />}</button>
            <button className="icon-button" title="Aggiorna" onClick={refresh}><RefreshCw className={loading ? 'spin' : ''} /></button>
            <button className="icon-button" title="Notifiche" onClick={() => setView('deadlines')}><Bell /></button>
            <a className="gpt-button" title="Apri Personal OS in ChatGPT" href={import.meta.env.VITE_PERSONAL_OS_GPT_URL || 'https://chatgpt.com/g/YOUR-PRIVATE-GPT'} target="_blank" rel="noreferrer"><Sparkles /> <span>Apri Personal OS</span><ExternalLink /></a>
          </div>
        </header>

        <div className="content">
          {searchQuery.trim().length >= 2 ? <SearchResults query={searchQuery} data={data} onClose={() => setSearchQuery('')} /> : <>
          {view === 'overview' && <Overview data={data} setView={setView} />}
          {view === 'finance' && <Finance data={data} />}
          {view === 'health' && <Health data={data} workspace={workspace} onDone={() => { refresh(); notify('Check-in aggiornato') }} />}
          {view === 'home' && <HomeAndProtection data={data} workspace={workspace} onDone={() => { refresh(); notify('Registro casa aggiornato') }} />}
          {view === 'deadlines' && <Deadlines rows={data.deadlines} records={data.records} workspace={workspace} onDone={() => { refresh(); notify('Scadenze aggiornate') }} />}
          {view === 'insights' && <InsightsView data={data} />}
          {view === 'documents' && <Documents rows={data.documents} workspace={workspace} onDone={() => { refresh(); notify('Documento cifrato e archiviato') }} />}
          {view === 'sources' && <SourcesView rows={data.sources} issues={data.quality_issues} imports={data.imports} dataHealth={data.data_health} recordCoverage={data.record_coverage} onDone={() => { refresh(); notify('Registro fonti aggiornato') }} />}
          {view === 'confirmations' && <Confirmations rows={data.pending} onDone={() => { refresh(); notify('Coda aggiornata') }} />}
          {view === 'history' && <Audit rows={data.audit} />}
          {view === 'settings' && <SettingsView workspace={workspace} calendar={data.calendar} system={data.system} records={data.records} onDone={refresh} />}</>}
        </div>
      </main>
      {toast && <div className="toast"><Check />{toast}</div>}
    </div>
  )
}

function SearchResults({ query, data, onClose }: { query: string; data: DashboardState; onClose: () => void }) {
  const term = query.trim().toLocaleLowerCase('it-IT')
  const results = useMemo(() => [
    ...data.pending.flatMap((batch) => batch.operation_items ?? []).map((item) => ({ type: 'Proposta', title: item.title, meta: `${date(item.effective_date)} · ${stateLabel(item.state)}` })),
    ...data.deadlines.map((row) => ({ type: 'Scadenza', title: row.title, meta: `${date(row.due_at)} · ${row.category}` })),
    ...data.documents.map((row) => ({ type: 'Documento', title: row.title, meta: `${row.document_type} · ${sensitivityLabel(row.sensitivity)}` })),
    ...data.sources.map((row) => ({ type: 'Fonte', title: row.label, meta: `${sourceTypeLabel(row.source_type)} · ${sourceStateLabel(row.state)}` })),
    ...data.investments.map((row) => ({ type: 'Investimento', title: row.instrument_code, meta: `${date(row.occurred_on)} · ${row.amount ? money(row.amount) : 'Quantità registrata'}` })),
    ...data.measurements.map((row) => ({ type: 'Salute', title: healthLabel(row.metric_key), meta: `${date(row.measured_at)} · ${number(row.value_numeric)} ${row.unit}` })),
    ...data.records.filter((row) => !['investment','measurement','deadline','document'].includes(row.kind)).map((row) => ({ type: recordKindLabel(row.kind), title: row.title, meta: `${date(row.effective_date)} · ${text(row.payload.category, stateLabel(row.state))}` })),
  ].filter((row) => `${row.type} ${row.title} ${row.meta}`.toLocaleLowerCase('it-IT').includes(term)).slice(0, 50), [data, term])
  return <><PageHeading eyebrow="Ricerca locale minimizzata" title={`Risultati per “${query.trim()}”`} actions={<button className="secondary" onClick={onClose}><X /> Chiudi</button>} /><section className="section-block search-results">{results.map((row, index) => <div key={`${row.type}-${index}`}><span className="tag">{row.type}</span><span><strong>{row.title}</strong><small>{row.meta}</small></span></div>)}{!results.length && <Empty label="Nessun risultato nei dati caricati" />}</section></>
}

function Overview({ data, setView }: { data: DashboardState; setView: (view: View) => void }) {
  const openDeadlines = data.deadlines.filter((row) => row.status === 'open')
  const next = openDeadlines[0]
  const latestWeight = data.measurements.filter((m) => m.metric_key === 'body.weight').at(-1)
  const importedWeight = data.health_daily_metrics.find((row) => row.metric_key === 'body.weight')
  const importedWeightValue = importedWeight ? firstNumber(importedWeight.value_last, importedWeight.value_avg, importedWeight.value_sum) : null
  const useManualWeight = Boolean(latestWeight && (!importedWeight || latestWeight.measured_at.slice(0,10) >= importedWeight.observed_on))
  const visibleWeight = useManualWeight && latestWeight ? `${number(latestWeight.value_numeric)} ${latestWeight.unit}` : importedWeightValue == null ? 'Peso non disponibile' : `${number(importedWeightValue)} ${importedWeight?.unit}`
  const visibleWeightDate = useManualWeight && latestWeight ? latestWeight.measured_at : importedWeight?.observed_on
  const latestWorth = data.snapshots.filter((s) => s.metric_key === 'net_worth').at(-1)
  const currentPositions = financialPositionSummary(data.records)
  const latestPositionDate = currentPositions.positions.at(-1)?.effective_date
  const useDerivedWorth = currentPositions.positions.length > 0 && (!latestWorth || Boolean(latestPositionDate && latestPositionDate > latestWorth.observed_on))
  const visibleWorth = useDerivedWorth ? currentPositions.net : latestWorth?.amount ?? null
  const visibleWorthState = useDerivedWorth ? 'Derivato dalle posizioni' : latestWorth?.precision === 'estimated' ? 'Stimato' : latestWorth ? 'Confermato' : 'Dati mancanti'
  const currentYear = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Rome' }).format(new Date())
  const investmentsYtd = data.investments.filter((i) => i.state === 'confirmed' && i.occurred_on.startsWith(currentYear)).reduce((sum, i) => sum + Number(i.amount ?? 0), 0)
  const openView = (target: string) => {
    const allowed: View[] = ['overview','finance','health','home','deadlines','insights','documents','sources','confirmations','history','settings']
    if (allowed.includes(target as View)) setView(target as View)
  }
  return (
    <>
      <PageHeading eyebrow={new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' }).format(new Date())} title="Oggi" actions={<button className="primary" title="Rivedi le proposte da confermare" onClick={() => setView('confirmations')}><Check /> Rivedi conferme</button>} />
      <section className="metric-grid" aria-label="Riepilogo">
        <Metric label="Patrimonio netto" value={visibleWorth == null ? '—' : money(visibleWorth)} trend={visibleWorthState} icon={Landmark} tone="navy" />
        <Metric label="Capitale investito YTD" value={investmentsYtd ? money(investmentsYtd) : '—'} trend={`${data.investments.length} operazioni`} icon={WalletCards} tone="green" />
        <Metric label="Qualità dati" value={`${data.data_health.score}%`} trend={`${data.data_health.domains.filter((row) => row.status === 'complete').length}/${data.data_health.domains.length || 6} aree complete`} icon={Gauge} tone="navy" />
        <Metric label="Da confermare" value={String(data.brief.pending_confirmations)} trend={data.pending.length ? 'Richiede attenzione' : 'Tutto aggiornato'} icon={FileCheck2} tone="amber" />
      </section>
      <section className="dashboard-grid">
        <div className="section-block brief-block">
          <SectionTitle title="Brief operativo" meta="Massimo tre priorità" />
          <div className="brief-list">
            {data.brief.priorities.map((item, index) => <button key={`${item.kind}-${index}`} onClick={() => openView(item.target_view)}><span className={`priority-index ${item.severity}`}>{index + 1}</span><span><strong>{item.title}</strong><small>{item.detail}{item.due_at ? ` · ${date(String(item.due_at))}` : ''}</small></span><ChevronRight/></button>)}
            {!data.brief.priorities.length && <Empty label="Nessuna priorità urgente" />}
          </div>
        </div>
        <div className="section-block next-block">
          <SectionTitle title="Prossima scadenza" action={<button className="text-button" onClick={() => setView('deadlines')}>Tutte <ChevronRight /></button>} />
          {next ? <div className="next-deadline"><div className="calendar-tile"><strong>{datePart(next.due_at, 'day')}</strong><span>{datePart(next.due_at, 'month')}</span></div><div><span className="tag">{next.category}</span><h3>{next.title}</h3><p>{date(next.due_at)} · {next.precision === 'exact' ? 'Data confermata' : 'Data derivata'}</p></div></div> : <Empty label="Nessuna scadenza programmata" />}
        </div>
      </section>
      <section className="section-block">
        <SectionTitle title="Copertura e freschezza" meta={`Indice complessivo ${data.data_health.score}%`} action={<button className="text-button" onClick={() => setView('sources')}>Controlla <ChevronRight/></button>} />
        <div className="data-health-grid">
          {data.data_health.domains.map((row) => <button key={row.domain} onClick={() => openView(row.domain === 'profile' ? 'settings' : row.domain === 'documents' ? 'documents' : row.domain)}><span className={`health-score ${row.status}`}>{row.score}</span><span><strong>{domainLabel(row.domain)}</strong><small>{row.status === 'complete' ? `Aggiornato ${row.last_update ? date(row.last_update) : 'oggi'}` : row.next_action}</small></span></button>)}
        </div>
      </section>
      <section className="dashboard-grid">
        <div className="section-block chart-block"><SectionTitle title="Andamento patrimonio" meta="Solo rilevamenti confermati"/><WorthChart rows={data.snapshots}/></div>
        <div className="section-block"><SectionTitle title="Stato personale" meta="Dati recenti"/><div className="compact-status"><span><HeartPulse/><b>{visibleWeight}</b><small>{visibleWeightDate ? date(visibleWeightDate) : 'Registra o importa una misura'}</small></span><span><Repeat2/><b>{data.brief.check_in_due ? 'Check-in da fare' : 'Check-in completato'}</b><small>{data.brief.check_in_due ? 'Facoltativo, richiede meno di un minuto' : 'Dato soggettivo registrato oggi'}</small></span><span><WalletCards/><b>{money(data.brief.monthly_commitments_eur)}</b><small>Impegni mensili normalizzati</small></span></div></div>
      </section>
    </>
  )
}

function Finance({ data }: { data: DashboardState }) {
  return <><PageHeading eyebrow="Finanze e pianificazione" title="Patrimonio"/><FinanceAdvanced records={data.records} snapshots={data.snapshots} investments={data.investments}/></>
}

function Health({ data, workspace, onDone }: { data: DashboardState; workspace: Workspace | null; onDone: () => void }) {
  return <><PageHeading eyebrow="Dati personali e nutrizione" title="Salute"/><HealthCheckIn records={data.records} workspace={workspace} onDone={onDone}/><HealthAdvanced records={data.records} measurements={data.measurements} daily={data.health_daily_metrics} catalog={data.health_metric_catalog} sleep={data.sleep} workouts={data.workouts}/></>
}

function HealthCheckIn({ records, workspace, onDone }: { records: CanonicalRecord[]; workspace: Workspace | null; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [energy, setEnergy] = useState(3)
  const [mood, setMood] = useState(3)
  const [stress, setStress] = useState(3)
  const [symptoms, setSymptoms] = useState('')
  const [busy, setBusy] = useState(false)
  const recent = records.filter((row) => text(row.payload.category, '') === 'check_in').slice().reverse().slice(0, 10)
  const save = async () => {
    if (!workspace) return
    setBusy(true)
    try {
      await commitOwnerOperation(workspace.id, { kind: 'fact', effective_date: localIsoDate(), title: 'Check-in quotidiano', confidence: 1, evidence_status: 'declared', payload: { category: 'check_in', key: `check_in.${localIsoDate().replaceAll('-', '.')}`, value: 'Check-in soggettivo', sensitivity: 'health', details: { energy, mood, stress, symptoms: symptoms.trim() } } }, 'Check-in PWA')
      setOpen(false); setSymptoms(''); onDone()
    } finally { setBusy(false) }
  }
  return <section className="section-block checkin-block"><SectionTitle title="Check-in facoltativo" meta="Percezione soggettiva, separata dai sensori" action={<button className="text-button" onClick={() => setOpen(!open)}>{open ? 'Chiudi' : 'Registra'} <ChevronRight/></button>}/>{open && <div className="checkin-form"><ScoreInput label="Energia" value={energy} onChange={setEnergy}/><ScoreInput label="Umore" value={mood} onChange={setMood}/><ScoreInput label="Stress" value={stress} onChange={setStress}/><label className="field"><span>Sintomi o nota breve</span><input value={symptoms} onChange={(event) => setSymptoms(event.target.value)} maxLength={500} placeholder="Facoltativo"/></label><button className="primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin"/> : <Check/>} Registra</button></div>}{!open && <DataTable headers={['Data','Energia','Umore','Stress','Stato']} rows={recent.map((row) => [date(row.effective_date), detail(row,'energy'), detail(row,'mood'), detail(row,'stress'), evidenceLabel(row.evidence_status, row.state)])}/>}</section>
}

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="field score-field"><span>{label}: {value}/5</span><input type="range" min="1" max="5" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))}/></label> }

function HomeAndProtection({ data, workspace, onDone }: { data: DashboardState; workspace: Workspace | null; onDone: () => void }) {
  return <><PageHeading eyebrow="Casa, mobilita e agevolazioni" title="Casa e tutele"/><HomeAdvanced records={data.records} rules={data.regulatory_rules} benefits={data.benefits} monitors={data.monitors}/><HomeRegistryForm workspace={workspace} rules={data.regulatory_rules} onDone={onDone}/></>
}

function HomeRegistryForm({ workspace, rules = [], onDone }: { workspace: Workspace | null; rules?: RegulatoryRule[]; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'maintenance'|'warranty'|'mobility'>('maintenance')
  const [title, setTitle] = useState('')
  const [asset, setAsset] = useState('')
  const [provider, setProvider] = useState('')
  const [dateValue, setDateValue] = useState(localIsoDate())
  const [nextDate, setNextDate] = useState('')
  const [ruleKey, setRuleKey] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!workspace || !title.trim() || !dateValue) return
    setBusy(true)
    try {
      const operation = type === 'maintenance'
        ? { kind: 'event', effective_date: dateValue, title: title.trim(), confidence: 1, evidence_status: 'declared', payload: { category: 'maintenance', started_at: europeRomeDateTime(dateValue, 12), precision: 'day', status: 'completed', details: { asset: asset.trim(), provider: provider.trim(), next_due_on: nextDate, rule_key: ruleKey, domain: ruleKey.startsWith('vehicle.') ? 'Auto' : 'Casa' } } }
        : { kind: 'fact', effective_date: dateValue, title: title.trim(), confidence: 1, evidence_status: 'declared', payload: { category: type, key: `${type}.${Date.now()}`, value: title.trim(), sensitivity: type === 'mobility' ? 'financial' : 'personal', details: { asset: asset.trim(), provider: provider.trim(), expires_on: nextDate, status: 'active' } } }
      await commitOwnerOperation(workspace.id, operation, `Registro ${type} dalla PWA`)
      setOpen(false); setTitle(''); setAsset(''); setProvider(''); setNextDate(''); setRuleKey(''); onDone()
    } finally { setBusy(false) }
  }
  const selectedRule = rules.find((rule) => rule.rule_key === ruleKey)
  return <section className="section-block registry-block"><SectionTitle title="Registro casa e mobilità" meta="Manutenzioni, garanzie e veicoli" action={<button className="text-button" onClick={() => setOpen(!open)}>{open ? 'Chiudi' : 'Aggiungi'} <ChevronRight/></button>}/>{open && <div className="registry-form"><label className="field"><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="maintenance">Manutenzione</option><option value="warranty">Garanzia</option><option value="mobility">Mobilità</option></select></label><label className="field grow"><span>Voce</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200}/></label><label className="field"><span>Bene o veicolo</span><input value={asset} onChange={(event) => setAsset(event.target.value)} maxLength={200}/></label><label className="field"><span>Fornitore</span><input value={provider} onChange={(event) => setProvider(event.target.value)} maxLength={200}/></label><label className="field"><span>Data</span><input type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)}/></label>{type === 'maintenance' && <label className="field"><span>Regola collegata</span><select value={ruleKey} onChange={(event) => setRuleKey(event.target.value)}><option value="">Nessuna regola automatica</option>{rules.map((rule) => <option key={rule.id} value={rule.rule_key}>{rule.title}</option>)}</select></label>}<label className="field"><span>{type === 'maintenance' ? 'Prossimo controllo' : 'Scadenza'}</span><input type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)}/></label>{selectedRule && <div className="rule-preview"><ShieldCheck/><span><strong>{selectedRule.title}</strong><small>{selectedRule.rule_type === 'legal' ? 'Obbligo legale' : selectedRule.rule_type === 'manufacturer' ? 'Intervallo da fonte del costruttore' : 'Controllo consigliato'}; verificato il {date(selectedRule.last_verified_at)}</small></span><a className="icon-button" title="Apri fonte ufficiale" href={selectedRule.source_url} target="_blank" rel="noreferrer"><ExternalLink/></a></div>}<button className="primary" disabled={busy || !title.trim()} onClick={save}>{busy ? <LoaderCircle className="spin"/> : <Check/>} Registra</button></div>}</section>
}

function InsightsView({ data }: { data: DashboardState }) {
  const timeline = data.records.slice().sort((a,b) => b.effective_date.localeCompare(a.effective_date)).slice(0,60)
  return <><PageHeading eyebrow="Evidenze e revisioni" title="Insights"/><section className="metric-grid"><Metric label="Qualità complessiva" value={`${data.data_health.score}%`} trend="Copertura delle aree operative" icon={Gauge} tone="navy"/><Metric label="Allenamenti 7 giorni" value={String(data.reviews.weekly.current.workouts)} trend={`${data.reviews.weekly.previous.workouts} nella settimana precedente`} icon={Activity} tone="green"/><Metric label="Sonno medio 7 giorni" value={data.reviews.weekly.current.average_sleep_hours == null ? '—' : `${number(data.reviews.weekly.current.average_sleep_hours)} h`} trend={`${data.reviews.weekly.current.sleep_days} notti disponibili`} icon={HeartPulse} tone="red"/><Metric label="Investito nel mese" value={money(data.reviews.monthly.current.investments_eur)} trend={`${money(data.reviews.monthly.previous.investments_eur)} nel mese precedente`} icon={WalletCards} tone="amber"/></section><section className="section-block"><SectionTitle title="Osservazioni fondate sui dati" meta="Con fonti, periodo e limiti espliciti"/><div className="insight-list">{data.insights.map((row,index) => <article key={`${row.domain}-${index}`}><span className="tag">{domainLabel(row.domain)}</span><div><h3>{row.title}</h3><p>{row.summary}</p><small>Base: {row.evidence.join(' · ')}</small><small>{row.caveat}</small></div><span className={`confidence ${row.confidence}`}>{confidenceLabel(row.confidence)}</span></article>)}{!data.insights.length && <Empty label="Servono più dati verificati per produrre confronti utili"/>}</div></section><section className="dashboard-grid"><ReviewBlock title="Revisione settimanale" review={data.reviews.weekly}/><ReviewBlock title="Revisione mensile" review={data.reviews.monthly}/></section><section className="section-block"><SectionTitle title="Timeline trasversale" meta={`${timeline.length} eventi recenti`}/><DataTable headers={['Data','Area','Titolo','Categoria','Stato del dato']} rows={timeline.map((row) => [date(row.effective_date), recordKindLabel(row.kind), row.title, text(row.payload.category), evidenceLabel(row.evidence_status,row.state)])}/>{!timeline.length && <Empty label="Nessun evento canonico disponibile"/>}</section></>
}

function ReviewBlock({ title, review }: { title: string; review: ReviewComparison }) { return <div className="section-block"><SectionTitle title={title} meta={`${date(review.current.from)} - ${date(review.current.to)}`}/><div className="review-stats"><ReviewStat label="Record" current={review.current.confirmed_records} previous={review.previous.confirmed_records}/><ReviewStat label="Investimenti" current={review.current.investments_eur} previous={review.previous.investments_eur} moneyValue/><ReviewStat label="Spese" current={review.current.expenses_eur} previous={review.previous.expenses_eur} moneyValue/><ReviewStat label="Allenamenti" current={review.current.workouts} previous={review.previous.workouts}/><ReviewStat label="Check-in" current={review.current.check_ins} previous={review.previous.check_ins}/><ReviewStat label="Scadenze chiuse" current={review.current.deadlines_completed} previous={review.previous.deadlines_completed}/></div></div> }
function ReviewStat({ label, current, previous, moneyValue = false }: { label: string; current: number; previous: number; moneyValue?: boolean }) { return <span><small>{label}</small><b>{moneyValue ? money(current) : number(current)}</b><em>prima {moneyValue ? money(previous) : number(previous)}</em></span> }

function Deadlines({ rows, records, workspace, onDone }: { rows: Deadline[]; records: CanonicalRecord[]; workspace: Workspace | null; onDone: () => void }) {
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'upcoming' | 'completed' | 'all'>('upcoming')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Personale')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState<string | boolean>(false)
  const save = async () => {
    if (!workspace || !title.trim() || !dueAt) return
    setBusy(true)
    const effectiveDate = dueAt.slice(0,10)
    try {
      const proposal = await proposeOperations({
      workspace_id: workspace.id, idempotency_key: `pwa-deadline-${crypto.randomUUID()}`,
      source: 'direct_user_statement', source_label: 'Inserimento PWA',
      operations: [{ kind: 'deadline', effective_date: effectiveDate, title: title.trim(), confidence: 1, payload: { due_at: europeRomeDateTime(effectiveDate, Number(dueAt.slice(11,13)), Number(dueAt.slice(14,16))), category, precision: 'exact', remind_days_before: [30,7,1], status: 'open' } }],
      })
      await decideBatch(proposal.batch_id, 'confirm')
      setAdding(false); setTitle(''); setDueAt(''); onDone()
    } finally { setBusy(false) }
  }
  const complete = async (row: Deadline) => {
    if (!workspace || row.status !== 'open') return
    setBusy(row.id)
    try {
      const proposal = await proposeOperations({
        workspace_id: workspace.id, idempotency_key: `pwa-deadline-complete-${row.id}-${crypto.randomUUID()}`,
        source: 'direct_user_statement', source_label: 'Scadenza completata nella PWA',
        operations: [{ kind: 'deadline', effective_date: row.due_at.slice(0,10), title: row.title, confidence: 1, supersedes_item_id: row.id, payload: { due_at: row.due_at, category: row.category, precision: row.precision, remind_days_before: row.remind_days_before, status: 'completed' } }],
      })
      await decideBatch(proposal.batch_id, 'confirm'); onDone()
    } finally { setBusy(false) }
  }
  const filtered = rows.filter((row) => filter === 'all' || (filter === 'completed' ? row.status === 'completed' : row.status === 'open'))
  const events = records.filter((row) => ['event','appointment'].includes(row.kind)).slice().reverse()
  return <><PageHeading eyebrow="Calendario operativo" title="Scadenze" actions={<button className="primary" onClick={() => setAdding(!adding)}><Plus /> Nuova scadenza</button>} />{adding && <section className="quick-form"><label className="field"><span>Attività</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200}/></label><label className="field"><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80}/></label><label className="field"><span>Data e ora</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)}/></label><button className="secondary" onClick={() => setAdding(false)}><X /> Annulla</button><button className="primary" disabled={Boolean(busy) || !title.trim() || !dueAt} onClick={save}>{busy === true ? <LoaderCircle className="spin"/> : <Check/>} Registra</button></section>}<div className="filter-row" role="group" aria-label="Filtra scadenze"><button className={`segment ${filter === 'upcoming' ? 'active' : ''}`} aria-pressed={filter === 'upcoming'} onClick={() => setFilter('upcoming')}>Prossime</button><button className={`segment ${filter === 'completed' ? 'active' : ''}`} aria-pressed={filter === 'completed'} onClick={() => setFilter('completed')}>Completate</button><button className={`segment ${filter === 'all' ? 'active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tutte</button></div><section className="section-block"><div className="table-wrap"><table><thead><tr><th>Quando</th><th>Categoria</th><th>Attività</th><th>Affidabilità</th><th>Stato</th><th><span className="sr-only">Azioni</span></th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td>{dateTime(row.due_at)}</td><td>{row.category}</td><td>{row.title}</td><td>{precisionLabel(row.precision)}</td><td>{deadlineStatusLabel(row.status)}</td><td>{row.status === 'open' && <button className="icon-button" title={`Segna completata: ${row.title}`} disabled={busy === row.id} onClick={() => complete(row)}>{busy === row.id ? <LoaderCircle className="spin"/> : <Check/>}</button>}</td></tr>)}</tbody></table></div>{!filtered.length && <Empty label="Nessuna scadenza in questa vista" />}</section><section className="section-block"><SectionTitle title="Eventi e appuntamenti" meta={`${events.length} elementi`}/><DataTable headers={['Data','Tipo','Titolo','Categoria','Stato']} rows={events.slice(0,50).map((row) => [dateTime(text(row.payload.started_at ?? row.payload.occurred_at, row.effective_date)), recordKindLabel(row.kind), row.title, text(row.payload.category), text(row.payload.status)])}/>{!events.length && <Empty label="Nessun evento o appuntamento confermato"/>}</section></>
}

function Documents({ rows, workspace, onDone }: { rows: DocumentRow[]; workspace: Workspace | null; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [documentType, setDocumentType] = useState('auto')
  const [sensitivity, setSensitivity] = useState<'normal' | 'personal' | 'financial' | 'health' | 'identity' | 'highly_restricted'>('personal')
  const [extract, setExtract] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<DocumentRow | null>(null)
  const [downloadPassphrase, setDownloadPassphrase] = useState('')
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [status, setStatus] = useState('')
  const upload = async () => {
    if (!file || !workspace || passphrase.length < 12) return
    setBusy(true); setStatus('Estrazione locale')
    try {
      // A failed excerpt must never discard the document: archiving is the
      // canonical action, the masked excerpt is an optional convenience.
      const { excerpt, note } = extract ? await extractExcerpt(file, setStatus) : { excerpt: '', note: '' }
      setStatus('Cifratura sul dispositivo')
      await uploadEncryptedDocument({ file, passphrase, workspaceId: workspace.id, documentType: documentType === 'auto' ? undefined : documentType, sensitivity, maskedExcerpt: excerpt.slice(0, 4000) })
      setFile(null); setPassphrase(''); setDocumentType('auto'); setSensitivity('personal'); setStatus(`Documento cifrato archiviato; fonte da verificare${note}`); onDone()
    } catch { setStatus('Caricamento non completato') }
    setBusy(false)
  }
  const download = async () => {
    if (!selected || downloadPassphrase.length < 12) return
    setDownloadBusy(true); setStatus('Verifica e decifratura sul dispositivo')
    try {
      await downloadDecryptedDocument(selected.id, selected.title, downloadPassphrase)
      setStatus('Documento verificato e scaricato'); setSelected(null); setDownloadPassphrase('')
    } catch { setStatus('Passphrase errata o integrita del documento non verificata') }
    setDownloadBusy(false)
  }
  return <><PageHeading eyebrow="Archivio cifrato" title="Documenti" /><section className="upload-band"><div className="upload-icon"><Upload /></div><label className="file-picker"><span>{file?.name ?? 'Seleziona PDF o immagine'}</span><input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label className="field compact"><span>Passphrase archivio</span><input type="password" autoComplete="off" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Minimo 12 caratteri" /></label><label className="field compact"><span>Tipo</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="auto">Rileva dal nome</option><option value="bank_statement">Estratto conto</option><option value="investment_statement">Rendiconto investimenti</option><option value="loan_statement">Mutuo o prestito</option><option value="utility_bill">Bolletta</option><option value="insurance_policy">Polizza</option><option value="medical_report">Referto medico</option><option value="lab_report">Esame di laboratorio</option><option value="tax_document">Documento fiscale</option><option value="receipt">Ricevuta</option><option value="document">Altro documento</option></select></label><label className="field compact"><span>Riservatezza</span><select value={sensitivity} onChange={(event) => setSensitivity(event.target.value as typeof sensitivity)}><option value="personal">Personale</option><option value="financial">Finanziario</option><option value="health">Salute</option><option value="identity">Identità</option><option value="highly_restricted">Molto riservato</option><option value="normal">Normale</option></select></label><label className="check-row"><input type="checkbox" checked={extract} onChange={(event) => setExtract(event.target.checked)} /><span>Autorizza al GPT un estratto mascherato per 60 minuti</span></label><button className="primary" disabled={!file || passphrase.length < 12 || busy} onClick={upload}>{busy ? <LoaderCircle className="spin" /> : <FileLock2 />} Cifra e archivia</button>{status && <small>{status}</small>}</section>{selected && <section className="download-band"><div><strong>{selected.title}</strong><small>Il contenuto resta in memoria soltanto durante la decifratura.</small></div><label className="field compact"><span>Passphrase archivio</span><input type="password" autoComplete="off" value={downloadPassphrase} onChange={(event) => setDownloadPassphrase(event.target.value)} placeholder="Passphrase del documento" /></label><button className="secondary" onClick={() => { setSelected(null); setDownloadPassphrase('') }}><X/> Annulla</button><button className="primary" disabled={downloadBusy || downloadPassphrase.length < 12} onClick={download}>{downloadBusy ? <LoaderCircle className="spin"/> : <Download/>} Decifra e scarica</button></section>}<section className="section-block"><SectionTitle title="Archivio" meta={`${rows.length} documenti`} /><div className="table-wrap"><table><thead><tr><th>Data</th><th>Titolo</th><th>Tipo</th><th>Riservatezza</th><th>Stato</th><th><span className="sr-only">Azioni</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.document_date ? date(row.document_date) : date(row.created_at)}</td><td>{row.title}</td><td>{documentTypeLabel(row.document_type)}</td><td>{sensitivityLabel(row.sensitivity)}</td><td>{stateLabel(row.state)}</td><td><button className="icon-button" title={`Scarica ${row.title}`} disabled={row.state !== 'confirmed'} onClick={() => { setSelected(row); setStatus(''); setDownloadPassphrase('') }}><Download/></button></td></tr>)}</tbody></table></div>{!rows.length && <Empty label="Nessun documento archiviato" />}</section></>
}

function SourcesBase({ rows, issues, imports, onDone }: { rows: SourceRow[]; issues: QualityIssue[]; imports: ImportRow[]; onDone: () => void }) {
  const [busy, setBusy] = useState('')
  const pending = rows.filter((row) => row.state === 'pending_review')
  const decide = async (id: string, decision: 'verified' | 'rejected') => {
    setBusy(id)
    try { await decideSource(id, decision, decision === 'rejected' ? 'Fonte rifiutata dalla PWA' : 'Fonte verificata dal proprietario'); onDone() }
    finally { setBusy('') }
  }
  return <><PageHeading eyebrow="Provenienza e qualità" title="Fonti dati" /><section className="metric-grid three"><Metric label="Fonti verificate" value={String(rows.filter((row) => row.state === 'verified').length)} trend="Utilizzabili come riferimento" icon={ShieldCheck} tone="green"/><Metric label="Da verificare" value={String(pending.length)} trend="Non ancora canoniche" icon={FileCheck2} tone="amber"/><Metric label="Problemi aperti" value={String(issues.length)} trend="Controlli di coerenza" icon={CircleAlert} tone="red"/></section>{issues.length > 0 && <section className="section-block"><SectionTitle title="Attenzioni sui dati" meta="Da risolvere prima dell'uso"/><DataTable headers={['Livello','Codice','Descrizione','Data']} rows={issues.map((row) => [row.severity, row.code, row.message, date(row.created_at)])}/></section>}<section className="section-block source-guide"><SectionTitle title="Ordine di affidabilità" meta="La fonte primaria prevale su stime e ricordi"/><div className="source-priority"><span><b>1</b><strong>Portale o export ufficiale</strong><small>Valore esatto e data di competenza</small></span><span><b>2</b><strong>Documento dell'istituzione</strong><small>Estratto, referto, polizza o fattura</small></span><span><b>3</b><strong>Dichiarazione esplicita</strong><small>Confermata da te nella PWA</small></span><span><b>4</b><strong>Calcolo o stima</strong><small>Sempre marcato e mai confuso con un dato esatto</small></span></div></section><section className="review-list">{pending.map((row) => <article className="review-card" key={row.id}><header><span className="tag">{sourceTypeLabel(row.source_type)}</span><time>{relative(row.created_at)}</time></header><div className="review-change"><div><small>{reliabilityLabel(row.reliability)}</small><h3>{row.label}</h3><p>{row.provider || 'Fornitore non indicato'}{row.source_date ? ` · ${date(row.source_date)}` : ''}</p></div><Database/></div><p className="risk-note"><CircleAlert/>Apri e controlla contenuto, intestatario e periodo prima di rendere questa fonte utilizzabile.</p><footer><button className="secondary" disabled={busy === row.id} onClick={() => decide(row.id,'rejected')}><X/> Rifiuta</button><button className="primary" disabled={busy === row.id} onClick={() => decide(row.id,'verified')}>{busy === row.id ? <LoaderCircle className="spin"/> : <Check/>} Verifica</button></footer></article>)}{!pending.length && <Empty label="Nessuna fonte in attesa di verifica"/>}</section><section className="section-block"><SectionTitle title="Registro fonti" meta={`${rows.length} fonti · ${imports.length} import`}/><DataTable headers={['Data','Fonte','Tipo','Affidabilità','Stato']} rows={rows.map((row) => [date(row.source_date || row.created_at), row.label, sourceTypeLabel(row.source_type), reliabilityLabel(row.reliability), sourceStateLabel(row.state)])}/>{!rows.length && <Empty label="Nessuna fonte reale ancora registrata"/>}</section></>
}

function SourcesView({ rows, issues, imports, dataHealth, recordCoverage, onDone }: { rows: SourceRow[]; issues: QualityIssue[]; imports: ImportRow[]; dataHealth: DataHealth; recordCoverage: DashboardState['record_coverage']; onDone: () => void }) {
  return <><SourcesBase rows={rows} issues={issues} imports={imports} onDone={onDone}/>{recordCoverage.truncated&&<section className="section-block warning-block"><SectionTitle title="Vista parziale" meta={`${recordCoverage.returned}/${recordCoverage.total} record caricati`}/><p>Le dashboard mostrano i record canonici più recenti. Esporta o interroga un periodo specifico prima di analizzare l'intero storico.</p></section>}<section className="section-block"><SectionTitle title="Copertura per area" meta={`Indice ${dataHealth.score}%`}/><DataTable headers={['Area','Copertura','Ultimo aggiornamento','Record','Fonti verificate','Stime','Prossima azione']} rows={dataHealth.domains.map((row) => [domainLabel(row.domain), dataHealthLabel(row.status), row.last_update ? date(row.last_update) : '—', String(row.record_count), String(row.verified_source_count), String(row.estimated_count), row.next_action])}/></section><section className="section-block"><SectionTitle title="Stato probatorio dei dati" meta="Separato dallo stato della versione"/><div className="evidence-legend"><span><b>Verificato</b><small>Fonte primaria o documento istituzionale controllato</small></span><span><b>Dichiarato</b><small>Informazione esplicita confermata dal proprietario</small></span><span><b>Stimato</b><small>Calcolo o proxy ancora da sostituire</small></span><span><b>Pianificato</b><small>Scadenza o evento futuro</small></span><span><b>Superato</b><small>Versione storica preservata dopo una correzione</small></span></div></section></>
}

function Confirmations({ rows, onDone }: { rows: Batch[]; onDone: () => void }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const decide = async (id: string, decision: 'confirm' | 'reject') => {
    setBusy(id); setError('')
    try {
      await decideBatch(id, decision, decision === 'reject' ? 'Rifiutato dalla PWA' : undefined)
      onDone()
    } catch {
      setError('Operazione non completata. Ricarica i dati e controlla che la fonte sia stata verificata.')
    } finally { setBusy('') }
  }
  return <><PageHeading eyebrow="Controllo umano" title="Conferme" />{error && <p className="form-error confirmation-error"><CircleAlert />{error}</p>}<section className="review-list confirmation-list">{rows.map((batch) => <article className="review-card confirmation-card" key={batch.id}><header><span className="tag">{recordKindLabel(batch.operation_items?.[0]?.kind ?? 'fact')}</span><time>{relative(batch.created_at)}</time></header><p className="review-source">Fonte: <strong>{batch.source_label || 'Input diretto'}</strong></p>{batch.operation_items?.map((item) => <ProposalReview key={item.id} item={item} />)}<p className="risk-note"><CircleAlert />{batch.risk_reason ?? 'Verifica richiesta prima della registrazione'}</p><footer><button className="secondary" onClick={() => decide(batch.id,'reject')} disabled={busy === batch.id}><X /> Rifiuta</button><button className="primary" onClick={() => decide(batch.id,'confirm')} disabled={busy === batch.id}>{busy === batch.id ? <LoaderCircle className="spin" /> : <Check />} Conferma</button></footer></article>)}{!rows.length && <Empty label="Nessuna proposta in attesa" />}</section></>
}

function ProposalReview({ item }: { item: Item }) {
  const proposed = item.payload ?? {}
  const previous = item.previous?.payload
  const fields = proposalComparison(proposed, previous)
  return <section className="proposal-review">
    <div className="proposal-heading"><div><small>{previous ? 'Correzione proposta' : 'Nuovo dato proposto'}</small><h3>{item.title}</h3><p>{date(item.effective_date)}{item.previous ? ` · versione precedente del ${date(item.previous.effective_date)}` : ''}</p></div>{previous ? <RefreshCw /> : <ArrowDownRight />}</div>
    <div className={`proposal-values ${previous ? 'with-before' : ''}`}>
      {previous && <div className="proposal-version before"><strong>Prima</strong>{fields.map((field) => <ProposalField key={`before-${field.key}`} name={field.key} value={field.before} changed={field.changed} />)}</div>}
      <div className="proposal-version after"><strong>{previous ? 'Dopo' : 'Valori da registrare'}</strong>{fields.map((field) => <ProposalField key={`after-${field.key}`} name={field.key} value={field.after} changed={Boolean(previous) && field.changed} />)}</div>
    </div>
  </section>
}

function ProposalField({ name, value, changed }: { name: string; value: unknown; changed: boolean }) {
  return <div className={changed ? 'changed' : ''}><span>{proposalFieldLabel(name)}</span><b>{proposalValue(name, value)}</b></div>
}

function Audit({ rows }: { rows: AuditRow[] }) { return <><PageHeading eyebrow="Audit append-only" title="Storico" /><section className="section-block"><DataTable headers={['Quando','Azione','Entità','ID']} rows={rows.map((row) => [dateTime(row.occurred_at), auditLabel(row.action), row.entity_type, `#${row.id}`])}/>{!rows.length && <Empty label="Nessun evento registrato" />}</section></> }

function SettingsBase({ workspace, calendar, system, onDone }: { workspace: Workspace | null; calendar: CalendarConnection | null; system: SystemStatus; onDone: () => void }) {
  const [status, setStatus] = useState('')
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const importHealth = async (file: File) => {
    if (!workspace) return
    try {
      const result = await importHealthPackage(file, workspace.id, setStatus)
      const excluded = result.excludedWeights ? `; ${result.excludedWeights} pesi manuali o stimati esclusi` : ''
      setStatus(result.replay ? 'Export già presente: nessun duplicato creato' : `Export caricato in revisione; i dati non sono ancora canonici${excluded}`)
    } catch { setStatus('Import non completato: pacchetto o sessione non validi') }
  }
  const calendarAction = async (action: 'connect' | 'sync' | 'disconnect') => {
    if (!workspace) return
    setCalendarBusy(true); setStatus('')
    try {
      if (action === 'connect') { await connectGoogleCalendar(workspace.id); return }
      if (action === 'sync') { const result = await syncGoogleCalendar(workspace.id); setStatus(`${result.synchronized} scadenze sincronizzate`) }
      else { await disconnectGoogleCalendar(workspace.id); setStatus('Google Calendar scollegato') }
      onDone()
    } catch { setStatus('Operazione calendario non completata') }
    setCalendarBusy(false)
  }
  const backupAction = async (action: 'run' | 'verify') => {
    if (!system.backups) return
    setBackupBusy(true); setStatus('')
    try {
      if (action === 'run') {
        const result = await runBackup()
        setStatus(`Backup cifrato completato: ${result.backup_id}`)
      } else if (system.latest_backup) {
        const result = await verifyBackup(system.latest_backup.id)
        setStatus(`Backup decifrato e verificato: ${result.table_count} tabelle coerenti`)
      }
      await onDone()
    } catch { setStatus('Controllo backup non completato') }
    setBackupBusy(false)
  }
  const connected = calendar?.state === 'connected'
  return <><PageHeading eyebrow="Account e privacy" title="Impostazioni" /><section className="settings-list"><Setting icon={ShieldCheck} title="Autenticazione" value="Cloudflare Access con MFA" status={system.access ? 'ok' : 'warn'}/><Setting icon={Database} title="Database D1" value="Archivio canonico con versioni e audit" status={system.database ? 'ok' : 'warn'}/><Setting icon={LockKeyhole} title="Archivio documenti" value="Cifratura AES-256-GCM sul dispositivo e R2 privato" status={system.documents ? 'ok' : 'warn'}/><Setting icon={Sparkles} title="Personal OS GPT" value="Service token isolato; crea soltanto proposte" status={system.gpt ? 'ok' : 'warn'}/><Setting icon={Home} title="Workspace" value={workspace?.name ?? 'Non configurato'} status={workspace ? 'ok' : 'warn'}/><Setting icon={Clock3} title="Sessione" value="Revocabile da Cloudflare Access" status={system.access ? 'ok' : 'warn'}/></section><section className="section-block import-block"><SectionTitle title="Backup cifrati" meta="Verifica reale di decifratura e conteggi"/><div className="calendar-control"><div><strong>{system.backups ? 'R2 backup configurato' : 'R2 backup da configurare'}</strong><small>{system.latest_backup?.completed_at ? `Ultimo backup ${dateTime(system.latest_backup.completed_at)}` : 'Nessun backup completato'}</small></div><div><button className="secondary" disabled={backupBusy || !system.latest_backup} onClick={() => backupAction('verify')}><ShieldCheck/> Verifica</button><button className="primary" disabled={backupBusy || !system.backups} onClick={() => backupAction('run')}>{backupBusy ? <LoaderCircle className="spin"/> : <FileLock2/>} Esegui</button></div></div></section><section className="section-block import-block"><SectionTitle title="Google Calendar" meta="Solo titolo, data e promemoria delle scadenze confermate"/><div className="calendar-control"><div><strong>{connected ? 'Calendario collegato' : system.calendar ? 'Calendario non collegato' : 'Integrazione da configurare'}</strong><small>{connected && calendar?.last_sync_at ? `Ultima sincronizzazione ${dateTime(calendar.last_sync_at)}` : 'Scope limitato agli eventi dei calendari posseduti'}</small></div><div>{connected ? <><button className="secondary" disabled={calendarBusy} onClick={() => calendarAction('disconnect')}><X/> Scollega</button><button className="primary" disabled={calendarBusy} onClick={() => calendarAction('sync')}>{calendarBusy ? <LoaderCircle className="spin"/> : <RefreshCw/>} Sincronizza</button></> : <button className="primary" disabled={calendarBusy || !system.calendar} onClick={() => calendarAction('connect')}><CalendarDays/> Collega Google Calendar</button>}</div></div></section><section className="section-block import-block"><SectionTitle title="Import iniziale salute" meta="Caricamento in staging con controllo conteggi"/><div className="import-control"><label className="file-picker"><Upload/><span>Seleziona pacchetto salute</span><input type="file" accept="application/json" onChange={(event) => { const file=event.target.files?.[0]; if(file) importHealth(file); event.target.value='' }} /></label>{status && <p>{status}</p>}</div></section></>
}

function SettingsView({ workspace, calendar, system, records, onDone }: { workspace: Workspace | null; calendar: CalendarConnection | null; system: SystemStatus; records: CanonicalRecord[]; onDone: () => void }) {
  return <><SettingsBase workspace={workspace} calendar={calendar} system={system} onDone={onDone}/><ConstitutionPanel workspace={workspace} records={records} onDone={onDone}/></>
}

function ConstitutionPanel({ workspace, records, onDone }: { workspace: Workspace | null; records: CanonicalRecord[]; onDone: () => void }) {
  const current = records.filter((row) => text(row.payload.category, '') === 'profile.constitution').at(-1)
  const [scope, setScope] = useState('Individuale')
  const [priorities, setPriorities] = useState('Dati verificabili, privacy, semplicità e reperibilità')
  const [assistantStyle, setAssistantStyle] = useState('Pratico, chiaro e sintetico')
  const [minimumLiquidity, setMinimumLiquidity] = useState('')
  const [reminderStart, setReminderStart] = useState('')
  const [reminderEnd, setReminderEnd] = useState('')
  const [guardrails, setGuardrails] = useState('Nessun pagamento, diagnosi o modifica sensibile automatica')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!current) return
    setScope(detail(current,'scope') || scope)
    setPriorities(detail(current,'priorities') || priorities)
    setAssistantStyle(detail(current,'assistant_style') || assistantStyle)
    setMinimumLiquidity(detail(current,'minimum_liquidity_eur'))
    setReminderStart(detail(current,'reminder_window_start'))
    setReminderEnd(detail(current,'reminder_window_end'))
    setGuardrails(detail(current,'guardrails') || guardrails)
  // Values are synchronized only when the canonical version changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])
  const save = async () => {
    if (!workspace || !scope.trim()) return
    setBusy(true); setStatus('')
    try {
      const details: Record<string, string | number> = { scope: scope.trim(), priorities: priorities.trim(), assistant_style: assistantStyle, guardrails: guardrails.trim() }
      if (minimumLiquidity) details.minimum_liquidity_eur = Number(minimumLiquidity)
      if (reminderStart) details.reminder_window_start = reminderStart
      if (reminderEnd) details.reminder_window_end = reminderEnd
      await commitOwnerOperation(workspace.id, { kind: 'fact', effective_date: localIsoDate(), title: 'Costituzione personale', confidence: 1, evidence_status: 'declared', ...(current ? { supersedes_item_id: current.id } : {}), payload: { category: 'profile.constitution', key: 'personal.constitution', value: 'Regole operative Personal OS', sensitivity: 'personal', details } }, 'Costituzione personale dalla PWA')
      setStatus('Costituzione salvata come nuova versione'); onDone()
    } finally { setBusy(false) }
  }
  return <section className="section-block constitution-block"><SectionTitle title="Costituzione personale" meta={current ? `Versione attiva dal ${date(current.effective_date)}` : 'Profilo da attivare'}/><div className="constitution-form"><label className="field"><span>Ambito personale</span><input value={scope} onChange={(event) => setScope(event.target.value)} maxLength={300}/></label><label className="field"><span>Priorità</span><textarea value={priorities} onChange={(event) => setPriorities(event.target.value)} maxLength={1000}/></label><label className="field"><span>Stile dell’assistente</span><select value={assistantStyle} onChange={(event) => setAssistantStyle(event.target.value)}><option>Pratico, chiaro e sintetico</option><option>Analitico e dettagliato</option><option>Diretto e minimale</option></select></label><label className="field"><span>Liquidità minima di attenzione (EUR)</span><input type="number" min="0" step="100" value={minimumLiquidity} onChange={(event) => setMinimumLiquidity(event.target.value)} placeholder="Non configurata"/></label><label className="field"><span>Promemoria da</span><input type="time" value={reminderStart} onChange={(event) => setReminderStart(event.target.value)}/></label><label className="field"><span>Promemoria fino a</span><input type="time" value={reminderEnd} onChange={(event) => setReminderEnd(event.target.value)}/></label><label className="field full"><span>Limiti operativi</span><textarea value={guardrails} onChange={(event) => setGuardrails(event.target.value)} maxLength={1000}/></label><div className="form-actions"><button className="primary" disabled={busy || !scope.trim()} onClick={save}>{busy ? <LoaderCircle className="spin"/> : <BookOpenCheck/>} Salva nuova versione</button>{status && <small>{status}</small>}</div></div></section>
}

function Setting({ icon: Icon, title, value, status }: { icon: typeof ShieldCheck; title: string; value: string; status: 'ok' | 'warn' }) { return <div className="setting-row"><span className="setting-icon"><Icon /></span><span><strong>{title}</strong><small>{value}</small></span><span className={`status-pill ${status}`}>{status === 'ok' ? 'Attivo' : 'Da completare'}</span><button className="icon-button" title={`Gestisci ${title}`}><MoreHorizontal /></button></div> }

function PageHeading({ eyebrow, title, actions }: { eyebrow: string; title: string; actions?: ReactNode }) { return <><div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{actions}</div>{title === 'Scadenze' && <DeadlineHints/>}</> }
function DeadlineHints() { return <details className="hint-drawer"><summary>Esempi utili da monitorare</summary><div className="hint-grid"><span><b>Casa</b><small>Caldaia, controlli impianti, polizze, garanzie, tributi e contratti.</small></span><span><b>Auto</b><small>Revisione, RC Auto, bollo, tagliando, gomme e controlli di usura.</small></span><span><b>Persona</b><small>Documenti, visite, prescrizioni, assicurazioni e attestazione ISEE.</small></span><span><b>Amministrazione</b><small>Bollette, dichiarazione dei redditi, bonus ed eventuali comunicazioni ENEA.</small></span></div></details> }
function SectionTitle({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) { return <div className="section-title"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div> }
function Metric({ label, value, trend, icon: Icon, tone }: { label: string; value: string; trend: string; icon: typeof Landmark; tone: string }) { return <article className="metric"><span className={`metric-icon ${tone}`}><Icon /></span><div><small>{label}</small><strong className="sensitive-value">{value}</strong><span className="sensitive-detail">{trend}</span></div></article> }
function WorthChart({ rows }: { rows: Snapshot[] }) { const chart = rows.filter((row) => row.metric_key === 'net_worth').slice(-8).map((row) => ({ name: new Intl.DateTimeFormat('it-IT',{month:'short', timeZone:'Europe/Rome'}).format(new Date(row.observed_on)), value: Number(row.amount) })); return chart.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="worth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#167d65" stopOpacity={0.28}/><stop offset="100%" stopColor="#167d65" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(value/1000)}k`} width={42}/><Tooltip formatter={(value) => money(Number(value))} /><Area type="monotone" dataKey="value" stroke="#167d65" strokeWidth={2.5} fill="url(#worth)" /></AreaChart></ResponsiveContainer></div> : <Empty label="Nessuna serie patrimoniale" /> }
function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td className="sensitive-cell" key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> }
function Empty({ label }: { label: string }) { return <div className="empty"><FileText /><span>{label}</span></div> }
function BrandMark({ compact = false }: { compact?: boolean }) { return <div className={`brand ${compact ? 'compact' : ''}`}><span className="brand-symbol"><ShieldCheck /></span><span><strong>Personal OS</strong><small>Private dashboard</small></span></div> }
function FullScreenLoader() { return <main className="loader-screen"><BrandMark /><LoaderCircle className="spin" /></main> }

// Returns the masked excerpt plus a note explaining any downgrade, so a skipped
// excerpt is always visible to the owner instead of failing silently.
async function extractExcerpt(file: File, status: (message: string) => void) {
  try {
    return { excerpt: maskSensitiveText(await extractTextLocally(file, status)), note: '' }
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : 'extraction_failed'
    const note = code === 'ocr_assets_missing' ? '; estratto non creato: runtime OCR locale non installato'
      : code === 'unsupported_file_type' ? '; estratto non creato: formato non leggibile sul dispositivo'
        : '; estratto non creato: testo non estraibile da questo file'
    return { excerpt: '', note }
  }
}

async function commitOwnerOperation(workspaceId: string, operation: Record<string, unknown>, sourceLabel: string) {
  const proposal = await proposeOperations({ workspace_id: workspaceId, idempotency_key: `pwa-core-${crypto.randomUUID()}`, source: 'direct_user_statement', source_label: sourceLabel, operations: [operation] })
  await decideBatch(proposal.batch_id, 'confirm')
}

function localIsoDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
function detailsObject(row: CanonicalRecord) { return row.payload.details && typeof row.payload.details === 'object' && !Array.isArray(row.payload.details) ? row.payload.details as Record<string, unknown> : {} }
function detail(row: CanonicalRecord, key: string) { return text(detailsObject(row)[key], '') }
function domainLabel(value: string) { return ({ profile: 'Profilo', finance: 'Finanze', health: 'Salute', home: 'Casa', deadlines: 'Scadenze', documents: 'Documenti', quality: 'Qualità', personal: 'Personale', personale: 'Personale' } as Record<string,string>)[value] ?? value }
function evidenceLabel(value?: string, state = 'confirmed') { if (state === 'superseded') return 'Superato'; return ({ verified: 'Verificato', declared: 'Dichiarato', estimated: 'Stimato', planned: 'Pianificato' } as Record<string,string>)[value ?? ''] ?? 'Dichiarato' }
function dataHealthLabel(value: string) { return ({ complete: 'Completa', partial: 'Parziale', stale: 'Da aggiornare', missing: 'Mancante' } as Record<string,string>)[value] ?? value }
function confidenceLabel(value: string) { return ({ high: 'Alta', medium: 'Media', low: 'Bassa' } as Record<string,string>)[value] ?? value }

function money(value: number) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) }
function number(value: number) { return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value) }
function date(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' }).format(new Date(value)) }
function dateTime(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(value)) }
function datePart(value: string, part: 'day' | 'month') { return new Intl.DateTimeFormat('it-IT', part === 'day' ? { day: 'numeric', timeZone: 'Europe/Rome' } : { month: 'short', timeZone: 'Europe/Rome' }).format(new Date(value)) }
function relative(value: string) { const target = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(value)); const days = Math.round((Date.parse(`${localIsoDate()}T12:00:00Z`) - Date.parse(`${target}T12:00:00Z`)) / 86_400_000); return days < 0 ? `Tra ${Math.abs(days)} gg` : days === 0 ? 'Oggi' : days === 1 ? 'Ieri' : `${days} gg fa` }
function stateLabel(value: string) { return ({ confirmed: 'Confermato', proposed: 'Da confermare', staged: 'In caricamento', pending_review: 'Da verificare', verified: 'Verificato', superseded: 'Superato', rejected: 'Rifiutato' } as Record<string,string>)[value] ?? value }
function precisionLabel(value: string) { return ({ exact: 'Confermata', derived: 'Derivata', estimated: 'Stimata' } as Record<string,string>)[value] ?? value }
function sensitivityLabel(value: string) { return ({ normal: 'Normale', personal: 'Personale', financial: 'Finanziario', health: 'Salute', identity: 'Identità', highly_restricted: 'Molto riservato' } as Record<string,string>)[value] ?? value }
function healthLabel(value: string) { return ({ 'body.weight': 'Peso', 'body.bmi': 'BMI', 'sleep.duration': 'Sonno', 'heart.hrv': 'HRV', 'heart.resting_rate': 'Frequenza a riposo' } as Record<string,string>)[value] ?? value.replaceAll('.', ' ') }
function auditLabel(value: string) { return ({ 'proposal.created': 'Proposta creata', 'proposal.confirmed': 'Proposta confermata', 'proposal.rejected': 'Proposta rifiutata', 'document.uploaded': 'Documento archiviato' } as Record<string,string>)[value] ?? value }
function sourceTypeLabel(value: string) { return ({ manual_statement: 'Dichiarazione', official_portal_export: 'Export ufficiale', bank_statement: 'Estratto conto', investment_statement: 'Rendiconto investimenti', loan_statement: 'Situazione debito', insurer_document: 'Documento assicurativo', utility_invoice: 'Bolletta', healthcare_record: 'Fascicolo sanitario', apple_health_export: 'Apple Salute', medical_report: 'Referto', lab_report: 'Esame di laboratorio', import_package: 'Pacchetto import', calculation: 'Calcolo', other: 'Documento' } as Record<string,string>)[value] ?? value.replaceAll('_',' ') }
function proposalFieldLabel(value: string) { return ({ amount: 'Importo', currency: 'Valuta', instrument_code: 'Strumento', quantity: 'Quantità', price: 'Prezzo', institution: 'Istituzione', account_label: 'Conto', account_or_asset_id: 'Conto o bene', metric_key: 'Metrica', value: 'Valore', unit: 'Unità', measured_at: 'Data e ora', due_at: 'Scadenza', occurred_at: 'Data e ora', started_at: 'Inizio', ended_at: 'Fine', category: 'Categoria', status: 'Stato', precision: 'Precisione', direction: 'Direzione', provider: 'Fornitore', reference_range: 'Intervallo', test_key: 'Esame', note: 'Nota', remind_days_before: 'Preavvisi' } as Record<string,string>)[value] ?? value.replaceAll('_',' ').replace(/^./, (letter) => letter.toUpperCase()) }
function proposalValue(name: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Non indicato'
  if (typeof value === 'string') {
    if (['due_at', 'measured_at', 'occurred_at', 'started_at', 'ended_at'].includes(name)) {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) return value.includes('T') ? dateTime(value) : date(value)
    }
    if (name === 'status') return deadlineStatusLabel(value)
    if (name === 'precision') return precisionLabel(value)
    if (name === 'direction') return directionLabel(value)
    if (name === 'sensitivity') return sensitivityLabel(value)
    if (name === 'cadence') return cadenceLabel(value)
    if (name === 'renewal') return renewalLabel(value)
    if (name === 'utility_type') return utilityLabel(value)
  }
  if (typeof value === 'number' && ['amount', 'price'].includes(name)) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
  }
  if (typeof value === 'number') return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 4 }).format(value)
  if (typeof value === 'boolean') return value ? 'Sì' : 'No'
  if (Array.isArray(value)) return value.map((item) => proposalValue(name, item)).join(', ')
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, nested]) => `${proposalFieldLabel(key)}: ${proposalValue(key, nested)}`).join('; ')
  return String(value)
}
function reliabilityLabel(value: string) { return ({ primary_authoritative: 'Fonte primaria', institution_issued: 'Emessa dall istituzione', user_confirmed: 'Confermata dall utente', derived: 'Dato derivato', estimate: 'Stima' } as Record<string,string>)[value] ?? value }
function sourceStateLabel(value: string) { return ({ pending_review: 'Da verificare', verified: 'Verificata', rejected: 'Rifiutata', superseded: 'Superata' } as Record<string,string>)[value] ?? value }
function recordKindLabel(value: string) { return ({ account_balance: 'Conto', asset_valuation: 'Bene', liability_snapshot: 'Debito', mortgage_snapshot: 'Mutuo', financial_snapshot: 'Patrimonio', pension_snapshot: 'Previdenza', investment: 'Investimento', transaction: 'Movimento', recurring_commitment: 'Impegno', budget_target: 'Budget', utility_bill: 'Bolletta', measurement: 'Misurazione', lab_result: 'Esame', medication: 'Terapia', diagnosis: 'Diagnosi', vaccination: 'Vaccinazione', appointment: 'Appuntamento', deadline: 'Scadenza', insurance_policy: 'Polizza', document: 'Documento', event: 'Evento', fact: 'Dato', note: 'Nota' } as Record<string,string>)[value] ?? value.replaceAll('_', ' ') }
function directionLabel(value: string) { return ({ income: 'Entrata', expense: 'Spesa', transfer: 'Trasferimento', liability_settlement: 'Rimborso debito' } as Record<string,string>)[value] ?? value }
function deadlineStatusLabel(value: string) { return ({ open: 'Aperta', completed: 'Completata', cancelled: 'Annullata' } as Record<string,string>)[value] ?? value }
function utilityLabel(value: string) { return ({ electricity: 'Energia', gas: 'Gas', water: 'Acqua', internet: 'Internet', mobile: 'Telefonia', waste: 'Rifiuti', other: 'Altro' } as Record<string,string>)[value] ?? value }
function cadenceLabel(value: string) { return ({ weekly: 'Settimanale', monthly: 'Mensile', quarterly: 'Trimestrale', annual: 'Annuale', one_off: 'Una tantum' } as Record<string,string>)[value] ?? value }
function renewalLabel(value: string) { return ({ automatic: 'Automatico', manual: 'Manuale', none: 'Nessuno', unknown: 'Da verificare' } as Record<string,string>)[value] ?? value }
function documentTypeLabel(value: string) { return ({ bank_statement: 'Estratto conto', investment_statement: 'Rendiconto investimenti', loan_statement: 'Mutuo o prestito', utility_bill: 'Bolletta', insurance_policy: 'Polizza', medical_report: 'Referto medico', lab_report: 'Esame di laboratorio', tax_document: 'Documento fiscale', receipt: 'Ricevuta', document: 'Documento' } as Record<string,string>)[value] ?? value.replaceAll('_', ' ') }
function text(value: unknown, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : String(value) }
function firstNumber(...values: Array<number | null | undefined>) { for (const value of values) if (typeof value === 'number' && Number.isFinite(value)) return value; return null }
async function hashText(value: string) { const bytes = new TextEncoder().encode(value); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((part) => part.toString(16).padStart(2,'0')).join('') }
