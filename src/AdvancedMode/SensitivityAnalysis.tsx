import { SensitivityParams, DEFAULT_SENSITIVITY } from '../types';
import { InfoText } from '../InfoPopup';

interface SensitivityAnalysisProps {
  params: SensitivityParams;
  onChange: (params: SensitivityParams) => void;
  onReset: () => void;
}

// Format value for display based on parameter type
const formatValue = (key: keyof SensitivityParams, value: number): string => {
  switch (key) {
    case 'federalRateChange':
    case 'stateRateChange': {
      const sign = value >= 0 ? '+' : '';
      return `${sign}${(value * 100).toFixed(1)}%`;
    }
    case 'annualReturn':
      return `${(value * 100).toFixed(1)}%`;
    case 'trackingErrorMultiplier':
      return `${value.toFixed(2)}x`;
    case 'stLossRateVariance':
    case 'ltGainRateVariance': {
      const varSign = value >= 0 ? '+' : '';
      return `${varSign}${(value * 100).toFixed(0)}%`;
    }
    default:
      return value.toString();
  }
};

// Get value class for styling
const getValueClass = (key: keyof SensitivityParams, value: number): string => {
  const defaultValue = DEFAULT_SENSITIVITY[key];

  if (value === defaultValue) return '';

  switch (key) {
    case 'federalRateChange':
    case 'stateRateChange':
      // Higher tax rates = more benefit
      return value > 0 ? 'positive' : 'negative';
    case 'annualReturn':
      return value > DEFAULT_SENSITIVITY.annualReturn ? 'positive' : 'negative';
    case 'trackingErrorMultiplier':
      return value > 1 ? 'negative' : value < 1 ? 'positive' : '';
    case 'stLossRateVariance':
      // More ST losses = more benefit
      return value > 0 ? 'positive' : 'negative';
    case 'ltGainRateVariance':
      // More LT gains = more cost
      return value > 0 ? 'negative' : 'positive';
    default:
      return '';
  }
};

export function SensitivityAnalysis({ params, onChange, onReset }: SensitivityAnalysisProps) {
  const handleChange = (key: keyof SensitivityParams, value: number) => {
    onChange({ ...params, [key]: value });
  };

  // Check if any parameter has changed from defaults
  const hasChanges = Object.keys(params).some(
    key =>
      params[key as keyof SensitivityParams] !== DEFAULT_SENSITIVITY[key as keyof SensitivityParams]
  );

  return (
    <div className="sensitivity-analysis">
      <p className="section-description">
        Stress-test your projections by adjusting tax rates, returns, and strategy performance.
        Changes show impact on tax savings calculations.
      </p>

      <div className="sensitivity-grid">
        {/* Tax Rate Changes */}
        <div className="sensitivity-group">
          <div className="sensitivity-label">
            <span>
              <InfoText contentKey="sens-federal-rate">
                Federal Rate Change
              </InfoText>
            </span>
            <span
              className={`sensitivity-value ${getValueClass('federalRateChange', params.federalRateChange)}`}
            >
              {formatValue('federalRateChange', params.federalRateChange)}
            </span>
          </div>
          <input
            type="range"
            className="sensitivity-slider"
            min={-0.05}
            max={0.05}
            step={0.005}
            value={params.federalRateChange}
            onChange={e => handleChange('federalRateChange', parseFloat(e.target.value))}
          />
          <span className="sensitivity-help">Model potential tax law changes (-5% to +5%)</span>
        </div>

        <div className="sensitivity-group">
          <div className="sensitivity-label">
            <span>
              <InfoText contentKey="sens-state-rate">
                State Rate Change
              </InfoText>
            </span>
            <span
              className={`sensitivity-value ${getValueClass('stateRateChange', params.stateRateChange)}`}
            >
              {formatValue('stateRateChange', params.stateRateChange)}
            </span>
          </div>
          <input
            type="range"
            className="sensitivity-slider"
            min={-0.05}
            max={0.05}
            step={0.005}
            value={params.stateRateChange}
            onChange={e => handleChange('stateRateChange', parseFloat(e.target.value))}
          />
          <span className="sensitivity-help">Model state tax changes or relocation</span>
        </div>

        {/* Market Returns */}
        <div className="sensitivity-group">
          <div className="sensitivity-label">
            <span>
              <InfoText contentKey="sens-annual-return">
                Annual Return
              </InfoText>
            </span>
            <span
              className={`sensitivity-value ${getValueClass('annualReturn', params.annualReturn)}`}
            >
              {formatValue('annualReturn', params.annualReturn)}
            </span>
          </div>
          <input
            type="range"
            className="sensitivity-slider"
            min={-0.2}
            max={0.2}
            step={0.01}
            value={params.annualReturn}
            onChange={e => handleChange('annualReturn', parseFloat(e.target.value))}
          />
          <span className="sensitivity-help">Bear (-20%) to Bull (+20%) market scenarios</span>
        </div>

        <div className="sensitivity-group">
          <div className="sensitivity-label">
            <span>
              <InfoText contentKey="sens-tracking-error">
                Tracking Error Impact
              </InfoText>
            </span>
            <span
              className={`sensitivity-value ${getValueClass('trackingErrorMultiplier', params.trackingErrorMultiplier)}`}
            >
              {formatValue('trackingErrorMultiplier', params.trackingErrorMultiplier)}
            </span>
          </div>
          <input
            type="range"
            className="sensitivity-slider"
            min={0}
            max={2}
            step={0.1}
            value={params.trackingErrorMultiplier}
            onChange={e => handleChange('trackingErrorMultiplier', parseFloat(e.target.value))}
          />
          <span className="sensitivity-help">
            Strategy deviation from expected (0x = perfect, 2x = high variance)
          </span>
        </div>

        {/* Strategy Performance */}
        <div className="sensitivity-group">
          <div className="sensitivity-label">
            <span>
              <InfoText contentKey="sens-st-loss-variance">
                ST Loss Rate Variance
              </InfoText>
            </span>
            <span
              className={`sensitivity-value ${getValueClass('stLossRateVariance', params.stLossRateVariance)}`}
            >
              {formatValue('stLossRateVariance', params.stLossRateVariance)}
            </span>
          </div>
          <input
            type="range"
            className="sensitivity-slider"
            min={-0.5}
            max={0.5}
            step={0.05}
            value={params.stLossRateVariance}
            onChange={e => handleChange('stLossRateVariance', parseFloat(e.target.value))}
          />
          <span className="sensitivity-help">Tax-loss harvesting effectiveness (-50% to +50%)</span>
        </div>

        <div className="sensitivity-group">
          <div className="sensitivity-label">
            <span>
              <InfoText contentKey="sens-lt-gain-variance">
                LT Gain Rate Variance
              </InfoText>
            </span>
            <span
              className={`sensitivity-value ${getValueClass('ltGainRateVariance', params.ltGainRateVariance)}`}
            >
              {formatValue('ltGainRateVariance', params.ltGainRateVariance)}
            </span>
          </div>
          <input
            type="range"
            className="sensitivity-slider"
            min={-0.5}
            max={0.5}
            step={0.05}
            value={params.ltGainRateVariance}
            onChange={e => handleChange('ltGainRateVariance', parseFloat(e.target.value))}
          />
          <span className="sensitivity-help">LT gains realization rate (-50% to +50%)</span>
        </div>
      </div>

      <div className="sensitivity-actions">
        <button type="button" onClick={onReset} className="btn-secondary" disabled={!hasChanges}>
          Reset to Defaults
        </button>
        {hasChanges && <span className="changes-indicator">Sensitivity adjustments active</span>}
      </div>
    </div>
  );
}
