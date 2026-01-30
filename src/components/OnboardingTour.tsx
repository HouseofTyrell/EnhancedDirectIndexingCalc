import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

const TOUR_KEY = STORAGE_KEYS.TOUR_COMPLETED;

interface TourStep {
  targetSelector: string;
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  {
    targetSelector: '.headline-metrics',
    title: 'Projected Tax Savings',
    description: 'Your estimated tax savings appear here. These update in real-time as you change inputs.',
  },
  {
    targetSelector: '#strategy',
    title: 'Choose Your Strategy',
    description: 'Select a collateral strategy type. Core strategies use cash; overlays use appreciated stock.',
  },
  {
    targetSelector: '.toggle-row',
    title: 'Enable QFAF Overlay',
    description: 'Toggle QFAF on to add short-term gains and ordinary losses to your strategy.',
  },
  {
    targetSelector: '#collateral',
    title: 'Enter Collateral Amount',
    description: 'Enter the investment amount. The calculator auto-sizes the QFAF position.',
  },
  {
    targetSelector: '.advanced-options-toggle',
    title: 'Advanced Settings',
    description: 'Access carryforwards, formula constants, and year-by-year planning tools here.',
  },
];

export function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Check if tour should show
  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      // Delay start to let page render
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Position tooltip relative to target element
  const updatePosition = useCallback(() => {
    if (!active || step >= STEPS.length) return;
    const target = document.querySelector(STEPS[step].targetSelector);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const scrollTop = window.scrollY;

    // Scroll element into view if needed
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Position tooltip below the target
    setPosition({
      top: rect.bottom + scrollTop + 12,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - 340)),
      width: Math.min(rect.width, 320),
    });
  }, [active, step]);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [updatePosition]);

  const dismiss = useCallback(() => {
    localStorage.setItem(TOUR_KEY, 'true');
    setActive(false);
  }, []);

  const next = useCallback(() => {
    if (step + 1 >= STEPS.length) {
      dismiss();
    } else {
      setStep(s => s + 1);
    }
  }, [step, dismiss]);

  if (!active || step >= STEPS.length || !position) return null;

  const currentStep = STEPS[step];

  return (
    <>
      {/* Overlay backdrop */}
      <div className="tour-overlay" ref={overlayRef} onClick={dismiss} />

      {/* Tooltip */}
      <div
        className="tour-tooltip"
        style={{ top: position.top, left: position.left }}
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${STEPS.length}`}
      >
        <div className="tour-tooltip__header">
          <span className="tour-tooltip__step">
            {step + 1} / {STEPS.length}
          </span>
          <h4 className="tour-tooltip__title">{currentStep.title}</h4>
        </div>
        <p className="tour-tooltip__description">{currentStep.description}</p>
        <div className="tour-tooltip__actions">
          <button className="tour-tooltip__skip" onClick={dismiss}>
            Skip Tour
          </button>
          <button className="tour-tooltip__next" onClick={next}>
            {step + 1 === STEPS.length ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
