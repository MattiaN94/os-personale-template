import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { healthDailyRows } from '../../src/lib/healthImport'

const importer = readFileSync(resolve('scripts/import_health_workbook.py'), 'utf8')
const healthUi = readFileSync(resolve('src/modules/SpecialistModules.tsx'), 'utf8')

describe('health import normalization', () => {
  it('keeps Apple aggregates and excludes manual workbook weights', () => {
    const daily = [{ observed_on: '2024-10-10', metric_key: 'body.weight', value_last: 71 }]
    const rows = healthDailyRows({ daily_metrics: daily })

    expect(rows).toEqual(daily)
    expect(rows).not.toBe(daily)
    expect(importer).toContain('"excluded_counts": {"manual_or_estimated_weights": excluded_weight_count}')
    expect(importer).not.toContain('"weights": weights')
    expect(importer).not.toContain('def parse_weights')
  })

  it('maps the complete reference health catalog, including Apple HRV SDNN', () => {
    for (const metric of [
      'HeartRateVariabilitySDNN', 'HeartRate', 'RestingHeartRate', 'WalkingHeartRateAverage',
      'HeartRateRecoveryOneMinute', 'OxygenSaturation', 'RespiratoryRate', 'VO2Max',
      'AppleSleepingWristTemperature', 'AppleSleepingBreathingDisturbances', 'StepCount',
      'DistanceWalkingRunning', 'DistanceCycling', 'RunningPower', 'RunningSpeed',
      'WalkingSpeed', 'WalkingStepLength', 'WalkingAsymmetryPercentage',
      'WalkingDoubleSupportPercentage', 'AppleWalkingSteadiness', 'BodyMass', 'Height',
    ]) expect(importer).toContain(`"${metric}"`)
    expect(importer).toContain('"HeartRateVariabilitySDNN": "heart.hrv_sdnn"')
    expect(healthUi).toContain('HRV Apple è SDNN, non rMSSD')
    expect(healthUi).toContain('Media mobile 7 giorni')
    expect(healthUi).toContain('Baseline mobile 60 giorni')
  })

  it('imports observed sessions but never a workout plan', () => {
    expect(importer).toContain('parse_workouts(workbook["Allenamenti"])')
    expect(importer).not.toContain('Piano_12_settimane')
    expect(healthUi).toContain('Nessuna scheda di allenamento')
  })

  it('marks full workbook exports as replaceable snapshots', () => {
    expect(importer).toContain('"import_mode": "snapshot"')
  })
})
