/**
 * CSV scenario import/export tests.
 *
 * Verifies that exporting a scenario and re-importing it produces the same
 * inputs and settings (round-trip), that malformed/missing schema files are
 * rejected, and that unknown fields surface as warnings rather than errors.
 */
import { describe, it, expect } from 'vitest';
import { exportInputsToCsv, parseInputsFromCsv } from './utils/csvScenario';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SETTINGS } from './types';
import { DEFAULTS } from './taxData';

describe('CSV scenario round-trip', () => {
  it('exports defaults to a CSV that imports back identically', () => {
    const csv = exportInputsToCsv(DEFAULTS, DEFAULT_SETTINGS);
    const { inputs, settings, warnings } = parseInputsFromCsv(csv);

    expect(warnings).toEqual([]);

    // Inputs round-trip
    expect(inputs.filingStatus).toBe(DEFAULTS.filingStatus);
    expect(inputs.stateCode).toBe(DEFAULTS.stateCode);
    expect(inputs.stateRate).toBe(DEFAULTS.stateRate);
    expect(inputs.annualIncome).toBe(DEFAULTS.annualIncome);
    expect(inputs.strategyId).toBe(DEFAULTS.strategyId);
    expect(inputs.collateralAmount).toBe(DEFAULTS.collateralAmount);
    expect(inputs.qfafEnabled).toBe(DEFAULTS.qfafEnabled);
    expect(inputs.qfafSizingMode).toBe(DEFAULTS.qfafSizingMode);
    expect(inputs.startMonth).toBe(DEFAULTS.startMonth);
    expect(inputs.ltGainsEnabled).toBe(DEFAULTS.ltGainsEnabled);

    // Split allocation block round-trips
    expect(inputs.splitAllocation).toEqual(DEFAULTS.splitAllocation);

    // Settings round-trip
    expect(settings.qfafMultiplier).toBe(DEFAULT_SETTINGS.qfafMultiplier);
    expect(settings.growthEnabled).toBe(DEFAULT_SETTINGS.growthEnabled);
    expect(settings.qfafAnnualReturn).toBe(DEFAULT_SETTINGS.qfafAnnualReturn);
    expect(settings.financingMode).toBe(DEFAULT_SETTINGS.financingMode);
    expect(settings.projectionYears).toBe(DEFAULT_SETTINGS.projectionYears);
  });

  it('round-trips a customized split-allocation scenario', () => {
    const customInputs: CalculatorInputs = {
      ...DEFAULTS,
      filingStatus: 'single',
      stateCode: 'NY',
      stateRate: 0.109,
      annualIncome: 1_500_000,
      strategyId: 'core-175-75',
      collateralAmount: 4_000_000,
      qfafSizingMode: 'fixed',
      qfafSizingYears: 3,
      startMonth: 7,
      ltGainsEnabled: true,
      splitAllocation: {
        enabled: true,
        coreStrategyId: 'core-145-45',
        coreAmount: 2_500_000,
        overlayStrategyId: 'overlay-75-75',
        overlayAmount: 1_500_000,
      },
    };
    const customSettings: AdvancedSettings = {
      ...DEFAULT_SETTINGS,
      qfafMultiplier: 1.42,
      growthEnabled: true,
      defaultAnnualReturn: 0.085,
      qfafAnnualReturn: 0.06,
      financingFeesEnabled: true,
      financingMode: 'detailed',
    };

    const csv = exportInputsToCsv(customInputs, customSettings);
    const { inputs, settings, warnings } = parseInputsFromCsv(csv);

    expect(warnings).toEqual([]);
    expect(inputs.filingStatus).toBe('single');
    expect(inputs.stateCode).toBe('NY');
    expect(inputs.stateRate).toBe(0.109);
    expect(inputs.startMonth).toBe(7);
    expect(inputs.ltGainsEnabled).toBe(true);
    expect(inputs.splitAllocation).toEqual(customInputs.splitAllocation);
    expect(settings.qfafMultiplier).toBe(1.42);
    expect(settings.qfafAnnualReturn).toBe(0.06);
    expect(settings.financingMode).toBe('detailed');
  });

  it('throws when the schema marker is missing', () => {
    const csv = 'Field,Value\nfilingStatus,mfj\nstateCode,CA\n';
    expect(() => parseInputsFromCsv(csv)).toThrow(/missing "schema" row/);
  });

  it('throws on an unsupported schema version', () => {
    const csv = 'Field,Value\nschema,edicalc-scenario-v999\nfilingStatus,mfj\n';
    expect(() => parseInputsFromCsv(csv)).toThrow(/Unsupported scenario CSV schema/);
  });

  it('reports unknown fields as warnings instead of failing', () => {
    const csv = 'Field,Value\nschema,edicalc-scenario-v1\nfilingStatus,mfj\nfutureField,42\n';
    const { inputs, warnings } = parseInputsFromCsv(csv);
    expect(inputs.filingStatus).toBe('mfj');
    expect(warnings.some(w => w.includes('futureField'))).toBe(true);
  });

  it('parses currency-formatted numbers leniently', () => {
    // Users sometimes hand-edit CSVs with $ and commas — we should still parse them.
    const csv = [
      'Field,Value',
      'schema,edicalc-scenario-v1',
      'collateralAmount,"$10,000,000"',
      'annualIncome,"3,000,000"',
    ].join('\n');
    const { inputs, warnings } = parseInputsFromCsv(csv);
    expect(inputs.collateralAmount).toBe(10_000_000);
    expect(inputs.annualIncome).toBe(3_000_000);
    expect(warnings).toEqual([]);
  });

  it('treats empty qfafAnnualReturn as null (use default)', () => {
    const csv = ['Field,Value', 'schema,edicalc-scenario-v1', 'settings.qfafAnnualReturn,'].join(
      '\n'
    );
    const { settings, warnings } = parseInputsFromCsv(csv);
    expect(settings.qfafAnnualReturn).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('rejects invalid filing status with a warning, not an error', () => {
    const csv = [
      'Field,Value',
      'schema,edicalc-scenario-v1',
      'filingStatus,nonsense',
      'stateCode,CA',
    ].join('\n');
    const { inputs, warnings } = parseInputsFromCsv(csv);
    expect(inputs.filingStatus).toBeUndefined();
    expect(inputs.stateCode).toBe('CA');
    expect(warnings.some(w => w.includes('filingStatus'))).toBe(true);
  });
});
