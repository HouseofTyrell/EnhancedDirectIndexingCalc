import { CalculationResult } from '../types';
import { InfoPopup, InfoText, QfafSizingFormula } from '../InfoPopup';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { CollapsibleSection } from './CollapsibleSection';
import { useValueFlash } from '../hooks/useValueFlash';
import { useDelta } from '../hooks/useDelta';
import { DeltaBadge } from './DeltaBadge';

interface SizingSummaryProps {
  results: CalculationResult;
  filingStatus: string;
  qfafEnabled: boolean;
  combinedStRate: number;
  combinedLtRate: number;
  qfafMultiplier?: number;
}

export function SizingSummary({
  results,
  filingStatus,
  qfafEnabled,
  combinedStRate,
  combinedLtRate,
  qfafMultiplier,
}: SizingSummaryProps) {
  const year1Savings = results.years[0]?.taxSavings ?? 0;
  const year2Savings = results.years[1]?.taxSavings ?? 0;

  // Flash on sizing card values
  const collateralFlash = useValueFlash(results.sizing.collateralValue);
  const qfafFlash = useValueFlash(results.sizing.qfafValue);
  const exposureFlash = useValueFlash(results.sizing.totalExposure);
  const limitFlash = useValueFlash(results.sizing.section461Limit);

  // Flash + delta on net savings highlights
  const year1Flash = useValueFlash(year1Savings);
  const year2Flash = useValueFlash(year2Savings);
  const year1Delta = useDelta(year1Savings);
  const year2Delta = useDelta(year2Savings);

  return (
    <CollapsibleSection
      sectionKey="sizing"
      step="3"
      stepLabel="Optimized Strategy"
      title="Strategy Sizing"
      headerAction={
        <InfoPopup title="QFAF Auto-Sizing">
          <QfafSizingFormula qfafMultiplier={qfafMultiplier} />
        </InfoPopup>
      }
      guidance="We auto-size the QFAF to offset short-term gains, maximizing your tax efficiency within IRS limits."
      className="sizing-section"
    >
      <div className="sizing-cards">
        <div className="sizing-card">
          <span className="sizing-label">
            <InfoText
              contentKey="collateral-value"
              currentValue={formatCurrency(results.sizing.collateralValue)}
            >
              Collateral
            </InfoText>
          </span>
          <span className="sizing-value" ref={collateralFlash}>{formatCurrency(results.sizing.collateralValue)}</span>
          <span className="sizing-sublabel">{results.sizing.strategyName}</span>
          {results.sizing.splitLegs && results.sizing.splitLegs.length > 0 && (
            <div className="sizing-split-breakdown">
              {results.sizing.splitLegs.map(leg => (
                <div key={leg.strategyId} className="sizing-split-leg">
                  <span>
                    {leg.strategyType === 'core' ? 'Core' : 'Overlay'}: {leg.strategyName}
                  </span>
                  <span>{formatCurrency(leg.collateralValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sizing-card">
          <span className="sizing-label">
            <InfoText
              contentKey="auto-sized-qfaf"
              currentValue={formatCurrency(results.sizing.qfafValue)}
            >
              Auto-Sized QFAF
            </InfoText>
          </span>
          <span className="sizing-value" ref={qfafFlash}>{formatCurrency(results.sizing.qfafValue)}</span>
          <span className="sizing-sublabel">
            {formatPercent(results.sizing.qfafRatio)} of collateral
          </span>
        </div>
        <div className="sizing-card highlight">
          <span className="sizing-label">
            <InfoText
              contentKey="total-exposure"
              currentValue={formatCurrency(results.sizing.totalExposure)}
            >
              Total Exposure
            </InfoText>
          </span>
          <span className="sizing-value" ref={exposureFlash}>{formatCurrency(results.sizing.totalExposure)}</span>
        </div>
        <div className="sizing-card">
          <span className="sizing-label">
            <InfoText
              contentKey="section-461-limit"
              currentValue={formatCurrency(results.sizing.section461Limit)}
            >
              §461(l) Limit
            </InfoText>
          </span>
          <span className="sizing-value" ref={limitFlash}>{formatCurrency(results.sizing.section461Limit)}</span>
          <span className="sizing-sublabel">
            {filingStatus === 'mfj' ? 'MFJ' : 'Single/Other'}
          </span>
        </div>
      </div>

      <div className="offset-status">
        <div className="offset-row">
          <span>
            <InfoText
              contentKey="year1-st-losses"
              currentValue={formatCurrency(results.sizing.year1StLosses)}
            >
              {results.sizing.sizingYears === 1
                ? 'Year 1 ST Losses (Collateral)'
                : `Avg ST Losses, Yrs 1–${results.sizing.sizingYears} (Collateral)`}
            </InfoText>
          </span>
          <span className="positive">{formatCurrency(results.sizing.year1StLosses)}</span>
        </div>
        <div className="offset-row">
          <span>
            <InfoText
              contentKey="year1-st-gains"
              currentValue={formatCurrency(results.sizing.year1StGains)}
            >
              {results.sizing.sizingYears === 1
                ? 'Year 1 ST Gains (QFAF)'
                : 'Matched ST Gains (QFAF)'}
            </InfoText>
          </span>
          <span className="negative">({formatCurrency(results.sizing.year1StGains)})</span>
        </div>
        {(() => {
          const netSt = results.sizing.year1StLosses - results.sizing.year1StGains;
          const isMatched = Math.abs(netSt) < 1;
          const hasExcessGains = netSt < -1; // ST gains > ST losses
          const avgNote = results.sizing.sizingYears > 1 ? ' (on avg)' : '';
          const statusClass = isMatched ? 'success' : hasExcessGains ? 'danger' : 'success';
          let label: string;
                  if (isMatched) {
            label = `Fully Matched${avgNote}`;
          } else if (hasExcessGains) {
            label = `${formatCurrency(Math.abs(netSt))} excess ST gains${avgNote}`;
          } else {
            label = `${formatCurrency(netSt)} excess ST losses${avgNote}`;
          }
          return (
            <div className={`offset-row result ${statusClass}`}>
              <span>
                <InfoText contentKey="net-st-position" currentValue={isMatched ? '$0 (Fully Matched)' : formatCurrency(netSt)}>
                  Net ST Position
                </InfoText>
              </span>
              <span>{label}</span>
            </div>
          );
        })()}
        <div className="offset-row">
          <span>
            <InfoText
              contentKey="year1-ordinary-losses"
              currentValue={formatCurrency(results.sizing.year1OrdinaryLosses)}
            >
              Year 1 Ordinary Loss (QFAF)
            </InfoText>
          </span>
          <span className="positive">{formatCurrency(results.sizing.year1OrdinaryLosses)}</span>
        </div>
        <div className="offset-row">
          <span>
            <InfoText
              contentKey="usable-ordinary-loss"
              currentValue={formatCurrency(results.sizing.year1UsableOrdinaryLoss)}
            >
              Usable Ordinary Loss
            </InfoText>
          </span>
          <span className="positive">
            {formatCurrency(results.sizing.year1UsableOrdinaryLoss)}
          </span>
        </div>
        {results.sizing.year1ExcessToNol > 0 && (
          <div className="offset-row">
            <span>
              <InfoText
                contentKey="excess-to-nol"
                currentValue={formatCurrency(results.sizing.year1ExcessToNol)}
              >
                Excess → NOL Carryforward
              </InfoText>
            </span>
            <span>{formatCurrency(results.sizing.year1ExcessToNol)}</span>
          </div>
        )}
      </div>

      {/* Year 1 / Year 2+ Tax Benefit Breakdown with Timeline Connector */}
      <div className={`tax-benefit-timeline ${!(results.years.length > 1 && qfafEnabled) ? 'tax-benefit-timeline--single' : ''}`}>
      <div className="tax-benefit-summary">
        <h3>Estimated Year 1 Tax Benefit</h3>
        <div className="benefit-cards">
          <div className="benefit-card">
            <span className="benefit-label">
              <InfoText
                contentKey="ordinary-loss-benefit"
                currentValue={formatCurrency(
                  results.sizing.year1UsableOrdinaryLoss * combinedStRate
                )}
              >
                Ordinary Loss Benefit
              </InfoText>
            </span>
            <span className="benefit-value positive">
              +{formatCurrency(results.sizing.year1UsableOrdinaryLoss * combinedStRate)}
            </span>
            <span className="benefit-formula">
              {formatCurrency(results.sizing.year1UsableOrdinaryLoss)} ×{' '}
              {formatPercent(combinedStRate)}
            </span>
          </div>
          <div className="benefit-card">
            <span className="benefit-label">
              <InfoText
                contentKey="lt-gain-cost"
                currentValue={formatCurrency(results.years[0]?.ltGainsRealized * combinedLtRate)}
              >
                LT Gain Cost
              </InfoText>
            </span>
            <span className="benefit-value negative">
              −{formatCurrency((results.years[0]?.ltGainsRealized ?? 0) * combinedLtRate)}
            </span>
            <span className="benefit-formula">
              {formatCurrency(results.years[0]?.ltGainsRealized ?? 0)} ×{' '}
              {formatPercent(combinedLtRate)}
            </span>
          </div>
          <div className="benefit-card highlight">
            <span className="benefit-label">
              <InfoText
                contentKey="year1-tax-savings"
                currentValue={formatCurrency(results.years[0]?.taxSavings ?? 0)}
              >
                Net Year 1 Tax Savings
              </InfoText>
            </span>
            <span className="benefit-value" ref={year1Flash}>
              {formatCurrency(results.years[0]?.taxSavings ?? 0)}
              <DeltaBadge delta={year1Delta} />
            </span>
            <span className="benefit-formula">
              {formatPercent((results.years[0]?.taxSavings ?? 0) / results.sizing.totalExposure)}{' '}
              of exposure
            </span>
          </div>
        </div>
      </div>

      {/* Year 2+ Tax Benefit Breakdown - shows how NOL starts being used */}
      {results.years.length > 1 && qfafEnabled && (
        <div className="tax-benefit-summary subsequent-year">
          <h3>
            Est. Year 2+ Tax Benefit <span className="year-note">(typical subsequent year)</span>
          </h3>
          <div className="nol-carryforward-note">
            <span className="nol-label">NOL Carryforward from Year 1:</span>
            <span className="nol-value">
              {formatCurrency(results.years[0]?.nolCarryforward ?? 0)}
            </span>
            <span className="nol-explanation">
              → Available to offset up to 80% of Year 2 taxable income
            </span>
          </div>
          <div className="benefit-cards">
            <div className="benefit-card">
              <span className="benefit-label">
                <InfoText contentKey="ordinary-loss-benefit">
                  Ordinary Loss Benefit
                </InfoText>
              </span>
              <span className="benefit-value positive">
                +{formatCurrency(results.years[1]?.usableOrdinaryLoss * combinedStRate)}
              </span>
              <span className="benefit-formula">
                {formatCurrency(results.years[1]?.usableOrdinaryLoss)} ×{' '}
                {formatPercent(combinedStRate)}
              </span>
            </div>
            <div className="benefit-card">
              <span className="benefit-label">
                <InfoText contentKey="nol-offset-benefit">
                  NOL Offset Benefit
                </InfoText>
              </span>
              <span className="benefit-value positive">
                +{formatCurrency((results.years[1]?.nolUsedThisYear ?? 0) * combinedStRate)}
              </span>
              <span className="benefit-formula">
                {formatCurrency(results.years[1]?.nolUsedThisYear ?? 0)} ×{' '}
                {formatPercent(combinedStRate)}
              </span>
            </div>
            <div className="benefit-card">
              <span className="benefit-label">
                <InfoText contentKey="lt-gain-cost">
                  LT Gain Cost
                </InfoText>
              </span>
              <span className="benefit-value negative">
                −{formatCurrency((results.years[1]?.ltGainsRealized ?? 0) * combinedLtRate)}
              </span>
              <span className="benefit-formula">
                {formatCurrency(results.years[1]?.ltGainsRealized ?? 0)} ×{' '}
                {formatPercent(combinedLtRate)}
              </span>
            </div>
            <div className="benefit-card highlight">
              <span className="benefit-label">
                <InfoText contentKey="year2-tax-savings">
                  Net Year 2 Tax Savings
                </InfoText>
              </span>
              <span className="benefit-value" ref={year2Flash}>
                {formatCurrency(results.years[1]?.taxSavings ?? 0)}
                <DeltaBadge delta={year2Delta} />
              </span>
              <span className="benefit-formula">
                {formatPercent(
                  (results.years[1]?.taxSavings ?? 0) / results.sizing.totalExposure
                )}{' '}
                of exposure
              </span>
            </div>
          </div>
        </div>
      )}
      </div>{/* end tax-benefit-timeline */}
    </CollapsibleSection>
  );
}
