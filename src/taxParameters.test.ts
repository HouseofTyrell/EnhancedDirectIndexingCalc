import { describe, expect, it } from 'vitest';
import { SECTION_461L_LIMITS } from './strategyData';
import { getStateTaxProfile } from './taxData';
import { TAX_PARAMETER_MANIFEST } from './taxParameters';
import { DEFAULT_SETTINGS, SECTION_461_LIMITS_2026 } from './types';

describe('tax parameter manifest', () => {
  it('drives every 2026 section 461(l) default', () => {
    const limits = TAX_PARAMETER_MANIFEST.federal.section461l.limits;
    expect(DEFAULT_SETTINGS.section461Limits).toEqual(limits);
    expect(SECTION_461_LIMITS_2026).toEqual(limits);
    expect(SECTION_461L_LIMITS).toEqual(limits);
  });

  it('marks the Washington 2026 exemption as provisional and drives the profile', () => {
    const parameter = TAX_PARAMETER_MANIFEST.washington.capitalGainsExcise;
    expect(parameter.provisional).toBe(true);
    expect(parameter.provisionalReason).toBeTruthy();
    expect(getStateTaxProfile('WA', 0).ltcgExcise).toMatchObject({
      rate: parameter.rate,
      exemptionPerYear: parameter.exemptionPerYear,
      surchargeRate: parameter.surchargeRate,
      surchargeThreshold: parameter.surchargeThreshold,
    });
  });
});
