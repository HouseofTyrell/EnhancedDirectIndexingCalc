interface AdvancedModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function AdvancedModeToggle({ enabled, onToggle }: AdvancedModeToggleProps) {
  return (
    <div className="advanced-mode-toggle">
      <label className="toggle-label">
        <span className="toggle-text">Advanced Mode</span>
        <div className="toggle-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggle}
            aria-describedby="advanced-mode-hint"
          />
          <span className="toggle-slider" />
        </div>
      </label>
      <span id="advanced-mode-hint" className="toggle-hint">
        {enabled
          ? 'Showing advanced analysis tools'
          : 'Enable for planning and analysis'}
      </span>
    </div>
  );
}
