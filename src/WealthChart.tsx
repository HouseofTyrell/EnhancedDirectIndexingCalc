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
import { useDarkMode } from './hooks/useDarkMode';

interface WealthChartProps {
  data: YearResult[];
  trackingError?: number; // Annual tracking error for confidence bands
}

// Memoized chart component to prevent unnecessary re-renders (016)
export const TaxSavingsChart = React.memo(function TaxSavingsChart({ data }: WealthChartProps) {
  const { isDark } = useDarkMode();

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
        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e0e0e0'} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : undefined }} />
          <YAxis tickFormatter={formatCurrencyAbbreviated} tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : undefined }} width={80} />
          <Tooltip
            formatter={value => (value !== null ? formatCurrency(value as number) : '')}
            labelStyle={{ fontWeight: 'bold', color: isDark ? '#f3f4f6' : undefined }}
            contentStyle={{
              backgroundColor: isDark ? '#1f2937' : '#fff',
              border: `1px solid ${isDark ? '#374151' : '#ccc'}`,
              borderRadius: '4px',
              color: isDark ? '#f3f4f6' : undefined,
            }}
          />
          <Legend verticalAlign="top" wrapperStyle={isDark ? { color: '#f3f4f6' } : undefined} />
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
export const PortfolioValueChart = React.memo(function PortfolioValueChart({
  data,
  trackingError = 0.02,
}: WealthChartProps) {
  const { isDark } = useDarkMode();

  // Memoize chart data transformation with confidence bands (007)
  const chartData = useMemo(
    () =>
      data.map(year => {
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
          upperBound,
          lowerBound,
        };
      }),
    [data, trackingError]
  );

  // Custom tooltip to format values cleanly
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload || !payload.length) return null;

    // Find the data point to get confidence band values
    const dataPoint = chartData.find(d => d.year === label);

    return (
      <div
        style={{
          backgroundColor: isDark ? '#1f2937' : '#fff',
          border: `1px solid ${isDark ? '#374151' : '#ccc'}`,
          borderRadius: '4px',
          padding: '10px',
          color: isDark ? '#f3f4f6' : undefined,
        }}
      >
        <p style={{ fontWeight: 'bold', margin: '0 0 8px 0' }}>{label}</p>
        {payload
          .filter(entry => entry.name !== 'upperBound' && entry.name !== 'lowerBound')
          .map((entry, index) => (
            <p key={index} style={{ margin: '4px 0', color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        {dataPoint && (
          <p
            style={{
              margin: '4px 0',
              color: isDark ? '#9ca3af' : '#6b7280',
              fontSize: '0.85em',
              borderTop: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
              paddingTop: '6px',
              marginTop: '6px',
            }}
          >
            Range (±1.5σ): {formatCurrency(dataPoint.lowerBound)} –{' '}
            {formatCurrency(dataPoint.upperBound)}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="chart-container">
      <h3>Portfolio Value Growth</h3>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e0e0e0'} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : undefined }} />
          <YAxis tickFormatter={formatCurrencyAbbreviated} tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : undefined }} width={80} />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" wrapperStyle={isDark ? { color: '#f3f4f6' } : undefined} />
          {/* Confidence band - upper area (will be masked by lower) */}
          <Area
            type="monotone"
            dataKey="upperBound"
            stroke="none"
            fill="#2563eb"
            fillOpacity={0.1}
            legendType="none"
          />
          {/* Confidence band - lower area (masks the upper to create band effect) */}
          <Area
            type="monotone"
            dataKey="lowerBound"
            stroke="none"
            fill={isDark ? '#111827' : '#ffffff'}
            fillOpacity={1}
            legendType="none"
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
