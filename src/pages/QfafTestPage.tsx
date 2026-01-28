import { useState } from 'react';
import { QfafTestByYear } from '../AdvancedMode/QfafTestByYear';
import { FILING_STATUSES, FilingStatus } from '../types';

export function QfafTestPage() {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('mfj');

  return (
    <div className="qfaf-test-page">
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
