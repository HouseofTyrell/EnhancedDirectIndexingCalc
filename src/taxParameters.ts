/**
 * Statutory inputs that require periodic verification. Keeping the value,
 * effective year, source, and verification status together prevents silent
 * duplication and makes provisional figures visible to every consumer.
 */
export const TAX_PARAMETER_MANIFEST = {
  federal: {
    section461l: {
      effectiveTaxYear: 2026,
      verifiedAt: '2026-07-11',
      provisional: false,
      source: 'https://www.irs.gov/irb/2025-45_IRB',
      limits: {
        single: 256000,
        mfj: 512000,
        mfs: 256000,
        hoh: 256000,
      },
    },
  },
  washington: {
    incomeTax: {
      effectiveTaxYear: 2028,
      verifiedAt: '2026-07-11',
      provisional: true,
      source:
        'https://lawfilesext.leg.wa.gov/biennium/2025-26/Htm/Bills/Session%20Laws/Senate/6346-S.SL.htm',
      provisionalReason:
        'The enacted statute is modeled before Washington DOR has published final regulations and forms.',
      rate: 0.099,
      standardDeduction: 1000000,
      capitalGainsTaxCredit: true,
    },
    capitalGainsExcise: {
      effectiveTaxYear: 2026,
      verifiedAt: '2026-07-11',
      provisional: true,
      source: 'https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax',
      provisionalReason:
        'Washington DOR has not published the inflation-adjusted 2026 standard deduction; the published 2025 amount is retained.',
      rate: 0.07,
      exemptionPerYear: 278000,
      surchargeRate: 0.029,
      surchargeThreshold: 1000000,
    },
  },
} as const;
