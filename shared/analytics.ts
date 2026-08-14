export interface AnalyticsRecord {
  id: string
  kind: string
  title: string
  effective_date: string
  evidence_status?: string
  payload: Record<string, unknown>
}

export interface ProjectionInput {
  startingValue: number
  monthlyContribution: number
  annualReturn: number
  annualInflation: number
  years: number
  annualFee?: number
  annualContributionGrowth?: number
}

export interface MonteCarloInput extends ProjectionInput {
  annualVolatility: number
  simulations?: number
  seed?: number
}

export interface CapitalRunwayInput {
  startingValue: number
  annualExpenses: number
  annualPassiveIncome: number
  annualTemporaryIncome: number
  temporaryIncomeYears: number
  annualReturn: number
  annualInflation: number
  annualFee?: number
  years: number
}

export interface IseeInput {
  householdMembers: number
  dependentChildren: number
  disabledMembers: number
  additionalScaleIncrement: number
  incomeForIsee: number
  incomeDeductions: number
  annualRent: number
  accountClosingBalances: number
  accountAverageBalances: number
  eligibleAssetPurchaseIncrement: number
  useClosingBalanceException: boolean
  otherFinancialAssets: number
  excludedGovernmentBonds: number
  primaryHomeImuValue: number
  primaryHomeMortgageResidual: number
  otherRealEstateImuValue: number
  otherRealEstateMortgageResidual: number
  calculationMode: 'ordinary' | 'family_inclusion_2026'
  metropolitanCapitalHome: boolean
}

export interface VehicleTcoInput {
  purchasePrice: number
  currentResidualValue: number
  ownershipYears: number
  kilometresDriven: number
  runningCosts: Array<{ category: string; amount: number }>
  annualOpportunityRate?: number
}

export interface NutritionTargetInput {
  tdeeKcal: number | null
  weightKg: number | null
  heightCm: number | null
  deficitPercent?: number | null
  deficitMinimumKcal?: number | null
  deficitMaximumKcal?: number | null
  proteinGramsPerKg?: number | null
  fatGramsPerKg?: number | null
  surplusKcal?: number | null
  energyPerKgKcal?: number | null
  recentMedianSteps?: number | null
  stepIncrement?: number | null
  minimumSteps?: number | null
  maximumSteps?: number | null
  stepRounding?: number | null
}

export interface DailyAggregateMetric {
  observed_on: string
  metric_key: string
  source_label: string
  value_sum?: number | null
  value_avg?: number | null
  value_last?: number | null
}

function finite(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, finite(value)))
}

function isoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

export function recordDetails(record: AnalyticsRecord) {
  const value = record.payload.details
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function projectionParameters(input: ProjectionInput) {
  const months = Math.max(1, Math.min(80 * 12, Math.round(Math.max(1 / 12, finite(input.years)) * 12)))
  const grossAnnualFactor = 1 + clamp(input.annualReturn, -0.99, 10)
  const feeAnnualFactor = 1 - clamp(input.annualFee ?? 0, 0, 0.99)
  const annualNetReturn = grossAnnualFactor * feeAnnualFactor - 1
  const monthlyRate = Math.pow(1 + annualNetReturn, 1 / 12) - 1
  const monthlyInflation = Math.pow(1 + clamp(input.annualInflation, -0.99, 10), 1 / 12) - 1
  const monthlyContributionGrowth = Math.pow(1 + clamp(input.annualContributionGrowth ?? 0, -0.99, 10), 1 / 12) - 1
  return { months, annualNetReturn, monthlyRate, monthlyInflation, monthlyContributionGrowth }
}

export function projectFutureValue(input: ProjectionInput) {
  const parameters = projectionParameters(input)
  let nominal = Math.max(0, finite(input.startingValue))
  let contributed = nominal
  let contributedReal = nominal
  const contribution = Math.max(0, finite(input.monthlyContribution))
  const points = [{ year: 0, nominal, real: nominal, contributed, contributedReal, netAnnualReturn: parameters.annualNetReturn }]
  for (let month = 1; month <= parameters.months; month += 1) {
    const monthlyContribution = contribution * Math.pow(1 + parameters.monthlyContributionGrowth, month - 1)
    nominal = nominal * (1 + parameters.monthlyRate) + monthlyContribution
    contributed += monthlyContribution
    contributedReal += monthlyContribution / Math.pow(1 + parameters.monthlyInflation, month)
    if (month % 12 === 0 || month === parameters.months) {
      points.push({
        year: month / 12,
        nominal,
        real: nominal / Math.pow(1 + parameters.monthlyInflation, month),
        contributed,
        contributedReal,
        netAnnualReturn: parameters.annualNetReturn,
      })
    }
  }
  return points
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296
  }
}

function normalRandom(random: () => number) {
  const first = Math.max(Number.EPSILON, random())
  const second = random()
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second)
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0
  const position = clamp(fraction, 0, 1) * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function projectMonteCarlo(input: MonteCarloInput) {
  const parameters = projectionParameters(input)
  const simulations = Math.round(clamp(input.simulations ?? 1_000, 200, 5_000))
  const volatility = clamp(input.annualVolatility, 0, 2)
  const random = seededRandom(Math.round(finite(input.seed ?? 20_260_813)))
  const annualLogMean = Math.log(1 + parameters.annualNetReturn) - volatility * volatility / 2
  const monthlyLogMean = annualLogMean / 12
  const monthlyLogDeviation = volatility / Math.sqrt(12)
  const startingValue = Math.max(0, finite(input.startingValue))
  const baseContribution = Math.max(0, finite(input.monthlyContribution))
  const values = Array.from({ length: simulations }, () => startingValue)
  let contributedReal = startingValue
  const points = [{ year: 0, p10: startingValue, p50: startingValue, p90: startingValue, contributedReal }]
  for (let month = 1; month <= parameters.months; month += 1) {
    const contribution = baseContribution * Math.pow(1 + parameters.monthlyContributionGrowth, month - 1)
    contributedReal += contribution / Math.pow(1 + parameters.monthlyInflation, month)
    const inflationFactor = Math.pow(1 + parameters.monthlyInflation, month)
    for (let index = 0; index < values.length; index += 1) {
      const growthFactor = Math.exp(monthlyLogMean + monthlyLogDeviation * normalRandom(random))
      values[index] = values[index] * growthFactor + contribution
    }
    if (month % 12 === 0 || month === parameters.months) {
      const realValues = values.map((value) => value / inflationFactor).sort((a, b) => a - b)
      points.push({
        year: month / 12,
        p10: percentile(realValues, 0.1),
        p50: percentile(realValues, 0.5),
        p90: percentile(realValues, 0.9),
        contributedReal,
      })
    }
  }
  const final = points.at(-1)!
  const finalInflation = Math.pow(1 + parameters.monthlyInflation, parameters.months)
  const probabilityAboveContributions = values.filter((value) => value / finalInflation >= final.contributedReal).length / values.length
  return { points, probabilityAboveContributions, simulations, netAnnualReturn: parameters.annualNetReturn }
}

export function projectCapitalRunway(input: CapitalRunwayInput) {
  const months = Math.max(1, Math.min(80 * 12, Math.round(Math.max(1 / 12, finite(input.years)) * 12)))
  const netAnnualReturn = (1 + clamp(input.annualReturn, -0.99, 10))
    * (1 - clamp(input.annualFee ?? 0, 0, 0.99)) - 1
  const monthlyReturn = Math.pow(1 + netAnnualReturn, 1 / 12) - 1
  const monthlyInflation = Math.pow(1 + clamp(input.annualInflation, -0.99, 10), 1 / 12) - 1
  const baseExpense = Math.max(0, finite(input.annualExpenses)) / 12
  const basePassiveIncome = Math.max(0, finite(input.annualPassiveIncome)) / 12
  const baseTemporaryIncome = Math.max(0, finite(input.annualTemporaryIncome)) / 12
  const temporaryMonths = Math.max(0, Math.round(finite(input.temporaryIncomeYears) * 12))
  let nominal = Math.max(0, finite(input.startingValue))
  let exhaustedAfterMonths: number | null = null
  const points = [{ year: 0, nominal, real: nominal }]
  for (let month = 1; month <= months; month += 1) {
    const cashFlowInflationFactor = Math.pow(1 + monthlyInflation, month - 1)
    const realValueDeflator = Math.pow(1 + monthlyInflation, month)
    const income = (basePassiveIncome + (month <= temporaryMonths ? baseTemporaryIncome : 0)) * cashFlowInflationFactor
    const expense = baseExpense * cashFlowInflationFactor
    nominal = Math.max(0, nominal * (1 + monthlyReturn) + income - expense)
    if (nominal === 0 && exhaustedAfterMonths == null) exhaustedAfterMonths = month
    if (month % 12 === 0 || month === months) points.push({ year: month / 12, nominal, real: nominal / realValueDeflator })
  }
  return {
    points,
    exhaustedAfterYears: exhaustedAfterMonths == null ? null : exhaustedAfterMonths / 12,
    endingReal: points.at(-1)?.real ?? 0,
    netAnnualReturn,
  }
}

function baseEquivalenceScale(members: number) {
  const normalized = Math.max(1, Math.round(members))
  const base = [0, 1, 1.57, 2.04, 2.46, 2.85]
  return normalized <= 5 ? base[normalized] : 2.85 + (normalized - 5) * 0.35
}

function childrenScaleIncrement(children: number, mode: IseeInput['calculationMode']) {
  if (mode === 'family_inclusion_2026') {
    if (children >= 5) return 0.55
    if (children === 4) return 0.4
    if (children === 3) return 0.25
    if (children === 2) return 0.1
    return 0
  }
  if (children >= 5) return 0.5
  if (children === 4) return 0.35
  if (children === 3) return 0.2
  return 0
}

export function estimateOrdinaryIsee(input: IseeInput) {
  const members = Math.max(1, Math.round(input.householdMembers))
  const children = Math.max(0, Math.min(members, Math.round(input.dependentChildren)))
  const disabledMembers = Math.max(0, Math.min(members, Math.round(input.disabledMembers)))
  const closingBalances = Math.max(0, finite(input.accountClosingBalances))
  const averageBalances = Math.max(0, finite(input.accountAverageBalances))
  const balanceDifference = Math.max(0, averageBalances - closingBalances)
  const assetPurchaseIncrement = Math.max(0, finite(input.eligibleAssetPurchaseIncrement))
  const closingBalanceExceptionApplied = Boolean(input.useClosingBalanceException && balanceDifference > 0 && assetPurchaseIncrement >= balanceDifference)
  const accountValue = closingBalanceExceptionApplied ? closingBalances : Math.max(closingBalances, averageBalances)
  const financialBeforeExclusion = Math.max(0, accountValue + Math.max(0, finite(input.otherFinancialAssets)))
  const excludedEligibleAssets = Math.min(50_000, Math.max(0, finite(input.excludedGovernmentBonds)), financialBeforeExclusion)
  const financialGross = financialBeforeExclusion - excludedEligibleAssets
  const movableFranchise = Math.min(10_000, 6_000 + Math.max(0, members - 1) * 2_000) + Math.max(0, children - 2) * 1_000
  const movableNet = Math.max(0, financialGross - movableFranchise)
  const primaryHomeNet = Math.max(0, finite(input.primaryHomeImuValue) - Math.max(0, finite(input.primaryHomeMortgageResidual)))
  const specialMode = input.calculationMode === 'family_inclusion_2026'
  const primaryHomeFranchise = specialMode
    ? (input.metropolitanCapitalHome ? 120_000 : 91_500) + Math.max(0, children - 1) * 2_500
    : 52_500 + Math.max(0, children - 2) * 2_500
  const primaryHomeCounted = primaryHomeNet <= primaryHomeFranchise ? 0 : (primaryHomeNet - primaryHomeFranchise) * 2 / 3
  const otherRealEstateNet = Math.max(0, finite(input.otherRealEstateImuValue) - Math.max(0, finite(input.otherRealEstateMortgageResidual)))
  const isp = movableNet + primaryHomeCounted + otherRealEstateNet
  const rentDeduction = Math.min(Math.max(0, finite(input.annualRent)), 7_000 + Math.max(0, children - 2) * 500)
  const isr = Math.max(0, finite(input.incomeForIsee) - Math.max(0, finite(input.incomeDeductions)) - rentDeduction)
  const ise = isr + isp * 0.2
  const scale = baseEquivalenceScale(members)
    + childrenScaleIncrement(children, input.calculationMode)
    + disabledMembers * 0.5
    + Math.max(0, finite(input.additionalScaleIncrement))
  return {
    estimatedIsee: ise / scale,
    ise,
    isr,
    isp,
    scale,
    accountValue,
    balanceDifference,
    closingBalanceExceptionApplied,
    excludedEligibleAssets,
    excludedAssetsOverCap: Math.max(0, finite(input.excludedGovernmentBonds) - excludedEligibleAssets),
    financialBeforeExclusion,
    financialGross,
    movableFranchise,
    movableNet,
    primaryHomeNet,
    primaryHomeFranchise,
    primaryHomeCounted,
    otherRealEstateNet,
    rentDeduction,
  }
}

export function calculateVehicleTco(input: VehicleTcoInput) {
  const purchasePrice = Math.max(0, finite(input.purchasePrice))
  const currentResidualValue = Math.max(0, finite(input.currentResidualValue))
  const valueChange = purchasePrice - currentResidualValue
  const depreciation = Math.max(0, valueChange)
  const appreciation = Math.max(0, -valueChange)
  const costsByCategory = input.runningCosts.reduce<Record<string, number>>((result, row) => {
    result[row.category] = (result[row.category] ?? 0) + finite(row.amount)
    return result
  }, {})
  const runningCosts = Object.values(costsByCategory).reduce((sum, value) => sum + value, 0)
  const years = Math.max(0, finite(input.ownershipYears))
  const opportunityRate = clamp(input.annualOpportunityRate ?? 0, 0, 1)
  const opportunityCost = years > 0 ? (purchasePrice + currentResidualValue) / 2 * opportunityRate * years : 0
  const totalCost = valueChange + runningCosts + opportunityCost
  const kilometres = Math.max(0, finite(input.kilometresDriven))
  return {
    valueChange,
    depreciation,
    appreciation,
    opportunityCost,
    runningCosts,
    totalCost,
    annualCost: years > 0 ? totalCost / years : null,
    monthlyCost: years > 0 ? totalCost / (years * 12) : null,
    costPerKm: kilometres > 0 ? totalCost / kilometres : null,
    residualRatio: purchasePrice > 0 ? currentResidualValue / purchasePrice : null,
    costsByCategory,
  }
}

export function calculateBmi(weight: number, weightUnit: string, height: number, heightUnit: string) {
  const normalizedWeight = /^(lb|lbs|pound)/i.test(weightUnit) ? finite(weight) * 0.45359237 : /^(kg|kilogram)/i.test(weightUnit) ? finite(weight) : 0
  const normalizedHeight = /^(cm|centimet)/i.test(heightUnit) ? finite(height) / 100
    : /^(m|metre|meter)$/i.test(heightUnit) ? finite(height)
      : /^(in|inch)/i.test(heightUnit) ? finite(height) * 0.0254 : 0
  if (normalizedWeight <= 0 || normalizedHeight <= 0) return null
  const bmi = normalizedWeight / Math.pow(normalizedHeight, 2)
  return bmi >= 5 && bmi <= 100 ? bmi : null
}

export function calculateMifflinStJeor(weightKg: number, heightCm: number, ageYears: number, biologicalSex: string) {
  const weight = finite(weightKg)
  const height = finite(heightCm)
  const age = finite(ageYears)
  if (weight <= 0 || height <= 0 || age < 14 || age > 120) return null
  const sex = biologicalSex.trim().toLowerCase()
  const constant = /^(male|maschio|m)$/.test(sex) ? 5 : /^(female|femmina|f)$/.test(sex) ? -161 : null
  if (constant == null) return null
  return 10 * weight + 6.25 * height - 5 * age + constant
}

function roundedTo(value: number, increment: number) {
  const step = Math.max(Number.EPSILON, finite(increment))
  return Math.round(value / step) * step
}

export function calculateNutritionTargets(input: NutritionTargetInput) {
  const tdee = input.tdeeKcal != null && input.tdeeKcal > 0 ? finite(input.tdeeKcal) : null
  const weight = input.weightKg != null && input.weightKg > 0 ? finite(input.weightKg) : null
  const height = input.heightCm != null && input.heightCm > 0 ? finite(input.heightCm) : null
  const deficitPercent = input.deficitPercent != null && input.deficitPercent >= 0 ? finite(input.deficitPercent) : null
  const deficitMinimum = input.deficitMinimumKcal != null && input.deficitMinimumKcal >= 0 ? finite(input.deficitMinimumKcal) : null
  const deficitMaximum = input.deficitMaximumKcal != null && input.deficitMaximumKcal >= 0 ? finite(input.deficitMaximumKcal) : null
  const boundedDeficit = tdee != null && deficitPercent != null && deficitMinimum != null && deficitMaximum != null && deficitMaximum >= deficitMinimum
    ? clamp(tdee * deficitPercent, deficitMinimum, deficitMaximum) : null
  const caloriesMaintenance = tdee
  const caloriesDeficit = tdee != null && boundedDeficit != null ? roundedTo(Math.max(0, tdee - boundedDeficit), 25) : null
  const surplus = input.surplusKcal != null && input.surplusKcal >= 0 ? finite(input.surplusKcal) : null
  const caloriesGrowth = tdee != null && surplus != null ? roundedTo(tdee + surplus, 25) : null
  const protein = weight != null && input.proteinGramsPerKg != null && input.proteinGramsPerKg >= 0
    ? roundedTo(weight * finite(input.proteinGramsPerKg), 5) : null
  const fat = weight != null && input.fatGramsPerKg != null && input.fatGramsPerKg >= 0
    ? roundedTo(weight * finite(input.fatGramsPerKg), 5) : null
  const carbohydrates = (calories: number | null) => calories != null && protein != null && fat != null
    ? Math.max(0, roundedTo((calories - protein * 4 - fat * 9) / 4, 5)) : null
  const energyPerKg = input.energyPerKgKcal != null && input.energyPerKgKcal > 0 ? finite(input.energyPerKgKcal) : null
  const expectedWeeklyWeightChange = caloriesMaintenance != null && caloriesDeficit != null && energyPerKg != null
    ? -(caloriesMaintenance - caloriesDeficit) * 7 / energyPerKg : null
  const medianSteps = input.recentMedianSteps != null && input.recentMedianSteps >= 0 ? finite(input.recentMedianSteps) : null
  const stepIncrement = input.stepIncrement != null && input.stepIncrement >= 0 ? finite(input.stepIncrement) : null
  const minimumSteps = input.minimumSteps != null && input.minimumSteps >= 0 ? finite(input.minimumSteps) : null
  const maximumSteps = input.maximumSteps != null && input.maximumSteps >= 0 ? finite(input.maximumSteps) : null
  const stepRounding = input.stepRounding != null && input.stepRounding > 0 ? finite(input.stepRounding) : null
  const stepTarget = medianSteps != null && stepIncrement != null && minimumSteps != null && maximumSteps != null && maximumSteps >= minimumSteps && stepRounding != null
    ? Math.min(maximumSteps, Math.max(minimumSteps, Math.ceil((medianSteps + stepIncrement) / stepRounding) * stepRounding)) : null
  const checkpointWeight = height != null && weight != null ? Math.max(18.5 * Math.pow(height / 100, 2), weight - 2) : null
  return {
    deficitKcal: boundedDeficit,
    caloriesDeficit,
    caloriesMaintenance,
    caloriesGrowth,
    proteinGrams: protein,
    fatGrams: fat,
    carbohydratesDeficitGrams: carbohydrates(caloriesDeficit),
    carbohydratesMaintenanceGrams: carbohydrates(caloriesMaintenance),
    carbohydratesGrowthGrams: carbohydrates(caloriesGrowth),
    expectedWeeklyWeightChange,
    stepTarget,
    checkpointWeight,
  }
}

function dailyAggregateValue(row: DailyAggregateMetric) {
  const key = row.metric_key.toLowerCase()
  return /step|distance|energy|exercise|stand|daylight|flight/.test(key)
    ? row.value_sum ?? row.value_avg ?? row.value_last ?? null
    : row.value_avg ?? row.value_last ?? row.value_sum ?? null
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function wearableEnergySummary(rows: DailyAggregateMetric[], lookbackDays = 90) {
  const byKind = (pattern: RegExp) => {
    const sources = new Map<string, Map<string, number>>()
    for (const row of rows) {
      if (!pattern.test(row.metric_key.toLowerCase()) || !isoDay(row.observed_on)) continue
      const value = dailyAggregateValue(row)
      if (value == null || !Number.isFinite(value) || value <= 0) continue
      const dates = sources.get(row.source_label) ?? new Map<string, number>()
      dates.set(row.observed_on, value)
      sources.set(row.source_label, dates)
    }
    return sources
  }
  const activeSources = byKind(/active[._]?energy/)
  const basalSources = byKind(/basal[._]?energy/)
  const candidates: Array<{ activeSource: string; basalSource: string; totals: Array<{ date: string; value: number }> }> = []
  for (const [activeSource, active] of activeSources) for (const [basalSource, basal] of basalSources) {
    const totals = [...active.entries()].filter(([day]) => basal.has(day)).map(([date, value]) => ({ date, value: value + (basal.get(date) ?? 0) })).sort((a, b) => a.date.localeCompare(b.date))
    if (totals.length) candidates.push({ activeSource, basalSource, totals })
  }
  if (!candidates.length) return { medianKcal: null, dayCount: 0, activeSource: null, basalSource: null, coverageStart: null, coverageEnd: null }
  const end = Math.max(...candidates.map((candidate) => Date.parse(`${candidate.totals.at(-1)!.date}T12:00:00Z`)))
  const lower = end - (Math.max(1, Math.round(lookbackDays)) - 1) * 86_400_000
  const ranked = candidates.map((candidate) => ({
    ...candidate,
    recent: candidate.totals.filter((row) => Date.parse(`${row.date}T12:00:00Z`) >= lower),
  })).sort((a, b) => b.recent.length - a.recent.length
    || b.totals.at(-1)!.date.localeCompare(a.totals.at(-1)!.date)
    || Number(b.activeSource === b.basalSource) - Number(a.activeSource === a.basalSource)
    || a.activeSource.localeCompare(b.activeSource))
  const best = ranked[0]
  const recent = best.recent
  return {
    medianKcal: median(recent.map((row) => row.value)),
    dayCount: recent.length,
    activeSource: best.activeSource,
    basalSource: best.basalSource,
    coverageStart: recent[0]?.date ?? null,
    coverageEnd: recent.at(-1)?.date ?? null,
  }
}

export function hrvBaselineSummary(rows: DailyAggregateMetric[]) {
  const candidates = rows.filter((row) => /hrv|variability/.test(row.metric_key.toLowerCase()) && isoDay(row.observed_on))
    .map((row) => ({ source: row.source_label, date: row.observed_on, value: dailyAggregateValue(row) }))
    .filter((row): row is { source: string; date: string; value: number } => row.value != null && Number.isFinite(row.value) && row.value > 0)
  if (!candidates.length) return { source: null, latest: null, latestDate: null, average7: null, average60: null, ratio7To60: null, observations7: 0, observations60: 0 }
  const end = Math.max(...candidates.map((row) => Date.parse(`${row.date}T12:00:00Z`)))
  const lower60 = end - 59 * 86_400_000
  const bySource = new Map<string, Array<{ date: string; value: number }>>()
  for (const row of candidates) {
    const values = bySource.get(row.source) ?? []
    values.push({ date: row.date, value: row.value })
    bySource.set(row.source, values)
  }
  const source = [...bySource.entries()].map(([label, values]) => ({ label, values: values.sort((a, b) => a.date.localeCompare(b.date)), recent: values.filter((row) => Date.parse(`${row.date}T12:00:00Z`) >= lower60).length }))
    .sort((a, b) => b.recent - a.recent || b.values.at(-1)!.date.localeCompare(a.values.at(-1)!.date) || a.label.localeCompare(b.label))[0]?.label ?? null
  const values = source ? bySource.get(source) ?? [] : []
  if (!values.length) return { source, latest: null, latestDate: null, average7: null, average60: null, ratio7To60: null, observations7: 0, observations60: 0 }
  const latest = values.at(-1)!
  const window = (days: number) => values.filter((row) => Date.parse(`${row.date}T12:00:00Z`) >= end - (days - 1) * 86_400_000)
  const recent7 = window(7)
  const recent60 = window(60)
  const average = (items: Array<{ value: number }>) => items.length ? items.reduce((sum, row) => sum + row.value, 0) / items.length : null
  const average7 = average(recent7)
  const average60 = average(recent60)
  return { source, latest: latest.value, latestDate: latest.date, average7, average60, ratio7To60: average7 != null && average60 != null && average60 > 0 ? average7 / average60 : null, observations7: recent7.length, observations60: recent60.length }
}

export function healthSourceCoverage(rows: DailyAggregateMetric[], lookbackDays = 90) {
  const valid = rows.map((row) => ({
    source: row.source_label,
    date: row.observed_on,
    value: dailyAggregateValue(row),
  })).filter((row): row is { source: string; date: string; value: number } =>
    row.source.length > 0 && Boolean(isoDay(row.date)) && row.value != null && Number.isFinite(row.value))
  if (!valid.length) return []
  const latestDate = valid.reduce((latest, row) => row.date > latest ? row.date : latest, valid[0].date)
  const lower = Date.parse(`${latestDate}T12:00:00Z`) - (Math.max(1, Math.round(lookbackDays)) - 1) * 86_400_000
  const bySource = new Map<string, Set<string>>()
  for (const row of valid) {
    const dates = bySource.get(row.source) ?? new Set<string>()
    dates.add(row.date)
    bySource.set(row.source, dates)
  }
  return [...bySource.entries()].map(([source, dates]) => {
    const ordered = [...dates].sort()
    return {
      source,
      totalDays: ordered.length,
      recentDays: ordered.filter((date) => Date.parse(`${date}T12:00:00Z`) >= lower).length,
      latestDate: ordered.at(-1)!,
    }
  }).sort((a, b) => b.recentDays - a.recentDays || b.latestDate.localeCompare(a.latestDate)
    || b.totalDays - a.totalDays || a.source.localeCompare(b.source))
}

export function nutritionDaily(records: AnalyticsRecord[]) {
  const totals = new Map<string, { date: string; calories: number; caloriesLow: number; caloriesHigh: number; protein: number; carbs: number; fat: number; fibre: number; sodium: number; mealIds: Set<string>; estimatedMealIds: Set<string> }>()
  for (const record of records) {
    if (record.payload.category !== 'nutrition.meal') continue
    const details = recordDetails(record)
    const current = totals.get(record.effective_date) ?? { date: record.effective_date, calories: 0, caloriesLow: 0, caloriesHigh: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0, mealIds: new Set<string>(), estimatedMealIds: new Set<string>() }
    const mealId = String(details.meal_id ?? record.id)
    const calories = Math.max(0, finite(details.calories))
    const uncertainty = Math.max(0, finite(details.uncertainty_kcal))
    current.calories += calories
    current.caloriesLow += Math.max(0, calories - uncertainty)
    current.caloriesHigh += calories + uncertainty
    current.protein += Math.max(0, finite(details.protein_g))
    current.carbs += Math.max(0, finite(details.carbs_g))
    current.fat += Math.max(0, finite(details.fat_g))
    current.fibre += Math.max(0, finite(details.fibre_g))
    current.sodium += Math.max(0, finite(details.sodium_mg))
    current.mealIds.add(mealId)
    if (record.evidence_status === 'estimated') current.estimatedMealIds.add(mealId)
    totals.set(record.effective_date, current)
  }
  return [...totals.values()].map((row) => {
    const macroCalories = row.protein * 4 + row.carbs * 4 + row.fat * 9
    const { mealIds, estimatedMealIds, ...values } = row
    return { ...values, meals: mealIds.size, estimatedMeals: estimatedMealIds.size, macroCalories, macroDelta: row.calories - macroCalories }
  }).sort((a, b) => a.date.localeCompare(b.date))
}

export function portfolioPositions(records: AnalyticsRecord[]) {
  const latest = new Map<string, { record: AnalyticsRecord; index: number }>()
  records.forEach((record, index) => {
    if (record.payload.category !== 'portfolio.position') return
    const details = recordDetails(record)
    const instrumentKey = String(details.isin || details.instrument_code || record.title).trim().toUpperCase()
    const accountKey = String(details.account_id || details.account_label || details.custodian || '').trim().toUpperCase()
    const key = accountKey ? `${accountKey}:${instrumentKey}` : instrumentKey
    const current = latest.get(key)
    if (!current || current.record.effective_date < record.effective_date || (current.record.effective_date === record.effective_date && current.index < index)) latest.set(key, { record, index })
  })
  const aggregates = new Map<string, {
    id: string; date: string; instrument: string; isin: string; assetClass: string;
    marketValue: number; costBasis: number; targetWeight: number | null;
    metadataDate: string; accounts: Set<string>; sources: Set<string>;
  }>()
  for (const { record } of latest.values()) {
    const details = recordDetails(record)
    const marketValue = Math.max(0, finite(details.market_value))
    const costBasis = Math.max(0, finite(details.cost_basis))
    const instrument = String(details.instrument_code ?? record.title)
    const isin = String(details.isin ?? '')
    const aggregateKey = String(isin || instrument).trim().toUpperCase()
    const account = String(details.account_label ?? details.account_id ?? details.custodian ?? '').trim()
    const source = String(details.source ?? '').trim()
    const current = aggregates.get(aggregateKey) ?? {
      id: record.id, date: record.effective_date, instrument, isin,
      assetClass: String(details.asset_class ?? 'Da classificare'),
      marketValue: 0, costBasis: 0, targetWeight: null,
      metadataDate: record.effective_date, accounts: new Set<string>(), sources: new Set<string>(),
    }
    current.marketValue += marketValue
    current.costBasis += costBasis
    if (account) current.accounts.add(account)
    if (source) current.sources.add(source)
    if (record.effective_date >= current.metadataDate) {
      current.id = record.id
      current.date = record.effective_date
      current.instrument = instrument
      current.isin = isin
      current.assetClass = String(details.asset_class ?? 'Da classificare')
      current.targetWeight = details.target_weight == null ? null : finite(details.target_weight)
      current.metadataDate = record.effective_date
    }
    aggregates.set(aggregateKey, current)
  }
  return [...aggregates.values()].map(({ metadataDate: _metadataDate, accounts, sources, ...row }) => ({
    ...row,
    profitLoss: row.marketValue - row.costBasis,
    account: [...accounts].sort().join(', '),
    source: [...sources].sort().join(', '),
  })).sort((a, b) => b.marketValue - a.marketValue)
}

export function portfolioSummary(holdings: ReturnType<typeof portfolioPositions>) {
  const marketValue = holdings.reduce((sum, row) => sum + row.marketValue, 0)
  const costBasis = holdings.reduce((sum, row) => sum + row.costBasis, 0)
  const rows = holdings.map((row) => {
    const actualWeight = marketValue > 0 ? row.marketValue / marketValue : 0
    const validTarget = row.targetWeight != null && row.targetWeight >= 0 && row.targetWeight <= 1 ? row.targetWeight : null
    return { ...row, actualWeight, targetGap: validTarget == null ? null : validTarget - actualWeight, validTarget }
  })
  const concentrationHhi = rows.reduce((sum, row) => sum + row.actualWeight * row.actualWeight, 0)
  const unclassifiedValue = rows.filter((row) => row.assetClass === 'Da classificare').reduce((sum, row) => sum + row.marketValue, 0)
  return {
    rows,
    marketValue,
    costBasis,
    profitLoss: marketValue - costBasis,
    returnOnCost: costBasis > 0 ? (marketValue - costBasis) / costBasis : null,
    concentrationHhi,
    effectivePositions: concentrationHhi > 0 ? 1 / concentrationHhi : null,
    topWeight: rows[0]?.actualWeight ?? null,
    unclassifiedValue,
  }
}

export function portfolioPerformanceStatistics(rows: Array<{ date: string; portfolio: number }>) {
  const latestByDate = new Map<string, number>()
  for (const row of rows) {
    if (isoDay(row.date) && Number.isFinite(row.portfolio) && row.portfolio > -100) latestByDate.set(row.date, row.portfolio)
  }
  const valid = [...latestByDate.entries()].map(([date, portfolio]) => ({ date, portfolio, index: 1 + portfolio / 100 })).sort((a, b) => a.date.localeCompare(b.date))
  if (!valid.length) return { observations: 0, periodReturn: null, annualizedReturn: null, annualizedVolatility: null, maxDrawdown: null, start: null, end: null }
  let peak = valid[0].index
  let maxDrawdown = 0
  for (const row of valid) {
    peak = Math.max(peak, row.index)
    maxDrawdown = Math.min(maxDrawdown, row.index / peak - 1)
  }
  const first = valid[0]
  const last = valid.at(-1)!
  const days = (Date.parse(`${last.date}T12:00:00Z`) - Date.parse(`${first.date}T12:00:00Z`)) / 86_400_000
  const periodReturn = valid.length > 1 ? last.index / first.index - 1 : null
  const annualizedReturn = periodReturn != null && days > 0 ? Math.pow(1 + periodReturn, 365.25 / days) - 1 : null
  const intervals = valid.slice(1).map((row, index) => {
    const prior = valid[index]
    const intervalDays = (Date.parse(`${row.date}T12:00:00Z`) - Date.parse(`${prior.date}T12:00:00Z`)) / 86_400_000
    return { years: intervalDays / 365.25, logReturn: Math.log(row.index / prior.index) }
  }).filter((row) => row.years > 0)
  const totalYears = intervals.reduce((sum, row) => sum + row.years, 0)
  const annualLogDrift = totalYears > 0 ? intervals.reduce((sum, row) => sum + row.logReturn, 0) / totalYears : null
  const residualSum = annualLogDrift == null ? 0 : intervals.reduce((sum, row) => sum + Math.pow(row.logReturn - annualLogDrift * row.years, 2), 0)
  const annualizedVolatility = intervals.length >= 2 && totalYears > 0
    ? Math.sqrt(residualSum / totalYears * intervals.length / (intervals.length - 1)) : null
  return { observations: valid.length, periodReturn, annualizedReturn, annualizedVolatility, maxDrawdown, start: first.date, end: last.date }
}

export function portfolioExposureSummary(records: AnalyticsRecord[], holdings: ReturnType<typeof portfolioPositions>) {
  const totalPortfolioValue = holdings.reduce((sum, row) => sum + row.marketValue, 0)
  const instrumentValues = new Map<string, number>()
  const instrumentAliases = new Map<string, string>()
  for (const row of holdings) {
    const instrument = row.instrument.trim().toUpperCase()
    const isin = row.isin.trim().toUpperCase()
    const canonical = instrument || isin
    if (instrument) {
      instrumentValues.set(instrument, row.marketValue)
      instrumentAliases.set(instrument, canonical)
    }
    if (isin) {
      instrumentValues.set(isin, row.marketValue)
      instrumentAliases.set(isin, canonical)
    }
  }
  const latest = new Map<string, { record: AnalyticsRecord; index: number }>()
  records.forEach((record, index) => {
    if (record.payload.category !== 'portfolio.exposure') return
    const details = recordDetails(record)
    const instrument = String(details.instrument_code ?? details.isin ?? '').trim().toUpperCase()
    const region = String(details.region ?? record.title).trim()
    const key = `${instrument}:${region.toLowerCase()}`
    const current = latest.get(key)
    if (!current || current.record.effective_date < record.effective_date || (current.record.effective_date === record.effective_date && current.index < index)) latest.set(key, { record, index })
  })
  const values = new Map<string, number>()
  const allocations = new Map<string, number>()
  for (const { record } of latest.values()) {
    const details = recordDetails(record)
    const region = String(details.region ?? record.title)
    const instrument = String(details.instrument_code ?? details.isin ?? '').trim().toUpperCase()
    const weight = finite(details.weight)
    const baseValue = instrument ? instrumentValues.get(instrument) ?? 0 : totalPortfolioValue
    const amount = details.amount != null ? Math.max(0, finite(details.amount)) : weight >= 0 && weight <= 1 ? baseValue * weight : 0
    values.set(region, (values.get(region) ?? 0) + amount)
    const allocationKey = instrument ? instrumentAliases.get(instrument) ?? instrument : '__portfolio__'
    allocations.set(allocationKey, (allocations.get(allocationKey) ?? 0) + amount)
  }
  const rows = [...values.entries()].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value)
  const coveredValue = rows.reduce((sum, row) => sum + row.value, 0)
  let classifiedValue = 0
  let overAllocatedValue = 0
  for (const holding of holdings) {
    const instrument = holding.instrument.trim().toUpperCase()
    const isin = holding.isin.trim().toUpperCase()
    const canonical = instrumentAliases.get(instrument) ?? instrumentAliases.get(isin) ?? (instrument || isin)
    const allocated = canonical ? allocations.get(canonical) ?? 0 : 0
    classifiedValue += Math.min(holding.marketValue, allocated)
    overAllocatedValue += Math.max(0, allocated - holding.marketValue)
  }
  const globalAllocation = allocations.get('__portfolio__') ?? 0
  const remainingValue = Math.max(0, totalPortfolioValue - classifiedValue)
  classifiedValue += Math.min(remainingValue, globalAllocation)
  overAllocatedValue += Math.max(0, globalAllocation - remainingValue)
  return {
    rows,
    coveredValue,
    coverageRatio: totalPortfolioValue > 0 ? classifiedValue / totalPortfolioValue : null,
    unclassifiedValue: Math.max(0, totalPortfolioValue - classifiedValue),
    overAllocatedValue,
  }
}

export function cashFlowMonthly(records: AnalyticsRecord[]) {
  const rows = new Map<string, { month: string; income: number; expenses: number; net: number }>()
  for (const record of records) {
    if (record.kind !== 'transaction') continue
    const month = record.effective_date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) continue
    const row = rows.get(month) ?? { month, income: 0, expenses: 0, net: 0 }
    const amount = Math.max(0, finite(record.payload.amount))
    if (record.payload.direction === 'income') row.income += amount
    if (record.payload.direction === 'expense') row.expenses += amount
    row.net = row.income - row.expenses
    rows.set(month, row)
  }
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export function latestFinancialPositions(records: AnalyticsRecord[]) {
  const latest = new Map<string, { record: AnalyticsRecord; index: number }>()
  records.forEach((record, index) => {
    if (!['account_balance','asset_valuation','liability_snapshot','mortgage_snapshot','pension_snapshot'].includes(record.kind)) return
    const key = `${record.kind}:${String(record.payload.account_or_asset_id ?? record.payload.metric_key ?? record.title).trim().toLowerCase()}`
    const current = latest.get(key)
    if (!current || current.record.effective_date < record.effective_date || (current.record.effective_date === record.effective_date && current.index < index)) latest.set(key, { record, index })
  })
  return [...latest.values()].map((row) => row.record).sort((a, b) => a.effective_date.localeCompare(b.effective_date))
}

export function financialPositionSummary(records: AnalyticsRecord[]) {
  const positions = latestFinancialPositions(records)
  let assets = 0
  let liabilities = 0
  let liquidity = 0
  for (const row of positions) {
    const share = clamp(finite(row.payload.ownership_share ?? 1), 0, 1)
    const signedAmount = finite(row.payload.amount) * share
    if (['liability_snapshot','mortgage_snapshot'].includes(row.kind)) liabilities += Math.abs(signedAmount)
    else if (signedAmount >= 0) assets += signedAmount
    else liabilities += Math.abs(signedAmount)
    if (row.kind === 'account_balance') liquidity += signedAmount
  }
  return {
    positions,
    assets,
    liabilities,
    net: assets - liabilities,
    liquidity,
    debtToAssets: assets > 0 ? liabilities / assets : null,
  }
}

export function liquidityRunway(liquidity: number, monthlyFlows: ReturnType<typeof cashFlowMonthly>, lookbackMonths = 6) {
  const covered = monthlyFlows.filter((row) => row.expenses > 0).slice(-Math.max(1, Math.round(lookbackMonths)))
  const averageMonthlyExpenses = covered.length ? covered.reduce((sum, row) => sum + row.expenses, 0) / covered.length : null
  return {
    averageMonthlyExpenses,
    observedMonths: covered.length,
    runwayMonths: averageMonthlyExpenses && averageMonthlyExpenses > 0 ? Math.max(0, finite(liquidity)) / averageMonthlyExpenses : null,
  }
}

export function financialIndependenceSummary(capital: number, monthlyFlows: ReturnType<typeof cashFlowMonthly>, withdrawalRate = 0.04, lookbackMonths = 12, annualExpenseOverride?: number | null) {
  const covered = monthlyFlows.filter((row) => row.expenses > 0).slice(-Math.max(1, Math.round(lookbackMonths)))
  const observedExpenses = covered.reduce((sum, row) => sum + row.expenses, 0)
  const observedAnnualizedExpenses = covered.length ? observedExpenses / covered.length * 12 : null
  const validOverride = annualExpenseOverride != null && Number.isFinite(annualExpenseOverride) && annualExpenseOverride > 0
  const annualizedExpenses = validOverride ? annualExpenseOverride : observedAnnualizedExpenses
  const investableCapital = Math.max(0, finite(capital))
  const safeRate = clamp(withdrawalRate, 0.001, 0.2)
  const sustainableAnnualWithdrawal = investableCapital * safeRate
  return {
    observedMonths: covered.length,
    annualizedExpenses,
    expenseSource: validOverride ? 'manual_scenario' as const : observedAnnualizedExpenses == null ? 'unavailable' as const : 'observed_cash_flow' as const,
    yearsOfExpenses: annualizedExpenses && annualizedExpenses > 0 ? investableCapital / annualizedExpenses : null,
    sustainableAnnualWithdrawal,
    financialIndependenceTarget: annualizedExpenses && annualizedExpenses > 0 ? annualizedExpenses / safeRate : null,
    expenseCoverageRatio: annualizedExpenses && annualizedExpenses > 0 ? sustainableAnnualWithdrawal / annualizedExpenses : null,
    withdrawalRate: safeRate,
  }
}

// Real estate and other illiquid holdings cannot fund a withdrawal, so financial
// independence must be measured on liquidatable capital. Using net worth would
// count the home twice: once as capital and again as somewhere you live.
const illiquidKinds = ['asset_valuation', 'pension_snapshot']

export function investableCapital(records: AnalyticsRecord[], portfolioMarketValue: number) {
  const positions = latestFinancialPositions(records)
  let liquidity = 0
  let illiquid = 0
  for (const row of positions) {
    const share = clamp(finite(row.payload.ownership_share ?? 1), 0, 1)
    const amount = finite(row.payload.amount) * share
    if (row.kind === 'account_balance') liquidity += amount
    else if (illiquidKinds.includes(row.kind)) illiquid += Math.max(0, amount)
  }
  const portfolio = Math.max(0, finite(portfolioMarketValue))
  return {
    total: Math.max(0, portfolio + liquidity),
    portfolio,
    liquidity,
    excludedIlliquid: illiquid,
    basis: portfolio > 0 || liquidity !== 0 ? 'portfolio_and_liquidity' as const : 'unavailable' as const,
  }
}

export function budgetVarianceMonthly(records: AnalyticsRecord[], month: string) {
  const monthly = (amount: number, cadence: string) => cadence === 'annual' ? amount / 12
    : cadence === 'quarterly' ? amount / 3
      : cadence === 'weekly' ? amount * 52 / 12
        : cadence === 'monthly' ? amount : 0
  const budgets = new Map<string, number>()
  const latest = new Map<string, { date: string; index: number }>()
  records.forEach((record, index) => {
    if (record.kind !== 'budget_target') return
    const category = String(record.payload.category ?? '').trim()
    if (!category) return
    const startsOn = record.payload.starts_on == null ? null : String(record.payload.starts_on)
    const endsOn = record.payload.ends_on == null ? null : String(record.payload.ends_on)
    // A budget applies to the month when its window overlaps that month.
    if (startsOn && startsOn.slice(0, 7) > month) return
    if (endsOn && endsOn.slice(0, 7) < month) return
    const current = latest.get(category)
    if (current && (current.date > record.effective_date || (current.date === record.effective_date && current.index > index))) return
    latest.set(category, { date: record.effective_date, index })
    budgets.set(category, monthly(Math.max(0, finite(record.payload.amount)), String(record.payload.cadence)))
  })
  const actuals = new Map<string, number>()
  for (const record of records) {
    if (record.kind !== 'transaction' || record.payload.direction !== 'expense') continue
    if (record.effective_date.slice(0, 7) !== month) continue
    const category = String(record.payload.category ?? '').trim() || 'Altro'
    actuals.set(category, (actuals.get(category) ?? 0) + Math.max(0, finite(record.payload.amount)))
  }
  const rows = [...new Set([...budgets.keys(), ...actuals.keys()])].map((category) => {
    const budget = budgets.get(category) ?? null
    const actual = actuals.get(category) ?? 0
    return {
      category, budget, actual,
      variance: budget == null ? null : budget - actual,
      usageRatio: budget != null && budget > 0 ? actual / budget : null,
    }
  }).sort((a, b) => b.actual - a.actual)
  const budgetedTotal = rows.reduce((sum, row) => sum + (row.budget ?? 0), 0)
  const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0)
  return {
    month, rows, budgetedTotal, actualTotal,
    variance: budgetedTotal - actualTotal,
    usageRatio: budgetedTotal > 0 ? actualTotal / budgetedTotal : null,
    unbudgetedValue: rows.filter((row) => row.budget == null).reduce((sum, row) => sum + row.actual, 0),
    overBudgetCategories: rows.filter((row) => row.variance != null && row.variance < 0).length,
  }
}

export function deadlineReliability(records: AnalyticsRecord[], today: string) {
  let completed = 0
  let late = 0
  let openOverdue = 0
  for (const record of records) {
    if (record.kind !== 'deadline') continue
    const dueOn = String(record.payload.due_at ?? '').slice(0, 10)
    if (!isoDay(dueOn)) continue
    const status = String(record.payload.status ?? 'open')
    if (status === 'completed') {
      completed += 1
      // effective_date carries the due day, so a later confirmation is the only
      // available evidence of lateness; without it the record counts as on time.
      if (record.effective_date > dueOn) late += 1
    } else if (status === 'open' && dueOn < today) openOverdue += 1
  }
  return {
    completed, late, openOverdue,
    onTime: completed - late,
    onTimeRatio: completed > 0 ? (completed - late) / completed : null,
  }
}

export function provenanceMix(records: AnalyticsRecord[]) {
  const counts = { verified: 0, declared: 0, estimated: 0, planned: 0 }
  for (const record of records) {
    const status = String(record.evidence_status ?? 'declared')
    if (status in counts) counts[status as keyof typeof counts] += 1
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const evidenced = counts.verified + counts.declared + counts.estimated
  return {
    ...counts, total,
    verifiedRatio: evidenced > 0 ? counts.verified / evidenced : null,
    estimatedRatio: evidenced > 0 ? counts.estimated / evidenced : null,
  }
}

export function netWorthStatistics(rows: Array<{ date: string; value: number }>) {
  const latestByMonth = new Map<string, { date: string; value: number }>()
  for (const row of rows) {
    if (!isoDay(row.date) || !Number.isFinite(row.value)) continue
    const month = row.date.slice(0, 7)
    const current = latestByMonth.get(month)
    if (!current || current.date < row.date) latestByMonth.set(month, row)
  }
  const monthlyValues = [...latestByMonth.entries()].map(([month, row]) => ({ month, ...row })).sort((a, b) => a.date.localeCompare(b.date))
  const changes = monthlyValues.slice(1).map((row, index) => {
    const previous = monthlyValues[index]
    const absoluteChange = row.value - previous.value
    return { month: row.month, value: row.value, absoluteChange, percentageChange: previous.value !== 0 ? absoluteChange / Math.abs(previous.value) : null }
  })
  const first = monthlyValues[0]
  const last = monthlyValues.at(-1)
  const elapsedDays = first && last ? (Date.parse(`${last.date}T12:00:00Z`) - Date.parse(`${first.date}T12:00:00Z`)) / 86_400_000 : 0
  const cagr = first && last && first.value > 0 && last.value > 0 && elapsedDays >= 365
    ? Math.pow(last.value / first.value, 365.25 / elapsedDays) - 1 : null
  const priorYear = last ? latestByMonth.get(`${Number(last.month.slice(0, 4)) - 1}-${last.month.slice(5)}`) : null
  const change12Months = last && priorYear ? last.value - priorYear.value : null
  const change12MonthsPercentage = last && priorYear && priorYear.value !== 0 ? (last.value - priorYear.value) / Math.abs(priorYear.value) : null
  const ranked = [...changes].sort((a, b) => b.absoluteChange - a.absoluteChange)
  return {
    monthlyValues,
    changes,
    latest: last?.value ?? null,
    change12Months,
    change12MonthsPercentage,
    cagr,
    bestMonth: ranked[0] ?? null,
    worstMonth: ranked.at(-1) ?? null,
  }
}

export function vehicleCostsAnnual(records: AnalyticsRecord[]) {
  const rows = new Map<string, { year: string; fixed: number; energy: number; maintenance: number; financing: number; usage: number; other: number; total: number }>()
  for (const record of records) {
    if (record.payload.category !== 'vehicle.cost') continue
    const details = recordDetails(record)
    const category = String(details.cost_category ?? 'other')
    const amount = finite(details.amount ?? record.payload.value)
    const year = record.effective_date.slice(0, 4)
    if (!/^\d{4}$/.test(year)) continue
    const row = rows.get(year) ?? { year, fixed: 0, energy: 0, maintenance: 0, financing: 0, usage: 0, other: 0, total: 0 }
    const group = ['insurance','road_tax','inspection'].includes(category) ? 'fixed'
      : category === 'fuel_energy' ? 'energy'
        : ['service','tires','brakes','battery','extraordinary'].includes(category) ? 'maintenance'
          : category === 'financing_interest' ? 'financing'
            : ['parking_tolls','washing_accessories'].includes(category) ? 'usage' : 'other'
    row[group] += amount
    row.total += amount
    rows.set(year, row)
  }
  return [...rows.values()].sort((a, b) => a.year.localeCompare(b.year))
}

function monthSegments(start: string, end: string) {
  const startDay = Date.parse(`${start}T12:00:00Z`)
  const endDay = Date.parse(`${end}T12:00:00Z`)
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay || endDay - startDay > 730 * 86_400_000) return []
  const totalDays = Math.round((endDay - startDay) / 86_400_000) + 1
  const result: Array<{ month: string; fraction: number }> = []
  let cursor = new Date(startDay)
  while (cursor.getTime() <= endDay) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth()
    const monthEnd = Date.UTC(year, month + 1, 0, 12)
    const segmentEnd = Math.min(monthEnd, endDay)
    const days = Math.round((segmentEnd - cursor.getTime()) / 86_400_000) + 1
    result.push({ month: `${year}-${String(month + 1).padStart(2, '0')}`, fraction: days / totalDays })
    cursor = new Date(Date.UTC(year, month + 1, 1, 12))
  }
  return result
}

export function utilityMonthly(records: AnalyticsRecord[]) {
  const rows = new Map<string, Record<string, number | string>>()
  for (const record of records) {
    if (record.kind !== 'utility_bill') continue
    const type = String(record.payload.utility_type ?? 'other')
    const start = isoDay(String(record.payload.period_start ?? ''))
    const end = isoDay(String(record.payload.period_end ?? ''))
    const segments = start && end ? monthSegments(start, end) : []
    const allocations = segments.length ? segments : [{ month: record.effective_date.slice(0, 7), fraction: 1 }]
    for (const allocation of allocations) {
      const row = rows.get(allocation.month) ?? { month: allocation.month }
      row[type] = finite(row[type]) + finite(record.payload.amount) * allocation.fraction
      rows.set(allocation.month, row)
    }
  }
  return [...rows.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)))
}

export function utilitySummary(records: AnalyticsRecord[]) {
  const rows = new Map<string, { type: string; unit: string; amount: number; consumption: number; bills: number; firstPeriod: string; lastPeriod: string }>()
  for (const record of records) {
    if (record.kind !== 'utility_bill') continue
    const type = String(record.payload.utility_type ?? 'other')
    const unit = String(record.payload.consumption_unit ?? '')
    const key = `${type}:${unit}`
    const current = rows.get(key) ?? { type, unit, amount: 0, consumption: 0, bills: 0, firstPeriod: String(record.payload.period_start ?? record.effective_date), lastPeriod: String(record.payload.period_end ?? record.effective_date) }
    current.amount += finite(record.payload.amount)
    current.consumption += Math.max(0, finite(record.payload.consumption))
    current.bills += 1
    current.firstPeriod = [current.firstPeriod, String(record.payload.period_start ?? record.effective_date)].filter(Boolean).sort()[0]
    current.lastPeriod = [current.lastPeriod, String(record.payload.period_end ?? record.effective_date)].filter(Boolean).sort().at(-1) ?? current.lastPeriod
    rows.set(key, current)
  }
  return [...rows.values()].map((row) => ({ ...row, unitCost: row.consumption > 0 ? row.amount / row.consumption : null })).sort((a, b) => b.amount - a.amount)
}

export function datedSeriesStatistics(rows: Array<{ date: string; value: number }>) {
  const valid = rows.filter((row) => isoDay(row.date) && Number.isFinite(row.value)).sort((a, b) => a.date.localeCompare(b.date))
  if (!valid.length) return { count: 0, mean: null, median: null, minimum: null, maximum: null, standardDeviation: null, change: null, slopePer30Days: null }
  const values = valid.map((row) => row.value)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const sorted = [...values].sort((a, b) => a - b)
  const median = percentile(sorted, 0.5)
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
  const origin = Date.parse(`${valid[0].date}T12:00:00Z`)
  const xs = valid.map((row) => (Date.parse(`${row.date}T12:00:00Z`) - origin) / 86_400_000)
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const covariance = xs.reduce((sum, value, index) => sum + (value - xMean) * (values[index] - mean), 0)
  const xVariance = xs.reduce((sum, value) => sum + Math.pow(value - xMean, 2), 0)
  return {
    count: values.length,
    mean,
    median,
    minimum: sorted[0],
    maximum: sorted.at(-1)!,
    standardDeviation: Math.sqrt(variance),
    change: values.length > 1 ? values.at(-1)! - values[0] : null,
    slopePer30Days: xVariance > 0 ? covariance / xVariance * 30 : null,
  }
}

export function periodComparisonStatistics(rows: Array<{ date: string; value: number }>) {
  const latestByDate = new Map<string, number>()
  for (const row of rows) if (isoDay(row.date) && Number.isFinite(row.value)) latestByDate.set(row.date, row.value)
  const valid = [...latestByDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
  if (!valid.length) return { last: null, lastDate: null, average28: null, average90: null, average365: null, previous90: null, changeVsPrevious90: null, coverage90: null as number | null, observations90: 0, cadenceDays: null as number | null, expectedObservations90: 0 }
  const last = valid.at(-1)!
  const end = Date.parse(`${last.date}T12:00:00Z`)
  const window = (days: number, offsetDays = 0) => {
    const upper = end - offsetDays * 86_400_000
    const lower = upper - (days - 1) * 86_400_000
    return valid.filter((row) => {
      const time = Date.parse(`${row.date}T12:00:00Z`)
      return time >= lower && time <= upper
    })
  }
  const average = (values: Array<{ value: number }>) => values.length ? values.reduce((sum, row) => sum + row.value, 0) / values.length : null
  const current90Rows = window(90)
  const current90 = average(current90Rows)
  const previous90 = average(window(90, 90))
  // Coverage is measured against the cadence the series actually has, not against
  // 90 calendar days: a metric recorded weekly is fully covered with 13 readings,
  // and dividing by 90 would report it as a 14% gap that no import can close.
  const intervals = current90Rows.slice(1).map((row, index) =>
    (Date.parse(`${row.date}T12:00:00Z`) - Date.parse(`${current90Rows[index].date}T12:00:00Z`)) / 86_400_000)
    .filter((value) => value > 0)
  // Below two observations the cadence is unknowable, so coverage is reported as
  // null rather than guessed: assuming daily understates a weekly metric, and
  // assuming the lone reading is the whole series would claim full coverage.
  const cadenceDays = intervals.length ? Math.max(1, median(intervals) ?? 1) : null
  const expectedObservations90 = cadenceDays == null ? 0 : Math.max(1, Math.round(90 / cadenceDays))
  return {
    last: last.value,
    lastDate: last.date,
    average28: average(window(28)),
    average90: current90,
    average365: average(window(365)),
    previous90,
    changeVsPrevious90: current90 != null && previous90 != null && previous90 !== 0 ? current90 / previous90 - 1 : null,
    coverage90: expectedObservations90 > 0 ? Math.min(1, current90Rows.length / expectedObservations90) : null,
    observations90: current90Rows.length,
    cadenceDays,
    expectedObservations90,
  }
}

export function monthlySeriesStatistics(rows: Array<{ date: string; value: number }>) {
  const months = new Map<string, number[]>()
  const latestByDate = new Map<string, number>()
  for (const row of rows) if (isoDay(row.date) && Number.isFinite(row.value)) latestByDate.set(row.date, row.value)
  for (const [date, value] of latestByDate) {
    const month = date.slice(0, 7)
    const values = months.get(month) ?? []
    values.push(value)
    months.set(month, values)
  }
  return [...months.entries()].map(([month, values]) => ({
    month,
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: median(values)!,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  })).sort((a, b) => a.month.localeCompare(b.month))
}

export function rollingCalendarAverage(rows: Array<{ date: string; value: number }>, windowDays = 7) {
  const days = Math.max(1, Math.round(windowDays))
  const valid = rows.filter((row) => isoDay(row.date) && Number.isFinite(row.value)).sort((a, b) => a.date.localeCompare(b.date))
  return valid.map((row, index) => {
    const lower = Date.parse(`${row.date}T12:00:00Z`) - (days - 1) * 86_400_000
    const window = valid.slice(0, index + 1).filter((candidate) => Date.parse(`${candidate.date}T12:00:00Z`) >= lower)
    return { ...row, rolling: window.reduce((sum, candidate) => sum + candidate.value, 0) / window.length, observations: window.length }
  })
}
