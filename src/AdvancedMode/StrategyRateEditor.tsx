import { memo, useState } from 'react';
import { STRATEGIES, LOSS_RATE_DECAY_FACTOR, LOSS_RATE_FLOOR } from '../strategyData';
import {
  StrategyRateOverrides,
  getDefaultRates,
  getDefaultNetCapitalLossRate,
  loadRateOverrides,
  saveRateOverrides,
  clearRateOverrides,
} from '../utils/strategyRates';
import './StrategyRateEditor.css';

/**
 * Props for the StrategyRateEditor component.
 * Provides a modal editor for customizing net capital loss rates per strategy and year.
 */
interface StrategyRateEditorProps {
  /** Whether the rate editor modal is currently visible */
  isOpen: boolean;
  /** Callback to close the modal (triggered by overlay click or close button) */
  onClose: () => void;
  /** Optional callback fired after rates are saved or reset, to trigger recalculation */
  onRatesChanged?: () => void;
}

type EditMode = 'average' | 'yearly';

// Get the base (Year 1) net capital loss rate for a strategy
function getBaseNetRate(strategyId: string): number {
  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return 0;
  return strategy.stLossRate - strategy.ltGainRate;
}

// Calculate average rate across all years for a strategy
function getAverageRate(rates: StrategyRateOverrides, strategyId: string): number {
  let sum = 0;
  for (let year = 1; year <= 10; year++) {
    const key = `${strategyId}-${year}`;
    sum += rates[key] ?? 0;
  }
  return sum / 10;
}

export const StrategyRateEditor = memo(function StrategyRateEditor({ isOpen, onClose, onRatesChanged }: StrategyRateEditorProps) {
  const [rates, setRates] = useState<StrategyRateOverrides>(() => {
    const defaults = getDefaultRates();
    const overrides = loadRateOverrides();
    return { ...defaults, ...overrides };
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedType, setSelectedType] = useState<'core' | 'overlay'>('core');
  const [editMode, setEditMode] = useState<EditMode>('average');

  const filteredStrategies = STRATEGIES.filter(s => s.type === selectedType);
  const years = Array.from({ length: 10 }, (_, i) => i + 1);

  // Handle rate change for a single year
  const handleYearlyRateChange = (strategyId: string, year: number, value: string) => {
    const numValue = parseFloat(value) / 100;
    if (!isNaN(numValue)) {
      const key = `${strategyId}-${year}`;
      setRates(prev => ({ ...prev, [key]: numValue }));
      setHasChanges(true);
    }
  };

  // Handle average rate change - applies same rate to all years
  const handleAverageRateChange = (strategyId: string, value: string) => {
    const numValue = parseFloat(value) / 100;
    if (!isNaN(numValue)) {
      const newRates = { ...rates };
      for (let year = 1; year <= 10; year++) {
        const key = `${strategyId}-${year}`;
        newRates[key] = numValue;
      }
      setRates(newRates);
      setHasChanges(true);
    }
  };

  const handleSave = () => {
    saveRateOverrides(rates);
    setHasChanges(false);
    onRatesChanged?.();
  };

  const handleReset = () => {
    const defaults = getDefaultRates();
    setRates(defaults);
    clearRateOverrides();
    setHasChanges(false);
    onRatesChanged?.();
  };

  const handleResetStrategy = (strategyId: string) => {
    const newRates = { ...rates };
    for (let year = 1; year <= 10; year++) {
      const key = `${strategyId}-${year}`;
      newRates[key] = getDefaultNetCapitalLossRate(strategyId, year);
    }
    setRates(newRates);
    setHasChanges(true);
  };

  // Apply decay from average - sets Year 1 to average, then applies 7% decay
  const handleApplyDecay = (strategyId: string) => {
    const avgRate = getAverageRate(rates, strategyId);
    const newRates = { ...rates };
    for (let year = 1; year <= 10; year++) {
      const key = `${strategyId}-${year}`;
      const decayedRate = avgRate * Math.pow(LOSS_RATE_DECAY_FACTOR, year - 1);
      newRates[key] = Math.max(decayedRate, avgRate * LOSS_RATE_FLOOR);
    }
    setRates(newRates);
    setHasChanges(true);
  };

  if (!isOpen) return null;

  return (
    <div className="rate-editor-overlay" onClick={onClose}>
      <div className="rate-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="rate-editor-header">
          <h2>Net Capital Loss Rate Editor</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="rate-editor-description">
          <p>Edit the net capital loss rate (ST Loss % - LT Gain %) for each strategy.</p>
          <p className="rate-note">Changes are saved to your browser and used in calculations.</p>
        </div>

        {/* Edit Mode Toggle */}
        <div className="rate-editor-mode-toggle">
          <button
            className={`mode-btn ${editMode === 'average' ? 'active' : ''}`}
            onClick={() => setEditMode('average')}
          >
            Annual Average
          </button>
          <button
            className={`mode-btn ${editMode === 'yearly' ? 'active' : ''}`}
            onClick={() => setEditMode('yearly')}
          >
            Year by Year
          </button>
        </div>

        {/* Strategy Type Tabs */}
        <div className="rate-editor-tabs">
          <button
            className={`tab-btn ${selectedType === 'core' ? 'active' : ''}`}
            onClick={() => setSelectedType('core')}
          >
            Core Strategies
          </button>
          <button
            className={`tab-btn ${selectedType === 'overlay' ? 'active' : ''}`}
            onClick={() => setSelectedType('overlay')}
          >
            Overlay Strategies
          </button>
        </div>

        <div className="rate-editor-table-container">
          {editMode === 'average' ? (
            /* Annual Average Mode */
            <table className="rate-editor-table rate-editor-table--average">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Base Rate</th>
                  <th>Your Rate</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredStrategies.map(strategy => {
                  const baseRate = getBaseNetRate(strategy.id);
                  const avgRate = getAverageRate(rates, strategy.id);
                  const isModified = Math.abs(avgRate - baseRate) > 0.001;

                  return (
                    <tr key={strategy.id}>
                      <td className="strategy-name">
                        <div>{strategy.name}</div>
                        <div className="strategy-label">{strategy.label}</div>
                      </td>
                      <td className="base-rate">{(baseRate * 100).toFixed(1)}%</td>
                      <td className={isModified ? 'modified' : ''}>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="50"
                          value={(avgRate * 100).toFixed(1)}
                          onChange={e => handleAverageRateChange(strategy.id, e.target.value)}
                          className="rate-input rate-input--wide"
                        />
                      </td>
                      <td className="action-buttons">
                        <button
                          className="action-btn"
                          onClick={() => handleApplyDecay(strategy.id)}
                          title="Apply 7% annual decay from this rate"
                        >
                          Apply Decay
                        </button>
                        <button
                          className="reset-row-btn"
                          onClick={() => handleResetStrategy(strategy.id)}
                          title="Reset to defaults"
                        >
                          Reset
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* Year by Year Mode */
            <table className="rate-editor-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  {years.map(year => (
                    <th key={year}>Y{year}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredStrategies.map(strategy => (
                  <tr key={strategy.id}>
                    <td className="strategy-name">
                      <div>{strategy.name}</div>
                      <div className="strategy-label">{strategy.label}</div>
                    </td>
                    {years.map(year => {
                      const key = `${strategy.id}-${year}`;
                      const value = rates[key] ?? 0;
                      const defaultValue = getDefaultNetCapitalLossRate(strategy.id, year);
                      const isModified = Math.abs(value - defaultValue) > 0.0001;

                      return (
                        <td key={year} className={isModified ? 'modified' : ''}>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="50"
                            value={(value * 100).toFixed(1)}
                            onChange={e =>
                              handleYearlyRateChange(strategy.id, year, e.target.value)
                            }
                            className="rate-input"
                          />
                        </td>
                      );
                    })}
                    <td>
                      <button
                        className="reset-row-btn"
                        onClick={() => handleResetStrategy(strategy.id)}
                        title="Reset to defaults"
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rate-editor-actions">
          <button className="btn-secondary" onClick={handleReset}>
            Reset All to Defaults
          </button>
          <button
            className={`btn-primary ${hasChanges ? 'has-changes' : ''}`}
            onClick={handleSave}
            disabled={!hasChanges}
          >
            {hasChanges ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  );
});
