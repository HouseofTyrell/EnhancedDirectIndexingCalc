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
import type { EdiYearResult } from '../calculations/ediOnly';
import { estimateEmbeddedGainPct } from '../calculations/ediOnly';
import { formatCurrency, formatCurrencyAbbreviated } from '../utils/formatters';
import { useDarkMode } from '../hooks/useDarkMode';
import './EdiCharts.css';

interface EdiChartsProps {
  data: EdiYearResult[];
  strategyId: string;
  annualReturn: number;
}

export const EdiTaxSavingsChart = React.memo(function EdiTaxSavingsChart({ data }: EdiChartsProps) {
  const { isDark } = useDarkMode();

  const chartData = useMemo(() => {
    let cumulativeSavings = 0;
    return data.map(year => {
      cumulativeSavings += year.annualRealizedBenefit;
      return {
        year: `Year ${year.year}`,
        'Annual Benefit': year.annualRealizedBenefit,
        'Cumulative Benefit': cumulativeSavings,
        'ST Carryforward': year.endingStCarryforward,
        'LT Carryforward': year.endingLtCarryforward,
      };
    });
  }, [data]);

  return (
    <div className="chart-container">
      <h3>Tax Savings &amp; Carryforward Build</h3>
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
            dataKey="Cumulative Benefit"
            stroke="#16a34a"
            fill="#16a34a"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="Annual Benefit"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="ST Carryforward"
            stroke="#7c3aed"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="LT Carryforward"
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

export const EdiEmbeddedGainChart = React.memo(function EdiEmbeddedGainChart({
  data,
  strategyId,
  annualReturn,
}: EdiChartsProps) {
  const { isDark } = useDarkMode();

  const chartData = useMemo(() => {
    return data.map(year => {
      const embeddedGainPct = estimateEmbeddedGainPct(strategyId, year.year, annualReturn);
      return {
        year: `Year ${year.year}`,
        'Portfolio Value': year.collateralValue,
        'Embedded Gain %': +(embeddedGainPct * 100).toFixed(1),
      };
    });
  }, [data, strategyId, annualReturn]);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
    label?: string;
  }) => {
    if (!active || !payload || !payload.length) return null;

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
        {payload.map((entry, index) => (
          <p key={index} style={{ margin: '4px 0', color: entry.color }}>
            {entry.name}:{' '}
            {entry.dataKey === 'Embedded Gain %'
              ? `${entry.value}%`
              : formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="chart-container">
      <h3>Portfolio Value &amp; Embedded Gain</h3>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e0e0e0'} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : undefined }} />
          <YAxis
            yAxisId="left"
            tickFormatter={formatCurrencyAbbreviated}
            tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : undefined }}
            width={80}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : undefined }}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" wrapperStyle={isDark ? { color: '#f3f4f6' } : undefined} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="Portfolio Value"
            stroke="#2563eb"
            fill="#2563eb"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="Embedded Gain %"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
