/**
 * Manager/fund branding anonymization.
 *
 * The public-facing build uses generic labels ("Manager"/"the Manager",
 * "Fund"/"the Fund") in place of the real manager brand ("Quantinno") and fund
 * name ("Quantinno Fundamental Arbitrage Fund" / "QFAF"). Anonymization is the
 * DEFAULT.
 *
 * The real names can be revealed for internal use via a hidden click sequence
 * on the app title (see StickyHeader). The reveal flag is a single global,
 * localStorage-backed store so every subscribed component updates the moment
 * the toggle flips — no page reload, so in-progress inputs are preserved.
 *
 * IMPORTANT: this ONLY affects user-visible strings routed through
 * `brandText()` / `useBrandText()` / `getPopupContent()`. It never touches code
 * identifiers, data-model field names, CSS classes, or CSV/Excel serialization
 * keys — those keep the literal `qfaf`/`quantinno` spelling.
 */
import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from './constants/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.REVEAL_BRAND;

// Ordered replacements applied when branding is anonymized (most specific
// first). Each rule maps a real-name pattern to its generic public label.
//
// The bare acronym maps to "Fund" (not "the Fund") and the manager to
// "Manager" (not "the Manager") on purpose: an article already present in the
// source prose then flows through naturally ("the QFAF" → "the Fund", "the
// Quantinno alpha" → "the Manager alpha"), while standalone labels stay clean
// ("QFAF Value" → "Fund Value", not "the Fund Value"). Mapping to "the Fund"
// directly would double the article ("the the Fund", "No the Fund is used").
const ANONYMIZE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Full fund name, with or without a "(QFAF)" gloss on either side.
  [/Quantinno Fundamental Arbitrage Fund\s*\(QFAF\)/g, 'Fundamental Arbitrage Fund'],
  [/QFAF\s*\(Quantinno Fundamental Arbitrage Fund\)/g, 'Fund'],
  [/Fundamental Arbitrage Fund\s*\(QFAF\)/g, 'Fundamental Arbitrage Fund'],
  [/Quantinno Fundamental Arbitrage Fund/g, 'Fundamental Arbitrage Fund'],
  // Bare fund acronym (article, if any, is preserved by the surrounding text).
  [/\bQFAF\b/g, 'Fund'],
  // Bare manager name.
  [/\bQuantinno\b/g, 'Manager'],
];

/**
 * Apply anonymization rules to a display string. Returns the string unchanged
 * when real names are revealed. Preserves the leading-capital of the original
 * so a label that began with "QFAF …" reads "The Fund …", not "the Fund …".
 */
export function anonymizeBrandText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of ANONYMIZE_RULES) {
    out = out.replace(pattern, replacement);
  }
  if (out !== input && /^[A-Z]/.test(input) && /^[a-z]/.test(out)) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

// --- Global reveal store (localStorage-backed, useSyncExternalStore) ---------

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let revealed = readInitial();
const listeners = new Set<() => void>();

/** Current reveal state (non-reactive read; for use inside event handlers). */
export function isBrandRevealed(): boolean {
  return revealed;
}

export function setBrandRevealed(next: boolean): void {
  if (next === revealed) return;
  revealed = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // Storage unavailable (private mode, etc.) — keep in-memory state only.
  }
  listeners.forEach(listener => listener());
}

export function toggleBrandRevealed(): boolean {
  setBrandRevealed(!revealed);
  return revealed;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive subscription to the reveal flag. */
export function useBrandRevealed(): boolean {
  return useSyncExternalStore(subscribe, isBrandRevealed, isBrandRevealed);
}

/**
 * Transform a display string per the current branding mode.
 * Reads the module-level flag; call from a component that has subscribed via
 * `useBrandRevealed()` (or use `useBrandText()`) so it re-renders on toggle.
 */
export function brandText(input: string): string {
  return revealed ? input : anonymizeBrandText(input);
}

/**
 * Hook returning a branding-aware text transform. Subscribes the calling
 * component to reveal changes so labels update live when the toggle flips.
 */
export function useBrandText(): (input: string) => string {
  const isRevealed = useBrandRevealed();
  return (input: string) => (isRevealed ? input : anonymizeBrandText(input));
}
