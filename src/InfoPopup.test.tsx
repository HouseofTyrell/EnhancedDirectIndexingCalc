import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InfoText } from './InfoPopup';

describe('InfoText breakdown', () => {
  it('renders each formula term with its value when a breakdown is provided', () => {
    render(
      <InfoText
        contentKey="col-income-required"
        currentValue="$1,934,500"
        breakdown={[
          { label: '§461(l) Deduction', value: '$512,000' },
          { label: '$3K Used', value: '$3,000' },
          { label: 'Start-of-Year NOL ($1,000,000) ÷ 80%', value: '$1,250,000' },
          { label: 'Net Taxable ST/LT Gains', value: '$24,000', negative: true },
        ]}
      >
        Income to Fully Utilize
      </InfoText>
    );

    // Open the popup.
    fireEvent.click(screen.getByText('Income to Fully Utilize'));

    // Headline value still shows.
    expect(screen.getByText('$1,934,500')).toBeInTheDocument();

    // Every component term and value is surfaced.
    expect(screen.getByText('§461(l) Deduction')).toBeInTheDocument();
    expect(screen.getByText('$512,000')).toBeInTheDocument();
    expect(screen.getByText('Start-of-Year NOL ($1,000,000) ÷ 80%')).toBeInTheDocument();
    expect(screen.getByText('$1,250,000')).toBeInTheDocument();

    // The netted-out term renders as a subtraction.
    expect(screen.getByText('−$24,000')).toBeInTheDocument();
  });

  it('omits the breakdown list when none is provided', () => {
    render(
      <InfoText contentKey="col-income-required" currentValue="$100,000">
        Income to Fully Utilize
      </InfoText>
    );
    fireEvent.click(screen.getByText('Income to Fully Utilize'));
    expect(screen.getByText('$100,000')).toBeInTheDocument();
    expect(document.querySelector('.field-breakdown')).toBeNull();
  });
});
