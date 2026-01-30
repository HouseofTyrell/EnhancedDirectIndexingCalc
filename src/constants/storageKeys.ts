/**
 * Centralized localStorage key definitions.
 * All keys use a consistent `taxCalc:` namespace prefix.
 */
export const STORAGE_KEYS = {
  /** Dark/light theme preference */
  THEME: 'taxCalc:theme',
  /** Advanced mode panel state (open/closed, active tools) */
  ADVANCED_MODE: 'taxCalc:advanced-mode',
  /** Qualified Purchaser acknowledgment flag */
  QP_ACKNOWLEDGED: 'taxCalc:qp-acknowledged',
  /** Custom strategy rate overrides */
  RATE_OVERRIDES: 'taxCalc:rate-overrides',
  /** Onboarding tour completion flag */
  TOUR_COMPLETED: 'taxCalc:tour-completed',
} as const;
