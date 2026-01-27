/**
 * Shared formatting and parsing utilities.
 * Single source of truth for number formatting across the application.
 */

// Maximum reasonable value for financial calculations (1 quadrillion)
const MAX_FINANCIAL_VALUE = 1e15;

/**
 * Format a number with commas for display (no currency symbol).
 */
export const formatWithCommas = (value: number): string => {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

/**
 * Parse a comma-formatted string back to a number.
 * Includes validation for bounds, NaN, and Infinity.
 * Returns 0 for invalid inputs.
 */
export const parseFormattedNumber = (value: string): number => {
  const parsed = Number(value.replace(/,/g, ''));
  // Reject NaN, Infinity, and negative values
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  // Cap at reasonable maximum
  return Math.min(parsed, MAX_FINANCIAL_VALUE);
};

/**
 * Format a number as currency (with $ prefix).
 */
export const formatCurrency = (value: number): string => {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

/**
 * Format a number as currency, abbreviated for charts (K, M, B).
 */
export const formatCurrencyAbbreviated = (value: number): string => {
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(1)}B`;
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  if (value >= 1e3) {
    return `$${(value / 1e3).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

/**
 * Format a decimal as a percentage string.
 * @param value - Decimal value (e.g., 0.07 for 7%)
 * @param decimals - Number of decimal places (default 2)
 */
export const formatPercent = (value: number, decimals: number = 2): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * Validate that a number is finite and safe for calculations.
 * Returns the fallback value if invalid.
 */
export const safeNumber = (value: number, fallback: number = 0): number => {
  return Number.isFinite(value) ? value : fallback;
};

/**
 * Validate state tax rate input (0-100% range).
 * Returns rate as decimal (0.0 to 1.0).
 */
export const parseStateRate = (percentValue: string): number => {
  const parsed = Number(percentValue);
  if (!Number.isFinite(parsed)) return 0;
  // Clamp to 0-100%
  const clamped = Math.max(0, Math.min(100, parsed));
  return clamped / 100;
};
