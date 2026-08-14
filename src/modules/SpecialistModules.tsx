import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Calculator, Car, ExternalLink, FileText, HeartPulse, Home, Landmark, ShieldCheck, Utensils, WalletCards } from 'lucide-react'
import {
  budgetVarianceMonthly,
  calculateBmi, calculateMifflinStJeor, calculateNutritionTargets, calculateVehicleTco, cashFlowMonthly, datedSeriesStatistics, estimateOrdinaryIsee,
  financialIndependenceSummary, financialPositionSummary, healthSourceCoverage, hrvBaselineSummary, investableCapital, liquidityRunway, monthlySeriesStatistics, netWorthStatistics,
  nutritionDaily, periodComparisonStatistics, portfolioExposureSummary, portfolioPerformanceStatistics, portfolioPositions, portfolioSummary,
  projectCapitalRunway, projectFutureValue, projectMonteCarlo, recordDetails, rollingCalendarAverage, utilityMonthly, utilitySummary,
  vehicleCostsAnnual, wearableEnergySummary,
  type AnalyticsRecord, type IseeInput,
} from '../../shared/analytics'
import { getHealthSeries } from '../lib/api'

interface Snapshot { id: string; observed_on: string; metric_key: string; amount: number; precision: string }
interface Investment { id: string; occurred_on: string; instrument_code: string; amount: number | null; state: string }
interface Measurement { id: string; measured_at: string; metric_key: string; value_numeric: number; unit: string; state: string }
interface DailyHealthMetric { id: string; observed_on: string; metric_key: string; source_label: string; unit: string; record_count?: number | null; value_sum: number | null; value_avg: number | null; value_min?: number | null; value_max?: number | null; value_first?: number | null; value_last: number | null }
export interface HealthMetricCatalog { metric_key: string; unit: string; coverage_start: string; coverage_end: string; day_count: number; source_count: number }
interface SleepRow { id: string; observed_on: string; detected_hours?: number | null; valid_hours: number | null; efficiency: number | null; core_minutes?: number | null; deep_minutes: number | null; rem_minutes: number | null; awake_minutes?: number | null; source_status?: string | null }
interface WorkoutRow { id: string; observed_on: string; activity_type: string; duration_minutes: number | null; distance_km: number | null; energy_kcal: number | null }
export interface RegulatoryRule { id: string; rule_key: string; title: string; rule_type: string; domain: string; jurisdiction: string; recurrence: Record<string, unknown>; applicability: Record<string, unknown>; source_publisher: string; source_url: string; last_verified_at: string; next_review_at: string; state: string; notes: string | null }
export interface BenefitOpportunity { id: string; benefit_key: string; title: string; category: string; jurisdiction: string; summary: string; eligibility: Record<string, unknown>; source_publisher: string; source_url: string; valid_from: string | null; valid_to: string | null; application_deadline: string | null; last_verified_at: string; state: string }
export interface MonitorRun { id: string; monitor_key: string; scheduled_for: string; state: string; summary: string | null; source_count: number; completed_at: string | null }

const COLORS = ['#167d65', '#1d4f7a', '#d3922b', '#b44d57', '#6f7d4c', '#5c6470', '#3d8da8']

function money(value: number) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) }
function number(value: number, digits = 2) { return new Intl.NumberFormat('it-IT', { maximumFractionDigits: digits }).format(value) }
function date(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' }).format(new Date(value)) }
function currentYearRome() { return new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Rome' }).format(new Date()) }
function todayRome() { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Rome' }).format(new Date()) }
function shiftIsoDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
function finite(value: unknown) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function optionalNumber(value: unknown) { if(value===null||value===undefined||value==='') return null; const parsed=Number(value); return Number.isFinite(parsed)?parsed:null }
function text(value: unknown, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : String(value) }
function details(record: AnalyticsRecord) { return recordDetails(record) }

function ModuleTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<[T, string]> }) {
  return <div className="module-tabs" role="tablist">{options.map(([key, label]) => <button key={key} role="tab" aria-selected={value === key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{label}</button>)}</div>
}

function MiniMetric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Landmark }) {
  return <div className="special-metric"><Icon/><span><small>{label}</small><strong className="sensitive-value">{value}</strong><em className="sensitive-detail">{note}</em></span></div>
}

function Empty({ label }: { label: string }) { return <div className="special-empty"><FileText/><span>{label}</span></div> }

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td className="sensitive-cell" key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
}

export function FinanceAdvanced({ records, snapshots, investments }: { records: AnalyticsRecord[]; snapshots: Snapshot[]; investments: Investment[] }) {
  const [tab, setTab] = useState<'overview'|'portfolio'|'budget'|'projection'|'isee'>('overview')
  const worthHistory = snapshots.filter((row) => row.metric_key === 'net_worth').map((row) => ({ date: row.observed_on, value: row.amount })).sort((a,b)=>a.date.localeCompare(b.date))
  const worth = worthHistory.at(-1)?.value ?? 0
  const transactions = records.filter((row) => row.kind === 'transaction')
  const currentYear = currentYearRome()
  const ytd = transactions.filter((row) => row.effective_date.startsWith(currentYear))
  const income = ytd.filter((row) => row.payload.direction === 'income').reduce((sum, row) => sum + finite(row.payload.amount), 0)
  const expenses = ytd.filter((row) => row.payload.direction === 'expense').reduce((sum, row) => sum + finite(row.payload.amount), 0)
  const positionSummary = useMemo(()=>financialPositionSummary(records),[records])
  const latestPositions = positionSummary.positions
  const allocation = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of latestPositions.filter((item) => !['liability_snapshot','mortgage_snapshot'].includes(item.kind))) {
      const category = text(row.payload.category, 'Da classificare')
      const value = Math.max(0, finite(row.payload.amount) * finite(row.payload.ownership_share ?? 1))
      if (value > 0) map.set(category, (map.get(category) ?? 0) + value)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value)
  }, [latestPositions])
  const holdings = portfolioPositions(records)
  const holdingSummary = portfolioSummary(holdings)
  const exposureSummary = portfolioExposureSummary(records, holdings)
  const performance = records.filter((row)=>row.payload.category==='portfolio.performance').map((row)=>{const d=details(row);return{date:row.effective_date,portfolio:finite(d.cumulative_return_pct),benchmark:d.benchmark_return_pct==null?null:finite(d.benchmark_return_pct),marketValue:d.market_value==null?null:finite(d.market_value)}}).sort((a,b)=>a.date.localeCompare(b.date))
  const cashFlow = cashFlowMonthly(records).slice(-24)
  const expenseCategories = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of ytd.filter((item) => item.payload.direction === 'expense')) {
      const category = text(row.payload.category, 'Altro')
      map.set(category, (map.get(category) ?? 0) + finite(row.payload.amount))
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10)
  }, [ytd])

  const investable = useMemo(() => investableCapital(records, holdingSummary.marketValue), [records, holdingSummary.marketValue])
  return <div className="specialist-module"><ModuleTabs value={tab} onChange={setTab} options={[["overview","Sintesi"],["portfolio","Portafoglio"],["budget","Budget"],["projection","Proiezioni"],["isee","ISEE"]]}/>
    {tab === 'overview' && <FinanceOverview worth={worth} income={income} expenses={expenses} worthHistory={worthHistory} allocation={allocation} expenseCategories={expenseCategories} positionSummary={positionSummary} cashFlow={cashFlow}/>}
    {tab === 'portfolio' && <PortfolioView summary={holdingSummary} exposures={exposureSummary} performance={performance} investments={investments}/>}
    {tab === 'budget' && <BudgetView records={records}/>}
    {tab === 'projection' && <ProjectionView investable={investable} cashFlow={cashFlow}/>}
    {tab === 'isee' && <IseeView records={records}/>}
  </div>
}

function BudgetView({ records }: { records: AnalyticsRecord[] }) {
  const months = useMemo(() => {
    const found = new Set<string>()
    for (const row of records) {
      if (row.kind === 'transaction' && row.payload.direction === 'expense') found.add(row.effective_date.slice(0, 7))
      if (row.kind === 'budget_target') found.add(row.effective_date.slice(0, 7))
    }
    found.add(todayRome().slice(0, 7))
    return [...found].sort().reverse().slice(0, 24)
  }, [records])
  const [month, setMonth] = useState('')
  const selected = months.includes(month) ? month : months[0] ?? todayRome().slice(0, 7)
  const budget = useMemo(() => budgetVarianceMonthly(records, selected), [records, selected])
  const chart = budget.rows.filter((row) => row.budget != null || row.actual > 0).slice(0, 12)
  const currentMonth = selected === todayRome().slice(0, 7)
  return <><section className="special-metrics">
    <MiniMetric label="Budget del mese" value={budget.budgetedTotal ? money(budget.budgetedTotal) : '—'} note={budget.budgetedTotal ? `${budget.rows.filter((row) => row.budget != null).length} categorie con budget` : 'Nessun budget confermato per il mese'} icon={Calculator}/>
    <MiniMetric label="Speso" value={money(budget.actualTotal)} note={currentMonth ? 'Mese in corso: dato parziale' : 'Mese chiuso'} icon={WalletCards}/>
    <MiniMetric label="Scostamento" value={budget.budgetedTotal ? money(budget.variance) : '—'} note={budget.variance >= 0 ? 'Entro il budget complessivo' : 'Oltre il budget complessivo'} icon={ShieldCheck}/>
    <MiniMetric label="Utilizzo" value={budget.usageRatio == null ? '—' : `${number(budget.usageRatio * 100, 1)}%`} note={budget.overBudgetCategories ? `${budget.overBudgetCategories} categorie oltre soglia` : 'Nessuna categoria oltre soglia'} icon={Calculator}/>
    <MiniMetric label="Spese senza budget" value={budget.unbudgetedValue ? money(budget.unbudgetedValue) : '—'} note="Escluse dal confronto per categoria" icon={FileText}/>
  </section>
    <section className="section-block"><div className="section-title"><div><h2>Budget contro effettivo</h2><span>Cadenze diverse normalizzate a mese; trasferimenti esclusi</span></div><div className="chart-selectors"><select aria-label="Mese" value={selected} onChange={(event) => setMonth(event.target.value)}>{months.map((row) => <option key={row} value={row}>{row}</option>)}</select></div></div>
      {chart.length ? <div className="special-chart tall"><ResponsiveContainer><BarChart data={chart}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="category"/><YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}/><Tooltip formatter={(v) => money(Number(v))}/><Legend/><Bar dataKey="budget" name="Budget" fill="#1d4f7a" radius={[3,3,0,0]}/><Bar dataKey="actual" name="Speso" fill="#d3922b" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div> : <Empty label="Nessun budget o movimento di spesa per il mese selezionato"/>}
    </section>
    <section className="section-block"><div className="section-title"><div><h2>Dettaglio per categoria</h2><span>Le categorie senza budget restano visibili e non vengono imputate</span></div></div>
      <Table headers={['Categoria','Budget','Speso','Scostamento','Utilizzo']} rows={budget.rows.map((row) => [row.category, row.budget == null ? 'Senza budget' : money(row.budget), money(row.actual), row.variance == null ? '—' : `${row.variance >= 0 ? '+' : ''}${money(row.variance)}`, row.usageRatio == null ? '—' : `${number(row.usageRatio * 100, 1)}%`])}/>
      {!budget.rows.length && <Empty label="Conferma un budget per categoria e almeno un movimento di spesa"/>}
      {currentMonth && budget.rows.length > 0 && <p className="formula-warning">Il mese è in corso: l'utilizzo va letto in proporzione ai giorni trascorsi, non come consuntivo.</p>}
    </section></>
}

function FinanceOverview({ worth, income, expenses, worthHistory, allocation, expenseCategories, positionSummary, cashFlow }: { worth: number; income: number; expenses: number; worthHistory: Array<{date:string;value:number}>; allocation: Array<{name:string;value:number}>; expenseCategories: Array<{name:string;value:number}>; positionSummary: ReturnType<typeof financialPositionSummary>; cashFlow: ReturnType<typeof cashFlowMonthly> }) {
  const positions=positionSummary.positions
  const latestSnapshotDate=worthHistory.at(-1)?.date
  const latestPositionDate=positions.at(-1)?.effective_date
  const usePositionSummary=positions.length>0&&(!latestSnapshotDate||Boolean(latestPositionDate&&latestPositionDate>latestSnapshotDate))
  const currentWorth=usePositionSummary?positionSummary.net:worthHistory.length?worth:positions.length?positionSummary.net:null
  const worthStats=netWorthStatistics(worthHistory)
  const positionDates=[...new Set(positions.map((row)=>row.effective_date))].sort()
  const reconciliationNote=positionDates.length===1?`Fotografia al ${date(positionDates[0])}`:positionDates.length>1?`Date non allineate: ${date(positionDates[0])} – ${date(positionDates.at(-1)!)}`:'Servono posizioni correnti'
  const savingsRate = income>0?(income-expenses)/income:null
  const runway=liquidityRunway(positionSummary.liquidity,cashFlow)
  const trailing=cashFlow.slice(-12)
  const averageIncome=trailing.length?trailing.reduce((sum,row)=>sum+row.income,0)/trailing.length:null
  const averageExpenses=trailing.length?trailing.reduce((sum,row)=>sum+row.expenses,0)/trailing.length:null
  return <><section className="special-metrics"><MiniMetric label="Patrimonio netto" value={currentWorth==null?'—':money(currentWorth)} note={usePositionSummary?'Derivato da posizioni più recenti':worthHistory.length?'Ultimo snapshot':'Derivato dalle posizioni correnti'} icon={Landmark}/><MiniMetric label="Variazione 12 mesi" value={worthStats.change12Months==null?'—':money(worthStats.change12Months)} note={worthStats.change12MonthsPercentage==null?'Servono due mesi omologhi':`${worthStats.change12MonthsPercentage>=0?'+':''}${number(worthStats.change12MonthsPercentage*100,1)}% · include flussi`} icon={Calculator}/><MiniMetric label="CAGR storico" value={worthStats.cagr==null?'—':`${number(worthStats.cagr*100,1)}%`} note="Patrimonio, non rendimento del portafoglio" icon={Calculator}/><MiniMetric label="Somma posizioni nette" value={positions.length?money(positionSummary.net):'—'} note={reconciliationNote} icon={ShieldCheck}/><MiniMetric label="Debiti su attivi" value={positionSummary.debtToAssets==null?'—':`${number(positionSummary.debtToAssets*100,1)}%`} note={positions.length?`${money(positionSummary.liabilities)} / ${money(positionSummary.assets)}`:'Servono attivi e debiti'} icon={Landmark}/><MiniMetric label="Copertura liquidità" value={runway.runwayMonths==null?'—':`${number(runway.runwayMonths,1)} mesi`} note={runway.observedMonths?`Spesa media su ${runway.observedMonths} mesi`:'Servono movimenti di spesa'} icon={WalletCards}/><MiniMetric label="Entrate medie" value={averageIncome==null?'—':money(averageIncome)} note={`${trailing.length} mesi osservati, massimo 12`} icon={WalletCards}/><MiniMetric label="Spese medie" value={averageExpenses==null?'—':money(averageExpenses)} note={`${trailing.length} mesi osservati, massimo 12`} icon={WalletCards}/><MiniMetric label="Entrate YTD" value={income ? money(income) : '—'} note="Movimenti riconciliati" icon={WalletCards}/><MiniMetric label="Spese YTD" value={expenses ? money(expenses) : '—'} note="Trasferimenti esclusi" icon={WalletCards}/><MiniMetric label="Risparmio YTD" value={income || expenses ? money(income-expenses) : '—'} note={savingsRate==null?'Flusso, non rendimento':`Tasso ${number(savingsRate*100,1)}%`} icon={ShieldCheck}/></section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Patrimonio nel tempo</h2><span>Valori nominali registrati</span></div></div>{worthHistory.length ? <div className="special-chart"><ResponsiveContainer><AreaChart data={worthHistory}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date" tickFormatter={(value) => String(value).slice(0,7)}/><YAxis tickFormatter={(value) => `${Math.round(value/1000)}k`}/><Tooltip formatter={(value) => money(Number(value))}/><Area dataKey="value" stroke="#167d65" fill="#dcefe9" strokeWidth={2.5}/></AreaChart></ResponsiveContainer></div> : <Empty label="Storico patrimoniale non ancora disponibile"/>}</div>
      <div className="section-block"><div className="section-title"><div><h2>Composizione attuale</h2><span>Ultimo valore per conto o bene</span></div></div>{allocation.length ? <div className="special-chart pie-chart"><ResponsiveContainer><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>{allocation.map((row,index) => <Cell key={row.name} fill={COLORS[index%COLORS.length]}/>)}</Pie><Tooltip formatter={(value) => money(Number(value))}/><Legend/></PieChart></ResponsiveContainer></div> : <Empty label="Posizioni patrimoniali da classificare"/>}</div></section>
    <section className="section-block"><div className="section-title"><div><h2>Flussi mensili</h2><span>Entrate, spese e saldo; trasferimenti esclusi</span></div></div>{cashFlow.length?<div className="special-chart tall"><ResponsiveContainer><ComposedChart data={cashFlow}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="month"/><YAxis tickFormatter={(value)=>`${Math.round(Number(value)/1000)}k`}/><Tooltip formatter={(value)=>money(Number(value))}/><Legend/><Bar dataKey="income" name="Entrate" fill="#167d65"/><Bar dataKey="expenses" name="Spese" fill="#d3922b"/><Line dataKey="net" name="Saldo" stroke="#1d4f7a" strokeWidth={2.5}/></ComposedChart></ResponsiveContainer></div>:<Empty label="Movimenti mensili non ancora disponibili"/>}</section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Variazioni mensili del patrimonio</h2><span>Includono versamenti, prelievi e mercato</span></div></div><Table headers={['Periodo','Variazione','Variazione %']} rows={[worthStats.bestMonth?['Mese migliore '+worthStats.bestMonth.month,money(worthStats.bestMonth.absoluteChange),worthStats.bestMonth.percentageChange==null?'—':`${number(worthStats.bestMonth.percentageChange*100,1)}%`]:['Mese migliore','—','—'],worthStats.worstMonth?['Mese peggiore '+worthStats.worstMonth.month,money(worthStats.worstMonth.absoluteChange),worthStats.worstMonth.percentageChange==null?'—':`${number(worthStats.worstMonth.percentageChange*100,1)}%`]:['Mese peggiore','—','—']]}/></div><div className="section-block"><div className="section-title"><div><h2>Spese per categoria</h2><span>Anno in corso</span></div></div>{expenseCategories.length ? <div className="special-chart"><ResponsiveContainer><BarChart data={expenseCategories} layout="vertical"><CartesianGrid stroke="#dce4e9" horizontal={false}/><XAxis type="number" tickFormatter={(value) => `${Math.round(value/1000)}k`}/><YAxis type="category" dataKey="name" width={100}/><Tooltip formatter={(value) => money(Number(value))}/><Bar dataKey="value" fill="#d3922b" radius={[0,3,3,0]}/></BarChart></ResponsiveContainer></div> : <Empty label="Movimenti di spesa non ancora importati"/>}</div></section>
    <section className="section-block"><div className="section-title"><div><h2>Posizioni correnti</h2><span>{positions.length} conti, beni o debiti</span></div></div><Table headers={['Tipo','Voce','Categoria','Valore']} rows={positions.slice(0,30).map((row) => [row.kind.replaceAll('_',' '),text(row.payload.account_or_asset_id,row.title),text(row.payload.category),money(finite(row.payload.amount))])}/>{!positions.length && <Empty label="Nessuna posizione confermata"/>}</section></>
}

function PortfolioView({ summary, exposures, performance, investments }: { summary: ReturnType<typeof portfolioSummary>; exposures: ReturnType<typeof portfolioExposureSummary>; performance:Array<{date:string;portfolio:number;benchmark:number|null;marketValue:number|null}>; investments: Investment[] }) {
  const exposureNote=exposures.overAllocatedValue?`${money(exposures.overAllocatedValue)} oltre il totale: controllare i pesi`:exposures.unclassifiedValue?`${money(exposures.unclassifiedValue)} da classificare`:'Esposizioni documentate'
  const performanceStats=portfolioPerformanceStatistics(performance)
  const alignedPerformance=performance.filter((row): row is typeof row & { benchmark:number }=>row.benchmark!=null)
  const alignedPortfolioStats=portfolioPerformanceStatistics(alignedPerformance)
  const benchmarkStats=portfolioPerformanceStatistics(alignedPerformance.map((row)=>({date:row.date,portfolio:row.benchmark})))
  const benchmarkGap=alignedPortfolioStats.periodReturn!=null&&benchmarkStats.periodReturn!=null?alignedPortfolioStats.periodReturn-benchmarkStats.periodReturn:null
  const assetClasses=[...summary.rows.reduce((map,row)=>map.set(row.assetClass,(map.get(row.assetClass)??0)+row.marketValue),new Map<string,number>())].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)
  return <><section className="special-metrics"><MiniMetric label="Portafoglio classificato" value={summary.marketValue ? money(summary.marketValue) : '—'} note={`${summary.rows.length} strumenti correnti`} icon={Landmark}/><MiniMetric label="Plus/minusvalenza" value={summary.rows.length ? money(summary.profitLoss) : '—'} note={summary.returnOnCost==null?'Costo non disponibile':`${number(summary.returnOnCost*100,1)}% sul costo dichiarato`} icon={WalletCards}/><MiniMetric label="Concentrazione" value={summary.effectivePositions==null?'—':number(summary.effectivePositions,1)} note={summary.topWeight==null?'Serve il valore per strumento':`Posizioni equivalenti · prima ${number(summary.topWeight*100,1)}%`} icon={Calculator}/><MiniMetric label="Copertura geografica" value={exposures.coverageRatio==null?'—':`${number(exposures.coverageRatio*100,1)}%`} note={exposureNote} icon={ShieldCheck}/><MiniMetric label="Rendimento annualizzato" value={performanceStats.annualizedReturn==null?'—':`${number(performanceStats.annualizedReturn*100,1)}%`} note={performanceStats.start&&performanceStats.end?`${date(performanceStats.start)} – ${date(performanceStats.end)}`:'Serve una serie riconciliata'} icon={Calculator}/><MiniMetric label="Volatilità annualizzata" value={performanceStats.annualizedVolatility==null?'—':`${number(performanceStats.annualizedVolatility*100,1)}%`} note="Log-rendimenti e intervalli effettivi" icon={Calculator}/><MiniMetric label="Massimo drawdown" value={performanceStats.maxDrawdown==null?'—':`${number(performanceStats.maxDrawdown*100,1)}%`} note={`${performanceStats.observations} osservazioni riconciliate`} icon={ShieldCheck}/><MiniMetric label="Scarto dal benchmark" value={benchmarkGap==null?'—':`${benchmarkGap>=0?'+':''}${number(benchmarkGap*100,1)} p.p.`} note={benchmarkGap==null?'Servono date allineate':'Rendimento sul periodo comune'} icon={ShieldCheck}/><MiniMetric label="Operazioni PAC" value={String(investments.length)} note="Ogni mese resta indipendente" icon={ShieldCheck}/></section>
    <section className="section-block"><div className="section-title"><div><h2>Strumenti correnti</h2><span>Ultima fotografia per conto, aggregata per ISIN o strumento</span></div></div><Table headers={['Strumento','ISIN','Conto','Classe','Valore','Peso','Costo','P/L','Target','Scostamento']} rows={summary.rows.map((row) => [row.instrument,row.isin||'—',row.account||'—',row.assetClass,money(row.marketValue),`${number(row.actualWeight*100,1)}%`,money(row.costBasis),money(row.profitLoss),row.validTarget == null?'—':`${number(row.validTarget*100)}%`,row.targetGap==null?'—':`${row.targetGap>=0?'+':''}${number(row.targetGap*100,1)} p.p.`])}/>{!summary.rows.length && <Empty label="Metadati di portafoglio non ancora confermati"/>}</section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Diversificazione geografica</h2><span>Esposizioni correnti ponderate per valore del prodotto</span></div></div>{exposures.rows.length ? <div className="special-chart"><ResponsiveContainer><BarChart data={exposures.rows}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="name"/><YAxis tickFormatter={(v) => `${Math.round(v/1000)}k`}/><Tooltip formatter={(v) => money(Number(v))}/><Bar dataKey="value" fill="#1d4f7a" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div> : <Empty label="Esposizioni geografiche da collegare a fonti del prodotto"/>}</div>
      <div className="section-block"><div className="section-title"><div><h2>Distribuzione per classe</h2><span>Valore corrente degli strumenti classificati</span></div></div>{assetClasses.length?<div className="special-chart pie-chart"><ResponsiveContainer><PieChart><Pie data={assetClasses} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>{assetClasses.map((row,index)=><Cell key={row.name} fill={COLORS[index%COLORS.length]}/>)}</Pie><Tooltip formatter={(value)=>money(Number(value))}/><Legend/></PieChart></ResponsiveContainer></div>:<Empty label="Classi di attivo da classificare"/>}</div></section>
    <section className="section-block"><div className="section-title"><div><h2>PAC mensili</h2><span>Correzioni versionate senza sovrascrivere altri mesi</span></div></div><Table headers={['Data','Strumento','Importo','Stato']} rows={investments.slice(0,30).map((row) => [date(row.occurred_on),row.instrument_code,row.amount==null?'Quantità':money(row.amount),row.state])}/>{!investments.length && <Empty label="Nessun investimento confermato"/>}</section>
    <section className="section-block"><div className="section-title"><div><h2>Rendimento nel tempo</h2><span>Serie riconciliata, separata da versamenti e prelievi; drawdown sul percorso visibile</span></div></div>{performance.length?<div className="special-chart tall"><ResponsiveContainer><LineChart data={performance}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date"/><YAxis tickFormatter={(v)=>`${number(Number(v),1)}%`}/><Tooltip formatter={(v)=>`${number(Number(v),2)}%`}/><Legend/><Line dataKey="portfolio" name="Portafoglio" stroke="#167d65" strokeWidth={2.5} dot={false}/><Line dataKey="benchmark" name="Benchmark" stroke="#1d4f7a" dot={false}/></LineChart></ResponsiveContainer></div>:<Empty label="Servono rendimenti periodici riconciliati o NAV e flussi per calcolarli"/>}</section></>
}

function ProjectionView({ investable, cashFlow }: { investable: ReturnType<typeof investableCapital>; cashFlow: ReturnType<typeof cashFlowMonthly> }) {
  // Financial independence is measured on liquidatable capital only. Seeding this
  // from net worth would count the home as if it could fund a withdrawal.
  const startingValue = investable.total
  const observed = financialIndependenceSummary(startingValue, cashFlow)
  const [input,setInput] = useState({ startingValue, monthlyContribution: 0, annualReturn: 0.05, annualInflation: 0.02, annualFee: 0.002, annualContributionGrowth: 0, annualVolatility: 0.15, years: 20 })
  const [runwayInput,setRunwayInput] = useState({ annualExpenses: observed.annualizedExpenses ?? 0, annualPassiveIncome: 0, annualTemporaryIncome: 0, temporaryIncomeYears: 0, withdrawalRate: 0.04 })
  const scenarios = useMemo(() => {
    const build = (name:string, annualReturn:number) => projectFutureValue({...input,annualReturn}).map((row) => ({...row,name}))
    const maps = [build('Prudente',Math.max(-0.5,input.annualReturn-0.02)),build('Base',input.annualReturn),build('Favorevole',input.annualReturn+0.02)]
    return maps[0].map((row,index) => ({year:row.year,prudente:maps[0][index].real,base:maps[1][index].real,favorevole:maps[2][index].real,contributedReal:maps[1][index].contributedReal,nominal:maps[1][index].nominal}))
  },[input])
  const monteCarlo = useMemo(()=>projectMonteCarlo({...input,simulations:1000,seed:20260813}),[input])
  const autonomy = useMemo(() => {
    const build = (annualPassiveIncome:number,annualTemporaryIncome:number) => projectCapitalRunway({
      startingValue: input.startingValue, annualExpenses: runwayInput.annualExpenses, annualPassiveIncome,
      annualTemporaryIncome, temporaryIncomeYears: runwayInput.temporaryIncomeYears,
      annualReturn: input.annualReturn, annualInflation: input.annualInflation, annualFee: input.annualFee, years: input.years,
    })
    const none=build(0,0)
    const passive=build(runwayInput.annualPassiveIncome,0)
    const plan=build(runwayInput.annualPassiveIncome,runwayInput.annualTemporaryIncome)
    return { none, passive, plan, rows:none.points.map((row,index)=>({year:row.year,noIncome:row.real,passive:passive.points[index]?.real??0,plan:plan.points[index]?.real??0})) }
  },[input,runwayInput])
  const independence = financialIndependenceSummary(input.startingValue, cashFlow, runwayInput.withdrawalRate, 12, runwayInput.annualExpenses)
  const last = scenarios.at(-1)
  const stochasticLast = monteCarlo.points.at(-1)
  const set = (key:keyof typeof input,value:number) => setInput((current) => ({...current,[key]:value}))
  const setRunway = (key:keyof typeof runwayInput,value:number) => setRunwayInput((current) => ({...current,[key]:value}))
  const horizon = (value:number|null) => value==null?`Oltre ${number(input.years,0)} anni`:`${number(value,1)} anni`
  return <><p className="formula-warning">Capitale iniziale proposto: <strong>{money(investable.total)}</strong> di capitale investibile — portafoglio {money(investable.portfolio)} più liquidità {money(investable.liquidity)}. {investable.excludedIlliquid > 0 ? `Sono esclusi ${money(investable.excludedIlliquid)} di beni non liquidabili, perché un immobile o una posizione previdenziale non finanziano un prelievo.` : 'Beni non liquidabili esclusi per costruzione: un immobile non finanzia un prelievo.'}</p>
    <section className="simulator-controls"><label><span>Capitale iniziale</span><input type="number" min="0" value={input.startingValue} onChange={(e)=>set('startingValue',Number(e.target.value))}/></label><label><span>Versamento mensile</span><input type="number" min="0" value={input.monthlyContribution} onChange={(e)=>set('monthlyContribution',Number(e.target.value))}/></label><label><span>Rendimento annuo lordo</span><input type="number" step="0.1" value={input.annualReturn*100} onChange={(e)=>set('annualReturn',Number(e.target.value)/100)}/></label><label><span>Costi annui</span><input type="number" min="0" max="99" step="0.1" value={input.annualFee*100} onChange={(e)=>set('annualFee',Number(e.target.value)/100)}/></label><label><span>Inflazione annua</span><input type="number" step="0.1" value={input.annualInflation*100} onChange={(e)=>set('annualInflation',Number(e.target.value)/100)}/></label><label><span>Crescita annua versamenti</span><input type="number" step="0.1" value={input.annualContributionGrowth*100} onChange={(e)=>set('annualContributionGrowth',Number(e.target.value)/100)}/></label><label><span>Volatilità annua</span><input type="number" min="0" max="200" step="0.5" value={input.annualVolatility*100} onChange={(e)=>set('annualVolatility',Number(e.target.value)/100)}/></label><label><span>Anni</span><input type="number" min="1" max="80" step="1" value={input.years} onChange={(e)=>set('years',Number(e.target.value))}/></label></section>
    <section className="special-metrics"><MiniMetric label="Scenario base reale" value={last?money(last.base):'—'} note={last?`Nominale ${money(last.nominal)}`:"Al netto dell'inflazione"} icon={Calculator}/><MiniMetric label="Versato in euro di oggi" value={last?money(last.contributedReal):'—'} note="Versamenti futuri scontati per inflazione" icon={WalletCards}/><MiniMetric label="Intervallo statistico finale" value={stochasticLast?`${money(stochasticLast.p10)} – ${money(stochasticLast.p90)}`:'—'} note="10°–90° percentile, non garanzia" icon={ShieldCheck}/><MiniMetric label="Probabilità sopra i versamenti" value={`${number(monteCarlo.probabilityAboveContributions*100,1)}%`} note={`${monteCarlo.simulations} percorsi simulati`} icon={Calculator}/></section>
    <section className="section-block"><div className="section-title"><div><h2>Scenari deterministici reali</h2><span>Costi e inflazione inclusi; versamenti a fine mese</span></div></div><div className="special-chart tall"><ResponsiveContainer><LineChart data={scenarios}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="year"/><YAxis tickFormatter={(v)=>`${Math.round(v/1000)}k`}/><Tooltip formatter={(v)=>money(Number(v))}/><Legend/><Line dataKey="prudente" name="Prudente" stroke="#b44d57" dot={false}/><Line dataKey="base" name="Base" stroke="#167d65" strokeWidth={2.5} dot={false}/><Line dataKey="favorevole" name="Favorevole" stroke="#1d4f7a" dot={false}/><Line dataKey="contributedReal" name="Versato reale" stroke="#8b949e" strokeDasharray="5 4" dot={false}/></LineChart></ResponsiveContainer></div></section>
    <section className="section-block"><div className="section-title"><div><h2>Distribuzione simulata</h2><span>Modello lognormale semplificato: serve a esplorare il rischio, non a prevedere</span></div></div><div className="special-chart tall"><ResponsiveContainer><LineChart data={monteCarlo.points}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="year"/><YAxis tickFormatter={(v)=>`${Math.round(v/1000)}k`}/><Tooltip formatter={(v)=>money(Number(v))}/><Legend/><Line dataKey="p10" name="10° percentile" stroke="#b44d57" dot={false}/><Line dataKey="p50" name="Mediana" stroke="#167d65" strokeWidth={2.5} dot={false}/><Line dataKey="p90" name="90° percentile" stroke="#1d4f7a" dot={false}/><Line dataKey="contributedReal" name="Versato reale" stroke="#8b949e" strokeDasharray="5 4" dot={false}/></LineChart></ResponsiveContainer></div></section>
    <section className="section-block"><div className="section-title"><div><h2>Autonomia del capitale</h2><span>Scenari reali con spesa indicata, reddito passivo e reddito temporaneo</span></div></div><div className="simulator-controls"><label><span>Spesa annua</span><input type="number" min="0" value={runwayInput.annualExpenses} onChange={(e)=>setRunway('annualExpenses',Number(e.target.value))}/></label><label><span>Reddito passivo annuo</span><input type="number" min="0" value={runwayInput.annualPassiveIncome} onChange={(e)=>setRunway('annualPassiveIncome',Number(e.target.value))}/></label><label><span>Reddito temporaneo annuo</span><input type="number" min="0" value={runwayInput.annualTemporaryIncome} onChange={(e)=>setRunway('annualTemporaryIncome',Number(e.target.value))}/></label><label><span>Durata reddito temporaneo</span><input type="number" min="0" max="80" step="0.5" value={runwayInput.temporaryIncomeYears} onChange={(e)=>setRunway('temporaryIncomeYears',Number(e.target.value))}/></label><label><span>Tasso di prelievo ipotizzato</span><input type="number" min="0.1" max="20" step="0.1" value={runwayInput.withdrawalRate*100} onChange={(e)=>setRunway('withdrawalRate',Number(e.target.value)/100)}/></label></div><section className="special-metrics"><MiniMetric label="Anni di spesa coperti" value={independence.yearsOfExpenses==null?'—':number(independence.yearsOfExpenses,1)} note={independence.expenseSource==='manual_scenario'?'Sulla spesa dello scenario':`${independence.observedMonths} mesi di spese osservati`} icon={ShieldCheck}/><MiniMetric label="Prelievo annuo ipotetico" value={money(independence.sustainableAnnualWithdrawal)} note={`${number(independence.withdrawalRate*100,1)}% del capitale`} icon={WalletCards}/><MiniMetric label="Capitale obiettivo" value={independence.financialIndependenceTarget==null?'—':money(independence.financialIndependenceTarget)} note="Spesa annuale / tasso scelto" icon={Landmark}/><MiniMetric label="Copertura della spesa" value={independence.expenseCoverageRatio==null?'—':`${number(independence.expenseCoverageRatio*100,1)}%`} note="Prelievo ipotetico / spesa di scenario" icon={Calculator}/></section><div className="special-chart tall"><ResponsiveContainer><LineChart data={autonomy.rows}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="year"/><YAxis tickFormatter={(v)=>`${Math.round(v/1000)}k`}/><Tooltip formatter={(v)=>money(Number(v))}/><Legend/><Line dataKey="noIncome" name={`Nessun reddito · ${horizon(autonomy.none.exhaustedAfterYears)}`} stroke="#b44d57" dot={false}/><Line dataKey="passive" name={`Solo passivo · ${horizon(autonomy.passive.exhaustedAfterYears)}`} stroke="#d3922b" dot={false}/><Line dataKey="plan" name={`Piano completo · ${horizon(autonomy.plan.exhaustedAfterYears)}`} stroke="#167d65" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div><p className="formula-warning">Il tasso di prelievo è un'ipotesi di scenario, non una garanzia di sostenibilità; fiscalità e sequenza reale dei rendimenti non sono incluse.</p></section></>
}

const emptyIsee: IseeInput = { householdMembers:1,dependentChildren:0,disabledMembers:0,additionalScaleIncrement:0,incomeForIsee:0,incomeDeductions:0,annualRent:0,accountClosingBalances:0,accountAverageBalances:0,eligibleAssetPurchaseIncrement:0,useClosingBalanceException:false,otherFinancialAssets:0,excludedGovernmentBonds:0,primaryHomeImuValue:0,primaryHomeMortgageResidual:0,otherRealEstateImuValue:0,otherRealEstateMortgageResidual:0,calculationMode:'ordinary',metropolitanCapitalHome:false }

function IseeView({ records }: { records: AnalyticsRecord[] }) {
  const imported = records.filter((row)=>row.payload.category==='isee.input').at(-1)
  const importedDetails = imported ? details(imported) : {}
  const importedValues = Object.fromEntries(Object.keys(emptyIsee).map((key)=>{
    const fallback=emptyIsee[key as keyof IseeInput]
    const value=importedDetails[key]
    return [key,typeof fallback==='boolean'?Boolean(value):typeof fallback==='string'?String(value??fallback):finite(value)]
  }))
  const [input,setInput] = useState<IseeInput>({...emptyIsee,...importedValues})
  const result = estimateOrdinaryIsee(input)
  const field = (key:keyof IseeInput,label:string) => <label><span>{label}</span><input type="number" min="0" step="0.01" value={String(input[key])} onChange={(event)=>setInput((current)=>({...current,[key]:Number(event.target.value)}))}/></label>
  return <><section className="special-metrics"><MiniMetric label={input.calculationMode==='ordinary'?'ISEE ordinario stimato':'ISEE specifico 2026 stimato'} value={money(result.estimatedIsee)} note="Indicativo e calcolato nel browser" icon={Calculator}/><MiniMetric label="ISR" value={money(result.isr)} note="Componente reddituale inserita" icon={WalletCards}/><MiniMetric label="ISP" value={money(result.isp)} note="Patrimonio dopo franchigie" icon={Home}/><MiniMetric label="Scala equivalenza" value={number(result.scale)} note={`${input.householdMembers} componenti`} icon={ShieldCheck}/></section>
    <section className="section-block"><div className="section-title"><div><h2>Simulatore ISEE</h2><span>Anno DSU e tipo di prestazione cambiano i dati e, dal 2026, anche alcune regole</span></div><a className="source-link" href="https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.Portale-unico-ISEE.html" target="_blank" rel="noreferrer">Portale INPS <ExternalLink/></a></div><div className="simulator-controls isee-controls"><label><span>Tipo di calcolo</span><select value={input.calculationMode} onChange={(event)=>setInput((current)=>({...current,calculationMode:event.target.value as IseeInput['calculationMode']}))}><option value="ordinary">ISEE ordinario</option><option value="family_inclusion_2026">Prestazioni familiari/inclusione 2026</option></select></label>{field('householdMembers','Componenti nucleo')}{field('dependentChildren','Figli conviventi')}{field('disabledMembers','Componenti con disabilità')}{field('additionalScaleIncrement','Altre maggiorazioni scala verificate')}{field('incomeForIsee','Redditi rilevanti ISEE')}{field('incomeDeductions','Detrazioni reddituali')}{field('annualRent','Canone annuo locazione')}{field('accountClosingBalances','Somma saldi conti al 31/12')}{field('accountAverageBalances','Somma giacenze medie')}{field('eligibleAssetPurchaseIncrement','Acquisti patrimoniali rilevanti')}{<label className="binary-field"><span>Eccezione saldo minore</span><input type="checkbox" checked={input.useClosingBalanceException} onChange={(event)=>setInput((current)=>({...current,useClosingBalanceException:event.target.checked}))}/></label>}{field('otherFinancialAssets','Altri patrimoni mobiliari')}{field('excludedGovernmentBonds','Titoli e risparmio postale esclusi')}{field('primaryHomeImuValue','Valore IMU abitazione principale')}{field('primaryHomeMortgageResidual','Mutuo residuo abitazione')}{input.calculationMode==='family_inclusion_2026'&&<label className="binary-field"><span>Casa in capoluogo metropolitano</span><input type="checkbox" checked={input.metropolitanCapitalHome} onChange={(event)=>setInput((current)=>({...current,metropolitanCapitalHome:event.target.checked}))}/></label>}{field('otherRealEstateImuValue','Altri immobili: valore IMU')}{field('otherRealEstateMortgageResidual','Altri immobili: mutui residui')}</div></section>
    <section className="section-block formula-ledger"><div className="section-title"><div><h2>Traccia del calcolo</h2><span>Stima orientativa: DSU e attestazione INPS restano l'unico risultato ufficiale</span></div></div><Table headers={['Passaggio','Valore']} rows={[["Conti considerati",money(result.accountValue)],["Eccezione saldo minore",result.closingBalanceExceptionApplied?'Applicata':'Non applicata'],["Patrimonio prima delle esclusioni",money(result.financialBeforeExclusion)],["Titoli/risparmio postale esclusi",money(result.excludedEligibleAssets)],["Franchigia mobiliare",money(result.movableFranchise)],["Patrimonio mobiliare netto",money(result.movableNet)],["Prima casa netta",money(result.primaryHomeNet)],["Franchigia prima casa",money(result.primaryHomeFranchise)],["Prima casa conteggiata",money(result.primaryHomeCounted)],["Altri immobili netti",money(result.otherRealEstateNet)],["Detrazione locazione",money(result.rentDeduction)],["ISE",money(result.ise)]]}/>{result.excludedAssetsOverCap>0&&<p className="formula-warning">La parte indicata oltre il limite complessivo di 50.000 euro non è stata esclusa.</p>}{input.calculationMode==='family_inclusion_2026'&&<p className="formula-warning">Questa variante vale soltanto per le specifiche prestazioni familiari e di inclusione previste per il 2026, non per ogni prestazione ISEE.</p>}</section></>
}

export function HealthAdvanced({ records, measurements, daily, catalog, sleep, workouts }: { records: AnalyticsRecord[]; measurements: Measurement[]; daily: DailyHealthMetric[]; catalog: HealthMetricCatalog[]; sleep: SleepRow[]; workouts: WorkoutRow[] }) {
  const [tab,setTab] = useState<'overview'|'nutrition'|'trends'|'clinical'>('overview')
  const meals = records.filter((row)=>row.payload.category==='nutrition.meal').slice().reverse()
  const nutrition = nutritionDaily(records)
  const labs = records.filter((row)=>row.kind==='lab_result').slice().reverse()
  const care = records.filter((row)=>['medication','diagnosis','vaccination','appointment'].includes(row.kind)).slice().reverse()
  const ecg = records.filter((row)=>row.payload.category==='health.ecg').slice().reverse()
  const routes = records.filter((row)=>row.payload.category==='health.route').slice().reverse()
  return <div className="specialist-module"><ModuleTabs value={tab} onChange={setTab} options={[["overview","Sintesi"],["nutrition","Nutrizione"],["trends","Trend"],["clinical","Clinico"]]}/>
    {tab==='overview'&&<HealthOverview records={records} measurements={measurements} daily={daily} sleep={sleep} workouts={workouts}/>}
    {tab==='nutrition'&&<NutritionView records={records} meals={meals} nutrition={nutrition}/>}
    {tab==='trends'&&<HealthTrends measurements={measurements} daily={daily} catalog={catalog} sleep={sleep}/>}
    {tab==='clinical'&&<ClinicalView labs={labs} care={care} ecg={ecg} routes={routes}/>}
  </div>
}

function latestMeasurement(measurements:Measurement[],keys:string[]) { const normalized=new Set(keys.map((key)=>key.toLowerCase())); return measurements.filter((row)=>normalized.has(row.metric_key.toLowerCase())).sort((a,b)=>a.measured_at.localeCompare(b.measured_at)).at(-1) }
function metricValue(row:DailyHealthMetric) {
  const key=row.metric_key.toLowerCase()
  if (/step|distance|active[._]?energy|exercise|stand([._]?(time|minutes|hours?))?|daylight|flight|basal[._]?energy/.test(key)) return row.value_sum ?? row.value_avg ?? row.value_last
  if (/weight|mass|height/.test(key)) return row.value_last ?? row.value_avg ?? row.value_sum
  return row.value_avg ?? row.value_last ?? row.value_sum
}
function latestDaily(daily:DailyHealthMetric[],pattern:RegExp) { return daily.filter((row)=>pattern.test(row.metric_key)).sort((a,b)=>a.observed_on.localeCompare(b.observed_on)).at(-1) }
function weightKg(value:number,unit:string) { return /^(lb|lbs|pound)/i.test(unit)?value*0.45359237:/^(kg|kilogram)/i.test(unit)?value:null }
function heightCm(value:number,unit:string) { return /^m$/i.test(unit)?value*100:/in|inch/i.test(unit)?value*2.54:/cm|centimet/i.test(unit)?value:null }

function ageOnDate(dateOfBirth:unknown,onDate:string) {
  if(typeof dateOfBirth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null
  const birth=new Date(`${dateOfBirth}T12:00:00Z`); const observed=new Date(`${onDate}T12:00:00Z`)
  if(!Number.isFinite(birth.getTime())||!Number.isFinite(observed.getTime())||observed<birth) return null
  let age=observed.getUTCFullYear()-birth.getUTCFullYear()
  if(observed.getUTCMonth()<birth.getUTCMonth()||(observed.getUTCMonth()===birth.getUTCMonth()&&observed.getUTCDate()<birth.getUTCDate())) age-=1
  return age
}

function HealthOverview({ records, measurements, daily, sleep, workouts }: { records:AnalyticsRecord[];measurements:Measurement[];daily:DailyHealthMetric[];sleep:SleepRow[];workouts:WorkoutRow[] }) {
  const profile = records.filter((row)=>row.payload.category==='health.profile').at(-1)
  const profileDetails = profile?details(profile):{}
  const targetRecord = records.filter((row)=>row.payload.category==='health.target').at(-1)
  const targetDetails = targetRecord?details(targetRecord):{}
  const measuredWeight = latestMeasurement(measurements,['body.weight','bodymass'])
  const measuredHeight = latestMeasurement(measurements,['body.height','height'])
  const importedWeight = latestDaily(daily,/bodymass|body[._]?weight/i)
  const importedHeight = latestDaily(daily,/(^|identifier)height$|body[._]?height/i)
  const measuredWeightDate = measuredWeight?.measured_at.slice(0,10)
  const measuredHeightDate = measuredHeight?.measured_at.slice(0,10)
  const useMeasuredWeight = Boolean(measuredWeight && (!importedWeight || measuredWeightDate! >= importedWeight.observed_on))
  const useMeasuredHeight = Boolean(measuredHeight && (!importedHeight || measuredHeightDate! >= importedHeight.observed_on))
  const weightValue = useMeasuredWeight ? measuredWeight!.value_numeric : importedWeight&&metricValue(importedWeight)!=null?finite(metricValue(importedWeight)):profileDetails.weight_kg==null?null:finite(profileDetails.weight_kg)
  const heightValue = useMeasuredHeight ? measuredHeight!.value_numeric : importedHeight&&metricValue(importedHeight)!=null?finite(metricValue(importedHeight)):profileDetails.height_cm==null?null:finite(profileDetails.height_cm)
  const weightUnit = useMeasuredWeight ? measuredWeight!.unit : importedWeight?.unit ?? 'kg'
  const heightUnit = useMeasuredHeight ? measuredHeight!.unit : importedHeight?.unit ?? 'cm'
  const observedOn = (useMeasuredWeight ? measuredWeightDate : importedWeight?.observed_on) ?? profile?.effective_date ?? todayRome()
  const age = profileDetails.age_years==null?ageOnDate(profileDetails.date_of_birth,observedOn):finite(profileDetails.age_years)
  const biologicalSex = text(profileDetails.biological_sex ?? profileDetails.sex,'')
  const bmi = weightValue!=null&&heightValue!=null ? calculateBmi(weightValue,weightUnit,heightValue,heightUnit) : null
  const normalizedHeightCm = heightValue==null?null:heightCm(heightValue,heightUnit)
  const normalizedWeightKg = weightValue==null?null:weightKg(weightValue,weightUnit)
  const bmr = normalizedWeightKg!=null&&normalizedHeightCm!=null&&age!=null?calculateMifflinStJeor(normalizedWeightKg,normalizedHeightCm,age,biologicalSex):null
  const energy = wearableEnergySummary(daily)
  const declaredTdee = optionalNumber(profileDetails.tdee_kcal) ?? optionalNumber(targetDetails.tdee_kcal)
  const tdee = declaredTdee ?? (energy.medianKcal==null?null:Math.round(energy.medianKcal/25)*25)
  const steps = latestDaily(daily,/stepcount|steps/i)
  const hrvBaseline = hrvBaselineSummary(daily)
  const hrv = latestDaily(daily.filter((row)=>!hrvBaseline.source||row.source_label===hrvBaseline.source),/variability|hrv/i)
  const rest = latestDaily(daily,/resting.*heart|heart.*resting/i)
  const oxygen = latestDaily(daily,/oxygen|spo2/i)
  const vo2 = latestDaily(daily,/vo2/i)
  const respiratory = latestDaily(daily,/respiratory/i)
  const wristTemperature = latestDaily(daily,/wrist.*temperature|sleeping.*temperature/i)
  const stepsSource=steps?.source_label
  const stepRows=daily.filter((row)=>stepsSource&&row.source_label===stepsSource&&/stepcount|steps/i.test(row.metric_key)&&metricValue(row)!=null).sort((a,b)=>a.observed_on.localeCompare(b.observed_on))
  const latestStepDate=stepRows.at(-1)?.observed_on
  const recentSteps=latestStepDate?stepRows.filter((row)=>Date.parse(`${row.observed_on}T12:00:00Z`)>=Date.parse(`${latestStepDate}T12:00:00Z`)-89*86400000).map((row)=>({date:row.observed_on,value:finite(metricValue(row))})):[]
  const medianSteps=datedSeriesStatistics(recentSteps).median
  const nutritionTargets=calculateNutritionTargets({
    tdeeKcal:tdee,weightKg:normalizedWeightKg,heightCm:normalizedHeightCm,
    deficitPercent:optionalNumber(targetDetails.deficit_percent),deficitMinimumKcal:optionalNumber(targetDetails.deficit_minimum_kcal),deficitMaximumKcal:optionalNumber(targetDetails.deficit_maximum_kcal),
    proteinGramsPerKg:optionalNumber(targetDetails.protein_g_per_kg),fatGramsPerKg:optionalNumber(targetDetails.fat_g_per_kg),surplusKcal:optionalNumber(targetDetails.surplus_kcal),energyPerKgKcal:optionalNumber(targetDetails.energy_per_kg_kcal),
    recentMedianSteps:medianSteps,stepIncrement:optionalNumber(targetDetails.step_increment),minimumSteps:optionalNumber(targetDetails.minimum_steps),maximumSteps:optionalNumber(targetDetails.maximum_steps),stepRounding:optionalNumber(targetDetails.step_rounding),
  })
  const hrvLow=optionalNumber(targetDetails.hrv_ratio_low)
  const hrvHigh=optionalNumber(targetDetails.hrv_ratio_high)
  const hrvContext=hrvBaseline.ratio7To60==null?'Baseline non disponibile':hrvLow!=null&&hrvBaseline.ratio7To60<hrvLow?'Sotto la propria baseline':hrvHigh!=null&&hrvBaseline.ratio7To60>hrvHigh?'Sopra la propria baseline':'In linea con la propria baseline'
  const validSleep = sleep.filter((row)=>row.valid_hours!=null&&row.valid_hours>0&&row.valid_hours<=24).sort((a,b)=>b.observed_on.localeCompare(a.observed_on)).slice(0,30)
  const averageSleep = validSleep.length?validSleep.reduce((sum,row)=>sum+finite(row.valid_hours),0)/validSleep.length:null
  const sleepWithEfficiency=validSleep.filter((row)=>row.efficiency!=null)
  const averageEfficiency=sleepWithEfficiency.length?sleepWithEfficiency.reduce((sum,row)=>sum+finite(row.efficiency),0)/sleepWithEfficiency.length:null
  const recentWorkouts = workouts.filter((row)=>row.observed_on>=shiftIsoDays(todayRome(),-29))
  const coveredSeries=(pattern:RegExp,preferredSource?:string|null)=>{const candidates=daily.filter((row)=>pattern.test(row.metric_key));const available=new Set(candidates.map((row)=>row.source_label));const selected=preferredSource&&available.has(preferredSource)?preferredSource:healthSourceCoverage(candidates)[0]?.source;return new Map(candidates.filter((row)=>row.source_label===selected&&metricValue(row)!=null).map((row)=>[row.observed_on,finite(metricValue(row))]))}
  const dailySteps=coveredSeries(/stepcount|steps/i,stepsSource);const dailyHrv=coveredSeries(/variability|hrv/i,hrvBaseline.source);const dailyRest=coveredSeries(/resting.*heart|heart.*resting/i,rest?.source_label);const dailyActive=coveredSeries(/active[._]?energy/i,energy.activeSource);const dailyBasal=coveredSeries(/basal[._]?energy/i,energy.basalSource)
  const weightCandidates=daily.filter((item)=>/weight|bodymass/i.test(item.metric_key));const weightSource=healthSourceCoverage(weightCandidates)[0]?.source
  const dailyWeight=new Map<string,{value:number;unit:string}>();for(const row of weightCandidates.filter((item)=>item.source_label===weightSource)){const value=metricValue(row);if(value!=null)dailyWeight.set(row.observed_on,{value:finite(value),unit:row.unit})};for(const row of measurements.filter((item)=>/weight|bodymass/i.test(item.metric_key)))dailyWeight.set(row.measured_at.slice(0,10),{value:row.value_numeric,unit:row.unit})
  const dailySleep=new Map(sleep.filter((row)=>row.valid_hours!=null).map((row)=>[row.observed_on,finite(row.valid_hours)]))
  const monitorDays=[...new Set([...dailySteps.keys(),...dailyHrv.keys(),...dailyRest.keys(),...dailyActive.keys(),...dailyBasal.keys(),...dailyWeight.keys(),...dailySleep.keys()])].sort().reverse().slice(0,14)
  const signalRow=(label:string,row:DailyHealthMetric|undefined,digits=2)=>[label,row&&metricValue(row)!=null?`${number(finite(metricValue(row)),digits)} ${row.unit}`:'—',row?date(row.observed_on):'—',row?.source_label??'—']
  return <><section className="special-metrics"><MiniMetric label="Peso" value={weightValue==null?'—':`${number(weightValue)} ${weightUnit}`} note={weightValue==null?'Dato non disponibile':date(observedOn)} icon={HeartPulse}/><MiniMetric label="BMI" value={bmi?number(bmi):'—'} note={bmi?'Derivato da peso e altezza':'Servono peso e altezza compatibili'} icon={Calculator}/><MiniMetric label="BMR Mifflin-St Jeor" value={bmr?`${number(bmr,0)} kcal`:'—'} note={bmr?`Età ${number(age??0,0)} · ${biologicalSex}`:'Servono peso, altezza, età e sesso biologico'} icon={Calculator}/><MiniMetric label="TDEE operativo" value={tdee?`${number(tdee,0)} kcal`:'—'} note={declaredTdee!=null?'Valore dichiarato e confermato':energy.medianKcal==null?'Servono energia attiva e basale':'Mediana wearable arrotondata a 25 kcal'} icon={Utensils}/><MiniMetric label="HRV 7g / 60g" value={hrvBaseline.ratio7To60==null?'—':number(hrvBaseline.ratio7To60,2)} note={hrvContext} icon={HeartPulse}/><MiniMetric label="Sonno medio 30 notti" value={averageSleep?`${number(averageSleep)} h`:'—'} note={averageEfficiency==null?`${validSleep.length} notti disponibili`:`Efficienza media ${number(averageEfficiency*100,1)}%`} icon={ShieldCheck}/></section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Segnali recenti</h2><span>HRV Apple è SDNN, non rMSSD; i segnali consumer non sono diagnosi</span></div></div><Table headers={['Metrica','Valore','Data','Fonte']} rows={[signalRow('Passi',steps,0),signalRow('HRV SDNN',hrv),signalRow('FC a riposo',rest),signalRow('Saturazione O₂',oxygen),signalRow('VO2max',vo2),signalRow('Frequenza respiratoria',respiratory),signalRow('Temperatura polso nel sonno',wristTemperature)]}/></div>
      <div className="section-block"><div className="section-title"><div><h2>Attività osservata</h2><span>Nessuna scheda di allenamento</span></div></div><div className="activity-summary"><span><strong>{recentWorkouts.length}</strong><small>sessioni negli ultimi 30 giorni</small></span><span><strong>{number(recentWorkouts.reduce((sum,row)=>sum+finite(row.duration_minutes),0),0)}</strong><small>minuti registrati</small></span><span><strong>{number(recentWorkouts.reduce((sum,row)=>sum+finite(row.distance_km),0))}</strong><small>km registrati</small></span></div></div></section>
    <section className="section-block"><div className="section-title"><div><h2>Monitor giornaliero</h2><span>Ultimi 14 giorni disponibili; sorgente con maggiore copertura per ogni metrica</span></div></div><Table headers={['Data','Peso','Passi','Energia wearable','HRV SDNN','FC riposo','Sonno']} rows={monitorDays.map((day)=>{const weight=dailyWeight.get(day);return[date(day),weight?`${number(weight.value)} ${weight.unit}`:'—',dailySteps.has(day)?number(dailySteps.get(day)!,0):'—',dailyActive.has(day)&&dailyBasal.has(day)?`${number(dailyActive.get(day)!+dailyBasal.get(day)!,0)} kcal`:'—',dailyHrv.has(day)?`${number(dailyHrv.get(day)!)} ms`:'—',dailyRest.has(day)?number(dailyRest.get(day)!):'—',dailySleep.has(day)?`${number(dailySleep.get(day)!)} h`:'—']})}/>{!monitorDays.length&&<Empty label="Nessun dato giornaliero disponibile"/>}</section>
    <section className="section-block"><div className="section-title"><div><h2>Metabolismo e target nutrizionali</h2><span>Assunzioni esplicite; arrotondamento calorie a 25 kcal e macro a 5 g</span></div></div><Table headers={['Indicatore','Valore','Metodo o fonte']} rows={[
      ['TDEE wearable grezzo',energy.medianKcal==null?'—':`${number(energy.medianKcal,0)} kcal`,energy.dayCount?`Mediana ${energy.dayCount} giorni completi · ${text(energy.activeSource)} + ${text(energy.basalSource)}`:'Dato mancante'],
      ['Deficit pianificato',nutritionTargets.deficitKcal==null?'—':`${number(nutritionTargets.deficitKcal,0)} kcal`,targetDetails.deficit_percent==null?'Assunzioni mancanti':`${number(finite(targetDetails.deficit_percent)*100,1)}% entro minimo/massimo`],
      ['Calorie dimagrimento',nutritionTargets.caloriesDeficit==null?'—':`${number(nutritionTargets.caloriesDeficit,0)} kcal`,'TDEE meno deficit'],
      ['Calorie mantenimento',nutritionTargets.caloriesMaintenance==null?'—':`${number(nutritionTargets.caloriesMaintenance,0)} kcal`,'TDEE operativo'],
      ['Calorie crescita controllata',nutritionTargets.caloriesGrowth==null?'—':`${number(nutritionTargets.caloriesGrowth,0)} kcal`,'TDEE più surplus dichiarato'],
      ['Proteine / grassi',nutritionTargets.proteinGrams==null||nutritionTargets.fatGrams==null?'—':`${number(nutritionTargets.proteinGrams,0)} g / ${number(nutritionTargets.fatGrams,0)} g`,'Peso per coefficienti dichiarati'],
      ['Carboidrati: deficit / mantenimento / crescita',nutritionTargets.carbohydratesDeficitGrams==null?'—':`${number(nutritionTargets.carbohydratesDeficitGrams,0)} / ${number(nutritionTargets.carbohydratesMaintenanceGrams??0,0)} / ${number(nutritionTargets.carbohydratesGrowthGrams??0,0)} g`,'Calorie residue dopo proteine e grassi'],
      ['Variazione peso attesa',nutritionTargets.expectedWeeklyWeightChange==null?'—':`${number(nutritionTargets.expectedWeeklyWeightChange,2)} kg/settimana`,'Semplificazione energetica, non previsione'],
      ['Passi mediani 90g / target',medianSteps==null?'—':`${number(medianSteps,0)} / ${nutritionTargets.stepTarget==null?'—':number(nutritionTargets.stepTarget,0)}`,'Una sorgente, giorni osservati'],
      ['Checkpoint peso',nutritionTargets.checkpointWeight==null?'—':`${number(nutritionTargets.checkpointWeight,1)} kg`,'Massimo tra BMI 18,5 e peso meno 2 kg'],
      ['Soglie operative',`Calorie ±${text(targetDetails.calorie_tolerance_kcal)} · proteine ${text(targetDetails.protein_threshold_g)} g`,`Sonno ${text(targetDetails.sleep_target_hours)} h · HRV ${text(targetDetails.hrv_ratio_low)}–${text(targetDetails.hrv_ratio_high)}`],
      ['Fase attiva',text(targetDetails.active_phase),'Dato dichiarato'],
    ]}/></section></>
}

function NutritionView({ records, meals, nutrition }: { records:AnalyticsRecord[];meals:AnalyticsRecord[];nutrition:ReturnType<typeof nutritionDaily> }) {
  const targetRecords = records.filter((row)=>row.payload.category==='health.target')
  const targetRecord = targetRecords.at(-1)
  const target = targetRecord?details(targetRecord):{}
  const recent = nutrition.slice(-14)
  return <><section className="special-metrics"><MiniMetric label="Target calorie" value={target.calories_kcal?`${number(finite(target.calories_kcal),0)} kcal`:'—'} note="Target confermato" icon={Utensils}/><MiniMetric label="Target proteine" value={target.protein_g?`${number(finite(target.protein_g),0)} g`:'—'} note="Target confermato" icon={ShieldCheck}/><MiniMetric label="Target carboidrati" value={target.carbs_g?`${number(finite(target.carbs_g),0)} g`:'—'} note="Target confermato" icon={Utensils}/><MiniMetric label="Target grassi" value={target.fat_g?`${number(finite(target.fat_g),0)} g`:'—'} note={target.fibre_g?`Fibre ${number(finite(target.fibre_g),0)} g`:'Fibre da definire'} icon={ShieldCheck}/><MiniMetric label="Pasti registrati" value={String(meals.length)} note={`${nutrition.length} giornate`} icon={Utensils}/></section>
    <section className="section-block"><div className="section-title"><div><h2>Storico parametri nutrizionali</h2><span>Ogni modifica resta una versione datata e indipendente</span></div></div><Table headers={['Data','Fase','TDEE','kcal','Proteine','Carboidrati','Grassi','Fibre','Passi min/max','Sonno','HRV min/max']} rows={targetRecords.slice().reverse().map((row)=>{const d=details(row);return[date(row.effective_date),text(d.active_phase),d.tdee_kcal==null?'—':`${number(finite(d.tdee_kcal),0)} kcal`,d.calories_kcal==null?'—':`${number(finite(d.calories_kcal),0)} kcal`,d.protein_g==null?'—':`${number(finite(d.protein_g),0)} g`,d.carbs_g==null?'—':`${number(finite(d.carbs_g),0)} g`,d.fat_g==null?'—':`${number(finite(d.fat_g),0)} g`,d.fibre_g==null?'—':`${number(finite(d.fibre_g),0)} g`,d.minimum_steps==null&&d.maximum_steps==null?'—':`${text(d.minimum_steps)} / ${text(d.maximum_steps)}`,d.sleep_target_hours==null?'—':`${number(finite(d.sleep_target_hours))} h`,d.hrv_ratio_low==null&&d.hrv_ratio_high==null?'—':`${text(d.hrv_ratio_low)} / ${text(d.hrv_ratio_high)}`]})}/>{!targetRecords.length&&<Empty label="Parametri nutrizionali non ancora confermati"/>}</section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Energia stimata</h2><span>Valore centrale e intervallo dichiarato dalle foto</span></div></div>{recent.length?<div className="special-chart tall"><ResponsiveContainer><LineChart data={recent}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date" tickFormatter={(v)=>String(v).slice(5)}/><YAxis/><Tooltip/><Legend/><Line dataKey="caloriesLow" name="Min kcal" stroke="#8b949e" dot={false}/><Line dataKey="calories" name="Kcal" stroke="#b44d57" strokeWidth={2.5}/><Line dataKey="caloriesHigh" name="Max kcal" stroke="#8b949e" dot={false}/></LineChart></ResponsiveContainer></div>:<Empty label="Nessun pasto ancora confermato"/>}</div><div className="section-block"><div className="section-title"><div><h2>Macronutrienti</h2><span>Grammi giornalieri, non calorie impilate</span></div></div>{recent.length?<div className="special-chart tall"><ResponsiveContainer><BarChart data={recent}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date" tickFormatter={(v)=>String(v).slice(5)}/><YAxis/><Tooltip/><Legend/><Bar dataKey="protein" name="Proteine g" fill="#167d65"/><Bar dataKey="carbs" name="Carboidrati g" fill="#1d4f7a"/><Bar dataKey="fat" name="Grassi g" fill="#d3922b"/></BarChart></ResponsiveContainer></div>:<Empty label="Macronutrienti non disponibili"/>}</div></section>
    <section className="section-block"><div className="section-title"><div><h2>Riepilogo giornaliero</h2><span>Coerenza energetica dei macro e copertura dei pasti</span></div></div><Table headers={['Data','Pasti','kcal','Intervallo','kcal dai macro','Scarto','Fibre','Sodio','Stime']} rows={recent.slice().reverse().map((row)=>[date(row.date),String(row.meals),number(row.calories,0),`${number(row.caloriesLow,0)}–${number(row.caloriesHigh,0)}`,number(row.macroCalories,0),`${row.macroDelta>=0?'+':''}${number(row.macroDelta,0)}`,`${number(row.fibre)} g`,row.sodium?`${number(row.sodium,0)} mg`:'—',`${row.estimatedMeals}/${row.meals}`])}/>{!recent.length&&<Empty label="Nessun riepilogo nutrizionale"/>}</section>
    <section className="section-block"><div className="section-title"><div><h2>Diario pasti da foto</h2><span>Ogni componente conserva porzione, fonte e incertezza; i pasti sono distinti per ID</span></div></div><Table headers={['Data','Ora','ID pasto','Tipo','Componente','Quantità','Riferimento','kcal','Proteine','Carboidrati','Grassi','Fibre','Sodio','Confidenza','Incertezza','Note']} rows={meals.slice(0,100).map((row)=>{const d=details(row);const quantity=d.quantity_text??(d.quantity_value==null?null:`${number(finite(d.quantity_value))} ${text(d.quantity_unit,'')}`.trim());return [date(row.effective_date),text(d.time),text(d.meal_id),text(d.meal_type),text(d.food_component,row.title),text(quantity),text(d.photo_reference),d.calories==null?'—':number(finite(d.calories),0),d.protein_g==null?'—':`${number(finite(d.protein_g))} g`,d.carbs_g==null?'—':`${number(finite(d.carbs_g))} g`,d.fat_g==null?'—':`${number(finite(d.fat_g))} g`,d.fibre_g==null?'—':`${number(finite(d.fibre_g))} g`,d.sodium_mg==null?'—':`${number(finite(d.sodium_mg),0)} mg`,text(d.confidence_label,text(row.evidence_status,'Stimata')),d.uncertainty_kcal==null?'—':`±${number(finite(d.uncertainty_kcal),0)} kcal`,text(d.notes??d.evidence_note)]})}/>{!meals.length&&<Empty label="Invia una foto al GPT Personal OS per creare la prima proposta"/>}</section></>
}

function HealthTrends({ measurements, daily, catalog, sleep }: { measurements:Measurement[];daily:DailyHealthMetric[];catalog:HealthMetricCatalog[];sleep:SleepRow[] }) {
  const metricOptions = useMemo(() => {
    const unique = new Map<string,string>()
    for (const row of catalog) unique.set(row.metric_key, healthMetricLabel(row.metric_key))
    for (const row of daily) if(!unique.has(row.metric_key)) unique.set(row.metric_key, healthMetricLabel(row.metric_key))
    for (const row of measurements) if(!unique.has(row.metric_key)) unique.set(row.metric_key, healthMetricLabel(row.metric_key))
    return [...unique.entries()].sort((a,b)=>a[1].localeCompare(b[1],'it'))
  },[catalog,daily,measurements])
  const [metric,setMetric] = useState('')
  const selectedMetric = metric || metricOptions[0]?.[0] || ''
  const [series,setSeries]=useState<DailyHealthMetric[]>([])
  const [coverage,setCoverage]=useState<{returned:number;total:number;truncated:boolean}|null>(null)
  const [source,setSource]=useState('')
  useEffect(()=>{let active=true;const manual=measurements.filter((row)=>row.metric_key===selectedMetric).map((row)=>({id:`manual-${row.id}`,observed_on:row.measured_at.slice(0,10),metric_key:row.metric_key,source_label:'Inserimento manuale',unit:row.unit,record_count:1,value_sum:null,value_avg:null,value_min:row.value_numeric,value_max:row.value_numeric,value_first:row.value_numeric,value_last:row.value_numeric}));if(!selectedMetric){setSeries([]);setCoverage(null);return()=>{active=false}};getHealthSeries<DailyHealthMetric>(selectedMetric).then((result)=>{if(active){setSeries([...result.rows,...manual]);setCoverage({returned:result.coverage.returned+manual.length,total:result.coverage.total+manual.length,truncated:result.coverage.truncated})}}).catch(()=>{if(active){const fallback=[...daily.filter((row)=>row.metric_key===selectedMetric),...manual];setSeries(fallback);setCoverage({returned:fallback.length,total:fallback.length,truncated:false})}});return()=>{active=false}},[selectedMetric,daily,measurements])
  const sourceOptions=useMemo(()=>healthSourceCoverage(series).map((row)=>[row.source,row.totalDays,row.recentDays] as const),[series])
  const selectedSource=sourceOptions.some(([label])=>label===source)?source:sourceOptions[0]?.[0]??''
  const baseMetricRows = series.filter((row)=>row.source_label===selectedSource&&metricValue(row)!=null).sort((a,b)=>a.observed_on.localeCompare(b.observed_on)).map((row)=>({date:row.observed_on,value:finite(metricValue(row))}))
  const rolling7 = rollingCalendarAverage(baseMetricRows,7)
  const rolling60 = rollingCalendarAverage(baseMetricRows,60)
  const metricRows = rolling7.map((row,index)=>({...row,rolling7:row.rolling,rolling60:rolling60[index]?.rolling??null}))
  const metricStats = datedSeriesStatistics(baseMetricRows)
  const periodStats = periodComparisonStatistics(baseMetricRows)
  const monthlyStats = monthlySeriesStatistics(baseMetricRows).slice(-24)
  const weightByDate = new Map<string,number>()
  const weightCandidates=daily.filter((item)=>/weight|bodymass/i.test(item.metric_key));const weightSource=healthSourceCoverage(weightCandidates)[0]?.source
  for(const row of weightCandidates.filter((item)=>item.source_label===weightSource)) { const value=metricValue(row); const normalized=value==null?null:weightKg(finite(value),row.unit); if(normalized!=null) weightByDate.set(row.observed_on,normalized) }
  for(const row of measurements.filter((item)=>/weight|bodymass/i.test(item.metric_key))) { const normalized=weightKg(row.value_numeric,row.unit); if(normalized!=null) weightByDate.set(row.measured_at.slice(0,10),normalized) }
  const weights = rollingCalendarAverage([...weightByDate.entries()].map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date)),7)
  const sleepRows = sleep.filter((row)=>row.valid_hours!=null&&row.valid_hours>0&&row.valid_hours<=24).sort((a,b)=>a.observed_on.localeCompare(b.observed_on)).slice(-365).map((row)=>({date:row.observed_on,value:row.valid_hours as number,detected:row.detected_hours,efficiency:row.efficiency,core:row.core_minutes==null?null:row.core_minutes/60,deep:row.deep_minutes==null?null:row.deep_minutes/60,rem:row.rem_minutes==null?null:row.rem_minutes/60,awake:row.awake_minutes==null?null:row.awake_minutes/60,status:row.source_status}))
  const selectedCatalog=catalog.find((row)=>row.metric_key===selectedMetric)
  const selectedUnit=series.find((row)=>row.source_label===selectedSource)?.unit??selectedCatalog?.unit??'Unità dalla fonte'
  return <><section className="special-metrics"><MiniMetric label="Ultimo valore" value={periodStats.last==null?'—':`${number(periodStats.last)} ${selectedUnit}`} note={periodStats.lastDate?date(periodStats.lastDate):'Data non disponibile'} icon={HeartPulse}/><MiniMetric label="Media 28 / 90 giorni" value={periodStats.average28==null?'—':`${number(periodStats.average28)} / ${periodStats.average90==null?'—':number(periodStats.average90)}`} note={selectedUnit} icon={Calculator}/><MiniMetric label="Δ vs 90 giorni precedenti" value={periodStats.changeVsPrevious90==null?'—':`${periodStats.changeVsPrevious90>=0?'+':''}${number(periodStats.changeVsPrevious90*100,1)}%`} note="Confronto osservazionale, non diagnosi" icon={ShieldCheck}/><MiniMetric label="Copertura ultimi 90 giorni" value={periodStats.coverage90==null?'—':`${number(periodStats.coverage90*100,1)}%`} note={periodStats.cadenceDays==null?`Cadenza non determinabile con ${periodStats.observations90} osservazion${periodStats.observations90===1?'e':'i'}`:`${periodStats.observations90} su ${periodStats.expectedObservations90} attese con cadenza ~${number(periodStats.cadenceDays,0)}g`} icon={ShieldCheck}/><MiniMetric label="Variabilità intervallo" value={metricStats.standardDeviation==null?'—':number(metricStats.standardDeviation)} note={`${metricStats.count} osservazioni · deviazione standard`} icon={HeartPulse}/><MiniMetric label="Pendenza / 30 giorni" value={metricStats.slopePer30Days==null?'—':`${metricStats.slopePer30Days>=0?'+':''}${number(metricStats.slopePer30Days)}`} note="Retta sull'intervallo caricato, non previsione" icon={Calculator}/></section><section className="section-block"><div className="section-title"><div><h2>Trend salute completo</h2><span>{metricOptions.length} metriche · {coverage?.returned??0}/{coverage?.total??0} righe caricate{coverage?.truncated?' · serie limitata':''}</span></div><div className="chart-selectors"><select value={selectedMetric} onChange={(e)=>{setMetric(e.target.value);setSource('')}}>{metricOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{sourceOptions.length>1&&<select aria-label="Sorgente salute" value={selectedSource} onChange={(e)=>setSource(e.target.value)}>{sourceOptions.map(([label,total,recent])=><option key={label} value={label}>{label} · {recent} recenti / {total} totali</option>)}</select>}</div></div>{metricRows.length?<div className="special-chart tall"><ResponsiveContainer><LineChart data={metricRows}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date" tickFormatter={(v)=>String(v).slice(5)}/><YAxis/><Tooltip/><Legend/><Line dataKey="value" name={healthMetricLabel(selectedMetric)} stroke="#8b949e" dot={false}/><Line dataKey="rolling7" name="Media mobile 7 giorni" stroke="#167d65" dot={false} strokeWidth={2.5}/><Line dataKey="rolling60" name="Baseline mobile 60 giorni" stroke="#1d4f7a" strokeDasharray="5 4" dot={false}/></LineChart></ResponsiveContainer></div>:<Empty label="Metrica non presente nella sorgente selezionata"/>}</section><section className="section-block"><div className="section-title"><div><h2>Confronto per periodi</h2><span>Nessuna imputazione: i giorni mancanti restano mancanti</span></div></div><Table headers={['Periodo','Media','Copertura / confronto']} rows={[['Ultimi 28 giorni',periodStats.average28==null?'—':number(periodStats.average28),'Finestra mobile'],['Ultimi 90 giorni',periodStats.average90==null?'—':number(periodStats.average90),periodStats.coverage90==null?'Cadenza non determinabile':`${number(periodStats.coverage90*100,1)}% della cadenza osservata`],['90 giorni precedenti',periodStats.previous90==null?'—':number(periodStats.previous90),periodStats.changeVsPrevious90==null?'Confronto non disponibile':`${periodStats.changeVsPrevious90>=0?'+':''}${number(periodStats.changeVsPrevious90*100,1)}%`],['Ultimi 365 giorni',periodStats.average365==null?'—':number(periodStats.average365),'Finestra mobile']]}/></section>
    <section className="section-block"><div className="section-title"><div><h2>Trend mensile</h2><span>Media, mediana, estremi e giorni osservati</span></div></div>{monthlyStats.length?<><div className="special-chart"><ResponsiveContainer><LineChart data={monthlyStats}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="month"/><YAxis/><Tooltip/><Legend/><Line dataKey="mean" name="Media" stroke="#167d65" strokeWidth={2.5}/><Line dataKey="median" name="Mediana" stroke="#1d4f7a" dot={false}/></LineChart></ResponsiveContainer></div><Table headers={['Mese','Giorni','Media','Mediana','Min','Max']} rows={monthlyStats.slice(-12).reverse().map((row)=>[row.month,String(row.count),number(row.mean),number(row.median),number(row.minimum),number(row.maximum)])}/></>:<Empty label="Storico mensile non disponibile"/>}</section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Peso</h2><span>Pesate in kg e media mobile a 7 giorni</span></div></div>{weights.length?<div className="special-chart"><ResponsiveContainer><LineChart data={weights}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date"/><YAxis domain={['dataMin - 2','dataMax + 2']}/><Tooltip formatter={(value)=>`${number(Number(value))} kg`}/><Legend/><Line dataKey="value" name="Peso kg" stroke="#8b949e" dot={false}/><Line dataKey="rolling" name="Media 7 giorni kg" stroke="#b44d57" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div>:<Empty label="Pesate non ancora disponibili"/>}</div><div className="section-block"><div className="section-title"><div><h2>Sonno</h2><span>Fasi, veglia, durata ed efficienza; massimo 365 notti nel grafico</span></div></div>{sleepRows.length?<><div className="special-chart"><ResponsiveContainer><ComposedChart data={sleepRows}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date" hide/><YAxis/><Tooltip/><Legend/><Bar dataKey="core" name="Core h" stackId="sleep" fill="#5c6470"/><Bar dataKey="deep" name="Profondo h" stackId="sleep" fill="#173f5f"/><Bar dataKey="rem" name="REM h" stackId="sleep" fill="#3d8da8"/><Line dataKey="awake" name="Veglia h" stroke="#d3922b" dot={false}/><Line dataKey="value" name="Totale valido h" stroke="#b44d57"/></ComposedChart></ResponsiveContainer></div><Table headers={['Data','Rilevato','Valido','Efficienza','Core','Profondo','REM','Veglia','Stato fonte']} rows={sleepRows.slice(-30).reverse().map((row)=>[date(row.date),row.detected==null?'—':`${number(row.detected)} h`,`${number(row.value)} h`,row.efficiency==null?'—':`${number(row.efficiency*100,1)}%`,row.core==null?'—':`${number(row.core)} h`,row.deep==null?'—':`${number(row.deep)} h`,row.rem==null?'—':`${number(row.rem)} h`,row.awake==null?'—':`${number(row.awake)} h`,text(row.status)])}/></>:<Empty label="Dati sonno non disponibili"/>}</div></section></>
}

function healthMetricLabel(key:string) {
  const value=key.toLowerCase()
  const labels:Array<[RegExp,string]>=[
    [/heartratevariability|variability|hrv/,'HRV SDNN'],
    [/resting.*heart|heart.*resting/,'Frequenza cardiaca a riposo'],
    [/walkingheartrateaverage|heart[._]walking[._]average/,'Frequenza cardiaca media camminando'],
    [/heartraterecovery|heart[._]recovery/,'Recupero frequenza cardiaca a 1 minuto'],
    [/^heartrate$|identifierheartrate$|^heart[._]rate$/,'Frequenza cardiaca'],
    [/stepcount|steps/,'Passi'],
    [/distancewalkingrunning|walkingrunningdistance|walk[._]run[._]distance/,'Distanza cammino e corsa'],
    [/distancecycling|cycling[._]distance/,'Distanza ciclismo'],
    [/sixminutewalk|six[._]minute[._]walk/,'Test cammino di 6 minuti'],
    [/active[._]?energy/,'Energia attiva'],
    [/basal[._]?energy/,'Energia basale'],
    [/physical[._]?effort/,'Sforzo fisico'],
    [/appleexercisetime|exercise/,'Minuti esercizio'],
    [/applestandhour|stand[._]hours/,'Ore in piedi completate'],
    [/applestandtime|standtime|stand[._]minutes/,'Tempo in piedi'],
    [/flight.*climb/,'Piani saliti'],
    [/breathing[._]?disturbance/,'Disturbi respiratori nel sonno'],
    [/oxygen|spo2/,'Saturazione ossigeno'],
    [/respiratory/,'Frequenza respiratoria'],
    [/vo2/,'VO2max stimato'],
    [/daylight/,'Tempo alla luce diurna'],
    [/sleepingwristtemperature|wrist[._]?temperature/,'Temperatura polso nel sonno'],
    [/sleepdurationgoal|sleep[._]duration[._]goal/,'Durata sonno desiderata'],
    [/sleepanalysis|sleep[._]analysis/,'Analisi del sonno'],
    [/walkingspeed|walking[._]speed/,'Velocità cammino'],
    [/walkingsteplength|walking[._]step[._]length/,'Lunghezza passo'],
    [/walkingasymmetry|walking[._]asymmetry/,'Asimmetria cammino'],
    [/walkingdoublesupport|walking[._]double[._]support/,'Doppio appoggio'],
    [/walkingsteadiness|walking[._]steadiness/,'Stabilità cammino'],
    [/stairascentspeed|stair[._]ascent[._]speed/,'Velocità salita scale'],
    [/stairdescentspeed|stair[._]descent[._]speed/,'Velocità discesa scale'],
    [/running[._]?power/,'Potenza corsa'],
    [/running[._]?speed/,'Velocità corsa'],
    [/running[._]?stride[._]?length/,'Lunghezza falcata corsa'],
    [/running[._]?ground[._]?contact/,'Tempo contatto a terra'],
    [/running[._]?vertical[._]?oscillation/,'Oscillazione verticale corsa'],
    [/environmental[._]?exposure[._]?event/,'Eventi di esposizione audio ambientale'],
    [/headphone[._]?exposure[._]?event/,'Eventi di esposizione audio cuffie'],
    [/environmental[._]?audio[._]?exposure|audio[._]environmental[._]exposure/,'Esposizione audio ambientale'],
    [/headphone[._]?audio[._]?exposure|audio[._]headphone[._]exposure/,'Esposizione audio cuffie'],
    [/audioexposureevent/,'Eventi di esposizione audio'],
    [/handwashing/,'Lavaggio mani'],
    [/bodymass|body[._]?weight/,'Peso corporeo'],
    [/(^|identifier)height$|body[._]?height/,'Altezza'],
    [/waist|vita/,'Circonferenza vita'],
    [/body[._]?fat|massa[._]?grassa/,'Massa grassa'],
    [/blood[._]?pressure[._]?systolic|pressione[._]?sistolica/,'Pressione sistolica'],
    [/blood[._]?pressure[._]?diastolic|pressione[._]?diastolica/,'Pressione diastolica'],
    [/blood[._]?glucose|glicemia/,'Glicemia'],
    [/body[._]?temperature|temperatura[._]?corporea/,'Temperatura corporea'],
  ]
  return labels.find(([pattern])=>pattern.test(value))?.[1]??key.replaceAll('_',' ').replaceAll('.',' ')
}

function ClinicalView({ labs, care, ecg, routes }: { labs:AnalyticsRecord[];care:AnalyticsRecord[];ecg:AnalyticsRecord[];routes:AnalyticsRecord[] }) {
  return <><section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Esami e laboratorio</h2><span>{labs.length} risultati</span></div></div><Table headers={['Data','Esame','Valore','Intervallo','Esito']} rows={labs.slice(0,50).map((row)=>[date(row.effective_date),text(row.payload.test_key),`${text(row.payload.value)} ${text(row.payload.unit,'')}`.trim(),text(row.payload.reference_range),text(row.payload.flag)])}/>{!labs.length&&<Empty label="Nessun risultato clinico confermato"/>}</div><div className="section-block"><div className="section-title"><div><h2>Terapie e appuntamenti</h2><span>{care.length} elementi</span></div></div><Table headers={['Data','Tipo','Voce','Stato']} rows={care.slice(0,50).map((row)=>[date(row.effective_date),row.kind.replaceAll('_',' '),row.title,text(row.payload.status)])}/>{!care.length&&<Empty label="Nessun elemento clinico confermato"/>}</div></section><section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>ECG registrati</h2><span>Classificazione del dispositivo, non diagnosi clinica</span></div></div><Table headers={['Data','Classificazione','Dispositivo','Durata','Frequenza campionamento']} rows={ecg.slice(0,50).map((row)=>{const d=details(row);return[date(row.effective_date),text(d.classification),text(d.device),d.duration_seconds==null?'—':`${number(finite(d.duration_seconds),0)} s`,d.sampling_hz==null?'—':`${number(finite(d.sampling_hz),0)} Hz`]})}/>{!ecg.length&&<Empty label="Nessun ECG confermato"/>}</div><div className="section-block"><div className="section-title"><div><h2>Percorsi attività</h2><span>Coordinate escluse dalla dashboard</span></div></div><Table headers={['Data','Attività','Durata','Distanza','Dislivello']} rows={routes.slice(0,50).map((row)=>{const d=details(row);return[date(row.effective_date),text(d.activity_type,row.title),d.duration_minutes==null?'—':`${number(finite(d.duration_minutes))} min`,d.distance_km==null?'—':`${number(finite(d.distance_km))} km`,d.elevation_gain_m==null?'—':`${number(finite(d.elevation_gain_m),0)} m`]})}/>{!routes.length&&<Empty label="Nessun percorso sintetico confermato"/>}</div></section></>
}

export function HomeAdvanced({ records, rules, benefits, monitors }: { records:AnalyticsRecord[];rules:RegulatoryRule[];benefits:BenefitOpportunity[];monitors:MonitorRun[] }) {
  const [tab,setTab]=useState<'property'|'vehicle'|'benefits'>('property')
  return <div className="specialist-module"><ModuleTabs value={tab} onChange={setTab} options={[["property","Casa"],["vehicle","Auto"],["benefits","Bonus"]]}/>{tab==='property'&&<PropertyView records={records}/>} {tab==='vehicle'&&<VehicleView records={records} rules={rules}/>} {tab==='benefits'&&<BenefitsView records={records} benefits={benefits} monitors={monitors}/>}</div>
}

function PropertyView({records}:{records:AnalyticsRecord[]}) {
  const registry=records.filter((row)=>row.payload.category==='property.registry').slice().reverse()
  const bills=records.filter((row)=>row.kind==='utility_bill').slice().reverse()
  const utilities=utilityMonthly(records).slice(-18)
  const utilityTotals=utilitySummary(records)
  const maintenance=records.filter((row)=>row.payload.category==='maintenance'&&!/auto|vehicle/i.test(`${row.title} ${text(details(row).asset,'')}`)).slice().reverse()
  return <><section className="special-metrics"><MiniMetric label="Unità immobiliari" value={String(registry.length)} note="Schede catastali versionate" icon={Home}/><MiniMetric label="Bollette" value={String(bills.length)} note="Costi e consumi per periodo" icon={WalletCards}/><MiniMetric label="Manutenzioni" value={String(maintenance.length)} note="Con prossimo controllo" icon={ShieldCheck}/></section>
    <section className="section-block"><div className="section-title"><div><h2>Registro catastale</h2><span>Dati identificativi, classamento, diritto e quota</span></div></div><Table headers={['Immobile','Comune','Sezione','Foglio','Particella','Subalterno','Zona','Categoria','Classe','Consistenza','Superficie','Rendita','Diritto','Quota']} rows={registry.map((row)=>{const d=details(row);return [row.title,text(d.municipality),text(d.cadastral_section),text(d.sheet),text(d.parcel),text(d.subaltern),text(d.census_zone),text(d.cadastral_category),text(d.cadastral_class),text(d.consistency),d.surface_sqm==null?'—':`${number(finite(d.surface_sqm))} m²`,d.cadastral_income==null?'—':money(finite(d.cadastral_income)),text(d.ownership_right),d.ownership_share==null?'—':`${number(finite(d.ownership_share)*100)}%`]})}/>{!registry.length&&<Empty label="Visura catastale non ancora acquisita"/>}</section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Costi utenze</h2><span>Andamento mensile per servizio</span></div></div>{utilities.length?<div className="special-chart tall"><ResponsiveContainer><BarChart data={utilities}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="month"/><YAxis/><Tooltip formatter={(v)=>money(Number(v))}/><Legend/><Bar dataKey="electricity" name="Energia" stackId="a" fill="#d3922b"/><Bar dataKey="gas" name="Gas" stackId="a" fill="#b44d57"/><Bar dataKey="water" name="Acqua" stackId="a" fill="#3d8da8"/><Bar dataKey="waste" name="Rifiuti" stackId="a" fill="#6f7d4c"/><Bar dataKey="internet" name="Internet" stackId="a" fill="#1d4f7a"/></BarChart></ResponsiveContainer></div>:<Empty label="Bollette non ancora disponibili"/>}</div><div className="section-block"><div className="section-title"><div><h2>Manutenzioni casa</h2><span>Intervalli documentati</span></div></div><Table headers={['Data','Intervento','Bene','Prossimo controllo','Regola']} rows={maintenance.slice(0,40).map((row)=>{const d=details(row);return [date(row.effective_date),row.title,text(d.asset),d.next_due_on?date(String(d.next_due_on)):'Da definire',text(d.rule_key)]})}/>{!maintenance.length&&<Empty label="Nessuna manutenzione registrata"/>}</div></section>
    <section className="section-block"><div className="section-title"><div><h2>Indicatori utenze</h2><span>Costi unitari separati per servizio e unità di misura</span></div></div><Table headers={['Servizio','Periodo','Bollette','Consumo','Costo','Costo unitario']} rows={utilityTotals.map((row)=>[utilityLabel(row.type),`${date(row.firstPeriod)} – ${date(row.lastPeriod)}`,String(row.bills),row.consumption?`${number(row.consumption)} ${row.unit}`:'—',money(row.amount),row.unitCost==null?'—':`${money(row.unitCost)}/${row.unit}`])}/>{!utilityTotals.length&&<Empty label="Indicatori disponibili dopo il primo ciclo di bollette"/>}</section>
    <section className="section-block"><div className="section-title"><div><h2>Consumi da bolletta</h2><span>Unità mantenute separate, senza confronti impropri</span></div></div><Table headers={['Data','Servizio','Periodo','Consumo','Fornitore','Costo']} rows={bills.filter((row)=>row.payload.consumption!=null).slice(0,60).map((row)=>[date(row.effective_date),utilityLabel(String(row.payload.utility_type)),`${text(row.payload.period_start)} / ${text(row.payload.period_end)}`,`${number(finite(row.payload.consumption))} ${text(row.payload.consumption_unit,'')}`.trim(),text(row.payload.provider),money(finite(row.payload.amount))])}/>{!bills.some((row)=>row.payload.consumption!=null)&&<Empty label="Nessun consumo ancora estratto dalle bollette"/>}</section></>
}

function utilityLabel(value:string) { return ({electricity:'Energia',gas:'Gas',water:'Acqua',internet:'Internet',mobile:'Telefonia',waste:'Rifiuti',other:'Altro'} as Record<string,string>)[value]??value }

function VehicleView({records,rules}:{records:AnalyticsRecord[];rules:RegulatoryRule[]}) {
  const profiles=records.filter((row)=>row.payload.category==='vehicle.profile').slice().reverse()
  const profile=profiles[0]
  const p=profile?details(profile):{}
  const costs=records.filter((row)=>row.payload.category==='vehicle.cost').map((row)=>({category:text(details(row).cost_category,'other'),amount:finite(details(row).amount??row.payload.value)}))
  const valuations=records.filter((row)=>row.payload.category==='vehicle.valuation').sort((a,b)=>a.effective_date.localeCompare(b.effective_date))
  const valuation=valuations.at(-1)
  const v=valuation?details(valuation):{}
  const purchaseDate=typeof p.purchase_date==='string'?p.purchase_date:''
  const purchaseTime=Date.parse(`${purchaseDate}T12:00:00Z`)
  const years=Number.isFinite(purchaseTime)?Math.max(0,(Date.now()-purchaseTime)/(365.25*86400000)):0
  const hasValuation=Boolean(valuation&&v.market_value!=null)
  const opportunityRate=Math.max(0,finite(p.opportunity_rate))
  const tco=calculateVehicleTco({purchasePrice:finite(p.purchase_price),currentResidualValue:hasValuation?finite(v.market_value):finite(p.purchase_price),ownershipYears:years,kilometresDriven:Math.max(0,finite(p.current_odometer)-finite(p.purchase_odometer)),runningCosts:costs,annualOpportunityRate:opportunityRate})
  const maintenance=records.filter((row)=>row.payload.category==='maintenance'&&/auto|vehicle|veicolo/i.test(`${row.title} ${text(details(row).asset,'')}`)).slice().reverse()
  const annualCosts=vehicleCostsAnnual(records)
  const valuationHistory=valuations.map((row)=>({date:row.effective_date,value:finite(details(row).market_value)})).filter((row)=>row.value>=0)
  const costRows=[['insurance','Assicurazione'],['road_tax','Bollo e tributi'],['inspection','Revisione'],['service','Tagliandi'],['tires','Pneumatici'],['brakes','Freni'],['battery','Batteria'],['fuel_energy','Carburante o ricariche'],['parking_tolls','Parcheggi e pedaggi'],['washing_accessories','Lavaggi e accessori'],['financing_interest','Interessi finanziamento'],['extraordinary','Manutenzione straordinaria'],['other','Altro']]
  const completeTco=Boolean(p.purchase_price&&purchaseDate&&hasValuation&&years>0)
  return <><section className="special-metrics"><MiniMetric label="Costo totale proprietà" value={completeTco?money(tco.totalCost):'—'} note={completeTco?'Svalutazione, costi e costo opportunità':'Servono acquisto, data e valore residuo'} icon={Car}/><MiniMetric label="Svalutazione" value={completeTco?money(tco.depreciation):'—'} note={tco.appreciation?`Rivalutazione ${money(tco.appreciation)}`:'Prezzo meno valore residuo'} icon={Landmark}/><MiniMetric label="Costo mensile" value={completeTco&&tco.monthlyCost!=null?money(tco.monthlyCost):'—'} note={completeTco&&tco.annualCost!=null?`${number(years,1)} anni · ${money(tco.annualCost)}/anno`:'Periodo di proprietà non inventato'} icon={WalletCards}/><MiniMetric label="Costo al km" value={completeTco&&tco.costPerKm!=null?`${money(tco.costPerKm)}/km`:'—'} note="Su percorrenza registrata" icon={Calculator}/><MiniMetric label="Valore residuo" value={hasValuation?money(finite(v.market_value)):'—'} note={valuation?`${text(v.provider,'Fonte dichiarata')} · ${date(valuation.effective_date)}`:'Quotazione da aggiornare'} icon={Landmark}/></section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Scheda veicolo</h2><span>Dati necessari per obblighi e TCO</span></div></div>{profile?<Table headers={['Campo','Valore']} rows={[["Veicolo",profile.title],["Targa",text(p.plate_masked)],["Prima immatricolazione",p.first_registration?date(String(p.first_registration)):'—'],["Acquisto",p.purchase_date?date(String(p.purchase_date)):'—'],["Prezzo acquisto",p.purchase_price?money(finite(p.purchase_price)):'—'],["Alimentazione",text(p.fuel_type)],["Classe Euro",text(p.euro_class)],["Regione bollo",text(p.tax_region)],["Km iniziali",p.purchase_odometer?number(finite(p.purchase_odometer),0):'—'],["Km attuali",p.current_odometer?number(finite(p.current_odometer),0):'—']]}/>:<Empty label="Scheda veicolo non ancora confermata"/>}</div><div className="section-block"><div className="section-title"><div><h2>Costi cumulati</h2><span>Tutte le categorie del costo di possesso</span></div></div><Table headers={['Categoria','Totale','Copertura']} rows={costRows.map(([key,label])=>[label,money(tco.costsByCategory[key]??0),tco.costsByCategory[key]==null?'Dato mancante':'Registrato'])}/></div></section>
    <section className="special-grid"><div className="section-block"><div className="section-title"><div><h2>Costi operativi per anno</h2><span>Spese registrate, senza svalutazione</span></div></div>{annualCosts.length?<div className="special-chart tall"><ResponsiveContainer><BarChart data={annualCosts}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="year"/><YAxis tickFormatter={(value)=>`${Math.round(Number(value)/1000)}k`}/><Tooltip formatter={(value)=>money(Number(value))}/><Legend/><Bar dataKey="fixed" name="Fissi" stackId="cost" fill="#1d4f7a"/><Bar dataKey="energy" name="Carburante/energia" stackId="cost" fill="#d3922b"/><Bar dataKey="maintenance" name="Manutenzione" stackId="cost" fill="#b44d57"/><Bar dataKey="financing" name="Finanziamento" stackId="cost" fill="#6f7d4c"/><Bar dataKey="usage" name="Uso" stackId="cost" fill="#3d8da8"/><Bar dataKey="other" name="Altro" stackId="cost" fill="#5c6470"/></BarChart></ResponsiveContainer></div>:<Empty label="Costi auto non ancora registrati"/>}</div><div className="section-block"><div className="section-title"><div><h2>Valore residuo</h2><span>Solo quotazioni datate e documentate</span></div></div>{valuationHistory.length?<div className="special-chart tall"><ResponsiveContainer><AreaChart data={valuationHistory}><CartesianGrid stroke="#dce4e9" vertical={false}/><XAxis dataKey="date"/><YAxis tickFormatter={(value)=>`${Math.round(Number(value)/1000)}k`}/><Tooltip formatter={(value)=>money(Number(value))}/><Area dataKey="value" name="Valore" stroke="#167d65" fill="#dcefe9" strokeWidth={2.5}/></AreaChart></ResponsiveContainer></div>:<Empty label="Quotazione residua non ancora disponibile"/>}</div></section>
    <section className="section-block"><div className="section-title"><div><h2>Scadenze e controlli</h2><span>Legge, costruttore e raccomandazioni distinti</span></div></div><Table headers={['Regola','Tipo','Periodicità','Verifica','Fonte']} rows={rules.filter((rule)=>rule.domain==='mobility').map((rule)=>[rule.title,rule.rule_type,rule.recurrence.interval_months?`${rule.recurrence.interval_months} mesi`:rule.recurrence.requires_manual_interval?'Da manuale':rule.recurrence.requires_condition_check?'In base a usura':'Calendario',date(rule.last_verified_at),rule.source_publisher])}/><div className="source-links">{rules.filter((rule)=>rule.domain==='mobility').map((rule)=><a key={rule.id} href={rule.source_url} target="_blank" rel="noreferrer">{rule.title}<ExternalLink/></a>)}</div></section>
    <section className="section-block"><div className="section-title"><div><h2>Storico manutenzioni</h2><span>Gomme e freni generano controlli, non sostituzioni automatiche</span></div></div><Table headers={['Data','Intervento','Bene','Prossimo controllo','Regola']} rows={maintenance.slice(0,50).map((row)=>{const d=details(row);return[date(row.effective_date),row.title,text(d.asset),d.next_due_on?date(String(d.next_due_on)):'Da definire',text(d.rule_key)]})}/>{!maintenance.length&&<Empty label="Nessuna manutenzione auto registrata"/>}</section></>
}

function BenefitsView({records,benefits,monitors}:{records:AnalyticsRecord[];benefits:BenefitOpportunity[];monitors:MonitorRun[]}) {
  const iseeRecord=records.filter((row)=>row.payload.category==='isee.estimate'||row.payload.category==='isee.result').sort((a,b)=>a.effective_date.localeCompare(b.effective_date)).at(-1)
  const iseeDetails=iseeRecord?details(iseeRecord):{}
  const isee=iseeRecord?finite(iseeDetails.estimated_isee??iseeRecord.payload.value):null
  const iseeMode=text(iseeDetails.calculation_mode,'ordinary')
  const assessments=benefits.map((benefit)=>{const max=benefit.eligibility.isee_max==null?null:finite(benefit.eligibility.isee_max);const requiredMode=text(benefit.eligibility.isee_mode,'ordinary');const status=isee==null||max==null?'Da verificare':iseeMode!==requiredMode?'Tipo ISEE non compatibile':isee<=max?'Potenzialmente applicabile':'Soglia ISEE non rispettata';return{...benefit,status}})
  const due=monitors.filter((row)=>row.state==='due')
  return <><section className="special-metrics"><MiniMetric label="ISEE disponibile" value={isee==null?'—':money(isee)} note={iseeRecord?`${iseeRecord.payload.category==='isee.result'?'Risultato registrato':'Stima registrata'} · ${iseeMode==='ordinary'?'ordinario':'specifico'}`:'Serve attestazione o simulazione'} icon={Calculator}/><MiniMetric label="Opportunità aperte" value={String(benefits.filter((row)=>row.state==='open').length)} note="Catalogo verificato" icon={ShieldCheck}/><MiniMetric label="Monitor da completare" value={String(due.length)} note="Verifica mensile" icon={WalletCards}/></section>
    <section className="section-block"><div className="section-title"><div><h2>Dashboard bonus</h2><span>Applicabilità prudenziale, conferma sempre sulla fonte ufficiale</span></div></div><div className="benefit-list">{assessments.map((row)=><article key={row.id}><span className={`benefit-state ${row.status==='Potenzialmente applicabile'?'possible':row.status.startsWith('Soglia')?'no':'unknown'}`}>{row.status}</span><div><h3>{row.title}</h3><p>{row.summary}</p><small>{row.source_publisher} · verificato {date(row.last_verified_at)}</small></div><a className="icon-button" title={`Apri fonte: ${row.title}`} href={row.source_url} target="_blank" rel="noreferrer"><ExternalLink/></a></article>)}</div>{!benefits.length&&<Empty label="Catalogo agevolazioni non disponibile"/>}</section>
    <section className="section-block"><div className="section-title"><div><h2>Monitor periodici</h2><span>Il GPT ricerca sul web; il database conserva esito e fonti</span></div></div><Table headers={['Periodo','Monitor','Stato','Fonti','Esito']} rows={monitors.map((row)=>[date(row.scheduled_for),row.monitor_key.replaceAll('.',' '),row.state,String(row.source_count),text(row.summary)])}/>{!monitors.length&&<Empty label="Nessun monitor pianificato"/>}</section></>
}
