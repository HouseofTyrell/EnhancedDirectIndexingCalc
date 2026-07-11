import { useEffect, useRef, useState } from 'react';

interface QualifiedPurchaserModalProps {
  onAcknowledge: () => void;
}

interface Acknowledgment {
  id: string;
  label: string;
  description: string;
}

const ACKNOWLEDGMENTS: Acknowledgment[] = [
  {
    id: 'accredited',
    label: 'Accredited Investor',
    description:
      'I am an accredited investor as defined by SEC Rule 501 (net worth > $1M excluding primary residence, or income > $200K individual / $300K joint).',
  },
  {
    id: 'qualified',
    label: 'Qualified Purchaser',
    description:
      'I am a qualified purchaser with at least $5 million in investments, or I am evaluating this calculator on behalf of a qualified purchaser.',
  },
  {
    id: 'leverage',
    label: 'Leverage Risk Understanding',
    description:
      'I understand that leveraged strategies can amplify both gains and losses, and that I could lose more than my initial investment.',
  },
  {
    id: 'notAdvice',
    label: 'Not Investment Advice',
    description:
      'I understand this calculator is for educational and illustrative purposes only and does not constitute investment, tax, or legal advice.',
  },
];

export function QualifiedPurchaserModal({ onAcknowledge }: QualifiedPurchaserModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstCheckboxRef = useRef<HTMLInputElement>(null);

  const allChecked = ACKNOWLEDGMENTS.every(ack => checked[ack.id]);

  const handleCheck = (id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = () => {
    if (allChecked) {
      onAcknowledge();
    }
  };

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstCheckboxRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="qp-modal-overlay">
      <div
        ref={dialogRef}
        className="qp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qp-modal-title"
        aria-describedby="qp-modal-description qp-modal-storage-note"
      >
        <div className="qp-modal-header">
          <h2 id="qp-modal-title">Important Acknowledgments</h2>
          <p id="qp-modal-description">
            This calculator models sophisticated tax optimization strategies involving leveraged
            investments. Please confirm the following before proceeding.
          </p>
        </div>

        <div className="qp-modal-body">
          {ACKNOWLEDGMENTS.map(ack => (
            <label key={ack.id} className="qp-checkbox-item">
              <input
                ref={ack.id === ACKNOWLEDGMENTS[0]?.id ? firstCheckboxRef : undefined}
                type="checkbox"
                checked={checked[ack.id] || false}
                onChange={() => handleCheck(ack.id)}
              />
              <div className="qp-checkbox-content">
                <span className="qp-checkbox-label">{ack.label}</span>
                <span className="qp-checkbox-description">{ack.description}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="qp-modal-footer">
          <button
            type="button"
            className="qp-submit-btn"
            onClick={handleSubmit}
            disabled={!allChecked}
          >
            I Acknowledge and Wish to Proceed
          </button>
          <p id="qp-modal-storage-note" className="qp-footer-note">
            Your acknowledgment will be saved locally. You won't need to confirm again on this
            device.
          </p>
        </div>
      </div>
    </div>
  );
}
