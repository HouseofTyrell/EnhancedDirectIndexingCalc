import {
  LineChart,
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

interface WealthChartProps {
  data: YearResult[];
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
};

const formatTooltipValue = (value: number) => {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export function TaxSavingsChart({ data }: WealthChartProps) {
  const chartData = data.map(year => ({
    year: `Year ${year.year}`,
    'Tax Savings': year.taxSavings,
    'Cumulative Tax Savings': data
      .slice(0, year.year)
      .reduce((sum, y) => sum + y.taxSavings, 0),
    'Usable Ordinary Loss': year.usableOrdinaryLoss,
    'NOL Carryforward': year.nolCarryforward,
  }));

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
            tickFormatter={formatCurrency}
            tick={{ fontSize: 12 }}
            width={80}
          />
          <Tooltip
            formatter={(value) => value != null ? formatTooltipValue(value as number) : ''}
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
}

export function PortfolioValueChart({ data }: WealthChartProps) {
  const chartData = data.map(year => ({
    year: `Year ${year.year}`,
    'Total Value': year.totalValue,
    'QFAF Value': year.qfafValue,
    'Collateral Value': year.collateralValue,
  }));

  return (
    <div className="chart-container">
      <h3>Portfolio Value Growth</h3>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fontSize: 12 }}
            width={80}
          />
          <Tooltip
            formatter={(value) => value != null ? formatTooltipValue(value as number) : ''}
            labelStyle={{ fontWeight: 'bold' }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <Legend />
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Keep the old export for backwards compatibility
export function WealthChart({ data }: WealthChartProps) {
  return <TaxSavingsChart data={data} />;
}
