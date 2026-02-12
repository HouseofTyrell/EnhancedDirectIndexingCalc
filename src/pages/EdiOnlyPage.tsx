import { useState } from 'react';
import { EdiOnlyTab } from '../components/EdiOnlyTab';
import { FILING_STATUSES, FilingStatus } from '../types';
import { STATES, getStateRate, getFederalLtRate, getFederalStRate } from '../taxData';
import { usePinnedEdiScenario } from '../hooks/usePinnedEdiScenario';

const HIGH_INCOME = 3_000_000; // Assume high earner for rate lookups

export function EdiOnlyPage() {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('mfj');
  const [stateCode, setStateCode] = useState('CA');
  const [dismissedDisclosure, setDismissedDisclosure] = useState(false);
  const pinnedScenario = usePinnedEdiScenario();

  // Compute combined rates
  const stateRate = getStateRate(stateCode);
  const federalStRate = getFederalStRate(HIGH_INCOME, filingStatus);
  const federalLtRate = getFederalLtRate(HIGH_INCOME, filingStatus);
  const combinedStRate = federalStRate + stateRate;
  const combinedLtRate = federalLtRate + stateRate;

  return (
    <div className="qfaf-test-page">
      {!dismissedDisclosure && (
        <div className="development-disclosure">
          <div className="development-disclosure__content">
            <div className="development-disclosure__icon">&#9888;</div>
            <div className="development-disclosure__text">
              <h3>Under Development</h3>
              <p>
                This page models Enhanced Direct Indexing (EDI) economics without QFAF overlay.
                Calculations are under active development and should not be used for
                investment decisions or client presentations without independent verification.
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
        <h1>EDI-Only Analysis</h1>
        <p className="page-description">
          Model the standalone value of Enhanced Direct Indexing — carryforward accumulation,
          realization scenarios, unwind analysis, and estate planning comparison.
        </p>
      </header>

      <section className="page-controls">
        <div className="control-group">
          <label htmlFor="edi-filing-status">Filing Status</label>
          <select
            id="edi-filing-status"
            value={filingStatus}
            onChange={e => setFilingStatus(e.target.value as FilingStatus)}
          >
            {FILING_STATUSES.map(status => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label htmlFor="edi-state">State</label>
          <select
            id="edi-state"
            value={stateCode}
            onChange={e => setStateCode(e.target.value)}
          >
            {STATES.map(s => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name} ({(s.rate * 100).toFixed(1)}%)
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="page-content">
        <EdiOnlyTab
          filingStatus={filingStatus}
          combinedStRate={combinedStRate}
          combinedLtRate={combinedLtRate}
          stateCode={stateCode}
          pinned={pinnedScenario.pinned}
          hasPinned={pinnedScenario.hasPinned}
          onPin={pinnedScenario.pin}
          onUnpin={pinnedScenario.unpin}
          onReplacePin={pinnedScenario.replacePin}
        />
      </section>

      <footer className="page-disclaimer">
        <h4>Important Limitations</h4>
        <ul>
          <li>This calculator models capital loss carryforward accumulation from Enhanced Direct Indexing only</li>
          <li>Carryforwards are lost at death (IRC Section 1212(b)) — positions receive step-up in basis</li>
          <li>The $3K annual capital loss deduction limit applies only to ordinary income offset; there is NO annual limit on using carryforward against capital gains</li>
          <li>NIIT (3.8%) modeling is deferred — capital loss carryforward does reduce net investment income for NIIT purposes</li>
          <li>PA does not conform to federal carryforward rules; PA carryforward provides zero state benefit</li>
          <li>This tool provides estimates for planning purposes only and does not constitute tax or legal advice</li>
        </ul>
      </footer>
    </div>
  );
}
