import { useState } from 'react';
import { CalculatorInputs, AdvancedSettings } from '../types';
import { SettingsPanel } from '../AdvancedMode/SettingsPanel';
import { formatWithCommas, parseFormattedNumber } from '../utils/formatters';

interface AdvancedOptionsPanelProps {
  inputs: CalculatorInputs;
  advancedSettings: AdvancedSettings;
  onUpdateInput: <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) => void;
  onUpdateSettings: (settings: AdvancedSettings) => void;
  onResetSettings: () => void;
}

export function AdvancedOptionsPanel({
  inputs,
  advancedSettings,
  onUpdateInput,
  onUpdateSettings,
  onResetSettings,
}: AdvancedOptionsPanelProps) {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  return (
    <>
      {/* Advanced Options Toggle */}
      <div className="advanced-options-toggle">
        <button
          type="button"
          className={`advanced-options-btn ${showAdvancedOptions ? 'active' : ''}`}
          onClick={() => setShowAdvancedOptions(v => !v)}
        >
          <span className="toggle-icon">{showAdvancedOptions ? '▼' : '▶'}</span>
          Advanced Options
          {showAdvancedOptions && (
            <span className="advanced-options-hint">Carryforwards &amp; formula overrides</span>
          )}
        </button>
      </div>

      {/* Advanced Options Content (inline, no modal) */}
      {showAdvancedOptions && (
        <div className="advanced-options-content">
          {/* Existing Carryforwards */}
          <div className="advanced-options-section">
            <h3 className="advanced-options-section-title">Existing Carryforwards</h3>
            <div className="input-grid">
              <div className="input-group">
                <label htmlFor="stCarry">Existing ST Loss Carryforward</label>
                <div className="input-with-prefix">
                  <span className="prefix">$</span>
                  <input
                    id="stCarry"
                    type="text"
                    inputMode="numeric"
                    value={formatWithCommas(inputs.existingStLossCarryforward)}
                    onChange={e =>
                      onUpdateInput(
                        'existingStLossCarryforward',
                        parseFormattedNumber(e.target.value)
                      )
                    }
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="ltCarry">Existing LT Loss Carryforward</label>
                <div className="input-with-prefix">
                  <span className="prefix">$</span>
                  <input
                    id="ltCarry"
                    type="text"
                    inputMode="numeric"
                    value={formatWithCommas(inputs.existingLtLossCarryforward)}
                    onChange={e =>
                      onUpdateInput(
                        'existingLtLossCarryforward',
                        parseFormattedNumber(e.target.value)
                      )
                    }
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="nolCarry">Existing NOL Carryforward</label>
                <div className="input-with-prefix">
                  <span className="prefix">$</span>
                  <input
                    id="nolCarry"
                    type="text"
                    inputMode="numeric"
                    value={formatWithCommas(inputs.existingNolCarryforward)}
                    onChange={e =>
                      onUpdateInput('existingNolCarryforward', parseFormattedNumber(e.target.value))
                    }
                  />
                </div>
                <span className="input-hint">Can offset 80% of future taxable income</span>
              </div>
            </div>
          </div>

          {/* Formula Constants */}
          <div className="advanced-options-section">
            <h3 className="advanced-options-section-title">Formula Constants</h3>
            <SettingsPanel
              settings={advancedSettings}
              onChange={onUpdateSettings}
              onReset={onResetSettings}
            />
          </div>
        </div>
      )}
    </>
  );
}
