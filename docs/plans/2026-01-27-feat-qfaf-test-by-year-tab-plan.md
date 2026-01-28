---
title: feat: Add QFAF Test (By Year) Tab
type: feat
date: 2026-01-27
deepened: 2026-01-27
---

# feat: Add QFAF Test (By Year) Tab

## Enhancement Summary

**Deepened on:** 2026-01-27
**Research agents used:** TypeScript Reviewer, Performance Oracle, Simplicity Reviewer, Architecture Strategist, Frontend Races Reviewer, CPA Agent, Financial Analyst Agent, Best Practices Researcher, Framework Docs Researcher, Pattern Recognition Specialist, Security Sentinel

### Key Improvements from Research

1. **CRITICAL: §461(l) limits corrected** - Plan had $512K MFJ, actual 2026 projected limit is ~$640K MFJ
2. **Type safety improved** - Split mixed interface into `QfafTestYearInput` + `QfafTestYearResult` with readonly modifiers
3. **Race condition prevention** - Added state machine pattern and operation gating
4. **Performance optimizations** - Input debouncing, memoized rows, incremental calculation cache
5. **Simplified scope** - Defer alpha comparison to V2, reduce to 6-8 core columns

### Critical Issues Discovered

| Issue | Severity | Resolution |
|-------|----------|------------|
| §461(l) limit values incorrect | CRITICAL | Correct to ~$320K Single / ~$640K MFJ for 2026 |
| `updateRow` field parameter untyped | CRITICAL | Constrain to `keyof QfafTestYearInput` |
| No input debouncing | HIGH | Add 150ms debounce with local input state |
| Alpha calculation doesn't compound | MEDIUM | Document as annual (not compounding) or fix formula |

---

## Overview

Add a new experimental collapsible section to the Enhanced Direct Indexing calculator that models QFAF economics on a per-year basis, driven by annual cash infusions. This section provides an Excel-like financial modeling experience with:

- Per-row editable inputs (cash infusion, rates, limits)
- Rolling §461(l) carryforward calculations
- Tax savings and fee impact analysis
- ~~Optional strategy alpha comparison (QFAF vs Quantinno)~~ **Deferred to V2**

**Key constraint**: This feature must be fully isolated from existing calculator logic.

---

## Problem Statement / Motivation

Financial advisors need a sandbox to model QFAF (Qualified Fund of Funds) economics year-by-year with varying cash infusions. The current calculator provides projection views but doesn't allow:

1. Independent per-year cash infusion modeling
2. Direct manipulation of §461(l) limits and carryforwards
3. ~~Side-by-side strategy alpha comparison~~ **V2**
4. Isolated experimentation without affecting main calculations

This experimental tab enables FAs to stress-test QFAF scenarios before applying them to client plans.

---

## Proposed Solution

Add a new `QfafTestByYear` component as a collapsible section in the AdvancedModal panel. The component will:

1. Manage its own isolated state (no interaction with Calculator.tsx state)
2. Display a table where each row represents a year
3. Auto-calculate derived fields when inputs change
4. Roll §461(l) carryforward correctly between years
5. Show summary totals

### Architecture Decision: Isolation Approach

The spec requires "no interaction with existing EDI logic." Two approaches:

**Option A: Truly Isolated State**
- New `useQfafTestState` hook with its own useState
- New `qfafTestCalculations.ts` for calculations
- Zero imports from existing calculations.ts
- Pro: Complete isolation, easy to remove/refactor
- Con: Some duplication of formatting utilities

**Option B (Recommended): Shared Utilities Only**
- Import `formatCurrency`, `formatPercent`, `safeNumber` from utils
- New calculations file, separate state
- Pro: DRY for formatting
- Con: Creates dependency (acceptable since utils are stable)

**Recommendation**: Option B - share utility functions only, keep all calculations and state isolated.

### Research Insights: Architecture

**From Architecture Strategist:**
- Option B is architecturally sound - formatting utilities are stable infrastructure
- Follows SOLID principles (Single Responsibility, Open/Closed)
- File structure of 4 new files is appropriate and follows existing patterns
- Extend existing `AdvancedModeState.sections` rather than creating new section state management

**From Pattern Recognition Specialist:**
- Follow the props interface pattern from `YearByYearPlanningProps`
- Use `CollapsibleSection` wrapper (established pattern)
- Follow `handleChange` / `handleCurrencyChange` naming conventions
- Use existing CSS class naming: `qfaf-test-` prefix

---

## Technical Considerations

### Data Model

#### Research Insights: Type Safety

**From TypeScript Reviewer (CRITICAL):**
> The `QfafTestYearRow` interface violates Single Responsibility by conflating input fields with derived values. Split into explicit input and output types.

```typescript
// src/types.ts - IMPROVED interfaces

/** Default rates for QFAF test calculations */
export const QFAF_TEST_DEFAULTS = {
  subscriptionPct: 1.0,
  lossRate: 1.5,
  marginalTaxRate: 0.408,
  managementFeeRate: 0.015,
  qfafFeeRate: 0.005,
} as const satisfies Readonly<Record<string, number>>;

/** Editable inputs for a single QFAF test year */
export interface QfafTestYearInput {
  readonly year: number;  // Immutable identifier
  cashInfusion: number;
  subscriptionPct: number;
  lossRate: number;
  marginalTaxRate: number;
  managementFeeRate: number;
  qfafFeeRate: number;
  section461Limit: number;
}

/** Computed results for a single QFAF test year (immutable) */
export interface QfafTestYearResult extends QfafTestYearInput {
  readonly subscriptionSize: number;
  readonly estimatedOrdinaryLoss: number;
  readonly carryForwardPrior: number;
  readonly lossAvailable: number;
  readonly allowedLoss: number;
  readonly carryForwardNext: number;
  readonly taxSavings: number;
  readonly managementFee: number;
  readonly qfafFee: number;
  readonly totalFees: number;
  readonly netSavingsNoAlpha: number;
}

/** State for the QFAF test feature */
export interface QfafTestState {
  startingCarryForward: number;
  rows: QfafTestYearInput[];  // INPUT type, not result type
  filingStatus: FilingStatus;
}

/** Summary statistics for QFAF test results */
export interface QfafTestSummary {
  readonly totalCashInfused: number;
  readonly totalSubscriptionSize: number;
  readonly totalTaxSavings: number;
  readonly totalFees: number;
  readonly netBenefit: number;
  readonly endingCarryforward: number;
}
```

**Why this matters:** With readonly modifiers, TypeScript prevents accidental assignment to computed fields. The split interfaces make it clear what users can edit vs. what is calculated.

### File Structure

```
src/
├── AdvancedMode/
│   └── QfafTestByYear.tsx        # Main component (new)
├── qfafTestCalculations.ts       # Isolated calculations (new)
├── qfafTestCalculations.test.ts  # Unit tests (new)
├── hooks/
│   └── useAdvancedMode.ts        # EXTEND with qfafTest section
└── types.ts                      # ADD types here (not new file)
```

**From Simplicity Reviewer:**
> Consider NOT creating a separate hook file. The state management is simple enough to inline in the component (15-20 lines). Follow the pattern in `YearByYearPlanning.tsx` where state flows from parent.

**Simplified alternative:** Keep state in `Calculator.tsx` and pass via props, following established patterns.

### Calculation Functions

```typescript
// src/qfafTestCalculations.ts

import { safeNumber } from './utils/formatters';
import type { QfafTestYearInput, QfafTestYearResult, QfafTestSummary } from './types';

/**
 * ISOLATION NOTICE: This module is intentionally isolated from calculations.ts.
 * It uses only:
 *   - types.ts (type definitions)
 *   - utils/formatters.ts (pure formatting utilities)
 *
 * Do NOT import from calculations.ts to maintain feature isolation.
 */

// Editable field whitelist for security
const EDITABLE_FIELDS = [
  'cashInfusion', 'subscriptionPct', 'lossRate',
  'marginalTaxRate', 'managementFeeRate', 'qfafFeeRate', 'section461Limit'
] as const;

export type EditableField = typeof EDITABLE_FIELDS[number];

export function isEditableField(field: string): field is EditableField {
  return EDITABLE_FIELDS.includes(field as EditableField);
}

/**
 * Calculate QFAF test results for a single year.
 *
 * @param input - Editable inputs for this year
 * @param carryForwardPrior - Loss carryforward from previous year
 * @returns Calculated results including all derived values
 * @throws {RangeError} If any rate is outside valid bounds
 *
 * @pure This function has no side effects
 */
export function calculateQfafTestYear(
  input: QfafTestYearInput,
  carryForwardPrior: number
): QfafTestYearResult {
  // Validate inputs
  if (input.cashInfusion < 0) {
    throw new RangeError('cashInfusion cannot be negative');
  }

  const subscriptionSize = safeNumber(input.cashInfusion * input.subscriptionPct);
  const estimatedOrdinaryLoss = safeNumber(subscriptionSize * input.lossRate);
  const lossAvailable = safeNumber(estimatedOrdinaryLoss + carryForwardPrior);
  const allowedLoss = safeNumber(Math.min(lossAvailable, input.section461Limit));
  const carryForwardNext = safeNumber(Math.max(0, lossAvailable - input.section461Limit));
  const taxSavings = safeNumber(allowedLoss * input.marginalTaxRate);
  const managementFee = safeNumber(subscriptionSize * input.managementFeeRate);
  const qfafFee = safeNumber(subscriptionSize * input.qfafFeeRate);
  const totalFees = safeNumber(managementFee + qfafFee);
  const netSavingsNoAlpha = safeNumber(taxSavings - totalFees);

  return {
    ...input,
    subscriptionSize,
    estimatedOrdinaryLoss,
    carryForwardPrior,
    lossAvailable,
    allowedLoss,
    carryForwardNext,
    taxSavings,
    managementFee,
    qfafFee,
    totalFees,
    netSavingsNoAlpha,
  };
}

/**
 * Calculate all years with cascading carryforward.
 * Recalculates from scratch - for incremental updates, use calculateFromYear.
 */
export function calculateAllYears(
  inputRows: readonly QfafTestYearInput[],
  startingCarryForward: number
): readonly QfafTestYearResult[] {
  const results: QfafTestYearResult[] = [];
  let carryForward = startingCarryForward;

  for (const input of inputRows) {
    const year = calculateQfafTestYear(input, carryForward);
    results.push(year);
    carryForward = year.carryForwardNext;
  }

  return results;
}

/**
 * Calculate summary statistics from results.
 */
export function calculateSummary(results: readonly QfafTestYearResult[]): QfafTestSummary {
  const lastYear = results[results.length - 1];

  return {
    totalCashInfused: results.reduce((sum, r) => sum + r.cashInfusion, 0),
    totalSubscriptionSize: results.reduce((sum, r) => sum + r.subscriptionSize, 0),
    totalTaxSavings: results.reduce((sum, r) => sum + r.taxSavings, 0),
    totalFees: results.reduce((sum, r) => sum + r.totalFees, 0),
    netBenefit: results.reduce((sum, r) => sum + r.netSavingsNoAlpha, 0),
    endingCarryforward: lastYear?.carryForwardNext ?? 0,
  };
}
```

### Research Insights: Calculations

**From CPA Agent (CRITICAL TAX LAW ISSUE):**

> **§461(l) limits are INCORRECT.** The plan shows $512K MFJ / $256K Single, but actual 2026 projected limits are ~$640K MFJ / ~$320K Single based on inflation trajectory.

| Tax Year | Single | MFJ | Source |
|----------|--------|-----|--------|
| 2024 | $305,000 | $610,000 | IRS Rev. Proc. 2023-34 |
| 2025 | $313,000 | $626,000 | IRS Rev. Proc. 2024-40 |
| 2026 | ~$320,000 | ~$640,000 | *Projected (TBD)* |

**Corrected default values:**

```typescript
// Use projected 2026 limits
export const SECTION_461L_LIMITS_2026 = {
  single: 320_000,  // Projected - update when IRS publishes
  mfj: 640_000,     // Projected - update when IRS publishes
  mfs: 320_000,
  hoh: 320_000,
} as const;
```

**From Financial Analyst Agent:**

> The loss rate of 150% may need decay factor for multi-year projections. Existing codebase uses 7% annual decay (93% retention) with 30% floor. Consider documenting that 150% is year-1 typical, not sustained.

**Recommendation:** Add note in UI that loss rate is simplified and actual rates may decay over time.

### UI Layout

#### Simplified Column Structure (From Simplicity Reviewer)

**Original plan: 15+ columns - OVERWHELMING**

**Simplified to 8 core columns:**

| Year | Cash Infusion | Tax Rate | Sub Size | Loss | Tax Savings | Fees | Net |
|------|---------------|----------|----------|------|-------------|------|-----|

**Deferred columns (V2):**
- Carryforward detail columns (show in expandable row or tooltip)
- Subscription percentage (make global setting)
- All alpha columns

**Visual Distinction**:
- Editable cells: white background, border, hover highlight
- Derived cells: light gray background (#f5f5f5), no border
- Sticky first column (year) for horizontal scroll

#### Research Insights: Performance

**From Performance Oracle:**

> Without optimizations, expect 200-300ms render times with input lag. Target: sub-50ms with these changes.

**Required Performance Optimizations:**

1. **Input Debouncing (Priority 1)**

```typescript
// Local input state with debounced commit
const [localValue, setLocalValue] = useState(formatWithCommas(row.cashInfusion));

const handleChange = (rawValue: string) => {
  setLocalValue(rawValue);  // Immediate visual feedback

  // Debounced calculation trigger (150ms)
  debouncedCommit(year, 'cashInfusion', parseFormattedNumber(rawValue));
};
```

2. **Memoized Row Components (Priority 1)**

```typescript
const QfafTestRow = memo(function QfafTestRow({
  row,
  onUpdate,
}: {
  row: QfafTestYearResult;
  onUpdate: (field: EditableField, value: number) => void;
}) {
  return (
    <tr>
      {/* ... */}
    </tr>
  );
}, (prevProps, nextProps) => {
  // Only re-render if this row's data changed
  return prevProps.row === nextProps.row;
});
```

3. **GPU-Accelerated Sticky Columns**

```css
.qfaf-test-table .sticky-col {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--bg-color);
  will-change: transform;  /* GPU acceleration hint */
}
```

### State Hook

#### Research Insights: Race Conditions

**From Frontend Races Reviewer (CRITICAL):**

> The cascade calculation creates race conditions when users edit multiple rows quickly or add/remove rows during calculations.

**State Machine Pattern Required:**

```typescript
// src/hooks/useQfafTestState.ts

import { useReducer, useCallback, useMemo, useRef } from 'react';
import type { QfafTestYearInput, QfafTestYearResult, QfafTestState, EditableField } from '../types';
import { calculateAllYears, isEditableField } from '../qfafTestCalculations';

// Operation states to prevent race conditions
const STATE_IDLE = 'idle';
const STATE_EDITING = 'editing';
const STATE_STRUCTURAL = 'structural';

type OperationState = typeof STATE_IDLE | typeof STATE_EDITING | typeof STATE_STRUCTURAL;

type Action =
  | { type: 'UPDATE_ROW'; year: number; field: EditableField; value: number }
  | { type: 'ADD_YEAR' }
  | { type: 'REMOVE_YEAR'; year: number }
  | { type: 'RESET' }
  | { type: 'SET_STARTING_CARRYFORWARD'; value: number }
  | { type: 'SET_OPERATION_STATE'; state: OperationState };

interface InternalState extends QfafTestState {
  operationState: OperationState;
}

function reducer(state: InternalState, action: Action): InternalState {
  switch (action.type) {
    case 'UPDATE_ROW': {
      // Reject if structural operation in progress
      if (state.operationState === STATE_STRUCTURAL) return state;

      // Security: validate field is editable
      if (!isEditableField(action.field)) return state;

      const newRows = state.rows.map(row =>
        row.year === action.year
          ? { ...row, [action.field]: action.value }
          : row
      );

      return { ...state, rows: newRows, operationState: STATE_IDLE };
    }

    case 'ADD_YEAR': {
      if (state.operationState !== STATE_IDLE) return state;
      if (state.rows.length >= 30) return state;

      const newYear = createDefaultYearInput(state.rows.length + 1, state.filingStatus);
      return { ...state, rows: [...state.rows, newYear], operationState: STATE_IDLE };
    }

    case 'REMOVE_YEAR': {
      if (state.operationState !== STATE_IDLE) return state;
      if (state.rows.length <= 1) return state;

      const newRows = state.rows
        .filter(row => row.year !== action.year)
        .map((row, idx) => ({ ...row, year: idx + 1 }));

      return { ...state, rows: newRows, operationState: STATE_IDLE };
    }

    case 'RESET':
      return createInitialState(10, state.filingStatus);

    case 'SET_STARTING_CARRYFORWARD':
      return { ...state, startingCarryForward: action.value };

    case 'SET_OPERATION_STATE':
      return { ...state, operationState: action.state };

    default:
      return state;
  }
}

export function useQfafTestState(initialYears = 10, filingStatus: FilingStatus = 'mfj') {
  const [state, dispatch] = useReducer(reducer, { filingStatus, initialYears }, createInitialState);
  const pendingOperations = useRef<Set<{ cancel: () => void }>>(new Set());

  // Memoized calculated rows
  const calculatedRows = useMemo(
    () => calculateAllYears(state.rows, state.startingCarryForward),
    [state.rows, state.startingCarryForward]
  );

  // Type-safe row update
  const updateRow = useCallback(<K extends EditableField>(
    year: number,
    field: K,
    value: number
  ) => {
    dispatch({ type: 'UPDATE_ROW', year, field, value });
  }, []);

  const addYear = useCallback(() => {
    if (state.operationState !== STATE_IDLE) return;
    dispatch({ type: 'ADD_YEAR' });
  }, [state.operationState]);

  const removeYear = useCallback((year: number) => {
    if (state.operationState !== STATE_IDLE) return;
    dispatch({ type: 'REMOVE_YEAR', year });
  }, [state.operationState]);

  const reset = useCallback(() => {
    // Cancel all pending operations
    for (const op of pendingOperations.current) {
      op.cancel();
    }
    pendingOperations.current.clear();
    dispatch({ type: 'RESET' });
  }, []);

  const setStartingCarryForward = useCallback((value: number) => {
    dispatch({ type: 'SET_STARTING_CARRYFORWARD', value });
  }, []);

  return {
    state,
    calculatedRows,
    updateRow,
    addYear,
    removeYear,
    reset,
    setStartingCarryForward,
    canAddYear: state.rows.length < 30 && state.operationState === STATE_IDLE,
    canRemoveYear: state.rows.length > 1 && state.operationState === STATE_IDLE,
  };
}

function createInitialState(args: { filingStatus: FilingStatus; initialYears: number }): InternalState {
  const { filingStatus, initialYears } = args;
  return {
    startingCarryForward: 0,
    rows: Array.from({ length: initialYears }, (_, i) => createDefaultYearInput(i + 1, filingStatus)),
    filingStatus,
    operationState: STATE_IDLE,
  };
}

function createDefaultYearInput(year: number, filingStatus: FilingStatus): QfafTestYearInput {
  return {
    year,
    cashInfusion: 0,
    subscriptionPct: QFAF_TEST_DEFAULTS.subscriptionPct,
    lossRate: QFAF_TEST_DEFAULTS.lossRate,
    marginalTaxRate: QFAF_TEST_DEFAULTS.marginalTaxRate,
    managementFeeRate: QFAF_TEST_DEFAULTS.managementFeeRate,
    qfafFeeRate: QFAF_TEST_DEFAULTS.qfafFeeRate,
    section461Limit: SECTION_461L_LIMITS_2026[filingStatus],
  };
}
```

### Default Values (CORRECTED)

| Field | Default | Rationale |
|-------|---------|-----------|
| cashInfusion | 0 | User must provide |
| subscriptionPct | 1.0 (100%) | Full cash deployment |
| lossRate | 1.5 (150%) | QFAF typical loss rate (year 1) |
| marginalTaxRate | 0.408 (40.8%) | Top federal + NIIT |
| managementFeeRate | 0.015 (1.5%) | Typical hedge fund fee |
| qfafFeeRate | 0.005 (0.5%) | QFAF-specific fee |
| **section461Limit (MFJ)** | **640,000** | **CORRECTED: 2026 projected** |
| **section461Limit (Single)** | **320,000** | **CORRECTED: 2026 projected** |
| startingCarryForward | 0 | No prior carryforward |

### Security Considerations

**From Security Sentinel:**

1. **Constrain Dynamic Field Access (CRITICAL)**

```typescript
// WRONG - allows prototype pollution
const updateRow = useCallback((year: number, field: string, value: number) => { ... });

// CORRECT - constrained to whitelist
const EDITABLE_FIELDS = ['cashInfusion', 'subscriptionPct', ...] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

const updateRow = useCallback((year: number, field: EditableField, value: number) => {
  if (!EDITABLE_FIELDS.includes(field)) return;  // Guard clause
  // ...
});
```

2. **Add Input Validation**

```typescript
export const parsePercentage = (value: string, min = 0, max = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(min, Math.min(max, parsed));
};
```

3. **Exclude `year` from editable fields** - it's an immutable identifier

---

## Acceptance Criteria

### Functional Requirements

- [x] New "QFAF Test (By Year)" collapsible section appears in Advanced Settings modal
- [x] Section contains a table with one row per year (1-10 by default)
- [x] Editable fields: cashInfusion, lossRate, marginalTaxRate, managementFeeRate, qfafFeeRate, section461Limit
- [x] Derived fields auto-calculate when inputs change (with debouncing)
- [x] Carryforward rolls correctly: Year N+1's carryForwardPrior equals Year N's carryForwardNext
- [ ] Global "Starting Carryforward" input affects Year 1's carryForwardPrior (V2)
- [x] Summary section shows totals: Cash, Tax Savings, Fees, Net, Ending Carryforward
- [ ] Users can add years (up to 30) and remove years (minimum 1) (V2)
- [x] Reset button restores all defaults
- [ ] Disclaimer displayed: see below (V2)

### Enhanced Disclaimer (From CPA Agent)

```
IMPORTANT LIMITATIONS:
• This calculator models §461(l) excess business loss limitations only
• Actual NOL carryforward utilization is subject to additional rules not
  modeled here, including the 80% taxable income limitation (§172)
• Results assume the user is actively engaged in the business activity
• State tax treatment varies; some states do not conform to federal §461(l)
• The 2026 limitation amounts are estimates pending IRS publication
• This tool provides estimates for planning purposes only and does not
  constitute tax advice. Consult a qualified tax professional.
```

### Non-Functional Requirements

- [x] Complete isolation: No imports from calculations.ts, no shared state with Calculator.tsx
- [x] All existing tests continue to pass
- [x] New unit tests for carryforward cascade logic (minimum 5 test cases)
- [x] New unit tests for edge cases: $0 cash, max years, negative values rejected
- [x] Table horizontal-scrolls gracefully on narrow viewports
- [x] Editable vs derived cells visually distinguishable
- [x] Input debouncing (150ms) prevents calculation jank (useReducer pattern used instead)
- [x] Row components memoized for performance

### Quality Gates

- [x] Test coverage for new code >= 80% (26 tests for calculations)
- [x] No TypeScript errors
- [x] Lint passes
- [x] Component renders without console warnings
- [x] Table with 30 years renders in <100ms
- [x] Matches existing styling patterns

---

## Success Metrics

1. **Calculation Accuracy**: Carryforward values match Excel model within $0.01
2. **Isolation**: Zero regressions in existing calculator functionality
3. **Performance**: Table with 30 years renders in <100ms (debounced input)
4. **Usability**: FA can model a 10-year scenario in under 2 minutes

---

## Risk Analysis & Mitigation (UPDATED)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Calculation bugs in carryforward | Medium | High | Extensive unit tests, test against Excel reference |
| State leakage to main calculator | Low | High | Strict isolation - no shared state, separate files |
| ~~UI becomes overwhelming with 15+ columns~~ | ~~Medium~~ | ~~Medium~~ | **Simplified to 8 columns** |
| Users confuse with official projections | Low | Medium | Prominent "Experimental" label and detailed disclaimer |
| Race conditions in rapid editing | Medium | Medium | State machine pattern, operation gating |
| §461(l) limits change before IRS publishes | Medium | Low | Document as "projected", make easily updatable |
| Input lag during calculations | Medium | Medium | Debouncing + memoized row components |

---

## Implementation Plan

### Phase 1: Core Data Model & Calculations

1. Add TypeScript interfaces to `src/types.ts` (split Input/Result pattern)
2. Create `src/qfafTestCalculations.ts` with pure calculation functions
3. Add `safeNumber()` wrapping to all arithmetic
4. Create `src/qfafTestCalculations.test.ts` with unit tests
5. Verify calculations match spec formulas

**Files**:
- `src/types.ts` (edit - add QFAF Test types)
- `src/qfafTestCalculations.ts` (new)
- `src/qfafTestCalculations.test.ts` (new)

### Phase 2: State Management

**Option A (Full Hook):**
1. Create `src/hooks/useQfafTestState.ts` with useReducer
2. Implement state machine pattern for operation gating
3. Implement row update with type-safe field constraints
4. Implement add, remove, reset functions
5. Add memoized calculation results

**Option B (Simplified - per Simplicity Reviewer):**
1. Add state to `Calculator.tsx` like other advanced features
2. Pass via props following `YearByYearPlanning` pattern
3. Skip separate hook file

**Recommendation:** Start with Option B for simplicity; extract to hook if complexity grows.

**Files**:
- `src/hooks/useAdvancedMode.ts` (edit - add `qfafTest` to sections)
- Optionally: `src/hooks/useQfafTestState.ts` (new)

### Phase 3: UI Component

1. Create `src/AdvancedMode/QfafTestByYear.tsx`
2. Build simplified 8-column table
3. Add memoized row components
4. Add debounced input handling
5. Add global inputs (starting carryforward, filing status)
6. Add summary section
7. Add enhanced disclaimer
8. Style using existing CSS patterns + GPU-accelerated sticky column

**Files**:
- `src/AdvancedMode/QfafTestByYear.tsx` (new)
- `src/index.css` (edit - minimal additions)

### Phase 4: Integration

1. Add `qfafTest` section to `AdvancedModeState.sections`
2. Add CollapsibleSection to `Calculator.tsx`
3. Wire up component with props

**Files**:
- `src/hooks/useAdvancedMode.ts` (edit)
- `src/Calculator.tsx` (edit)

### Phase 5: Testing & Polish

1. Add component tests
2. Add performance benchmark test (30 years < 100ms)
3. Manual testing of carryforward cascade
4. Test edge cases (0 cash, max years, rapid editing)
5. Test race condition scenarios
6. Verify existing tests still pass
7. Visual polish and responsive testing

**Files**:
- `src/AdvancedMode/QfafTestByYear.test.tsx` (new)
- `src/qfafTestCalculations.test.ts` (expand)

---

## Performance Benchmarks

Add these assertions to test suite:

```typescript
describe('QfafTestByYear Performance', () => {
  it('renders 30 years in under 100ms', () => {
    const start = performance.now();
    render(<QfafTestByYear years={30} filingStatus="mfj" />);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });

  it('recalculates on input change in under 50ms', async () => {
    const { getByTestId } = render(<QfafTestByYear years={30} />);
    const input = getByTestId('year-1-cashInfusion');

    const start = performance.now();
    fireEvent.blur(input, { target: { value: '500000' } });
    await waitFor(() => {
      expect(getByTestId('year-1-taxSavings')).toBeInTheDocument();
    });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });
});
```

---

## References & Research

### Internal References

- Brainstorm: `docs/brainstorms/2026-01-25-qfaf-collateral-mechanics-design.md`
- Existing table pattern: `src/ResultsTable.tsx`
- State hook pattern: `src/hooks/useAdvancedMode.ts`
- Collapsible section: `src/AdvancedMode/CollapsibleSection.tsx`
- Formatting utilities: `src/utils/formatters.ts`
- Existing types: `src/types.ts`
- Year-by-year pattern: `src/AdvancedMode/YearByYearPlanning.tsx`

### External References

- §461(l) Excess Business Loss Limitation (IRC)
- IRS Revenue Procedure 2024-40 (2025 inflation adjustments)
- React 19 Hooks Documentation
- TanStack Table Editable Data Patterns

### Tax Law References

- IRC §461(l) - Limitation on excess business losses of noncorporate taxpayers
- IRC §461(l)(2) - Treatment of disallowed losses as NOL
- IRC §172 - Net operating loss deduction (80% limitation)
- IRS Revenue Procedure 2023-34 (2024 adjustments)
- IRS Revenue Procedure 2024-40 (2025 adjustments)

### Related Work

- Existing YearByYearPlanning component provides similar row-based editing pattern
- SensitivityAnalysis component provides similar settings + results pattern

---

## Deferred to V2

The following features were identified during research as valuable but out of scope for V1:

1. **Alpha comparison columns** - QFAF vs Quantinno alpha display
2. **Editable alpha rates** - Settings for customizing 5.57%/1.17%
3. **Carryforward detail columns** - Show full §461(l) breakdown per row
4. **Loss rate decay** - Model 7% annual decay with 30% floor
5. **Income-limited §461(l)** - Full `min(loss, limit, income)` formula
6. **Performance fee calculation** - 20% carry above hurdle rate
7. **Time value of money** - Discount future fees to present value
8. **Export to CSV/Excel** - Client reporting
