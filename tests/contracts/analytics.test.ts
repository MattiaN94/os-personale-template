import { describe, expect, it } from 'vitest'
import {
  budgetVarianceMonthly, calculateBmi, calculateMifflinStJeor, calculateNutritionTargets, calculateVehicleTco, cashFlowMonthly, datedSeriesStatistics, deadlineReliability, estimateOrdinaryIsee, financialIndependenceSummary, financialPositionSummary, healthSourceCoverage, hrvBaselineSummary, investableCapital, liquidityRunway, monthlySeriesStatistics, netWorthStatistics, nutritionDaily, provenanceMix,
  periodComparisonStatistics, projectCapitalRunway,
  portfolioExposureSummary, portfolioPerformanceStatistics, portfolioPositions, portfolioSummary, projectFutureValue, projectMonteCarlo,
  rollingCalendarAverage, utilityMonthly, utilitySummary, vehicleCostsAnnual, wearableEnergySummary,
  type AnalyticsRecord, type IseeInput,
} from '../../shared/analytics'

const emptyIsee: IseeInput = {
  householdMembers: 1, dependentChildren: 0, disabledMembers: 0, additionalScaleIncrement: 0,
  incomeForIsee: 0, incomeDeductions: 0, annualRent: 0,
  accountClosingBalances: 0, accountAverageBalances: 0, eligibleAssetPurchaseIncrement: 0,
  useClosingBalanceException: false, otherFinancialAssets: 0, excludedGovernmentBonds: 0,
  primaryHomeImuValue: 0, primaryHomeMortgageResidual: 0,
  otherRealEstateImuValue: 0, otherRealEstateMortgageResidual: 0,
  calculationMode: 'ordinary', metropolitanCapitalHome: false,
}

describe('personal analytics', () => {
  it('keeps monthly investment projection deterministic and supports fractional years', () => {
    const points = projectFutureValue({ startingValue: 10_000, monthlyContribution: 300, annualReturn: 0, annualInflation: 0, years: 1.5 })
    expect(points.map((row) => row.year)).toEqual([0, 1, 1.5])
    expect(points.at(-1)?.nominal).toBe(15_400)
    expect(points.at(-1)?.contributedReal).toBe(15_400)
  })

  it('deducts annual costs from deterministic projections', () => {
    const gross = projectFutureValue({ startingValue: 10_000, monthlyContribution: 0, annualReturn: 0.05, annualInflation: 0, annualFee: 0, years: 1 }).at(-1)!
    const net = projectFutureValue({ startingValue: 10_000, monthlyContribution: 0, annualReturn: 0.05, annualInflation: 0, annualFee: 0.01, years: 1 }).at(-1)!
    expect(gross.nominal).toBeCloseTo(10_500, 6)
    expect(net.nominal).toBeCloseTo(10_395, 6)
  })

  it('keeps Monte Carlo reproducible and ordered', () => {
    const input = { startingValue: 10_000, monthlyContribution: 300, annualReturn: 0.05, annualInflation: 0.02, annualVolatility: 0.15, years: 10, simulations: 500, seed: 42 }
    const first = projectMonteCarlo(input)
    const second = projectMonteCarlo(input)
    expect(first).toEqual(second)
    expect(first.points.at(-1)!.p10).toBeLessThan(first.points.at(-1)!.p50)
    expect(first.points.at(-1)!.p50).toBeLessThan(first.points.at(-1)!.p90)
    expect(first.probabilityAboveContributions).toBeGreaterThanOrEqual(0)
    expect(first.probabilityAboveContributions).toBeLessThanOrEqual(1)
  })

  it('projects capital autonomy and reports exhaustion without negative balances', () => {
    const result = projectCapitalRunway({ startingValue: 12_000, annualExpenses: 12_000, annualPassiveIncome: 0, annualTemporaryIncome: 0, temporaryIncomeYears: 0, annualReturn: 0, annualInflation: 0, years: 2 })
    expect(result.exhaustedAfterYears).toBe(1)
    expect(result.endingReal).toBe(0)
    expect(result.points.every((row) => row.real >= 0)).toBe(true)
  })

  it('applies ordinary ISEE asset franchises and the 50k exclusion cap', () => {
    const result = estimateOrdinaryIsee({
      ...emptyIsee,
      incomeForIsee: 30_000,
      accountClosingBalances: 5_000,
      accountAverageBalances: 8_000,
      otherFinancialAssets: 72_000,
      excludedGovernmentBonds: 60_000,
      primaryHomeImuValue: 90_000,
      primaryHomeMortgageResidual: 70_000,
    })
    expect(result.accountValue).toBe(8_000)
    expect(result.excludedEligibleAssets).toBe(50_000)
    expect(result.excludedAssetsOverCap).toBe(10_000)
    expect(result.movableNet).toBe(24_000)
    expect(result.primaryHomeCounted).toBe(0)
    expect(result.estimatedIsee).toBe(34_800)
  })

  it('uses the lower closing balance only when the documented exception is sufficient', () => {
    const result = estimateOrdinaryIsee({ ...emptyIsee, accountClosingBalances: 5_000, accountAverageBalances: 15_000, eligibleAssetPurchaseIncrement: 10_000, useClosingBalanceException: true })
    expect(result.closingBalanceExceptionApplied).toBe(true)
    expect(result.accountValue).toBe(5_000)
  })

  it('keeps ordinary and 2026 specific family ISEE modes distinct', () => {
    const ordinary = estimateOrdinaryIsee({ ...emptyIsee, primaryHomeImuValue: 100_000 })
    const specific = estimateOrdinaryIsee({ ...emptyIsee, primaryHomeImuValue: 100_000, calculationMode: 'family_inclusion_2026' })
    expect(ordinary.primaryHomeFranchise).toBe(52_500)
    expect(specific.primaryHomeFranchise).toBe(91_500)
    expect(specific.estimatedIsee).toBeLessThan(ordinary.estimatedIsee)
  })

  it('applies the special 2026 home and child increments only in its mode', () => {
    const ordinary = estimateOrdinaryIsee({ ...emptyIsee, householdMembers: 3, dependentChildren: 2 })
    const specific = estimateOrdinaryIsee({ ...emptyIsee, householdMembers: 3, dependentChildren: 2, calculationMode: 'family_inclusion_2026' })
    expect(ordinary.primaryHomeFranchise).toBe(52_500)
    expect(specific.primaryHomeFranchise).toBe(94_000)
    expect(ordinary.scale).toBe(2.04)
    expect(specific.scale).toBe(2.14)
  })

  it('does not allow household subgroups to exceed household members', () => {
    const result = estimateOrdinaryIsee({ ...emptyIsee, householdMembers: 1, dependentChildren: 99, accountAverageBalances: 10_000 })
    expect(result.scale).toBe(1)
    expect(result.movableFranchise).toBe(6_000)
  })

  it('separates depreciation, costs and opportunity cost', () => {
    const result = calculateVehicleTco({ purchasePrice: 20_000, currentResidualValue: 12_000, ownershipYears: 4, kilometresDriven: 40_000, annualOpportunityRate: 0.02, runningCosts: [{ category: 'insurance', amount: 2_400 }, { category: 'maintenance', amount: 1_600 }] })
    expect(result.depreciation).toBe(8_000)
    expect(result.opportunityCost).toBe(1_280)
    expect(result.totalCost).toBe(13_280)
    expect(result.costPerKm).toBe(0.332)
  })

  it('does not invent an ownership period', () => {
    const result = calculateVehicleTco({ purchasePrice: 20_000, currentResidualValue: 12_000, ownershipYears: 0, kilometresDriven: 0, runningCosts: [] })
    expect(result.annualCost).toBeNull()
    expect(result.monthlyCost).toBeNull()
  })

  it('normalizes BMI units and rejects unknown units', () => {
    expect(calculateBmi(70, 'kg', 175, 'cm')).toBeCloseTo(22.857, 3)
    expect(calculateBmi(154.324, 'lb', 68.8976, 'in')).toBeCloseTo(22.857, 2)
    expect(calculateBmi(70, 'stone', 175, 'cm')).toBeNull()
  })

  it('calculates Mifflin-St Jeor only with a supported biological sex', () => {
    expect(calculateMifflinStJeor(70, 175, 31, 'male')).toBe(1_643.75)
    expect(calculateMifflinStJeor(70, 175, 31, 'female')).toBe(1_477.75)
    expect(calculateMifflinStJeor(70, 175, 31, 'unspecified')).toBeNull()
  })

  it('derives nutrition targets only from explicit profile assumptions', () => {
    const result = calculateNutritionTargets({
      tdeeKcal: 2_000, weightKg: 70, heightCm: 175, deficitPercent: 0.15,
      deficitMinimumKcal: 200, deficitMaximumKcal: 400, proteinGramsPerKg: 2,
      fatGramsPerKg: 0.8, surplusKcal: 200, energyPerKgKcal: 7_700,
      recentMedianSteps: 8_000, stepIncrement: 1_000, minimumSteps: 6_000,
      maximumSteps: 12_000, stepRounding: 500,
    })
    expect(result).toMatchObject({ deficitKcal: 300, caloriesDeficit: 1_700, caloriesMaintenance: 2_000, caloriesGrowth: 2_200, proteinGrams: 140, fatGrams: 55, carbohydratesDeficitGrams: 160, stepTarget: 9_000, checkpointWeight: 68 })
    expect(result.expectedWeeklyWeightChange).toBeCloseTo(-0.2727, 3)
    expect(calculateNutritionTargets({ tdeeKcal: 2_000, weightKg: 70, heightCm: 175 }).caloriesDeficit).toBeNull()
  })

  it('reconciles wearable energy by complete date and a single source pair', () => {
    const result = wearableEnergySummary([
      { observed_on: '2026-01-01', metric_key: 'activity.active_energy', source_label: 'Watch', value_sum: 500 },
      { observed_on: '2026-01-01', metric_key: 'activity.basal_energy', source_label: 'Watch', value_sum: 1_500 },
      { observed_on: '2026-01-02', metric_key: 'activity.active_energy', source_label: 'Watch', value_sum: 700 },
      { observed_on: '2026-01-02', metric_key: 'activity.basal_energy', source_label: 'Watch', value_sum: 1_500 },
      { observed_on: '2026-01-02', metric_key: 'activity.active_energy', source_label: 'Phone', value_sum: 100 },
    ])
    expect(result).toMatchObject({ medianKcal: 2_100, dayCount: 2, activeSource: 'Watch', basalSource: 'Watch' })
  })

  it('prefers recent wearable energy coverage over a larger stale history', () => {
    const result = wearableEnergySummary([
      { observed_on: '2025-01-01', metric_key: 'activity.active_energy', source_label: 'Old Watch', value_sum: 500 },
      { observed_on: '2025-01-01', metric_key: 'activity.basal_energy', source_label: 'Old Watch', value_sum: 1_500 },
      { observed_on: '2025-01-02', metric_key: 'activity.active_energy', source_label: 'Old Watch', value_sum: 500 },
      { observed_on: '2025-01-02', metric_key: 'activity.basal_energy', source_label: 'Old Watch', value_sum: 1_500 },
      { observed_on: '2026-01-01', metric_key: 'activity.active_energy', source_label: 'Current Watch', value_sum: 700 },
      { observed_on: '2026-01-01', metric_key: 'activity.basal_energy', source_label: 'Current Watch', value_sum: 1_600 },
    ])
    expect(result).toMatchObject({ medianKcal: 2_300, dayCount: 1, activeSource: 'Current Watch', basalSource: 'Current Watch' })
  })

  it('keeps Apple HRV as an individual SDNN baseline ratio', () => {
    const result = hrvBaselineSummary([
      { observed_on: '2026-01-01', metric_key: 'heart.hrv_sdnn', source_label: 'Watch', value_avg: 40 },
      { observed_on: '2026-02-28', metric_key: 'heart.hrv_sdnn', source_label: 'Watch', value_avg: 60 },
      { observed_on: '2026-02-28', metric_key: 'heart.hrv_sdnn', source_label: 'Phone', value_avg: 10 },
    ])
    expect(result.source).toBe('Watch')
    expect(result.average7).toBe(60)
    expect(result.average60).toBe(50)
    expect(result.ratio7To60).toBe(1.2)
  })

  it('selects the HRV source with current-window coverage', () => {
    const result = hrvBaselineSummary([
      { observed_on: '2025-01-01', metric_key: 'heart.hrv_sdnn', source_label: 'Old Watch', value_avg: 30 },
      { observed_on: '2025-01-02', metric_key: 'heart.hrv_sdnn', source_label: 'Old Watch', value_avg: 35 },
      { observed_on: '2026-01-01', metric_key: 'heart.hrv_sdnn', source_label: 'Current Watch', value_avg: 50 },
    ])
    expect(result.source).toBe('Current Watch')
    expect(result.latest).toBe(50)
    expect(result.observations60).toBe(1)
  })

  it('ranks health sources by recent coverage before stale history', () => {
    expect(healthSourceCoverage([
      { observed_on: '2025-01-01', metric_key: 'activity.steps', source_label: 'Old', value_sum: 10 },
      { observed_on: '2025-01-02', metric_key: 'activity.steps', source_label: 'Old', value_sum: 20 },
      { observed_on: '2026-01-01', metric_key: 'activity.steps', source_label: 'Current', value_sum: 30 },
    ])[0]).toMatchObject({ source: 'Current', recentDays: 1, latestDate: '2026-01-01' })
  })

  it('aggregates photo meals with uncertainty, sodium and macro checks', () => {
    const rows = nutritionDaily([
      { id: '1', kind: 'fact', title: 'Pranzo', effective_date: '2026-08-13', evidence_status: 'estimated', payload: { category: 'nutrition.meal', details: { meal_id: 'lunch-1', calories: 500, uncertainty_kcal: 80, protein_g: 30, carbs_g: 50, fat_g: 20, fibre_g: 6, sodium_mg: 700 } } },
      { id: '2', kind: 'fact', title: 'Contorno', effective_date: '2026-08-13', evidence_status: 'estimated', payload: { category: 'nutrition.meal', details: { meal_id: 'lunch-1', calories: 150, uncertainty_kcal: 20, protein_g: 5, carbs_g: 20, fat_g: 0, fibre_g: 2, sodium_mg: 200 } } },
    ])
    expect(rows[0]).toMatchObject({ calories: 650, caloriesLow: 550, caloriesHigh: 750, sodium: 900, macroCalories: 600, macroDelta: 50, meals: 1, estimatedMeals: 1 })
  })

  it('keeps only the latest portfolio position and computes concentration', () => {
    const records: AnalyticsRecord[] = [
      { id: 'old', kind: 'fact', title: 'ETF A', effective_date: '2026-01-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', market_value: 100, cost_basis: 90 } } },
      { id: 'new', kind: 'fact', title: 'ETF A', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', market_value: 600, cost_basis: 500 } } },
      { id: 'b', kind: 'fact', title: 'ETF B', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'B', market_value: 400, cost_basis: 350 } } },
    ]
    const summary = portfolioSummary(portfolioPositions(records))
    expect(summary.rows).toHaveLength(2)
    expect(summary.marketValue).toBe(1_000)
    expect(summary.profitLoss).toBe(150)
    expect(summary.effectivePositions).toBeCloseTo(1 / (0.36 + 0.16), 6)
  })

  it('aggregates one instrument held in multiple accounts after per-account deduplication', () => {
    const records: AnalyticsRecord[] = [
      { id: 'a-old', kind: 'fact', title: 'ETF A', effective_date: '2026-01-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', isin: 'IE00TEST0001', account_label: 'Broker 1', market_value: 100, cost_basis: 90 } } },
      { id: 'a-new', kind: 'fact', title: 'ETF A', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', isin: 'IE00TEST0001', account_label: 'Broker 1', market_value: 600, cost_basis: 500 } } },
      { id: 'a-other', kind: 'fact', title: 'ETF A', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', isin: 'IE00TEST0001', account_label: 'Broker 2', market_value: 400, cost_basis: 350 } } },
    ]
    const positions = portfolioPositions(records)
    expect(positions).toHaveLength(1)
    expect(positions[0]).toMatchObject({ marketValue: 1_000, costBasis: 850, profitLoss: 150, account: 'Broker 1, Broker 2' })
  })

  it('weights exposures by the associated instrument and reports coverage', () => {
    const records: AnalyticsRecord[] = [
      { id: 'a', kind: 'fact', title: 'A', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', market_value: 600 } } },
      { id: 'b', kind: 'fact', title: 'B', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'B', market_value: 400 } } },
      { id: 'eu', kind: 'fact', title: 'Europa', effective_date: '2026-02-01', payload: { category: 'portfolio.exposure', details: { instrument_code: 'A', region: 'Europa', weight: 0.5 } } },
    ]
    const result = portfolioExposureSummary(records, portfolioPositions(records))
    expect(result.rows).toEqual([{ name: 'Europa', value: 300 }])
    expect(result.coverageRatio).toBe(0.3)
    expect(result.unclassifiedValue).toBe(700)
    expect(result.overAllocatedValue).toBe(0)
  })

  it('matches documented exposure metadata through ISIN aliases', () => {
    const records: AnalyticsRecord[] = [
      { id: 'a', kind: 'fact', title: 'ETF A', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', isin: 'IE00TEST0001', market_value: 500 } } },
      { id: 'eu', kind: 'fact', title: 'Europa', effective_date: '2026-02-01', payload: { category: 'portfolio.exposure', details: { isin: 'IE00TEST0001', region: 'Europa', weight: 0.4 } } },
    ]
    expect(portfolioExposureSummary(records, portfolioPositions(records)).rows).toEqual([{ name: 'Europa', value: 200 }])
  })

  it('combines code and ISIN exposure rows for one holding without understating coverage', () => {
    const records: AnalyticsRecord[] = [
      { id: 'a', kind: 'fact', title: 'ETF A', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', isin: 'IE00TEST0001', market_value: 1_000 } } },
      { id: 'eu', kind: 'fact', title: 'Europa', effective_date: '2026-02-01', payload: { category: 'portfolio.exposure', details: { instrument_code: 'A', region: 'Europa', weight: 0.4 } } },
      { id: 'us', kind: 'fact', title: 'Stati Uniti', effective_date: '2026-02-01', payload: { category: 'portfolio.exposure', details: { isin: 'IE00TEST0001', region: 'Stati Uniti', weight: 0.6 } } },
    ]
    const result = portfolioExposureSummary(records, portfolioPositions(records))
    expect(result.coverageRatio).toBe(1)
    expect(result.unclassifiedValue).toBe(0)
    expect(result.overAllocatedValue).toBe(0)
  })

  it('uses global exposure only for portfolio value not already classified per instrument', () => {
    const records: AnalyticsRecord[] = [
      { id: 'a', kind: 'fact', title: 'ETF A', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'A', market_value: 600 } } },
      { id: 'b', kind: 'fact', title: 'ETF B', effective_date: '2026-02-01', payload: { category: 'portfolio.position', details: { instrument_code: 'B', market_value: 400 } } },
      { id: 'eu', kind: 'fact', title: 'Europa', effective_date: '2026-02-01', payload: { category: 'portfolio.exposure', details: { instrument_code: 'A', region: 'Europa', weight: 1 } } },
      { id: 'global', kind: 'fact', title: 'Altro', effective_date: '2026-02-01', payload: { category: 'portfolio.exposure', details: { region: 'Altro', weight: 0.4 } } },
    ]
    const result = portfolioExposureSummary(records, portfolioPositions(records))
    expect(result.coverageRatio).toBe(1)
    expect(result.unclassifiedValue).toBe(0)
    expect(result.overAllocatedValue).toBe(0)
  })

  it('calculates annualized return and drawdown from a reconciled cumulative series', () => {
    const result = portfolioPerformanceStatistics([
      { date: '2025-01-01', portfolio: 0 },
      { date: '2025-07-01', portfolio: 10 },
      { date: '2025-10-01', portfolio: -1 },
      { date: '2026-01-01', portfolio: 21 },
    ])
    expect(result.observations).toBe(4)
    expect(result.periodReturn).toBeCloseTo(0.21, 6)
    expect(result.annualizedReturn).toBeCloseTo(0.21, 2)
    expect(result.annualizedVolatility).not.toBeNull()
    expect(result.maxDrawdown).toBeCloseTo(-0.1, 6)
  })

  it('deduplicates financial positions and calculates liquidity runway', () => {
    const records: AnalyticsRecord[] = [
      { id: 'cash-old', kind: 'account_balance', title: 'Bank', effective_date: '2026-01-01', payload: { account_or_asset_id: 'bank', amount: 1_000 } },
      { id: 'cash-new', kind: 'account_balance', title: 'Bank', effective_date: '2026-02-01', payload: { account_or_asset_id: 'bank', amount: 6_000 } },
      { id: 'home', kind: 'asset_valuation', title: 'Home', effective_date: '2026-02-01', payload: { account_or_asset_id: 'home', amount: 100_000, ownership_share: 0.5 } },
      { id: 'mortgage', kind: 'mortgage_snapshot', title: 'Mortgage', effective_date: '2026-02-01', payload: { metric_key: 'mortgage.residual', amount: 40_000 } },
      { id: 'expense-a', kind: 'transaction', title: 'A', effective_date: '2026-01-10', payload: { direction: 'expense', amount: 1_000 } },
      { id: 'expense-b', kind: 'transaction', title: 'B', effective_date: '2026-02-10', payload: { direction: 'expense', amount: 2_000 } },
    ]
    const summary = financialPositionSummary(records)
    expect(summary.positions).toHaveLength(3)
    expect(summary.assets).toBe(56_000)
    expect(summary.liabilities).toBe(40_000)
    expect(summary.net).toBe(16_000)
    const runway = liquidityRunway(summary.liquidity, cashFlowMonthly(records))
    expect(runway.observedMonths).toBe(2)
    expect(runway.runwayMonths).toBe(4)
  })

  it('annualizes observed expenses for financial-independence indicators', () => {
    const result = financialIndependenceSummary(120_000, [
      { month: '2026-01', income: 0, expenses: 1_000, net: -1_000 },
      { month: '2026-02', income: 0, expenses: 1_000, net: -1_000 },
    ], 0.04)
    expect(result.observedMonths).toBe(2)
    expect(result.annualizedExpenses).toBe(12_000)
    expect(result.yearsOfExpenses).toBe(10)
    expect(result.sustainableAnnualWithdrawal).toBe(4_800)
    expect(result.expenseCoverageRatio).toBe(0.4)
  })

  it('uses a manual scenario expense without pretending it was observed', () => {
    const result = financialIndependenceSummary(100_000, [], 0.04, 12, 20_000)
    expect(result.expenseSource).toBe('manual_scenario')
    expect(result.yearsOfExpenses).toBe(5)
    expect(result.financialIndependenceTarget).toBe(500_000)
  })

  it('summarizes net-worth history without calling cash flows investment return', () => {
    const result = netWorthStatistics([
      { date: '2026-01-15', value: 100 },
      { date: '2026-01-31', value: 100 },
      { date: '2026-02-28', value: 120 },
      { date: '2027-01-31', value: 160 },
    ])
    expect(result.monthlyValues).toHaveLength(3)
    expect(result.change12Months).toBe(60)
    expect(result.change12MonthsPercentage).toBe(0.6)
    expect(result.cagr).toBeCloseTo(0.6, 2)
    expect(result.bestMonth?.absoluteChange).toBe(40)
  })

  it('treats a negative account balance as debt rather than a positive asset', () => {
    const result = financialPositionSummary([
      { id: 'overdraft', kind: 'account_balance', title: 'Bank', effective_date: '2026-02-01', payload: { account_or_asset_id: 'bank', amount: -500 } },
    ])
    expect(result.assets).toBe(0)
    expect(result.liabilities).toBe(500)
    expect(result.net).toBe(-500)
    expect(result.liquidity).toBe(-500)
  })

  it('groups vehicle running costs by year without adding depreciation', () => {
    const records: AnalyticsRecord[] = [
      { id: 'fuel', kind: 'fact', title: 'Fuel', effective_date: '2026-02-01', payload: { category: 'vehicle.cost', details: { cost_category: 'fuel_energy', amount: 500 } } },
      { id: 'insurance', kind: 'fact', title: 'Insurance', effective_date: '2026-03-01', payload: { category: 'vehicle.cost', details: { cost_category: 'insurance', amount: 700 } } },
      { id: 'brakes', kind: 'fact', title: 'Brakes', effective_date: '2027-01-01', payload: { category: 'vehicle.cost', details: { cost_category: 'brakes', amount: 300 } } },
    ]
    expect(vehicleCostsAnnual(records)).toEqual([
      { year: '2026', fixed: 700, energy: 500, maintenance: 0, financing: 0, usage: 0, other: 0, total: 1_200 },
      { year: '2027', fixed: 0, energy: 0, maintenance: 300, financing: 0, usage: 0, other: 0, total: 300 },
    ])
  })

  it('nets documented vehicle refunds instead of silently discarding them', () => {
    const tco = calculateVehicleTco({
      purchasePrice: 20_000,
      currentResidualValue: 15_000,
      ownershipYears: 2,
      kilometresDriven: 20_000,
      runningCosts: [
        { category: 'insurance', amount: 1_000 },
        { category: 'insurance', amount: -250 },
      ],
    })
    expect(tco.costsByCategory.insurance).toBe(750)
    expect(tco.totalCost).toBe(5_750)
    expect(vehicleCostsAnnual([
      { id: 'refund', kind: 'fact', title: 'Refund', effective_date: '2026-02-01', payload: { category: 'vehicle.cost', details: { cost_category: 'insurance', amount: -250 } } },
    ])[0].fixed).toBe(-250)
  })

  it('allocates utility cost across service months', () => {
    const rows = utilityMonthly([{ id: '1', kind: 'utility_bill', title: 'Luce', effective_date: '2026-02-10', payload: { utility_type: 'electricity', amount: 90, period_start: '2026-01-16', period_end: '2026-02-14' } }])
    expect(rows).toHaveLength(2)
    expect(Number(rows[0].electricity)).toBeCloseTo(48, 6)
    expect(Number(rows[1].electricity)).toBeCloseTo(42, 6)
  })

  it('nets utility credits without erasing them', () => {
    const records: AnalyticsRecord[] = [
      { id: 'bill', kind: 'utility_bill', title: 'Luce', effective_date: '2026-02-10', payload: { utility_type: 'electricity', amount: 100, consumption: 100, consumption_unit: 'kWh' } },
      { id: 'credit', kind: 'utility_bill', title: 'Credito', effective_date: '2026-02-20', payload: { utility_type: 'electricity', amount: -20, consumption: 0, consumption_unit: 'kWh' } },
    ]
    expect(Number(utilityMonthly(records)[0].electricity)).toBe(80)
    expect(utilitySummary(records)[0].unitCost).toBe(0.8)
  })

  it('describes dated series and uses calendar windows', () => {
    const rows = [{ date: '2026-01-01', value: 10 }, { date: '2026-01-02', value: 12 }, { date: '2026-01-10', value: 20 }]
    const stats = datedSeriesStatistics(rows)
    expect(stats.mean).toBe(14)
    expect(stats.median).toBe(12)
    expect(stats.change).toBe(10)
    const rolling = rollingCalendarAverage(rows, 7)
    expect(rolling.at(-1)?.rolling).toBe(20)
    expect(rolling.at(-1)?.observations).toBe(1)
  })


  it('compares health periods without filling missing days', () => {
    const rows = [
      { date: '2025-12-31', value: 10 },
      { date: '2026-03-31', value: 20 },
      { date: '2026-06-29', value: 30 },
    ]
    const result = periodComparisonStatistics(rows)
    expect(result.last).toBe(30)
    expect(result.average90).toBe(30)
    expect(result.previous90).toBe(20)
    expect(result.changeVsPrevious90).toBe(0.5)
    // A single reading inside the window cannot establish a cadence, so coverage
    // is withheld rather than guessed at 1/90 (which assumes a daily metric).
    expect(result.observations90).toBe(1)
    expect(result.cadenceDays).toBeNull()
    expect(result.coverage90).toBeNull()
  })

  it('measures coverage against the cadence the series actually has', () => {
    const weekly = Array.from({ length: 13 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 3, 1) + index * 7 * 86_400_000).toISOString().slice(0, 10),
      value: 10 + index,
    }))
    const result = periodComparisonStatistics(weekly)
    expect(result.cadenceDays).toBe(7)
    expect(result.expectedObservations90).toBe(13)
    // A complete weekly series is fully covered; dividing by 90 calendar days
    // would have reported a 14% gap that no further import could close.
    expect(result.coverage90).toBe(1)
  })

  it('reports a shortfall when a daily series has gaps', () => {
    const daily = Array.from({ length: 45 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 3, 1) + index * 86_400_000).toISOString().slice(0, 10),
      value: index,
    }))
    const result = periodComparisonStatistics(daily)
    expect(result.cadenceDays).toBe(1)
    expect(result.expectedObservations90).toBe(90)
    expect(result.coverage90).toBeCloseTo(45 / 90)
  })

  it('excludes illiquid holdings from the capital that can fund a withdrawal', () => {
    const records = [
      { id: 'a', kind: 'account_balance', title: 'Conto', effective_date: '2026-08-01', payload: { amount: 20_000, account_or_asset_id: 'conto-1' } },
      { id: 'h', kind: 'asset_valuation', title: 'Abitazione', effective_date: '2026-08-01', payload: { amount: 300_000, account_or_asset_id: 'casa' } },
      { id: 'p', kind: 'pension_snapshot', title: 'Fondo pensione', effective_date: '2026-08-01', payload: { amount: 40_000, account_or_asset_id: 'fondo' } },
    ]
    const result = investableCapital(records, 80_000)
    // The home and the pension are worth 340k but cannot fund a withdrawal, so
    // they must not inflate financial-independence figures.
    expect(result.total).toBe(100_000)
    expect(result.portfolio).toBe(80_000)
    expect(result.liquidity).toBe(20_000)
    expect(result.excludedIlliquid).toBe(340_000)
  })

  it('honours ownership share and reports an unavailable basis with no positions', () => {
    const shared = investableCapital([
      { id: 'a', kind: 'account_balance', title: 'Conto cointestato', effective_date: '2026-08-01', payload: { amount: 10_000, ownership_share: 0.5, account_or_asset_id: 'conto-2' } },
    ], 0)
    expect(shared.total).toBe(5_000)
    expect(investableCapital([], 0).basis).toBe('unavailable')
  })

  it('normalises budget cadences to a month and keeps unbudgeted spending visible', () => {
    const records = [
      { id: 'b1', kind: 'budget_target', title: 'Spesa casa', effective_date: '2026-01-01', payload: { category: 'Casa', amount: 1_200, cadence: 'annual' } },
      { id: 'b2', kind: 'budget_target', title: 'Trasporti', effective_date: '2026-01-01', payload: { category: 'Trasporti', amount: 100, cadence: 'monthly' } },
      { id: 't1', kind: 'transaction', title: 'Bolletta', effective_date: '2026-08-05', payload: { category: 'Casa', direction: 'expense', amount: 90 } },
      { id: 't2', kind: 'transaction', title: 'Benzina', effective_date: '2026-08-06', payload: { category: 'Trasporti', direction: 'expense', amount: 130 } },
      { id: 't3', kind: 'transaction', title: 'Regalo', effective_date: '2026-08-07', payload: { category: 'Varie', direction: 'expense', amount: 40 } },
      { id: 't4', kind: 'transaction', title: 'Stipendio', effective_date: '2026-08-01', payload: { category: 'Lavoro', direction: 'income', amount: 2_000 } },
      { id: 't5', kind: 'transaction', title: 'Mese scorso', effective_date: '2026-07-05', payload: { category: 'Casa', direction: 'expense', amount: 500 } },
    ]
    const result = budgetVarianceMonthly(records, '2026-08')
    expect(result.budgetedTotal).toBe(200)
    expect(result.actualTotal).toBe(260)
    expect(result.overBudgetCategories).toBe(1)
    expect(result.unbudgetedValue).toBe(40)
    expect(result.rows.find((row) => row.category === 'Casa')?.variance).toBe(10)
    expect(result.rows.find((row) => row.category === 'Varie')?.budget).toBeNull()
  })

  it('ignores budgets whose window does not cover the month', () => {
    const result = budgetVarianceMonthly([
      { id: 'b', kind: 'budget_target', title: 'Chiuso', effective_date: '2026-01-01', payload: { category: 'Casa', amount: 100, cadence: 'monthly', ends_on: '2026-06-30' } },
    ], '2026-08')
    expect(result.budgetedTotal).toBe(0)
  })

  it('separates late closures from deadlines still open past their date', () => {
    const result = deadlineReliability([
      { id: 'd1', kind: 'deadline', title: 'In tempo', effective_date: '2026-08-01', payload: { due_at: '2026-08-01T09:00:00+02:00', status: 'completed' } },
      { id: 'd2', kind: 'deadline', title: 'In ritardo', effective_date: '2026-08-09', payload: { due_at: '2026-08-01T09:00:00+02:00', status: 'completed' } },
      { id: 'd3', kind: 'deadline', title: 'Scaduta aperta', effective_date: '2026-07-01', payload: { due_at: '2026-07-01T09:00:00+02:00', status: 'open' } },
      { id: 'd4', kind: 'deadline', title: 'Futura', effective_date: '2026-12-01', payload: { due_at: '2026-12-01T09:00:00+02:00', status: 'open' } },
    ], '2026-08-14')
    expect(result.completed).toBe(2)
    expect(result.late).toBe(1)
    expect(result.onTime).toBe(1)
    expect(result.onTimeRatio).toBe(0.5)
    expect(result.openOverdue).toBe(1)
  })

  it('measures the verified share against evidenced records only', () => {
    const result = provenanceMix([
      { id: '1', kind: 'fact', title: 'a', effective_date: '2026-08-01', evidence_status: 'verified', payload: {} },
      { id: '2', kind: 'fact', title: 'b', effective_date: '2026-08-01', evidence_status: 'declared', payload: {} },
      { id: '3', kind: 'fact', title: 'c', effective_date: '2026-08-01', evidence_status: 'estimated', payload: {} },
      { id: '4', kind: 'deadline', title: 'd', effective_date: '2026-08-01', evidence_status: 'planned', payload: {} },
    ])
    // A planned future deadline is not evidence about the past, so it is excluded
    // from the denominator instead of diluting the verified share.
    expect(result.total).toBe(4)
    expect(result.verifiedRatio).toBeCloseTo(1 / 3)
    expect(result.estimatedRatio).toBeCloseTo(1 / 3)
  })

  it('builds monthly health summaries without imputing missing dates', () => {
    expect(monthlySeriesStatistics([
      { date: '2026-01-01', value: 10 }, { date: '2026-01-01', value: 12 },
      { date: '2026-01-31', value: 20 }, { date: '2026-02-01', value: 30 },
    ])).toEqual([
      { month: '2026-01', count: 2, mean: 16, median: 16, minimum: 12, maximum: 20 },
      { month: '2026-02', count: 1, mean: 30, median: 30, minimum: 30, maximum: 30 },
    ])
  })
})
