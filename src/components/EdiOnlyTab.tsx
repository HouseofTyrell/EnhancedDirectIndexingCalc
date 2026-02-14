import { useReducer, useCallback, useMemo, useState } from 'react';
import { FilingStatus } from '../types';
import type {
  EdiPinnedScenario,
  EdiPinnedAssumptions,
  EdiPinnedTaxRates,
  EdiPinnedResults,
} from '../types';
import {
  STRATEGIES,
  computeIncrementalFinancingCost,
  getLongLeverageRatio,
  getShortRatio,
  getStLossRateForYear,
} from '../strategyData';
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
  type BaselineComparisonYear,
} from '../calculations/ediOnly';
import { useScrollHeader } from '../hooks/useScrollHeader';
import { EdiStickyHeader } from './EdiStickyHeader';
import { EdiComparisonPanel } from './EdiComparisonPanel';
import { EdiTaxSavingsChart, EdiEmbeddedGainChart, EdiCrossoverChart } from './EdiCharts';
import { InfoText } from '../InfoPopup';
import './EdiOnlyTab.css';

interface EdiOnlyTabProps {
  filingStatus: FilingStatus;
  combinedStRate: number;
  combinedLtRate: number;
  stateCode?: string;
  pinned: EdiPinnedScenario | null;
  hasPinned: boolean;
  onPin: (
    assumptions: EdiPinnedAssumptions,
    taxRates: EdiPinnedTaxRates,
    results: EdiPinnedResults
  ) => void;
  onUnpin: () => void;
  onReplacePin: (
    assumptions: EdiPinnedAssumptions,
    taxRates: EdiPinnedTaxRates,
    results: EdiPinnedResults
  ) => void;
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
  infoKey?: string;
}

const ROW_DEFINITIONS: RowDef[] = [
  {
    key: 'collateral',
    label: 'Collateral Value',
    getValue: r => r.collateralValue,
    format: 'currency',
    infoKey: 'edi-collateral-value-row',
  },
  {
    key: 'stLosses',
    label: 'ST Losses Harvested',
    getValue: r => r.stLossesHarvested,
    format: 'negative',
    infoKey: 'edi-st-losses-harvested',
  },
  {
    key: 'ltGains',
    label: 'LT Gains Realized',
    getValue: r => r.ltGainsRealized,
    format: 'currency',
    infoKey: 'edi-lt-gains-realized',
  },
  {
    key: 'stUsed',
    label: 'ST Losses Offsetting LT Gains',
    getValue: r => r.stLossesUsedToOffsetLtGains,
    format: 'currency',
    infoKey: 'edi-st-offset-lt',
  },
  {
    key: 'priorCfUsed',
    label: 'Prior CF Used vs LT Gains',
    getValue: r => r.priorCfUsedAgainstLtGains,
    format: 'currency',
    infoKey: 'edi-prior-cf-used',
  },
  {
    key: 'ltGainsTax',
    label: 'Tax on Remaining LT Gains',
    getValue: r => r.taxOnRemainingLtGains,
    format: 'negative',
    infoKey: 'edi-tax-remaining-lt',
  },
  {
    key: 'excess',
    label: 'Excess ST Loss to CF',
    getValue: r => r.excessStLossAfterOffset,
    format: 'highlight',
    rowClass: 'row-highlight',
    infoKey: 'edi-excess-st-to-cf',
  },
  {
    key: 'deduction',
    label: '$3K Capital Loss Deduction',
    getValue: r => r.capitalLossDeduction,
    format: 'currency',
    infoKey: 'edi-capital-loss-deduction',
  },
  {
    key: 'taxSaved',
    label: 'Tax Saved (Deduction)',
    getValue: r => r.taxSavedByCapitalLossDeduction,
    format: 'positive',
    rowClass: 'row-positive',
    infoKey: 'edi-tax-saved-deduction',
  },
  {
    key: 'benefit',
    label: 'Net Annual Realized Benefit',
    getValue: r => r.annualRealizedBenefit,
    format: 'positive',
    rowClass: 'row-positive',
    infoKey: 'edi-net-annual-benefit',
  },
  {
    key: 'stCf',
    label: 'ST Carryforward',
    getValue: r => r.endingStCarryforward,
    format: 'highlight',
    rowClass: 'row-highlight',
    infoKey: 'edi-st-carryforward',
  },
  {
    key: 'ltCf',
    label: 'LT Carryforward',
    getValue: r => r.endingLtCarryforward,
    format: 'currency',
    infoKey: 'edi-lt-carryforward',
  },
  {
    key: 'cfEnding',
    label: 'Total Carryforward',
    getValue: r => r.endingStCarryforward + r.endingLtCarryforward,
    format: 'highlight',
    rowClass: 'row-highlight',
    infoKey: 'edi-total-carryforward',
  },
  {
    key: 'efficiency',
    label: 'Harvesting Efficiency (ST/LT)',
    getValue: r => r.harvestingEfficiency,
    format: 'ratio',
    infoKey: 'edi-harvesting-efficiency',
  },
];

function formatCellValue(format: RowDef['format'], value: number) {
  if (format === 'ratio') {
    if (!Number.isFinite(value)) return <span className="edi-cell-ratio">N/A</span>;
    return <span className="edi-cell-ratio">{value.toFixed(1)}x</span>;
  }
  const formatted = formatCurrency(value);
  switch (format) {
    case 'highlight':
      return <span className="edi-cell-highlight">{formatted}</span>;
    case 'positive':
      return <span className="edi-cell-positive">{formatted}</span>;
    case 'negative':
      return <span className="edi-cell-negative">{formatted}</span>;
    default:
      return formatted;
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
    const fcr = strat
      ? computeIncrementalFinancingCost(
          strat,
          state.assumptions.brokerMarginRate,
          state.assumptions.shortBorrowRate,
          state.assumptions.shortDividendRate
        )
      : 0.015;
    return {
      ...state.assumptions,
      combinedStRate,
      combinedLtRate,
      filingStatus,
      financingCostRate: fcr,
    };
  }, [state.assumptions, combinedStRate, combinedLtRate, filingStatus]);

  const projection = useMemo(() => computeEdiProjection(projectionInput), [projectionInput]);

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
      state.assumptions.shortDividendRate
    );
  }, [
    strategy,
    state.assumptions.brokerMarginRate,
    state.assumptions.shortBorrowRate,
    state.assumptions.shortDividendRate,
  ]);

  // Strategy economics (net-of-fee ROI, tax alpha, cash flow)
  const economics = useMemo(
    () =>
      computeStrategyEconomics(
        projection,
        incrementalFinancingCost,
        state.assumptions.advisoryFeeRate,
        combinedLtRate
      ),
    [projection, incrementalFinancingCost, state.assumptions.advisoryFeeRate, combinedLtRate]
  );

  // Baseline comparison (passive vs trad DI vs EDI, advisory fee excluded as common to all)
  const baseline = useMemo(
    () =>
      computeBaselineComparison(
        projection,
        state.assumptions.collateralValue,
        state.assumptions.annualReturn,
        incrementalFinancingCost,
        combinedLtRate,
        state.assumptions.strategyId,
        state.assumptions.washSaleRate,
        filingStatus
      ),
    [projection, state.assumptions, incrementalFinancingCost, combinedLtRate, filingStatus]
  );

  // Strategy comparison across all strategies
  const [showBaselineComparison, setShowBaselineComparison] = useState(true);
  const [showStrategyComparison, setShowStrategyComparison] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showFinancingDetails, setShowFinancingDetails] = useState(false);
  const [showYearByYear, setShowYearByYear] = useState(false);
  const [showTaxRateSensitivity, setShowTaxRateSensitivity] = useState(false);
  const strategyComparison = useMemo(() => {
    if (!showStrategyComparison) return [];
    return STRATEGIES.map(s => {
      const sFinancing = computeIncrementalFinancingCost(
        s,
        state.assumptions.brokerMarginRate,
        state.assumptions.shortBorrowRate,
        state.assumptions.shortDividendRate
      );
      const proj = computeEdiProjection({
        ...projectionInput,
        strategyId: s.id,
        financingCostRate: sFinancing,
      });
      const econ = computeStrategyEconomics(
        proj,
        sFinancing,
        state.assumptions.advisoryFeeRate,
        combinedLtRate
      );
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
        breakEven:
          proj.years.findIndex((_, i) => {
            const u = calculateUnwindAnalysis({
              unwindYear: i + 1,
              projection: proj,
              strategyId: s.id,
              annualReturn: state.assumptions.annualReturn,
              combinedLtRate,
              washSaleRate: state.assumptions.washSaleRate,
              financingCostRate: sFinancing,
            });
            return u.availableCarryforward >= u.embeddedGainEstimate;
          }) + 1,
        embeddedGainPct: lastYr
          ? estimateEmbeddedGainPct(
              s.id,
              state.assumptions.projectionYears,
              state.assumptions.annualReturn - sFinancing,
              state.assumptions.washSaleRate
            )
          : 0,
      };
    });
  }, [showStrategyComparison, projectionInput, state.assumptions, combinedLtRate]);

  // Strategy x Scenario matrix: which strategy is best for each life event
  const [showScenarioMatrix, setShowScenarioMatrix] = useState(false);
  const scenarioMatrix = useMemo(() => {
    if (!showScenarioMatrix) return null;
    const matrixScenarios = getDefaultScenarios(state.assumptions.collateralValue);

    const strategyResults = STRATEGIES.map(s => {
      const sFinancing = computeIncrementalFinancingCost(
        s,
        state.assumptions.brokerMarginRate,
        state.assumptions.shortBorrowRate,
        state.assumptions.shortDividendRate
      );
      const proj = computeEdiProjection({
        ...projectionInput,
        strategyId: s.id,
        financingCostRate: sFinancing,
      });
      const econ = computeStrategyEconomics(
        proj,
        sFinancing,
        state.assumptions.advisoryFeeRate,
        combinedLtRate
      );
      const scenarioTaxSaved = matrixScenarios.map(sc => {
        const result = computeScenarioResults(sc, proj, combinedStRate, combinedLtRate);
        return {
          scenario: sc,
          taxSaved: result.taxSaved,
          taxWithCf: result.taxWithCarryforward,
          taxWithoutCf: result.taxWithoutCarryforward,
          cfUsed: result.carryforwardUsed,
          netValue:
            result.taxSaved -
            econ.years
              .slice(0, Math.min(sc.yearOfEvent, econ.years.length))
              .reduce((sum, y) => sum + y.financingCost, 0),
        };
      });
      return {
        id: s.id,
        name: s.name,
        type: s.type as 'core' | 'overlay',
        financingRate: sFinancing,
        scenarioTaxSaved,
      };
    });

    // For each scenario, find the best strategy (highest netValue)
    const bestPerScenario = matrixScenarios.map((_, scIdx) => {
      let bestId = '';
      let bestNet = -Infinity;
      strategyResults.forEach(sr => {
        if (sr.scenarioTaxSaved[scIdx].netValue > bestNet) {
          bestNet = sr.scenarioTaxSaved[scIdx].netValue;
          bestId = sr.id;
        }
      });
      return bestId;
    });

    return { scenarios: matrixScenarios, strategies: strategyResults, bestPerScenario };
  }, [showScenarioMatrix, projectionInput, state.assumptions, combinedStRate, combinedLtRate]);

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
  }, [
    customGainAmount,
    customGainCharacter,
    customGainYear,
    projection,
    combinedStRate,
    combinedLtRate,
  ]);

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
  const currentAssumptions: EdiPinnedAssumptions = useMemo(
    () => ({
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
    }),
    [state.assumptions]
  );

  const currentTaxRates: EdiPinnedTaxRates = useMemo(
    () => ({
      combinedStRate,
      combinedLtRate,
      filingStatus,
      stateCode: stateCode ?? 'CA',
    }),
    [combinedStRate, combinedLtRate, filingStatus, stateCode]
  );

  const lastYear = projection.years[projection.years.length - 1];
  // Total potential tax savings = realized benefit ($3K deductions) + carryforward tax shield
  const totalPotentialSavings =
    projection.summary.totalRealizedBenefit + projection.summary.carryforwardTaxShield;
  const currentResults: EdiPinnedResults = useMemo(
    () => ({
      totalTaxSavings:
        projection.summary.totalRealizedBenefit + projection.summary.carryforwardTaxShield,
      totalCarryforwardBuilt: projection.summary.finalCarryforward,
      finalStCarryforward: lastYear?.endingStCarryforward ?? 0,
      finalLtCarryforward: lastYear?.endingLtCarryforward ?? 0,
      finalEmbeddedGainPct: estimateEmbeddedGainPct(
        state.assumptions.strategyId,
        state.assumptions.projectionYears,
        state.assumptions.annualReturn - (projectionInput.financingCostRate ?? 0),
        state.assumptions.washSaleRate
      ),
    }),
    [projection, lastYear, state.assumptions]
  );

  const handlePin = useCallback(() => {
    onPin(currentAssumptions, currentTaxRates, currentResults);
  }, [onPin, currentAssumptions, currentTaxRates, currentResults]);

  const handleReplacePin = useCallback(() => {
    onReplacePin(currentAssumptions, currentTaxRates, currentResults);
  }, [onReplacePin, currentAssumptions, currentTaxRates, currentResults]);

  // Pinned values for sticky header delta display
  const pinnedValues = pinned
    ? {
        collateral: pinned.assumptions.collateralValue,
        totalTaxSavings: pinned.results.totalTaxSavings,
        totalCarryforward: pinned.results.totalCarryforwardBuilt,
      }
    : undefined;

  return (
    <div className="edi-only-tab">
      {/* ===== SECTION 1: Sticky Header ===== */}
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

      {/* ===== SECTION 2: Comparison Panel (conditional) ===== */}
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

      {/* ===== SECTION 3: State-Specific Warnings ===== */}
      {stateCode === 'PA' && (
        <div className="state-warning-banner">
          <strong>Pennsylvania Note:</strong> PA does not conform to federal capital loss
          carryforward rules. Accumulated carryforwards provide no PA state tax benefit. The federal
          benefit calculations shown here do not include PA state savings.
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

      {/* ===== SECTION 4: Assumptions (financing details collapsed) ===== */}
      <div className="edi-assumptions-section">
        <h3>Assumptions</h3>
        <div className="edi-assumptions-grid">
          <div className="edi-assumption-row">
            <label>
              <InfoText contentKey="edi-collateral-value">Collateral Value</InfoText>
            </label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(state.assumptions.collateralValue)}
                onChange={e =>
                  handleChange('collateralValue', parseFormattedNumber(e.target.value))
                }
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
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>
              <InfoText contentKey="edi-annual-return">Annual Portfolio Return</InfoText>
            </label>
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
            <label>
              <InfoText contentKey="edi-wash-sale-rate">Wash Sale Rate</InfoText>
            </label>
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
                onChange={e =>
                  handleChange('existingStCarryforward', parseFormattedNumber(e.target.value))
                }
              />
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>
              <InfoText contentKey="edi-advisory-fee">Advisory Fee Rate</InfoText>
            </label>
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
            <label>
              <InfoText contentKey="edi-incremental-financing">Incremental Financing Cost</InfoText>
            </label>
            <div className="edi-computed-value">
              {(incrementalFinancingCost * 100).toFixed(2)}%
              <button
                type="button"
                className="toggle-btn financing-toggle"
                onClick={() => setShowFinancingDetails(!showFinancingDetails)}
              >
                {showFinancingDetails ? 'Hide Details' : 'Details'}
              </button>
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
                  <option key={n} value={n}>
                    {n} years
                  </option>
                ))}
              </select>
            </div>
          </div>
          {showFinancingDetails && (
            <>
              <div className="edi-assumption-row">
                <label>
                  <InfoText contentKey="edi-broker-margin-rate">Broker Margin Rate</InfoText>
                </label>
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
                <label>
                  <InfoText contentKey="edi-short-borrow-rate">Short Borrow Rate</InfoText>
                </label>
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
                <label>
                  <InfoText contentKey="edi-short-dividend-cost">Short Dividend Cost</InfoText>
                </label>
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
            </>
          )}
        </div>
        <div className="edi-assumptions-footer">
          <button type="button" onClick={handleReset} className="btn-reset">
            Reset to Defaults
          </button>
          <span className="filing-status-note">
            ST Rate: {(combinedStRate * 100).toFixed(1)}% | LT Rate:{' '}
            {(combinedLtRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* ===== SECTION 5: Summary Cards (4 balanced: cost + benefit) ===== */}
      <div className="edi-summary-cards">
        <div className="edi-summary-card card-cost">
          <div className="card-label">
            <InfoText contentKey="edi-cumulative-financing">Total Financing Cost</InfoText>
          </div>
          <div className="card-value negative">
            {formatCurrency(economics.summary.totalIncrementalCost)}
          </div>
          <div className="card-detail">
            {(incrementalFinancingCost * 100).toFixed(2)}% over {state.assumptions.projectionYears}{' '}
            years
          </div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">
            <InfoText contentKey="edi-potential-tax-protection">Total CF Tax Shield</InfoText>
          </div>
          <div className="card-value positive">
            {formatCurrency(projection.summary.carryforwardTaxShield)}
          </div>
          <div className="card-detail">
            CF: {formatCurrency(projection.summary.finalCarryforward)} at{' '}
            {(combinedLtRate * 100).toFixed(1)}% rate
          </div>
          <div className="card-detail muted">Contingent on gain event</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">
            <InfoText contentKey="edi-protection-ratio">Protection Ratio</InfoText>
          </div>
          <div className="card-value positive">
            {economics.summary.protectionToCostRatio.toFixed(1)}x
          </div>
          <div className="card-detail">CF tax shield / cumulative financing cost</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">
            <InfoText contentKey="edi-break-even-gain">Break-Even Gain Event</InfoText>
          </div>
          <div className="card-value">{formatCurrency(economics.summary.breakEvenGainEvent)}</div>
          <div className="card-detail">Gain needed to recover financing cost</div>
          <div className="card-detail muted">
            Tax-free exit: {breakEvenYear > 0 ? `Year ${breakEvenYear}` : 'Not reached'}
          </div>
        </div>
      </div>

      {/* ===== SECTION 6: Charts (Tax Savings + Crossover) ===== */}
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
      </div>

      {/* ===== SECTION 7: Why EDI? Liquidation Comparison (expanded by default) ===== */}
      <div className="edi-baseline-section">
        <h3>
          Why EDI? Passive vs Traditional DI vs EDI
          <button
            className="toggle-btn"
            onClick={() => setShowBaselineComparison(!showBaselineComparison)}
          >
            {showBaselineComparison ? 'Hide' : 'Show'}
          </button>
        </h3>
        <p className="section-subtitle">
          Compares after-tax wealth if the entire portfolio is liquidated. Traditional DI =
          long-only tax-loss harvesting (industry benchmarks). EDI includes financing drag. Advisory
          fee excluded (common to all).
        </p>
        {showBaselineComparison && (
          <>
            <div className="edi-summary-cards">
              <div className="edi-summary-card">
                <div className="card-label">
                  <InfoText contentKey="edi-passive-after-tax">Passive After-Tax</InfoText>
                </div>
                <div className="card-value">{formatCurrency(baseline.terminalPassive)}</div>
                <div className="card-detail">Year {state.assumptions.projectionYears} — no TLH</div>
              </div>
              <div className="edi-summary-card">
                <div className="card-label">
                  <InfoText contentKey="edi-trad-di-after-tax">Traditional DI After-Tax</InfoText>
                </div>
                <div className="card-value">{formatCurrency(baseline.terminalTradDi)}</div>
                <div className="card-detail">Long-only TLH (industry benchmark)</div>
              </div>
              <div className="edi-summary-card">
                <div className="card-label">
                  <InfoText contentKey="edi-edi-after-tax">EDI After-Tax</InfoText>
                </div>
                <div className="card-value">{formatCurrency(baseline.terminalEdi)}</div>
                <div className="card-detail">Overlay + financing drag</div>
              </div>
              <div className="edi-summary-card">
                <div className="card-label">
                  <InfoText contentKey="edi-tlh-benefit">TLH Benefit</InfoText>
                </div>
                <div className={`card-value ${baseline.tradDiAdvantage >= 0 ? 'positive' : ''}`}>
                  {formatCurrency(baseline.tradDiAdvantage)}
                </div>
                <div className="card-detail">Trad DI vs Passive — basic TLH value</div>
              </div>
              <div className="edi-summary-card">
                <div className="card-label">
                  <InfoText contentKey="edi-upgrade-value">EDI Upgrade Value</InfoText>
                </div>
                <div
                  className={`card-value ${baseline.ediAdvantageVsTradDi >= 0 ? 'positive' : ''}`}
                >
                  {formatCurrency(baseline.ediAdvantageVsTradDi)}
                </div>
                <div className="card-detail">EDI vs Trad DI — why pay for the overlay</div>
              </div>
            </div>
            <div className="edi-table-container">
              <table className="edi-table">
                <thead>
                  <tr>
                    <th className="col-label"></th>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <th key={y.year} className="col-year">
                        Year {y.year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Passive tier */}
                  <tr className="tier-header-row">
                    <td colSpan={baseline.years.length + 1} className="tier-header">
                      Passive (Buy &amp; Hold)
                    </td>
                  </tr>
                  <tr>
                    <td className="row-label">Gross Value</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        {formatCurrency(y.passiveValue)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Exit Tax</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-negative">
                          {formatCurrency(y.passiveExitTax)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="row-highlight">
                    <td className="row-label">After-Tax</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-highlight">
                          {formatCurrency(y.passiveAfterTax)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Traditional DI tier */}
                  <tr className="tier-header-row">
                    <td colSpan={baseline.years.length + 1} className="tier-header">
                      Traditional DI (Long-Only TLH)
                    </td>
                  </tr>
                  <tr>
                    <td className="row-label">Gross Value</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        {formatCurrency(y.tradDiValue)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">
                      <InfoText contentKey="edi-trad-di-cf-built">CF Built</InfoText>
                    </td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-positive">{formatCurrency(y.tradDiCfBuilt)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Exit Tax</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-negative">{formatCurrency(y.tradDiExitTax)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="row-highlight">
                    <td className="row-label">After-Tax</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-highlight">
                          {formatCurrency(y.tradDiAfterTax)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* EDI tier */}
                  <tr className="tier-header-row">
                    <td colSpan={baseline.years.length + 1} className="tier-header">
                      EDI (Overlay)
                    </td>
                  </tr>
                  <tr>
                    <td className="row-label">Value (w/ drag)</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        {formatCurrency(y.ediValue)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">CF Built</td>
                    {baseline.years.map((y: BaselineComparisonYear) => {
                      const ediCf = projection.years[y.year - 1]
                        ? projection.years[y.year - 1].endingStCarryforward +
                          projection.years[y.year - 1].endingLtCarryforward
                        : 0;
                      return (
                        <td key={y.year} className="cell-value">
                          <span className="edi-cell-positive">{formatCurrency(ediCf)}</span>
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="row-label">Exit Tax</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-negative">{formatCurrency(y.ediExitTax)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="row-highlight">
                    <td className="row-label">After-Tax</td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span className="edi-cell-highlight">{formatCurrency(y.ediAfterTax)}</span>
                      </td>
                    ))}
                  </tr>

                  {/* Bottom line: EDI vs Trad DI */}
                  <tr className="row-positive">
                    <td className="row-label">
                      <InfoText contentKey="edi-edi-vs-trad-di">EDI vs Trad DI</InfoText>
                    </td>
                    {baseline.years.map((y: BaselineComparisonYear) => (
                      <td key={y.year} className="cell-value">
                        <span
                          className={
                            y.ediAfterTax - y.tradDiAfterTax >= 0
                              ? 'edi-cell-positive'
                              : 'edi-cell-negative'
                          }
                        >
                          {formatCurrency(y.ediAfterTax - y.tradDiAfterTax)}
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

      {/* ===== SECTION 8: Life Events & Realization (merged: presets, custom, sensitivity) ===== */}
      <div className="edi-scenarios-section">
        <h3>Life Events &amp; Realization</h3>

        {/* Preset Scenarios (moved above custom) */}
        <h4 className="subsection-heading">Preset Scenarios</h4>
        <div className="edi-scenario-cards">
          {scenarioResults.map((result, i) => {
            const financingThroughYear = economics.years
              .slice(0, Math.min(result.scenario.yearOfEvent, economics.years.length))
              .reduce((sum, y) => sum + y.financingCost, 0);
            const netValue = result.taxSaved - financingThroughYear;
            return (
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
                    <span className="metric-label">
                      <InfoText contentKey="edi-tax-without-cf">Tax Without CF</InfoText>
                    </span>
                    <span className="metric-value">
                      {formatCurrency(result.taxWithoutCarryforward)}
                    </span>
                  </div>
                  <div className="scenario-metric">
                    <span className="metric-label">
                      <InfoText contentKey="edi-cf-used">CF Used</InfoText>
                    </span>
                    <span className="metric-value">{formatCurrency(result.carryforwardUsed)}</span>
                  </div>
                  <div className="scenario-metric">
                    <span className="metric-label">
                      <InfoText contentKey="edi-tax-with-cf">Tax With CF</InfoText>
                    </span>
                    <span className="metric-value">
                      {formatCurrency(result.taxWithCarryforward)}
                    </span>
                  </div>
                  <hr className="scenario-metric-divider" />
                  <div className="scenario-metric">
                    <span className="metric-label">
                      <InfoText contentKey="edi-tax-saved">Tax Saved</InfoText>
                    </span>
                    <span className="metric-value saved">{formatCurrency(result.taxSaved)}</span>
                  </div>
                  <div className="scenario-metric">
                    <span className="metric-label">Net Value (after financing)</span>
                    <span className={`metric-value ${netValue >= 0 ? 'saved' : ''}`}>
                      {formatCurrency(netValue)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Realization Builder */}
        <h4 className="subsection-heading">Custom Scenario Builder</h4>
        <div className="life-event-templates">
          <span className="template-label">Templates:</span>
          {[
            {
              label: 'IPO/RSU Vest',
              amount: state.assumptions.collateralValue * 0.3,
              char: 'st' as GainCharacter,
              yr: 3,
            },
            {
              label: 'Concentrated Stock Exit',
              amount: state.assumptions.collateralValue * 1.0,
              char: 'lt' as GainCharacter,
              yr: 5,
            },
            { label: 'Real Estate Sale', amount: 2_000_000, char: 'lt' as GainCharacter, yr: 5 },
            {
              label: 'Business Sale',
              amount: state.assumptions.collateralValue * 2.0,
              char: 'lt' as GainCharacter,
              yr: 7,
            },
            {
              label: 'Divorce Settlement',
              amount: state.assumptions.collateralValue * 0.5,
              char: 'lt' as GainCharacter,
              yr: 3,
            },
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
                  <option key={i + 1} value={i + 1}>
                    Year {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {customScenarioResult && (
          <div className="edi-summary-cards">
            <div className="edi-summary-card">
              <div className="card-label">
                <InfoText contentKey="edi-tax-without-cf">Tax Without CF</InfoText>
              </div>
              <div className="card-value">
                {formatCurrency(customScenarioResult.taxWithoutCarryforward)}
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">
                <InfoText contentKey="edi-cf-used">CF Used</InfoText>
              </div>
              <div className="card-value highlight">
                {formatCurrency(customScenarioResult.carryforwardUsed)}
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">
                <InfoText contentKey="edi-tax-with-cf">Tax With CF</InfoText>
              </div>
              <div className="card-value">
                {formatCurrency(customScenarioResult.taxWithCarryforward)}
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">
                <InfoText contentKey="edi-tax-saved">Tax Saved</InfoText>
              </div>
              <div className="card-value positive">
                {formatCurrency(customScenarioResult.taxSaved)}
              </div>
            </div>
          </div>
        )}

        {/* Realization Size Sensitivity */}
        <h4 className="subsection-heading">Realization Size Sensitivity (Year {unwindYear})</h4>
        <p className="section-subtitle">
          How much tax you save at different gain sizes with Year {unwindYear} carryforward.
        </p>
        <table className="edi-table sensitivity-table">
          <thead>
            <tr>
              <th>Gain Amount</th>
              <th>
                <InfoText contentKey="edi-cf-used">CF Used</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-tax-without-cf">Tax Without CF</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-tax-with-cf">Tax With CF</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-tax-saved">Tax Saved</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-effective-rate">Effective Rate</InfoText>
              </th>
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
                <td>
                  {row.amount > 0
                    ? ((row.taxWithCarryforward / row.amount) * 100).toFixed(1)
                    : '0.0'}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== SECTION 9: Strategy Economics (merged Protection Value + Strategy Cost) ===== */}
      <div className="edi-economics-section">
        <h3>Strategy Economics</h3>
        <p className="section-subtitle">
          Year-by-year view of financing cost vs. tax protection built. Realized benefit (
          {formatCurrency(projection.summary.totalRealizedBenefit)}) is certain; CF protection (
          {formatCurrency(projection.summary.finalCarryforward)}) is contingent on a gain event.
        </p>
        <div className="edi-table-container">
          <table className="edi-table">
            <thead>
              <tr>
                <th className="col-label"></th>
                {economics.years.map(y => (
                  <th key={y.year} className="col-year">
                    Year {y.year}
                  </th>
                ))}
                <th className="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-label">
                  <InfoText contentKey="edi-annual-financing-cost">
                    Annual Financing Cost (Incremental)
                  </InfoText>
                </td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-negative">{formatCurrency(y.financingCost)}</span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-negative">
                    {formatCurrency(economics.summary.totalIncrementalCost)}
                  </span>
                </td>
              </tr>
              <tr className="row-muted">
                <td className="row-label">
                  <InfoText contentKey="edi-advisory-fee-row">Advisory Fee</InfoText>{' '}
                  <span className="muted-note">(paid regardless)</span>
                </td>
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
                <td className="row-label">
                  <InfoText contentKey="edi-cf-protection-built">CF Protection Built</InfoText>
                </td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-positive">{formatCurrency(y.cfProtectionBuilt)}</span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-positive">
                    {formatCurrency(economics.summary.totalCfProtection)}
                  </span>
                </td>
              </tr>
              <tr className="row-highlight">
                <td className="row-label">
                  <InfoText contentKey="edi-cumulative-cf">Cumulative CF Protection</InfoText>
                </td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className="edi-cell-highlight">
                      {formatCurrency(y.cumulativeCfProtection)}
                    </span>
                  </td>
                ))}
                <td className="cell-total">—</td>
              </tr>
              <tr>
                <td className="row-label">
                  <InfoText contentKey="edi-protection-cost-ratio">
                    Protection-to-Cost Ratio
                  </InfoText>
                </td>
                {economics.years.map(y => (
                  <td key={y.year} className="cell-value">
                    <span className={y.protectionToCostRatio >= 1 ? 'edi-cell-positive' : ''}>
                      {y.protectionToCostRatio.toFixed(1)}x
                    </span>
                  </td>
                ))}
                <td className="cell-total">
                  <span className="edi-cell-positive">
                    {economics.summary.protectionToCostRatio.toFixed(1)}x
                  </span>
                </td>
              </tr>
              <tr>
                <td className="row-label">
                  <InfoText contentKey="edi-break-even-row">Break-Even Gain Event</InfoText>
                </td>
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

      {/* ===== SECTION 10: Year-by-Year Table (collapsed) ===== */}
      <div className="edi-summary-section">
        <h3>
          Year-by-Year Carryforward Accumulation
          <button className="toggle-btn" onClick={() => setShowYearByYear(!showYearByYear)}>
            {showYearByYear ? 'Hide' : 'Show'}
          </button>
        </h3>
        {showYearByYear && (
          <div className="edi-table-container">
            <table className="edi-table">
              <thead>
                <tr>
                  <th className="col-label"></th>
                  {projection.years.map(r => (
                    <th key={r.year} className="col-year">
                      Year {r.year}
                    </th>
                  ))}
                  <th className="col-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {ROW_DEFINITIONS.map(rowDef => (
                  <tr key={rowDef.key} className={rowDef.rowClass ?? ''}>
                    <td className="row-label">
                      {rowDef.infoKey ? (
                        <InfoText contentKey={rowDef.infoKey}>{rowDef.label}</InfoText>
                      ) : (
                        rowDef.label
                      )}
                    </td>
                    {projection.years.map(year => (
                      <td key={year.year} className="cell-value">
                        {formatCellValue(rowDef.format, rowDef.getValue(year))}
                      </td>
                    ))}
                    <td className="cell-total">
                      {['cfEnding', 'stCf', 'ltCf', 'collateral', 'efficiency'].includes(rowDef.key)
                        ? '—'
                        : formatCellValue(
                            rowDef.format,
                            projection.years.reduce((s, y) => s + rowDef.getValue(y), 0)
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== SECTION 11: Unwind Analysis (+ Embedded Gain chart) ===== */}
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
              <div className="card-label">
                <InfoText contentKey="edi-portfolio-value-unwind">Portfolio Value</InfoText>
              </div>
              <div className="card-value">
                {formatCurrency(selectedUnwind.portfolioValueAtUnwind)}
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">
                <InfoText contentKey="edi-embedded-gain">Embedded Gain</InfoText>
              </div>
              <div className="card-value">
                {formatCurrency(selectedUnwind.embeddedGainEstimate)}
              </div>
              <div className="card-detail">
                {(selectedUnwind.embeddedGainPct * 100).toFixed(1)}% of portfolio
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">
                <InfoText contentKey="edi-cf-available">CF Available</InfoText>
              </div>
              <div className="card-value highlight">
                {formatCurrency(selectedUnwind.availableCarryforward)}
              </div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">
                <InfoText contentKey="edi-net-unwind-tax">Net Unwind Tax</InfoText>
              </div>
              <div className="card-value positive">
                {formatCurrency(selectedUnwind.netUnwindTax)}
              </div>
              <div className="card-detail">
                Saved: {formatCurrency(selectedUnwind.taxSavedByCf)}
              </div>
            </div>
          </div>
        )}

        {/* Year-by-year unwind comparison */}
        <table className="unwind-comparison-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>
                <InfoText contentKey="edi-portfolio-value-unwind">Portfolio Value</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-embedded-gain">Embedded Gain</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-cf-available">CF Available</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-gross-unwind-tax">Gross Unwind Tax</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-net-unwind-tax">Net Unwind Tax</InfoText>
              </th>
              <th>
                <InfoText contentKey="edi-tax-saved-cf">Tax Saved by CF</InfoText>
              </th>
            </tr>
          </thead>
          <tbody>
            {unwindByYear.map(u => (
              <tr
                key={u.unwindYear}
                className={
                  breakEvenYear > 0 && u.unwindYear === breakEvenYear ? 'break-even-row' : ''
                }
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
            After Year {breakEvenYear}, unwinding is effectively tax-free because carryforward
            exceeds embedded gains.
          </div>
        )}

        {/* Embedded Gain chart moved here from charts section */}
        <div className="edi-charts-section" style={{ marginTop: '1.5rem' }}>
          <EdiEmbeddedGainChart
            data={projection.years}
            strategyId={state.assumptions.strategyId}
            annualReturn={state.assumptions.annualReturn - (projectionInput.financingCostRate ?? 0)}
            washSaleRate={state.assumptions.washSaleRate}
          />
        </div>
      </div>

      {/* ===== SECTION 12: Estate Comparison ===== */}
      {estateResult && (
        <div className="edi-estate-section">
          <h3>Estate Planning Comparison (Year {unwindYear})</h3>
          <div className="estate-comparison-grid">
            <div
              className={`estate-option ${estateResult.recommendation === 'continue' ? 'recommended' : ''}`}
            >
              <h4>Hold for Step-Up</h4>
              <div className="estate-metric">
                <span className="estate-label">
                  <InfoText contentKey="edi-step-up-value">Step-up value</InfoText>
                </span>
                <span className="estate-value">
                  {formatCurrency(estateResult.continueAndDie.stepUpValue)}
                </span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">
                  <InfoText contentKey="edi-cf-lost-death">CF lost at death</InfoText>
                </span>
                <span className="estate-value">
                  {formatCurrency(estateResult.continueAndDie.carryforwardValueLost)}
                </span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Net benefit</span>
                <span className="estate-value">
                  {formatCurrency(estateResult.continueAndDie.netBenefit)}
                </span>
              </div>
            </div>

            <div
              className={`estate-option ${estateResult.recommendation === 'unwind' ? 'recommended' : ''}`}
            >
              <h4>Full Unwind</h4>
              <div className="estate-metric">
                <span className="estate-label">
                  <InfoText contentKey="edi-embedded-gain">Embedded gains</InfoText>
                </span>
                <span className="estate-value">
                  {formatCurrency(estateResult.unwindBeforeDeath.embeddedGains)}
                </span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">
                  <InfoText contentKey="edi-cf-used">CF used</InfoText>
                </span>
                <span className="estate-value">
                  {formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)}
                </span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Tax paid</span>
                <span className="estate-value">
                  {formatCurrency(estateResult.unwindBeforeDeath.taxPaid)}
                </span>
              </div>
            </div>

            <div
              className={`estate-option ${estateResult.recommendation === 'partial_unwind' ? 'recommended' : ''}`}
            >
              <h4>Partial Unwind</h4>
              <div className="estate-metric">
                <span className="estate-label">
                  <InfoText contentKey="edi-optimal-unwind">Optimal unwind</InfoText>
                </span>
                <span className="estate-value">
                  {(estateResult.optimalUnwindPct * 100).toFixed(0)}%
                </span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Unwind tax-free</span>
                <span className="estate-value">
                  {formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)}
                </span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">
                  <InfoText contentKey="edi-step-up-value">Keep for step-up</InfoText>
                </span>
                <span className="estate-value">
                  {(100 - estateResult.optimalUnwindPct * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="estate-explanation">{estateResult.explanation}</div>

          {estateResult.recommendation === 'partial_unwind' && (
            <div className="estate-detail-callout">
              <strong>Optimal Strategy:</strong> Unwind{' '}
              {formatCurrency(
                selectedUnwind!.portfolioValueAtUnwind * estateResult.optimalUnwindPct
              )}{' '}
              of portfolio using {formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)}{' '}
              in CF. Remaining{' '}
              {formatCurrency(
                selectedUnwind!.portfolioValueAtUnwind * (1 - estateResult.optimalUnwindPct)
              )}{' '}
              gets step-up at death.
            </div>
          )}

          <p className="estate-disclaimer">
            Carryforwards are lost at death (IRC Section 1212(b)). Positions receive step-up in
            basis (IRC Section 1014). Federal estate tax exclusion ($13.99M per individual, 2026)
            not modeled. Consult estate planning attorney before making decisions.
          </p>
        </div>
      )}

      {/* ===== SECTION 13: Best Strategy Per Life Event (collapsed) ===== */}
      <div className="edi-scenario-matrix-section">
        <h3>
          Best Strategy Per Life Event
          <button className="toggle-btn" onClick={() => setShowScenarioMatrix(!showScenarioMatrix)}>
            {showScenarioMatrix ? 'Hide' : 'Show'}
          </button>
        </h3>
        <p className="section-subtitle">
          Compares all 10 strategies across life-event scenarios.{' '}
          <InfoText contentKey="edi-scenario-net-value">Net Value</InfoText> = Tax Saved - Financing
          Cost through event year. Higher is better.
        </p>
        {showScenarioMatrix && scenarioMatrix && (
          <>
            {/* Winner summary cards */}
            <div className="edi-summary-cards">
              {scenarioMatrix.scenarios.map((sc, scIdx) => {
                const winnerId = scenarioMatrix.bestPerScenario[scIdx];
                const winner = scenarioMatrix.strategies.find(s => s.id === winnerId);
                const winnerNet = winner?.scenarioTaxSaved[scIdx].netValue ?? 0;
                return (
                  <div key={scIdx} className="edi-summary-card scenario-winner-card">
                    <div className="card-label">
                      <InfoText contentKey="edi-best-strategy">{sc.label}</InfoText>
                    </div>
                    <div className="card-value positive">{winner?.name ?? '—'}</div>
                    <div className="card-detail">Net value: {formatCurrency(winnerNet)}</div>
                    <div className="card-detail muted">
                      {sc.isMultiYear
                        ? `${formatCurrency(sc.annualGainAmount!)}/yr x ${sc.durationYears}yr`
                        : `${formatCurrency(sc.gainAmount)} ${sc.gainCharacter.toUpperCase()}, Year ${sc.yearOfEvent}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full matrix table */}
            <div className="edi-table-container">
              <table className="edi-table scenario-matrix-table">
                <thead>
                  <tr>
                    <th className="col-label">Strategy</th>
                    <th className="col-label">Financing</th>
                    {scenarioMatrix.scenarios.map((sc, i) => (
                      <th key={i} className="col-scenario">
                        {sc.label}
                        <span className="scenario-col-detail">
                          {sc.isMultiYear
                            ? `${formatCurrency(sc.annualGainAmount!)}/yr`
                            : formatCurrency(sc.gainAmount)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Core strategies */}
                  <tr className="tier-header-row">
                    <td colSpan={2 + scenarioMatrix.scenarios.length} className="tier-header">
                      Core Strategies (Cash-Funded)
                    </td>
                  </tr>
                  {scenarioMatrix.strategies
                    .filter(s => s.type === 'core')
                    .map(sr => (
                      <tr
                        key={sr.id}
                        className={
                          sr.id === state.assumptions.strategyId ? 'current-strategy-row' : ''
                        }
                      >
                        <td className="row-label">
                          {sr.name}
                          {sr.id === state.assumptions.strategyId ? ' *' : ''}
                        </td>
                        <td className="cell-value">{(sr.financingRate * 100).toFixed(1)}%</td>
                        {sr.scenarioTaxSaved.map((sc, scIdx) => (
                          <td
                            key={scIdx}
                            className={`cell-value ${scenarioMatrix.bestPerScenario[scIdx] === sr.id ? 'best-strategy-cell' : ''}`}
                          >
                            {formatCurrency(sc.netValue)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  {/* Overlay strategies */}
                  <tr className="tier-header-row">
                    <td colSpan={2 + scenarioMatrix.scenarios.length} className="tier-header">
                      Overlay Strategies (Collateral-Based)
                    </td>
                  </tr>
                  {scenarioMatrix.strategies
                    .filter(s => s.type === 'overlay')
                    .map(sr => (
                      <tr
                        key={sr.id}
                        className={
                          sr.id === state.assumptions.strategyId ? 'current-strategy-row' : ''
                        }
                      >
                        <td className="row-label">
                          {sr.name}
                          {sr.id === state.assumptions.strategyId ? ' *' : ''}
                        </td>
                        <td className="cell-value">{(sr.financingRate * 100).toFixed(1)}%</td>
                        {sr.scenarioTaxSaved.map((sc, scIdx) => (
                          <td
                            key={scIdx}
                            className={`cell-value ${scenarioMatrix.bestPerScenario[scIdx] === sr.id ? 'best-strategy-cell' : ''}`}
                          >
                            {formatCurrency(sc.netValue)}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="matrix-footnote">
              * = currently selected strategy. Core strategies have no incremental financing cost.
              Net value accounts for cumulative financing drag through each scenario's event year.
            </p>
          </>
        )}
      </div>

      {/* ===== SECTION 14: Strategy Comparison (collapsed) ===== */}
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
                    <td>
                      {s.name}
                      {s.id === state.assumptions.strategyId ? ' *' : ''}
                    </td>
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

      {/* ===== SECTION 15: Tax Rate Sensitivity (collapsed) ===== */}
      <div className="edi-rate-sensitivity-section">
        <h3>
          Tax Rate Sensitivity
          <button
            className="toggle-btn"
            onClick={() => setShowTaxRateSensitivity(!showTaxRateSensitivity)}
          >
            {showTaxRateSensitivity ? 'Hide' : 'Show'}
          </button>
        </h3>
        {showTaxRateSensitivity && (
          <>
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
                  <div className="card-label">
                    <InfoText contentKey="edi-potential-tax-protection">
                      Total Tax Savings (Shifted)
                    </InfoText>
                  </div>
                  <div className="card-value positive">
                    {formatCurrency(
                      sensitivityProjection.summary.totalRealizedBenefit +
                        sensitivityProjection.summary.carryforwardTaxShield
                    )}
                  </div>
                  <div className="card-detail">
                    vs. {formatCurrency(totalPotentialSavings)} at current rates
                  </div>
                </div>
                <div className="edi-summary-card">
                  <div className="card-label">
                    <InfoText contentKey="edi-potential-tax-protection">
                      CF Shield (Shifted)
                    </InfoText>
                  </div>
                  <div className="card-value highlight">
                    {formatCurrency(sensitivityProjection.summary.carryforwardTaxShield)}
                  </div>
                  <div className="card-detail">
                    vs. {formatCurrency(projection.summary.carryforwardTaxShield)} at current rates
                  </div>
                </div>
                <div className="edi-summary-card">
                  <div className="card-label">Delta</div>
                  <div
                    className={`card-value ${sensitivityProjection.summary.totalRealizedBenefit + sensitivityProjection.summary.carryforwardTaxShield >= totalPotentialSavings ? 'positive' : ''}`}
                  >
                    {formatCurrency(
                      sensitivityProjection.summary.totalRealizedBenefit +
                        sensitivityProjection.summary.carryforwardTaxShield -
                        totalPotentialSavings
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== SECTION 16: How It Works (collapsed) ===== */}
      <div className="edi-how-it-works-section">
        <h3>
          How Does This Strategy Generate Tax Losses?
          <button className="toggle-btn" onClick={() => setShowHowItWorks(!showHowItWorks)}>
            {showHowItWorks ? 'Hide' : 'Show'}
          </button>
        </h3>
        {showHowItWorks && strategy && (
          <div className="how-it-works-content">
            <p>
              {strategy.name} creates {strategy.type === 'core' ? 'a cash-funded' : 'an overlay'}{' '}
              portfolio with{' '}
              {(
                (getLongLeverageRatio(strategy) + (strategy.type === 'core' ? 1 : 0)) *
                100
              ).toFixed(0)}
              % long / {(getShortRatio(strategy) * 100).toFixed(0)}% short positions. Active
              rebalancing harvests short-term losses as individual positions decline, while
              long-term gains arise from holding period transitions on appreciated positions. The
              key: ST losses shelter LT gains via IRC netting, and excess flows to carryforward.
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
                  <td>
                    {strategy.type === 'core' ? 'Core (Cash Funded)' : 'Overlay (Collateral-Based)'}
                  </td>
                </tr>
                <tr>
                  <td>Gross Exposure</td>
                  <td>
                    {(
                      (getLongLeverageRatio(strategy) +
                        (strategy.type === 'core' ? 1 : 0) +
                        getShortRatio(strategy)) *
                      100
                    ).toFixed(0)}
                    %
                  </td>
                </tr>
                <tr>
                  <td>Long Ratio</td>
                  <td>
                    {(
                      (getLongLeverageRatio(strategy) + (strategy.type === 'core' ? 1 : 0)) *
                      100
                    ).toFixed(0)}
                    %
                  </td>
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
              Harvesting efficiency declines over time as the portfolio matures (Year 1:{' '}
              {(getStLossRateForYear(strategy, 1) * 100).toFixed(1)}% ST loss rate vs. Year 10:{' '}
              {(getStLossRateForYear(strategy, 10) * 100).toFixed(1)}%). This is expected — early
              years generate the most tax benefit.
            </p>
          </div>
        )}
      </div>

      {/* ===== SECTION 17: Notes & Disclosures (absorbs NIIT) ===== */}
      <div className="edi-notes">
        <h4>Calculation Notes &amp; Disclosures</h4>
        <ul>
          <li>
            <strong>ST Losses Shelter LT Gains:</strong> Under IRC netting rules, short-term losses
            offset long-term gains before contributing to carryforward.
          </li>
          <li>
            <strong>$3K Deduction:</strong> Only excess capital losses (after netting) can offset
            ordinary income, limited to $3K/year ($1.5K for MFS). NIIT (3.8%) is excluded from this
            deduction rate since it offsets ordinary income, not net investment income.
          </li>
          <li>
            <strong>NIIT Treatment:</strong> The $3K deduction rate excludes the 3.8% NIIT because
            it offsets ordinary income, not net investment income. This exclusion avoids overstating
            savings by ~$114/year.
          </li>
          <li>
            <strong>No Annual Limit on CF vs Gains:</strong> A $5M carryforward can shelter $5M in
            realized gains in a single year. There is no annual limit on using carryforwards to
            offset capital gains.
          </li>
          <li>
            <strong>Carryforwards Retain Character:</strong> ST stays ST, LT stays LT.
            Same-character offsets first, then cross-applies per IRC Section 1212(b).
          </li>
          <li>
            <strong>Embedded Gain:</strong> Grows from market appreciation plus basis reduction from
            harvesting. Estimated using strategy loss rates. Actual embedded gain may differ based
            on individual lot selection and market conditions.
          </li>
          <li>
            <strong>Tax Rates:</strong> Combined rates include federal (
            {combinedStRate > 0.5 ? '37%' : '≤37%'} ordinary /{' '}
            {combinedLtRate > 0.3 ? '20%' : '≤20%'} LTCG), 3.8% NIIT, and state tax. Rates assume
            income above NIIT thresholds.
          </li>
          <li>
            <strong>Strategy Costs:</strong> Financing cost (
            {(incrementalFinancingCost * 100).toFixed(1)}%) includes margin interest, stock borrow
            fees, and short dividend costs. Advisory fee is user-adjustable and represents the
            wealth management fee on NAV.
          </li>
          <li>
            <strong>Investment Interest Deductibility (IRC §163(d)):</strong> Margin interest and
            short borrow costs may be deductible against net investment income. For HNW clients with
            substantial NII, this deduction could reduce the effective after-tax cost of financing
            by 20-37%. Protection ratios and break-even calculations shown here assume financing
            costs are fully non-deductible (conservative).
          </li>
          <li>
            <strong>Carryforwards Lost at Death:</strong> Per IRC Section 1212(b), capital loss
            carryforwards expire at death and cannot be transferred. Positions receive step-up in
            basis per IRC Section 1014(a).
          </li>
          <li>
            <strong>Liquidation Comparison:</strong> Three tiers: Passive (no TLH), Traditional DI
            (long-only TLH at industry benchmarks), and EDI (overlay). All share identical gross
            returns; Traditional DI has no financing drag; EDI is reduced by financing cost.
            Advisory fee excluded from all three (common expense).
          </li>
          <li>
            <strong>Not Tax Advice:</strong> This calculator is for informational purposes only. Tax
            calculations are estimates based on stated assumptions. Consult a qualified tax advisor
            for individual tax planning.
          </li>
        </ul>
      </div>

      {/* ===== SECTION 18: Export ===== */}
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
            lines.push(
              `Combined ST Rate: ${(combinedStRate * 100).toFixed(1)}% | LT Rate: ${(combinedLtRate * 100).toFixed(1)}%`
            );
            lines.push('');
            lines.push(`Total Potential Tax Savings: ${formatCurrency(totalPotentialSavings)}`);
            lines.push(
              `  Realized: ${formatCurrency(projection.summary.totalRealizedBenefit)} (cumulative $3K deductions)`
            );
            lines.push(
              `  Contingent: ${formatCurrency(projection.summary.carryforwardTaxShield)} (requires gain event)`
            );
            lines.push(
              `Final Carryforward: ${formatCurrency(projection.summary.finalCarryforward)}`
            );
            lines.push(
              `  ST: ${formatCurrency(lastYear?.endingStCarryforward ?? 0)} | LT: ${formatCurrency(lastYear?.endingLtCarryforward ?? 0)}`
            );
            lines.push(`Protection Ratio: ${economics.summary.protectionToCostRatio.toFixed(1)}x`);
            lines.push(
              `Break-Even Gain Event: ${formatCurrency(economics.summary.breakEvenGainEvent)}`
            );
            lines.push(
              `Break-Even Year: ${breakEvenYear > 0 ? `Year ${breakEvenYear}` : 'Not reached'}`
            );
            lines.push('');
            lines.push('Year-by-Year:');
            lines.push('Year | Collateral | ST Losses | LT Gains | CF | Net Benefit');
            projection.years.forEach((yr, i) => {
              const econ = economics.years[i];
              lines.push(
                `${yr.year} | ${formatCurrency(yr.collateralValue)} | ${formatCurrency(yr.stLossesHarvested)} | ${formatCurrency(yr.ltGainsRealized)} | ${formatCurrency(yr.endingStCarryforward + yr.endingLtCarryforward)} | ${econ?.protectionToCostRatio.toFixed(1) ?? '—'}x`
              );
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
