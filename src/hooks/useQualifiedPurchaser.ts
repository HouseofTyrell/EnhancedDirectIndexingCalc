import { useState, useEffect } from 'react';

const STORAGE_KEY = 'taxCalc_qpAcknowledged';

export interface QualifiedPurchaserState {
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

const DEFAULT_STATE: QualifiedPurchaserState = {
  acknowledged: false,
  acknowledgedAt: null,
};

/**
 * Hook to manage qualified purchaser acknowledgment state.
 * Persists to localStorage so users don't have to acknowledge every session.
 */
export function useQualifiedPurchaser() {
  const [state, setState] = useState<QualifiedPurchaserState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.acknowledged === 'boolean') {
          return parsed;
        }
      }
    } catch {
      // localStorage not available or invalid data
    }
    return DEFAULT_STATE;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage not available
    }
  }, [state]);

  const acknowledge = () => {
    setState({
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    });
  };

  const reset = () => {
    setState(DEFAULT_STATE);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage not available
    }
  };

  return {
    isAcknowledged: state.acknowledged,
    acknowledgedAt: state.acknowledgedAt,
    acknowledge,
    reset,
  };
}
