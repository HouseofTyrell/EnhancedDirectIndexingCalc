/**
 * Historical QFAF Performance Data
 *
 * Display-only data for the QFAF Test tab's historical performance tables.
 * Separated from calculation logic for clarity.
 */

export const MONTHLY_RETURNS = [
  { month: 'Nov-24', netReturn: 0.0157 },
  { month: 'Dec-24', netReturn: 0.0002 },
  { month: 'Jan-25', netReturn: 0.0212 },
  { month: 'Feb-25', netReturn: 0.0120 },
  { month: 'Mar-25', netReturn: -0.0011 },
  { month: 'Apr-25', netReturn: 0.0153 },
  { month: 'May-25', netReturn: -0.0054 },
  { month: 'Jun-25', netReturn: -0.0104 },
  { month: 'Jul-25', netReturn: -0.0180 },
  { month: 'Aug-25', netReturn: -0.0055 },
  { month: 'Sep-25', netReturn: -0.0192 },
  { month: 'Oct-25', netReturn: -0.0195 },
];

export const ANNUAL_RETURNS = [
  { year: '2020', netReturn: -0.0851 },
  { year: '2021', netReturn: 0.1705 },
  { year: '2022', netReturn: 0.1244 },
  { year: '2023', netReturn: 0.0433 },
  { year: '2024', netReturn: 0.1569 },
];

export const MONTHLY_BREAKDOWN = [
  { month: 'Nov-24', stCapGain: 0.1201, ordinaryIncome: -0.1080 },
  { month: 'Dec-24', stCapGain: 0.1269, ordinaryIncome: -0.1250 },
  { month: 'Jan-25', stCapGain: 0.1256, ordinaryIncome: -0.1013 },
  { month: 'Feb-25', stCapGain: 0.1271, ordinaryIncome: -0.1133 },
  { month: 'Mar-25', stCapGain: 0.1267, ordinaryIncome: -0.1301 },
  { month: 'Apr-25', stCapGain: 0.1276, ordinaryIncome: -0.1102 },
  { month: 'May-25', stCapGain: 0.1243, ordinaryIncome: -0.1309 },
  { month: 'Jun-25', stCapGain: 0.1268, ordinaryIncome: -0.1393 },
  { month: 'Jul-25', stCapGain: 0.1231, ordinaryIncome: -0.1401 },
  { month: 'Aug-25', stCapGain: 0.1277, ordinaryIncome: -0.1339 },
  { month: 'Sep-25', stCapGain: 0.1313, ordinaryIncome: -0.1504 },
  { month: 'Oct-25', stCapGain: 0.1273, ordinaryIncome: -0.1477 },
];

export const ANNUAL_BREAKDOWN = [
  { year: '2020', stCapGain: 1.5293, ordinaryIncome: -1.5788 },
  { year: '2021', stCapGain: 1.5130, ordinaryIncome: -1.3131 },
  { year: '2022', stCapGain: 1.4860, ordinaryIncome: -1.3470 },
  { year: '2023', stCapGain: 1.5076, ordinaryIncome: -1.4809 },
  { year: '2024', stCapGain: 1.4962, ordinaryIncome: -1.3535 },
];

// Pre-computed historical ordinary loss rate stats (from annual breakdown)
const HIST_ORD_LOSS_RATES = ANNUAL_BREAKDOWN.map(r => Math.abs(r.ordinaryIncome));
export const HIST_ORD_LOSS_MIN = Math.min(...HIST_ORD_LOSS_RATES);
export const HIST_ORD_LOSS_MAX = Math.max(...HIST_ORD_LOSS_RATES);
export const HIST_ORD_LOSS_AVG = HIST_ORD_LOSS_RATES.reduce((a, b) => a + b, 0) / HIST_ORD_LOSS_RATES.length;
