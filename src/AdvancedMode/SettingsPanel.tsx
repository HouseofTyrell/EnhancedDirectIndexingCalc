import { AdvancedSettings, DEFAULT_SETTINGS } from '../types';
import { FieldInfoPopup } from '../InfoPopup';
import { formatWithCommas, parseFormattedNumber } from '../utils/formatters';

interface SettingsPanelProps {
  settings: AdvancedSettings;
  onChange: (settings: AdvancedSettings) => void;
  onReset: () => void;
}

// Format percentage with 1 decimal place
const formatPercent = (value: number) => {
  return `${(value * 100).toFixed(1)}%`;
};

export function SettingsPanel({ settings, onChange, onReset }: SettingsPanelProps) {
  const handleChange = (path: string, value: number | boolean) => {
    const keys = path.split('.');
    if (keys.length === 1) {
      onChange({ ...settings, [keys[0]]: value });
    } else if (keys.length === 2 && keys[0] === 'section461Limits') {
      onChange({
        ...settings,
        section461Limits: {
          ...settings.section461Limits,
          [keys[1]]: value,
        },
      });
    }
  };

  // Check if any setting has changed from defaults
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);

  return (
    <div className="settings-panel">
      <div className="settings-warning">
        <span className="settings-warning-icon">&#9888;</span>
        <span>
          These settings control core calculation parameters. Changes affect all projections. Only
          modify if you understand the tax implications.
        </span>
      </div>

      <p className="section-description">
        Override formula constants for scenario modeling or jurisdiction-specific rules.
      </p>

      <div className="settings-grid">
        {/* QFAF Mechanics */}
        <div className="settings-section">
          <h4>QFAF Mechanics</h4>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">
                QFAF Multiplier
                <FieldInfoPopup contentKey="setting-qfaf-multiplier" />
              </span>
              <span className="setting-hint">ST gains & ordinary losses as % of QFAF MV</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.qfafMultiplier !== DEFAULT_SETTINGS.qfafMultiplier ? 'modified' : ''}`}
              value={formatPercent(settings.qfafMultiplier)}
              onChange={e => {
                const val = parseFloat(e.target.value.replace('%', '')) / 100;
                if (!isNaN(val)) handleChange('qfafMultiplier', val);
              }}
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">
                QFAF Growth
                <FieldInfoPopup contentKey="setting-qfaf-growth" />
              </span>
              <span className="setting-hint">Whether QFAF appreciates with market returns</span>
            </div>
            <label className={`toggle-switch ${!settings.qfafGrowthEnabled ? 'modified' : ''}`}>
              <input
                type="checkbox"
                checked={settings.qfafGrowthEnabled}
                onChange={e => handleChange('qfafGrowthEnabled', e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">
                {settings.qfafGrowthEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">
                Wash Sale Disallowance
                <FieldInfoPopup contentKey="setting-wash-sale" />
              </span>
              <span className="setting-hint">
                % of ST losses disallowed due to wash sales (0-15%)
              </span>
            </div>
            <div className="slider-input-group">
              <input
                type="range"
                min="0"
                max="0.15"
                step="0.01"
                value={settings.washSaleDisallowanceRate}
                onChange={e => handleChange('washSaleDisallowanceRate', parseFloat(e.target.value))}
                className={
                  settings.washSaleDisallowanceRate !== DEFAULT_SETTINGS.washSaleDisallowanceRate
                    ? 'modified'
                    : ''
                }
              />
              <span className="slider-value">
                {formatPercent(settings.washSaleDisallowanceRate)}
              </span>
            </div>
          </div>
        </div>

        {/* Section 461(l) Limits */}
        <div className="settings-section">
          <h4>
            Section 461(l) Limits
            <FieldInfoPopup contentKey="section-461-limit" />
          </h4>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Married Filing Jointly</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.section461Limits.mfj !== DEFAULT_SETTINGS.section461Limits.mfj ? 'modified' : ''}`}
              value={`$${formatWithCommas(settings.section461Limits.mfj)}`}
              onChange={e =>
                handleChange(
                  'section461Limits.mfj',
                  parseFormattedNumber(e.target.value.replace('$', ''))
                )
              }
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Single</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.section461Limits.single !== DEFAULT_SETTINGS.section461Limits.single ? 'modified' : ''}`}
              value={`$${formatWithCommas(settings.section461Limits.single)}`}
              onChange={e =>
                handleChange(
                  'section461Limits.single',
                  parseFormattedNumber(e.target.value.replace('$', ''))
                )
              }
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Married Filing Separately</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.section461Limits.mfs !== DEFAULT_SETTINGS.section461Limits.mfs ? 'modified' : ''}`}
              value={`$${formatWithCommas(settings.section461Limits.mfs)}`}
              onChange={e =>
                handleChange(
                  'section461Limits.mfs',
                  parseFormattedNumber(e.target.value.replace('$', ''))
                )
              }
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Head of Household</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.section461Limits.hoh !== DEFAULT_SETTINGS.section461Limits.hoh ? 'modified' : ''}`}
              value={`$${formatWithCommas(settings.section461Limits.hoh)}`}
              onChange={e =>
                handleChange(
                  'section461Limits.hoh',
                  parseFormattedNumber(e.target.value.replace('$', ''))
                )
              }
            />
          </div>
        </div>

        {/* NOL Rules */}
        <div className="settings-section">
          <h4>
            NOL Rules
            <FieldInfoPopup contentKey="nol-carryforward" />
          </h4>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">NOL Offset Limit</span>
              <span className="setting-hint">Max % of taxable income NOL can offset</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.nolOffsetLimit !== DEFAULT_SETTINGS.nolOffsetLimit ? 'modified' : ''}`}
              value={formatPercent(settings.nolOffsetLimit)}
              onChange={e => {
                const val = parseFloat(e.target.value.replace('%', '')) / 100;
                if (!isNaN(val) && val >= 0 && val <= 1) handleChange('nolOffsetLimit', val);
              }}
            />
          </div>
        </div>

        {/* Portfolio Assumptions */}
        <div className="settings-section">
          <h4>Portfolio Assumptions</h4>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Default Annual Return</span>
              <span className="setting-hint">Expected annual portfolio growth</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.defaultAnnualReturn !== DEFAULT_SETTINGS.defaultAnnualReturn ? 'modified' : ''}`}
              value={formatPercent(settings.defaultAnnualReturn)}
              onChange={e => {
                const val = parseFloat(e.target.value.replace('%', '')) / 100;
                if (!isNaN(val)) handleChange('defaultAnnualReturn', val);
              }}
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Projection Years</span>
              <span className="setting-hint">Number of years to project</span>
            </div>
            <input
              type="number"
              className={`setting-input ${settings.projectionYears !== DEFAULT_SETTINGS.projectionYears ? 'modified' : ''}`}
              value={settings.projectionYears}
              min={1}
              max={30}
              onChange={e => handleChange('projectionYears', parseInt(e.target.value) || 10)}
            />
          </div>
        </div>

        {/* Tax Rate Assumptions */}
        <div className="settings-section">
          <h4>
            Tax Rate Assumptions
            <FieldInfoPopup contentKey="federal-st-rate" />
          </h4>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">NIIT Rate</span>
              <span className="setting-hint">Net Investment Income Tax</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.niitRate !== DEFAULT_SETTINGS.niitRate ? 'modified' : ''}`}
              value={formatPercent(settings.niitRate)}
              onChange={e => {
                const val = parseFloat(e.target.value.replace('%', '')) / 100;
                if (!isNaN(val)) handleChange('niitRate', val);
              }}
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">LTCG Rate</span>
              <span className="setting-hint">Long-term capital gains rate</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.ltcgRate !== DEFAULT_SETTINGS.ltcgRate ? 'modified' : ''}`}
              value={formatPercent(settings.ltcgRate)}
              onChange={e => {
                const val = parseFloat(e.target.value.replace('%', '')) / 100;
                if (!isNaN(val)) handleChange('ltcgRate', val);
              }}
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Top Ordinary Rate</span>
              <span className="setting-hint">Top marginal ordinary income rate</span>
            </div>
            <input
              type="text"
              className={`setting-input ${settings.stcgRate !== DEFAULT_SETTINGS.stcgRate ? 'modified' : ''}`}
              value={formatPercent(settings.stcgRate)}
              onChange={e => {
                const val = parseFloat(e.target.value.replace('%', '')) / 100;
                if (!isNaN(val)) handleChange('stcgRate', val);
              }}
            />
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" onClick={onReset} className="btn-secondary" disabled={!hasChanges}>
          Reset to Defaults
        </button>
        {hasChanges && <span className="changes-indicator">Custom settings active</span>}
      </div>
    </div>
  );
}
