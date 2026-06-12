import { formatCurrency, formatPercent } from '../utils/formatters';

interface DeltaBadgeProps {
  delta: number | null;
  format?: 'currency' | 'percent';
}

/**
 * Temporary badge showing the change (delta) in a value.
 * Renders "+$1,234" or "-0.5%" for ~2.5s after a value changes, then nothing.
 */
export function DeltaBadge({ delta, format = 'currency' }: DeltaBadgeProps) {
  if (delta === null) return null;
  const isPositive = delta > 0;
  const sign = isPositive ? '+' : '';
  const formatted = format === 'percent' ? formatPercent(delta) : formatCurrency(Math.abs(delta));
  const display =
    format === 'currency' ? `${isPositive ? '+' : '-'}${formatted}` : `${sign}${formatted}`;

  return (
    <span
      className={`delta-badge ${isPositive ? 'delta-badge--positive' : 'delta-badge--negative'}`}
      aria-live="polite"
    >
      {display}
    </span>
  );
}
