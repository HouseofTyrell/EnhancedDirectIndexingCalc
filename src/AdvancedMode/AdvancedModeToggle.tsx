import { memo } from 'react';

interface AdvancedModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export const AdvancedModeToggle = memo(function AdvancedModeToggle({ enabled, onToggle }: AdvancedModeToggleProps) {
  return (
    <div className="advanced-mode-toggle">
      <label className="advanced-toggle-label">
        <span className="toggle-text">Advanced Mode</span>
        <div className="advanced-toggle-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggle}
            aria-describedby="advanced-mode-hint"
          />
          <span className="advanced-toggle-knob" />
        </div>
      </label>
      <span id="advanced-mode-hint" className="toggle-hint">
        {enabled ? 'Showing advanced analysis tools' : 'Enable for planning and analysis'}
      </span>
    </div>
  );
});
