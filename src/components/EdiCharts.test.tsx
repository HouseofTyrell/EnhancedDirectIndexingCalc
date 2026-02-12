import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EdiTaxSavingsChart, EdiEmbeddedGainChart } from './EdiCharts';
import type { EdiYearResult } from '../calculations/ediOnly';

// Mock localStorage since Node.js v22+ built-in conflicts with jsdom
const mockStorage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; },
  key: (_index: number) => null as string | null,
});

// Minimal mock data for chart rendering
const mockData: EdiYearResult[] = [
  {
    year: 1,
    collateralValue: 10_000_000,
    stLossesHarvested: 800_000,
    ltGainsRealized: 300_000,
    stLossesUsedToOffsetLtGains: 300_000,
    netLtGainAfterOffset: 0,
    excessStLossAfterOffset: 500_000,
    priorCfUsedAgainstLtGains: 0,
    taxOnRemainingLtGains: 0,
    capitalLossDeduction: 3000,
    taxSavedByCapitalLossDeduction: 1500,
    annualRealizedBenefit: 1500,
    endingStCarryforward: 500_000,
    endingLtCarryforward: 0,
    harvestingEfficiency: 2.67,
  },
  {
    year: 2,
    collateralValue: 10_700_000,
    stLossesHarvested: 856_000,
    ltGainsRealized: 321_000,
    stLossesUsedToOffsetLtGains: 321_000,
    netLtGainAfterOffset: 0,
    excessStLossAfterOffset: 535_000,
    priorCfUsedAgainstLtGains: 0,
    taxOnRemainingLtGains: 0,
    capitalLossDeduction: 3000,
    taxSavedByCapitalLossDeduction: 1500,
    annualRealizedBenefit: 1500,
    endingStCarryforward: 1_035_000,
    endingLtCarryforward: 0,
    harvestingEfficiency: 2.67,
  },
];

const defaultProps = {
  data: mockData,
  strategyId: 'overlay-45-45',
  annualReturn: 0.07,
};

// Recharts uses SVG + ResizeObserver which requires special handling in tests.
// We test that the components render without crashing and show their titles.

describe('EdiTaxSavingsChart', () => {
  it('renders the chart title', () => {
    render(<EdiTaxSavingsChart {...defaultProps} />);
    expect(screen.getByText('Tax Savings & Carryforward Build')).toBeInTheDocument();
  });

  it('renders the chart container', () => {
    const { container } = render(<EdiTaxSavingsChart {...defaultProps} />);
    expect(container.querySelector('.chart-container')).not.toBeNull();
  });
});

describe('EdiEmbeddedGainChart', () => {
  it('renders the chart title', () => {
    render(<EdiEmbeddedGainChart {...defaultProps} />);
    expect(screen.getByText('Portfolio Value & Embedded Gain')).toBeInTheDocument();
  });

  it('renders the chart container', () => {
    const { container } = render(<EdiEmbeddedGainChart {...defaultProps} />);
    expect(container.querySelector('.chart-container')).not.toBeNull();
  });
});
