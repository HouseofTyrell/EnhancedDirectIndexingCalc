import { useReducer, useCallback, useMemo, useState } from 'react';
import { FilingStatus } from '../types';
import type {
  EdiPinnedScenario,
  EdiPinnedAssumptions,
  EdiPinnedTaxRates,
  EdiPinnedResults,
} from '../types';
import { STRATEGIES, computeIncrementalFinancingCost, getLongLeverageRatio, getShortRatio, getStLossRateForYear } from '../strategyData';
import { formatWithCommas, parseFormattedNumber, formatCurrency } from '../utils/formatters';
import {
  computeEdiProjection,
  getDefaultScenarios,
  computeScenarioResults,
  calculateUnwindAnalysis,
  calculateEstateComparison,
  estimateEmbeddedGainPct,
  computeStrategyEconomics,
  computeBaselineComparison,
  calculateRealizationScenario,
  type EdiYearResult,
  type EdiProjectionInput,
  type GainCharacter,
} from '../calculations/ediOnly';
import { useScrollHeader } from '../hooks/useScrollHeader';
import { EdiStickyHeader } from './EdiStickyHeader';
import { EdiComparisonPanel } from './EdiComparisonPanel';
import { EdiTaxSavingsChart, EdiEmbeddedGainChart, EdiCrossoverChart } from './EdiCharts';
import './EdiOnlyTab.css';

interface EdiOnlyTabProps {
  filingStatus: FilingStatus;
  combinedStRate: number;
  combinedLtRate: number;
  stateCode?: string;
  pinned: EdiPinnedScenario | null;
  hasPinned: boolean;
  onPin: (assumptions: EdiPinnedAssumptions, taxRates: EdiPinnedTaxRates, results: EdiPinnedResults) => void;
  onUnpin: () => void;
  onReplacePin: (assumptions: EdiPinnedAssumptions, taxRates: EdiPinnedTaxRates, results: EdiPinnedResults) => void;
}

interface EdiAssumptions {
  strategyId: string;
  collateralValue: number;
  annualReturn: number;
  washSaleRate: number;
  existingStCarryforward: number;
  existingLtCarryforward: number;
  projectionYears: number;
  advisoryFeeRate: number;
  brokerMarginRate: number;
  shortBorrowRate: number;
  shortDividendRate: number;
}

const DEFAULT_ASSUMPTIONS: EdiAssumptions = {
  strategyId: 'overlay-45-45',
  collateralValue: 10_000_000,
  annualReturn: 0.07,
  washSaleRate: 0,
  existingStCarryforward: 0,
  existingLtCarryforward: 0,
  projectionYears: 10,
  advisoryFeeRate: 0.0075,
  brokerMarginRate: 0.0425,
  shortBorrowRate: 0.005,
  shortDividendRate: 0.015,
};

type State = { assumptions: EdiAssumptions };
type Action =
  | { type: 'UPDATE'; field: keyof EdiAssumptions; value: number | string }
  | { type: 'RESET' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'UPDATE':
      return { assumptions: { ...state.assumptions, [action.field]: action.value } };
    case 'RESET':
      return { assumptions: { ...DEFAULT_ASSUMPTIONS } };
    default:
      return state;
  }
}

// Row definitions for year-by-year table
interface RowDef {
  key: string;
  label: string;
  getValue: (r: EdiYearResult) => number;
  format: 'currency' | 'highlight' | 'positive' | 'negative' | 'ratio';
  rowClass?: string;
}

const ROW_DEFINITIONS: RowDef[] = [
  { key: 'collateral', label: 'Collateral Value', getValue: r => r.collateralValue, format: 'currency' },
  { key: 'stLosses', label: 'ST Losses Harvested', getValue: r => r.stLossesHarvested, format: 'negative' },
  { key: 'ltGains', label: 'LT Gains Realized', getValue: r => r.ltGainsRealized, format: 'currency' },
  { key: 'stUsed', label: 'ST Losses Offsetting LT Gains', getValue: r => r.stLossesUsedToOffsetLtGains, format: 'currency' },
  { key: 'priorCfUsed', label: 'Prior CF Used vs LT Gains', getValue: r => r.priorCfUsedAgainstLtGains, format: 'currency' },
  { key: 'ltGainsTax', label: 'Tax on Remaining LT Gains', getValue: r => r.taxOnRemainingLtGains, format: 'negative' },
  { key: 'excess', label: 'Excess ST Loss to CF', getValue: r => r.excessStLossAfterOffset, format: 'highlight', rowClass: 'row-highlight' },
  { key: 'deduction', label: '$3K Capital Loss Deduction', getValue: r => r.capitalLossDeduction, format: 'currency' },
  { key: 'taxSaved', label: 'Tax Saved (Deduction)', getValue: r => r.taxSavedByCapitalLossDeduction, format: 'positive', rowClass: 'row-positive' },
  { key: 'benefit', label: 'Net Annual Realized Benefit', getValue: r => r.annualRealizedBenefit, format: 'positive', rowClass: 'row-positive' },
  { key: 'stCf', label: 'ST Carryforward', getValue: r => r.endingStCarryforward, format: 'highlight', rowClass: 'row-highlight' },
  { key: 'ltCf', label: 'LT Carryforward', getValue: r => r.endingLtCarryforward, format: 'currency' },
  { key: 'cfEnding', label: 'Total Carryforward', getValue: r => r.endingStCarryforward + r.endingLtCarryforward, format: 'highlight', rowClass: 'row-highlight' },
  { key: 'efficiency', label: 'Harvesting Efficiency (ST/LT)', getValue: r => r.harvestingEfficiency, format: 'ratio' },
];

function formatCellValue(format: RowDef['format'], value: number) {
  if (format === 'ratio') {
    if (!Number.isFinite(value)) return <span className="edi-cell-ratio">N/A</span>;
    return <span className="edi-cell-ratio">{value.toFixed(1)}x</span>;
  }
  const formatted = formatCurrency(value);
  switch (format) {
    case 'highlight': return <span className="edi-cell-highlight">{formatted}</span>;
    case 'positive': return <span className="edi-cell-positive">{formatted}</span>;
    case 'negative': return <span className="edi-cell-negative">{formatted}</span>;
    default: return formatted;
  }
}

export function EdiOnlyTab({
  filingStatus,
  combinedStRate,
  combinedLtRate,
  stateCode,
  pinned,
  hasPinned,
  onPin,
  onUnpin,
  onReplacePin,
}: EdiOnlyTabProps) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    assumptions: { ...DEFAULT_ASSUMPTIONS },
  }));
  const [unwindYear, setUnwindYear] = useState(5);
  const [customGainAmount, setCustomGainAmount] = useState(5_000_000);
  const [customGainCharacter, setCustomGainCharacter] = useState<GainCharacter>('lt');
  const [customGainYear, setCustomGainYear] = useState(5);
  const [sensitivityRateShift, setSensitivityRateShift] = useState(0);
  const { isExpanded } = useScrollHeader('edi-scroll-sentinel');

  const handleChange = useCallback((field: keyof EdiAssumptions, value: number | string) => {
    dispatch({ type: 'UPDATE', field, value });
  }, []);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Compute projection (financingCostRate reduces collateral growth per PM review)
  const projectionInput: EdiProjectionInput = useMemo(() => {
    const strat = STRATEGIES.find(s => s.id === state.assumptions.strategyId);
    const fcr = strat ? computeIncrementalFinancingCost(
      strat,
      state.assumptions.brokerMarginRate,
      state.assumptions.shortBorrowRate,
      state.assumptions.shortDividendRate,
    ) : 0.015;
    return {
      ...state.assumptions,
      combinedStRate,
      combinedLtRate,
      filingStatus,
      financingCostRate: fcr,
    };
  }, [state.assumptions, combinedStRate, combinedLtRate, filingStatus]);

  const projection = useMemo(
    () => computeEdiProjection(projectionInput),
    [projectionInput]
  );

  // Compute scenarios
  const scenarios = useMemo(
    () => getDefaultScenarios(state.assumptions.collateralValue),
    [state.assumptions.collateralValue]
  );

  const scenarioResults = useMemo(
    () => scenarios.map(s => computeScenarioResults(s, projection, combinedStRate, combinedLtRate)),
    [scenarios, projection, combinedStRate, combinedLtRate]
  );

  // Compute unwind analysis for each year
  const unwindByYear = useMemo(() => {
    return Array.from({ length: state.assumptions.projectionYears }, (_, i) =>
      calculateUnwindAnalysis({
        unwindYear: i + 1,
        projection,
        strategyId: state.assumptions.strategyId,
        annualReturn: state.assumptions.annualReturn,
        combinedLtRate,
        washSaleRate: state.assumptions.washSaleRate,
        financingCostRate: projectionInput.financingCostRate,
      })
    );
  }, [projection, state.assumptions, combinedLtRate]);

  const selectedUnwind = unwindByYear[unwindYear - 1];

  // Find break-even year
  const breakEvenYear = useMemo(() => {
    return unwindByYear.findIndex(u => u.availableCarryforward >= u.embeddedGainEstimate) + 1;
  }, [unwindByYear]);

  // Estate comparison at selected unwind year
  const estateResult = useMemo(() => {
    if (!selectedUnwind) return null;
    return calculateEstateComparison({
      portfolioValue: selectedUnwind.portfolioValueAtUnwind,
      embeddedGainPct: selectedUnwind.embeddedGainPct,
      availableStCarryforward: projection.years[unwindYear - 1]?.endingStCarryforward ?? 0,
      availableLtCarryforward: projection.years[unwindYear - 1]?.endingLtCarryforward ?? 0,
      combinedLtRate,
    });
  }, [selectedUnwind, projection, unwindYear, combinedLtRate]);

  const strategy = STRATEGIES.find(s => s.id === state.assumptions.strategyId);

  // Compute incremental financing cost from detailed components (excludes advisory fee)
  const incrementalFinancingCost = useMemo(() => {
    if (!strategy) return 0.015;
    return computeIncrementalFinancingCost(
      strategy,
      state.assumptions.brokerMarginRate,
      state.assumptions.shortBorrowRate,
      state.assumptions.shortDividendRate,
    );
  }, [strategy, state.assumptions.brokerMarginRate, state.assumptions.shortBorrowRate, state.assumptions.shortDividendRate]);

  // Strategy economics (net-of-fee ROI, tax alpha, cash flow)
  const economics = useMemo(
    () => computeStrategyEconomics(
      projection,
      incrementalFinancingCost,
      state.assumptions.advisoryFeeRate,
      combinedLtRate,
    ),
    [projection, incrementalFinancingCost, state.assumptions.advisoryFeeRate, combinedLtRate]
  );

  // Baseline comparison (passive vs EDI, advisory fee excluded as common to both)
  const baseline = useMemo(
    () => computeBaselineComparison(
      projection,
      state.assumptions.collateralValue,
      state.assumptions.annualReturn,
      incrementalFinancingCost,
      combinedLtRate,
      state.assumptions.strategyId,
      state.assumptions.washSaleRate,
    ),
    [projection, state.assumptions, incrementalFinancingCost, combinedLtRate]
  );

  // Strategy comparison across all strategies
  const [showBaselineComparison, setShowBaselineComparison] = useState(false);
  const [showStrategyComparison, setShowStrategyComparison] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const strategyComparison = useMemo(() => {
    if (!showStrategyComparison) return [];
    return STRATEGIES.map(s => {
      const sFinancing = computeIncrementalFinancingCost(
        s,
        state.assumptions.brokerMarginRate,
        state.assumptions.shortBorrowRate,
        state.assumptions.shortDividendRate,
      );
      const proj = computeEdiProjection({
        ...projectionInput,
        strategyId: s.id,
        financingCostRate: sFinancing,
      });
      const econ = computeStrategyEconomics(proj, sFinancing, state.assumptions.advisoryFeeRate, combinedLtRate);
      const lastYr = proj.years[proj.years.length - 1];
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        financingRate: sFinancing,
        totalTaxSavings: proj.summary.totalRealizedBenefit + proj.summary.carryforwardTaxShield,
        finalCf: proj.summary.finalCarryforward,
        totalCost: econ.summary.totalIncrementalCost,
        protectionRatio: econ.summary.protectionToCostRatio,
        breakEvenGain: econ.summary.breakEvenGainEvent,
        breakEven: proj.years.findIndex((_, i) => {
          const u = calculateUnwindAnalysis({ unwindYear: i + 1, projection: proj, strategyId: s.id, annualReturn: state.assumptions.annualReturn, combinedLtRate, washSaleRate: state.assumptions.washSaleRate, financingCostRate: sFinancing });
          return u.availableCarryforward >= u.embeddedGainEstimate;
        }) + 1,
        embeddedGainPct: lastYr ? estimateEmbeddedGainPct(s.id, state.assumptions.projectionYears, state.assumptions.annualReturn - sFinancing, state.assumptions.washSaleRate) : 0,
      };
    });
  }, [showStrategyComparison, projectionInput, state.assumptions, combinedLtRate]);

  // Custom realization scenario result
  const customScenarioResult = useMemo(() => {
    const yearIdx = Math.min(customGainYear - 1, projection.years.length - 1);
    const yr = projection.years[yearIdx];
    if (!yr) return null;
    return calculateRealizationScenario({
      gainAmount: customGainAmount,
      gainCharacter: customGainCharacter,
      availableStCarryforward: yr.endingStCarryforward,
      availableLtCarryforward: yr.endingLtCarryforward,
      combinedStRate,
      combinedLtRate,
    });
  }, [customGainAmount, customGainCharacter, customGainYear, projection, combinedStRate, combinedLtRate]);

  // Realization size sensitivity table (at selected unwind year)
  const realizationSensitivity = useMemo(() => {
    const yearIdx = Math.min(unwindYear - 1, projection.years.length - 1);
    const yr = projection.years[yearIdx];
    if (!yr) return [];
    const gainAmounts = [500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000];
    return gainAmounts.map(amount => {
      const result = calculateRealizationScenario({
        gainAmount: amount,
        gainCharacter: 'lt',
        availableStCarryforward: yr.endingStCarryforward,
        availableLtCarryforward: yr.endingLtCarryforward,
        combinedStRate,
        combinedLtRate,
      });
      return { amount, ...result };
    });
  }, [unwindYear, projection, combinedStRate, combinedLtRate]);

  // Tax rate sensitivity: projection at shifted rates
  const sensitivityProjection = useMemo(() => {
    if (sensitivityRateShift === 0) return null;
    return computeEdiProjection({
      ...projectionInput,
      combinedStRate: combinedStRate + sensitivityRateShift,
      combinedLtRate: combinedLtRate + sensitivityRateShift,
    });
  }, [projectionInput, sensitivityRateShift, combinedStRate, combinedLtRate]);

  // Build pin data from current state
  const currentAssumptions: EdiPinnedAssumptions = useMemo(() => ({
    strategyId: state.assumptions.strategyId,
    collateralValue: state.assumptions.collateralValue,
    annualReturn: state.assumptions.annualReturn,
    washSaleRate: state.assumptions.washSaleRate,
    existingStCarryforward: state.assumptions.existingStCarryforward,
    existingLtCarryforward: state.assumptions.existingLtCarryforward,
    projectionYears: state.assumptions.projectionYears,
    advisoryFeeRate: state.assumptions.advisoryFeeRate,
    brokerMarginRate: state.assumptions.brokerMarginRate,
    shortBorrowRate: state.assumptions.shortBorrowRate,
    shortDividendRate: state.assumptions.shortDividendRate,
  }), [state.assumptions]);

  const currentTaxRates: EdiPinnedTaxRates = useMemo(() => ({
    combinedStRate,
    combinedLtRate,
    filingStatus,
    stateCode: stateCode ?? 'CA',
  }), [combinedStRate, combinedLtRate, filingStatus, stateCode]);

  const lastYear = projection.years[projection.years.length - 1];
  // Total potential tax savings = realized benefit ($3K deductions) + carryforward tax shield
  const totalPotentialSavings = projection.summary.totalRealizedBenefit + projection.summary.carryforwardTaxShield;
  const currentResults: EdiPinnedResults = useMemo(() => ({
    totalTaxSavings: projection.summary.totalRealizedBenefit + projection.summary.carryforwardTaxShield,
    totalCarryforwardBuilt: projection.summary.finalCarryforward,
    finalStCarryforward: lastYear?.endingStCarryforward ?? 0,
    finalLtCarryforward: lastYear?.endingLtCarryforward ?? 0,
    finalEmbeddedGainPct: estimateEmbeddedGainPct(
      state.assumptions.strategyId,
      state.assumptions.projectionYears,
      state.assumptions.annualReturn - (projectionInput.financingCostRate ?? 0),
      state.assumptions.washSaleRate,
    ),
  }), [projection, lastYear, state.assumptions]);

  const handlePin = useCallback(() => {
    onPin(currentAssumptions, currentTaxRates, currentResults);
  }, [onPin, currentAssumptions, currentTaxRates, currentResults]);

  const handleReplacePin = useCallback(() => {
    onReplacePin(currentAssumptions, currentTaxRates, currentResults);
  }, [onReplacePin, currentAssumptions, currentTaxRates, currentResults]);

  // Pinned values for sticky header delta display
  const pinnedValues = pinned ? {
    collateral: pinned.assumptions.collateralValue,
    totalTaxSavings: pinned.results.totalTaxSavings,
    totalCarryforward: pinned.results.totalCarryforwardBuilt,
  } : undefined;

  return (
    <div className="edi-only-tab">
      {/* Sticky Header */}
      <EdiStickyHeader
        strategyName={strategy?.name ?? state.assumptions.strategyId}
        collateral={state.assumptions.collateralValue}
        totalTaxSavings={totalPotentialSavings}
        totalCarryforward={projection.summary.finalCarryforward}
        isExpanded={isExpanded}
        hasPinned={hasPinned}
        onPin={handlePin}
        onUnpin={onUnpin}
        pinnedValues={pinnedValues}
      />

      {/* Comparison Panel */}
      {pinned && (
        <EdiComparisonPanel
          pinned={pinned}
          currentAssumptions={currentAssumptions}
          currentTaxRates={currentTaxRates}
          currentResults={currentResults}
          onUnpin={onUnpin}
          onReplacePin={handleReplacePin}
        />
      )}

      {/* State-Specific Warnings */}
      {stateCode === 'PA' && (
        <div className="state-warning-banner">
          <strong>Pennsylvania Note:</strong> PA does not conform to federal capital loss
          carryforward rules. Accumulated carryforwards provide no PA state tax benefit.
          The federal benefit calculations shown here do not include PA state savings.
        </div>
      )}
      {stateCode === 'WA' && (
        <div className="state-warning-banner">
          <strong>Washington Note:</strong> WA imposes a 7% excise tax on long-term capital gains
          exceeding $250K (effective 2022, upheld by WA Supreme Court). Capital loss carryforwards
          may reduce WA-taxable gains. Consult WA tax advisor for applicability.
        </div>
      )}

      {/* Scroll sentinel for sticky header */}
      <div id="edi-scroll-sentinel" />

      {/* Summary Cards */}
      <div className="edi-summary-cards">
        <div className="edi-summary-card">
          <div className="card-label">Potential Tax Protection</div>
          <div className="card-value positive">{formatCurrency(projection.summary.carryforwardTaxShield)}</div>
          <div className="card-detail">
            CF: {formatCurrency(projection.summary.finalCarryforward)} at {(combinedLtRate * 100).toFixed(1)}% rate
          </div>
          <div className="card-detail muted">Contingent on gain event</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">Realized Benefit</div>
          <div className="card-value positive">{formatCurrency(projection.summary.totalRealizedBenefit)}</div>
          <div className="card-detail">Cumulative $3K deductions — certain</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">Break-Even Gain Event</div>
          <div className="card-value">{formatCurrency(economics.summary.breakEvenGainEvent)}</div>
          <div className="card-detail">Gain needed to recover {(incrementalFinancingCost * 100).toFixed(2)}% financing</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">Tax-Free Exit Year</div>
          <div className="card-value positive">
            {breakEvenYear > 0 ? `Year ${breakEvenYear}` : 'Not reached'}
          </div>
          <div className="card-detail">CF exceeds embedded gains — can exit tax-free</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">Protection Ratio</div>
          <div className="card-value positive">
            {economics.summary.protectionToCostRatio.toFixed(1)}x
          </div>
          <div className="card-detail">
            CF tax shield / cumulative financing cost
          </div>
          <div className="card-detail muted">If a qualifying gain event occurs</div>
        </div>
      </div>

      {/* Assumptions */}
      <div className="edi-assumptions-section">
        <h3>Assumptions</h3>
        <div className="edi-assumptions-grid">
          <div className="edi-assumption-row">
            <label>Collateral Value</label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(state.assumptions.collateralValue)}
                onChange={e => handleChange('collateralValue', parseFormattedNumber(e.target.value))}
              />
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Strategy</label>
            <div className="editable-cell select-cell">
              <select
                value={state.assumptions.strategyId}
                onChange={e => handleChange('strategyId', e.target.value)}
              >
                {STRATEGIES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Annual Portfolio Return</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={(state.assumptions.annualReturn * 100).toFixed(1)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('annualReturn', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Wash Sale Rate</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={(state.assumptions.washSaleRate * 100).toFixed(0)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('washSaleRate', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Existing ST Carryforward</label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(state.assumptions.existingStCarryforward)}
                onChange={e => handleChange('existingStCarryforward', parseFormattedNumber(e.target.value))}
              />
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Advisory Fee Rate</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={3}
                step={0.05}
                value={(state.assumptions.advisoryFeeRate * 100).toFixed(2)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('advisoryFeeRate', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Broker Margin Rate</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={15}
                step={0.25}
                value={(state.assumptions.brokerMarginRate * 100).toFixed(2)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('brokerMarginRate', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Short Borrow Rate</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={(state.assumptions.shortBorrowRate * 100).toFixed(2)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('shortBorrowRate', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Short Dividend Cost</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={(state.assumptions.shortDividendRate * 100).toFixed(2)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('shortDividendRate', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Incremental Financing Cost</label>
            <div className="edi-computed-value">
              {(incrementalFinancingCost * 100).toFixed(2)}%
              <span className="computed-label">(computed)</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Projection Years</label>
            <div className="editable-cell select-cell">
              <select
                value={state.assumptions.projectionYears}
                onChange={e => handleChange('projectionYears', parseInt(e.target.value, 10))}
              >
                {[5, 7, 10, 15, 20, 30].map(n => (
                  <option key={n} value={n}>{n} years</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="edi-assumptions-footer">
          <button type="button" onClick={handleReset} className="btn-reset">Reset to Defaults</button>
          <span className="filing-status-note">
            Strategy: {strategy?.name ?? '—'} | Incremental Financing: {(incrementalFinancingCost * 100).toFixed(2)}% | Advisory: {(state.assumptions.advisoryFeeRate * 100).toFixed(2)}% | ST Rate: {(combinedStRate * 100).toFixed(1)}% | LT Rate: {(combinedLtRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>


      {/* Protection Value Summary */}
      <div className="edi-protection-summary-section">
        <h3>Protection Value Summary</h3>
        <p className="section-subtitle">
          Year-by-year view of financing cost vs. tax protection built.
          Realized benefit ({formatCurrency(projection.summary.totalRealizedBenefit)}) is certain; CF protection ({formatCurrency(projection.summary.finalCarryforward)}) is contingent on a gain event.
        </p>
        <div className="edi-table-container">
          <table className="edi-table">
            <thead>
              <tr>
                <th className="col-label"></th>
                {economics.years.map(y => (
                  <th key={y.year} className="col-year">Year {y.year}</th>
                ))}
                <th className="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-label">Cumulative Financing Cost</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-negative">{formatCurrency(y.cumulativeIncrementalCost)}</span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-negative">{formatCurrency(economics.summary.totalIncrementalCost)}</span>
                </td>
              </tr>
              <tr>
                <td className="row-label">CF Protection Built</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-positive">{formatCurrency(y.cumulativeCfProtection)}</span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-positive">{formatCurrency(economics.summary.totalCfProtection)}</span>
                </td>
              </tr>
              <tr className="row-highlight">
                <td className="row-label">Protection Ratio</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className={y.protectionToCostRatio >= 1 ? 'edi-cell-positive' : ''}>
                      {y.protectionToCostRatio.toFixed(1)}x
                    </span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-positive">{economics.summary.protectionToCostRatio.toFixed(1)}x</span>
                </td>
              </tr>
              <tr>
                <td className="row-label">Break-Even Gain Event</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    {formatCurrency(y.breakEvenGainEvent)}
                  </td>
                ))}
                <td className="cell-total">
                  {formatCurrency(economics.summary.breakEvenGainEvent)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Realization Scenario */}
      <div className="edi-custom-scenario-section">
        <h3>Custom Realization Scenario</h3>
        <div className="life-event-templates">
          <span className="template-label">Templates:</span>
          {[
            { label: 'IPO/RSU Vest', amount: state.assumptions.collateralValue * 0.3, char: 'st' as GainCharacter, yr: 3 },
            { label: 'Concentrated Stock Exit', amount: state.assumptions.collateralValue * 1.0, char: 'lt' as GainCharacter, yr: 5 },
            { label: 'Real Estate Sale', amount: 2_000_000, char: 'lt' as GainCharacter, yr: 5 },
            { label: 'Business Sale', amount: state.assumptions.collateralValue * 2.0, char: 'lt' as GainCharacter, yr: 7 },
            { label: 'Divorce Settlement', amount: state.assumptions.collateralValue * 0.5, char: 'lt' as GainCharacter, yr: 3 },
          ].map(t => (
            <button
              key={t.label}
              className="template-btn"
              onClick={() => {
                setCustomGainAmount(t.amount);
                setCustomGainCharacter(t.char);
                setCustomGainYear(Math.min(t.yr, state.assumptions.projectionYears));
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="custom-scenario-inputs">
          <div className="edi-assumption-row">
            <label>Gain Amount</label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(customGainAmount)}
                onChange={e => setCustomGainAmount(parseFormattedNumber(e.target.value))}
              />
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Character</label>
            <div className="editable-cell select-cell">
              <select
                value={customGainCharacter}
                onChange={e => setCustomGainCharacter(e.target.value as GainCharacter)}
              >
                <option value="lt">Long-Term</option>
                <option value="st">Short-Term</option>
              </select>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Year of Event</label>
            <div className="editable-cell select-cell">
              <select
                value={customGainYear}
                onChange={e => setCustomGainYear(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: state.assumptions.projectionYears }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Year {i + 1}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {customScenarioResult && (
          <div className="edi-summary-cards">
            <div className="edi-summary-card">
              <div className="card-label">Tax Without CF</div>
              <div className="card-value">{formatCurrency(customScenarioResult.taxWithoutCarryforward)}</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">CF Used</div>
              <div className="card-value highlight">{formatCurrency(customScenarioResult.carryforwardUsed)}</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">Tax With CF</div>
              <div className="card-value">{formatCurrency(customScenarioResult.taxWithCarryforward)}</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">Tax Saved</div>
              <div className="card-value positive">{formatCurrency(customScenarioResult.taxSaved)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Realization Scenarios */}
      <div className="edi-scenarios-section">
        <h3>Realization Scenarios — What Your Carryforward Is Worth</h3>
        <div className="edi-scenario-cards">
          {scenarioResults.map((result, i) => (
            <div key={i} className="edi-scenario-card">
              <h4>{result.scenario.label}</h4>
              <p className="scenario-description">
                {result.scenario.description}
                {result.scenario.isMultiYear
                  ? ` (${formatCurrency(result.scenario.annualGainAmount!)}/yr for ${result.scenario.durationYears} years starting Year ${result.scenario.yearOfEvent})`
                  : ` — ${formatCurrency(result.scenario.gainAmount)} at Year ${result.scenario.yearOfEvent}`}
              </p>
              <div className="scenario-metrics">
                <div className="scenario-metric">
                  <span className="metric-label">Tax Without CF</span>
                  <span className="metric-value">{formatCurrency(result.taxWithoutCarryforward)}</span>
                </div>
                <div className="scenario-metric">
                  <span className="metric-label">CF Used</span>
                  <span className="metric-value">{formatCurrency(result.carryforwardUsed)}</span>
                </div>
                <div className="scenario-metric">
                  <span className="metric-label">Tax With CF</span>
                  <span className="metric-value">{formatCurrency(result.taxWithCarryforward)}</span>
                </div>
                <hr className="scenario-metric-divider" />
                <div className="scenario-metric">
                  <span className="metric-label">Tax Saved</span>
                  <span className="metric-value saved">{formatCurrency(result.taxSaved)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Realization Size Sensitivity */}
      <div className="edi-sensitivity-section">
        <h3>Realization Size Sensitivity (Year {unwindYear})</h3>
        <p className="section-subtitle">
          How much tax you save at different gain sizes with Year {unwindYear} carryforward.
        </p>
        <table className="edi-table sensitivity-table">
          <thead>
            <tr>
              <th>Gain Amount</th>
              <th>CF Used</th>
              <th>Tax Without CF</th>
              <th>Tax With CF</th>
              <th>Tax Saved</th>
              <th>Effective Rate</th>
            </tr>
          </thead>
          <tbody>
            {realizationSensitivity.map(row => (
              <tr key={row.amount}>
                <td>{formatCurrency(row.amount)}</td>
                <td>{formatCurrency(row.carryforwardUsed)}</td>
                <td>{formatCurrency(row.taxWithoutCarryforward)}</td>
                <td>{formatCurrency(row.taxWithCarryforward)}</td>
                <td className="cell-positive">{formatCurrency(row.taxSaved)}</td>
                <td>{row.amount > 0 ? ((row.taxWithCarryforward / row.amount) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tax Rate Sensitivity */}
      <div className="edi-rate-sensitivity-section">
        <h3>Tax Rate Sensitivity</h3>
        <div className="rate-sensitivity-toggle">
          <label>Rate Shift:</label>
          {[-0.05, -0.03, 0, 0.03, 0.05].map(shift => (
            <button
              key={shift}
              className={`rate-btn ${sensitivityRateShift === shift ? 'rate-btn--active' : ''}`}
              onClick={() => setSensitivityRateShift(shift)}
            >
              {shift === 0 ? 'Current' : `${shift > 0 ? '+' : ''}${(shift * 100).toFixed(0)}%`}
            </button>
          ))}
        </div>
        {sensitivityProjection && (
          <div className="edi-summary-cards">
            <div className="edi-summary-card">
              <div className="card-label">Total Tax Savings (Shifted)</div>
              <div className="card-value positive">
                {formatCurrency(sensitivityProjection.summary.totalRealizedBenefit + sensitivityProjection.summary.carryforwardTaxShield)}
              </div>
              <div className="card-detail">
                vs. {formatCurrency(totalPotentialSavings)} at current rates
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">CF Shield (Shifted)</div>
              <div className="card-value highlight">
                {formatCurrency(sensitivityProjection.summary.carryforwardTaxShield)}
              </div>
              <div className="card-detail">
                vs. {formatCurrency(projection.summary.carryforwardTaxShield)} at current rates
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">Delta</div>
              <div className={`card-value ${(sensitivityProjection.summary.totalRealizedBenefit + sensitivityProjection.summary.carryforwardTaxShield) >= totalPotentialSavings ? 'positive' : ''}`}>
                {formatCurrency(
                  (sensitivityProjection.summary.totalRealizedBenefit + sensitivityProjection.summary.carryforwardTaxShield)
                  - totalPotentialSavings
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="edi-charts-section">
        <EdiTaxSavingsChart
          data={projection.years}
          strategyId={state.assumptions.strategyId}
          annualReturn={state.assumptions.annualReturn}
          washSaleRate={state.assumptions.washSaleRate}
        />
        <EdiCrossoverChart
          data={projection.years}
          strategyId={state.assumptions.strategyId}
          annualReturn={state.assumptions.annualReturn - (projectionInput.financingCostRate ?? 0)}
          combinedLtRate={combinedLtRate}
          washSaleRate={state.assumptions.washSaleRate}
        />
        <EdiEmbeddedGainChart
          data={projection.years}
          strategyId={state.assumptions.strategyId}
          annualReturn={state.assumptions.annualReturn - (projectionInput.financingCostRate ?? 0)}
          washSaleRate={state.assumptions.washSaleRate}
        />
      </div>

      {/* Year-by-Year Table */}
      <div className="edi-summary-section">
        <h3>Year-by-Year Carryforward Accumulation</h3>
        <div className="edi-table-container">
          <table className="edi-table">
            <thead>
              <tr>
                <th className="col-label"></th>
                {projection.years.map(r => (
                  <th key={r.year} className="col-year">Year {r.year}</th>
                ))}
                <th className="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {ROW_DEFINITIONS.map(rowDef => (
                <tr key={rowDef.key} className={rowDef.rowClass ?? ''}>
                  <td className="row-label">{rowDef.label}</td>
                  {projection.years.map(year => (
                    <td key={year.year} className="cell-value">
                      {formatCellValue(rowDef.format, rowDef.getValue(year))}
                    </td>
                  ))}
                  <td className="cell-total">
                    {['cfEnding', 'stCf', 'ltCf', 'collateral', 'efficiency'].includes(rowDef.key)
                      ? '—'
                      : formatCellValue(rowDef.format, projection.years.reduce((s, y) => s + rowDef.getValue(y), 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unwind Analysis */}
      <div className="edi-unwind-section">
        <h3>Strategy Unwind Analysis</h3>
        <div className="unwind-slider-row">
          <label>Unwind Year:</label>
          <input
            type="range"
            min={1}
            max={state.assumptions.projectionYears}
            value={unwindYear}
            onChange={e => setUnwindYear(parseInt(e.target.value, 10))}
          />
          <span className="unwind-year-display">Year {unwindYear}</span>
        </div>

        {selectedUnwind && (
          <div className="edi-summary-cards">
            <div className="edi-summary-card">
              <div className="card-label">Portfolio Value</div>
              <div className="card-value">{formatCurrency(selectedUnwind.portfolioValueAtUnwind)}</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">Embedded Gain</div>
              <div className="card-value">{formatCurrency(selectedUnwind.embeddedGainEstimate)}</div>
              <div className="card-detail">{(selectedUnwind.embeddedGainPct * 100).toFixed(1)}% of portfolio</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">CF Available</div>
              <div className="card-value highlight">{formatCurrency(selectedUnwind.availableCarryforward)}</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">Net Unwind Tax</div>
              <div className="card-value positive">{formatCurrency(selectedUnwind.netUnwindTax)}</div>
              <div className="card-detail">Saved: {formatCurrency(selectedUnwind.taxSavedByCf)}</div>
            </div>
          </div>
        )}

        {/* Year-by-year unwind comparison */}
        <table className="unwind-comparison-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Portfolio Value</th>
              <th>Embedded Gain</th>
              <th>CF Available</th>
              <th>Gross Unwind Tax</th>
              <th>Net Unwind Tax</th>
              <th>Tax Saved by CF</th>
            </tr>
          </thead>
          <tbody>
            {unwindByYear.map(u => (
              <tr
                key={u.unwindYear}
                className={breakEvenYear > 0 && u.unwindYear === breakEvenYear ? 'break-even-row' : ''}
              >
                <td>{u.unwindYear}</td>
                <td>{formatCurrency(u.portfolioValueAtUnwind)}</td>
                <td>{formatCurrency(u.embeddedGainEstimate)}</td>
                <td>{formatCurrency(u.availableCarryforward)}</td>
                <td>{formatCurrency(u.grossUnwindTax)}</td>
                <td>{formatCurrency(u.netUnwindTax)}</td>
                <td>{formatCurrency(u.taxSavedByCf)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {breakEvenYear > 0 && (
          <div className="estate-explanation">
            After Year {breakEvenYear}, unwinding is effectively tax-free because carryforward exceeds embedded gains.
          </div>
        )}
      </div>

      {/* Estate Comparison */}
      {estateResult && (
        <div className="edi-estate-section">
          <h3>Estate Planning Comparison (Year {unwindYear})</h3>
          <div className="estate-comparison-grid">
            <div className={`estate-option ${estateResult.recommendation === 'continue' ? 'recommended' : ''}`}>
              <h4>Hold for Step-Up</h4>
              <div className="estate-metric">
                <span className="estate-label">Step-up value</span>
                <span className="estate-value">{formatCurrency(estateResult.continueAndDie.stepUpValue)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">CF lost at death</span>
                <span className="estate-value">{formatCurrency(estateResult.continueAndDie.carryforwardValueLost)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Net benefit</span>
                <span className="estate-value">{formatCurrency(estateResult.continueAndDie.netBenefit)}</span>
              </div>
            </div>

            <div className={`estate-option ${estateResult.recommendation === 'unwind' ? 'recommended' : ''}`}>
              <h4>Full Unwind</h4>
              <div className="estate-metric">
                <span className="estate-label">Embedded gains</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.embeddedGains)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">CF used</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Tax paid</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.taxPaid)}</span>
              </div>
            </div>

            <div className={`estate-option ${estateResult.recommendation === 'partial_unwind' ? 'recommended' : ''}`}>
              <h4>Partial Unwind</h4>
              <div className="estate-metric">
                <span className="estate-label">Optimal unwind</span>
                <span className="estate-value">{(estateResult.optimalUnwindPct * 100).toFixed(0)}%</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Unwind tax-free</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Keep for step-up</span>
                <span className="estate-value">{(100 - estateResult.optimalUnwindPct * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div className="estate-explanation">{estateResult.explanation}</div>

          {estateResult.recommendation === 'partial_unwind' && (
            <div className="estate-detail-callout">
              <strong>Optimal Strategy:</strong> Unwind {formatCurrency(selectedUnwind!.portfolioValueAtUnwind * estateResult.optimalUnwindPct)} of portfolio
              using {formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)} in CF.
              Remaining {formatCurrency(selectedUnwind!.portfolioValueAtUnwind * (1 - estateResult.optimalUnwindPct))} gets step-up at death.
            </div>
          )}

          <p className="estate-disclaimer">
            Carryforwards are lost at death (IRC Section 1212(b)). Positions receive step-up in basis (IRC Section 1014).
            Federal estate tax exclusion ($13.99M per individual, 2026) not modeled. Consult estate planning attorney before making decisions.
          </p>
        </div>
      )}

      {/* Strategy Cost & Protection Build */}
      <div className="edi-economics-section">
        <h3>Strategy Cost &amp; Protection Build</h3>
        <div className="edi-summary-cards">
          <div className="edi-summary-card">
            <div className="card-label">Total Incremental Cost ({state.assumptions.projectionYears}yr)</div>
            <div className="card-value">{formatCurrency(economics.summary.totalIncrementalCost)}</div>
            <div className="card-detail">
              Financing only ({(incrementalFinancingCost * 100).toFixed(2)}%) — advisory excluded
            </div>
          </div>
          <div className="edi-summary-card">
            <div className="card-label">Total CF Protection Built</div>
            <div className="card-value positive">{formatCurrency(economics.summary.totalCfProtection)}</div>
            <div className="card-detail">Tax shield: {formatCurrency(economics.summary.totalCfProtection * combinedLtRate)}</div>
          </div>
          <div className="edi-summary-card">
            <div className="card-label">Protection Ratio</div>
            <div className="card-value positive">
              {economics.summary.protectionToCostRatio.toFixed(1)}x
            </div>
            <div className="card-detail">
              Break-even gain event: {formatCurrency(economics.summary.breakEvenGainEvent)}
            </div>
          </div>
        </div>
        <div className="edi-table-container">
          <table className="edi-table">
            <thead>
              <tr>
                <th className="col-label"></th>
                {economics.years.map(y => (
                  <th key={y.year} className="col-year">Year {y.year}</th>
                ))}
                <th className="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-label">Annual Financing Cost (Incremental)</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-negative">{formatCurrency(y.financingCost)}</span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-negative">{formatCurrency(economics.summary.totalIncrementalCost)}</span>
                </td>
              </tr>
              <tr className="row-muted">
                <td className="row-label">Advisory Fee <span className="muted-note">(paid regardless)</span></td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value cell-muted">
                    {formatCurrency(y.advisoryFee)}
                  </td>
                ))}
                <td className="cell-total cell-muted">
                  {formatCurrency(economics.summary.totalAdvisoryFee)}
                </td>
              </tr>
              <tr>
                <td className="row-label">CF Protection Built</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-positive">{formatCurrency(y.cfProtectionBuilt)}</span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-positive">{formatCurrency(economics.summary.totalCfProtection)}</span>
                </td>
              </tr>
              <tr className="row-highlight">
                <td className="row-label">Cumulative CF Protection</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-highlight">{formatCurrency(y.cumulativeCfProtection)}</span>
                  </td>
                ))}
                <td className="cell-total">—</td>
              </tr>
              <tr>
                <td className="row-label">Protection-to-Cost Ratio</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className={y.protectionToCostRatio >= 1 ? 'edi-cell-positive' : ''}>
                      {y.protectionToCostRatio.toFixed(1)}x
                    </span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-positive">{economics.summary.protectionToCostRatio.toFixed(1)}x</span>
                </td>
              </tr>
              <tr>
                <td className="row-label">Break-Even Gain Event</td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    {formatCurrency(y.breakEvenGainEvent)}
                  </td>
                ))}
                <td className="cell-total">
                  {formatCurrency(economics.summary.breakEvenGainEvent)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategy Comparison */}
      <div className="edi-strategy-comparison-section">
        <h3>
          Strategy Comparison
          <button
            className="toggle-btn"
            onClick={() => setShowStrategyComparison(!showStrategyComparison)}
          >
            {showStrategyComparison ? 'Hide' : 'Show All Strategies'}
          </button>
        </h3>
        {showStrategyComparison && strategyComparison.length > 0 && (
          <div className="edi-table-container">
            <table className="edi-table strategy-comparison-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Type</th>
                  <th>Financing</th>
                  <th>Tax Savings</th>
                  <th>Final CF</th>
                  <th>Incr. Cost</th>
                  <th>Protection Ratio</th>
                  <th>Break-Even Gain</th>
                  <th>Tax-Free Exit</th>
                </tr>
              </thead>
              <tbody>
                {strategyComparison.map(s => (
                  <tr
                    key={s.id}
                    className={s.id === state.assumptions.strategyId ? 'current-strategy-row' : ''}
                  >
                    <td>{s.name}{s.id === state.assumptions.strategyId ? ' *' : ''}</td>
                    <td>{s.type === 'core' ? 'Core' : 'Overlay'}</td>
                    <td>{(s.financingRate * 100).toFixed(1)}%</td>
                    <td>{formatCurrency(s.totalTaxSavings)}</td>
                    <td>{formatCurrency(s.finalCf)}</td>
                    <td>{formatCurrency(s.totalCost)}</td>
                    <td className={s.protectionRatio >= 1 ? 'cell-positive' : 'cell-negative'}>
                      {s.protectionRatio.toFixed(1)}x
                    </td>
                    <td>{formatCurrency(s.breakEvenGain)}</td>
                    <td>{s.breakEven > 0 ? `Year ${s.breakEven}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Baseline Comparison — collapsed by default */}
      <div className="edi-baseline-section">
        <h3>
          Worst-Case: No Gain Event (Full Liquidation)
          <button
            className="toggle-btn"
            onClick={() => setShowBaselineComparison(!showBaselineComparison)}
          >
            {showBaselineComparison ? 'Hide' : 'Show'}
          </button>
        </h3>
        <p className="section-subtitle">
          Compares after-tax wealth at full liquidation. EDI return reduced by financing drag. Advisory fee excluded (common).
          <strong> Note: EDI value is in tax protection for external events, not terminal wealth.</strong>
        </p>
        {showBaselineComparison && (
          <>
            <div className="edi-summary-cards">
              <div className="edi-summary-card">
                <div className="card-label">Passive After-Tax (Year {state.assumptions.projectionYears})</div>
                <div className="card-value">{formatCurrency(baseline.terminalPassive)}</div>
              </div>
              <div className="edi-summary-card">
                <div className="card-label">EDI After-Tax (Year {state.assumptions.projectionYears})</div>
                <div className="card-value">{formatCurrency(baseline.terminalEdi)}</div>
              </div>
              <div className="edi-summary-card">
                <div className="card-label">EDI Advantage</div>
                <div className={`card-value ${baseline.ediAdvantage >= 0 ? 'positive' : ''}`}>
                  {formatCurrency(baseline.ediAdvantage)} ({baseline.ediAdvantage >= 0 ? '+' : ''}{(baseline.ediAdvantagePct * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
            <div className="edi-table-container">
              <table className="edi-table">
                <thead>
                  <tr>
                    <th className="col-label"></th>
                    {baseline.years.map(y => (
                      <th key={y.year} className="col-year">Year {y.year}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="row-label">Passive Gross Value</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">{formatCurrency(y.passiveValue)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Passive Exit Tax</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-negative">{formatCurrency(y.passiveExitTax)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="row-highlight">
                    <td className="row-label">Passive After-Tax</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-highlight">{formatCurrency(y.passiveAfterTax)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">EDI Value (after financing drag)</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">{formatCurrency(y.ediValue)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">EDI Embedded Gain</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">{formatCurrency(y.ediEmbeddedGain)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">EDI Exit Tax (after CF shelter)</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-negative">{formatCurrency(y.ediExitTax)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="row-highlight">
                    <td className="row-label">EDI After-Tax</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-highlight">{formatCurrency(y.ediAfterTax)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="row-positive">
                    <td className="row-label">EDI Advantage</td>
                    {baseline.years.map(y => (
                      <td key={y.year} className="cell-value">
                        <span className={y.ediAdvantage >= 0 ? 'edi-cell-positive' : 'edi-cell-negative'}>
                          {formatCurrency(y.ediAdvantage)}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* How This Strategy Works */}
      <div className="edi-how-it-works-section">
        <h3>
          How Does This Strategy Generate Tax Losses?
          <button
            className="toggle-btn"
            onClick={() => setShowHowItWorks(!showHowItWorks)}
          >
            {showHowItWorks ? 'Hide' : 'Show'}
          </button>
        </h3>
        {showHowItWorks && strategy && (
          <div className="how-it-works-content">
            <p>
              {strategy.name} creates {strategy.type === 'core' ? 'a cash-funded' : 'an overlay'} portfolio with{' '}
              {((getLongLeverageRatio(strategy) + (strategy.type === 'core' ? 1 : 0)) * 100).toFixed(0)}% long
              / {(getShortRatio(strategy) * 100).toFixed(0)}% short positions.
              Active rebalancing harvests short-term losses as individual positions decline,
              while long-term gains arise from holding period transitions on appreciated positions.
              The key: ST losses shelter LT gains via IRC netting, and excess flows to carryforward.
            </p>
            <table className="edi-table how-it-works-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Strategy Type</td>
                  <td>{strategy.type === 'core' ? 'Core (Cash Funded)' : 'Overlay (Collateral-Based)'}</td>
                </tr>
                <tr>
                  <td>Gross Exposure</td>
                  <td>{((getLongLeverageRatio(strategy) + (strategy.type === 'core' ? 1 : 0) + getShortRatio(strategy)) * 100).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>Long Ratio</td>
                  <td>{((getLongLeverageRatio(strategy) + (strategy.type === 'core' ? 1 : 0)) * 100).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>Short Ratio</td>
                  <td>{(getShortRatio(strategy) * 100).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>Year 1 ST Loss Rate</td>
                  <td>{(getStLossRateForYear(strategy, 1) * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td>Steady-State ST Loss Rate</td>
                  <td>{(getStLossRateForYear(strategy, 10) * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td>LT Gain Rate</td>
                  <td>{(strategy.ltGainRate * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td>Tracking Error</td>
                  <td>{strategy.trackingErrorDisplay}</td>
                </tr>
                <tr>
                  <td>Incremental Financing Cost</td>
                  <td>{(incrementalFinancingCost * 100).toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
            <p className="how-it-works-note">
              Harvesting efficiency declines over time as the portfolio matures (Year 1: {(getStLossRateForYear(strategy, 1) * 100).toFixed(1)}% ST loss rate
              vs. Year 10: {(getStLossRateForYear(strategy, 10) * 100).toFixed(1)}%). This is expected — early years generate the most tax benefit.
            </p>
          </div>
        )}
      </div>

      {/* NIIT Impact Breakout */}
      <div className="edi-niit-section">
        <h4>NIIT Impact Breakout</h4>
        <p className="section-subtitle">
          The 3.8% Net Investment Income Tax (NIIT) applies to capital gains but NOT to the $3K ordinary income deduction.
        </p>
        <div className="edi-summary-cards">
          <div className="edi-summary-card">
            <div className="card-label">Combined ST Rate (incl. NIIT)</div>
            <div className="card-value">{(combinedStRate * 100).toFixed(1)}%</div>
            <div className="card-detail">Includes 3.8% NIIT + state rate</div>
          </div>
          <div className="edi-summary-card">
            <div className="card-label">Combined LT Rate (incl. NIIT)</div>
            <div className="card-value">{(combinedLtRate * 100).toFixed(1)}%</div>
          </div>
          <div className="edi-summary-card">
            <div className="card-label">$3K Deduction Effective Rate</div>
            <div className="card-value">{((combinedStRate - 0.038) * 100).toFixed(1)}%</div>
            <div className="card-detail">Excludes 3.8% NIIT (offsets ordinary income only)</div>
          </div>
          <div className="edi-summary-card">
            <div className="card-label">Annual NIIT Exclusion Benefit</div>
            <div className="card-value positive">{formatCurrency(3000 * 0.038)}</div>
            <div className="card-detail">Per-year savings from correct NIIT treatment</div>
          </div>
        </div>
      </div>

      {/* Notes & Disclosures */}
      <div className="edi-notes">
        <h4>Calculation Notes &amp; Disclosures</h4>
        <ul>
          <li>
            <strong>ST Losses Shelter LT Gains:</strong> Under IRC netting rules, short-term losses offset long-term gains before contributing to carryforward.
          </li>
          <li>
            <strong>$3K Deduction:</strong> Only excess capital losses (after netting) can offset ordinary income, limited to $3K/year ($1.5K for MFS). NIIT (3.8%) is excluded from this deduction rate since it offsets ordinary income, not net investment income.
          </li>
          <li>
            <strong>No Annual Limit on CF vs Gains:</strong> A $5M carryforward can shelter $5M in realized gains in a single year. There is no annual limit on using carryforwards to offset capital gains.
          </li>
          <li>
            <strong>Carryforwards Retain Character:</strong> ST stays ST, LT stays LT. Same-character offsets first, then cross-applies per IRC Section 1212(b).
          </li>
          <li>
            <strong>Embedded Gain:</strong> Grows from market appreciation plus basis reduction from harvesting. Estimated using strategy loss rates. Actual embedded gain may differ based on individual lot selection and market conditions.
          </li>
          <li>
            <strong>Tax Rates:</strong> Combined rates include federal ({combinedStRate > 0.5 ? '37%' : '≤37%'} ordinary / {combinedLtRate > 0.3 ? '20%' : '≤20%'} LTCG), 3.8% NIIT, and state tax. Rates assume income above NIIT thresholds.
          </li>
          <li>
            <strong>Strategy Costs:</strong> Financing cost ({((incrementalFinancingCost) * 100).toFixed(1)}%) includes margin interest, stock borrow fees, and short dividend costs. Advisory fee is user-adjustable and represents the wealth management fee on NAV.
          </li>
          <li>
            <strong>Investment Interest Deductibility (IRC §163(d)):</strong> Margin interest and short borrow costs may be deductible against net investment income. For HNW clients with substantial NII, this deduction could reduce the effective after-tax cost of financing by 20-37%. Protection ratios and break-even calculations shown here assume financing costs are fully non-deductible (conservative).
          </li>
          <li>
            <strong>Carryforwards Lost at Death:</strong> Per IRC Section 1212(b), capital loss carryforwards expire at death and cannot be transferred. Positions receive step-up in basis per IRC Section 1014(a).
          </li>
          <li>
            <strong>Baseline Comparison:</strong> Passive baseline assumes identical return with no TLH, no financing costs. Advisory fee excluded from both (common expense). EDI incremental cost = financing cost only.
          </li>
          <li>
            <strong>Not Tax Advice:</strong> This calculator is for informational purposes only. Tax calculations are estimates based on stated assumptions. Consult a qualified tax advisor for individual tax planning.
          </li>
        </ul>
      </div>

      {/* Export */}
      <div className="edi-export-section">
        <button
          className="btn-export"
          onClick={() => {
            const lines: string[] = [];
            lines.push(`EDI-Only Analysis Summary`);
            lines.push(`Strategy: ${strategy?.name ?? state.assumptions.strategyId}`);
            lines.push(`Collateral: ${formatCurrency(state.assumptions.collateralValue)}`);
            lines.push(`Annual Return: ${(state.assumptions.annualReturn * 100).toFixed(1)}%`);
            lines.push(`Projection: ${state.assumptions.projectionYears} years`);
            lines.push(`Combined ST Rate: ${(combinedStRate * 100).toFixed(1)}% | LT Rate: ${(combinedLtRate * 100).toFixed(1)}%`);
            lines.push('');
            lines.push(`Total Potential Tax Savings: ${formatCurrency(totalPotentialSavings)}`);
            lines.push(`  Realized: ${formatCurrency(projection.summary.totalRealizedBenefit)} (cumulative $3K deductions)`);
            lines.push(`  Contingent: ${formatCurrency(projection.summary.carryforwardTaxShield)} (requires gain event)`);
            lines.push(`Final Carryforward: ${formatCurrency(projection.summary.finalCarryforward)}`);
            lines.push(`  ST: ${formatCurrency(lastYear?.endingStCarryforward ?? 0)} | LT: ${formatCurrency(lastYear?.endingLtCarryforward ?? 0)}`);
            lines.push(`Protection Ratio: ${economics.summary.protectionToCostRatio.toFixed(1)}x`);
            lines.push(`Break-Even Gain Event: ${formatCurrency(economics.summary.breakEvenGainEvent)}`);
            lines.push(`Break-Even Year: ${breakEvenYear > 0 ? `Year ${breakEvenYear}` : 'Not reached'}`);
            lines.push('');
            lines.push('Year-by-Year:');
            lines.push('Year | Collateral | ST Losses | LT Gains | CF | Net Benefit');
            projection.years.forEach((yr, i) => {
              const econ = economics.years[i];
              lines.push(`${yr.year} | ${formatCurrency(yr.collateralValue)} | ${formatCurrency(yr.stLossesHarvested)} | ${formatCurrency(yr.ltGainsRealized)} | ${formatCurrency(yr.endingStCarryforward + yr.endingLtCarryforward)} | ${econ?.protectionToCostRatio.toFixed(1) ?? '—'}x`);
            });
            navigator.clipboard.writeText(lines.join('\n'));
          }}
        >
          Copy Summary to Clipboard
        </button>
      </div>
    </div>
  );
}
