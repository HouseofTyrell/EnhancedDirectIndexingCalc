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
  /** Pinned scenario for comparison */
  PINNED_SCENARIO: 'taxCalc:pinned-scenario',
  /** Pinned UI elements for floating panel */
  PINNED_ELEMENTS: 'taxCalc:pinned-elements',
  /** Floating panel position and size */
  PINNED_PANEL_LAYOUT: 'taxCalc:pinned-panel-layout',
  /** Floating panel item order */
  PINNED_PANEL_ORDER: 'taxCalc:pinned-panel-order',
  /** Floating panel per-item heights */
  PINNED_PANEL_HEIGHTS: 'taxCalc:pinned-panel-heights',
} as const;
