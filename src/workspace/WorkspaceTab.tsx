import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalculatorInputs,
  AdvancedSettings,
  CalculationResult,
  DeleveragePlan,
  DEFAULT_SETTINGS,
  FILING_STATUSES,
  FilingStatus,
  PinnedScenario,
  SplitAllocation,
  YearOverride,
} from '../types';
import { DEFAULTS, STATES, getFederalOrdinaryRate, getStateConformityWarning } from '../taxData';
import { TAX_PARAMETER_MANIFEST } from '../taxParameters';
import { STRATEGIES, getStrategy, getShortRatio } from '../strategyData';
import {
  calculate,
  calculateWithOverrides,
  computeExitTaxAnalysis,
  computeEdiInsights,
  computeStepUpComparison,
  solveCollateralForTotal,
  LONG_ONLY_TARGET,
} from '../calculations';
import { getQuantifiedStateWarning } from '../utils/stateTaxWarnings';
import { downloadInputsCsv, parseInputsFromCsv } from '../utils/csvScenario';
import { exportToExcel } from '../utils/excelExport';
import { getEffectiveView } from '../utils/effectiveAllocation';
import { usePinnedScenario } from '../hooks/usePinnedScenario';
import { MeetingSession, buildActiveOverrides, computeScenarioRates } from './MeetingSession';
import {
  formatCurrency,
  formatCurrencyAbbreviated,
  formatPercent,
  formatWithCommas,
  parseFormattedNumber,
} from '../utils/formatters';
import { ResultsTable } from '../ResultsTable';
import { TaxSavingsChart, PortfolioValueChart } from '../WealthChart';
import { DisclaimerFooter } from '../components/DisclaimerFooter';
import { QualifiedPurchaserModal } from '../components/QualifiedPurchaserModal';
import { useQualifiedPurchaser } from '../hooks/useQualifiedPurchaser';
import { InfoText } from '../InfoPopup';
import { getPopupContent } from '../popupContent';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { brandText, useBrandRevealed } from '../branding';
import { useSecretReveal } from '../hooks/useSecretReveal';
// D-027 fonts: Hanken Grotesk (UI) + IBM Plex Mono (Graphite numerals),
// bundled from @fontsource so vite-plugin-singlefile inlines them — the
// distributable stays self-contained (no runtime CDN fetches). Mono is
// trimmed to the latin 400/500/600 weights actually used.
import '@fontsource-variable/hanken-grotesk';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './workspace.css';

type ResultsView = 'overview' | 'table' | 'charts';
type FundingMode = 'collateral' | 'total';

// ─── D-027: icon set from the design handoff (workspace-mock.jsx) ───
const I = {
  search:
    'M11 4a7 7 0 105.2 11.7l3.55 3.55 1.4-1.4-3.55-3.55A7 7 0 0011 4zm0 2a5 5 0 110 10 5 5 0 010-10z',
  chevD: 'M6 9l6 6 6-6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0',
  layers: 'M12 3l9 5-9 5-9-5 9-5zm9 9l-9 5-9-5m18 4l-9 5-9-5',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M9 13h6',
  overlay: 'M4 4h11v11H4zM9 9h11v11H9',
  trend: 'M3 17l6-6 4 4 7-7M14 8h5v5',
  sliders: 'M4 6h16M4 12h16M4 18h16M9 6v0M15 12v0M7 18v0',
  calendar: 'M5 4h14v16H5zM5 9h14M9 2v4M15 2v4',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
  download: 'M12 3v12m-5-5l5 5 5-5M5 21h14',
  doc: 'M6 2h8l4 4v16H6zM14 2v4h4',
} as const;

function Ico({ d, w = 16 }: { d: string; w?: number }) {
  return (
    <svg
      width={w}
      height={w}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d
        .split('M')
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={'M' + seg} />
        ))}
    </svg>
  );
}

// ─── D-027: collapsible rail group with a set-value summary when closed ───
type GroupId = 'client' | 'strategy' | 'carryforwards' | 'qfaf' | 'deleverage' | 'model' | 'events';

function RailGroup({
  id,
  icon,
  name,
  summary,
  active,
  open,
  onToggle,
  dimmed,
  hit,
  groupRef,
  children,
}: {
  id: GroupId;
  icon: string;
  name: string;
  summary: ReactNode;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  dimmed: boolean;
  hit: boolean;
  groupRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`wx-group${dimmed ? ' wx-group--dim' : ''}${hit ? ' wx-group--hit' : ''}`}
      data-open={open}
      data-active={active}
      data-wx-group={id}
      ref={groupRef}
    >
      <button type="button" className="wx-group-head" onClick={onToggle} aria-expanded={open}>
        <span className="wx-group-ic">
          <Ico d={icon} w={13} />
        </span>
        <span className="wx-group-titles">
          <span className="wx-group-name">{name}</span>
          <span className="wx-group-summary">{summary}</span>
        </span>
        <span className="wx-chev">
          <Ico d={I.chevD} w={14} />
        </span>
      </button>
      <div className="wx-group-body">{children}</div>
    </div>
  );
}

// Searchable keywords per rail group — feeds both the rail's
// "Find a setting…" filter and the ⌘K palette entries.
const GROUP_META: Array<{ id: GroupId; label: string; keywords: string }> = [
  { id: 'client', label: 'Client', keywords: 'filing status state income nyc resident annual' },
  {
    id: 'strategy',
    label: 'Strategy',
    keywords:
      'collateral strategy split allocation core overlay cost basis fund total portfolio budget start month',
  },
  {
    id: 'carryforwards',
    label: 'Carryforwards',
    keywords: 'carryforward existing st lt nol loss capital',
  },
  {
    id: 'qfaf',
    label: 'QFAF Overlay',
    keywords: 'qfaf fund duration sizing dynamic fixed redeploy redemptions',
  },
  {
    id: 'deleverage',
    label: 'Deleveraging',
    keywords: 'deleverage unwind glide path long-only leverage target',
  },
  {
    id: 'model',
    label: 'Model',
    keywords:
      'projection years growth lt gains financing costs fees present value discount wash-sale disallowance',
  },
  {
    id: 'events',
    label: 'Per-Year Events',
    keywords:
      'events income schedule gain event cash infusion presets rsu business sale concentrated stock per-year',
  },
];

// ─── D-027: ⌘K command palette (the findability spine) ───
export interface PaletteItem {
  id: string;
  kind: 'Inputs' | 'View' | 'Action';
  label: string;
  keywords?: string;
  run: () => void;
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored = items
    .map(item => {
      const hay = `${item.label} ${item.keywords ?? ''}`.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score = 3;
      else if (q.split(/\s+/).every(tok => hay.includes(tok))) score = 2;
      else if (isSubsequence(q.replace(/\s+/g, ''), hay)) score = 1;
      return { item, score };
    })
    .filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.item);
}

function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const filtered = useMemo(() => filterPaletteItems(items, query), [items, query]);
  const selIndex = Math.min(sel, Math.max(0, filtered.length - 1));

  const runItem = (item: PaletteItem) => {
    onClose();
    item.run();
  };

  return (
    <div className="wx-palette-overlay" onClick={onClose} data-testid="wx-palette">
      <div
        className="wx-palette"
        role="dialog"
        aria-label="Jump to anything"
        onClick={e => e.stopPropagation()}
      >
        <div className="wx-palette-input">
          <Ico d={I.search} w={15} />
          <input
            autoFocus
            placeholder="Jump to a setting, view, or action…"
            aria-label="Jump to a setting, view, or action"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel(s => Math.min(s + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel(s => Math.max(s - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = filtered[selIndex];
                if (item) runItem(item);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
          <span className="wx-kbd">esc</span>
        </div>
        <div className="wx-palette-list">
          {filtered.length === 0 && (
            <div className="wx-palette-empty">
              No matches — try a setting name like “wash-sale” or “income”.
            </div>
          )}
          {filtered.map((item, i) => (
            <button
              type="button"
              key={item.id}
              className={`wx-palette-item${i === selIndex ? ' sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => runItem(item)}
            >
              <span className="wx-palette-kind">{item.kind}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── D-027: consolidated Flags tray (replaces the stacked notes) ───
type FlagSev = 'pos' | 'warn' | 'info';
interface WsFlag {
  key: string;
  sev: FlagSev;
  tag: string;
  body: ReactNode;
}

function FlagsTray({ flags }: { flags: WsFlag[] }) {
  const [open, setOpen] = useState(false);
  if (flags.length === 0) return null;
  const nPos = flags.filter(f => f.sev === 'pos').length;
  const nWarn = flags.filter(f => f.sev === 'warn').length;
  const nInfo = flags.filter(f => f.sev === 'info').length;
  const peek = [
    nPos > 0 && `${nPos} positive`,
    nWarn > 0 && `${nWarn} attention`,
    nInfo > 0 && `${nInfo} note${nInfo === 1 ? '' : 's'} about assumptions`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="wx-flags" data-testid="wx-flags">
      <button
        type="button"
        className="wx-flags-head"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="wx-flags-badge">
          <span className="ic">
            <Ico d={I.flag} w={16} />
          </span>
          {flags.length} flag{flags.length === 1 ? '' : 's'}
        </span>
        <span className="wx-flags-dots">
          {flags.map(f => (
            <span key={f.key} className={`wx-fdot wx-fdot--${f.sev}`} />
          ))}
        </span>
        <span className="wx-flags-peek">{peek}</span>
        <span className="wx-flags-toggle">
          {open ? 'Hide' : 'Review'} <Ico d={I.chevD} w={14} />
        </span>
      </button>
      {open && (
        <div className="wx-flags-body" data-testid="wx-flags-body">
          {flags.map(f => (
            <div className={`wx-flag wx-flag--${f.sev}`} key={f.key}>
              <span className="wx-flag-rail" />
              <span className="wx-flag-body">
                <span className="wx-flag-tag">{f.tag}</span>
                {f.body}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Numeral helper for the plain-English summary (.num spans per the mock).
const Num = ({ v }: { v: number }) => <span className="num">{formatCurrency(v)}</span>;

const FILING_ABBREV: Record<string, string> = {
  mfj: 'MFJ',
  single: 'Single',
  mfs: 'MFS',
  hoh: 'HoH',
};

// ─── D-026: pinned-scenario comparison strip ───
// The pin freezes inputs + settings + RESULTS via the SAME usePinnedScenario
// hook (and localStorage key) the Classic tab's comparison panel uses, so a
// scenario pinned in either tab is available in the other. Strip metrics for
// the pinned side derive ONLY from the frozen snapshot — they are never
// recomputed against live inputs. This is the durable cross-tab pin; Meeting
// Mode's meeting-local ghost pin (D-024) is a separate, non-persisted feature.
interface StripMetrics {
  totalSavings: number;
  lossReserve: number;
  peakIncomeReq: number;
  year1: number;
  netIfLiquidated: number;
  finalWealth: number;
  result: CalculationResult;
}

function computeStripMetrics(
  inputs: CalculatorInputs,
  settings: AdvancedSettings,
  results: CalculationResult
): StripMetrics {
  // Same post-processing pipeline the live pane uses (one engine, D-014) —
  // applied to the FROZEN snapshot, so the output is a pure function of the
  // pinned data and cannot drift with live edits.
  const rates = computeScenarioRates(inputs);
  const exit = computeExitTaxAnalysis(
    results,
    rates.combinedLt,
    settings.growthEnabled ? settings.defaultAnnualReturn : 0,
    rates.profile.ltcgExcise,
    inputs.collateralCostBasis,
    { stateCode: inputs.stateCode, ordinaryIncome: inputs.annualIncome }
  );
  return {
    totalSavings: results.summary.totalTaxSavings,
    lossReserve: results.summary.lossReserveShelterValue,
    peakIncomeReq: results.years.reduce(
      (max, y) => Math.max(max, y.incomeRequiredForFullUtilization),
      0
    ),
    year1: results.years[0]?.taxSavings ?? 0,
    netIfLiquidated: exit.netBenefitAfterLiquidation,
    finalWealth: results.summary.finalTotalWealth,
    result: results,
  };
}

function formatPinAge(pinnedAt: number): string {
  const age = Date.now() - pinnedAt;
  if (age < 60_000) return 'just now';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return `${Math.floor(age / 86_400_000)}d ago`;
}

function PinComparisonStrip({
  pinned,
  current,
  ediMode,
  onUnpin,
  onRepin,
}: {
  pinned: PinnedScenario;
  current: StripMetrics;
  ediMode: boolean;
  onUnpin: () => void;
  onRepin: () => void;
}) {
  const frozen = useMemo(
    () => computeStripMetrics(pinned.inputs, pinned.advancedSettings, pinned.results),
    [pinned]
  );
  const attribution = useMemo(() => {
    const parts = (result: CalculationResult) =>
      result.years.reduce(
        (sum, year) => ({
          ordinary: sum.ordinary + year.ordinaryLossBenefit,
          nol: sum.nol + year.nolUsageBenefit,
          capital: sum.capital + year.capitalLossBenefit,
          costs: sum.costs - year.ltGainCost - year.remainingStGainCost,
        }),
        { ordinary: 0, nol: 0, capital: 0, costs: 0 }
      );
    const before = parts(frozen.result);
    const after = parts(current.result);
    return [
      { label: 'ordinary deductions', value: after.ordinary - before.ordinary },
      { label: 'NOL usage', value: after.nol - before.nol },
      { label: 'capital-loss use', value: after.capital - before.capital },
      { label: 'gain costs', value: after.costs - before.costs },
    ].filter(item => Math.abs(item.value) >= 0.5);
  }, [frozen.result, current.result]);

  // Row 2 follows the live pane's mode (D-015): loss reserve in EDI mode,
  // peak income-to-fully-utilize otherwise. Both are computable on both
  // sides, so the comparison stays apples-to-apples even if the pinned
  // scenario was captured in the other mode.
  const rows: Array<{
    key: string;
    label: string;
    pinnedV: number;
    currentV: number;
    neutral?: boolean;
  }> = [
    {
      key: 'total-savings',
      label: 'Total Savings',
      pinnedV: frozen.totalSavings,
      currentV: current.totalSavings,
    },
    ediMode
      ? {
          key: 'loss-reserve',
          label: 'Loss Reserve',
          pinnedV: frozen.lossReserve,
          currentV: current.lossReserve,
        }
      : {
          key: 'income-utilize',
          label: 'Income to Utilize',
          pinnedV: frozen.peakIncomeReq,
          currentV: current.peakIncomeReq,
          neutral: true, // a planning target, not a better/worse outcome
        },
    { key: 'year-1', label: 'Year 1', pinnedV: frozen.year1, currentV: current.year1 },
    {
      key: 'net-liquidated',
      label: 'Net If Liquidated',
      pinnedV: frozen.netIfLiquidated,
      currentV: current.netIfLiquidated,
    },
    {
      key: 'final-wealth',
      label: 'Final Wealth',
      pinnedV: frozen.finalWealth,
      currentV: current.finalWealth,
    },
  ];

  return (
    <div className="ws-pinstrip" data-testid="ws-pinstrip">
      <div className="ws-pinstrip-head">
        <span className="ws-pinstrip-title">&#128204; Pinned vs current</span>
        <span className="ws-pinstrip-label">{pinned.label}</span>
        <span className="ws-pinstrip-age">pinned {formatPinAge(pinned.pinnedAt)}</span>
        <div className="ws-pinstrip-actions">
          <button
            type="button"
            className="ws-pinstrip-btn"
            onClick={onRepin}
            data-testid="ws-pin-repin"
            title="Replace the pin with the current scenario"
          >
            Re-pin
          </button>
          <button
            type="button"
            className="ws-pinstrip-btn"
            onClick={onUnpin}
            data-testid="ws-pin-unpin"
            title="Remove the pinned scenario"
          >
            Unpin
          </button>
        </div>
      </div>
      <div className="ws-pinstrip-grid">
        {rows.map(row => {
          const delta = row.currentV - row.pinnedV;
          const isZero = Math.abs(delta) < 0.5;
          const deltaClass = isZero
            ? 'ws-pinstrip-delta--zero'
            : row.neutral
              ? 'ws-pinstrip-delta--neutral'
              : delta > 0
                ? 'ws-pinstrip-delta--pos'
                : 'ws-pinstrip-delta--neg';
          const sign = delta > 0 ? '+' : '−';
          const pct =
            !isZero && Math.abs(row.pinnedV) > 0.5
              ? ` (${sign}${Math.abs((delta / Math.abs(row.pinnedV)) * 100).toFixed(0)}%)`
              : '';
          return (
            <div className="ws-pinstrip-cell" key={row.key}>
              <span className="ws-pinstrip-metric">{row.label}</span>
              <span className="ws-pinstrip-values">
                <span data-testid={`ws-pin-pinned-${row.key}`} title={formatCurrency(row.pinnedV)}>
                  {formatCurrencyAbbreviated(row.pinnedV)}
                </span>
                <em> → </em>
                <span
                  data-testid={`ws-pin-current-${row.key}`}
                  title={formatCurrency(row.currentV)}
                >
                  {formatCurrencyAbbreviated(row.currentV)}
                </span>
              </span>
              <span
                className={`ws-pinstrip-delta ${deltaClass}`}
                data-testid={`ws-pin-delta-${row.key}`}
              >
                {isZero ? '—' : `${sign}${formatCurrencyAbbreviated(Math.abs(delta))}${pct}`}
              </span>
            </div>
          );
        })}
      </div>
      {attribution.length > 0 && (
        <div className="ws-pinstrip-attribution" data-testid="ws-pin-attribution">
          <strong>Why total savings changed:</strong>{' '}
          {attribution.map((item, index) => (
            <span key={item.label}>
              {index > 0 && ' · '}
              <b className={item.value >= 0 ? 'pos' : 'neg'}>
                {item.value >= 0 ? '+' : '−'}
                {formatCurrencyAbbreviated(Math.abs(item.value))}
              </b>{' '}
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Workspace — D-027 redesign from the Claude Design handoff.
 *
 * Findability is the spine (the owner's pain point: "all the data I want,
 * but it takes too long to find what you're looking for"):
 * - Top context bar: scenario name + live chips + ⌘K "Jump to anything".
 * - Collapsible rail groups that show their set values when closed.
 * - One consolidated, severity-tagged Flags tray replacing stacked notes.
 * - Scannable results: emphasized 4-up metric strip, result cards, an
 *   expandable plain-English summary, and an inline rates strip.
 *
 * Skins: Slate (light) / Graphite (dark) via the app's existing theme
 * toggle — see workspace.css. Every figure renders from the live engine
 * outputs (one-engine rule); the design's numbers were placeholders.
 */
interface WorkspaceTabProps {
  isActive?: boolean;
}

export function WorkspaceTab({ isActive = true }: WorkspaceTabProps) {
  useBrandRevealed(); // re-render when the hidden brand-reveal toggle flips
  const secretReveal = useSecretReveal();
  const qualifiedPurchaser = useQualifiedPurchaser();
  // D-026: same hook + storage as the Classic comparison panel — one shared
  // pin store, so an advisor can pin here and compare there (or vice versa).
  const pinnedScenario = usePinnedScenario();
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULTS);
  const [settings, setSettings] = useState<AdvancedSettings>(DEFAULT_SETTINGS);
  const [resultsView, setResultsView] = useState<ResultsView>('overview');
  // Funding mode: enter the collateral directly, or enter the client's TOTAL
  // available portfolio and let the tool solve collateral + QFAF = total
  // (no more guessing collateral sizes to hit a budget).
  const [fundingMode, setFundingMode] = useState<FundingMode>('collateral');
  const [totalAvailable, setTotalAvailable] = useState<number>(DEFAULTS.collateralAmount);
  const [isMeetingMode, setIsMeetingMode] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);
  // Per-year events (D-012 + income-override graduation): sparse overrides
  // keyed by year — income changes, cash infusions, and planned gain events.
  const [yearEvents, setYearEvents] = useState<Map<number, YearOverride>>(new Map());
  const [showEventsEditor, setShowEventsEditor] = useState(false);
  const [mobileInputsOpen, setMobileInputsOpen] = useState(false);
  const [isMobileWorkspace, setIsMobileWorkspace] = useState(false);
  const [mobileSelectedYear, setMobileSelectedYear] = useState(1);
  const [explainYear, setExplainYear] = useState(1);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileInputsTriggerRef = useRef<HTMLButtonElement>(null);
  // Income schedule builder: start amount + annual growth → per-year w2Income
  // rows (which stay hand-editable afterward).
  const [schedStart, setSchedStart] = useState<number>(DEFAULTS.annualIncome);
  const [schedGrowth, setSchedGrowth] = useState<number>(3);

  // ─── D-027 UI state ───
  const [scenarioName, setScenarioName] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.SCENARIO_NAME) ?? 'Untitled scenario'
  );
  const [editingName, setEditingName] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railFilter, setRailFilter] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(true); // plain-English summary, default OPEN
  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>({
    client: true,
    strategy: true,
    carryforwards: false,
    qfaf: true,
    deleverage: false,
    model: false,
    events: false,
  });
  const groupRefs = useRef<Partial<Record<GroupId, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobileWorkspace(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobileWorkspace || !mobileInputsOpen) return;
    const drawer = mobileDrawerRef.current;
    if (!drawer) return;
    const trigger = mobileInputsTriggerRef.current;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.querySelector<HTMLElement>('input, select, button')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileInputsOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(element => element.offsetParent !== null);
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
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [isMobileWorkspace, mobileInputsOpen]);

  const set = <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: value }));
  const setSetting = <K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  // ⌘K / Ctrl+K opens the command palette anywhere in the Workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isActive) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        if (isMeetingMode) return; // Meeting Mode keeps its own surface
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, isMeetingMode]);

  // In total-budget mode, solve for the collateral that makes
  // collateral + auto-sized QFAF equal the available portfolio. In split mode,
  // the two leg amounts act as allocation weights and are scaled proportionally.
  const effectiveInputs = useMemo<CalculatorInputs>(() => {
    if (fundingMode !== 'total') return inputs;
    const solved = solveCollateralForTotal(
      totalAvailable,
      inputs,
      settings.qfafMultiplier,
      settings.washSaleDisallowanceRate
    );
    const split = inputs.splitAllocation;
    if (split?.enabled === true) {
      const currentTotal = split.coreAmount + split.overlayAmount;
      if (currentTotal <= 0) return inputs;
      const scale = solved / currentTotal;
      return {
        ...inputs,
        splitAllocation: {
          ...split,
          coreAmount: split.coreAmount * scale,
          overlayAmount: split.overlayAmount * scale,
        },
      };
    }
    return { ...inputs, collateralAmount: solved };
  }, [
    fundingMode,
    totalAvailable,
    inputs,
    settings.qfafMultiplier,
    settings.washSaleDisallowanceRate,
  ]);

  const projYears = settings.projectionYears ?? 10;
  // Shared with the Meeting Mode session (one pipeline, one engine).
  const activeOverrides = useMemo(
    () => buildActiveOverrides(yearEvents, effectiveInputs.annualIncome),
    [yearEvents, effectiveInputs.annualIncome]
  );

  const results = useMemo(
    () =>
      activeOverrides.length > 0
        ? calculateWithOverrides(effectiveInputs, settings, activeOverrides)
        : calculate(effectiveInputs, settings),
    [effectiveInputs, settings, activeOverrides]
  );

  // Shared with the Meeting Mode session so both surfaces compose rates
  // identically (computeScenarioRates in MeetingSession.tsx).
  const rates = useMemo(() => computeScenarioRates(inputs), [inputs]);

  const exit = useMemo(
    () =>
      computeExitTaxAnalysis(
        results,
        rates.combinedLt,
        settings.growthEnabled ? settings.defaultAnnualReturn : 0,
        rates.profile.ltcgExcise,
        effectiveInputs.collateralCostBasis,
        { stateCode: effectiveInputs.stateCode, ordinaryIncome: effectiveInputs.annualIncome }
      ),
    [
      results,
      rates,
      settings.growthEnabled,
      settings.defaultAnnualReturn,
      effectiveInputs.collateralCostBasis,
      effectiveInputs.stateCode,
      effectiveInputs.annualIncome,
    ]
  );

  // EDI-only mode (D-014/D-015): with QFAF off, the product is the loss
  // reserve — contingent CF shelter — not NOL-driven realized savings.
  const ediMode = !effectiveInputs.qfafEnabled;
  const insights = useMemo(() => computeEdiInsights(results), [results]);
  // Estate / step-up co-metric (D-018), both modes.
  const stepUp = useMemo(() => computeStepUpComparison(results, exit), [results, exit]);

  const stateNote = useMemo(
    () => getQuantifiedStateWarning(inputs.stateCode, rates.profile.ordinaryRate, results.years),
    [inputs.stateCode, rates.profile.ordinaryRate, results.years]
  );
  const conformityNote = getStateConformityWarning(inputs.stateCode);

  if (!qualifiedPurchaser.isAcknowledged) {
    return <QualifiedPurchaserModal onAcknowledge={qualifiedPurchaser.acknowledge} />;
  }

  if (isMeetingMode) {
    // D-025: the meeting runs SANDBOXED. MeetingSession snapshots the
    // effective inputs/settings/events at entry, computes its own results
    // from the meeting-local copy (same engine path as above), and only
    // touches Workspace state via the explicit "Keep changes" prompt.
    return (
      <MeetingSession
        baseInputs={effectiveInputs}
        baseSettings={settings}
        baseYearEvents={yearEvents}
        onKeep={({ inputs: kept, settings: keptSettings, yearEvents: keptEvents }) => {
          setInputs(kept);
          setSettings(keptSettings);
          setYearEvents(keptEvents);
          // Kept inputs carry an explicit collateral amount (the snapshot was
          // taken AFTER total-budget solving), so leave total-budget mode —
          // same convention as CSV scenario import.
          setFundingMode('collateral');
          setIsMeetingMode(false);
        }}
        onDiscard={() => setIsMeetingMode(false)}
      />
    );
  }

  const applyCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseInputsFromCsv(text);
      if (parsed.inputs && Object.keys(parsed.inputs).length > 0) {
        setInputs(prev => ({ ...prev, ...parsed.inputs }));
        // CSV carries an explicit collateral amount, so leave total-budget mode
        setFundingMode('collateral');
      }
      if (parsed.settings && Object.keys(parsed.settings).length > 0) {
        setSettings(prev => ({ ...prev, ...parsed.settings }));
      }
    } catch (err) {
      window.alert(`Could not import scenario: ${err instanceof Error ? err.message : err}`);
    }
  };

  const setEvent = (year: number, patch: Partial<YearOverride>) => {
    setYearEvents(prev => {
      const next = new Map(prev);
      const existing = next.get(year) ?? {
        year,
        w2Income: effectiveInputs.annualIncome,
        cashInfusion: 0,
        cashInfusionTaxType: 'gross' as const,
        note: '',
      };
      next.set(year, { ...existing, ...patch });
      return next;
    });
  };

  const applyIncomeSchedule = () => {
    setYearEvents(prev => {
      const next = new Map(prev);
      for (let yr = 1; yr <= projYears; yr++) {
        const income = Math.round(schedStart * Math.pow(1 + schedGrowth / 100, yr - 1));
        const existing = next.get(yr) ?? {
          year: yr,
          w2Income: effectiveInputs.annualIncome,
          cashInfusion: 0,
          cashInfusionTaxType: 'gross' as const,
          note: '',
        };
        next.set(yr, { ...existing, w2Income: income });
      }
      return next;
    });
  };

  const resetIncomeSchedule = () => {
    // Restore every row's income to the base input; infusions/gain events stay.
    setYearEvents(prev => {
      const next = new Map(prev);
      next.forEach((o, yr) => next.set(yr, { ...o, w2Income: effectiveInputs.annualIncome }));
      return next;
    });
  };

  // Scenario presets (D-014 folded default): one-click starting points that
  // fill the per-year events rows via the same setEvent machinery — every
  // value stays hand-editable afterward.
  const applyPreset = (
    preset:
      | 'business-sale'
      | 'rsu-vesting'
      | 'concentrated-stock'
      | 'bonus'
      | 'nso-exercise'
      | 'ipo-liquidity'
      | 'sabbatical'
  ) => {
    const collateral = results.sizing.collateralValue;
    if (preset === 'business-sale') {
      // Business exit: a large LT gain (2× collateral) once the reserve has
      // had a couple of years to build.
      const yr = Math.min(3, projYears);
      setEvent(yr, { gainEvent: { amount: Math.round(collateral * 2), character: 'lt' } });
    } else if (preset === 'rsu-vesting') {
      // RSU vesting is ordinary income, not a capital gain — model it as a
      // W-2 income bump (+50%) across the vesting years.
      const bumped = Math.round(effectiveInputs.annualIncome * 1.5);
      for (let yr = 1; yr <= Math.min(4, projYears); yr++) {
        setEvent(yr, { w2Income: bumped });
      }
    } else if (preset === 'concentrated-stock') {
      // Diversify a concentrated position: LT gain of 50% of collateral early.
      const yr = Math.min(2, projYears);
      setEvent(yr, { gainEvent: { amount: Math.round(collateral * 0.5), character: 'lt' } });
    } else if (preset === 'bonus') {
      setEvent(1, { w2Income: Math.round(effectiveInputs.annualIncome * 1.25) });
    } else if (preset === 'nso-exercise') {
      setEvent(2, { w2Income: Math.round(effectiveInputs.annualIncome * 1.5) });
    } else if (preset === 'ipo-liquidity') {
      setEvent(3, {
        w2Income: Math.round(effectiveInputs.annualIncome * 1.25),
        gainEvent: { amount: Math.round(collateral * 0.5), character: 'lt' },
      });
    } else {
      setEvent(2, { w2Income: Math.round(effectiveInputs.annualIncome * 0.25) });
    }
    setShowEventsEditor(true);
  };

  const eventYears = results.years.filter(y => y.gainEventAmount > 0);

  const { summary } = results;
  const explainedYear = results.years.find(year => year.year === explainYear) ?? results.years[0];
  // Client-facing calculation flow: every value is a direct aggregation of
  // audit-complete engine outputs. This is explanation only — no parallel math.
  const flowTotals = results.years.reduce(
    (totals, year) => ({
      capitalLosses: totals.capitalLosses + year.stLossesHarvested,
      ordinaryLosses: totals.ordinaryLosses + year.ordinaryLossesGenerated,
      currentOrdinaryDeductions: totals.currentOrdinaryDeductions + year.usableOrdinaryLoss,
      nolGenerated: totals.nolGenerated + year.excessToNol,
    }),
    { capitalLosses: 0, ordinaryLosses: 0, currentOrdinaryDeductions: 0, nolGenerated: 0 }
  );
  // §461(l)/NOL surfaces are QFAF-shaped: hide them whenever the projection
  // generated no NOL (covers EDI-only mode without hardcoding on qfafEnabled).
  const hasNol = summary.totalNolGenerated >= 1;
  // Peak income required across the projection (the year that needs the most
  // income to fully use the §461(l) deduction + prior NOL) — the advisor's
  // planning target, surfaced from the buried table column.
  const peakIncomeReq = results.years.reduce(
    (best, y) =>
      y.incomeRequiredForFullUtilization > best.amount
        ? { amount: y.incomeRequiredForFullUtilization, year: y.year }
        : best,
    { amount: 0, year: 1 }
  );
  const incomeReqYears = results.years.filter(y => y.incomeRequiredForFullUtilization > 0.5);
  // Decompose the peak income-required figure into its formula terms for the
  // info popup, straight from the engine (no parallel calc) so advisors can see
  // where the planning target comes from.
  const peakIncomeReqYear = results.years.find(y => y.year === peakIncomeReq.year);
  const incomeReqBreakdown = peakIncomeReqYear
    ? [
        {
          label: '§461(l) Deduction',
          value: formatCurrency(peakIncomeReqYear.incomeRequiredComponents.section461Deduction),
        },
        {
          label: '$3K Used',
          value: formatCurrency(peakIncomeReqYear.incomeRequiredComponents.capitalLossUsed),
        },
        {
          label: `Start-of-Year NOL (${formatCurrency(
            peakIncomeReqYear.incomeRequiredComponents.startOfYearNol
          )}) ÷ ${formatPercent(peakIncomeReqYear.incomeRequiredComponents.nolLimit, 0)}`,
          value: formatCurrency(peakIncomeReqYear.incomeRequiredComponents.nolGrossUp),
        },
        {
          label: 'Net Taxable ST/LT Gains',
          value: formatCurrency(peakIncomeReqYear.incomeRequiredComponents.netTaxableGains),
          negative: true,
        },
      ]
    : undefined;
  const year1 = results.years[0]?.taxSavings ?? 0;
  const year2 = results.years[1]?.taxSavings ?? 0;
  const selectedMobileYear =
    results.years.find(y => y.year === mobileSelectedYear) ?? results.years[0];
  const projectionYears = settings.projectionYears ?? 10;
  const currentStrategy = getStrategy(inputs.strategyId);

  // Split allocation (D-026): the engine has supported `inputs.splitAllocation`
  // since the Classic build — this is UI wiring only (one-engine rule).
  const split: SplitAllocation = inputs.splitAllocation ?? {
    enabled: false,
    coreStrategyId: 'core-145-45',
    coreAmount: 3000000,
    overlayStrategyId: 'overlay-45-45',
    overlayAmount: 7000000,
  };
  const splitOn = inputs.splitAllocation?.enabled === true;
  const updateSplit = (patch: Partial<SplitAllocation>) =>
    set('splitAllocation', { ...split, ...patch });
  const splitTotal = split.coreAmount + split.overlayAmount;
  // Effective view across legs — same helper Classic/MM/Excel use, so labels
  // and totals agree everywhere in split mode.
  const view = getEffectiveView(effectiveInputs);

  // D-026 pinning: the Workspace strip compares against the most recent pin
  // (the full multi-scenario table lives in the Classic tab).
  const wsPin: PinnedScenario | null =
    pinnedScenario.scenarios.length > 0
      ? pinnedScenario.scenarios[pinnedScenario.scenarios.length - 1]
      : null;
  const currentStrip: StripMetrics = {
    totalSavings: summary.totalTaxSavings,
    lossReserve: summary.lossReserveShelterValue,
    peakIncomeReq: peakIncomeReq.amount,
    year1,
    netIfLiquidated: exit.netBenefitAfterLiquidation,
    finalWealth: summary.finalTotalWealth,
    result: results,
  };

  // Deleveraging plan (D-016/D-017)
  const dlvPlan = inputs.deleveragePlan;
  const setDlvPlan = (patch: Partial<DeleveragePlan>) =>
    set('deleveragePlan', {
      enabled: false,
      startYear: Math.min(3, projYears),
      durationYears: 1,
      target: LONG_ONLY_TARGET,
      ...dlvPlan,
      ...patch,
    });
  // Eligible targets: long-only DI plus lower-leverage strategies of the
  // same type as the current strategy (deleveraging, not restyling).
  const dlvTargets = currentStrategy
    ? STRATEGIES.filter(
        s => s.type === currentStrategy.type && getShortRatio(s) < getShortRatio(currentStrategy)
      )
    : [];
  const dlvTargetLabel =
    dlvPlan?.target === LONG_ONLY_TARGET || !dlvPlan
      ? 'long-only direct indexing'
      : (getStrategy(dlvPlan.target)?.name ?? dlvPlan.target);
  // Active = the engine actually unwound something (false when the plan is
  // ignored, e.g. split allocation on).
  const dlvActive = results.years.some(y => y.extensionFraction < 1);
  const dlvTotalGain = results.years.reduce((s, y) => s + y.deleverageGainRealized, 0);
  const dlvTotalTax = results.years.reduce((s, y) => s + y.deleverageTax, 0);
  const dlvTotalFinSaved = results.years.reduce((s, y) => s + y.financingSaved, 0);

  // Per-leg deleverage (D-028): in split mode each leg carries its own plan on
  // inputs.splitAllocation (legs[0] = core, legs[1] = overlay). The top-level
  // plan above stays single-strategy-only.
  const coreDlv = inputs.splitAllocation?.coreDeleverage;
  const overlayDlv = inputs.splitAllocation?.overlayDeleverage;
  const setLegDlv = (leg: 'core' | 'overlay', patch: Partial<DeleveragePlan>) => {
    const existing = leg === 'core' ? coreDlv : overlayDlv;
    const key = leg === 'core' ? 'coreDeleverage' : 'overlayDeleverage';
    updateSplit({
      [key]: {
        enabled: false,
        startYear: Math.min(3, projYears),
        durationYears: 1,
        target: LONG_ONLY_TARGET,
        ...existing,
        ...patch,
      },
    });
  };
  // Eligible targets for a leg: long-only DI plus lower-leverage strategies of
  // the same type (deleveraging, not restyling — mirrors the single path).
  const legDlvTargets = (strategyId: string) => {
    const s = getStrategy(strategyId);
    return s
      ? STRATEGIES.filter(t => t.type === s.type && getShortRatio(t) < getShortRatio(s))
      : [];
  };
  const splitDlvActive = coreDlv?.enabled === true || overlayDlv?.enabled === true;
  // One leg's deleverage editor — shared by the core and overlay legs in split
  // mode (D-028). Mirrors the single-strategy editor's controls.
  const renderLegDlv = (
    leg: 'core' | 'overlay',
    legStrategyId: string,
    legPlan: DeleveragePlan | undefined
  ) => {
    const targets = legDlvTargets(legStrategyId);
    const legStratName = getStrategy(legStrategyId)?.name ?? legStrategyId;
    const onPatch = (patch: Partial<DeleveragePlan>) => setLegDlv(leg, patch);
    return (
      <div className="ws-leg-dlv" data-testid={`ws-leg-dlv-${leg}`}>
        <label className="wx-toggle">
          <input
            type="checkbox"
            checked={legPlan?.enabled === true}
            onChange={e => onPatch({ enabled: e.target.checked })}
          />
          <span className="wx-switch" />
          <span>
            {leg === 'core' ? 'Core' : 'Overlay'} leg — {legStratName}
          </span>
        </label>
        {legPlan?.enabled && (
          <>
            <label className="wx-field">
              <span className="wx-label">Start year</span>
              <input
                type="number"
                min={1}
                max={projYears}
                value={legPlan.startYear}
                onChange={e =>
                  onPatch({
                    startYear: Math.max(1, Math.min(projYears, Number(e.target.value) || 1)),
                  })
                }
              />
            </label>
            <label className="wx-field">
              <span className="wx-label">
                Duration: {legPlan.durationYears} yr{legPlan.durationYears > 1 ? 's' : ''}
                {legPlan.durationYears === 1 ? ' (all at once)' : ''}
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={legPlan.durationYears}
                onChange={e => onPatch({ durationYears: Number(e.target.value) })}
              />
            </label>
            <label className="wx-field">
              <span className="wx-label">Unwind to</span>
              <select value={legPlan.target} onChange={e => onPatch({ target: e.target.value })}>
                <option value={LONG_ONLY_TARGET}>Long-only direct indexing</option>
                {targets.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    );
  };
  // The engine extends past the standard horizon when NOL remains unused
  // (mirrors core.ts: QFAF duration + partial-year start + 2 wind-down years).
  const baseHorizonYears = Math.max(
    projectionYears,
    effectiveInputs.qfafEnabled
      ? effectiveInputs.qfafDuration + (effectiveInputs.startMonth > 1 ? 1 : 0) + 2
      : 0
  );
  const nolExtensionYears = Math.max(0, results.years.length - baseHorizonYears);

  // ─── D-027: rail group plumbing ───
  const toggleGroup = (id: GroupId) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  const jumpToGroup = (id: GroupId) => {
    setOpenGroups(prev => ({ ...prev, [id]: true }));
    window.setTimeout(() => {
      const el = groupRefs.current[id];
      if (!el) return;
      el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      el.querySelector<HTMLElement>(
        '.wx-group-body input:not([type="file"]), .wx-group-body select, .wx-group-body button'
      )?.focus({ preventScroll: true });
    }, 80);
  };
  // Rail "Find a setting…": null = no filter, true = match, false = dim.
  const groupMatch = (id: GroupId): boolean | null => {
    const q = railFilter.trim().toLowerCase();
    if (!q) return null;
    const meta = GROUP_META.find(g => g.id === id);
    const hay = `${meta?.label ?? id} ${meta?.keywords ?? ''}`.toLowerCase();
    return q.split(/\s+/).every(tok => hay.includes(tok));
  };
  const groupProps = (id: GroupId, active: boolean) => {
    const m = groupMatch(id);
    return {
      id,
      active,
      open: openGroups[id],
      onToggle: () => toggleGroup(id),
      dimmed: m === false,
      hit: m === true,
      groupRef: (el: HTMLDivElement | null) => {
        groupRefs.current[id] = el;
      },
    };
  };

  const exportExcel = () =>
    exportToExcel({
      inputs: effectiveInputs,
      results,
      settings,
      taxRates: rates.full,
      exitAnalysis: exit,
    });

  // ⌘K palette items: every rail group, sub-view, and action is jumpable.
  const paletteItems: PaletteItem[] = [
    ...GROUP_META.map(g => ({
      id: `group-${g.id}`,
      kind: 'Inputs' as const,
      label: brandText(g.label),
      keywords: g.keywords,
      run: () => jumpToGroup(g.id),
    })),
    {
      id: 'view-overview',
      kind: 'View',
      label: 'Overview',
      keywords: 'results cards summary rates',
      run: () => setResultsView('overview'),
    },
    {
      id: 'view-table',
      kind: 'View',
      label: 'Year-by-Year table',
      keywords: 'audit detail columns breakdown',
      run: () => setResultsView('table'),
    },
    {
      id: 'view-charts',
      kind: 'View',
      label: 'Charts',
      keywords: 'graph savings portfolio value',
      run: () => setResultsView('charts'),
    },
    {
      id: 'action-meeting',
      kind: 'Action',
      label: 'Open Meeting Mode',
      keywords: 'present client boardroom',
      run: () => setIsMeetingMode(true),
    },
    {
      id: 'action-excel',
      kind: 'Action',
      label: 'Export Excel',
      keywords: 'download workbook xlsx',
      run: exportExcel,
    },
    {
      id: 'action-csv-export',
      kind: 'Action',
      label: 'Export scenario (CSV)',
      keywords: 'download save',
      run: () => downloadInputsCsv(effectiveInputs, settings),
    },
    {
      id: 'action-csv-import',
      kind: 'Action',
      label: 'Import scenario (CSV)',
      keywords: 'load open',
      run: () => csvFileRef.current?.click(),
    },
    {
      id: 'action-pin',
      kind: 'Action',
      label: 'Pin scenario',
      keywords: 'freeze compare snapshot',
      run: () => pinnedScenario.pin(effectiveInputs, settings, results),
    },
    {
      id: 'action-events',
      kind: 'Action',
      label: 'Edit income & events',
      keywords: 'per-year schedule gain infusion presets',
      run: () => {
        setShowEventsEditor(true);
        jumpToGroup('events');
      },
    },
  ];

  // ─── D-027: consolidated flags (severity-ordered: pos → warn → info) ───
  const flags: WsFlag[] = [];
  if (exit.incrementalDeferredTax < 0) {
    flags.push({
      key: 'exit-covered',
      sev: 'pos',
      tag: 'Exit',
      body: (
        <>
          <strong>Exit covered:</strong> the loss reserve more than covers the strategy&apos;s
          embedded gain — liquidating in year {projectionYears} costs{' '}
          {formatCurrency(Math.abs(exit.incrementalDeferredTax))} <b>less</b> than the passive
          baseline, for a net benefit of {formatCurrency(exit.netBenefitAfterLiquidation)}.
        </>
      ),
    });
  }
  if (stateNote) {
    flags.push({
      key: 'state',
      sev: 'warn',
      tag: 'State',
      body: (
        <>
          <strong>State treatment:</strong> {stateNote}
        </>
      ),
    });
  }
  if (conformityNote) {
    flags.push({
      key: 'conformity',
      sev: 'warn',
      tag: 'Conformity',
      body: (
        <>
          <strong>State conformity:</strong> {conformityNote}
        </>
      ),
    });
  }
  if (
    (view.isSplit || currentStrategy?.type === 'overlay') &&
    effectiveInputs.collateralCostBasis === undefined
  ) {
    flags.push({
      key: 'basis',
      sev: 'warn',
      tag: 'Basis',
      body: (
        <>
          <strong>Appreciated-stock collateral:</strong> the liquidation analysis assumes basis
          equals today&apos;s value. If this collateral carries unrealized gain, enter its{' '}
          <strong>cost basis</strong> in the Strategy group so the embedded gain and deferred tax
          reflect the client&apos;s true exit picture.
        </>
      ),
    });
  }
  if (dlvPlan?.enabled && splitOn) {
    // D-028: split mode runs PER-LEG plans; the single-strategy top-level plan
    // is still ignored. Point the user at the per-leg controls rather than
    // silently dropping it.
    flags.push({
      key: 'split-dlv',
      sev: 'warn',
      tag: 'Split',
      body: (
        <>
          <strong>Top-level deleverage plan ignored:</strong> with split allocation on, deleveraging
          is set <strong>per leg</strong> in the Deleveraging group — the single top-level plan
          doesn&apos;t apply.
        </>
      ),
    });
  }
  if (dlvPlan?.enabled && inputs.qfafEnabled && inputs.qfafSizingMode === 'fixed') {
    flags.push({
      key: 'fixed-qfaf-dlv',
      sev: 'warn',
      tag: brandText('QFAF'),
      body: (
        <>
          <strong>{brandText('Fixed QFAF sizing')}</strong> won&apos;t shrink with deleveraging —
          expect ST gain leakage as the harvest rate glides down (switch to Dynamic).
        </>
      ),
    });
  }
  if (summary.totalStateNolExpired > 0) {
    flags.push({
      key: 'state-nol-expiry',
      sev: 'warn',
      tag: 'NOL',
      body: (
        <>
          <strong>State NOL expiry:</strong> {formatCurrency(summary.totalStateNolExpired)} of
          California NOL expires unused within the projection (20-year state carryover; federal NOL
          is not affected). See the &quot;St. NOL Expired&quot; column in the year-by-year table.
        </>
      ),
    });
  }
  for (const y of eventYears) {
    flags.push({
      key: `gain-event-${y.year}`,
      sev: 'info',
      tag: 'Event',
      body: (
        <>
          <strong>Year {y.year} gain event:</strong> {formatCurrency(y.gainEventAmount)} —
          carryforwards shelter {formatCurrency(y.gainEventCfShelter)}, leaving{' '}
          {formatCurrency(y.gainEventTax)} of tax due
          {y.gainEventTaxWithoutStrategy - y.gainEventTax > 0.5 && (
            <>
              {' '}
              ({formatCurrency(y.gainEventTaxWithoutStrategy - y.gainEventTax)} less than without
              the program)
            </>
          )}
          . Any NOL absorbed by the event shows in that year&apos;s savings and the
          income-utilization chips.
        </>
      ),
    });
  }
  if (ediMode) {
    flags.push({
      key: 'edi-reserve',
      sev: 'info',
      tag: 'Reserve',
      body: (
        <>
          <strong>Contingent reserve:</strong> the {formatCurrency(summary.lossReserveShelterValue)}{' '}
          loss-reserve shelter value is contingent on future gains being realized — it is never
          added to the realized-savings headline.
        </>
      ),
    });
  }
  flags.push({
    key: 'step-up',
    sev: 'info',
    tag: 'Step-up',
    body: (
      <>
        <strong>Step-up framing:</strong> &quot;Net If Held to Step-Up&quot; is mortality-contingent
        and assumes basis step-up under current law (IRC §1014). Unused loss carryforwards are lost
        at death (§1212) — their {formatCurrency(stepUp.continueAndDie.carryforwardValueLost)}{' '}
        contingent shelter value is NOT counted in either figure.
        {stepUp.recommendation === 'partial_unwind' && (
          <>
            {' '}
            With carryforwards covering only part of the embedded gain, the modeled optimum is a
            partial unwind of ~{Math.round(stepUp.optimalUnwindPct * 100)}% during life (sheltered
            by the reserve), holding the rest for step-up.
          </>
        )}
        {stepUp.recommendation === 'unwind' && (
          <>
            {' '}
            Here the carryforward exceeds the embedded gain, so a full unwind during life is
            tax-free — excess reserve would otherwise be lost at death.
          </>
        )}
      </>
    ),
  });
  if (!settings.financingFeesEnabled) {
    flags.push({
      key: 'gross',
      sev: 'info',
      tag: 'Gross',
      body: (
        <>
          <strong>Gross estimate:</strong> financing fees are off — the headline is before costs
          &amp; fees. Toggle them in the Model group (present-value discounting is also opt-in
          there).
        </>
      ),
    });
  }
  if (dlvActive && dlvPlan) {
    flags.push({
      key: 'deleverage',
      sev: 'info',
      tag: 'Delever',
      body: (
        <>
          <strong>Deleveraging:</strong> unwinding {currentStrategy?.name ?? 'the current strategy'}{' '}
          to {dlvTargetLabel} starting year {dlvPlan.startYear}
          {dlvPlan.durationYears > 1 ? ` over ${dlvPlan.durationYears} years` : ' all at once'}{' '}
          realizes {formatCurrency(dlvTotalGain)} of unwind gains, of which only{' '}
          {formatCurrency(dlvTotalTax)} is taxed — the remainder is absorbed by the year&apos;s
          harvested losses and the loss-carryforward reserve.{' '}
          {settings.financingFeesEnabled ? (
            <>Financing fees saved vs staying levered: {formatCurrency(dlvTotalFinSaved)}.</>
          ) : (
            <>Enable financing costs &amp; fees to see the financing saved.</>
          )}
          {dlvPlan.target === LONG_ONLY_TARGET && (
            <>
              {' '}
              Once long-only, the realistic endgame for an estate-minded client is holding through
              basis step-up — the &quot;Net If Held to Step-Up&quot; card shows that path with the
              deferred exit tax never paid.
            </>
          )}
        </>
      ),
    });
  }
  if (dlvActive && splitOn && splitDlvActive) {
    // D-028: per-leg deleverage narrative. Each enabled leg unwinds its own
    // extension; the book-level totals already aggregate across legs.
    const legNames = [
      coreDlv?.enabled ? 'core' : null,
      overlayDlv?.enabled ? 'overlay' : null,
    ].filter(Boolean);
    flags.push({
      key: 'deleverage-split',
      sev: 'info',
      tag: 'Delever',
      body: (
        <>
          <strong>Deleveraging (split):</strong> the {legNames.join(' and ')}{' '}
          {legNames.length > 1 ? 'legs unwind' : 'leg unwinds'} on{' '}
          {legNames.length > 1 ? 'their own schedules' : 'its own schedule'}, realizing{' '}
          {formatCurrency(dlvTotalGain)} of unwind gains across the book, of which only{' '}
          {formatCurrency(dlvTotalTax)} is taxed — the rest is absorbed by harvested losses and the
          carryforward reserve. Each leg unwinds against its own embedded-gain pool.{' '}
          {settings.financingFeesEnabled ? (
            <>Financing fees saved vs staying levered: {formatCurrency(dlvTotalFinSaved)}.</>
          ) : (
            <>Enable financing costs &amp; fees to see the financing saved.</>
          )}
        </>
      ),
    });
  }
  if (nolExtensionYears > 0) {
    flags.push({
      key: 'nol-extension',
      sev: 'info',
      tag: 'Horizon',
      body: (
        <>
          <strong>Projection extended to year {results.years.length}:</strong> loss carryforwards
          (NOL or capital) remained at the end of the standard {baseHorizonYears}-year horizon, so
          the model keeps running wind-down years while something is consuming them (capped at 40).
          Extension years assume income continues at the final scheduled year&apos;s level (your
          last income-schedule row, if set). A capital-loss reserve consumed only by the $3,000/yr
          ordinary offset does not extend the projection — raise &ldquo;Projection years&rdquo; to
          see more of it.
        </>
      ),
    });
  }
  const sevRank: Record<FlagSev, number> = { pos: 0, warn: 1, info: 2 };
  flags.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);

  // ─── D-027: top-bar chips + rail summaries (live, from real inputs) ───
  const filingAbbrev = FILING_ABBREV[inputs.filingStatus] ?? inputs.filingStatus.toUpperCase();
  const stateName = STATES.find(s => s.code === inputs.stateCode)?.name ?? inputs.stateCode;
  const cfParts: ReactNode[] = [];
  if (inputs.existingStLossCarryforward > 0)
    cfParts.push(
      <span key="st">
        ST <b>{formatCurrencyAbbreviated(inputs.existingStLossCarryforward)}</b>
      </span>
    );
  if (inputs.existingLtLossCarryforward > 0)
    cfParts.push(
      <span key="lt">
        LT <b>{formatCurrencyAbbreviated(inputs.existingLtLossCarryforward)}</b>
      </span>
    );
  if (inputs.existingNolCarryforward > 0)
    cfParts.push(
      <span key="nol">
        NOL <b>{formatCurrencyAbbreviated(inputs.existingNolCarryforward)}</b>
      </span>
    );
  const carryforwardsActive = cfParts.length > 0;
  const modelActive =
    settings.growthEnabled ||
    settings.financingFeesEnabled ||
    settings.presentValueEnabled ||
    settings.washSaleDisallowanceRate > 0 ||
    projYears !== 10 ||
    inputs.ltGainsEnabled === false;

  const commitScenarioName = (raw: string) => {
    const name = raw.trim() || 'Untitled scenario';
    setScenarioName(name);
    localStorage.setItem(STORAGE_KEYS.SCENARIO_NAME, name);
    setEditingName(false);
  };

  return (
    <div className="wx">
      {paletteOpen && <CommandPalette items={paletteItems} onClose={() => setPaletteOpen(false)} />}

      {/* ───────────────── Top context bar ───────────────── */}
      <header className="wx-top">
        {/* Hidden reveal: 5 rapid clicks on the brand toggle real manager/fund
            names on/off for internal use. No affordance — invisible to the public. */}
        <div className="wx-brand" onClick={secretReveal.onClick}>
          <span className="wx-logo">Q</span>
          <h1 className="wx-brand-name">EDI Calculator</h1>
          {secretReveal.flash !== null && (
            <span className="wx-brand-reveal-flash" role="status">
              {secretReveal.flash ? 'Internal names on' : 'Anonymized'}
            </span>
          )}
        </div>
        <div className="wx-scenario">
          {editingName ? (
            <input
              autoFocus
              defaultValue={scenarioName}
              aria-label="Scenario name"
              onBlur={e => commitScenarioName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitScenarioName((e.target as HTMLInputElement).value);
                else if (e.key === 'Escape') setEditingName(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="wx-scenario-name"
              title="Rename scenario"
              data-testid="wx-scenario-name"
              onClick={() => setEditingName(true)}
            >
              {scenarioName}
            </button>
          )}
          <span className="wx-scenario-edit">
            <Ico d={I.doc} w={13} />
          </span>
        </div>
        <div className="wx-chips">
          <span className="wx-chip">
            <span className="wx-chip-dot" />
            <b>{filingAbbrev}</b>&nbsp;· {stateName}
          </span>
          {splitOn ? (
            <span className="wx-chip">
              <b>{formatCurrencyAbbreviated(splitTotal)}</b>&nbsp;combined
            </span>
          ) : fundingMode === 'total' ? (
            <span className="wx-chip">
              <b>{formatCurrencyAbbreviated(totalAvailable)}</b>&nbsp;total budget
            </span>
          ) : (
            <span className="wx-chip">
              <b>{formatCurrencyAbbreviated(inputs.collateralAmount)}</b>&nbsp;collateral
            </span>
          )}
          <span className="wx-chip">
            {splitOn ? (
              <>
                Core + Overlay&nbsp;<b>split</b>
              </>
            ) : (
              <b>{currentStrategy?.name ?? inputs.strategyId}</b>
            )}
          </span>
          <span className="wx-chip">
            {brandText('QFAF')}&nbsp;<b>{inputs.qfafEnabled ? 'On' : 'Off'}</b>
          </span>
        </div>
        <div className="wx-top-right">
          <button
            ref={mobileInputsTriggerRef}
            type="button"
            className="wx-mobile-inputs-btn"
            aria-controls="wx-input-drawer"
            aria-expanded={mobileInputsOpen}
            onClick={() => setMobileInputsOpen(true)}
          >
            Edit inputs
          </button>
          <button
            type="button"
            className="wx-search"
            data-testid="wx-search"
            onClick={() => setPaletteOpen(true)}
          >
            <Ico d={I.search} w={14} />
            <span>Jump to anything</span>
            <span className="wx-kbd">⌘K</span>
          </button>
        </div>
      </header>

      <div className="wx-body">
        {mobileInputsOpen && (
          <button
            type="button"
            className="wx-mobile-drawer-backdrop"
            aria-label="Close scenario inputs"
            onClick={() => setMobileInputsOpen(false)}
          />
        )}
        {/* ───────────────── Input rail ───────────────── */}
        <aside
          ref={mobileDrawerRef}
          id="wx-input-drawer"
          className={`wx-rail ${mobileInputsOpen ? 'is-open' : ''}`}
          role={isMobileWorkspace ? 'dialog' : undefined}
          aria-modal={isMobileWorkspace ? true : undefined}
          aria-hidden={isMobileWorkspace && !mobileInputsOpen ? true : undefined}
          inert={isMobileWorkspace && !mobileInputsOpen ? true : undefined}
          aria-label={isMobileWorkspace ? 'Scenario inputs' : 'Scenario inputs and actions'}
        >
          <div className="wx-mobile-drawer-head">
            <strong>Scenario inputs</strong>
            <button type="button" onClick={() => setMobileInputsOpen(false)}>
              Close
            </button>
          </div>
          <label className="wx-railsearch">
            <Ico d={I.search} w={14} />
            <input
              value={railFilter}
              onChange={e => setRailFilter(e.target.value)}
              placeholder="Find a setting…"
              aria-label="Find a setting"
            />
          </label>

          <RailGroup
            {...groupProps('client', true)}
            icon={I.user}
            name="Client"
            summary={
              <>
                <b>{filingAbbrev}</b> · {stateName} ·{' '}
                <b>{formatCurrencyAbbreviated(inputs.annualIncome)}</b> income
              </>
            }
          >
            <label className="wx-field">
              <span className="wx-label">Filing status</span>
              <select
                value={inputs.filingStatus}
                onChange={e => set('filingStatus', e.target.value as FilingStatus)}
              >
                {FILING_STATUSES.map(f => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wx-field">
              <span className="wx-label">State</span>
              <select value={inputs.stateCode} onChange={e => set('stateCode', e.target.value)}>
                {STATES.map(s => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {inputs.stateCode === 'NY' && (
              <label className="wx-toggle">
                <input
                  type="checkbox"
                  checked={inputs.nycResident === true}
                  onChange={e => set('nycResident', e.target.checked)}
                />
                <span className="wx-switch" />
                <span>NYC resident (+3.876% local)</span>
              </label>
            )}
            <label className="wx-field">
              <span className="wx-label">Annual income</span>
              <input
                inputMode="numeric"
                value={formatWithCommas(inputs.annualIncome)}
                onChange={e => set('annualIncome', parseFormattedNumber(e.target.value))}
              />
            </label>
          </RailGroup>

          <RailGroup
            {...groupProps('strategy', true)}
            icon={I.overlay}
            name="Strategy"
            summary={
              splitOn && fundingMode === 'total' ? (
                <>
                  <b>Split</b> · <b>{formatCurrencyAbbreviated(totalAvailable)}</b> total budget
                </>
              ) : splitOn ? (
                <>
                  <b>Split</b> · {formatCurrencyAbbreviated(split.coreAmount)} core +{' '}
                  {formatCurrencyAbbreviated(split.overlayAmount)} overlay
                </>
              ) : fundingMode === 'total' ? (
                <>
                  <b>{currentStrategy?.name ?? inputs.strategyId}</b> ·{' '}
                  <b>{formatCurrencyAbbreviated(totalAvailable)}</b> total budget
                </>
              ) : (
                <>
                  <b>{currentStrategy?.name ?? inputs.strategyId}</b> ·{' '}
                  <b>{formatCurrencyAbbreviated(inputs.collateralAmount)}</b> collateral
                </>
              )
            }
          >
            {/* D-026: split allocation as an expandable section (rail is too
                tight for always-visible dual selectors). */}
            <label className="wx-toggle">
              <input
                type="checkbox"
                checked={splitOn}
                onChange={e => updateSplit({ enabled: e.target.checked })}
              />
              <span className="wx-switch" />
              <span>Split allocation (core + overlay)</span>
            </label>
            {splitOn ? (
              <>
                <label className="wx-field">
                  <span className="wx-label">Core strategy (cash)</span>
                  <select
                    value={split.coreStrategyId}
                    onChange={e => updateSplit({ coreStrategyId: e.target.value })}
                  >
                    {STRATEGIES.filter(s => s.type === 'core').map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wx-field">
                  <span className="wx-label">Core amount</span>
                  <input
                    inputMode="numeric"
                    value={formatWithCommas(split.coreAmount)}
                    onChange={e =>
                      updateSplit({ coreAmount: parseFormattedNumber(e.target.value) })
                    }
                  />
                </label>
                <label className="wx-field">
                  <span className="wx-label">Overlay strategy (appreciated stock)</span>
                  <select
                    value={split.overlayStrategyId}
                    onChange={e => updateSplit({ overlayStrategyId: e.target.value })}
                  >
                    {STRATEGIES.filter(s => s.type === 'overlay').map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wx-field">
                  <span className="wx-label">Overlay amount</span>
                  <input
                    inputMode="numeric"
                    value={formatWithCommas(split.overlayAmount)}
                    onChange={e =>
                      updateSplit({ overlayAmount: parseFormattedNumber(e.target.value) })
                    }
                  />
                </label>
                <div className="wx-field">
                  <span className="wx-label">Fund by</span>
                  <div className="ws-segment">
                    <button
                      type="button"
                      className={fundingMode === 'collateral' ? 'active' : ''}
                      onClick={() => setFundingMode('collateral')}
                    >
                      Collateral
                    </button>
                    <button
                      type="button"
                      className={fundingMode === 'total' ? 'active' : ''}
                      onClick={() => {
                        setTotalAvailable(Math.round(results.sizing.totalExposure));
                        setFundingMode('total');
                      }}
                    >
                      Total portfolio
                    </button>
                  </div>
                </div>
                {fundingMode === 'total' && (
                  <label className="wx-field">
                    <span className="wx-label">Total available portfolio</span>
                    <input
                      inputMode="numeric"
                      value={formatWithCommas(totalAvailable)}
                      onChange={e => setTotalAvailable(parseFormattedNumber(e.target.value))}
                    />
                  </label>
                )}
                <p className="ws-derived" data-testid="ws-split-total">
                  {fundingMode === 'total' ? (
                    <>
                      → Core {formatCurrency(effectiveInputs.splitAllocation?.coreAmount ?? 0)} +
                      overlay {formatCurrency(effectiveInputs.splitAllocation?.overlayAmount ?? 0)}
                      {inputs.qfafEnabled && (
                        <>
                          {' '}
                          + {brandText('QFAF')} {formatCurrency(results.sizing.qfafValue)}
                        </>
                      )}
                      {' = '}
                      {formatCurrency(results.sizing.totalExposure)}
                    </>
                  ) : (
                    <>
                      → Total collateral {formatCurrency(splitTotal)}
                      {splitTotal > 0 && (
                        <>
                          {' '}
                          ({formatPercent(split.coreAmount / splitTotal)} core /{' '}
                          {formatPercent(split.overlayAmount / splitTotal)} overlay)
                        </>
                      )}
                      {inputs.qfafEnabled && (
                        <> · {brandText('QFAF auto-sizes against the combined ST losses')}</>
                      )}
                    </>
                  )}
                </p>
                {(split.coreAmount <= 0 || split.overlayAmount <= 0) && (
                  <p className="ws-rail-warn">
                    Both legs need an amount above $0 — until then the projection falls back to the
                    single-strategy inputs.
                  </p>
                )}
                {fundingMode === 'total' && (
                  <p className="ws-rail-note">
                    The core and overlay amounts are used as allocation weights; the tool scales
                    both legs so collateral + {brandText('QFAF')} equals the total portfolio.
                  </p>
                )}
              </>
            ) : (
              <>
                <label className="wx-field">
                  <span className="wx-label">Collateral strategy</span>
                  <select
                    value={inputs.strategyId}
                    onChange={e => set('strategyId', e.target.value)}
                  >
                    {STRATEGIES.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="wx-field">
                  <span className="wx-label">Fund by</span>
                  <div className="ws-segment">
                    <button
                      type="button"
                      className={fundingMode === 'collateral' ? 'active' : ''}
                      onClick={() => setFundingMode('collateral')}
                    >
                      Collateral
                    </button>
                    <button
                      type="button"
                      className={fundingMode === 'total' ? 'active' : ''}
                      onClick={() => {
                        // Seed the budget from the current total so the switch is seamless
                        setTotalAvailable(Math.round(results.sizing.totalExposure));
                        setFundingMode('total');
                      }}
                    >
                      Total portfolio
                    </button>
                  </div>
                </div>
                {fundingMode === 'collateral' ? (
                  <label className="wx-field">
                    <span className="wx-label">Collateral amount</span>
                    <input
                      inputMode="numeric"
                      value={formatWithCommas(inputs.collateralAmount)}
                      onChange={e => set('collateralAmount', parseFormattedNumber(e.target.value))}
                    />
                  </label>
                ) : (
                  <>
                    <label className="wx-field">
                      <span className="wx-label">Total available portfolio</span>
                      <input
                        inputMode="numeric"
                        value={formatWithCommas(totalAvailable)}
                        onChange={e => setTotalAvailable(parseFormattedNumber(e.target.value))}
                      />
                    </label>
                    <p className="ws-derived">
                      → Collateral {formatCurrency(results.sizing.collateralValue)}
                      {inputs.qfafEnabled && (
                        <>
                          {' '}
                          + {brandText('QFAF')} {formatCurrency(results.sizing.qfafValue)}
                        </>
                      )}{' '}
                      = {formatCurrency(results.sizing.totalExposure)}
                    </p>
                  </>
                )}
              </>
            )}
            <label className="wx-field">
              <span className="wx-label">Cost basis of collateral (optional)</span>
              <input
                inputMode="numeric"
                placeholder="= collateral value"
                value={
                  inputs.collateralCostBasis !== undefined
                    ? formatWithCommas(inputs.collateralCostBasis)
                    : ''
                }
                onChange={e => {
                  const raw = e.target.value.trim();
                  set('collateralCostBasis', raw === '' ? undefined : parseFormattedNumber(raw));
                }}
              />
            </label>
            <label className="wx-field">
              <span className="wx-label">Start month</span>
              <select
                value={inputs.startMonth}
                onChange={e => set('startMonth', Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2026, i, 1).toLocaleString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </label>
          </RailGroup>

          <RailGroup
            {...groupProps('carryforwards', carryforwardsActive)}
            icon={I.archive}
            name="Carryforwards"
            summary={
              carryforwardsActive ? (
                <>
                  {cfParts.map((p, i) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      {p}
                    </span>
                  ))}
                </>
              ) : (
                'None entered'
              )
            }
          >
            <label className="wx-field">
              <span className="wx-label">Existing ST loss c/f</span>
              <input
                inputMode="numeric"
                value={formatWithCommas(inputs.existingStLossCarryforward)}
                onChange={e =>
                  set('existingStLossCarryforward', parseFormattedNumber(e.target.value))
                }
              />
            </label>
            <label className="wx-field">
              <span className="wx-label">Existing LT loss c/f</span>
              <input
                inputMode="numeric"
                value={formatWithCommas(inputs.existingLtLossCarryforward)}
                onChange={e =>
                  set('existingLtLossCarryforward', parseFormattedNumber(e.target.value))
                }
              />
            </label>
            <label className="wx-field">
              <span className="wx-label">Existing NOL c/f</span>
              <input
                inputMode="numeric"
                value={formatWithCommas(inputs.existingNolCarryforward)}
                onChange={e => set('existingNolCarryforward', parseFormattedNumber(e.target.value))}
              />
            </label>
          </RailGroup>

          <RailGroup
            {...groupProps('qfaf', inputs.qfafEnabled)}
            icon={I.layers}
            name={brandText('QFAF Overlay')}
            summary={
              inputs.qfafEnabled ? (
                <>
                  <b>On</b> · {inputs.qfafDuration} yrs ·{' '}
                  {inputs.qfafSizingMode === 'dynamic' ? 'Dynamic' : 'Fixed'}
                  {inputs.redeployQfafProceeds === true && ' · redeploy'}
                </>
              ) : (
                'Off'
              )
            }
          >
            <label className="wx-toggle">
              <input
                type="checkbox"
                checked={inputs.qfafEnabled}
                onChange={e => set('qfafEnabled', e.target.checked)}
              />
              <span className="wx-switch" />
              <span>{brandText('Enable QFAF')}</span>
            </label>
            {inputs.qfafEnabled && (
              <>
                <label className="wx-field">
                  <span className="wx-label">Duration: {inputs.qfafDuration} yrs</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={inputs.qfafDuration}
                    onChange={e => set('qfafDuration', Number(e.target.value))}
                  />
                </label>
                <label className="wx-field">
                  <span className="wx-label">Sizing</span>
                  <select
                    value={inputs.qfafSizingMode}
                    onChange={e => set('qfafSizingMode', e.target.value as 'fixed' | 'dynamic')}
                  >
                    <option value="dynamic">Dynamic (resized yearly)</option>
                    <option value="fixed">Fixed at inception</option>
                  </select>
                </label>
                <label className="wx-toggle">
                  <input
                    type="checkbox"
                    checked={inputs.redeployQfafProceeds === true}
                    onChange={e => set('redeployQfafProceeds', e.target.checked)}
                  />
                  <span className="wx-switch" />
                  <span>Redeploy redemptions into core</span>
                </label>
              </>
            )}
          </RailGroup>

          <RailGroup
            {...groupProps('deleverage', splitOn ? splitDlvActive : dlvPlan?.enabled === true)}
            icon={I.trend}
            name="Deleveraging"
            summary={
              splitOn ? (
                splitDlvActive ? (
                  <>
                    {coreDlv?.enabled && <>core</>}
                    {coreDlv?.enabled && overlayDlv?.enabled && <> · </>}
                    {overlayDlv?.enabled && <>overlay</>} leg
                    {coreDlv?.enabled && overlayDlv?.enabled ? 's' : ''}
                  </>
                ) : (
                  'Off'
                )
              ) : dlvPlan?.enabled ? (
                <>
                  Yr <b>{dlvPlan.startYear}</b> ·{' '}
                  {dlvPlan.durationYears === 1 ? 'all at once' : `${dlvPlan.durationYears} yrs`} ·{' '}
                  {dlvPlan.target === LONG_ONLY_TARGET ? 'long-only' : dlvTargetLabel}
                </>
              ) : (
                'Off'
              )
            }
          >
            <p className="wx-help">
              <InfoText contentKey="deleverage-plan">What the deleverage model assumes</InfoText>
            </p>
            {splitOn ? (
              // D-028: per-leg deleverage — each split leg glides independently.
              <>
                <p className="ws-rail-note">
                  Each leg can unwind its extension to a lower-leverage target on its own schedule.
                </p>
                {renderLegDlv('core', split.coreStrategyId, coreDlv)}
                {renderLegDlv('overlay', split.overlayStrategyId, overlayDlv)}
                {splitDlvActive && (
                  <p className="ws-rail-note">
                    Assumes short covers realize no gain — shorts are continuously loss-recycled;
                    unwound long-extension gains realized as LT once seasoned. Each leg unwinds
                    against its own embedded-gain pool.
                  </p>
                )}
              </>
            ) : (
              <>
                <label className="wx-toggle">
                  <input
                    type="checkbox"
                    checked={dlvPlan?.enabled === true}
                    onChange={e => setDlvPlan({ enabled: e.target.checked })}
                  />
                  <span className="wx-switch" />
                  <span>Plan deleveraging</span>
                </label>
                {dlvPlan?.enabled && (
                  <>
                    <label className="wx-field">
                      <span className="wx-label">Start year</span>
                      <input
                        type="number"
                        min={1}
                        max={projYears}
                        value={dlvPlan.startYear}
                        onChange={e =>
                          setDlvPlan({
                            startYear: Math.max(
                              1,
                              Math.min(projYears, Number(e.target.value) || 1)
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="wx-field">
                      <span className="wx-label">
                        Duration: {dlvPlan.durationYears} yr{dlvPlan.durationYears > 1 ? 's' : ''}
                        {dlvPlan.durationYears === 1 ? ' (all at once)' : ''}
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={dlvPlan.durationYears}
                        onChange={e => setDlvPlan({ durationYears: Number(e.target.value) })}
                      />
                    </label>
                    <label className="wx-field">
                      <span className="wx-label">Unwind to</span>
                      <select
                        value={dlvPlan.target}
                        onChange={e => setDlvPlan({ target: e.target.value })}
                      >
                        <option value={LONG_ONLY_TARGET}>Long-only direct indexing</option>
                        {dlvTargets.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {/* D-017 disclosure — defaults stay visible while a plan is on */}
                    <p className="ws-rail-note">
                      Assumes short covers realize no gain — shorts are continuously loss-recycled;
                      unwound long-extension gains realized as LT once seasoned. Overridable in
                      code.
                    </p>
                  </>
                )}
              </>
            )}
          </RailGroup>

          <RailGroup
            {...groupProps('model', modelActive)}
            icon={I.sliders}
            name="Model"
            summary={
              <>
                {projYears} yrs ·{' '}
                {settings.growthEnabled ? (
                  <>
                    growth <b>{formatPercent(settings.defaultAnnualReturn, 0)}</b>
                  </>
                ) : (
                  'no growth'
                )}{' '}
                · {settings.financingFeesEnabled ? 'net of fees' : 'gross'}
                {settings.washSaleDisallowanceRate > 0 && (
                  <> · wash {formatPercent(settings.washSaleDisallowanceRate, 0)}</>
                )}
              </>
            }
          >
            <label className="wx-field">
              <span className="wx-label">
                <InfoText contentKey="projection-years">Projection years</InfoText>
              </span>
              <input
                type="number"
                min={1}
                max={40}
                value={projYears}
                onChange={e =>
                  setSetting(
                    'projectionYears',
                    Math.max(1, Math.min(40, Number(e.target.value) || 10))
                  )
                }
              />
            </label>
            <label className="wx-toggle">
              <input
                type="checkbox"
                checked={settings.growthEnabled}
                onChange={e => setSetting('growthEnabled', e.target.checked)}
              />
              <span className="wx-switch" />
              <span>Portfolio growth ({formatPercent(settings.defaultAnnualReturn, 0)})</span>
            </label>
            <label className="wx-toggle">
              <input
                type="checkbox"
                checked={inputs.ltGainsEnabled !== false}
                onChange={e => set('ltGainsEnabled', e.target.checked)}
              />
              <span className="wx-switch" />
              <span>Realize LT gains</span>
            </label>
            <label className="wx-toggle">
              <input
                type="checkbox"
                checked={settings.financingFeesEnabled}
                onChange={e => setSetting('financingFeesEnabled', e.target.checked)}
              />
              <span className="wx-switch" />
              <span>Financing costs &amp; fees</span>
            </label>
            <label className="wx-toggle">
              <input
                type="checkbox"
                checked={settings.presentValueEnabled}
                onChange={e => setSetting('presentValueEnabled', e.target.checked)}
              />
              <span className="wx-switch" />
              <span>Show present value ({formatPercent(settings.discountRate, 0)})</span>
            </label>
            <label className="wx-field">
              <span className="wx-label">
                Wash-sale disallowance: {formatPercent(settings.washSaleDisallowanceRate, 0)}
              </span>
              <input
                type="range"
                min={0}
                max={15}
                step={1}
                value={Math.round(settings.washSaleDisallowanceRate * 100)}
                onChange={e => setSetting('washSaleDisallowanceRate', Number(e.target.value) / 100)}
              />
            </label>
          </RailGroup>

          <RailGroup
            {...groupProps('events', activeOverrides.length > 0)}
            icon={I.calendar}
            name="Per-Year Events"
            summary={
              activeOverrides.length > 0 ? (
                <>
                  <b>{activeOverrides.length}</b> year{activeOverrides.length === 1 ? '' : 's'}{' '}
                  customized
                </>
              ) : (
                'None active'
              )
            }
          >
            <button className="wx-btn" onClick={() => setShowEventsEditor(v => !v)}>
              {showEventsEditor ? 'Hide' : 'Edit'} income &amp; events
              {activeOverrides.length > 0 && ` (${activeOverrides.length} active)`}
            </button>
            <p className="ws-rail-note">
              Model variable RSU/bonus years, cash infusions, and planned sale events (business
              exit, IPO lockup). One-click scenario presets inside — the editor opens as a wider
              panel in the results pane.
            </p>
          </RailGroup>

          <div className="wx-actions">
            <button className="wx-btn wx-btn--primary" onClick={() => setIsMeetingMode(true)}>
              <Ico d={I.bolt} w={14} /> Open Meeting Mode
            </button>
            <div className="wx-btn-row">
              <button
                className="wx-btn"
                data-testid="ws-pin-btn"
                disabled={!pinnedScenario.canPin}
                title={
                  pinnedScenario.canPin
                    ? 'Freeze the current scenario (inputs + results) for side-by-side comparison'
                    : 'Pin limit reached (4) — unpin a scenario first'
                }
                onClick={() => pinnedScenario.pin(effectiveInputs, settings, results)}
              >
                Pin scenario
                {pinnedScenario.scenarios.length > 0 && ` (${pinnedScenario.scenarios.length})`}
              </button>
              <button className="wx-btn" onClick={exportExcel}>
                Export Excel
              </button>
            </div>
            <div className="wx-btn-row">
              <button
                className="wx-btn"
                onClick={() => downloadInputsCsv(effectiveInputs, settings)}
              >
                Export CSV
              </button>
              <button className="wx-btn" onClick={() => csvFileRef.current?.click()}>
                Import CSV
              </button>
            </div>
            <input
              ref={csvFileRef}
              type="file"
              accept=".csv,text/csv"
              aria-label="Import scenario CSV file"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) applyCsvFile(f);
                e.target.value = '';
              }}
            />
            <p className="ws-rail-note">
              Sensitivity analysis lives in the <strong>Classic Calculator</strong> tab.
            </p>
          </div>
        </aside>

        {/* ───────────────── Results pane ───────────────── */}
        <section className="wx-main">
          <div className="wx-metrics">
            <div className="wx-metric wx-metric--primary">
              <span className="wx-metric-label">
                <InfoText
                  contentKey="total-tax-savings"
                  currentValue={formatCurrency(summary.totalTaxSavings)}
                >
                  Est. Tax Savings
                </InfoText>
              </span>
              <span className="wx-metric-value" data-testid="ws-metric-total-savings">
                {formatCurrency(summary.totalTaxSavings)}
              </span>
              <span className="wx-metric-sub">
                {results.years.length} yrs
                {nolExtensionYears > 0 && ' (extended to use losses)'}
                {!settings.financingFeesEnabled && (
                  <>
                    {' '}
                    · <span className="pos">before costs &amp; fees</span>
                  </>
                )}
                {settings.presentValueEnabled &&
                  ` · PV ${formatCurrency(summary.totalTaxSavingsPV)}`}
              </span>
            </div>
            {ediMode ? (
              // EDI-only co-headline (D-015): the loss reserve IS the product —
              // contingent shelter value, never folded into realized savings.
              <div className="wx-metric wx-metric--primary wx-metric--sec">
                <span className="wx-metric-label">
                  <InfoText
                    contentKey="loss-reserve-built"
                    currentValue={formatCurrency(summary.lossReserveShelterValue)}
                  >
                    Loss Reserve Built
                  </InfoText>
                </span>
                <span
                  className="wx-metric-value"
                  title={formatCurrency(summary.lossReserveShelterValue)}
                >
                  {formatCurrencyAbbreviated(summary.lossReserveShelterValue)}
                </span>
                <span className="wx-metric-sub">
                  from {formatCurrency(summary.finalStCarryforward + summary.finalLtCarryforward)}{' '}
                  of loss carryforwards · contingent on future gains
                </span>
              </div>
            ) : (
              <div className="wx-metric wx-metric--sec">
                <span className="wx-metric-label">
                  <InfoText
                    contentKey="col-income-required"
                    currentValue={formatCurrency(peakIncomeReq.amount)}
                    breakdown={incomeReqBreakdown}
                  >
                    Ordinary Income Needed to Use Available Deduction Capacity
                  </InfoText>
                </span>
                <span className="wx-metric-value" title={formatCurrency(peakIncomeReq.amount)}>
                  {formatCurrencyAbbreviated(peakIncomeReq.amount)}
                </span>
                <span className="wx-metric-sub">
                  planning threshold, not recommended income · peak year {peakIncomeReq.year}
                </span>
              </div>
            )}
            <div className="wx-metric wx-metric--sec">
              <span className="wx-metric-label">Year 1 / Year 2+</span>
              <span
                className="wx-metric-value"
                title={`${formatCurrency(year1)} / ${formatCurrency(year2)}`}
              >
                {formatCurrencyAbbreviated(year1)} <em>/</em> {formatCurrencyAbbreviated(year2)}
              </span>
              <span className="wx-metric-sub">annual savings</span>
            </div>
            <div className="wx-metric wx-metric--sec">
              <span className="wx-metric-label">
                <InfoText
                  contentKey="net-benefit-after-liquidation"
                  currentValue={formatCurrency(exit.netBenefitAfterLiquidation)}
                >
                  Net If Liquidated
                </InfoText>
              </span>
              <span
                className="wx-metric-value"
                title={formatCurrency(exit.netBenefitAfterLiquidation)}
              >
                {formatCurrencyAbbreviated(exit.netBenefitAfterLiquidation)}
              </span>
              <span className="wx-metric-sub">after deferred tax</span>
            </div>
          </div>

          {/* D-026: compact pinned-vs-current comparison strip (frozen values
              from localStorage; shared with the Classic comparison panel). */}
          {wsPin && (
            <PinComparisonStrip
              pinned={wsPin}
              current={currentStrip}
              ediMode={ediMode}
              onUnpin={() => pinnedScenario.unpin(wsPin.id)}
              onRepin={() => pinnedScenario.replacePin(effectiveInputs, settings, results)}
            />
          )}

          {/* D-027: consolidated flags tray — all conditional notes in one place */}
          <FlagsTray flags={flags} />

          {showEventsEditor && (
            <div className="ws-events-editor">
              <div className="ws-presets">
                <span className="ws-presets-label">Scenario presets</span>
                <button
                  type="button"
                  className="ws-preset-btn"
                  onClick={() => applyPreset('business-sale')}
                >
                  Business sale
                </button>
                <button
                  type="button"
                  className="ws-preset-btn"
                  onClick={() => applyPreset('rsu-vesting')}
                >
                  RSU vesting
                </button>
                <button
                  type="button"
                  className="ws-preset-btn"
                  onClick={() => applyPreset('concentrated-stock')}
                >
                  Diversify concentrated stock
                </button>
                <button
                  type="button"
                  className="ws-preset-btn"
                  onClick={() => applyPreset('bonus')}
                >
                  Bonus year
                </button>
                <button
                  type="button"
                  className="ws-preset-btn"
                  onClick={() => applyPreset('nso-exercise')}
                  title="Models the ordinary-income component of a nonqualified option exercise"
                >
                  NSO exercise
                </button>
                <button
                  type="button"
                  className="ws-preset-btn"
                  onClick={() => applyPreset('ipo-liquidity')}
                  title="Models both ordinary compensation and a separate long-term gain"
                >
                  IPO / acquisition
                </button>
                <button
                  type="button"
                  className="ws-preset-btn"
                  onClick={() => applyPreset('sabbatical')}
                >
                  Sabbatical year
                </button>
                <span className="ws-presets-note">
                  starting points — each fills the rows below; edit amounts and years to fit the
                  client
                </span>
              </div>
              <div className="ws-event-character-guide">
                <span>
                  <b>RSU vesting, bonus, NSO spread</b> → ordinary/W-2 income
                </span>
                <span>
                  <b>Share sale after vesting/exercise</b> → separate ST or LT capital gain
                </span>
                <span>
                  <b>IPO/acquisition preset</b> → both buckets in the same year
                </span>
                <span>
                  <b>ISO exercise</b> → AMT is not modeled; review separately
                </span>
              </div>
              <div className="ws-sched">
                <span className="ws-sched-label">Income schedule</span>
                <label className="ws-sched-field">
                  <span>Start income</span>
                  <input
                    inputMode="numeric"
                    value={formatWithCommas(schedStart)}
                    onChange={e => setSchedStart(parseFormattedNumber(e.target.value))}
                  />
                </label>
                <label className="ws-sched-field">
                  <span>Growth %/yr</span>
                  <input
                    type="number"
                    step={0.5}
                    value={schedGrowth}
                    onChange={e => setSchedGrowth(Number(e.target.value))}
                  />
                </label>
                <button type="button" className="ws-sched-btn" onClick={applyIncomeSchedule}>
                  Apply schedule
                </button>
                <button
                  type="button"
                  className="ws-sched-btn ws-sched-btn--ghost"
                  onClick={resetIncomeSchedule}
                >
                  Reset incomes
                </button>
              </div>
              <p className="ws-rail-note" style={{ margin: '0 0 10px' }}>
                Fills the income column for years 1–{projYears} (start ×{' '}
                {schedGrowth >= 0 ? 'growth' : 'decline'} compounding). Rows stay editable — adjust
                individual years after applying (e.g., drop to retirement income).
              </p>
              <div className="ws-events-head">
                <span>Year</span>
                <span>W-2 / ordinary income</span>
                <span>Cash infusion</span>
                <span>Gain event</span>
                <span>Type</span>
              </div>
              {Array.from({ length: projYears }, (_, i) => i + 1).map(yr => {
                const o = yearEvents.get(yr);
                return (
                  <div className="ws-events-row" key={yr}>
                    <span className="ws-events-yr">Yr {yr}</span>
                    <input
                      inputMode="numeric"
                      value={formatWithCommas(o?.w2Income ?? effectiveInputs.annualIncome)}
                      onChange={e =>
                        setEvent(yr, { w2Income: parseFormattedNumber(e.target.value) })
                      }
                    />
                    <input
                      inputMode="numeric"
                      value={formatWithCommas(o?.cashInfusion ?? 0)}
                      onChange={e =>
                        setEvent(yr, { cashInfusion: parseFormattedNumber(e.target.value) })
                      }
                    />
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      value={o?.gainEvent?.amount ? formatWithCommas(o.gainEvent.amount) : ''}
                      onChange={e => {
                        const amount = parseFormattedNumber(e.target.value);
                        setEvent(yr, {
                          gainEvent:
                            amount > 0
                              ? { amount, character: o?.gainEvent?.character ?? 'lt' }
                              : undefined,
                        });
                      }}
                    />
                    <select
                      value={o?.gainEvent?.character ?? 'lt'}
                      onChange={e =>
                        setEvent(yr, {
                          gainEvent: o?.gainEvent
                            ? { ...o.gainEvent, character: e.target.value as 'st' | 'lt' }
                            : undefined,
                        })
                      }
                    >
                      <option value="lt">LT</option>
                      <option value="st">ST</option>
                    </select>
                  </div>
                );
              })}
              <p className="ws-rail-note" style={{ marginTop: 8 }}>
                Gain events flow through the real netting: carryforwards shelter them (after the
                strategy&apos;s own gains), they absorb the §461(l) deduction, and they widen the
                NOL base. Event tax is reported separately — it is never charged against the
                strategy&apos;s savings.
              </p>
            </div>
          )}

          <div className="wx-subnav">
            {(['overview', 'table', 'charts'] as ResultsView[]).map(v => (
              <button
                key={v}
                className={`wx-subnav-btn ${resultsView === v ? 'active' : ''}`}
                onClick={() => setResultsView(v)}
              >
                {v === 'overview' ? 'Overview' : v === 'table' ? 'Year-by-Year' : 'Charts'}
              </button>
            ))}
            <button
              type="button"
              className="wx-subnav-right"
              onClick={exportExcel}
              title="Export the full workbook (Excel)"
            >
              <Ico d={I.download} w={13} /> Export view
            </button>
          </div>

          {resultsView === 'overview' && (
            <div className="wx-overview">
              <div className="wx-cards">
                <div className="wx-card">
                  <span className="wx-card-label">
                    <InfoText
                      contentKey="embedded-gain-at-horizon"
                      currentValue={formatCurrency(exit.embeddedGain)}
                    >
                      Embedded Gain (Yr {projectionYears})
                    </InfoText>
                  </span>
                  <span className="wx-card-value">{formatCurrency(exit.embeddedGain)}</span>
                  <span className="wx-card-sub">
                    incl. {formatCurrency(exit.cumulativeBasisReduction)} basis reduction
                    {exit.preExistingGain > 0 && (
                      <> + {formatCurrency(exit.preExistingGain)} pre-existing gain</>
                    )}
                  </span>
                </div>
                <div className="wx-card">
                  <span className="wx-card-label">
                    <InfoText
                      contentKey="incremental-deferred-tax"
                      currentValue={formatCurrency(exit.incrementalDeferredTax)}
                    >
                      Deferred Tax If Liquidated
                    </InfoText>
                  </span>
                  <span
                    className={`wx-card-value ${exit.incrementalDeferredTax < 0 ? 'pos' : 'neg'}`}
                  >
                    {formatCurrency(exit.incrementalDeferredTax)}
                  </span>
                  <span className="wx-card-sub">
                    {exit.incrementalDeferredTax < 0
                      ? `negative: exits ${formatCurrency(Math.abs(exit.incrementalDeferredTax))} cheaper than passive — loss-reserve advantage`
                      : `after ${formatCurrency(exit.cfShelterUsed)} carryforward shelter`}
                  </span>
                </div>
                <div className="wx-card">
                  <span className="wx-card-label">
                    <InfoText
                      contentKey="net-if-held-to-step-up"
                      currentValue={formatCurrency(stepUp.netIfHeldToStepUp)}
                    >
                      Net If Held to Step-Up
                    </InfoText>
                  </span>
                  <span className="wx-card-value pos">
                    {formatCurrency(stepUp.netIfHeldToStepUp)}
                  </span>
                  <span className="wx-card-sub">
                    vs {formatCurrency(stepUp.netIfLiquidated)} if liquidated · mortality-contingent
                  </span>
                </div>
                {hasNol && (
                  <div className="wx-card">
                    <span className="wx-card-label">
                      <InfoText
                        contentKey="total-nol-generated"
                        currentValue={formatCurrency(summary.totalNolGenerated)}
                      >
                        NOL Generated
                      </InfoText>
                    </span>
                    <span className="wx-card-value">
                      {formatCurrency(summary.totalNolGenerated)}
                    </span>
                    <span className="wx-card-sub">offsets future income (80%/yr)</span>
                  </div>
                )}
                <div className="wx-card">
                  <span className="wx-card-label">Final Total Wealth</span>
                  <span className="wx-card-value">{formatCurrency(summary.finalTotalWealth)}</span>
                  <span className="wx-card-sub">
                    portfolio + {formatCurrency(summary.totalQfafCashReturned)} cash returned
                  </span>
                </div>
              </div>

              {ediMode && (
                <>
                  <span className="wx-section-title">EDI Economics</span>
                  <div className="wx-cards">
                    <div className="wx-card">
                      <span className="wx-card-label">
                        <InfoText
                          contentKey="protection-ratio"
                          currentValue={
                            insights.protectionRatio !== null
                              ? `${insights.protectionRatio.toFixed(1)}×`
                              : '—'
                          }
                        >
                          Protection Ratio
                        </InfoText>
                      </span>
                      <span
                        className={`wx-card-value ${insights.protectionRatio !== null ? 'pos' : ''}`}
                      >
                        {insights.protectionRatio !== null
                          ? `${insights.protectionRatio.toFixed(1)}×`
                          : '—'}
                      </span>
                      <span className="wx-card-sub">
                        {insights.protectionRatio !== null
                          ? 'shelter value ÷ cumulative financing cost'
                          : 'financing costs disabled'}
                      </span>
                    </div>
                    <div className="wx-card">
                      <span className="wx-card-label">
                        <InfoText
                          contentKey="break-even-gain-event"
                          currentValue={formatCurrency(insights.breakEvenGainEvent)}
                        >
                          Break-Even Gain Event
                        </InfoText>
                      </span>
                      <span className="wx-card-value">
                        {formatCurrency(insights.breakEvenGainEvent)}
                      </span>
                      <span className="wx-card-sub">a gain this size would be fully sheltered</span>
                    </div>
                    <div className="wx-card">
                      <span className="wx-card-label">
                        <InfoText
                          contentKey="cumulative-financing-cost"
                          currentValue={formatCurrency(insights.cumulativeFinancingCost)}
                        >
                          Cumulative Financing Cost
                        </InfoText>
                      </span>
                      <span className="wx-card-value">
                        {formatCurrency(insights.cumulativeFinancingCost)}
                      </span>
                      <span className="wx-card-sub">
                        {settings.financingFeesEnabled
                          ? `over ${results.years.length} years`
                          : 'financing costs & fees disabled'}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {hasNol && incomeReqYears.length > 0 && (
                <div className="wx-reqchips">
                  <span className="wx-reqchips-label">
                    <InfoText contentKey="col-income-required">
                      Ordinary income needed to use available deduction capacity
                    </InfoText>
                  </span>
                  <div className="wx-reqchips-row">
                    {incomeReqYears.map(y => (
                      <span
                        key={y.year}
                        className={`wx-rchip ${y.year === peakIncomeReq.year ? 'wx-rchip--peak' : ''}`}
                      >
                        Yr {y.year} <b>{formatCurrency(y.incomeRequiredForFullUtilization)}</b>
                        {y.year === peakIncomeReq.year && ' · peak'}
                      </span>
                    ))}
                  </div>
                  <span className="wx-reqchips-note">
                    Planning threshold only — not recommended income and not necessarily eliminated
                    dollar-for-dollar in every jurisdiction.
                  </span>
                </div>
              )}

              {/* D-027: the narrative, tucked into an expandable plain-English
                  summary (default open) with .num emphasis on the figures. */}
              <div className="wx-summary">
                <button
                  type="button"
                  className="wx-summary-head"
                  onClick={() => setSummaryOpen(o => !o)}
                  aria-expanded={summaryOpen}
                >
                  <span className="ic">
                    <Ico d={I.spark} w={16} />
                  </span>
                  Plain-English summary
                  <span
                    className="wx-chev"
                    style={{ transform: summaryOpen ? 'rotate(180deg)' : undefined }}
                  >
                    <Ico d={I.chevD} w={14} />
                  </span>
                </button>
                {summaryOpen &&
                  (ediMode ? (
                    <p className="wx-summary-body">
                      On a <Num v={results.sizing.collateralValue} /> portfolio with{' '}
                      <b>{view.displayName}</b>, the program&apos;s main output is a loss reserve:
                      an estimated{' '}
                      <Num v={summary.finalStCarryforward + summary.finalLtCarryforward} /> of loss
                      carryforwards by year {results.years.length}, worth{' '}
                      <Num v={summary.lossReserveShelterValue} /> of shelter against future capital
                      gains — contingent on those gains being realized (a business sale,
                      concentrated-stock exit, RSU diversification). Realized savings along the way
                      are an estimated <Num v={summary.totalTaxSavings} /> (the $3,000/yr deduction
                      plus any gain events the reserve shelters — model one with the presets in the
                      events editor).{' '}
                      {exit.incrementalDeferredTax < 0 ? (
                        <>
                          And the reserve already covers the exit: full liquidation in year{' '}
                          {projectionYears} would cost{' '}
                          <Num v={Math.abs(exit.incrementalDeferredTax)} /> <em>less</em> than the
                          passive baseline, for a net benefit of{' '}
                          <Num v={exit.netBenefitAfterLiquidation} />.
                        </>
                      ) : (
                        <>
                          Full liquidation in year {projectionYears} would surrender{' '}
                          <Num v={exit.incrementalDeferredTax} /> of deferred tax, leaving{' '}
                          <Num v={exit.netBenefitAfterLiquidation} />; holding through death (basis
                          step-up) or donating can make the deferral permanent.
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="wx-summary-body">
                      On a <Num v={results.sizing.collateralValue} /> portfolio with{' '}
                      <b>{view.displayName}</b>, the program is estimated to save{' '}
                      <Num v={summary.totalTaxSavings} /> over {results.years.length} years at a
                      combined ordinary rate of{' '}
                      <span className="num">{formatPercent(rates.combinedOrdinary)}</span>.{' '}
                      {exit.incrementalDeferredTax < 0 ? (
                        <>
                          The exit math runs in the strategy&apos;s favor: liquidating in year{' '}
                          {projectionYears} would cost{' '}
                          <Num v={Math.abs(exit.incrementalDeferredTax)} /> <em>less</em> than the
                          passive baseline — the loss reserve more than covers the strategy&apos;s
                          embedded gain — for a net benefit of{' '}
                          <Num v={exit.netBenefitAfterLiquidation} />.
                        </>
                      ) : (
                        <>
                          A portion is timing: full liquidation in year {projectionYears} would
                          surrender <Num v={exit.incrementalDeferredTax} /> of that, leaving{' '}
                          <Num v={exit.netBenefitAfterLiquidation} />; holding through death (basis
                          step-up) or donating can make the deferral permanent.
                        </>
                      )}
                    </p>
                  ))}
              </div>

              <details className="wx-calc-flow" data-testid="wx-calc-flow">
                <summary>
                  <span>
                    <strong>How the calculation flows</strong>
                    <small>Trace the current scenario from activity to net benefit</small>
                  </span>
                  <span className="wx-calc-flow-action">
                    <span className="wx-calc-flow-closed">Show calculation path</span>
                    <span className="wx-calc-flow-open">Hide calculation path</span>
                  </span>
                </summary>
                <ol className="wx-calc-flow-steps">
                  <li>
                    <span className="wx-calc-flow-num">1</span>
                    <div>
                      <strong>Strategy activity</strong>
                      <p>
                        The projection models <Num v={flowTotals.capitalLosses} /> of harvested
                        capital losses
                        {!ediMode && (
                          <>
                            {' '}
                            and <Num v={flowTotals.ordinaryLosses} /> of Fund ordinary losses
                          </>
                        )}
                        .
                      </p>
                    </div>
                  </li>
                  <li>
                    <span className="wx-calc-flow-num">2</span>
                    <div>
                      <strong>Losses keep their tax character</strong>
                      <p>
                        Capital losses net against capital gains under §1211. Fund losses are
                        modeled as ordinary under §475(f); the two buckets are not interchangeable.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span className="wx-calc-flow-num">3</span>
                    <div>
                      <strong>Annual limits are applied</strong>
                      <p>
                        <Num v={flowTotals.currentOrdinaryDeductions} /> is modeled as usable
                        current ordinary loss after §461(l); excess ordinary loss moves to the NOL
                        bucket.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span className="wx-calc-flow-num">4</span>
                    <div>
                      <strong>Unused amounts carry forward</strong>
                      <p>
                        The program generates <Num v={flowTotals.nolGenerated} /> of NOL and ends
                        with <Num v={summary.finalStCarryforward + summary.finalLtCarryforward} />{' '}
                        of capital-loss carryforwards after modeled use.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span className="wx-calc-flow-num">5</span>
                    <div>
                      <strong>Annual benefits become the headline</strong>
                      <p>
                        Character-specific deductions and gain costs reconcile to{' '}
                        <Num v={summary.totalTaxSavings} /> of cumulative modeled tax savings.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span className="wx-calc-flow-num">6</span>
                    <div>
                      <strong>Liquidation tests the deferral</strong>
                      <p>
                        After the modeled incremental liquidation tax, the strategy retains{' '}
                        <Num v={exit.netBenefitAfterLiquidation} /> of net benefit versus the
                        passive baseline.
                      </p>
                    </div>
                  </li>
                </ol>
                <p className="wx-calc-flow-foot">
                  Every amount above comes from the same year-by-year engine shown in the audit
                  table. Carryforward shelter value is contingent and is not added to cumulative tax
                  savings.
                </p>
              </details>

              <div className="wx-loss-legend" data-testid="wx-loss-character-legend">
                <div className="wx-section-title">Loss-character map</div>
                <div className="wx-loss-legend-grid">
                  <div>
                    <strong>Capital loss</strong>
                    <span>Offsets capital gains</span>
                    <small>Then up to $3,000/yr of ordinary income under §1211</small>
                  </div>
                  <div>
                    <strong>Fund ordinary loss</strong>
                    <span>Offsets ordinary income</span>
                    <small>Current use subject to §461(l); modeled §475(f) treatment</small>
                  </div>
                  <div>
                    <strong>NOL carryforward</strong>
                    <span>Offsets future taxable income</span>
                    <small>Generally limited to 80% of taxable income per year</small>
                  </div>
                </div>
              </div>

              {inputs.stateCode === 'CA' && (
                <div className="wx-ca-timeline" data-testid="wx-ca-timing">
                  <div className="wx-section-title">Federal vs. California timing</div>
                  <div className="wx-ca-timeline-grid">
                    <div>
                      <strong>Federal</strong>
                      <span>
                        Eligible current deductions and later NOL use follow the federal limits
                        modeled year by year.
                      </span>
                    </div>
                    <div>
                      <strong>California · Year 1</strong>
                      <span>
                        For modeled MAGI of $1M or more, SB 167 suspends the California NOL
                        deduction in tax year 2026.
                      </span>
                    </div>
                    <div>
                      <strong>California · Later years</strong>
                      <span>
                        The state benefit may arrive later than the federal benefit; the state
                        carryover remains separately tracked and may expire.
                      </span>
                    </div>
                  </div>
                  <p>
                    Federal and California benefits can occur in different years. A federal NOL does
                    not automatically create an immediate California benefit.
                  </p>
                </div>
              )}

              <div className="wx-benefit-map" data-testid="wx-benefit-map">
                <div>
                  <span>Realized modeled benefit</span>
                  <strong>{formatCurrency(summary.totalTaxSavings)}</strong>
                  <small>Annual tax savings already recognized in the projection</small>
                </div>
                <div>
                  <span>Unused tax assets</span>
                  <strong>
                    {formatCurrency(
                      summary.finalStCarryforward +
                        summary.finalLtCarryforward +
                        (results.years[results.years.length - 1]?.nolCarryforward ?? 0)
                    )}
                  </strong>
                  <small>Ending NOL and capital-loss balances; not added to savings</small>
                </div>
                <div>
                  <span>Incremental tax at liquidation</span>
                  <strong>{formatCurrency(exit.incrementalDeferredTax)}</strong>
                  <small>Signed reversal versus passive; negative means a cheaper exit</small>
                </div>
                <div>
                  <span>Net after liquidation</span>
                  <strong>{formatCurrency(exit.netBenefitAfterLiquidation)}</strong>
                  <small>Conservative comparison after the modeled exit</small>
                </div>
              </div>

              {explainedYear && (
                <details className="wx-year-explain" data-testid="wx-year-explain">
                  <summary>
                    <span>
                      <strong>Explain this result</strong>
                      <small>Deterministic reconciliation from the selected engine year</small>
                    </span>
                    <label onClick={event => event.stopPropagation()}>
                      Year{' '}
                      <select
                        value={explainedYear.year}
                        onChange={event => setExplainYear(Number(event.target.value))}
                      >
                        {results.years.map(year => (
                          <option key={year.year} value={year.year}>
                            {year.year}
                          </option>
                        ))}
                      </select>
                    </label>
                  </summary>
                  <div className="wx-year-explain-equation">
                    <span>
                      <b>+ {formatCurrency(explainedYear.ordinaryLossBenefit)}</b> ordinary-loss
                      benefit
                      <small>
                        {formatCurrency(explainedYear.usableOrdinaryLoss)} current ordinary
                        deduction
                      </small>
                    </span>
                    <span>
                      <b>+ {formatCurrency(explainedYear.nolUsageBenefit)}</b> NOL-use benefit
                      <small>{formatCurrency(explainedYear.nolUsedThisYear)} NOL used</small>
                    </span>
                    <span>
                      <b>+ {formatCurrency(explainedYear.capitalLossBenefit)}</b> capital-loss
                      benefit
                      <small>
                        {formatCurrency(explainedYear.capitalLossUsedAgainstIncome)} used against
                        income
                      </small>
                    </span>
                    <span>
                      <b>
                        −{' '}
                        {formatCurrency(
                          explainedYear.ltGainCost + explainedYear.remainingStGainCost
                        )}
                      </b>{' '}
                      gain costs<small>LT gains plus unoffset ST gains</small>
                    </span>
                    <span className="total">
                      <b>= {formatCurrency(explainedYear.taxSavings)}</b> Year {explainedYear.year}{' '}
                      tax savings
                      <small>
                        {formatCurrency(explainedYear.excessToNol)} new NOL is deferred, not a
                        current benefit
                      </small>
                    </span>
                  </div>
                </details>
              )}

              {/* D-027: rates compressed to a single inline strip (for the CPA) */}
              <div className="wx-rates" data-testid="wx-rates">
                <span className="wx-rate">
                  Fed ordinary{' '}
                  <b>
                    {formatPercent(
                      getFederalOrdinaryRate(inputs.annualIncome, inputs.filingStatus)
                    )}
                  </b>
                </span>
                <span className="wx-rate">
                  Fed ST <b>{formatPercent(rates.full.federalStRate)}</b>
                </span>
                <span className="wx-rate">
                  Fed LT <b>{formatPercent(rates.full.federalLtRate)}</b>
                </span>
                <span className="wx-rate">
                  {inputs.stateCode === 'WA'
                    ? 'WA current (2026–27)'
                    : `State (${inputs.stateCode})`}{' '}
                  <b>{formatPercent(rates.profile.ordinaryRate)}</b>
                </span>
                {inputs.stateCode === 'WA' && (
                  <span className="wx-rate">
                    WA income tax (2028+) <b>9.90%</b> before deduction &amp; CGT credit
                  </span>
                )}
                {rates.profile.stRate !== rates.profile.ordinaryRate && (
                  <span className="wx-rate">
                    State ST <b>{formatPercent(rates.profile.stRate)}</b>
                  </span>
                )}
                <span className="wx-rate">
                  Combined ord. <b>{formatPercent(rates.combinedOrdinary)}</b>
                </span>
                <span className="wx-rate">
                  Combined LT <b>{formatPercent(rates.combinedLt)}</b>
                </span>
                {settings.washSaleDisallowanceRate > 0 && (
                  <span className="wx-rate">
                    Wash-sale <b>{formatPercent(settings.washSaleDisallowanceRate, 0)}</b>
                  </span>
                )}
                <span className="wx-rate">Fed ST &amp; LT incl. NIIT</span>
                <span className="wx-rate wx-rate-note">
                  Marginal statutory rates used to value eligible deductions and gains — not the
                  client&apos;s effective tax rate.
                </span>
              </div>

              <details className="wx-provenance" data-testid="wx-tax-provenance">
                <summary>
                  <strong>Tax assumption provenance</strong>
                  <span>Sources, effective years, and verification status</span>
                </summary>
                <div className="wx-provenance-grid">
                  <div>
                    <b>Federal §461(l) limits</b>
                    <span>
                      Tax year {TAX_PARAMETER_MANIFEST.federal.section461l.effectiveTaxYear}
                    </span>
                    <span>Verified {TAX_PARAMETER_MANIFEST.federal.section461l.verifiedAt}</span>
                    <a
                      href={TAX_PARAMETER_MANIFEST.federal.section461l.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      IRS source
                    </a>
                  </div>
                  <div>
                    <b>California NOL timing</b>
                    <span>SB 167 · modeled for 2026 high-income cases</span>
                    <span>Enacted; state carryover character approximated</span>
                    <a
                      href="https://www.ftb.ca.gov/file/business/deductions/net-operating-loss.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      California FTB source
                    </a>
                  </div>
                  <div>
                    <b>Washington income tax</b>
                    <span>
                      Effective {TAX_PARAMETER_MANIFEST.washington.incomeTax.effectiveTaxYear}
                    </span>
                    <span>
                      Verified {TAX_PARAMETER_MANIFEST.washington.incomeTax.verifiedAt} ·
                      provisional implementation guidance
                    </span>
                    <a
                      href={TAX_PARAMETER_MANIFEST.washington.incomeTax.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enacted statute
                    </a>
                  </div>
                  <div>
                    <b>Washington capital-gains excise</b>
                    <span>
                      Effective{' '}
                      {TAX_PARAMETER_MANIFEST.washington.capitalGainsExcise.effectiveTaxYear}
                    </span>
                    <span>
                      Verified {TAX_PARAMETER_MANIFEST.washington.capitalGainsExcise.verifiedAt} ·
                      2026 exemption provisional
                    </span>
                    <a
                      href={TAX_PARAMETER_MANIFEST.washington.capitalGainsExcise.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Washington DOR source
                    </a>
                  </div>
                </div>
                <p>
                  Other federal and state rates are the 2026 model parameters shown above.
                  User-entered assumptions and opt-in model settings remain scenario-specific.
                </p>
              </details>

              {!ediMode && (
                <details className="wx-details">
                  <summary>
                    <strong>{brandText("How the QFAF's tax treatment works")}</strong> (draft —
                    pending counsel review)
                  </summary>
                  <p>{getPopupContent('qfaf-treatment')?.definition ?? ''}</p>
                </details>
              )}
            </div>
          )}

          {resultsView === 'table' && (
            <div className="wx-table-host">
              <div className="wx-mobile-year-detail" data-testid="wx-mobile-year-detail">
                <div className="wx-mobile-year-nav">
                  <button
                    type="button"
                    disabled={mobileSelectedYear <= 1}
                    onClick={() => setMobileSelectedYear(year => Math.max(1, year - 1))}
                  >
                    Previous
                  </button>
                  <label>
                    <span>Selected year</span>
                    <select
                      value={selectedMobileYear?.year ?? 1}
                      onChange={e => setMobileSelectedYear(Number(e.target.value))}
                    >
                      {results.years.map(y => (
                        <option key={y.year} value={y.year}>
                          Year {y.year}
                          {!y.strategyActive ? ' · wind-down' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={mobileSelectedYear >= results.years.length}
                    onClick={() =>
                      setMobileSelectedYear(year => Math.min(results.years.length, year + 1))
                    }
                  >
                    Next
                  </button>
                </div>
                {selectedMobileYear && (
                  <dl className="wx-mobile-year-grid">
                    <div>
                      <dt>Portfolio value</dt>
                      <dd>{formatCurrency(selectedMobileYear.totalValue)}</dd>
                    </div>
                    <div>
                      <dt>Tax savings</dt>
                      <dd>{formatCurrency(selectedMobileYear.taxSavings)}</dd>
                    </div>
                    <div>
                      <dt>ST losses harvested</dt>
                      <dd>{formatCurrency(selectedMobileYear.stLossesHarvested)}</dd>
                    </div>
                    <div>
                      <dt>LT gains realized</dt>
                      <dd>{formatCurrency(selectedMobileYear.ltGainsRealized)}</dd>
                    </div>
                    <div>
                      <dt>Ordinary loss used</dt>
                      <dd>{formatCurrency(selectedMobileYear.usableOrdinaryLoss)}</dd>
                    </div>
                    <div>
                      <dt>NOL balance</dt>
                      <dd>{formatCurrency(selectedMobileYear.nolCarryforward)}</dd>
                    </div>
                    <div>
                      <dt>Capital loss reserve</dt>
                      <dd>
                        {formatCurrency(
                          selectedMobileYear.stLossCarryforward +
                            selectedMobileYear.ltLossCarryforward
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Income for full utilization</dt>
                      <dd>{formatCurrency(selectedMobileYear.incomeRequiredForFullUtilization)}</dd>
                    </div>
                    {(selectedMobileYear.waIncomeTax > 0 ||
                      selectedMobileYear.waCapitalGainsTaxCredit > 0) && (
                      <>
                        <div>
                          <dt>WA income tax</dt>
                          <dd>{formatCurrency(selectedMobileYear.waIncomeTax)}</dd>
                        </div>
                        <div>
                          <dt>WA capital-gains credit</dt>
                          <dd>{formatCurrency(selectedMobileYear.waCapitalGainsTaxCredit)}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                )}
                <details className="wx-mobile-full-table">
                  <summary>Open full audit table</summary>
                  <ResultsTable
                    data={results.years}
                    sizing={results.sizing}
                    qfafEnabled={effectiveInputs.qfafEnabled}
                    projectionYears={projectionYears}
                    startMonth={effectiveInputs.startMonth}
                    qfafDuration={effectiveInputs.qfafDuration}
                    strategyId={view.isSplit ? undefined : effectiveInputs.strategyId}
                    ltGainRate={view.isSplit ? undefined : currentStrategy?.ltGainRate}
                  />
                </details>
              </div>
              <div className="wx-desktop-year-table">
                <ResultsTable
                  data={results.years}
                  sizing={results.sizing}
                  qfafEnabled={effectiveInputs.qfafEnabled}
                  projectionYears={projectionYears}
                  startMonth={effectiveInputs.startMonth}
                  qfafDuration={effectiveInputs.qfafDuration}
                  strategyId={view.isSplit ? undefined : effectiveInputs.strategyId}
                  ltGainRate={view.isSplit ? undefined : currentStrategy?.ltGainRate}
                />
              </div>
            </div>
          )}

          {resultsView === 'charts' && (
            <div className="wx-charts">
              <TaxSavingsChart data={results.years} startMonth={effectiveInputs.startMonth} />
              <PortfolioValueChart
                data={results.years}
                trackingError={view.primaryStrategy?.trackingError}
                startMonth={effectiveInputs.startMonth}
              />
            </div>
          )}

          <p className="wx-disc">
            Estimates only — not investment, tax, or legal advice. Headline savings are gross by
            default; financing fees, wash-sale haircuts, and present-value discounting are opt-in
            layers. {brandText('QFAF tax treatment is contingent on qualification.')} See the full
            disclosures below.
          </p>

          <DisclaimerFooter />
        </section>
      </div>
    </div>
  );
}
