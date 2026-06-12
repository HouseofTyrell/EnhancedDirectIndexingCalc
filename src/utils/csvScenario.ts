import {
  CalculatorInputs,
  AdvancedSettings,
  DeleveragePlan,
  FilingStatus,
  FILING_STATUSES,
  SplitAllocation,
} from '../types';

/**
 * CSV scenario import/export.
 *
 * Format: simple two-column "Field,Value" CSV with a schema marker on the
 * first row so we can validate the file shape and migrate later versions.
 * Booleans are encoded as `true`/`false`, numbers as plain decimals (no
 * thousands separators), and strings as-is. Empty strings round-trip to
 * empty strings (which `parseInputsFromCsv` ignores).
 *
 * The file captures both `CalculatorInputs` and the user-tweakable parts of
 * `AdvancedSettings`. Strategy data and tax tables are not exported — those
 * are app-version-pinned constants.
 */

const SCHEMA_VERSION = 'edicalc-scenario-v1';

// ---------- CSV primitives -----------------------------------------------

function csvEscape(value: string): string {
  // Quote anything containing comma, quote, newline, or leading/trailing space.
  if (/[",\n\r]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(field: string, value: string | number | boolean): string {
  const v = typeof value === 'string' ? value : String(value);
  return `${csvEscape(field)},${csvEscape(v)}`;
}

// Parse a single CSV line into [field, value]. Returns undefined for malformed
// rows. Handles quoted values with embedded commas and escaped quotes.
function parseCsvLine(line: string): [string, string] | undefined {
  if (!line) return undefined;
  const cells: string[] = [];
  let i = 0;
  let cur = '';
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      cells.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  cells.push(cur);
  if (cells.length < 2) return undefined;
  // Concatenate any extra columns into the value (in case the user appended a comment column).
  const field = cells[0].trim();
  const value = cells.slice(1).join(',').trim();
  if (!field) return undefined;
  return [field, value];
}

// ---------- Export -------------------------------------------------------

/**
 * Serialize inputs + the user-relevant subset of settings to CSV text.
 */
export function exportInputsToCsv(
  inputs: CalculatorInputs,
  settings: AdvancedSettings
): string {
  const lines: string[] = [];
  lines.push('Field,Value');
  lines.push(csvRow('schema', SCHEMA_VERSION));

  // Client profile
  lines.push(csvRow('filingStatus', inputs.filingStatus));
  lines.push(csvRow('stateCode', inputs.stateCode));
  lines.push(csvRow('stateRate', inputs.stateRate));
  lines.push(csvRow('annualIncome', inputs.annualIncome));

  // Strategy & sizing
  lines.push(csvRow('strategyId', inputs.strategyId));
  lines.push(csvRow('collateralAmount', inputs.collateralAmount));

  // Carryforwards
  lines.push(csvRow('existingStLossCarryforward', inputs.existingStLossCarryforward));
  lines.push(csvRow('existingLtLossCarryforward', inputs.existingLtLossCarryforward));
  lines.push(csvRow('existingNolCarryforward', inputs.existingNolCarryforward));

  // QFAF
  if (inputs.qfafOverride !== undefined) {
    lines.push(csvRow('qfafOverride', inputs.qfafOverride));
  }
  lines.push(csvRow('qfafEnabled', inputs.qfafEnabled));
  lines.push(csvRow('qfafSizingYears', inputs.qfafSizingYears));
  lines.push(csvRow('qfafSizingCushion', inputs.qfafSizingCushion));
  lines.push(csvRow('qfafDuration', inputs.qfafDuration));
  lines.push(csvRow('qfafSizingMode', inputs.qfafSizingMode));

  // Misc
  lines.push(csvRow('startMonth', inputs.startMonth));
  lines.push(csvRow('ltGainsEnabled', inputs.ltGainsEnabled ?? true));
  lines.push(csvRow('redeployQfafProceeds', inputs.redeployQfafProceeds ?? false));
  if (inputs.collateralCostBasis !== undefined) {
    lines.push(csvRow('collateralCostBasis', inputs.collateralCostBasis));
  }
  lines.push(csvRow('nycResident', inputs.nycResident ?? false));

  // Deleveraging plan (D-016/D-017); optional knobs only when overridden
  if (inputs.deleveragePlan) {
    const plan = inputs.deleveragePlan;
    lines.push(csvRow('deleveragePlan.enabled', plan.enabled));
    lines.push(csvRow('deleveragePlan.startYear', plan.startYear));
    lines.push(csvRow('deleveragePlan.durationYears', plan.durationYears));
    lines.push(csvRow('deleveragePlan.target', plan.target));
    if (plan.unwindGainCharacter !== undefined) {
      lines.push(csvRow('deleveragePlan.unwindGainCharacter', plan.unwindGainCharacter));
    }
    if (plan.lotSelectionHaircut !== undefined) {
      lines.push(csvRow('deleveragePlan.lotSelectionHaircut', plan.lotSelectionHaircut));
    }
    if (plan.shortCoverGainPct !== undefined) {
      lines.push(csvRow('deleveragePlan.shortCoverGainPct', plan.shortCoverGainPct));
    }
  }

  // Split allocation
  if (inputs.splitAllocation) {
    lines.push(csvRow('splitAllocation.enabled', inputs.splitAllocation.enabled));
    lines.push(csvRow('splitAllocation.coreStrategyId', inputs.splitAllocation.coreStrategyId));
    lines.push(csvRow('splitAllocation.coreAmount', inputs.splitAllocation.coreAmount));
    lines.push(csvRow('splitAllocation.overlayStrategyId', inputs.splitAllocation.overlayStrategyId));
    lines.push(csvRow('splitAllocation.overlayAmount', inputs.splitAllocation.overlayAmount));
  }

  // Settings (user-tweakable subset)
  lines.push(csvRow('settings.qfafMultiplier', settings.qfafMultiplier));
  lines.push(csvRow('settings.qfafGrowthEnabled', settings.qfafGrowthEnabled));
  lines.push(csvRow('settings.washSaleDisallowanceRate', settings.washSaleDisallowanceRate));
  lines.push(csvRow('settings.nolOffsetLimit', settings.nolOffsetLimit));
  lines.push(csvRow('settings.growthEnabled', settings.growthEnabled));
  lines.push(csvRow('settings.defaultAnnualReturn', settings.defaultAnnualReturn));
  lines.push(
    csvRow(
      'settings.qfafAnnualReturn',
      settings.qfafAnnualReturn === null ? '' : settings.qfafAnnualReturn
    )
  );
  lines.push(csvRow('settings.financingFeesEnabled', settings.financingFeesEnabled));
  lines.push(csvRow('settings.financingMode', settings.financingMode));
  lines.push(csvRow('settings.simpleWealthMgmtFee', settings.simpleWealthMgmtFee));
  lines.push(csvRow('settings.simpleManagerFeeBase', settings.simpleManagerFeeBase));
  lines.push(csvRow('settings.simpleManagerFeeFixed', settings.simpleManagerFeeFixed));
  lines.push(csvRow('settings.brokerMarginRate', settings.brokerMarginRate));
  lines.push(csvRow('settings.shortBorrowRate', settings.shortBorrowRate));
  lines.push(csvRow('settings.shortDividendRate', settings.shortDividendRate));
  lines.push(csvRow('settings.wealthManagementFeeRate', settings.wealthManagementFeeRate));
  lines.push(csvRow('settings.projectionYears', settings.projectionYears));
  lines.push(csvRow('settings.niitRate', settings.niitRate));
  lines.push(csvRow('settings.ltcgRate', settings.ltcgRate));
  lines.push(csvRow('settings.stcgRate', settings.stcgRate));

  return lines.join('\n') + '\n';
}

/**
 * Trigger a browser download of the CSV scenario.
 */
export function downloadInputsCsv(
  inputs: CalculatorInputs,
  settings: AdvancedSettings,
  filename: string = 'edicalc-scenario.csv'
): void {
  const csv = exportInputsToCsv(inputs, settings);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke shortly after so older browsers finish the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Import -------------------------------------------------------

export interface ParsedScenario {
  inputs: Partial<CalculatorInputs>;
  settings: Partial<AdvancedSettings>;
  warnings: string[];
}

const BOOL_TRUE = new Set(['true', '1', 'yes', 'y']);
const BOOL_FALSE = new Set(['false', '0', 'no', 'n']);

function parseBool(value: string, warnings: string[], field: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (BOOL_TRUE.has(v)) return true;
  if (BOOL_FALSE.has(v)) return false;
  warnings.push(`${field}: expected boolean, got "${value}" — ignoring.`);
  return undefined;
}

function parseNum(value: string, warnings: string[], field: string): number | undefined {
  if (value === '' || value === undefined) return undefined;
  const cleaned = value.replace(/,/g, '').replace(/\$/g, '').replace(/%/g, '').trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    warnings.push(`${field}: expected number, got "${value}" — ignoring.`);
    return undefined;
  }
  return n;
}

const FILING_STATUS_VALUES = new Set<FilingStatus>(FILING_STATUSES.map(s => s.value));

/**
 * Parse a CSV scenario file. Returns the input/settings overrides found in
 * the file (as partials so the caller can merge them onto current state).
 *
 * Throws if the schema marker is missing or unsupported. Unknown fields are
 * collected as warnings rather than rejected, so future-version files import
 * gracefully.
 */
export function parseInputsFromCsv(csvText: string): ParsedScenario {
  const warnings: string[] = [];
  const lines = csvText.split(/\r\n|\n|\r/).filter(l => l.length > 0);
  if (lines.length === 0) {
    throw new Error('CSV file is empty.');
  }
  // Drop optional header row.
  if (/^\s*Field\s*,/i.test(lines[0])) lines.shift();

  const map = new Map<string, string>();
  for (const line of lines) {
    const parsed = parseCsvLine(line);
    if (!parsed) continue;
    map.set(parsed[0], parsed[1]);
  }

  const schema = map.get('schema');
  if (!schema) {
    throw new Error('Not a recognized scenario CSV (missing "schema" row).');
  }
  if (schema !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported scenario CSV schema "${schema}" (expected "${SCHEMA_VERSION}").`
    );
  }

  const inputs: Partial<CalculatorInputs> = {};
  const settings: Partial<AdvancedSettings> = {};

  // Helper to consume a key once parsed.
  const numField = (key: string, target: (n: number) => void) => {
    const raw = map.get(key);
    if (raw === undefined) return;
    map.delete(key);
    const n = parseNum(raw, warnings, key);
    if (n !== undefined) target(n);
  };
  const boolField = (key: string, target: (b: boolean) => void) => {
    const raw = map.get(key);
    if (raw === undefined) return;
    map.delete(key);
    const b = parseBool(raw, warnings, key);
    if (b !== undefined) target(b);
  };
  const strField = (key: string, target: (s: string) => void) => {
    const raw = map.get(key);
    if (raw === undefined) return;
    map.delete(key);
    if (raw) target(raw);
  };

  // Inputs
  strField('filingStatus', s => {
    if (FILING_STATUS_VALUES.has(s as FilingStatus)) {
      inputs.filingStatus = s as FilingStatus;
    } else {
      warnings.push(`filingStatus: unknown value "${s}" — ignoring.`);
    }
  });
  strField('stateCode', s => { inputs.stateCode = s; });
  numField('stateRate', n => { inputs.stateRate = n; });
  numField('annualIncome', n => { inputs.annualIncome = n; });
  strField('strategyId', s => { inputs.strategyId = s; });
  numField('collateralAmount', n => { inputs.collateralAmount = n; });
  numField('existingStLossCarryforward', n => { inputs.existingStLossCarryforward = n; });
  numField('existingLtLossCarryforward', n => { inputs.existingLtLossCarryforward = n; });
  numField('existingNolCarryforward', n => { inputs.existingNolCarryforward = n; });
  numField('qfafOverride', n => { inputs.qfafOverride = n; });
  boolField('qfafEnabled', b => { inputs.qfafEnabled = b; });
  numField('qfafSizingYears', n => { inputs.qfafSizingYears = n; });
  numField('qfafSizingCushion', n => { inputs.qfafSizingCushion = n; });
  numField('qfafDuration', n => { inputs.qfafDuration = n; });
  strField('qfafSizingMode', s => {
    if (s === 'fixed' || s === 'dynamic') {
      inputs.qfafSizingMode = s;
    } else {
      warnings.push(`qfafSizingMode: expected "fixed" or "dynamic", got "${s}" — ignoring.`);
    }
  });
  numField('startMonth', n => { inputs.startMonth = n; });
  boolField('ltGainsEnabled', b => { inputs.ltGainsEnabled = b; });
  boolField('redeployQfafProceeds', b => { inputs.redeployQfafProceeds = b; });
  numField('collateralCostBasis', n => { inputs.collateralCostBasis = n; });
  boolField('nycResident', b => { inputs.nycResident = b; });

  // Deleveraging plan: assemble whatever keys are present, then attach if any.
  const dlv: Partial<DeleveragePlan> = {};
  let dlvTouched = false;
  {
    const raw = map.get('deleveragePlan.enabled');
    if (raw !== undefined) {
      map.delete('deleveragePlan.enabled');
      const b = parseBool(raw, warnings, 'deleveragePlan.enabled');
      if (b !== undefined) { dlv.enabled = b; dlvTouched = true; }
    }
  }
  for (const key of ['deleveragePlan.startYear', 'deleveragePlan.durationYears', 'deleveragePlan.lotSelectionHaircut', 'deleveragePlan.shortCoverGainPct'] as const) {
    const raw = map.get(key);
    if (raw === undefined) continue;
    map.delete(key);
    const n = parseNum(raw, warnings, key);
    if (n === undefined) continue;
    dlvTouched = true;
    if (key === 'deleveragePlan.startYear') dlv.startYear = n;
    else if (key === 'deleveragePlan.durationYears') dlv.durationYears = n;
    else if (key === 'deleveragePlan.lotSelectionHaircut') dlv.lotSelectionHaircut = n;
    else dlv.shortCoverGainPct = n;
  }
  {
    const raw = map.get('deleveragePlan.target');
    if (raw !== undefined) {
      map.delete('deleveragePlan.target');
      if (raw) { dlv.target = raw; dlvTouched = true; }
    }
  }
  {
    const raw = map.get('deleveragePlan.unwindGainCharacter');
    if (raw !== undefined) {
      map.delete('deleveragePlan.unwindGainCharacter');
      if (raw === 'st' || raw === 'lt') {
        dlv.unwindGainCharacter = raw;
        dlvTouched = true;
      } else if (raw) {
        warnings.push(`deleveragePlan.unwindGainCharacter: expected "st" or "lt", got "${raw}" — ignoring.`);
      }
    }
  }
  if (dlvTouched) {
    inputs.deleveragePlan = {
      enabled: dlv.enabled ?? false,
      startYear: dlv.startYear ?? 1,
      durationYears: dlv.durationYears ?? 1,
      target: dlv.target ?? 'long-only',
      ...(dlv.unwindGainCharacter !== undefined && { unwindGainCharacter: dlv.unwindGainCharacter }),
      ...(dlv.lotSelectionHaircut !== undefined && { lotSelectionHaircut: dlv.lotSelectionHaircut }),
      ...(dlv.shortCoverGainPct !== undefined && { shortCoverGainPct: dlv.shortCoverGainPct }),
    };
  }

  // Split allocation: assemble whatever keys are present, then attach if any.
  const split: Partial<SplitAllocation> = {};
  let splitTouched = false;
  const splitBool = (key: string, target: (b: boolean) => void) => {
    const raw = map.get(key);
    if (raw === undefined) return;
    map.delete(key);
    const b = parseBool(raw, warnings, key);
    if (b !== undefined) {
      target(b);
      splitTouched = true;
    }
  };
  const splitStr = (key: string, target: (s: string) => void) => {
    const raw = map.get(key);
    if (raw === undefined) return;
    map.delete(key);
    if (raw) {
      target(raw);
      splitTouched = true;
    }
  };
  const splitNum = (key: string, target: (n: number) => void) => {
    const raw = map.get(key);
    if (raw === undefined) return;
    map.delete(key);
    const n = parseNum(raw, warnings, key);
    if (n !== undefined) {
      target(n);
      splitTouched = true;
    }
  };
  splitBool('splitAllocation.enabled', b => { split.enabled = b; });
  splitStr('splitAllocation.coreStrategyId', s => { split.coreStrategyId = s; });
  splitNum('splitAllocation.coreAmount', n => { split.coreAmount = n; });
  splitStr('splitAllocation.overlayStrategyId', s => { split.overlayStrategyId = s; });
  splitNum('splitAllocation.overlayAmount', n => { split.overlayAmount = n; });
  if (splitTouched) {
    inputs.splitAllocation = {
      enabled: split.enabled ?? false,
      coreStrategyId: split.coreStrategyId ?? 'core-145-45',
      coreAmount: split.coreAmount ?? 0,
      overlayStrategyId: split.overlayStrategyId ?? 'overlay-45-45',
      overlayAmount: split.overlayAmount ?? 0,
    };
  }

  // Settings
  numField('settings.qfafMultiplier', n => { settings.qfafMultiplier = n; });
  boolField('settings.qfafGrowthEnabled', b => { settings.qfafGrowthEnabled = b; });
  numField('settings.washSaleDisallowanceRate', n => { settings.washSaleDisallowanceRate = n; });
  numField('settings.nolOffsetLimit', n => { settings.nolOffsetLimit = n; });
  boolField('settings.growthEnabled', b => { settings.growthEnabled = b; });
  numField('settings.defaultAnnualReturn', n => { settings.defaultAnnualReturn = n; });
  // qfafAnnualReturn: empty string means "use default" (null).
  if (map.has('settings.qfafAnnualReturn')) {
    const raw = map.get('settings.qfafAnnualReturn') ?? '';
    map.delete('settings.qfafAnnualReturn');
    if (raw === '') {
      settings.qfafAnnualReturn = null;
    } else {
      const n = parseNum(raw, warnings, 'settings.qfafAnnualReturn');
      if (n !== undefined) settings.qfafAnnualReturn = n;
    }
  }
  boolField('settings.financingFeesEnabled', b => { settings.financingFeesEnabled = b; });
  strField('settings.financingMode', s => {
    if (s === 'simple' || s === 'detailed') {
      settings.financingMode = s;
    } else {
      warnings.push(`settings.financingMode: expected "simple" or "detailed", got "${s}" — ignoring.`);
    }
  });
  numField('settings.simpleWealthMgmtFee', n => { settings.simpleWealthMgmtFee = n; });
  numField('settings.simpleManagerFeeBase', n => { settings.simpleManagerFeeBase = n; });
  numField('settings.simpleManagerFeeFixed', n => { settings.simpleManagerFeeFixed = n; });
  numField('settings.brokerMarginRate', n => { settings.brokerMarginRate = n; });
  numField('settings.shortBorrowRate', n => { settings.shortBorrowRate = n; });
  numField('settings.shortDividendRate', n => { settings.shortDividendRate = n; });
  numField('settings.wealthManagementFeeRate', n => { settings.wealthManagementFeeRate = n; });
  numField('settings.projectionYears', n => { settings.projectionYears = n; });
  numField('settings.niitRate', n => { settings.niitRate = n; });
  numField('settings.ltcgRate', n => { settings.ltcgRate = n; });
  numField('settings.stcgRate', n => { settings.stcgRate = n; });

  // Anything left in the map is unknown.
  map.delete('schema');
  for (const key of map.keys()) {
    warnings.push(`Unknown field "${key}" — ignored. (File may be from a newer version.)`);
  }

  return { inputs, settings, warnings };
}
