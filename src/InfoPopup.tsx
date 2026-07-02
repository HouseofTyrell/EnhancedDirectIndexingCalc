import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getPopupContent } from './popupContent';
import { useBrandRevealed } from './branding';

interface InfoPopupProps {
  title: string;
  children: React.ReactNode;
}

export function InfoPopup({ title, children }: InfoPopupProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="info-button"
        onClick={() => setIsOpen(true)}
        aria-label={`Info about ${title}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm1 12H7V7h2v5zm0-6H7V4h2v2z" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div className="popup-overlay" onClick={() => setIsOpen(false)}>
            <div className="popup-content" onClick={e => e.stopPropagation()}>
              <div className="popup-header">
                <h3>{title}</h3>
                <button
                  type="button"
                  className="popup-close"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="popup-body">{children}</div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// A single labeled term of a formula, shown as a "Your value" sub-breakdown.
// `negative` renders the term as a subtraction (the netted-out piece).
export interface PopupBreakdownItem {
  label: string;
  value: string;
  negative?: boolean;
}

// Shared body for the field-level popups (FieldInfoPopup + InfoText) so the
// definition / formula / value / breakdown / impact layout stays in one place.
interface FieldPopupBodyContent {
  definition: string;
  formula?: string;
  impact: string;
}

function FieldPopupBody({
  content,
  currentValue,
  breakdown,
}: {
  content: FieldPopupBodyContent;
  currentValue?: string;
  breakdown?: PopupBreakdownItem[];
}) {
  return (
    <div className="field-popup">
      <p className="field-definition">{content.definition}</p>
      {content.formula && (
        <div className="field-formula">
          <strong>Formula:</strong>
          <code>{content.formula}</code>
        </div>
      )}
      {currentValue && (
        <div className="field-current-value">
          <strong>Your value:</strong> {currentValue}
        </div>
      )}
      {breakdown && breakdown.length > 0 && (
        <dl className="field-breakdown">
          {breakdown.map(item => (
            <div key={item.label} className="field-breakdown-row">
              <dt>{item.label}</dt>
              <dd className={item.negative ? 'negative' : undefined}>
                {item.negative ? '−' : ''}
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="field-impact">
        <strong>Impact:</strong> {content.impact}
      </p>
    </div>
  );
}

// Field-level info popup - shows definition, formula, and impact
interface FieldInfoPopupProps {
  contentKey: string;
  currentValue?: string;
  breakdown?: PopupBreakdownItem[];
}

export function FieldInfoPopup({ contentKey, currentValue, breakdown }: FieldInfoPopupProps) {
  useBrandRevealed(); // re-render when the brand-reveal toggle flips
  const content = getPopupContent(contentKey);
  if (!content) return null;

  return (
    <InfoPopup title={content.title}>
      <FieldPopupBody content={content} currentValue={currentValue} breakdown={breakdown} />
    </InfoPopup>
  );
}

// Clickable text info - wraps text with dotted underline that opens popup on click
interface InfoTextProps {
  contentKey: string;
  children: React.ReactNode;
  currentValue?: string;
  breakdown?: PopupBreakdownItem[];
}

export function InfoText({ contentKey, children, currentValue, breakdown }: InfoTextProps) {
  const [isOpen, setIsOpen] = useState(false);
  useBrandRevealed(); // re-render when the brand-reveal toggle flips
  const content = getPopupContent(contentKey);

  // If no content, just render the children without popup functionality
  if (!content) return <>{children}</>;

  return (
    <>
      <span
        className="info-text"
        onClick={e => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            setIsOpen(true);
          }
        }}
      >
        {children}
      </span>

      {isOpen &&
        createPortal(
          <div className="popup-overlay" onClick={() => setIsOpen(false)}>
            <div className="popup-content" onClick={e => e.stopPropagation()}>
              <div className="popup-header">
                <h3>{content.title}</h3>
                <button
                  type="button"
                  className="popup-close"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="popup-body">
                <FieldPopupBody
                  content={content}
                  currentValue={currentValue}
                  breakdown={breakdown}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// Formula documentation components - extracted to src/components/Formulas/
export {
  TaxRatesFormula,
  QfafSizingFormula,
  Section461lFormula,
  TaxAlphaFormula,
  StrategyRatesFormula,
  QfafMechanicsFormula,
  ProjectionFormula,
} from './components/Formulas';
