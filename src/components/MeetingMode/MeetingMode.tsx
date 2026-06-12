import { useState, useRef, useEffect, useMemo, CSSProperties } from 'react';
import {
  CalculatorInputs,
  CalculationResult,
  AdvancedSettings,
  FILING_STATUSES,
  YearResult,
} from '../../types';
import { Strategy, STRATEGIES } from '../../strategyData';
import { STATES } from '../../taxData';
import { getQuantifiedStateWarning } from '../../utils/stateTaxWarnings';
import { formatWithCommas, parseFormattedNumber } from '../../utils/formatters';
import { getEffectiveView } from '../../utils/effectiveAllocation';
import { ExitTaxAnalysis } from '../../calculations/exitTax';
import { computeEdiInsights, computeStepUpComparison } from '../../calculations/ediInsights';

// Design tokens from EDI Calc Meeting Mode.html
const M = {
  bg: '#f5f7fa',
  panel: '#ffffff',
  sidebar: '#0b1020',
  sidebarInk: '#cbd2e1',
  sidebarFaint: '#7c869b',
  sidebarLine: '#1d2334',
  ink: '#0b1020',
  inkSoft: '#475068',
  inkFaint: '#8892a6',
  line: '#e3e8f0',
  lineSoft: '#eef1f6',
  accent: '#4f46e5',
  accentDeep: '#3730a3',
  accentSoft: '#eef0ff',
  accentFaint: '#f5f4ff',
  good: '#0f9466',
  goodSoft: '#e6f4ee',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
  sans: '"IBM Plex Sans", system-ui, sans-serif',
};

const fmtCurrency = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
};
const fmtCurrencyFull = (n: number): string =>
  `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const fmtPercent = (n: number): string => `${(n * 100).toFixed(2)}%`;
const fmtPercent1 = (n: number): string => `${(n * 100).toFixed(1)}%`;

// ─── D-022: benefit-type decomposition of the headline ───
// Mirrors the engine's per-year identity (core.ts):
//   taxSavings = ordinaryLossBenefit + nolUsageBenefit + capitalLossBenefit
//                − ltGainCost − remainingStGainCost
// summed over the visible window — the same audit-complete per-year fields
// the ResultsTable savings reconciliation surfaces — so the components sum
// EXACTLY to the headline (Σ taxSavings), with no NOL double-counting.
export interface BenefitDecomposition {
  ordinaryLossBenefit: number;
  nolUsageBenefit: number;
  capitalLossBenefit: number;
  /** ltGainCost + remainingStGainCost, subtracted from the benefits */
  gainAndOtherCosts: number;
  /** ordinary + NOL + capital − costs = Σ taxSavings over the same years */
  total: number;
}

export function computeBenefitDecomposition(
  years: Pick<
    YearResult,
    | 'ordinaryLossBenefit'
    | 'nolUsageBenefit'
    | 'capitalLossBenefit'
    | 'ltGainCost'
    | 'remainingStGainCost'
  >[]
): BenefitDecomposition {
  const ordinaryLossBenefit = years.reduce((s, y) => s + y.ordinaryLossBenefit, 0);
  const nolUsageBenefit = years.reduce((s, y) => s + y.nolUsageBenefit, 0);
  const capitalLossBenefit = years.reduce((s, y) => s + y.capitalLossBenefit, 0);
  const gainAndOtherCosts = years.reduce((s, y) => s + y.ltGainCost + y.remainingStGainCost, 0);
  return {
    ordinaryLossBenefit,
    nolUsageBenefit,
    capitalLossBenefit,
    gainAndOtherCosts,
    total: ordinaryLossBenefit + nolUsageBenefit + capitalLossBenefit - gainAndOtherCosts,
  };
}

// One card in the "How we get to {headline}" strip.
interface DecompCard {
  stepLabel: string;
  label: string;
  display: string;
  color: string;
  note: string;
  inBar: boolean;
  barFlex: number;
  testId?: string;
}

// Round signed component dollar values so the DISPLAYED whole-dollar figures
// sum exactly to the displayed total: each part is rounded, then the largest
// part absorbs the ≤$2 float-rounding residual. Fixes the mock-meeting
// "$2K + $14K vs $15K" class of mismatch — one unrounded source, formatted
// once, and the cards visibly reconcile to the headline.
export function reconcileRounded(parts: number[], total: number): number[] {
  const rounded = parts.map(p => Math.round(p));
  const residual = Math.round(total) - rounded.reduce((s, p) => s + p, 0);
  if (residual !== 0 && rounded.length > 0) {
    let biggest = 0;
    rounded.forEach((p, i) => {
      if (Math.abs(p) > Math.abs(rounded[biggest])) biggest = i;
    });
    rounded[biggest] += residual;
  }
  return rounded;
}

interface TaxRates {
  federalStRate: number;
  federalLtRate: number;
  stateRate: number;
  combinedStRate: number;
  combinedLtRate: number;
  /** Combined ordinary rate WITHOUT NIIT — what deductions against wages actually save */
  combinedOrdinaryRate: number;
}

type UpdateInput = <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) => void;
type UpdateSettings = (updater: (prev: AdvancedSettings) => AdvancedSettings) => void;

interface MeetingModeProps {
  inputs: CalculatorInputs;
  results: CalculationResult;
  collateralOnlyResults: CalculationResult;
  taxRates: TaxRates;
  /**
   * Exit-tax analysis computed from `results` by the caller (D-003) — feeds
   * the step-up co-metric (D-018) on the screen and the printed one-pager
   * (D-021 export parity).
   */
  exitAnalysis: ExitTaxAnalysis;
  advancedSettings: AdvancedSettings;
  currentStrategy: Strategy | undefined;
  onExitMeetingMode: () => void;
  onPinScenario: () => void;
  canPin: boolean;
  onExport?: () => void;
  onUpdateInput: UpdateInput;
  onUpdateSettings: UpdateSettings;
}

// Dark-rail input styling (shared across select/input)
const railFieldStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${M.sidebarLine}`,
  borderRadius: 7,
  color: 'white',
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: M.sans,
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
};

const railLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: M.sidebarFaint,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 5,
};

// ═══ Slim left rail with active scenario + inline editing ═══
function Rail({
  collapsed,
  onToggle,
  onOpenFullCalculator,
  inputs,
  // currentStrategy was previously used for display; readouts now use
  // getEffectiveView(inputs) so split mode renders the blended view.
  currentStrategy: _currentStrategy,
  taxRates,
  results,
  advancedSettings,
  onUpdateInput,
  onUpdateSettings,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenFullCalculator: () => void;
  inputs: CalculatorInputs;
  currentStrategy: Strategy | undefined;
  taxRates: TaxRates;
  results: CalculationResult;
  advancedSettings: AdvancedSettings;
  onUpdateInput: UpdateInput;
  onUpdateSettings: UpdateSettings;
}) {
  const filingLabel =
    FILING_STATUSES.find(f => f.value === inputs.filingStatus)
      ?.label.replace('Married Filing Jointly', 'MFJ')
      .replace('Married Filing Separately', 'MFS')
      .replace('Head of Household', 'HOH') ?? inputs.filingStatus.toUpperCase();

  return (
    <aside
      style={{
        width: collapsed ? 64 : 300,
        flexShrink: 0,
        background: M.sidebar,
        color: M.sidebarInk,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: collapsed ? '18px 14px' : '18px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${M.sidebarLine}`,
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${M.accent}, #8b7cf6)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 800,
                fontSize: 14,
                boxShadow: '0 4px 12px rgba(79,70,229,0.35)',
              }}
            >
              E
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: -0.3 }}>
                EDI Calc
              </div>
              <div style={{ fontSize: 10.5, color: M.sidebarFaint, fontWeight: 500 }}>
                Meeting Mode
              </div>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand inputs' : 'Hide inputs'}
          style={{
            width: 28,
            height: 28,
            border: `1px solid ${M.sidebarLine}`,
            borderRadius: 6,
            background: '#141a29',
            cursor: 'pointer',
            color: M.sidebarInk,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d={collapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
          </svg>
        </button>
      </div>

      {collapsed ? (
        <div
          style={{
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {(
            [
              ['S', 'Strategy', true],
              ['P', 'Profile', false],
              ['A', 'Advanced', false],
            ] as const
          ).map(([k, t, active]) => (
            <div
              key={k}
              title={t}
              style={{
                width: 40,
                height: 40,
                borderRadius: 9,
                background: active ? M.accent : 'transparent',
                color: active ? 'white' : M.sidebarFaint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: active ? '0 4px 10px rgba(79,70,229,0.3)' : 'none',
              }}
            >
              {k}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: M.sidebarFaint,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginBottom: 10,
            }}
          >
            Active scenario
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: 'linear-gradient(160deg, rgba(79,70,229,0.18), rgba(79,70,229,0.04))',
              border: '1px solid rgba(79,70,229,0.25)',
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 8 }}>
              {(() => {
                const view = getEffectiveView(inputs);
                return view.displayName;
              })()}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontSize: 11.5,
              }}
            >
              <div>
                <div
                  style={{
                    color: M.sidebarFaint,
                    fontSize: 10,
                    marginBottom: 2,
                    letterSpacing: 0.4,
                  }}
                >
                  COLLATERAL
                </div>
                <div style={{ color: 'white', fontWeight: 600, fontFamily: M.mono }}>
                  {fmtCurrency(getEffectiveView(inputs).totalCollateral)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: M.sidebarFaint,
                    fontSize: 10,
                    marginBottom: 2,
                    letterSpacing: 0.4,
                  }}
                >
                  INCOME
                </div>
                <div style={{ color: 'white', fontWeight: 600, fontFamily: M.mono }}>
                  {fmtCurrency(inputs.annualIncome)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: M.sidebarFaint,
                    fontSize: 10,
                    marginBottom: 2,
                    letterSpacing: 0.4,
                  }}
                >
                  STATE · FILE
                </div>
                <div style={{ color: 'white', fontWeight: 600 }}>
                  {inputs.stateCode} · {filingLabel}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: M.sidebarFaint,
                    fontSize: 10,
                    marginBottom: 2,
                    letterSpacing: 0.4,
                  }}
                >
                  QFAF
                </div>
                <div
                  style={{
                    color: inputs.qfafEnabled ? '#a5f3cf' : '#fca5a5',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: inputs.qfafEnabled ? '#4ade80' : '#f87171',
                    }}
                  />
                  {inputs.qfafEnabled ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: M.sidebarFaint,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginBottom: 10,
            }}
          >
            Adjust scenario
          </div>

          {inputs.splitAllocation?.enabled === true &&
            (() => {
              const view = getEffectiveView(inputs);
              if (!view.isSplit) return null;
              return (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 10,
                    borderRadius: 8,
                    background: 'rgba(79,70,229,0.15)',
                    border: '1px solid rgba(79,70,229,0.35)',
                    fontSize: 11,
                    color: M.sidebarInk,
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'white', marginBottom: 4, fontSize: 11.5 }}>
                    Split allocation active
                  </div>
                  {view.legs.map(leg => (
                    <div
                      key={leg.strategy.id}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                    >
                      <span>
                        {leg.label}: {leg.strategy.name}
                      </span>
                      <span style={{ fontFamily: M.mono }}>{fmtCurrency(leg.amount)}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10,
                      fontStyle: 'italic',
                      color: M.sidebarFaint,
                    }}
                  >
                    Edit split details in the main calculator view. Controls below are not active in
                    split mode.
                  </div>
                </div>
              );
            })()}

          {/* Strategy */}
          <div style={{ marginBottom: 12 }}>
            <label style={railLabelStyle} htmlFor="mm-strategy">
              Strategy
            </label>
            <select
              id="mm-strategy"
              value={inputs.strategyId}
              onChange={e => onUpdateInput('strategyId', e.target.value)}
              style={railFieldStyle}
            >
              <optgroup label="Core (Cash Funded)">
                {STRATEGIES.filter(s => s.type === 'core').map(s => (
                  <option key={s.id} value={s.id} style={{ background: M.sidebar }}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Overlay (Appreciated Stock)">
                {STRATEGIES.filter(s => s.type === 'overlay').map(s => (
                  <option key={s.id} value={s.id} style={{ background: M.sidebar }}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Collateral */}
          <div style={{ marginBottom: 12 }}>
            <label style={railLabelStyle} htmlFor="mm-collateral">
              Collateral
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: M.sidebarFaint,
                  fontSize: 12.5,
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                $
              </span>
              <input
                id="mm-collateral"
                type="text"
                inputMode="numeric"
                value={formatWithCommas(inputs.collateralAmount)}
                onChange={e =>
                  onUpdateInput('collateralAmount', parseFormattedNumber(e.target.value))
                }
                style={{
                  ...railFieldStyle,
                  paddingLeft: 22,
                  fontFamily: M.mono,
                }}
              />
            </div>
          </div>

          {/* Income */}
          <div style={{ marginBottom: 12 }}>
            <label style={railLabelStyle} htmlFor="mm-income">
              Annual income
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: M.sidebarFaint,
                  fontSize: 12.5,
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                $
              </span>
              <input
                id="mm-income"
                type="text"
                inputMode="numeric"
                value={formatWithCommas(inputs.annualIncome)}
                onChange={e => onUpdateInput('annualIncome', parseFormattedNumber(e.target.value))}
                style={{
                  ...railFieldStyle,
                  paddingLeft: 22,
                  fontFamily: M.mono,
                }}
              />
            </div>
          </div>

          {/* State + Filing side-by-side */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div>
              <label style={railLabelStyle} htmlFor="mm-state">
                State
              </label>
              <select
                id="mm-state"
                value={inputs.stateCode}
                onChange={e => onUpdateInput('stateCode', e.target.value)}
                style={railFieldStyle}
              >
                {STATES.map(s => (
                  <option key={s.code} value={s.code} style={{ background: M.sidebar }}>
                    {s.code}
                  </option>
                ))}
                <option value="OTHER" style={{ background: M.sidebar }}>
                  Other
                </option>
              </select>
            </div>
            <div>
              <label style={railLabelStyle} htmlFor="mm-filing">
                Filing
              </label>
              <select
                id="mm-filing"
                value={inputs.filingStatus}
                onChange={e =>
                  onUpdateInput('filingStatus', e.target.value as CalculatorInputs['filingStatus'])
                }
                style={railFieldStyle}
              >
                {FILING_STATUSES.map(f => (
                  <option key={f.value} value={f.value} style={{ background: M.sidebar }}>
                    {f.value.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Projection years */}
          <div style={{ marginBottom: 12 }}>
            <label style={railLabelStyle} htmlFor="mm-years">
              Projection years
            </label>
            <select
              id="mm-years"
              value={advancedSettings.projectionYears}
              onChange={e => {
                const y = parseInt(e.target.value, 10);
                onUpdateSettings(prev => ({ ...prev, projectionYears: y }));
              }}
              style={railFieldStyle}
            >
              {[5, 7, 10, 15, 20].map(y => (
                <option key={y} value={y} style={{ background: M.sidebar }}>
                  {y} years
                </option>
              ))}
            </select>
          </div>

          {/* QFAF toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              marginBottom: 14,
              borderRadius: 7,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${M.sidebarLine}`,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12.5,
                color: M.sidebarInk,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: inputs.qfafEnabled ? '#4ade80' : '#f87171',
                }}
              />
              QFAF overlay
            </span>
            <input
              type="checkbox"
              checked={inputs.qfafEnabled}
              onChange={e => onUpdateInput('qfafEnabled', e.target.checked)}
              style={{ accentColor: M.accent, cursor: 'pointer' }}
            />
          </label>

          {/* Derived values shown as read-only tiles */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: M.sidebarFaint,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginBottom: 8,
            }}
          >
            Derived
          </div>
          {(
            [
              ['QFAF value', fmtCurrency(results.sizing.qfafValue), '#38bdf8'],
              ['Total exposure', fmtCurrency(results.sizing.totalExposure), '#60a5fa'],
              ['Combined ST', fmtPercent(taxRates.combinedStRate), '#fb7185'],
              ['Ordinary (deductions)', fmtPercent(taxRates.combinedOrdinaryRate), '#34d399'],
            ] as const
          ).map(([k, v, dot]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                marginBottom: 4,
                borderRadius: 7,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${M.sidebarLine}`,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: M.sidebarInk,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
                {k}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  color: 'white',
                  fontWeight: 600,
                  fontFamily: M.mono,
                }}
              >
                {v}
              </span>
            </div>
          ))}

          <button
            onClick={onOpenFullCalculator}
            style={{
              width: '100%',
              marginTop: 18,
              padding: '9px 12px',
              background: 'transparent',
              color: M.sidebarInk,
              border: `1px solid ${M.sidebarLine}`,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: M.sans,
            }}
          >
            Open full calculator →
          </button>
        </div>
      )}
    </aside>
  );
}

// Per-year tax mechanics for the breakdown chart (Level 02 / Detail view).
// Mirrors the same fields surfaced in the main calculator's year-by-year table.
export interface BreakdownPoint {
  y: number;
  // Positive contributions (stacked above zero):
  ordinaryLossBenefit: number;
  nolUsageBenefit: number;
  capitalLossBenefit: number;
  // Negative contributions (stacked below zero):
  ltGainCost: number;
  remainingStGainCost: number;
  // Net of all the above (matches YearResult.taxSavings).
  netSavings: number;
  // For the secondary panel — running NOL balance after this year.
  nolCarryforward: number;
}

// ═══ Year-by-year tax-mechanics breakdown — replaces the EDI-vs-baseline
//     chart in the Level 02 Detail view. Stacked bars per year decompose
//     net tax savings into its underlying benefits and costs, with the same
//     hover/click year-focus behavior as HeroChart so the existing DetailView
//     table continues to drive off the same yearIdx state.
function BenefitBreakdownChart({
  yearIdx,
  setYearIdx,
  data,
  note,
}: {
  yearIdx: number;
  setYearIdx: (i: number) => void;
  data: BreakdownPoint[];
  /** Optional one-line story note rendered under the legend (e.g. why the
   *  tail years show $0 new savings once the QFAF stops running). */
  note?: string;
}) {
  const W = 900;
  const H = 280;
  const pad = { l: 60, r: 30, t: 30, b: 56 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  // Determine the y-range. Positive max is the sum of stacked benefits;
  // negative min is the sum of stacked costs. When there is no real negative
  // activity, keep only a sliver below zero (room for the net-savings dots)
  // and skip negative axis ticks entirely so an epsilon-range never renders
  // as a "-$1" tick label.
  const stackedPos = data.map(
    d => d.ordinaryLossBenefit + d.nolUsageBenefit + d.capitalLossBenefit
  );
  const stackedNeg = data.map(d => d.ltGainCost + d.remainingStGainCost);
  const hasNegative = stackedNeg.some(v => v > 0.5) || data.some(d => d.netSavings < -0.5);
  const posMax = Math.max(...stackedPos, ...data.map(d => d.netSavings), 1);
  const negMax = hasNegative
    ? Math.max(...stackedNeg, -Math.min(...data.map(d => d.netSavings), 0), 1)
    : 0;
  const yTop = posMax * 1.12;
  const yBot = hasNegative ? -negMax * 1.12 : -posMax * 0.05;
  const range = yTop - yBot || 1;

  const ys = (v: number) => pad.t + plotH - ((v - yBot) / range) * plotH;

  // Bar geometry: small gap between bars, capped width for narrow data.
  const slot = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.min(36, slot * 0.62);
  const xCenter = (i: number) => pad.l + slot * (i + 0.5);

  // Hover/click: nearest bar by x. Same UX as HeroChart.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length === 0) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - pad.l;
    const i = Math.max(0, Math.min(data.length - 1, Math.floor(x / slot)));
    setYearIdx(i + 1);
  };

  // Axis ticks: horizontal grid lines. Negative ticks only exist when there
  // is real negative data (item 7c: no epsilon "-$1" labels).
  const tickValues = hasNegative ? [yTop, yTop / 2, 0, yBot / 2, yBot] : [yTop, yTop / 2, 0];

  // Active bar (1-indexed yearIdx; 0 means "no selection").
  const activeI = yearIdx > 0 ? Math.min(yearIdx - 1, data.length - 1) : -1;

  // Color tokens — match the rest of Meeting Mode's palette.
  const ordColor = M.accent; // ordinary loss benefit (primary blue/purple)
  const nolColor = '#8b7cf6'; // NOL usage benefit (lighter purple)
  const capColor = '#38bdf8'; // capital loss benefit (sky blue)
  const ltColor = '#dc2626'; // LT gain cost (red)
  const stColor = '#f59e0b'; // remaining ST gain cost (amber)
  const netColor = M.good; // net savings dot/line (green)

  return (
    <div>
      {/* Chart heading: matches the HeroChart heading style for parity. */}
      <div
        style={{
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: M.inkFaint,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            Year-by-year mechanics
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: M.ink, marginTop: 2 }}>
            What drives each year&rsquo;s tax savings
          </div>
        </div>
        <div style={{ fontSize: 13, color: M.inkSoft }}>
          Hover or click a bar to focus the table below.
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={onMove}
        onClick={onMove}
        onMouseLeave={() => setYearIdx(Math.min(1, data.length))}
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: 320,
          cursor: 'crosshair',
          display: 'block',
        }}
      >
        {/* Horizontal grid + axis labels */}
        {tickValues.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={ys(v)}
              y2={ys(v)}
              stroke={Math.abs(v) < 0.01 ? M.inkFaint : M.lineSoft}
              strokeWidth={Math.abs(v) < 0.01 ? 1.2 : 1}
              strokeDasharray={Math.abs(v) < 0.01 ? '0' : '3 4'}
            />
            <text
              x={pad.l - 8}
              y={ys(v) + 4}
              textAnchor="end"
              fontSize="10.5"
              fill={M.inkFaint}
              fontFamily={M.sans}
            >
              {fmtCurrency(Math.abs(v) < 0.5 ? 0 : v)}
            </text>
          </g>
        ))}

        {/* Bars: one stacked group per year. */}
        {data.map((d, i) => {
          const x = xCenter(i) - barW / 2;
          const isActive = i === activeI;
          const opacity = activeI === -1 || isActive ? 1 : 0.55;

          // Stack positive segments from zero upward (bottom of each segment
          // is the running positive total; visual bottom y is zero, top y
          // shrinks as we add).
          let posCum = 0;
          const posSegments: { value: number; color: string }[] = [
            { value: d.ordinaryLossBenefit, color: ordColor },
            { value: d.nolUsageBenefit, color: nolColor },
            { value: d.capitalLossBenefit, color: capColor },
          ];
          let negCum = 0;
          const negSegments: { value: number; color: string }[] = [
            { value: d.ltGainCost, color: ltColor },
            { value: d.remainingStGainCost, color: stColor },
          ];

          return (
            <g key={d.y} opacity={opacity}>
              {/* Positive stack */}
              {posSegments.map((seg, k) => {
                if (seg.value <= 0) return null;
                const yTopSeg = ys(posCum + seg.value);
                const yBotSeg = ys(posCum);
                posCum += seg.value;
                return (
                  <rect
                    key={k}
                    x={x}
                    y={yTopSeg}
                    width={barW}
                    height={Math.max(1, yBotSeg - yTopSeg)}
                    fill={seg.color}
                    rx={1.5}
                  />
                );
              })}

              {/* Negative stack */}
              {negSegments.map((seg, k) => {
                if (seg.value <= 0) return null;
                const yTopSeg = ys(-negCum);
                const yBotSeg = ys(-(negCum + seg.value));
                negCum += seg.value;
                return (
                  <rect
                    key={k}
                    x={x}
                    y={yTopSeg}
                    width={barW}
                    height={Math.max(1, yBotSeg - yTopSeg)}
                    fill={seg.color}
                    rx={1.5}
                  />
                );
              })}

              {/* Net savings marker */}
              <circle
                cx={x + barW / 2}
                cy={ys(d.netSavings)}
                r={isActive ? 5 : 4}
                fill="white"
                stroke={netColor}
                strokeWidth={2.5}
              />

              {/* Year label */}
              <text
                x={x + barW / 2}
                y={H - pad.b + 18}
                textAnchor="middle"
                fontSize="11"
                fontWeight={isActive ? 700 : 500}
                fill={isActive ? M.accent : M.inkSoft}
                fontFamily={M.sans}
              >
                Y{d.y}
              </text>

              {/* Net amount label above active bar */}
              {isActive && (
                <text
                  x={x + barW / 2}
                  y={ys(Math.max(d.netSavings, 0)) - 10}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight={700}
                  fill={M.ink}
                  fontFamily={M.sans}
                >
                  {fmtCurrency(d.netSavings)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          fontSize: 11.5,
          color: M.inkSoft,
          fontFamily: M.sans,
        }}
      >
        <LegendSwatch color={ordColor} label="Ordinary loss benefit" />
        <LegendSwatch color={nolColor} label="NOL usage benefit" />
        <LegendSwatch color={capColor} label="Capital loss benefit" />
        <LegendSwatch color={ltColor} label="LT gain cost" />
        <LegendSwatch color={stColor} label="Remaining ST gain cost" />
        <LegendSwatch color={netColor} label="Net savings" ring />
      </div>

      {/* Story note (mock-meeting review): explain the dead tail when the
          QFAF stops before the projection window ends. */}
      {note && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: M.inkSoft,
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  ring = false,
}: {
  color: string;
  label: string;
  ring?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: ring ? 10 : 12,
          height: ring ? 10 : 10,
          borderRadius: ring ? 999 : 2,
          background: ring ? 'white' : color,
          border: ring ? `2.5px solid ${color}` : 'none',
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

// ═══ Animated count-up ═══
// Count-up discipline (mock-meeting review): animate from $0 ONCE on mount;
// later value changes wait out a 300ms debounce, then animate from the
// currently displayed number to the new one in ≤400ms. Never replays from
// zero after mount, so the hero can't show a wrong number mid-keystroke.
// Values are rendered with the shared compact formatter so sub-$1M heroes
// read "$153K", never "$0.15M" — the same fmtCurrency the narrative uses.
function CountUp({ value, instant = false }: { value: number; instant?: boolean }) {
  const [display, setDisplay] = useState(instant ? value : 0);
  const displayRef = useRef(instant ? value : 0);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (instant) {
      mountedRef.current = true;
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    let raf = 0;
    let timer: number | undefined;
    const animate = (from: number, to: number, duration: number) => {
      const start = performance.now();
      const tick = (t: number) => {
        const p = duration <= 0 ? 1 : Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = from + (to - from) * eased;
        displayRef.current = v;
        setDisplay(v);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    if (!mountedRef.current) {
      mountedRef.current = true;
      animate(0, value, 1400);
    } else {
      timer = window.setTimeout(() => animate(displayRef.current, value, 400), 300);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [value, instant]);
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(display)}</span>;
}

type Level = 'high' | 'detail' | 'mechanics';

// ═══ Level switcher ═══
function LevelSwitch({ level, setLevel }: { level: Level; setLevel: (l: Level) => void }) {
  const levels: { k: Level; label: string; sub: string }[] = [
    { k: 'high', label: 'High level', sub: 'The story' },
    { k: 'detail', label: 'Detail', sub: 'Year-by-year' },
    { k: 'mechanics', label: 'Mechanics', sub: 'How it works' },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 4,
        background: 'white',
        border: `1px solid ${M.line}`,
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(11,16,32,0.04)',
      }}
    >
      {levels.map((l, i) => {
        const active = level === l.k;
        return (
          <button
            key={l.k}
            onClick={() => setLevel(l.k)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: 9,
              cursor: 'pointer',
              background: active ? M.ink : 'transparent',
              color: active ? 'white' : M.inkSoft,
              textAlign: 'left',
              fontFamily: M.sans,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>
              <span
                style={{
                  color: active ? 'rgba(255,255,255,0.55)' : M.inkFaint,
                  marginRight: 6,
                  fontFamily: M.mono,
                }}
              >
                0{i + 1}
              </span>
              {l.label}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: active ? 'rgba(255,255,255,0.65)' : M.inkFaint,
                marginTop: 1,
              }}
            >
              {l.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ═══ Detail view ═══
function DetailView({
  yearIdx,
  setYearIdx,
  yearData,
  totalTaxSavings,
  totalNol,
  finalPortfolio,
}: {
  yearIdx: number;
  setYearIdx: (i: number) => void;
  yearData: { y: number; save: number; nol: number; port: number }[];
  totalTaxSavings: number;
  totalNol: number;
  finalPortfolio: number;
}) {
  const cum = yearData.map((_, i) => yearData.slice(0, i + 1).reduce((s, a) => s + a.save, 0));
  const maxSave = Math.max(...yearData.map(y => Math.max(y.save, 0)), 1);

  return (
    <div>
      <div
        style={{
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: M.inkFaint,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            Detail view
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: M.ink, marginTop: 2 }}>
            Year-by-year breakdown
          </div>
        </div>
        <div style={{ fontSize: 13, color: M.inkSoft }}>
          Click any row to focus the chart above.
        </div>
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13.5,
          fontFamily: M.mono,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <thead>
          <tr>
            {['Year', 'Tax savings', 'Cumulative', 'NOL gen.', 'Portfolio', 'Savings bar'].map(
              (h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 0 ? 'left' : i === 5 ? 'left' : 'right',
                    padding: '10px 16px',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: M.inkFaint,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    borderBottom: `2px solid ${M.line}`,
                    fontFamily: M.sans,
                  }}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {yearData.map((y, i) => {
            const active = i + 1 === yearIdx;
            return (
              <tr
                key={y.y}
                onClick={() => setYearIdx(i + 1)}
                style={{
                  cursor: 'pointer',
                  background: active ? M.accentFaint : 'transparent',
                  borderLeft: active ? `3px solid ${M.accent}` : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.background = '#fafbfc';
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <td
                  style={{
                    padding: '10px 16px',
                    fontWeight: 700,
                    color: active ? M.accent : M.ink,
                    fontFamily: M.sans,
                  }}
                >
                  Year {y.y}
                </td>
                <td
                  style={{
                    padding: '10px 16px',
                    textAlign: 'right',
                    color: y.save >= 0 ? M.good : '#dc2626',
                    fontWeight: 700,
                  }}
                >
                  {fmtCurrencyFull(y.save)}
                </td>
                <td
                  style={{
                    padding: '10px 16px',
                    textAlign: 'right',
                    color: M.ink,
                    fontWeight: 600,
                  }}
                >
                  {fmtCurrencyFull(cum[i])}
                </td>
                <td
                  style={{
                    padding: '10px 16px',
                    textAlign: 'right',
                    color: M.inkSoft,
                  }}
                >
                  {fmtCurrencyFull(y.nol)}
                </td>
                <td
                  style={{
                    padding: '10px 16px',
                    textAlign: 'right',
                    color: M.ink,
                  }}
                >
                  {fmtCurrencyFull(y.port)}
                </td>
                <td style={{ padding: '10px 16px', width: 220 }}>
                  <div
                    style={{
                      height: 8,
                      background: M.lineSoft,
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(0, (y.save / maxSave) * 100)}%`,
                        background: `linear-gradient(90deg, ${M.accent}, #8b7cf6)`,
                        borderRadius: 4,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {/* Each td carries an explicit transparent background inline: the
              app-global `tfoot td { background: var(--bg) }` rule otherwise
              paints light cells over this dark row (white-on-white totals).
              Inline style outranks the global rule without changing it. */}
          <tr style={{ background: M.ink, color: 'white' }}>
            <td
              style={{
                padding: '16px 16px',
                fontWeight: 800,
                fontSize: 13.5,
                fontFamily: M.sans,
                color: 'white',
                background: 'transparent',
              }}
            >
              {yearData.length}-year total
            </td>
            <td
              style={{
                padding: '16px 16px',
                textAlign: 'right',
                fontWeight: 800,
                fontSize: 14,
                color: '#86efac',
                background: 'transparent',
              }}
            >
              {fmtCurrencyFull(totalTaxSavings)}
            </td>
            <td
              style={{
                padding: '16px 16px',
                textAlign: 'right',
                fontWeight: 800,
                fontSize: 14,
                color: 'white',
                background: 'transparent',
              }}
            >
              {fmtCurrencyFull(totalTaxSavings)}
            </td>
            <td
              style={{
                padding: '16px 16px',
                textAlign: 'right',
                fontWeight: 700,
                fontSize: 14,
                color: '#f1f5f9',
                background: 'transparent',
              }}
            >
              {fmtCurrencyFull(totalNol)}
            </td>
            <td
              style={{
                padding: '16px 16px',
                textAlign: 'right',
                fontWeight: 800,
                fontSize: 14,
                color: 'white',
                background: 'transparent',
              }}
            >
              {fmtCurrencyFull(finalPortfolio)}
            </td>
            <td
              style={{
                padding: '16px 16px',
                color: '#86efac',
                fontSize: 11.5,
                fontWeight: 700,
                fontFamily: M.sans,
                letterSpacing: 0.3,
                background: 'transparent',
              }}
            >
              Cumulative advantage
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ═══ Mechanics view ═══
// ═══ Print page chrome (header + footer) — only rendered when printMode is on
//     so the on-screen layout is unaffected. Each page gets the same scenario
//     summary up top and a page-of-3 pager + disclaimer at the bottom for a
//     consistent, professional feel across the printed handout.
function PrintPageHeader({
  pageNumber,
  scenarioLine,
  rangeLabel,
}: {
  pageNumber: 1 | 2 | 3;
  scenarioLine: string;
  rangeLabel: string;
}) {
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingBottom: 10,
        marginBottom: 22,
        borderBottom: `1.5px solid ${M.ink}`,
        fontFamily: M.sans,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: M.ink,
            letterSpacing: -0.2,
          }}
        >
          EDI Calc
        </span>
        <span style={{ fontSize: 11, color: M.inkFaint, fontWeight: 600 }}>
          Tax Strategy Projection · {rangeLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontSize: 11, color: M.inkSoft }}>{scenarioLine}</span>
        <span
          style={{
            fontSize: 11,
            color: M.inkFaint,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {today}
        </span>
        <span
          style={{
            fontSize: 10.5,
            color: M.inkFaint,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Page {pageNumber} of 3
        </span>
      </div>
    </div>
  );
}

function PrintPageFooter() {
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 8,
        borderTop: `1px solid ${M.line}`,
        fontSize: 7,
        color: M.inkFaint,
        lineHeight: 1.35,
        fontFamily: M.sans,
      }}
    >
      <strong>Important disclosures.</strong> This is a hypothetical illustration for discussion
      purposes only — not investment, tax, or legal advice, and not an offer of any security.
      Estimates do not reflect advisory fees, financing costs, tracking error, transaction costs, or
      behavioral effects; actual results will vary. Tax-loss harvesting reduces cost basis: a
      portion of projected savings is tax deferral that becomes due if the portfolio is liquidated
      (it may become permanent via basis step-up at death or charitable transfer). Ordinary loss
      deductions are limited by IRC §461(l) ($512K MFJ / $256K others, 2026); excess becomes an NOL
      usable against up to 80% of future taxable income. Projections assume 0–15% of harvested
      losses are disallowed as wash sales and that the QFAF (Quantinno Fundamental Arbitrage Fund)
      qualifies for the modeled tax treatment under current IRS guidance, which may change. State
      treatment varies — CA, NY, PA, NJ, MA, and WA differ materially from the federal rules modeled
      here. Consult qualified tax, legal, and investment advisors before acting. Past performance
      does not guarantee future results.
    </div>
  );
}

function MechanicsView({
  ediMode,
  inputs,
  settings,
  visibleYears,
  qfafValue,
  totalExposure,
  totalNol,
  totalTaxSavings,
  cfReserveBalance,
  lossReserve,
  taxRates,
  currentStrategy,
  filingLabel,
}: {
  ediMode: boolean;
  inputs: CalculatorInputs;
  settings: AdvancedSettings;
  visibleYears: YearResult[];
  qfafValue: number;
  totalExposure: number;
  totalNol: number;
  totalTaxSavings: number;
  cfReserveBalance: number;
  lossReserve: number;
  taxRates: TaxRates;
  currentStrategy: Strategy | undefined;
  filingLabel: string;
}) {
  const strategyLabel = currentStrategy?.name ?? 'Overlay strategy';
  const totalStLossesHarvested = visibleYears.reduce((s, y) => s + y.stLossesHarvested, 0);
  // EDI mode (QFAF off): no QFAF, no ordinary losses, no NOL — the story is
  // harvest → carryforward reserve → shelter. Showing "Establish QFAF /
  // QFAF VALUE $0 / NOL GENERATED $0" here was a mock-meeting credibility
  // failure; branch like the high level already does.
  const steps = ediMode
    ? [
        {
          n: 1,
          title: 'Harvest losses systematically',
          tone: M.accent,
          body: `The long/short ${strategyLabel} overlay realizes short-term losses on constituent positions while maintaining benchmark-like exposure. No QFAF is used in this mode, so there are no ordinary-loss deductions or NOL.`,
          metric: fmtCurrency(totalStLossesHarvested),
          metricLabel: 'ST losses harvested',
        },
        {
          n: 2,
          title: 'Losses bank as carryforwards',
          tone: '#8b7cf6',
          body: 'Harvested losses not used against gains in the year realized are banked, not spent — capital-loss carryforwards persist indefinitely during life and build a reserve year over year.',
          metric: fmtCurrency(cfReserveBalance),
          metricLabel: 'CF reserve balance',
        },
        {
          n: 3,
          title: 'The reserve shelters future gains',
          tone: '#f59e0b',
          body: 'The carryforward reserve offsets future capital gains — a business sale, concentrated-stock exit, or portfolio transition — plus up to $3,000 of ordinary income per year. Its shelter value is contingent on those gains being realized.',
          metric: fmtCurrency(lossReserve),
          metricLabel: 'Contingent shelter value',
        },
        {
          n: 4,
          title: 'Realized savings accrue',
          tone: M.good,
          body: 'Realized savings in this mode come from gains actually offset and the small annual ordinary-income deduction — modest by design while the reserve compounds.',
          metric: fmtCurrency(totalTaxSavings),
          metricLabel: 'Est. realized savings',
        },
      ]
    : [
        {
          n: 1,
          title: 'Establish QFAF',
          tone: M.accent,
          body: 'A Quantinno Fundamental Arbitrage Fund (QFAF) overlay would be structured against collateral, designed to give exposure without a taxable sale of the underlying. Tax treatment depends on fund qualification and current IRS guidance.',
          metric: fmtCurrency(qfafValue),
          metricLabel: 'QFAF value',
        },
        {
          n: 2,
          title: 'Direct-indexing overlay',
          tone: '#8b7cf6',
          body: `A long/short ${strategyLabel} overlay harvests losses on constituent positions while maintaining benchmark-like exposure.`,
          metric: fmtCurrency(totalExposure),
          metricLabel: 'Total exposure',
        },
        {
          n: 3,
          title: 'Loss harvesting generates NOL',
          tone: '#f59e0b',
          body: `Realized short-term losses offset high-tax ordinary income first (combined ${fmtPercent1(taxRates.combinedOrdinaryRate)} ordinary rate), with the balance carried forward as NOL.`,
          metric: fmtCurrency(totalNol),
          metricLabel: 'NOL generated',
        },
        {
          n: 4,
          title: 'Tax savings compound',
          tone: M.good,
          body: 'Estimated tax savings, if reinvested, can compound over time — potentially adding to after-tax results vs. standard direct indexing.',
          metric: fmtCurrency(totalTaxSavings),
          metricLabel: 'Est. cumulative savings',
        },
      ];

  // ─── "For your CPA" content (mock-meeting review, 4b) ───
  // Plain-language versions of claims the app already makes in
  // popupContent.ts ('qfaf-treatment', 'section-461-limit') and the print
  // disclosure — no new tax positions.
  const limit461 = settings.section461Limits[inputs.filingStatus];
  const year1OrdinaryGenerated = visibleYears[0]?.ordinaryLossesGenerated ?? 0;
  const capBinds = !ediMode && year1OrdinaryGenerated > limit461 + 0.5;
  const nolPct = `${Math.round(settings.nolOffsetLimit * 100)}%`;
  const washRate = settings.washSaleDisallowanceRate;
  const stateNote = getQuantifiedStateWarning(inputs.stateCode, taxRates.stateRate, visibleYears);

  const cpaItems: { heading: string; body: string }[] = [
    ediMode
      ? {
          heading: 'Character of losses',
          body:
            'Harvested losses are capital losses: they first offset realized capital gains, then up to ' +
            '$3,000 per year of ordinary income (§1211(b)). The unused balance carries forward ' +
            'indefinitely during life (§1212); it is lost at death — see the step-up comparison.',
        }
      : {
          heading: 'Why the losses are ordinary (§475(f))',
          body:
            'The QFAF is modeled as a limited partnership engaged in high-turnover arbitrage trading ' +
            'that has made a mark-to-market election under IRC §475(f). Under that election the ' +
            "fund's trading losses are ordinary in character and generally non-passive, which is why " +
            'they can offset W-2 and other ordinary income. This treatment is a working draft pending ' +
            "counsel review — verify the actual fund's structure, elections, and tax opinions before " +
            'relying on it.',
        },
    ...(!ediMode
      ? [
          {
            heading: 'The §461(l) cap',
            body: capBinds
              ? `Year 1 ordinary deduction capped at ${fmtCurrencyFull(limit461)} (${filingLabel}) ` +
                `under §461(l); the remaining ${fmtCurrencyFull(year1OrdinaryGenerated - limit461)} ` +
                `of year-1 ordinary losses becomes an NOL usable against up to ${nolPct} of future ` +
                'taxable income.'
              : `The §461(l) excess-business-loss cap (${fmtCurrencyFull(limit461)} ${filingLabel}, ` +
                '2026) does not bind in this projection — modeled ordinary losses stay within the ' +
                `cap. Any excess would become an NOL usable against up to ${nolPct} of future ` +
                'taxable income.',
          },
        ]
      : []),
    {
      heading: 'Wash-sale assumption',
      body:
        washRate > 0
          ? `${fmtPercent1(washRate)} of harvested losses are assumed disallowed as wash sales ` +
            '(§1091) and excluded from the modeled benefits.'
          : 'This projection assumes 0% of harvested losses are disallowed as wash sales (§1091) — ' +
            'i.e., replacement positions avoid substantially identical securities. Actual ' +
            'disallowance depends on trading.',
    },
    ...(stateNote ? [{ heading: `State treatment (${inputs.stateCode})`, body: stateNote }] : []),
  ];

  const cpaBody = (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {cpaItems.map(item => (
        <div key={item.heading} style={{ fontSize: 12.5, lineHeight: 1.55, color: M.inkSoft }}>
          <strong style={{ color: M.ink }}>{item.heading}.</strong> {item.body}
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 12,
            color: M.inkFaint,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          Mechanics view
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: M.ink, marginTop: 2 }}>
          How the strategy works
        </div>
        <div style={{ fontSize: 13.5, color: M.inkSoft, marginTop: 4 }}>
          Four steps, in order — use this to walk a prospect through the mechanics.
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: 31,
            top: 31,
            bottom: 31,
            width: 2,
            background: `linear-gradient(180deg, ${M.accent}, #8b7cf6, #f59e0b, ${M.good})`,
          }}
        />

        {steps.map((s, i) => (
          <div
            key={s.n}
            style={{
              display: 'flex',
              gap: 20,
              marginBottom: i < steps.length - 1 ? 24 : 0,
              position: 'relative',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 64,
                height: 64,
                borderRadius: 16,
                background: s.tone,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 22,
                boxShadow: `0 6px 18px ${s.tone}55`,
                zIndex: 2,
              }}
            >
              {s.n}
            </div>
            <div
              style={{
                flex: 1,
                padding: '16px 20px',
                background: 'white',
                border: `1px solid ${M.line}`,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 24,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: M.ink,
                    letterSpacing: -0.2,
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: M.inkSoft,
                    marginTop: 4,
                    lineHeight: 1.55,
                  }}
                >
                  {s.body}
                </div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  textAlign: 'right',
                  paddingLeft: 24,
                  borderLeft: `1px solid ${M.lineSoft}`,
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    color: M.inkFaint,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {s.metricLabel}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: s.tone,
                    fontFamily: M.mono,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: -0.5,
                  }}
                >
                  {s.metric}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 20,
          background: M.accentFaint,
          borderRadius: 12,
          border: `1px solid ${M.accentSoft}`,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: M.accentDeep,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          The tax math
        </div>
        <div
          style={{
            // 6 tiles: 3×2 so the last tile isn't an orphan (4c).
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 18,
          }}
        >
          {(
            [
              ['Fed ST', fmtPercent(taxRates.federalStRate), false],
              ['Fed LT', fmtPercent(taxRates.federalLtRate), false],
              ['State', fmtPercent(taxRates.stateRate), false],
              ['Combined ST', fmtPercent(taxRates.combinedStRate), true],
              ['Ordinary (deductions)', fmtPercent(taxRates.combinedOrdinaryRate), true],
              ['Combined LT', fmtPercent(taxRates.combinedLtRate), true],
            ] as const
          ).map(([k, v, h]) => (
            <div key={k}>
              <div
                style={{
                  fontSize: 11,
                  color: M.inkFaint,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {k}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: h ? M.accent : M.ink,
                  fontFamily: M.mono,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── For your CPA (4b) ─── Collapsible on screen; the print handout
          renders the expanded variant instead (page 3, verified to still
          paginate at exactly 3 sheets). Visibility is swapped via the
          .mm-cpa-details / .mm-cpa-print-expanded rules in index.css. */}
      <details
        className="mm-cpa-details"
        style={{
          marginTop: 20,
          padding: '14px 18px',
          background: 'white',
          borderRadius: 12,
          border: `1px solid ${M.line}`,
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
            color: M.ink,
            letterSpacing: 0.2,
          }}
        >
          For your CPA — character, limits, and assumptions
        </summary>
        {cpaBody}
      </details>
      <div
        className="mm-cpa-print-expanded"
        style={{
          marginTop: 20,
          padding: '14px 18px',
          background: 'white',
          borderRadius: 12,
          border: `1px solid ${M.line}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: M.ink, letterSpacing: 0.2 }}>
          For your CPA — character, limits, and assumptions
        </div>
        {cpaBody}
      </div>
    </div>
  );
}

// ═══ Main MeetingMode ═══
export function MeetingMode({
  inputs,
  results,
  // collateralOnlyResults was used to draw the EDI-vs-baseline comparison; the
  // Meeting Mode page now focuses on the strategy's own tax mechanics, so the
  // baseline series is no longer rendered here. Kept in the prop signature for
  // call-site compatibility.
  collateralOnlyResults: _collateralOnlyResults,
  taxRates,
  exitAnalysis,
  advancedSettings,
  currentStrategy,
  onExitMeetingMode,
  // Pin Scenario stays unwired until D-024 (Wave B). The dead button (with
  // its lying "Pin limit reached" tooltip) is hidden entirely until then;
  // props are kept so call sites don't churn when it's wired for real.
  onPinScenario: _onPinScenario,
  canPin: _canPin,
  onExport,
  onUpdateInput,
  onUpdateSettings,
}: MeetingModeProps) {
  const [level, setLevel] = useState<Level>('high');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [showDecomp, setShowDecomp] = useState(true);
  // Print one-pager state. When true, the page renders all three level sections
  // stacked (with page breaks) instead of just the active level, hides the
  // editing rail and on-screen controls, and triggers window.print().
  const [printMode, setPrintMode] = useState(false);

  // core.ts may return more years than projectionYears (wind-down continues until
  // carryforwards exhausted). Cap the view to what the user actually asked for.
  const projectionYears = advancedSettings.projectionYears;

  // Calendar dates for prospect-facing copy. Strategy starts at startMonth of
  // the current calendar year and runs `projectionYears` operating years;
  // the year shown in copy is the last calendar year that contains strategy
  // activity (= startYear + projectionYears − 1 for January starts; one
  // higher for partial-year starts since the trailing partial calendar year
  // still has activity).
  const startYear = new Date().getFullYear();
  const isPartialStart = (inputs.startMonth ?? 1) > 1;
  const endYear = startYear + projectionYears - 1 + (isPartialStart ? 1 : 0);
  const projectionRangeLabel = `${startYear}–${endYear}`;
  const visibleYears = useMemo(
    () => results.years.slice(0, projectionYears),
    [results.years, projectionYears]
  );

  // Build year-by-year chart data from real results, bounded to projectionYears
  const detailYearData = useMemo(
    () =>
      visibleYears.map(y => ({
        y: y.year,
        save: y.taxSavings,
        nol: y.excessToNol,
        port: y.totalValue,
      })),
    [visibleYears]
  );

  // Year-by-year benefit/cost decomposition for the new BenefitBreakdownChart.
  // Mirrors the same numbers surfaced in the main calculator's year-by-year
  // table (ordinary loss / NOL usage / capital loss / LT gain cost / etc).
  const breakdownData: BreakdownPoint[] = useMemo(
    () =>
      visibleYears.map(y => ({
        y: y.year,
        ordinaryLossBenefit: y.ordinaryLossBenefit,
        nolUsageBenefit: y.nolUsageBenefit,
        capitalLossBenefit: y.capitalLossBenefit,
        ltGainCost: y.ltGainCost,
        remainingStGainCost: y.remainingStGainCost,
        netSavings: y.taxSavings,
        nolCarryforward: y.nolCarryforward,
      })),
    [visibleYears]
  );

  // Bound summary figures to the user's projection window so labels ("over N
  // years") agree with the numbers shown — core.ts keeps running the sim past
  // projectionYears during QFAF wind-down, which we don't want to surface here.
  const totalTaxSavings = useMemo(
    () => visibleYears.reduce((s, y) => s + y.taxSavings, 0),
    [visibleYears]
  );
  // Effective collateral: total of both legs in split mode, single amount otherwise.
  const effectiveCollateral = useMemo(() => getEffectiveView(inputs).totalCollateral, [inputs]);
  const finalPortfolio = visibleYears[visibleYears.length - 1]?.totalValue ?? effectiveCollateral;
  // Total NOL generated over the program (the final-year *balance* is often $0
  // once the NOL has been consumed, which made these labels read "$0 of NOL").
  const totalNol = results.summary.totalNolGenerated;
  // EDI-only mode (D-015): with QFAF off the story is the carryforward
  // shield, not ordinary-loss deductions/NOL — realized savings and the loss
  // reserve are presented co-equally, with the reserve labeled contingent.
  const ediMode = !inputs.qfafEnabled;
  const lossReserve = results.summary.lossReserveShelterValue;
  const cfReserveBalance =
    results.summary.finalStCarryforward + results.summary.finalLtCarryforward;
  // Step-up co-metric (D-018) + EDI economics (D-014) for the printed
  // handout (D-021): same pure post-processing of core outputs the
  // Workspace uses — one engine, one set of numbers.
  const stepUp = useMemo(
    () => computeStepUpComparison(results, exitAnalysis),
    [results, exitAnalysis]
  );
  const insights = useMemo(() => computeEdiInsights(results), [results]);

  // Year focus defaults to Year 1 — the start of the story — not the final
  // (often $0 wind-down) year (mock-meeting review, 7b).
  const [yearIdx, setYearIdx] = useState(breakdownData.length > 0 ? 1 : 0);
  useEffect(() => {
    // When years change (e.g. projection years change), clamp index.
    setYearIdx(idx => Math.min(idx, breakdownData.length));
  }, [breakdownData.length]);

  // Hide the app chrome (tab bar incl. the theme toggle) while Meeting Mode
  // is mounted — on screen, not just in print (mock-meeting review, 7a).
  // Reversible: the class is removed on unmount (Esc / Exit both unmount).
  useEffect(() => {
    document.body.classList.add('meeting-mode-active');
    return () => document.body.classList.remove('meeting-mode-active');
  }, []);

  // Esc exits meeting mode. Listening at document level so it works regardless
  // of which child element has focus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExitMeetingMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onExitMeetingMode]);

  // Print one-pager: when printMode flips on, give the DOM a beat to settle
  // (we render all three levels stacked + hide the rail), then open the print
  // dialog. Any exit path from the dialog (cancel or finish) fires `afterprint`,
  // which restores the on-screen view.
  useEffect(() => {
    if (!printMode) return;
    const restore = () => setPrintMode(false);
    window.addEventListener('afterprint', restore);
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.removeEventListener('afterprint', restore);
      window.clearTimeout(t);
    };
  }, [printMode]);

  // ─── "How we get to {headline}" strip (D-022) ───
  //
  // QFAF mode: decompose BY BENEFIT TYPE using the engine's own per-year
  // fields — ordinary-loss benefit + NOL usage benefit + capital-loss
  // benefit − gains & costs — which sums EXACTLY to the headline and
  // matches the chart legend. (The old Year-1 + Years-2..N + NOL strip
  // double-counted NOL, showing $3.42M of cards under a $2.34M headline.)
  //
  // EDI mode: realized savings split Year 1 vs Years 2..N from the SAME
  // unrounded source (so the cards reconcile to the realized total), plus
  // the contingent loss-reserve tile (excluded from the realized bar) and,
  // when growth is on, an informational reinvestment tile.
  //
  // Card figures are whole-dollar and reconciled (reconcileRounded) so the
  // displayed numbers visibly sum to the displayed total.
  const decomp = useMemo((): {
    cards: DecompCard[];
    equation: string;
    displayTotal: number;
    totalLabel: string;
    subLabel: string;
  } => {
    if (!ediMode) {
      const d = computeBenefitDecomposition(visibleYears);
      const hasCosts = d.gainAndOtherCosts > 0.5;
      const [rOrd, rNol, rCap, rCostsNeg] = reconcileRounded(
        [d.ordinaryLossBenefit, d.nolUsageBenefit, d.capitalLossBenefit, -d.gainAndOtherCosts],
        d.total
      );
      const rCosts = -rCostsNeg;
      const cards: DecompCard[] = [
        {
          stepLabel: 'Step 1',
          label: 'Ordinary-loss benefit',
          display: fmtCurrencyFull(rOrd),
          color: M.accent,
          note: `§461(l)-allowed ordinary deductions against income, valued at the ${fmtPercent1(
            taxRates.combinedOrdinaryRate
          )} combined ordinary rate`,
          inBar: true,
          barFlex: Math.max(0, d.ordinaryLossBenefit),
          testId: 'decomp-benefit-value',
        },
        {
          stepLabel: 'Step 2',
          label: 'NOL usage benefit',
          display: fmtCurrencyFull(rNol),
          color: '#8b7cf6',
          note: `From ${fmtCurrency(totalNol)} of NOL generated, deducted against later years' taxable income`,
          inBar: true,
          barFlex: Math.max(0, d.nolUsageBenefit),
          testId: 'decomp-benefit-value',
        },
        {
          stepLabel: 'Step 3',
          label: 'Capital-loss benefit',
          display: fmtCurrencyFull(rCap),
          color: '#38bdf8',
          note: 'Capital-loss carryforwards deducted against ordinary income ($3,000/yr, §1211(b))',
          inBar: true,
          barFlex: Math.max(0, d.capitalLossBenefit),
          testId: 'decomp-benefit-value',
        },
      ];
      if (hasCosts) {
        cards.push({
          stepLabel: 'Less',
          label: 'Gains & costs',
          display: fmtCurrencyFull(rCosts),
          color: '#dc2626',
          note: 'LT gains realized by the strategy plus any unoffset ST gains, taxed at statutory rates — already subtracted from the headline',
          inBar: false,
          barFlex: 0,
          testId: 'decomp-cost-value',
        });
      }
      const benefits = `${fmtCurrencyFull(rOrd)} + ${fmtCurrencyFull(rNol)} + ${fmtCurrencyFull(rCap)}`;
      return {
        cards,
        equation: hasCosts ? `${benefits} − ${fmtCurrencyFull(rCosts)}` : benefits,
        displayTotal: rOrd + rNol + rCap - rCosts,
        totalLabel: 'total est. savings',
        subLabel: '— benefit components that sum to the headline, net of costs',
      };
    }

    // EDI mode (QFAF off)
    const year1 = visibleYears[0]?.taxSavings ?? 0;
    const [rY1, rRest] = reconcileRounded([year1, totalTaxSavings - year1], totalTaxSavings);
    const r = advancedSettings.growthEnabled ? advancedSettings.defaultAnnualReturn : 0;
    const N = visibleYears.length;
    const futureValue = visibleYears.reduce(
      (s, y, i) => s + y.taxSavings * Math.pow(1 + r, N - (i + 1)),
      0
    );
    const compoundingBonus = Math.max(0, futureValue - totalTaxSavings);
    const cards: DecompCard[] = [
      {
        stepLabel: 'Step 1',
        label: 'Year 1 harvest',
        display: fmtCurrencyFull(rY1),
        color: M.accent,
        note: 'First-year net savings: harvested losses offsetting gains plus the $3,000 ordinary-income deduction',
        inBar: true,
        barFlex: Math.max(0, year1),
        testId: 'decomp-benefit-value',
      },
      {
        stepLabel: 'Step 2',
        label: `Years 2–${N} harvest`,
        display: fmtCurrencyFull(rRest),
        color: '#8b7cf6',
        note: 'Net savings across the remaining years as harvesting continues',
        inBar: true,
        barFlex: Math.max(0, totalTaxSavings - year1),
        testId: 'decomp-benefit-value',
      },
      {
        // EDI-only: no NOL exists — the third force is the CF reserve.
        // Contingent value, so it stays OUT of the realized-savings bar.
        stepLabel: 'Step 3',
        label: 'Loss reserve built',
        display: fmtCurrency(lossReserve),
        color: '#f59e0b',
        note: `${fmtCurrency(cfReserveBalance)} of loss carryforwards held in reserve — contingent shelter for future gains, not counted in the realized total`,
        inBar: false,
        barFlex: 0,
      },
    ];
    if (r > 0) {
      // Informational only (different total) — hidden entirely when growth
      // is off rather than telling the client to go enable a setting.
      cards.push({
        stepLabel: 'Step 4',
        label: 'With reinvestment',
        display: fmtCurrency(futureValue),
        color: M.good,
        note: `Each year's savings reinvested at ${fmtPercent1(r)} grows to ${fmtCurrency(
          futureValue
        )} by ${endYear} — a ${fmtCurrency(compoundingBonus)} gain on top of the ${fmtCurrency(totalTaxSavings)} of un-invested savings.`,
        inBar: false,
        barFlex: 0,
      });
    }
    return {
      cards,
      equation: `${fmtCurrencyFull(rY1)} + ${fmtCurrencyFull(rRest)}`,
      displayTotal: rY1 + rRest,
      totalLabel: 'realized savings',
      subLabel: '— realized savings, plus the contingent reserve',
    };
  }, [
    totalTaxSavings,
    totalNol,
    ediMode,
    lossReserve,
    cfReserveBalance,
    visibleYears,
    taxRates.combinedOrdinaryRate,
    advancedSettings.growthEnabled,
    advancedSettings.defaultAnnualReturn,
    endYear,
  ]);

  // Story coherence (mock-meeting review, 5): when the QFAF stops before the
  // projection window ends and the tail years show no meaningful new
  // savings, say why — otherwise the chart/table read as "the strategy
  // stopped working in year 6".
  const qfafTailNote = useMemo(() => {
    if (ediMode) return undefined;
    const d = inputs.qfafDuration;
    if (!d || d <= 0 || d >= visibleYears.length) return undefined;
    const tailSavings = visibleYears.slice(d).reduce((s, y) => s + y.taxSavings, 0);
    if (Math.abs(tailSavings) > Math.max(1, Math.abs(totalTaxSavings) * 0.02)) return undefined;
    return `The fund runs ${d} years, so savings concentrate in years 1–${d}; years ${
      d + 1
    }–${visibleYears.length} run off the remaining carryforwards and NOL rather than generating new losses, which is why they show little or no new savings.`;
  }, [ediMode, inputs.qfafDuration, visibleYears, totalTaxSavings]);

  const filingLabel =
    FILING_STATUSES.find(f => f.value === inputs.filingStatus)
      ?.label.replace('Married Filing Jointly', 'MFJ')
      .replace('Married Filing Separately', 'MFS')
      .replace('Head of Household', 'HOH') ?? inputs.filingStatus.toUpperCase();

  // Compact scenario summary used in the print header on every page so each
  // sheet stands alone.
  const printScenarioLine = `${getEffectiveView(inputs).displayName} · ${fmtCurrency(
    getEffectiveView(inputs).totalCollateral
  )} · ${inputs.stateCode} ${filingLabel}`;

  const levelSubheadingStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: M.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  };

  return (
    <div
      className={printMode ? 'meeting-mode-print' : undefined}
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: M.bg,
        color: M.ink,
        fontFamily: M.sans,
      }}
    >
      {!printMode && (
        <Rail
          collapsed={railCollapsed}
          onToggle={() => setRailCollapsed(!railCollapsed)}
          onOpenFullCalculator={onExitMeetingMode}
          inputs={inputs}
          currentStrategy={currentStrategy}
          taxRates={taxRates}
          results={results}
          advancedSettings={advancedSettings}
          onUpdateInput={onUpdateInput}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      <main style={{ flex: 1, overflow: 'auto' }}>
        <header
          style={{
            padding: '14px 32px',
            background: 'white',
            borderBottom: `1px solid ${M.line}`,
            display: printMode ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <LevelSwitch level={level} setLevel={setLevel} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                border: `1px solid ${M.line}`,
                borderRadius: 8,
                background: showDecomp ? M.accentFaint : 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: showDecomp ? M.accent : M.inkSoft,
              }}
            >
              <input
                type="checkbox"
                checked={showDecomp}
                onChange={e => setShowDecomp(e.target.checked)}
                style={{ accentColor: M.accent, cursor: 'pointer' }}
              />
              Show breakdown
            </label>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: M.goodSoft,
                color: M.good,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: M.good }} /> LIVE
            </div>
            {/* Pin Scenario button intentionally absent: it was hard-wired
                dead with a misleading tooltip. D-024 (Wave B) wires pinning
                for real and brings the button back. */}
            <button
              onClick={() => {
                if (onExport) onExport();
                else setPrintMode(true);
              }}
              style={{
                padding: '8px 14px',
                background: M.ink,
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Export one-pager
            </button>
            <button
              onClick={onExitMeetingMode}
              title="Return to the full calculator (Esc)"
              style={{
                padding: '8px 14px',
                background: 'white',
                color: M.inkSoft,
                border: `1px solid ${M.line}`,
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Exit Meeting Mode
            </button>
          </div>
        </header>

        <div style={{ padding: '32px 36px', maxWidth: 1280, margin: '0 auto' }}>
          {(level === 'high' || printMode) && (
            <div className={printMode ? 'meeting-mode-print-page' : undefined} data-print-page="1">
              {printMode && (
                <PrintPageHeader
                  pageNumber={1}
                  scenarioLine={printScenarioLine}
                  rangeLabel={projectionRangeLabel}
                />
              )}
              <div style={{ marginBottom: 28 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: M.accent,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    Your projection · {projectionRangeLabel}
                  </span>
                  <span style={{ width: 40, height: 1, background: M.accent }} />
                  <span style={{ fontSize: 12, color: M.inkFaint }}>
                    {currentStrategy?.name ?? 'Strategy'} · {inputs.stateCode} · {filingLabel}
                  </span>
                </div>
                <h1
                  style={{
                    margin: 0,
                    // Smaller H1 in print so the headline + paragraph + KPIs
                    // + decomposition fit on a single Letter/A4 page.
                    fontSize: printMode ? 36 : 56,
                    fontWeight: 800,
                    letterSpacing: -2,
                    color: M.ink,
                    lineHeight: 1.05,
                  }}
                >
                  {ediMode ? (
                    <>
                      <span style={{ color: M.accent }}>
                        <CountUp value={totalTaxSavings} instant={printMode} />
                      </span>{' '}
                      realized savings,
                      <br />
                      plus a{' '}
                      <span style={{ color: M.accent }}>
                        <CountUp value={lossReserve} instant={printMode} />
                      </span>{' '}
                      loss reserve.
                    </>
                  ) : (
                    <>
                      An estimated{' '}
                      <span style={{ color: M.accent }}>
                        <CountUp value={totalTaxSavings} instant={printMode} />
                      </span>
                      <br />
                      in tax savings.
                    </>
                  )}
                </h1>
                <p
                  style={{
                    margin: '14px 0 0',
                    fontSize: 15,
                    color: M.inkSoft,
                    maxWidth: 640,
                    lineHeight: 1.55,
                  }}
                >
                  {ediMode ? (
                    <>
                      Enhanced direct indexing generates an estimated{' '}
                      <strong style={{ color: M.good }}>{fmtCurrency(totalTaxSavings)}</strong> of
                      realized tax savings through {endYear} — and builds{' '}
                      <strong>{fmtCurrency(cfReserveBalance)}</strong> of loss carryforwards, a
                      reserve worth an estimated{' '}
                      <strong style={{ color: M.accent }}>{fmtCurrency(lossReserve)}</strong> of
                      shelter against future capital gains (contingent on those gains being realized
                      — a business sale, concentrated-stock exit, or RSU diversification).
                    </>
                  ) : (
                    <>
                      Enhanced direct indexing with the QFAF overlay generates an estimated{' '}
                      <strong style={{ color: M.good }}>{fmtCurrency(totalTaxSavings)}</strong> of
                      net tax savings through {endYear}, driven by ordinary loss deductions, NOL
                      usage, and capital loss carryforwards.
                      {qfafTailNote && (
                        <>
                          {' '}
                          Savings concentrate in the fund&rsquo;s {inputs.qfafDuration}-year run;
                          the later years draw down carryforwards rather than generating new losses.
                        </>
                      )}
                    </>
                  )}
                  {!advancedSettings.financingFeesEnabled && (
                    <> Estimates are before financing costs and fees.</>
                  )}
                </p>
              </div>

              {showDecomp && (
                <div
                  style={{
                    background: 'white',
                    borderRadius: 16,
                    border: `1px solid ${M.line}`,
                    padding: '22px 26px',
                    marginBottom: 20,
                    boxShadow: '0 4px 20px rgba(11,16,32,0.04)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: M.accentFaint,
                        color: M.accent,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      ?
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: M.ink }}>
                      How we get to {fmtCurrency(totalTaxSavings)}
                    </div>
                    <span style={{ fontSize: 12, color: M.inkFaint }}>{decomp.subLabel}</span>
                  </div>

                  {(() => {
                    const positiveParts = decomp.cards.filter(p => p.inBar && p.barFlex > 0);
                    const totalFlex = positiveParts.reduce((s, p) => s + p.barFlex, 0) || 1;
                    return (
                      <>
                        <div
                          style={{
                            height: 42,
                            display: 'flex',
                            borderRadius: 10,
                            overflow: 'hidden',
                            marginBottom: 14,
                            boxShadow: '0 2px 6px rgba(11,16,32,0.06)',
                          }}
                        >
                          {positiveParts.map((p, i) => (
                            <div
                              key={p.label}
                              title={`${p.label}: ${p.display}`}
                              style={{
                                flex: p.barFlex / totalFlex,
                                background: p.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: M.mono,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                borderRight:
                                  i < positiveParts.length - 1 ? '2px solid white' : 'none',
                              }}
                            >
                              {/* Skip the in-segment label when the slice is
                                  too thin to hold it. */}
                              {p.barFlex / totalFlex > 0.12 ? p.display : ''}
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${decomp.cards.length}, 1fr)`,
                            gap: 14,
                          }}
                        >
                          {decomp.cards.map(p => (
                            <div
                              key={p.label}
                              style={{
                                padding: '12px 14px',
                                borderRadius: 10,
                                background: '#fafbfc',
                                border: `1px solid ${M.lineSoft}`,
                                borderTop: `3px solid ${p.color}`,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: M.inkFaint,
                                  letterSpacing: 0.5,
                                  textTransform: 'uppercase',
                                  marginBottom: 4,
                                }}
                              >
                                {p.stepLabel}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: M.ink,
                                  marginBottom: 3,
                                }}
                              >
                                {p.label}
                              </div>
                              <div
                                data-testid={p.testId}
                                style={{
                                  fontSize: 17,
                                  fontWeight: 800,
                                  color: p.color,
                                  fontFamily: M.mono,
                                  fontVariantNumeric: 'tabular-nums',
                                  letterSpacing: -0.3,
                                  marginBottom: 6,
                                }}
                              >
                                {p.display}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: M.inkSoft,
                                  lineHeight: 1.4,
                                }}
                              >
                                {p.note}
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Reconciliation line: the cards visibly sum to the
                            headline (D-022 — the CPA check). */}
                        <div
                          style={{
                            marginTop: 12,
                            fontSize: 12.5,
                            fontFamily: M.mono,
                            fontVariantNumeric: 'tabular-nums',
                            color: M.inkSoft,
                          }}
                        >
                          {decomp.equation} ={' '}
                          <strong data-testid="decomp-total-value" style={{ color: M.ink }}>
                            {fmtCurrencyFull(decomp.displayTotal)}
                          </strong>{' '}
                          {decomp.totalLabel}
                        </div>
                        <div
                          style={{
                            marginTop: 14,
                            padding: '10px 14px',
                            background: M.accentFaint,
                            borderRadius: 8,
                            fontSize: 12,
                            color: M.accentDeep,
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>The key insight:</strong>{' '}
                          {ediMode ? (
                            <>
                              realized savings are modest by design — the harvested losses are
                              banked, not spent. Year over year the carryforward reserve compounds,
                              reaching {fmtCurrency(lossReserve)} of contingent shelter by {endYear}
                              . It pays off when a gain event lands: a sale up to{' '}
                              {fmtCurrency(cfReserveBalance)} would be fully sheltered.
                            </>
                          ) : (
                            <>
                              year 1 saves roughly {fmtCurrency(detailYearData[0]?.save ?? 0)}.
                              Because harvesting continues and NOL credits roll forward, the
                              advantage compounds — so by {endYear} you reach{' '}
                              {fmtCurrency(totalTaxSavings)}. It's the compounding, not the rate,
                              that does the heavy lifting.
                            </>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 14,
                  marginBottom: 20,
                }}
              >
                {(ediMode
                  ? ([
                      {
                        label: 'Realized tax savings',
                        value: fmtCurrency(totalTaxSavings),
                        sub: `through ${endYear}`,
                        primary: true,
                      },
                      {
                        // Co-equal with realized savings (D-015) — but honest:
                        // the reserve only pays when future gains are realized.
                        label: 'Loss reserve built',
                        value: fmtCurrency(lossReserve),
                        sub: `from ${fmtCurrency(cfReserveBalance)} of carryforwards · contingent on future gains`,
                        primary: true,
                      },
                    ] as const)
                  : ([
                      {
                        label: 'Cumulative tax savings',
                        value: fmtCurrency(totalTaxSavings),
                        sub: `through ${endYear}`,
                        primary: true,
                      },
                      {
                        label: 'Year 1 tax savings',
                        value: fmtCurrency(detailYearData[0]?.save ?? 0),
                        sub: 'first-year benefit',
                        primary: false,
                      },
                    ] as const)
                ).map(m => (
                  <div
                    key={m.label}
                    style={{
                      padding: '20px 22px',
                      borderRadius: 14,
                      background: m.primary
                        ? `linear-gradient(145deg, ${M.accent}, ${M.accentDeep})`
                        : 'white',
                      color: m.primary ? 'white' : M.ink,
                      border: m.primary ? 'none' : `1px solid ${M.line}`,
                      boxShadow: m.primary
                        ? '0 10px 30px rgba(79,70,229,0.25)'
                        : '0 1px 0 rgba(11,16,32,0.02)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        opacity: m.primary ? 0.75 : 1,
                        color: m.primary ? 'rgba(255,255,255,0.85)' : M.inkFaint,
                      }}
                    >
                      {m.label}
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        letterSpacing: -1,
                        marginTop: 10,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {m.value}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        marginTop: 6,
                        opacity: m.primary ? 0.8 : 1,
                        color: m.primary ? 'rgba(255,255,255,0.8)' : M.inkSoft,
                      }}
                    >
                      {m.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Step-up co-metric (D-018) + EDI protection ratio — included in
                  the printed handout per D-021 (export parity). Compact strip
                  so the page-1 print pagination (exactly 3 sheets) holds. */}
              <div
                style={{
                  padding: '14px 18px',
                  background: 'white',
                  borderRadius: 12,
                  border: `1px solid ${M.line}`,
                  marginBottom: 20,
                  // ≥14px: this strip is read aloud in meetings (7e).
                  fontSize: 14,
                  color: M.inkSoft,
                  lineHeight: 1.55,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'baseline' }}>
                  <span>
                    <strong style={{ color: M.ink }}>Net if held to step-up:</strong>{' '}
                    <strong
                      style={{
                        color: M.good,
                        fontFamily: M.mono,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCurrency(stepUp.netIfHeldToStepUp)}
                    </strong>
                  </span>
                  <span>
                    vs{' '}
                    <strong style={{ fontFamily: M.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCurrency(stepUp.netIfLiquidated)}
                    </strong>{' '}
                    net if liquidated
                  </span>
                  {ediMode && advancedSettings.financingFeesEnabled && (
                    <span>
                      <strong style={{ color: M.ink }}>Protection ratio:</strong>{' '}
                      <strong style={{ fontFamily: M.mono, fontVariantNumeric: 'tabular-nums' }}>
                        {insights.protectionRatio !== null
                          ? `${insights.protectionRatio.toFixed(1)}×`
                          : '—'}
                      </strong>{' '}
                      — loss-reserve shelter value ÷ {fmtCurrency(insights.cumulativeFinancingCost)}{' '}
                      cumulative financing cost
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 14, color: M.inkFaint }}>
                  &ldquo;Net if held to step-up&rdquo; is mortality-contingent and assumes basis
                  step-up under current law (IRC §1014). Unused loss carryforwards are lost at death
                  — their {fmtCurrency(stepUp.continueAndDie.carryforwardValueLost)} contingent
                  shelter value is not counted in either figure.
                </div>
              </div>

              <div
                style={{
                  background: 'white',
                  borderRadius: 16,
                  border: `1px solid ${M.line}`,
                  padding: '24px 26px',
                  marginBottom: 20,
                  boxShadow: '0 4px 20px rgba(11,16,32,0.04)',
                  // The same chart leads page 2 in the printed one-pager, so
                  // hide this copy when printing to keep page 1 focused on the
                  // headline narrative.
                  display: printMode ? 'none' : 'block',
                }}
              >
                <BenefitBreakdownChart
                  yearIdx={yearIdx}
                  setYearIdx={setYearIdx}
                  data={breakdownData}
                  note={qfafTailNote}
                />
                <div
                  style={{
                    marginTop: 20,
                    padding: '16px 4px 4px',
                    borderTop: `1px solid ${M.lineSoft}`,
                    display: printMode ? 'none' : 'block',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                    }}
                  >
                    <span style={{ fontSize: 11.5, color: M.inkFaint, fontWeight: 600 }}>
                      Year scrubber
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: M.accent,
                        fontFamily: M.mono,
                      }}
                    >
                      {yearIdx === 0 ? 'Today' : `Year ${yearIdx}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={breakdownData.length}
                    value={yearIdx}
                    onChange={e => setYearIdx(parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: M.accent }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: '18px 22px',
                  background: 'white',
                  borderRadius: 12,
                  border: `1px dashed ${M.line}`,
                  display: printMode ? 'none' : 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: M.ink }}>
                    Ready to go deeper?
                  </div>
                  <div style={{ fontSize: 12.5, color: M.inkSoft, marginTop: 2 }}>
                    Show the year-by-year numbers, or walk through how the strategy actually works.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setLevel('detail')}
                    style={{
                      padding: '9px 16px',
                      background: 'white',
                      border: `1px solid ${M.line}`,
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: M.ink,
                      cursor: 'pointer',
                    }}
                  >
                    Show year-by-year →
                  </button>
                  <button
                    onClick={() => setLevel('mechanics')}
                    style={{
                      padding: '9px 16px',
                      background: M.accent,
                      border: 'none',
                      color: 'white',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                    }}
                  >
                    Explain the mechanics →
                  </button>
                </div>
              </div>
              {printMode && <PrintPageFooter />}
            </div>
          )}

          {(level === 'detail' || printMode) && (
            <div
              className={printMode ? 'meeting-mode-print-page' : undefined}
              data-print-page="2"
              style={printMode ? { paddingTop: 20 } : undefined}
            >
              {printMode && (
                <PrintPageHeader
                  pageNumber={2}
                  scenarioLine={printScenarioLine}
                  rangeLabel={projectionRangeLabel}
                />
              )}
              <div
                style={{
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={levelSubheadingStyle}>Level 02 · Detail</div>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 36,
                      fontWeight: 800,
                      letterSpacing: -1,
                      color: M.ink,
                    }}
                  >
                    The numbers, year by year.
                  </h1>
                </div>
                <button
                  onClick={() => setLevel('high')}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    border: `1px solid ${M.line}`,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: M.inkSoft,
                    cursor: 'pointer',
                    display: printMode ? 'none' : 'inline-flex',
                  }}
                >
                  ← Back to high level
                </button>
              </div>
              <div
                style={{
                  background: 'white',
                  borderRadius: 16,
                  border: `1px solid ${M.line}`,
                  padding: '20px 22px',
                  marginBottom: 16,
                  boxShadow: '0 4px 20px rgba(11,16,32,0.04)',
                }}
              >
                <BenefitBreakdownChart
                  yearIdx={yearIdx}
                  setYearIdx={setYearIdx}
                  data={breakdownData}
                  note={qfafTailNote}
                />
              </div>
              <div
                style={{
                  background: 'white',
                  borderRadius: 16,
                  border: `1px solid ${M.line}`,
                  padding: '20px 24px',
                  boxShadow: '0 4px 20px rgba(11,16,32,0.04)',
                }}
              >
                <DetailView
                  yearIdx={yearIdx}
                  setYearIdx={setYearIdx}
                  yearData={detailYearData}
                  totalTaxSavings={totalTaxSavings}
                  totalNol={totalNol}
                  finalPortfolio={finalPortfolio}
                />
              </div>
              {printMode && <PrintPageFooter />}
            </div>
          )}

          {(level === 'mechanics' || printMode) && (
            <div
              className={printMode ? 'meeting-mode-print-page' : undefined}
              data-print-page="3"
              style={printMode ? { paddingTop: 20 } : undefined}
            >
              {printMode && (
                <PrintPageHeader
                  pageNumber={3}
                  scenarioLine={printScenarioLine}
                  rangeLabel={projectionRangeLabel}
                />
              )}
              <div
                style={{
                  marginBottom: 24,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={levelSubheadingStyle}>Level 03 · Mechanics</div>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 36,
                      fontWeight: 800,
                      letterSpacing: -1,
                      color: M.ink,
                    }}
                  >
                    Under the hood.
                  </h1>
                </div>
                <button
                  onClick={() => setLevel('detail')}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    border: `1px solid ${M.line}`,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: M.inkSoft,
                    cursor: 'pointer',
                    display: printMode ? 'none' : 'inline-flex',
                  }}
                >
                  ← Back to detail
                </button>
              </div>
              <MechanicsView
                ediMode={ediMode}
                inputs={inputs}
                settings={advancedSettings}
                visibleYears={visibleYears}
                qfafValue={results.sizing.qfafValue}
                totalExposure={results.sizing.totalExposure}
                totalNol={totalNol}
                totalTaxSavings={totalTaxSavings}
                cfReserveBalance={cfReserveBalance}
                lossReserve={lossReserve}
                taxRates={taxRates}
                currentStrategy={currentStrategy}
                filingLabel={filingLabel}
              />
              {printMode && <PrintPageFooter />}
            </div>
          )}

          <div
            style={{
              marginTop: 32,
              padding: '14px 0',
              fontSize: 11,
              color: M.inkFaint,
              lineHeight: 1.55,
              maxWidth: 820,
              // The print one-pager has its own per-page footer disclaimer;
              // hide the on-screen version so it doesn't double up.
              display: printMode ? 'none' : 'block',
            }}
          >
            Estimates do not reflect advisory fees, financing costs, tracking error, transaction
            costs, or behavioral effects. Actual results will vary. For discussion purposes only.
          </div>
        </div>
      </main>
    </div>
  );
}
