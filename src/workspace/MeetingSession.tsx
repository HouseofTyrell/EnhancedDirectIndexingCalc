import { CSSProperties, useMemo, useState } from 'react';
import { CalculatorInputs, AdvancedSettings, YearOverride } from '../types';
import {
  getFederalStRate,
  getFederalLtRate,
  getFederalOrdinaryRate,
  getStateRate,
  getStateTaxProfile,
} from '../taxData';
import { getStrategy } from '../strategyData';
import { calculate, calculateWithOverrides, computeExitTaxAnalysis } from '../calculations';
import { MeetingMode, MeetingWhatIfs } from '../components/MeetingMode/MeetingMode';

/**
 * Shared scenario pipeline helpers — used by BOTH the Workspace results pane
 * and the sandboxed Meeting Mode session below, so the meeting copy flows
 * through the exact same `calculate`/`calculateWithOverrides` path (one
 * engine, D-014) with the exact same rate composition.
 */

/** Sparse per-year events → the YearOverride list the engine consumes (only rows that differ from the base scenario). */
export function buildActiveOverrides(
  events: Map<number, YearOverride>,
  annualIncome: number
): YearOverride[] {
  const list: YearOverride[] = [];
  events.forEach(o => {
    const differs =
      o.w2Income !== annualIncome ||
      o.cashInfusion !== 0 ||
      (o.gainEvent !== undefined && o.gainEvent.amount > 0);
    if (differs) list.push(o);
  });
  return list;
}

/**
 * D-023: compose the bounded meeting what-ifs ON TOP of the workspace's
 * per-year events, producing a new sparse events map. Pure — same machinery
 * the Workspace events editor feeds, so a retirement step-down here is
 * EXACTLY equivalent to hand-editing the income column from that year on,
 * and a gain event is exactly a D-012 `YearOverride.gainEvent`.
 */
export function composeWhatIfOverrides(
  baseEvents: Map<number, YearOverride>,
  whatIfs: MeetingWhatIfs,
  annualIncome: number,
  projYears: number
): Map<number, YearOverride> {
  const next = new Map(baseEvents);
  const ensure = (yr: number): YearOverride =>
    next.get(yr) ?? {
      year: yr,
      w2Income: annualIncome,
      cashInfusion: 0,
      cashInfusionTaxType: 'gross' as const,
      note: '',
    };
  if (whatIfs.retirementEnabled) {
    const from = Math.max(1, Math.min(projYears, whatIfs.retirementYear));
    for (let yr = from; yr <= projYears; yr++) {
      next.set(yr, { ...ensure(yr), w2Income: whatIfs.retirementIncome });
    }
  }
  if (whatIfs.gainEventEnabled && whatIfs.gainEventAmount > 0) {
    const yr = Math.max(1, Math.min(projYears, whatIfs.gainEventYear));
    next.set(yr, {
      ...ensure(yr),
      gainEvent: { amount: whatIfs.gainEventAmount, character: 'lt' },
    });
  }
  return next;
}

/** D-002: every what-if is opt-in, off by default. */
export function createDefaultWhatIfs(
  inputs: CalculatorInputs,
  settings: AdvancedSettings
): MeetingWhatIfs {
  const projYears = settings.projectionYears ?? 10;
  return {
    retirementEnabled: false,
    retirementYear: Math.min(3, projYears),
    retirementIncome: Math.round(inputs.annualIncome / 2),
    gainEventEnabled: false,
    gainEventYear: Math.min(3, projYears),
    gainEventAmount: Math.round(inputs.collateralAmount / 2),
  };
}

/** Rate composition shared by the Workspace pane and the meeting session. */
export function computeScenarioRates(inputs: CalculatorInputs) {
  const stateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);
  const profile = getStateTaxProfile(inputs.stateCode, stateRate, inputs.nycResident);
  const fedSt = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
  const fedLt = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
  const fedOrd = getFederalOrdinaryRate(inputs.annualIncome, inputs.filingStatus);
  return {
    profile,
    combinedLt: fedLt + profile.ltRate,
    combinedOrdinary: fedOrd + (profile.allowsLossOffsetAgainstIncome ? profile.ordinaryRate : 0),
    // Full shape for Meeting Mode and Excel export (matches the classic memo)
    full: {
      federalStRate: fedSt,
      federalLtRate: fedLt,
      stateRate,
      combinedStRate: fedSt + profile.stRate,
      combinedLtRate: fedLt + profile.ltRate,
      combinedOrdinaryRate:
        fedOrd + (profile.allowsLossOffsetAgainstIncome ? profile.ordinaryRate : 0),
      rateDifferential: fedSt - fedLt,
    },
  };
}

/** What "Keep changes" hands back to the Workspace on exit. */
export interface MeetingKeepPayload {
  inputs: CalculatorInputs;
  settings: AdvancedSettings;
  /** Base events with any active what-ifs materialized into real rows. */
  yearEvents: Map<number, YearOverride>;
}

interface MeetingSessionProps {
  /** Snapshot of the Workspace's effective inputs at meeting entry. */
  baseInputs: CalculatorInputs;
  baseSettings: AdvancedSettings;
  baseYearEvents: Map<number, YearOverride>;
  onExport?: () => void;
  /** Apply the meeting copy to the Workspace, then exit. */
  onKeep: (payload: MeetingKeepPayload) => void;
  /** Exit without touching the Workspace. */
  onDiscard: () => void;
}

/**
 * D-025: sandboxed Meeting Mode session. Snapshots inputs + settings on
 * entry; every Meeting Mode edit (rail controls AND D-023 what-ifs) operates
 * on this meeting-local copy, computed through the same engine path the
 * Workspace uses. On exit, if anything differs from the snapshot, a small
 * keep prompt offers Discard (default) or Keep — the Workspace state behind
 * the meeting is never mutated silently.
 */
export function MeetingSession({
  baseInputs,
  baseSettings,
  baseYearEvents,
  onExport,
  onKeep,
  onDiscard,
}: MeetingSessionProps) {
  // Entry snapshot, frozen for the life of the session (JSON forms make the
  // dirty check cheap and order-stable since the copies start as the same
  // object shapes).
  const [snapshot] = useState(() => ({
    inputsJson: JSON.stringify(baseInputs),
    settingsJson: JSON.stringify(baseSettings),
  }));
  const [meetingInputs, setMeetingInputs] = useState<CalculatorInputs>(baseInputs);
  const [meetingSettings, setMeetingSettings] = useState<AdvancedSettings>(baseSettings);
  const [whatIfs, setWhatIfs] = useState<MeetingWhatIfs>(() =>
    createDefaultWhatIfs(baseInputs, baseSettings)
  );
  const [showKeepPrompt, setShowKeepPrompt] = useState(false);

  const updateInput = <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) =>
    setMeetingInputs(prev => ({ ...prev, [key]: value }));
  const updateWhatIfs = (patch: Partial<MeetingWhatIfs>) =>
    setWhatIfs(prev => ({ ...prev, ...patch }));

  const projYears = meetingSettings.projectionYears ?? 10;

  // Meeting events = workspace events + what-ifs, through the SAME override
  // machinery the Workspace uses (one engine — never a parallel projection).
  const meetingEvents = useMemo(
    () => composeWhatIfOverrides(baseYearEvents, whatIfs, meetingInputs.annualIncome, projYears),
    [baseYearEvents, whatIfs, meetingInputs.annualIncome, projYears]
  );
  const activeOverrides = useMemo(
    () => buildActiveOverrides(meetingEvents, meetingInputs.annualIncome),
    [meetingEvents, meetingInputs.annualIncome]
  );
  const results = useMemo(
    () =>
      activeOverrides.length > 0
        ? calculateWithOverrides(meetingInputs, meetingSettings, activeOverrides)
        : calculate(meetingInputs, meetingSettings),
    [meetingInputs, meetingSettings, activeOverrides]
  );
  const rates = useMemo(() => computeScenarioRates(meetingInputs), [meetingInputs]);
  const exit = useMemo(
    () =>
      computeExitTaxAnalysis(
        results,
        rates.combinedLt,
        meetingSettings.growthEnabled ? meetingSettings.defaultAnnualReturn : 0,
        rates.profile.ltcgExcise,
        meetingInputs.collateralCostBasis
      ),
    [
      results,
      rates,
      meetingSettings.growthEnabled,
      meetingSettings.defaultAnnualReturn,
      meetingInputs.collateralCostBasis,
    ]
  );

  // Dirty = the meeting copy differs from the entry snapshot, or a what-if
  // override is active (growth/fee what-ifs already show up in the settings
  // diff because they edit the meeting settings copy).
  const isDirty =
    JSON.stringify(meetingInputs) !== snapshot.inputsJson ||
    JSON.stringify(meetingSettings) !== snapshot.settingsJson ||
    whatIfs.retirementEnabled ||
    (whatIfs.gainEventEnabled && whatIfs.gainEventAmount > 0);

  const requestExit = () => {
    if (isDirty) setShowKeepPrompt(true);
    else onDiscard();
  };
  const keepChanges = () =>
    onKeep({ inputs: meetingInputs, settings: meetingSettings, yearEvents: meetingEvents });

  return (
    <>
      <MeetingMode
        inputs={meetingInputs}
        results={results}
        taxRates={rates.full}
        exitAnalysis={exit}
        advancedSettings={meetingSettings}
        currentStrategy={getStrategy(meetingInputs.strategyId)}
        onExitMeetingMode={requestExit}
        onExport={onExport}
        onUpdateInput={updateInput}
        onUpdateSettings={setMeetingSettings}
        whatIfs={whatIfs}
        onUpdateWhatIfs={updateWhatIfs}
      />
      {showKeepPrompt && (
        <KeepPrompt
          onDiscard={onDiscard}
          onKeep={keepChanges}
          onCancel={() => setShowKeepPrompt(false)}
        />
      )}
    </>
  );
}

const promptBtnStyle: CSSProperties = {
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function KeepPrompt({
  onDiscard,
  onKeep,
  onCancel,
}: {
  onDiscard: () => void;
  onKeep: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keep meeting changes?"
      data-testid="mm-keep-prompt"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(11,16,32,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 14,
          padding: '22px 26px',
          maxWidth: 420,
          boxShadow: '0 20px 60px rgba(11,16,32,0.35)',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0b1020', marginBottom: 6 }}>
          Keep the changes made during the meeting?
        </div>
        <div style={{ fontSize: 13, color: '#475068', lineHeight: 1.5, marginBottom: 18 }}>
          The meeting ran on a sandboxed copy of the scenario. Discard returns to the Workspace
          exactly as you left it; Keep applies the meeting values (including any active what-ifs) to
          the Workspace.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            autoFocus
            data-testid="mm-keep-prompt-discard"
            onClick={onDiscard}
            style={{
              ...promptBtnStyle,
              background: '#0b1020',
              color: 'white',
              border: 'none',
            }}
          >
            Discard
          </button>
          <button
            data-testid="mm-keep-prompt-keep"
            onClick={onKeep}
            style={{
              ...promptBtnStyle,
              background: 'white',
              color: '#0b1020',
              border: '1px solid #e3e8f0',
            }}
          >
            Keep changes
          </button>
        </div>
      </div>
    </div>
  );
}
