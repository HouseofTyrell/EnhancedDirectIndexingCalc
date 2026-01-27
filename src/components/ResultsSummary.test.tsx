import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsSummary } from './ResultsSummary';

describe('ResultsSummary', () => {
  const defaultProps = {
    totalTaxSavings: 500000,
    finalPortfolioValue: 2500000,
    effectiveTaxAlpha: 0.025,
    totalNolGenerated: 150000,
  };

  it('renders the section title', () => {
    render(<ResultsSummary {...defaultProps} />);
    expect(screen.getByText('10-Year Tax Savings')).toBeInTheDocument();
  });

  it('displays formatted total tax savings', () => {
    render(<ResultsSummary {...defaultProps} />);
    expect(screen.getByText('$500,000')).toBeInTheDocument();
  });

  it('displays formatted final portfolio value', () => {
    render(<ResultsSummary {...defaultProps} />);
    expect(screen.getByText('$2,500,000')).toBeInTheDocument();
  });

  it('displays formatted tax alpha as percentage', () => {
    render(<ResultsSummary {...defaultProps} />);
    expect(screen.getByText('2.50%')).toBeInTheDocument();
  });

  it('displays formatted NOL generated', () => {
    render(<ResultsSummary {...defaultProps} />);
    expect(screen.getByText('$150,000')).toBeInTheDocument();
  });

  it('renders all four summary cards', () => {
    render(<ResultsSummary {...defaultProps} />);
    const cards = document.querySelectorAll('.card');
    expect(cards).toHaveLength(4);
  });

  it('handles zero values correctly', () => {
    render(
      <ResultsSummary
        totalTaxSavings={0}
        finalPortfolioValue={0}
        effectiveTaxAlpha={0}
        totalNolGenerated={0}
      />
    );
    // Should display $0 values
    const zeroValues = screen.getAllByText('$0');
    expect(zeroValues.length).toBeGreaterThan(0);
  });
});
