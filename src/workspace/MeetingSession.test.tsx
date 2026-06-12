/**
 * Wave B Meeting Mode decisions:
 * - D-025: the meeting runs SANDBOXED — edits operate on a meeting-local
 *   copy; exit asks "Keep the changes made during the meeting?" with Discard
 *   as the default. No silent mutation of the Workspace, ever.
 * - D-023: bounded what-if presets in the meeting rail, all off by default
 *   (D-002), composed through the ONE engine via the same YearOverride
 *   machinery the Workspace events editor uses — proven here by comparing a
 *   what-if against hand-built overrides.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import {
  MeetingSession,
  MeetingKeepPayload,
  buildActiveOverrides,
  composeWhatIfOverrides,
  createDefaultWhatIfs,
} from './MeetingSession';
import { WorkspaceTab } from './WorkspaceTab';
import { calculate, calculateWithOverrides } from '../calculations';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { CalculatorInputs, DEFAULT_SETTINGS, YearOverride } from '../types';

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
    qfafEnabled: true,
    qfafSizingYears: 1,
    qfafSizingCushion: 0,
    qfafDuration: 5,
    qfafSizingMode: 'dynamic',
    startMonth: 1,
    ...overrides,
  };
}

function renderSession(inputs: CalculatorInputs = createInputs()) {
  const onKeep = vi.fn<(payload: MeetingKeepPayload) => void>();
  const onDiscard = vi.fn();
  const utils = render(
    <MeetingSession
      baseInputs={inputs}
      baseSettings={DEFAULT_SETTINGS}
      baseYearEvents={new Map()}
      onKeep={onKeep}
      onDiscard={onDiscard}
    />
  );
  return { ...utils, onKeep, onDiscard };
}

const setMeetingIncome = (container: HTMLElement, formatted: string) => {
  const income = container.querySelector('#mm-income') as HTMLInputElement;
  expect(income).toBeTruthy();
  fireEvent.change(income, { target: { value: formatted } });
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ─── D-025: sandbox + keep prompt ───
describe('Meeting Mode sandbox (D-025)', () => {
  it('clean exit skips the prompt and discards', () => {
    const { getByText, onKeep, onDiscard, queryByTestId } = renderSession();
    fireEvent.click(getByText('Exit Meeting Mode'));
    expect(queryByTestId('mm-keep-prompt')).toBeNull();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('dirty exit prompts; Discard never calls onKeep', () => {
    const { container, getByText, getByTestId, onKeep, onDiscard } = renderSession();
    setMeetingIncome(container, '1,000,000');
    fireEvent.click(getByText('Exit Meeting Mode'));
    expect(getByTestId('mm-keep-prompt').textContent).toContain(
      'Keep the changes made during the meeting?'
    );
    fireEvent.click(getByTestId('mm-keep-prompt-discard'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('Keep returns the meeting copy (edited income) to the host', () => {
    const { container, getByText, getByTestId, onKeep, onDiscard } = renderSession();
    setMeetingIncome(container, '1,000,000');
    fireEvent.click(getByText('Exit Meeting Mode'));
    fireEvent.click(getByTestId('mm-keep-prompt-keep'));
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onKeep.mock.calls[0][0].inputs.annualIncome).toBe(1000000);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('Keep materializes an active gain-event what-if into real year events', () => {
    const { container, getByText, getByTestId, onKeep } = renderSession();
    // Open the Client questions group and enable the gain event.
    fireEvent.click(getByText('Client questions'));
    fireEvent.click(getByTestId('mm-whatif-gain'));
    const amount = container.querySelector('#mm-whatif-gain-amount') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '4,000,000' } });
    fireEvent.click(getByText('Exit Meeting Mode'));
    fireEvent.click(getByTestId('mm-keep-prompt-keep'));
    const payload = onKeep.mock.calls[0][0];
    const yr3 = payload.yearEvents.get(3); // default what-if year = min(3, projYears)
    expect(yr3?.gainEvent).toEqual({ amount: 4000000, character: 'lt' });
  });
});

// ─── D-023: what-if presets ───
describe('Meeting rail what-ifs (D-023)', () => {
  it('every preset is off by default (D-002) and produces zero overrides', () => {
    const inputs = createInputs();
    const d = createDefaultWhatIfs(inputs, DEFAULT_SETTINGS);
    expect(d.retirementEnabled).toBe(false);
    expect(d.gainEventEnabled).toBe(false);
    const events = composeWhatIfOverrides(new Map(), d, inputs.annualIncome, 10);
    expect(buildActiveOverrides(events, inputs.annualIncome)).toHaveLength(0);
    // Growth and fees ride the meeting settings copy — off in DEFAULT_SETTINGS.
    expect(DEFAULT_SETTINGS.growthEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.financingFeesEnabled).toBe(false);
  });

  it('renders all four controls unchecked, labeled as resettable what-ifs', () => {
    const { getByTestId, getByText } = renderSession();
    fireEvent.click(getByText('Client questions'));
    for (const id of [
      'mm-whatif-retirement',
      'mm-whatif-gain',
      'mm-whatif-growth',
      'mm-whatif-fees',
    ]) {
      expect((getByTestId(id) as HTMLInputElement).checked).toBe(false);
    }
    expect(getByTestId('mm-client-questions').textContent).toContain('answers reset unless kept');
  });

  it('retirement step-down equals hand-built engine overrides (one-engine check)', () => {
    const inputs = createInputs();
    const whatIfs = {
      ...createDefaultWhatIfs(inputs, DEFAULT_SETTINGS),
      retirementEnabled: true,
      retirementYear: 4,
      retirementIncome: 400000,
    };
    const events = composeWhatIfOverrides(new Map(), whatIfs, inputs.annualIncome, 10);
    const viaWhatIf = calculateWithOverrides(
      inputs,
      DEFAULT_SETTINGS,
      buildActiveOverrides(events, inputs.annualIncome)
    );

    const handBuilt: YearOverride[] = Array.from({ length: 7 }, (_, i) => ({
      year: i + 4,
      w2Income: 400000,
      cashInfusion: 0,
      cashInfusionTaxType: 'gross' as const,
      note: '',
    }));
    const viaHand = calculateWithOverrides(inputs, DEFAULT_SETTINGS, handBuilt);

    expect(viaWhatIf.years.map(y => y.taxSavings)).toEqual(viaHand.years.map(y => y.taxSavings));
    expect(viaWhatIf.summary.totalTaxSavings).toBe(viaHand.summary.totalTaxSavings);
    // And it genuinely differs from the no-override projection.
    const baseline = calculate(inputs, DEFAULT_SETTINGS);
    expect(viaWhatIf.summary.totalTaxSavings).not.toBe(baseline.summary.totalTaxSavings);
  });

  it('gain-event what-if equals a hand-built D-012 YearOverride.gainEvent', () => {
    const inputs = createInputs();
    const whatIfs = {
      ...createDefaultWhatIfs(inputs, DEFAULT_SETTINGS),
      gainEventEnabled: true,
      gainEventYear: 3,
      gainEventAmount: 5000000,
    };
    const events = composeWhatIfOverrides(new Map(), whatIfs, inputs.annualIncome, 10);
    const viaWhatIf = calculateWithOverrides(
      inputs,
      DEFAULT_SETTINGS,
      buildActiveOverrides(events, inputs.annualIncome)
    );
    const viaHand = calculateWithOverrides(inputs, DEFAULT_SETTINGS, [
      {
        year: 3,
        w2Income: inputs.annualIncome,
        cashInfusion: 0,
        cashInfusionTaxType: 'gross',
        note: '',
        gainEvent: { amount: 5000000, character: 'lt' },
      },
    ]);
    expect(viaWhatIf.years.map(y => y.gainEventTax)).toEqual(
      viaHand.years.map(y => y.gainEventTax)
    );
    expect(viaWhatIf.summary.totalTaxSavings).toBe(viaHand.summary.totalTaxSavings);
  });

  it('toggling a what-if updates the meeting view and raises the D-024 chip', () => {
    const { container, getByText, getByTestId, queryByTestId } = renderSession();
    expect(queryByTestId('mm-change-chip')).toBeNull();
    fireEvent.click(getByText('Client questions'));
    fireEvent.click(getByTestId('mm-whatif-retirement'));
    // Drop to $100K from year 3 on — low enough that the 10-year window can
    // no longer absorb the NOL, so the visible headline really moves.
    fireEvent.change(container.querySelector('#mm-whatif-retirement-income') as HTMLInputElement, {
      target: { value: '100,000' },
    });
    expect(getByTestId('mm-change-chip').textContent).toContain('Was');
    // Toggling back off restores the entry numbers — chip clears itself.
    fireEvent.click(getByTestId('mm-whatif-retirement'));
    expect(queryByTestId('mm-change-chip')).toBeNull();
  });
});

// ─── WorkspaceTab integration: the workspace behind the meeting never moves ───
describe('WorkspaceTab meeting flow (D-025 integration)', () => {
  const ackQp = () =>
    localStorage.setItem(
      STORAGE_KEYS.QP_ACKNOWLEDGED,
      JSON.stringify({ acknowledged: true, acknowledgedAt: new Date().toISOString() })
    );

  it('Discard leaves workspace inputs identical; Keep applies the meeting values', () => {
    ackQp();
    const { container, getByText, getByTestId, getAllByLabelText } = render(<WorkspaceTab />);
    const workspaceIncome = () => getAllByLabelText('Annual income')[0] as HTMLInputElement;
    expect(workspaceIncome().value).toBe('3,000,000');

    // Enter Meeting Mode, edit income on the meeting copy, exit → Discard.
    fireEvent.click(getByText('Open Meeting Mode'));
    setMeetingIncome(container, '1,234,000');
    fireEvent.click(getByText('Exit Meeting Mode'));
    fireEvent.click(getByTestId('mm-keep-prompt-discard'));
    expect(workspaceIncome().value).toBe('3,000,000'); // untouched

    // Re-enter: the meeting starts clean from the workspace scenario again.
    fireEvent.click(getByText('Open Meeting Mode'));
    const mmIncome = container.querySelector('#mm-income') as HTMLInputElement;
    expect(mmIncome.value).toBe('3,000,000');

    // Edit again, exit → Keep: the workspace now adopts the meeting value.
    setMeetingIncome(container, '1,234,000');
    fireEvent.click(getByText('Exit Meeting Mode'));
    fireEvent.click(getByTestId('mm-keep-prompt-keep'));
    expect(workspaceIncome().value).toBe('1,234,000');
  });
});
