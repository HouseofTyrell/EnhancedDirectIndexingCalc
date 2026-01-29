import { useState } from 'react';
import { QfafTestByYear } from '../AdvancedMode/QfafTestByYear';
import { FILING_STATUSES, FilingStatus } from '../types';

export function QfafTestPage() {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('mfj');
  const [dismissedDisclosure, setDismissedDisclosure] = useState(false);

  return (
    <div className="qfaf-test-page">
      {/* Under Development Disclosure */}
      {!dismissedDisclosure && (
        <div className="development-disclosure">
          <div className="development-disclosure__content">
            <div className="development-disclosure__icon">&#9888;</div>
            <div className="development-disclosure__text">
              <h3>Under Development</h3>
              <p>
                This page is currently under active development and should not be used for
                investment decisions or client presentations. Calculations may be incomplete,
                inaccurate, or subject to change without notice.
              </p>
            </div>
            <button
              className="development-disclosure__dismiss"
              onClick={() => setDismissedDisclosure(true)}
            >
              I understand
            </button>
          </div>
        </div>
      )}

      <header className="page-header">
        <h1>QFAF Test (By Year)</h1>
        <p className="page-description">
          Model QFAF economics year-by-year with custom cash infusions, tax rates, and §461(l) carryforward projections.
        </p>
      </header>

      <section className="page-controls">
        <div className="control-group">
          <label htmlFor="filing-status">Filing Status</label>
          <select
            id="filing-status"
            value={filingStatus}
            onChange={e => setFilingStatus(e.target.value as FilingStatus)}
          >
            {FILING_STATUSES.map(status => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="page-content">
        <QfafTestByYear filingStatus={filingStatus} />
      </section>

      <footer className="page-disclaimer">
        <h4>Important Limitations</h4>
        <ul>
          <li>This calculator models §461(l) excess business loss limitations only</li>
          <li>Actual NOL carryforward utilization is subject to additional rules including the 80% taxable income limitation (§172)</li>
          <li>Results assume the user is actively engaged in the business activity</li>
          <li>State tax treatment varies; some states do not conform to federal §461(l)</li>
          <li>The 2026 limitation amounts are estimates pending IRS publication</li>
          <li>This tool provides estimates for planning purposes only and does not constitute tax advice</li>
        </ul>
      </footer>
    </div>
  );
}
