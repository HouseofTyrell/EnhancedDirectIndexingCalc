import React from 'react';
import { InfoText } from '../InfoPopup';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { getStateConformityWarning } from '../taxData';
import { CollapsibleSection } from './CollapsibleSection';
import { useValueFlash } from '../hooks/useValueFlash';
import { useDelta } from '../hooks/useDelta';
import { DeltaBadge } from './DeltaBadge';
import type { ExitTaxAnalysis } from '../calculations';

/**
 * Props for the ResultsSummary component.
 */
interface ResultsSummaryProps {
  /** Cumulative tax savings over the projection period */
  totalTaxSavings: number;
  /** Portfolio value at the end of the projection period */
  finalPortfolioValue: number;
  /** Annualized tax alpha (tax savings as % of portfolio per year) */
  effectiveTaxAlpha: number;
  /** Total NOL generated from Section 461(l) excess losses */
  totalNolGenerated: number;
  /** Number of years in the projection (default: 10) */
  projectionYears?: number;
  /** Collateral-only tax savings for incremental benefit comparison */
  collateralOnlyTaxSavings?: number;
  /** Total collateral amount for context */
  collateralAmount?: number;
  /** Exit-tax / deferred-gain analysis (D-003): permanent vs deferred split */
  exitTaxAnalysis?: ExitTaxAnalysis;
  /** Quantified state-math warning (D-005): PA/NJ/MA/WA dollar-impact note */
  stateMathWarning?: string;
  /** Present value of total savings (D-006), shown when enabled */
  totalTaxSavingsPV?: number;
  presentValueEnabled?: boolean;
  discountRate?: number;
  /** True when financing fees are excluded (default view) — labels the headline as gross (D-011) */
  grossOfCosts?: boolean;
  /** State code for conformity warning (e.g. "CA", "NY") */
  stateCode?: string;
}

/**
 * Displays the key results summary cards showing projected benefits.
 * Provides headline metrics, interpretation text, and disclosure notes.
 *
 * Cards displayed:
 * - Estimated Tax Savings (cumulative over projection period)
 * - Incremental Benefit vs Standard Direct Indexing
 * - Annualized Estimated Tax Alpha (percentage)
 * - Total NOL Generated (from excess ordinary losses)
 */
export const ResultsSummary = React.memo(function ResultsSummary({
  totalTaxSavings,
  finalPortfolioValue,
  effectiveTaxAlpha,
  totalNolGenerated,
  projectionYears = 10,
  collateralOnlyTaxSavings = 0,
  collateralAmount = 0,
  exitTaxAnalysis,
  stateMathWarning,
  totalTaxSavingsPV,
  presentValueEnabled = false,
  discountRate = 0.05,
  grossOfCosts = false,
  stateCode,
}: ResultsSummaryProps) {
  const incrementalBenefit = totalTaxSavings - collateralOnlyTaxSavings;
  const avgAnnualSavings = totalTaxSavings / projectionYears;

  // Flash on value change
  const savingsFlash = useValueFlash(totalTaxSavings);
  const incrementalFlash = useValueFlash(incrementalBenefit);
  const alphaFlash = useValueFlash(effectiveTaxAlpha);

  // Delta indicators
  const savingsDelta = useDelta(totalTaxSavings);
  const incrementalDelta = useDelta(incrementalBenefit);
  const alphaDelta = useDelta(effectiveTaxAlpha);

  return (
    <CollapsibleSection
      sectionKey="results"
      step="5"
      stepLabel="Estimated Results"
      title={`Estimated ${projectionYears}-Year Tax Savings`}
      guidance="Based on the inputs and assumptions below. Adjust values to see updated projections."
      className="results-summary-section"
    >
      {/* Headline metrics - visually prominent */}
      <div className="headline-metrics">
        <div className="headline-metric primary">
          <h3>
            <InfoText contentKey="total-tax-savings" currentValue={formatCurrency(totalTaxSavings)}>
              Estimated Tax Savings
            </InfoText>
          </h3>
          <p className="headline-number" ref={savingsFlash}>
            {formatCurrency(totalTaxSavings)}
            <DeltaBadge delta={savingsDelta} />
          </p>
          <p className="subtext">
            Over {projectionYears} years
            {grossOfCosts && (
              <> — before financing costs &amp; fees (enable in Advanced Settings)</>
            )}
          </p>
          {presentValueEnabled && totalTaxSavingsPV !== undefined && (
            <p className="subtext">
              Present value @ {formatPercent(discountRate)}: {formatCurrency(totalTaxSavingsPV)}
            </p>
          )}
        </div>
        <div className="headline-metric">
          <h3>
            <InfoText contentKey="incremental-benefit" currentValue={formatCurrency(incrementalBenefit)}>
              Est. Incremental Benefit
            </InfoText>
          </h3>
          <p className="headline-number" ref={incrementalFlash}>
            {formatCurrency(incrementalBenefit)}
            <DeltaBadge delta={incrementalDelta} />
          </p>
          <p className="subtext">vs. standard direct indexing</p>
        </div>
        <div className="headline-metric">
          <h3>
            <InfoText contentKey="effective-tax-alpha" currentValue={formatPercent(effectiveTaxAlpha)}>
              Est. Annualized Tax Alpha
            </InfoText>
          </h3>
          <p className="headline-number" ref={alphaFlash}>
            {formatPercent(effectiveTaxAlpha)}
            <DeltaBadge delta={alphaDelta} format="percent" />
          </p>
          <p className="subtext">Per year</p>
        </div>
      </div>

      {/* Supporting detail cards */}
      <div className="summary-cards">
        <div className="card">
          <h3>
            <InfoText contentKey="final-portfolio-value" currentValue={formatCurrency(finalPortfolioValue)}>
              Est. Final Portfolio Value
            </InfoText>
          </h3>
          <p className="big-number">{formatCurrency(finalPortfolioValue)}</p>
          <p className="subtext">Year {projectionYears}</p>
        </div>
        <div className="card">
          <h3>
            <InfoText contentKey="total-nol-generated" currentValue={formatCurrency(totalNolGenerated)}>
              Est. Total NOL Generated
            </InfoText>
          </h3>
          <p className="big-number">{formatCurrency(totalNolGenerated)}</p>
          <p className="subtext">Available to offset future income (80%/yr)</p>
        </div>
        <div className="card">
          <h3>Est. Avg. Annual Savings</h3>
          <p className="big-number">{formatCurrency(avgAnnualSavings)}</p>
          <p className="subtext">Per year avg.</p>
        </div>
      </div>

      {/* Interpretation text */}
      <div className="interpretation-text">
        <strong>What this means:</strong>{' '}
        {collateralAmount > 0 ? (
          <>
            Based on a {formatCurrency(collateralAmount)} portfolio, this strategy is estimated to
            generate approximately {formatCurrency(totalTaxSavings)} in cumulative tax savings
            over {projectionYears} years, or roughly {formatCurrency(avgAnnualSavings)} per year.
            {incrementalBenefit > 0 && (
              <> The enhanced strategy adds an estimated {formatCurrency(incrementalBenefit)} beyond
              what standard direct indexing alone would achieve.</>
            )}
          </>
        ) : (
          <>
            Enter a collateral amount and income details above to see estimated tax savings projections.
          </>
        )}
      </div>

      {/* Deferred gain / liquidation analysis (D-003) */}
      {exitTaxAnalysis && collateralAmount > 0 && (
        <div className="summary-cards liquidation-analysis">
          <div className="card">
            <h3>
              <InfoText
                contentKey="embedded-gain-at-horizon"
                currentValue={formatCurrency(exitTaxAnalysis.embeddedGain)}
              >
                Est. Embedded Gain at Year {projectionYears}
              </InfoText>
            </h3>
            <p className="big-number">{formatCurrency(exitTaxAnalysis.embeddedGain)}</p>
            <p className="subtext">
              Incl. {formatCurrency(exitTaxAnalysis.cumulativeBasisReduction)} basis reduction
              from harvesting
            </p>
          </div>
          <div className="card">
            <h3>
              <InfoText
                contentKey="incremental-deferred-tax"
                currentValue={formatCurrency(exitTaxAnalysis.incrementalDeferredTax)}
              >
                Est. Deferred Tax (If Liquidated)
              </InfoText>
            </h3>
            <p className="big-number">{formatCurrency(exitTaxAnalysis.incrementalDeferredTax)}</p>
            <p className="subtext">
              After {formatCurrency(exitTaxAnalysis.cfShelterUsed)} carryforward shelter
            </p>
          </div>
          <div className="card">
            <h3>
              <InfoText
                contentKey="net-benefit-after-liquidation"
                currentValue={formatCurrency(exitTaxAnalysis.netBenefitAfterLiquidation)}
              >
                Est. Net Benefit After Liquidation
              </InfoText>
            </h3>
            <p className="big-number">{formatCurrency(exitTaxAnalysis.netBenefitAfterLiquidation)}</p>
            <p className="subtext">Tax savings less deferred tax if fully sold in year {projectionYears}</p>
          </div>
        </div>
      )}
      {exitTaxAnalysis && collateralAmount > 0 && (
        <div className="results-disclosure">
          <strong>Permanent vs. deferred:</strong> A portion of the estimated savings is a timing
          benefit — harvesting reduces cost basis, so {formatCurrency(exitTaxAnalysis.incrementalDeferredTax)} of
          tax would come due on full liquidation in year {projectionYears}. If the portfolio is
          instead held until death (basis step-up) or donated, the deferred portion may become
          permanent. Assumes initial basis equals initial value; appreciated-stock (Overlay)
          collateral carries additional pre-existing embedded gain not shown here.
        </div>
      )}

      {/* Exclusion disclosure */}
      <div className="results-disclosure">
        <strong>Note:</strong> Estimates do not reflect advisory fees, financing costs, tracking error
        impacts, transaction costs, or behavioral effects. Actual results will vary. See full
        disclosures below.
      </div>

      {/* State tax conformity warning for CA, NY, PA */}
      {stateCode && getStateConformityWarning(stateCode) && (
        <div className="state-conformity-warning">
          <strong>⚠️ State Tax Conformity:</strong>
          <p>{getStateConformityWarning(stateCode)}</p>
        </div>
      )}

      {/* Quantified state-math warning for PA/NJ/MA/WA (D-005 phase 1) */}
      {stateMathWarning && (
        <div className="state-conformity-warning">
          <strong>⚠️ State Tax Estimate:</strong>
          <p>{stateMathWarning}</p>
        </div>
      )}
    </CollapsibleSection>
  );
});
