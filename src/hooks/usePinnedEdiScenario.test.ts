import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePinnedEdiScenario } from './usePinnedEdiScenario';
import type { EdiPinnedAssumptions, EdiPinnedTaxRates, EdiPinnedResults } from '../types';

const mockAssumptions: EdiPinnedAssumptions = {
  strategyId: 'overlay-45-45',
  collateralValue: 10_000_000,
  annualReturn: 0.07,
  washSaleRate: 0,
  existingStCarryforward: 0,
  existingLtCarryforward: 0,
  projectionYears: 10,
};

const mockTaxRates: EdiPinnedTaxRates = {
  combinedStRate: 0.504,
  combinedLtRate: 0.371,
  filingStatus: 'mfj',
  stateCode: 'CA',
};

const mockResults: EdiPinnedResults = {
  totalTaxSavings: 30000,
  totalCarryforwardBuilt: 5_000_000,
  finalStCarryforward: 3_000_000,
  finalLtCarryforward: 2_000_000,
  finalEmbeddedGainPct: 0.5953,
};

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-123' });

// Mock localStorage since Node.js v22+ built-in conflicts with jsdom
const mockStorage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; },
  key: (_index: number) => null as string | null,
};
vi.stubGlobal('localStorage', mockLocalStorage);

const STORAGE_KEY = 'taxCalc:pinned-edi-scenario';

describe('usePinnedEdiScenario', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('starts with no pinned scenario', () => {
    const { result } = renderHook(() => usePinnedEdiScenario());
    expect(result.current.pinned).toBeNull();
    expect(result.current.hasPinned).toBe(false);
  });

  it('pins a scenario', () => {
    const { result } = renderHook(() => usePinnedEdiScenario());

    act(() => {
      result.current.pin(mockAssumptions, mockTaxRates, mockResults);
    });

    expect(result.current.hasPinned).toBe(true);
    expect(result.current.pinned).not.toBeNull();
    expect(result.current.pinned!.assumptions.collateralValue).toBe(10_000_000);
    expect(result.current.pinned!.taxRates.stateCode).toBe('CA');
    expect(result.current.pinned!.results.totalTaxSavings).toBe(30000);
  });

  it('generates a label from assumptions and tax rates', () => {
    const { result } = renderHook(() => usePinnedEdiScenario());

    act(() => {
      result.current.pin(mockAssumptions, mockTaxRates, mockResults);
    });

    // Label format: "CA $10.0M / Overlay 45/45 / 10yr"
    expect(result.current.pinned!.label).toContain('CA');
    expect(result.current.pinned!.label).toContain('10yr');
  });

  it('unpins a scenario', () => {
    const { result } = renderHook(() => usePinnedEdiScenario());

    act(() => {
      result.current.pin(mockAssumptions, mockTaxRates, mockResults);
    });
    expect(result.current.hasPinned).toBe(true);

    act(() => {
      result.current.unpin();
    });
    expect(result.current.hasPinned).toBe(false);
    expect(result.current.pinned).toBeNull();
  });

  it('replaces a pinned scenario', () => {
    const { result } = renderHook(() => usePinnedEdiScenario());

    act(() => {
      result.current.pin(mockAssumptions, mockTaxRates, mockResults);
    });

    const newAssumptions: EdiPinnedAssumptions = {
      ...mockAssumptions,
      collateralValue: 5_000_000,
    };

    act(() => {
      result.current.replacePin(newAssumptions, mockTaxRates, mockResults);
    });

    expect(result.current.pinned!.assumptions.collateralValue).toBe(5_000_000);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => usePinnedEdiScenario());

    act(() => {
      result.current.pin(mockAssumptions, mockTaxRates, mockResults);
    });

    const stored = mockStorage.get(STORAGE_KEY);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.assumptions.collateralValue).toBe(10_000_000);
  });

  it('restores from localStorage on mount', () => {
    // Pre-seed localStorage
    const scenario = {
      id: 'test-id',
      label: 'Test Scenario',
      pinnedAt: Date.now(),
      assumptions: mockAssumptions,
      taxRates: mockTaxRates,
      results: mockResults,
    };
    mockStorage.set(STORAGE_KEY, JSON.stringify(scenario));

    const { result } = renderHook(() => usePinnedEdiScenario());
    expect(result.current.hasPinned).toBe(true);
    expect(result.current.pinned!.label).toBe('Test Scenario');
  });

  it('rejects invalid localStorage data', () => {
    mockStorage.set(STORAGE_KEY, JSON.stringify({ invalid: true }));

    const { result } = renderHook(() => usePinnedEdiScenario());
    expect(result.current.pinned).toBeNull();
    // Should have cleaned up invalid data
    expect(mockStorage.has(STORAGE_KEY)).toBe(false);
  });

  it('uses structuredClone for immutability', () => {
    const { result } = renderHook(() => usePinnedEdiScenario());

    act(() => {
      result.current.pin(mockAssumptions, mockTaxRates, mockResults);
    });

    // Pinned copy should be a different object reference
    expect(result.current.pinned!.assumptions).not.toBe(mockAssumptions);
  });
});
