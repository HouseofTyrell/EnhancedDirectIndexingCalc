import { CalculationResult } from '../types';
import { InfoPopup, InfoText, QfafSizingFormula } from '../InfoPopup';
import { formatCurrency, formatPercent } from '../utils/formatters';

interface SizingSummaryProps {
  results: CalculationResult;
  filingStatus: string;
  qfafEnabled: boolean;
  combinedStRate: number;
  combinedLtRate: number;
  rateDifferential: number;
}

export function SizingSummary({
  results,
  filingStatus,
  qfafEnabled,
  combinedStRate,
  combinedLtRate,
  rateDifferential,
}: SizingSummaryProps) {
  return (
    <section className="sizing-section">
      <div className="section-number" data-step="3">
        Optimized Strategy
      </div>
      <div className="section-header">
        <h2>Strategy Sizing</h2>
        <InfoPopup title="QFAF Auto-Sizing">
          <QfafSizingFormula />
        </InfoPopup>
      </div>
      <p className="section-guidance">
        We auto-size the QFAF to offset short-term gains, maximizing your tax efficiency within
        IRS limits.
      </p>
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
          <span className="sizing-value">{formatCurrency(results.sizing.collateralValue)}</span>
          <span className="sizing-sublabel">{results.sizing.strategyName}</span>
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
          <span className="sizing-value">{formatCurrency(results.sizing.qfafValue)}</span>
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
          <span className="sizing-value">{formatCurrency(results.sizing.totalExposure)}</span>
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
          <span className="sizing-value">{formatCurrency(results.sizing.section461Limit)}</span>
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
        <div className="offset-row result success">
          <span>
            <InfoText contentKey="net-st-position" currentValue="$0 (Fully Matched)">
              Net ST Position
            </InfoText>
          </span>
          <span>Fully Matched{results.sizing.sizingYears > 1 ? ' (on avg)' : ''}</span>
        </div>
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

      {/* Year 1 Tax Benefit Breakdown */}
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
                contentKey="st-lt-conversion-benefit"
                currentValue={formatCurrency(results.sizing.year1StLosses * rateDifferential)}
              >
                ST→LT Conversion
              </InfoText>
            </span>
            <span className="benefit-value positive">
              +{formatCurrency(results.sizing.year1StLosses * rateDifferential)}
            </span>
            <span className="benefit-formula">
              {formatCurrency(results.sizing.year1StLosses)} × {formatPercent(rateDifferential)}
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
            <span className="benefit-value">
              {formatCurrency(results.years[0]?.taxSavings ?? 0)}
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
                <InfoText contentKey="st-lt-conversion-benefit">
                  ST→LT Conversion
                </InfoText>
              </span>
              <span className="benefit-value positive">
                +{formatCurrency(results.years[1]?.stLossesHarvested * rateDifferential)}
              </span>
              <span className="benefit-formula">
                {formatCurrency(results.years[1]?.stLossesHarvested)} ×{' '}
                {formatPercent(rateDifferential)}
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
              <span className="benefit-value">
                {formatCurrency(results.years[1]?.taxSavings ?? 0)}
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
    </section>
  );
}
