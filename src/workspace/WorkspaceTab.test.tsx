/**
 * D-026 — Workspace feature-parity ports, slice 1:
 * - Scenario pinning + side-by-side comparison strip (shared localStorage
 *   pin store with the Classic comparison panel; FROZEN values, never
 *   live-recomputed; survives reloads).
 * - Split allocation (core + overlay) in the rail, UI wiring only over the
 *   existing engine support (one-engine rule) — proven by comparing the
 *   Workspace-rendered headline to a direct calculate() run with the same
 *   inputs.splitAllocation.
 * - D-016 conflict: deleverage plan is ignored when split is on; the rail
 *   surfaces the existing warning wording.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { WorkspaceTab, filterPaletteItems, PaletteItem } from './WorkspaceTab';
import { calculate, solveCollateralForTotal } from '../calculations';
import { DEFAULTS } from '../taxData';
import { CalculatorInputs, DEFAULT_SETTINGS, SplitAllocation } from '../types';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { exportInputsToCsv, parseInputsFromCsv } from '../utils/csvScenario';
import { formatCurrency } from '../utils/formatters';

const ackQp = () =>
  localStorage.setItem(
    STORAGE_KEYS.QP_ACKNOWLEDGED,
    JSON.stringify({ acknowledged: true, acknowledgedAt: new Date().toISOString() })
  );

// Matches DEFAULTS.splitAllocation with the toggle flipped on — exactly what
// the Workspace rail produces when the user checks "Split allocation".
const SPLIT_ON: SplitAllocation = {
  enabled: true,
  coreStrategyId: 'core-145-45',
  coreAmount: 3000000,
  overlayStrategyId: 'overlay-45-45',
  overlayAmount: 7000000,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Workspace scenario pinning (D-026)', () => {
  it('pin freezes values: the pinned side never moves with live input changes', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.click(r.getByTestId('ws-pin-btn'));

    const pinnedCell = () => r.getByTestId('ws-pin-pinned-total-savings');
    const currentCell = () => r.getByTestId('ws-pin-current-total-savings');
    const frozenTitle = pinnedCell().getAttribute('title');
    expect(frozenTitle).toBeTruthy();
    // At pin time both sides show the same scenario.
    expect(currentCell().getAttribute('title')).toBe(frozenTitle);
    expect(r.getByTestId('ws-pin-delta-total-savings').textContent).toBe('—');

    // Simulated client change: drop income 3,000,000 → 250,000.
    const income = r.getAllByLabelText('Annual income')[0];
    fireEvent.change(income, { target: { value: '250,000' } });

    // Pinned side is FROZEN; current side moved; delta is non-empty.
    expect(pinnedCell().getAttribute('title')).toBe(frozenTitle);
    expect(currentCell().getAttribute('title')).not.toBe(frozenTitle);
    expect(r.getByTestId('ws-pin-delta-total-savings').textContent).not.toBe('—');
  });

  it('pin survives a reload (localStorage) with the frozen values intact', () => {
    ackQp();
    const first = render(<WorkspaceTab />);
    fireEvent.click(first.getByTestId('ws-pin-btn'));
    const frozenTitle = first
      .getByTestId('ws-pin-pinned-total-savings')
      .getAttribute('title') as string;
    cleanup(); // unmount = tab switch / page reload

    const second = render(<WorkspaceTab />);
    expect(second.getByTestId('ws-pinstrip')).toBeTruthy();
    expect(second.getByTestId('ws-pin-pinned-total-savings').getAttribute('title')).toBe(
      frozenTitle
    );
  });

  it('unpin clears the strip and the shared localStorage slot', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.click(r.getByTestId('ws-pin-btn'));
    expect(r.getByTestId('ws-pinstrip')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEYS.PINNED_SCENARIO)).toBeTruthy();

    fireEvent.click(r.getByTestId('ws-pin-unpin'));
    expect(r.queryByTestId('ws-pinstrip')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PINNED_SCENARIO)).toBeNull();
  });

  it('re-pin replaces the frozen snapshot with the current scenario', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.click(r.getByTestId('ws-pin-btn'));
    const before = r.getByTestId('ws-pin-pinned-total-savings').getAttribute('title');

    const income = r.getAllByLabelText('Annual income')[0];
    fireEvent.change(income, { target: { value: '250,000' } });
    fireEvent.click(r.getByTestId('ws-pin-repin'));

    const after = r.getByTestId('ws-pin-pinned-total-savings').getAttribute('title');
    expect(after).not.toBe(before);
    // After re-pin, pinned == current again.
    expect(r.getByTestId('ws-pin-current-total-savings').getAttribute('title')).toBe(after);
    // Still a single pin slot consumed (replace, not append).
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.PINNED_SCENARIO) as string);
    expect(stored).toHaveLength(1);
  });
});

describe('Workspace split allocation (D-026)', () => {
  it('split toggle produces results identical to calculate() with the same splitAllocation', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.click(r.getByLabelText('Split allocation (core + overlay)'));

    // One-engine check: same inputs through the engine directly.
    const expected = calculate({ ...DEFAULTS, splitAllocation: SPLIT_ON }, DEFAULT_SETTINGS);
    expect(r.getByTestId('ws-metric-total-savings').textContent).toBe(
      formatCurrency(expected.summary.totalTaxSavings)
    );

    // Sanity: split mode genuinely differs from the single-strategy run, so
    // the equality above is not vacuous.
    const single = calculate(DEFAULTS, DEFAULT_SETTINGS);
    expect(expected.summary.totalTaxSavings).not.toBe(single.summary.totalTaxSavings);

    // Derived breakdown reflects both legs.
    const derived = r.getByTestId('ws-split-total').textContent as string;
    expect(derived).toContain('10,000,000');
    expect(derived).toContain('30');
    expect(derived).toContain('70');
  });

  it('editing a leg amount re-runs the same engine path', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.click(r.getByLabelText('Split allocation (core + overlay)'));
    const coreAmount = r.getAllByLabelText('Core amount')[0];
    fireEvent.change(coreAmount, { target: { value: '5,000,000' } });

    const expected = calculate(
      { ...DEFAULTS, splitAllocation: { ...SPLIT_ON, coreAmount: 5000000 } },
      DEFAULT_SETTINGS
    );
    expect(r.getByTestId('ws-metric-total-savings').textContent).toBe(
      formatCurrency(expected.summary.totalTaxSavings)
    );
    expect(r.getByTestId('ws-split-total').textContent).toContain('12,000,000');
  });

  it('total-portfolio funding scales split legs proportionally', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.click(r.getByLabelText('Split allocation (core + overlay)'));
    fireEvent.click(r.getByText('Total portfolio'));

    const totalInput = r.getAllByLabelText('Total available portfolio')[0];
    fireEvent.change(totalInput, { target: { value: '20,000,000' } });

    const solvedCollateral = solveCollateralForTotal(
      20000000,
      { ...DEFAULTS, splitAllocation: SPLIT_ON },
      DEFAULT_SETTINGS.qfafMultiplier,
      DEFAULT_SETTINGS.washSaleDisallowanceRate
    );
    const scale = solvedCollateral / (SPLIT_ON.coreAmount + SPLIT_ON.overlayAmount);
    const scaledSplit = {
      ...SPLIT_ON,
      coreAmount: SPLIT_ON.coreAmount * scale,
      overlayAmount: SPLIT_ON.overlayAmount * scale,
    };
    const expected = calculate({ ...DEFAULTS, splitAllocation: scaledSplit }, DEFAULT_SETTINGS);

    expect(r.getByTestId('ws-metric-total-savings').textContent).toBe(
      formatCurrency(expected.summary.totalTaxSavings)
    );
    expect(r.getByTestId('ws-split-total').textContent).toContain(
      formatCurrency(expected.sizing.totalExposure)
    );
    expect(Math.round(expected.sizing.totalExposure)).toBe(20000000);
  });

  it('deleverage + split shows the D-016 conflict warning in the rail', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.click(r.getByLabelText('Plan deleveraging'));
    expect(r.queryByTestId('ws-split-dlv-warn')).toBeNull(); // no conflict yet

    fireEvent.click(r.getByLabelText('Split allocation (core + overlay)'));
    expect(r.getByTestId('ws-split-dlv-warn').textContent).toContain('plan ignored');

    // And the engine really ignores the plan: results match a split run
    // without any deleverage plan (D-016: split wins).
    const withPlanIgnored = calculate(
      {
        ...DEFAULTS,
        splitAllocation: SPLIT_ON,
        deleveragePlan: { enabled: true, startYear: 3, durationYears: 1, target: 'long-only' },
      },
      DEFAULT_SETTINGS
    );
    const noPlan = calculate({ ...DEFAULTS, splitAllocation: SPLIT_ON }, DEFAULT_SETTINGS);
    expect(withPlanIgnored.summary.totalTaxSavings).toBe(noPlan.summary.totalTaxSavings);
  });

  it('split scenario round-trips through the Workspace CSV export path', () => {
    const inputs: CalculatorInputs = { ...DEFAULTS, splitAllocation: SPLIT_ON };
    const csv = exportInputsToCsv(inputs, DEFAULT_SETTINGS);
    const parsed = parseInputsFromCsv(csv);
    expect(parsed.inputs?.splitAllocation).toEqual(SPLIT_ON);
  });
});

// ─── D-027: Workspace redesign — findability spine ───
describe('Workspace redesign (D-027)', () => {
  it('scenario name is inline-editable and persists to localStorage', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    expect(r.getByTestId('wx-scenario-name').textContent).toBe('Untitled scenario');

    fireEvent.click(r.getByTestId('wx-scenario-name'));
    const input = r.getByLabelText('Scenario name');
    fireEvent.change(input, { target: { value: 'Henderson — Business Sale' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(r.getByTestId('wx-scenario-name').textContent).toBe('Henderson — Business Sale');
    expect(localStorage.getItem(STORAGE_KEYS.SCENARIO_NAME)).toBe('Henderson — Business Sale');
  });

  it('⌘K opens the command palette; selecting a view switches the sub-view', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    expect(r.queryByTestId('wx-palette')).toBeNull();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = r.getByTestId('wx-palette');
    expect(palette).toBeTruthy();

    const search = r.getByLabelText('Jump to a setting, view, or action');
    fireEvent.change(search, { target: { value: 'year-by-year' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    // Palette closed, table sub-view active (audit-complete ResultsTable mounted).
    expect(r.queryByTestId('wx-palette')).toBeNull();
    expect(r.getByText('Year-by-Year').className).toContain('active');
    expect(r.container.querySelector('.wx-table-host')).toBeTruthy();
  });

  it('palette jump expands the target rail group (closed by default)', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    const group = () => r.container.querySelector('[data-wx-group="deleverage"]') as HTMLElement;
    expect(group().getAttribute('data-open')).toBe('false');

    fireEvent.click(r.getByTestId('wx-search')); // clicking the search box also opens it
    const search = r.getByLabelText('Jump to a setting, view, or action');
    fireEvent.change(search, { target: { value: 'unwind' } }); // keyword match, not label
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(group().getAttribute('data-open')).toBe('true');
  });

  it('rail "Find a setting…" highlights matching groups and dims the rest', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    fireEvent.change(r.getByLabelText('Find a setting'), { target: { value: 'wash-sale' } });
    const model = r.container.querySelector('[data-wx-group="model"]') as HTMLElement;
    const client = r.container.querySelector('[data-wx-group="client"]') as HTMLElement;
    expect(model.className).toContain('wx-group--hit');
    expect(client.className).toContain('wx-group--dim');
  });

  it('flags tray consolidates conditional notes with severity counts (CA defaults)', () => {
    ackQp();
    const r = render(<WorkspaceTab />);
    const head = r.getByTestId('wx-flags');
    // CA defaults: state treatment + conformity + basis caveat (overlay, no
    // basis) warnings, plus step-up and gross-estimate assumption notes.
    expect(head.textContent).toContain('attention');
    expect(head.textContent).toContain('about assumptions');
    expect(r.queryByTestId('wx-flags-body')).toBeNull(); // collapsed by default

    fireEvent.click(r.getByText(/Review/));
    const body = r.getByTestId('wx-flags-body');
    expect(body.textContent).toContain('Gross estimate:');
    expect(body.textContent).toContain('Step-up framing:');
    expect(body.textContent).toContain('Appreciated-stock collateral:');
  });

  it('fuzzy palette filter ranks substring and keyword matches', () => {
    const items: PaletteItem[] = [
      { id: 'a', kind: 'Inputs', label: 'Model', keywords: 'wash-sale fees growth', run: () => {} },
      { id: 'b', kind: 'Inputs', label: 'Client', keywords: 'income state', run: () => {} },
      { id: 'c', kind: 'Action', label: 'Export Excel', keywords: 'workbook', run: () => {} },
    ];
    expect(filterPaletteItems(items, 'wash').map(i => i.id)).toEqual(['a']);
    expect(filterPaletteItems(items, 'income').map(i => i.id)).toEqual(['b']);
    expect(filterPaletteItems(items, '').map(i => i.id)).toEqual(['a', 'b', 'c']);
    expect(filterPaletteItems(items, 'zzzz')).toEqual([]);
  });
});
