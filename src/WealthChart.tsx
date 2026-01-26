import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
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

export function WealthChart({ data }: WealthChartProps) {
  const chartData = data.map(year => ({
    year: `Year ${year.year}`,
    'Total Value': year.totalValue,
    'QFAF Value': year.qfafValue,
    'Collateral Value': year.collateralValue,
    'Cumulative Tax Savings': data
      .slice(0, year.year)
      .reduce((sum, y) => sum + y.taxSavings, 0),
  }));

  return (
    <div className="chart-container">
      <h3>10-Year Wealth Projection</h3>
      <ResponsiveContainer width="100%" height={400}>
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
            dataKey="Cumulative Tax Savings"
            stroke="#16a34a"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
