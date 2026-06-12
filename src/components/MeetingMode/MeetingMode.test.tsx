/**
 * D-021: the Meeting Mode handout (page 1 of the print one-pager, also shown
 * on screen) must carry the step-up co-metric with its estate disclosure in
 * BOTH modes, and the protection ratio in EDI mode when financing fees are
 * modeled. The loss-reserve KPI must stay labeled contingent.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { MeetingMode, computeBenefitDecomposition, reconcileRounded } from './MeetingMode';
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

function buildProps(inputs: CalculatorInputs, settings: AdvancedSettings) {
  const results = calculate(inputs, settings);
  const exit = computeExitTaxAnalysis(results, COMBINED_LT_RATE, 0);
  return {
    inputs,
    results,
    taxRates: TAX_RATES,
    exitAnalysis: exit,
    advancedSettings: settings,
    currentStrategy: getStrategy(inputs.strategyId),
    onExitMeetingMode: () => {},
    onUpdateInput: () => {},
    onUpdateSettings: () => {},
  };
}

function renderMeetingMode(inputs: CalculatorInputs, settings: AdvancedSettings) {
  const props = buildProps(inputs, settings);
  const utils = render(<MeetingMode {...props} />);
  return {
    ...utils,
    results: props.results,
    exit: props.exitAnalysis,
    stepUp: computeStepUpComparison(props.results, props.exitAnalysis),
  };
}

// Mirror of Meeting Mode's compact currency formatter, for asserting the
// exact chip/pin strings.
const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
};

const visibleHeadline = (results: ReturnType<typeof calculate>, settings: AdvancedSettings) =>
  results.years
    .slice(0, settings.projectionYears)
    .reduce((s: number, y: { taxSavings: number }) => s + y.taxSavings, 0);

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

// ─── D-022: the "How we get to {headline}" strip must SUM EXACTLY ───
const parseMoney = (s: string | null | undefined): number =>
  Number((s ?? '').replace(/[^0-9.-]/g, ''));

describe('Meeting Mode decomposition sums to the headline (D-022)', () => {
  it('QFAF mode: benefit-type cards minus costs equal the headline exactly', () => {
    const inputs = createInputs({ qfafEnabled: true });
    const { container, getAllByTestId, getByTestId, queryAllByTestId, results } = renderMeetingMode(
      inputs,
      DEFAULT_SETTINGS
    );

    // Engine-level identity: components sum to Σ taxSavings over the
    // visible window (the headline) — no NOL double-counting.
    const visible = results.years.slice(0, DEFAULT_SETTINGS.projectionYears);
    const headline = visible.reduce((s, y) => s + y.taxSavings, 0);
    const d = computeBenefitDecomposition(visible);
    expect(
      Math.abs(
        d.ordinaryLossBenefit +
          d.nolUsageBenefit +
          d.capitalLossBenefit -
          d.gainAndOtherCosts -
          headline
      )
    ).toBeLessThan(0.01);

    // Display-level: the rendered card figures reconcile to the rendered
    // total to the dollar (reconcileRounded), and that total matches the
    // engine headline.
    const benefits = getAllByTestId('decomp-benefit-value').map(el => parseMoney(el.textContent));
    expect(benefits).toHaveLength(3);
    const costs = queryAllByTestId('decomp-cost-value').map(el => parseMoney(el.textContent));
    const displayedTotal = parseMoney(getByTestId('decomp-total-value').textContent);
    const cardSum = benefits.reduce((s, v) => s + v, 0) - costs.reduce((s, v) => s + v, 0);
    expect(cardSum).toBe(displayedTotal);
    expect(Math.abs(displayedTotal - headline)).toBeLessThan(2.5);

    // New benefit-type labels (matching the chart legend), old
    // double-counting card gone.
    const text = container.textContent ?? '';
    expect(text).toContain('Ordinary-loss benefit');
    expect(text).toContain('NOL usage benefit');
    expect(text).toContain('Capital-loss benefit');
    expect(text).not.toContain('NOL carry-forward');
  });

  it('EDI mode: realized cards sum exactly; loss reserve stays out of the bar', () => {
    const { getAllByTestId, getByTestId, queryAllByTestId, container, results } = renderMeetingMode(
      createInputs(),
      DEFAULT_SETTINGS
    );

    const visible = results.years.slice(0, DEFAULT_SETTINGS.projectionYears);
    const headline = visible.reduce((s, y) => s + y.taxSavings, 0);

    const benefits = getAllByTestId('decomp-benefit-value').map(el => parseMoney(el.textContent));
    expect(benefits).toHaveLength(2); // Year 1 + Years 2–N (realized only)
    expect(queryAllByTestId('decomp-cost-value')).toHaveLength(0);
    const displayedTotal = parseMoney(getByTestId('decomp-total-value').textContent);
    expect(benefits.reduce((s, v) => s + v, 0)).toBe(displayedTotal);
    expect(Math.abs(displayedTotal - headline)).toBeLessThan(2.5);

    // Growth is off by default: no advisor self-instruction card.
    const text = container.textContent ?? '';
    expect(text).not.toContain('Enable portfolio growth');
    // Reserve tile still present and labeled contingent.
    expect(text).toContain('Loss reserve built');
  });

  it('reconcileRounded makes displayed parts sum exactly to the displayed total', () => {
    // Classic K-rounding mismatch source: 2,400 + 13,100 = 15,500.
    const parts = reconcileRounded([2400.4, 13099.8], 15500.2);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(Math.round(15500.2));
  });
});

describe('Meeting Mode mechanics view (mock-meeting review)', () => {
  it('EDI mode: no QFAF steps — harvest → reserve → shelter with real numbers', () => {
    const { container, getByText } = renderMeetingMode(createInputs(), DEFAULT_SETTINGS);
    fireEvent.click(getByText('Mechanics'));
    const text = container.textContent ?? '';
    expect(text).not.toContain('Establish QFAF');
    expect(text).not.toContain('NOL generated');
    expect(text).toContain('Harvest losses systematically');
    expect(text).toContain('CF reserve balance');
    expect(text).toContain('Contingent shelter value');
  });

  it('QFAF mode: CPA card states the §461(l) cap with the client numbers when it binds', () => {
    const { container, getByText } = renderMeetingMode(
      createInputs({ qfafEnabled: true }),
      DEFAULT_SETTINGS
    );
    fireEvent.click(getByText('Mechanics'));
    const text = container.textContent ?? '';
    expect(text).toContain('For your CPA');
    expect(text).toContain('§475(f)');
    // $3M income, MFJ: year-1 ordinary losses far exceed the $512K cap.
    expect(text).toContain('Year 1 ordinary deduction capped at $512,000 (MFJ)');
    expect(text).toContain('Wash-sale assumption');
    // CA scenario → one-line state caveat from the shared warning util.
    expect(text).toContain('Modeled per California law');
  });

  it('explains the dead tail when the QFAF stops before the projection ends', () => {
    // $10M income consumes the NOL fast: years 6–10 show $0 new savings
    // once the 5-year QFAF stops — the chart must say why.
    const { container, results } = renderMeetingMode(
      createInputs({ qfafEnabled: true, annualIncome: 10000000 }),
      DEFAULT_SETTINGS
    );
    const tail = results.years.slice(5, DEFAULT_SETTINGS.projectionYears);
    expect(tail.every(y => Math.abs(y.taxSavings) < 1)).toBe(true);
    const text = container.textContent ?? '';
    expect(text).toContain('savings concentrate in years 1–5');
    expect(text).toContain('run off the remaining carryforwards');
  });
});

// ─── D-024: comparison memory — auto Was→Now chip + real pin ───
describe('Meeting Mode comparison memory (D-024)', () => {
  it('shows the Was→Now chip with the correct old/new values and dismisses to re-baseline', () => {
    const settings = DEFAULT_SETTINGS;
    const p1 = buildProps(createInputs({ qfafEnabled: true }), settings);
    const { rerender, queryByTestId, getByTestId, getByLabelText } = render(
      <MeetingMode {...p1} />
    );
    // No change yet → no chip.
    expect(queryByTestId('mm-change-chip')).toBeNull();

    // A meeting-local change (collateral halves → different savings).
    const p2 = buildProps(createInputs({ qfafEnabled: true, collateralAmount: 5000000 }), settings);
    rerender(<MeetingMode {...p2} />);

    const oldHeadline = visibleHeadline(p1.results, settings);
    const newHeadline = visibleHeadline(p2.results, settings);
    expect(Math.abs(oldHeadline - newHeadline)).toBeGreaterThan(1); // scenario really moved
    const chip = getByTestId('mm-change-chip');
    expect(chip.textContent).toContain(
      `Was ${fmtCompact(oldHeadline)} → Now ${fmtCompact(newHeadline)}`
    );

    // Dismiss → chip disappears (baseline re-captured at "now").
    fireEvent.click(getByLabelText('Dismiss comparison'));
    expect(queryByTestId('mm-change-chip')).toBeNull();

    // A further change compares against the NEW baseline, not entry.
    const p3 = buildProps(
      createInputs({ qfafEnabled: true, collateralAmount: 20000000 }),
      settings
    );
    rerender(<MeetingMode {...p3} />);
    expect(getByTestId('mm-change-chip').textContent).toContain(
      `Was ${fmtCompact(newHeadline)} → Now ${fmtCompact(visibleHeadline(p3.results, settings))}`
    );
  });

  it('EDI mode: the chip also reports a loss-reserve move', () => {
    const settings = DEFAULT_SETTINGS;
    const p1 = buildProps(createInputs(), settings); // qfafEnabled false → EDI
    const { rerender, getByTestId } = render(<MeetingMode {...p1} />);
    const p2 = buildProps(createInputs({ collateralAmount: 20000000 }), settings);
    rerender(<MeetingMode {...p2} />);
    const chip = getByTestId('mm-change-chip');
    expect(chip.textContent).toContain(
      `reserve ${fmtCompact(p1.results.summary.lossReserveShelterValue)} → ${fmtCompact(
        p2.results.summary.lossReserveShelterValue
      )}`
    );
  });

  it('pin freezes values: later edits never mutate the pinned row; repin replaces; unpin removes', () => {
    const settings = DEFAULT_SETTINGS;
    const p1 = buildProps(createInputs({ qfafEnabled: true }), settings);
    const { rerender, getByTestId, queryByTestId, getByLabelText, getByText } = render(
      <MeetingMode {...p1} />
    );
    expect(queryByTestId('mm-pinned-row')).toBeNull();

    fireEvent.click(getByTestId('mm-pin-button'));
    const frozen = getByTestId('mm-pinned-row').textContent ?? '';
    expect(frozen).toContain('Pinned:');
    expect(frozen).toContain(fmtCompact(visibleHeadline(p1.results, settings)));
    expect(frozen).toContain(fmtCompact(p1.results.summary.finalTotalWealth));

    // Change the scenario — the pinned row must NOT move.
    const p2 = buildProps(
      createInputs({ qfafEnabled: true, collateralAmount: 20000000 }),
      settings
    );
    rerender(<MeetingMode {...p2} />);
    expect(getByTestId('mm-pinned-row').textContent).toBe(frozen);

    // Pin state survives level switches.
    fireEvent.click(getByText('Detail'));
    fireEvent.click(getByText('High level'));
    expect(getByTestId('mm-pinned-row').textContent).toBe(frozen);

    // Repin replaces the single slot with the CURRENT numbers.
    fireEvent.click(getByTestId('mm-pin-button'));
    expect(getByTestId('mm-pinned-row').textContent).toContain(
      fmtCompact(visibleHeadline(p2.results, settings))
    );

    // Unpin removes the row entirely.
    fireEvent.click(getByLabelText('Unpin scenario'));
    expect(queryByTestId('mm-pinned-row')).toBeNull();
  });
});
