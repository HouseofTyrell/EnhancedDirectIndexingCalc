/**
 * D-021: the Meeting Mode handout (page 1 of the print one-pager, also shown
 * on screen) must carry the step-up co-metric with its estate disclosure in
 * BOTH modes, and the protection ratio in EDI mode when financing fees are
 * modeled. The loss-reserve KPI must stay labeled contingent.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MeetingMode } from './MeetingMode';
import { calculate, computeExitTaxAnalysis, computeStepUpComparison } from '../../calculations';
import { getStrategy } from '../../strategyData';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SETTINGS } from '../../types';

const COMBINED_LT_RATE = 0.238 + 0.133;

const TAX_RATES = {
  federalStRate: 0.408,
  federalLtRate: 0.238,
  stateRate: 0.133,
  combinedStRate: 0.541,
  combinedLtRate: COMBINED_LT_RATE,
  combinedOrdinaryRate: 0.503,
};

function createInputs(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0.133,
    annualIncome: 3000000,
    strategyId: 'overlay-45-45',
    collateralAmount: 10000000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    qfafEnabled: false,
    qfafSizingYears: 1,
    qfafSizingCushion: 0,
    qfafDuration: 5,
    qfafSizingMode: 'dynamic',
    startMonth: 1,
    ...overrides,
  };
}

function renderMeetingMode(inputs: CalculatorInputs, settings: AdvancedSettings) {
  const results = calculate(inputs, settings);
  const collateralOnly = calculate({ ...inputs, qfafEnabled: false }, settings);
  const exit = computeExitTaxAnalysis(results, COMBINED_LT_RATE, 0);
  const utils = render(
    <MeetingMode
      inputs={inputs}
      results={results}
      collateralOnlyResults={collateralOnly}
      taxRates={TAX_RATES}
      exitAnalysis={exit}
      advancedSettings={settings}
      currentStrategy={getStrategy(inputs.strategyId)}
      onExitMeetingMode={() => {}}
      onPinScenario={() => {}}
      canPin={false}
      onUpdateInput={() => {}}
      onUpdateSettings={() => {}}
    />
  );
  return { ...utils, results, exit, stepUp: computeStepUpComparison(results, exit) };
}

afterEach(cleanup);

describe('Meeting Mode handout — EDI mode (D-021)', () => {
  it('shows the step-up co-metric with the estate disclosure line', () => {
    const { container } = renderMeetingMode(createInputs(), DEFAULT_SETTINGS);
    const text = container.textContent ?? '';
    expect(text).toContain('Net if held to step-up:');
    expect(text).toContain('net if liquidated');
    // Estate disclosure: mortality-contingent framing + CFs lost at death.
    expect(text).toContain('mortality-contingent');
    expect(text).toContain('IRC §1014');
    expect(text).toContain('lost at death');
    expect(text).toContain('not counted in either figure');
  });

  it('keeps the loss-reserve KPI labeled contingent', () => {
    const { container } = renderMeetingMode(createInputs(), DEFAULT_SETTINGS);
    const text = container.textContent ?? '';
    expect(text).toContain('Loss reserve built');
    expect(text).toContain('contingent on future gains');
    expect(text).toContain('Realized tax savings');
  });

  it('shows the protection ratio only when financing fees are modeled', () => {
    const noFees = renderMeetingMode(createInputs(), DEFAULT_SETTINGS);
    expect(noFees.container.textContent).not.toContain('Protection ratio:');
    cleanup();

    const withFees = renderMeetingMode(createInputs(), {
      ...DEFAULT_SETTINGS,
      financingFeesEnabled: true,
    });
    const text = withFees.container.textContent ?? '';
    expect(text).toContain('Protection ratio:');
    expect(text).toContain('cumulative financing cost');
  });
});

describe('Meeting Mode handout — QFAF mode (D-021)', () => {
  it('includes the step-up co-metric line (no EDI protection ratio)', () => {
    const { container } = renderMeetingMode(createInputs({ qfafEnabled: true }), {
      ...DEFAULT_SETTINGS,
      financingFeesEnabled: true,
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Net if held to step-up:');
    expect(text).toContain('mortality-contingent');
    // Protection ratio is an EDI-economics metric — not shown with QFAF on.
    expect(text).not.toContain('Protection ratio:');
  });
});
