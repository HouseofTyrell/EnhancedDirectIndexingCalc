import React, { useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { YearResult } from './types';
import { formatCurrency, formatCurrencyAbbreviated } from './utils/formatters';

interface WealthChartProps {
  data: YearResult[];
  trackingError?: number; // Annual tracking error for confidence bands
}

// Memoized chart component to prevent unnecessary re-renders (016)
export const TaxSavingsChart = React.memo(function TaxSavingsChart({ data }: WealthChartProps) {
  // Memoize chart data transformation with O(n) cumulative calculation (007)
  const chartData = useMemo(() => {
    let cumulativeSavings = 0;
    return data.map(year => {
      cumulativeSavings += year.taxSavings;
      return {
        year: `Year ${year.year}`,
        'Tax Savings': year.taxSavings,
        'Cumulative Tax Savings': cumulativeSavings,
        'Usable Ordinary Loss': year.usableOrdinaryLoss,
        'NOL Carryforward': year.nolCarryforward,
      };
    });
  }, [data]);

  return (
    <div className="chart-container">
      <h3>Annual Tax Benefits</h3>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis
            tickFormatter={formatCurrencyAbbreviated}
            tick={{ fontSize: 12 }}
            width={80}
          />
          <Tooltip
            formatter={(value) => value != null ? formatCurrency(value as number) : ''}
            labelStyle={{ fontWeight: 'bold' }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="Cumulative Tax Savings"
            stroke="#16a34a"
            fill="#16a34a"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="Tax Savings"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="Usable Ordinary Loss"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="NOL Carryforward"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

// Memoized chart component to prevent unnecessary re-renders (016)
export const PortfolioValueChart = React.memo(function PortfolioValueChart({ data, trackingError = 0.02 }: WealthChartProps) {
  // Memoize chart data transformation with confidence bands (007)
  const chartData = useMemo(() => data.map(year => {
    // Confidence bands: ±1.5 standard deviations (covers ~87% of outcomes)
    // Tracking error compounds over time: σ_n = σ × √n
    const annualizedError = trackingError * Math.sqrt(year.year) * 1.5;
    const upperBound = year.totalValue * (1 + annualizedError);
    const lowerBound = year.totalValue * (1 - annualizedError);

    return {
      year: `Year ${year.year}`,
      'Total Value': year.totalValue,
      'QFAF Value': year.qfafValue,
      'Collateral Value': year.collateralValue,
      confidenceBand: [lowerBound, upperBound],
    };
  }), [data, trackingError]);

  return (
    <div className="chart-container">
      <h3>Portfolio Value Growth</h3>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis
            tickFormatter={formatCurrencyAbbreviated}
            tick={{ fontSize: 12 }}
            width={80}
          />
          <Tooltip
            formatter={(value, name) => {
              if (name === 'confidenceBand' && Array.isArray(value)) {
                return `${formatCurrency(value[0])} - ${formatCurrency(value[1])}`;
              }
              return value != null ? formatCurrency(value as number) : '';
            }}
            labelStyle={{ fontWeight: 'bold' }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="confidenceBand"
            stroke="none"
            fill="#2563eb"
            fillOpacity={0.1}
            name="Confidence Band (±1.5σ)"
          />
          <Line
            type="monotone"
            dataKey="Total Value"
            stroke="#2563eb"
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="Collateral Value"
            stroke="#0891b2"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="QFAF Value"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

// Keep the old export for backwards compatibility
export const WealthChart = React.memo(function WealthChart({ data }: WealthChartProps) {
  return <TaxSavingsChart data={data} />;
});
