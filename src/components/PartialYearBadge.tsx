interface PartialYearBadgeProps {
  startMonth: number;
  // Optional: render compactly inline (smaller, less padding) for headers/labels.
  compact?: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Visible indicator that Year 1 is being prorated for a partial-year start.
 * Renders nothing for full-year (January) starts.
 */
export function PartialYearBadge({ startMonth, compact = false }: PartialYearBadgeProps) {
  if (!startMonth || startMonth === 1) return null;
  const months = 13 - startMonth;
  const startName = MONTH_NAMES[Math.max(0, Math.min(11, startMonth - 1))];
  return (
    <span
      className={`partial-year-badge${compact ? ' partial-year-badge--compact' : ''}`}
      title={`Strategy starts in ${startName}; Year 1 is pro-rated to ${months} months. Subsequent calendar years blend operating-year rates.`}
    >
      Y1: {months} mo
    </span>
  );
}
