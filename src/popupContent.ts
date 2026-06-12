// Popup content definitions for all calculated fields
// Each popup includes: definition, formula (if applicable), and impact explanation

export interface PopupContent {
  title: string;
  definition: string;
  formula?: string;
  impact: string;
}

export const POPUP_CONTENT: Record<string, PopupContent> = {
  // ============================================
  // TAX RATES SECTION
  // ============================================

  'federal-st-rate': {
    title: 'Federal Ordinary/ST Rate',
    definition:
      'Your marginal federal tax rate on ordinary income and short-term capital gains (assets held less than 1 year).',
    formula: 'Tax Bracket Rate (10-37%) + NIIT (3.8% if AGI > $250K MFJ or $200K Single)',
    impact:
      'Higher ordinary rates increase the value of ST→LT conversion and ordinary loss deductions.',
  },

  'federal-lt-rate': {
    title: 'Federal LT Capital Gains Rate',
    definition:
      'Your marginal federal tax rate on long-term capital gains (assets held more than 1 year).',
    formula: '0%/15%/20% based on income + NIIT (3.8% if applicable)',
    impact: 'Lower than ordinary rates - this differential creates the tax arbitrage opportunity.',
  },

  'state-rate': {
    title: 'State Tax Rate',
    definition: 'Your state income tax rate. Most states tax capital gains as ordinary income.',
    formula: 'Varies by state (0% in TX, FL, WA; up to 13.3% in CA)',
    impact:
      'Higher state rates increase overall tax burden but also increase savings from the strategy.',
  },

  'combined-st-rate': {
    title: 'Combined Ordinary Rate',
    definition: 'Total tax rate on ordinary income and short-term capital gains.',
    formula: 'Federal Ordinary Rate + State Rate',
    impact: 'This is the rate saved when ordinary losses offset W-2 income.',
  },

  'combined-lt-rate': {
    title: 'Combined LT Rate',
    definition: 'Total tax rate on long-term capital gains.',
    formula: 'Federal LT Rate + State Rate',
    impact: 'This is the effective rate paid on strategy LT gains.',
  },

  // ============================================
  // STRATEGY SIZING SECTION
  // ============================================

  'collateral-value': {
    title: 'Collateral Value',
    definition:
      'The amount invested in the direct indexing (Core) or pledged as collateral (Overlay) strategy.',
    impact:
      'Larger collateral generates more ST losses, enabling larger QFAF allocation and greater tax benefits.',
  },

  'auto-sized-qfaf': {
    title: 'Auto-Sized QFAF',
    definition:
      'Quantinno Fundamental Arbitrage Fund allocation, automatically sized to match collateral ST loss capacity.',
    formula: '(Collateral × Strategy ST Loss Rate) ÷ 150%',
    impact:
      'QFAF generates 150% ST gains and 150% ordinary losses annually. Proper sizing ensures ST gains are fully offset.',
  },

  'qfaf-treatment': {
    title: 'QFAF Tax Treatment (Draft)',
    definition:
      "DRAFT — pending counsel review. The Quantinno Fundamental Arbitrage Fund (QFAF) is modeled as a limited partnership engaged in high-turnover arbitrage trading that has made a mark-to-market election under IRC §475(f). Under that election the fund's trading losses are ordinary in character, while an offsetting sleeve realizes short-term capital gains — modeled here as approximately 150% of fund value in ordinary losses and 150% in short-term gains annually, with limited net economic exposure. Ordinary losses of a §475(f) trader fund are generally non-passive (trading in financial instruments is excepted from the §469 passive-activity rules) and are therefore subject to the §461(l) excess-business-loss limitation modeled here. This treatment depends on, among other things, the fund qualifying as a trader (not an investor) in securities, a valid and timely §475(f) election, allocations respecting §704(b), and the arrangement's economic substance — structures designed primarily to manufacture tax benefits draw IRS scrutiny and could be challenged or recharacterized. Verify the actual fund's structure, elections, and tax opinions with counsel before relying on this model.",
    impact:
      'If the actual fund does not qualify for this treatment, the ordinary-loss benefits ' +
      'modeled here may not be available. This description is a working draft, not tax advice.',
  },

  'total-exposure': {
    title: 'Total Exposure',
    definition: 'Combined value of collateral and QFAF investments.',
    formula: 'Collateral Value + QFAF Value',
    impact:
      'Total capital deployed in the strategy. Tax alpha is measured relative to this amount.',
  },

  'qfaf-ratio': {
    title: 'QFAF Ratio',
    definition: 'QFAF allocation as a percentage of collateral.',
    formula: 'QFAF Value ÷ Collateral Value × 100%',
    impact: 'Lower leverage strategies have lower ratios. Core 145/45 typically has ~8.7% ratio.',
  },

  'section-461-limit': {
    title: 'Section 461(l) Limit',
    definition:
      'Annual cap on excess business losses that can offset non-business income (W-2, interest, etc.).',
    formula:
      '$512,000 (MFJ) or $256,000 (Single/MFS/HOH) for 2026. Also limited by taxable income.',
    impact: 'Ordinary losses above this limit (or taxable income) become NOL carryforward.',
  },

  'year1-st-losses': {
    title: 'Year 1 ST Losses',
    definition: 'Short-term capital losses generated by the collateral strategy in year 1.',
    formula: 'Collateral Value × Strategy ST Loss Rate',
    impact: 'These losses offset QFAF ST gains, converting them to long-term treatment.',
  },

  'year1-st-gains': {
    title: 'Year 1 ST Gains',
    definition: 'Short-term capital gains generated by QFAF in year 1.',
    formula: 'QFAF Value × 150%',
    impact: 'Auto-sizing ensures these match collateral ST losses exactly.',
  },

  'net-st-position': {
    title: 'Net ST Position',
    definition: 'Result of matching QFAF ST gains against collateral ST losses.',
    formula: 'QFAF ST Gains - Collateral ST Losses',
    impact: 'Should be $0 or near-zero with proper auto-sizing.',
  },

  'year1-ordinary-losses': {
    title: 'Year 1 Ordinary Losses',
    definition: 'Ordinary losses generated by QFAF through its swap structure.',
    formula: 'QFAF Value × 150%',
    impact: 'These can offset W-2 income, subject to §461(l) limitation.',
  },

  'usable-ordinary-loss': {
    title: 'Usable Ordinary Loss',
    definition: 'Portion of QFAF ordinary losses that can offset income this year.',
    formula: 'min(QFAF Ordinary Losses, §461(l) Limit)',
    impact: 'Directly reduces taxable income at your marginal ordinary rate.',
  },

  'excess-to-nol': {
    title: 'Excess → NOL Carryforward',
    definition: 'Ordinary losses exceeding the §461(l) limit that become Net Operating Loss.',
    formula: 'QFAF Ordinary Losses - Usable Ordinary Loss',
    impact:
      'NOL can offset up to 80% of taxable income in future years, carried forward indefinitely.',
  },

  // ============================================
  // TAX BENEFIT BREAKDOWN
  // ============================================

  'ordinary-loss-benefit': {
    title: 'Ordinary Loss Tax Benefit',
    definition: 'Tax savings from QFAF ordinary losses offsetting W-2/ordinary income.',
    formula: 'Usable Ordinary Loss × Combined Ordinary Rate',
    impact: 'The primary driver of tax alpha. Higher ordinary rates = greater benefit.',
  },

  'lt-gain-cost': {
    title: 'LT Gain Tax Cost',
    definition:
      'Tax paid on long-term capital gains realized from collateral strategy rebalancing.',
    formula: 'LT Gains Realized × Combined LT Rate',
    impact: 'A necessary cost of the strategy, but taxed at favorable long-term rates.',
  },

  'year1-tax-savings': {
    title: 'Net Year 1 Tax Savings',
    definition: 'Total tax benefit in Year 1 after accounting for all tax events.',
    formula: 'Ordinary Loss Benefit - LT Gain Cost',
    impact: 'Represents immediate tax alpha generated by the strategy.',
  },

  'nol-offset-benefit': {
    title: 'NOL Offset Benefit',
    definition:
      'Tax savings from using accumulated Net Operating Loss (NOL) carryforward to offset current year taxable income.',
    formula: 'NOL Used This Year × Combined Ordinary Rate',
    impact:
      "Starting in Year 2, accumulated NOL from prior years can offset up to 80% of taxable income, providing additional tax savings beyond the current year's ordinary loss deduction.",
  },

  'year2-tax-savings': {
    title: 'Net Year 2 Tax Savings',
    definition:
      'Total tax benefit in Year 2 after accounting for all tax events including NOL usage.',
    formula: 'Ordinary Loss Benefit + NOL Offset Benefit - LT Gain Cost',
    impact:
      'Year 2+ benefits include NOL carryforward usage, which can significantly increase tax savings compared to Year 1.',
  },

  // ============================================
  // RESULTS SUMMARY SECTION
  // ============================================

  'total-tax-savings': {
    title: 'Total Tax Savings',
    definition: 'Cumulative tax benefit over the full projection period.',
    formula: 'Sum of (Baseline Tax - Actual Tax) for each year',
    impact: 'Represents the total value extracted from the strategy versus passive investing.',
  },

  'final-portfolio-value': {
    title: 'Final Portfolio Value',
    definition: 'Projected total value of collateral + QFAF at the end of the projection period.',
    formula: 'Initial Investment × (1 + annual return)^N years',
    impact: 'Shows the growth of your invested capital over the projection period.',
  },

  'embedded-gain-at-horizon': {
    title: 'Embedded Gain at Horizon',
    definition:
      'Estimated unrealized gain in the collateral portfolio at the end of the projection. ' +
      'Includes both market appreciation and the basis reduction created by tax-loss ' +
      'harvesting (each harvested loss lowers cost basis; realized LT gains raise it).',
    formula:
      'Embedded Gain = (Final Value − Initial Value) + Σ(ST Losses Harvested − LT Gains Realized)',
    impact:
      'This is the gain that would be taxed on full liquidation. Assumes initial basis equals ' +
      'initial market value; Overlay collateral funded with appreciated stock carries additional ' +
      'pre-existing embedded gain not shown.',
  },

  'incremental-deferred-tax': {
    title: 'Deferred Tax If Liquidated',
    definition:
      'Estimated additional tax due on full liquidation at the end of the projection, beyond what ' +
      'a passive buy-and-hold investor would owe, after applying remaining capital loss ' +
      'carryforwards. This is the portion of projected tax savings that is timing (deferral) ' +
      'rather than permanent benefit. The value is SIGNED: a negative number means the strategy ' +
      'exits CHEAPER than passive buy-and-hold — the harvested loss reserve shelters more than ' +
      "the strategy's added embedded gain, which adds to the net benefit instead of reducing it.",
    formula: 'max(0, Embedded Gain − Remaining Carryforwards) × LT Rate − Passive Exit Tax',
    impact:
      'If the portfolio is never fully liquidated — held until death (basis step-up) or donated — ' +
      'the deferred portion may become permanent. Remaining NOL carryforward is not applied here ' +
      'and retains separate value against ordinary income.',
  },

  'net-benefit-after-liquidation': {
    title: 'Net Benefit After Liquidation',
    definition:
      'Estimated total tax savings minus the deferred tax that would come due on full ' +
      'liquidation at the end of the projection. This is the conservative, "everything sold" ' +
      'view of the strategy benefit.',
    formula: 'Total Tax Savings − Deferred Tax If Liquidated',
    impact:
      'The realistic outcome usually falls between this number (full liquidation) and the ' +
      'headline Total Tax Savings (no liquidation, e.g. step-up at death).',
  },

  'effective-tax-alpha': {
    title: 'Annualized Tax Alpha',
    definition: 'Average annual tax savings as a percentage of total exposure.',
    formula: 'Total Tax Savings ÷ Total Exposure ÷ projection years',
    impact:
      'Measures strategy efficiency - higher alpha means more tax benefit per dollar invested.',
  },

  'total-nol-generated': {
    title: 'Total NOL Generated',
    definition: 'Cumulative Net Operating Loss created over the projection period.',
    formula: 'Sum of Excess Ordinary Losses across all years',
    impact: 'This NOL can offset future income at 80% of taxable income per year.',
  },

  // ============================================
  // RESULTS TABLE COLUMNS
  // ============================================

  'col-year': {
    title: 'Year',
    definition: 'Projection year (1-10).',
    impact: 'Tax events are calculated based on portfolio values at the start of each year.',
  },

  'col-total-value': {
    title: 'Total Portfolio Value',
    definition: 'Combined value of QFAF and collateral investments.',
    formula: 'QFAF Value + Collateral Value (after annual return growth)',
    impact: 'Growing portfolio base increases absolute tax benefits in later years.',
  },

  'col-portfolio-value': {
    title: 'Total Portfolio Value',
    definition:
      'Combined value of collateral and QFAF positions. Click to expand and see individual components.',
    formula: 'Collateral Value + QFAF Value',
    impact:
      'The total market value of all strategy assets. Growth comes from market returns on both positions.',
  },

  'col-qfaf-value': {
    title: 'QFAF Value',
    definition: 'Market value of QFAF investment.',
    formula: 'Prior Year QFAF × (1 + annual return)',
    impact: 'Higher QFAF value generates larger ST gains and ordinary losses.',
  },

  'col-collateral-value': {
    title: 'Collateral Value',
    definition: 'Market value of direct indexing or pledged stock.',
    formula: 'Prior Year Collateral × (1 + annual return)',
    impact: 'Higher collateral generates more ST losses for offset capacity.',
  },

  'col-st-gains': {
    title: 'ST Gains (QFAF)',
    definition: 'Short-term capital gains generated by QFAF.',
    formula: 'QFAF Value × 150%',
    impact: 'Offset by collateral ST losses to achieve favorable LT treatment.',
  },

  'col-st-losses': {
    title: 'ST Losses (Collateral)',
    definition: 'Short-term capital losses from tax-loss harvesting and short closures.',
    formula: 'Collateral Value × Strategy ST Loss Rate',
    impact: 'Used to offset QFAF ST gains, converting them to LT treatment.',
  },

  'col-ordinary-loss': {
    title: 'Ordinary Loss',
    definition: 'Ordinary losses generated by QFAF swap structure.',
    formula: 'QFAF Value × 150%',
    impact: 'Can offset W-2/ordinary income, subject to §461(l) cap.',
  },

  'col-usable-loss': {
    title: 'Usable Ordinary Loss',
    definition:
      'Ordinary loss amount deductible this year after §461(l) cap. Click to expand and see the gross loss generated, the usable amount, and any excess flowing to NOL carryforward.',
    formula: 'min(Gross Ordinary Loss, §461(l) Limit, Taxable Income)',
    impact:
      'Reduces taxable income at marginal ordinary rate. Excess above the cap becomes NOL for future years.',
  },

  'col-excess-nol': {
    title: 'Excess → NOL',
    definition: 'Ordinary losses above §461(l) limit becoming NOL.',
    formula: 'Ordinary Loss - Usable Ordinary Loss',
    impact: 'Carried forward to offset future taxable income.',
  },

  'col-lt-gains': {
    title: 'LT Gains (Collateral)',
    definition: 'Long-term capital gains from collateral strategy rebalancing.',
    formula: 'Collateral Value × Strategy LT Gain Rate',
    impact: 'Taxed at favorable LT rates, a cost of the strategy.',
  },

  'col-cap-loss-income': {
    title: 'Capital Loss vs Income',
    definition:
      'Unused capital loss carryforward applied against ordinary income per IRC §1211(b).',
    formula: 'min(Remaining Capital Loss Carryforward, $3,000)',
    impact: 'Reduces ordinary income by up to $3,000/year, saving taxes at your marginal rate.',
  },

  'col-nol-used': {
    title: 'NOL Applied',
    definition:
      "Amount of prior-year NOL carryforward applied against this year's taxable income. Year 1 is always $0 because NOL generated in the current year cannot be used until the following year.",
    formula: 'min(Start-of-Year NOL Balance, 80% × Pre-NOL Taxable Income)',
    impact:
      'Reduces taxable income, but limited to 80% of pre-NOL taxable income per TCJA rules. When ordinary losses already reduce income near zero, little NOL can be applied.',
  },

  'col-tax-savings': {
    title: 'Tax Savings',
    definition:
      'Net tax benefit for this year. Click to expand and see the gross benefits and costs that make up this number.',
    formula: 'Ord. Ded. + NOL Ben. + Cap Loss Benefit − LT Cost − ST Gain Cost',
    impact: 'Annual value extracted from the tax optimization strategy.',
  },

  'col-ord-loss-benefit': {
    title: 'Ordinary Deduction Benefit',
    definition: 'Tax savings from deducting the usable ordinary loss against W-2/ordinary income.',
    formula: 'Usable Ordinary Loss × Combined Ordinary Rate',
    impact: 'Usually the largest single benefit component. Capped by §461(l) limit.',
  },

  'col-nol-benefit': {
    title: 'NOL Usage Benefit',
    definition:
      "Tax savings from applying prior-year NOL carryforward against this year's taxable income.",
    formula: 'NOL Applied × Combined Ordinary Rate',
    impact:
      'Converts banked NOL into actual tax reduction. Limited to 80% of pre-NOL taxable income.',
  },

  'col-lt-gain-cost': {
    title: 'LT Gain Cost',
    definition: 'Tax liability from long-term capital gains realized by the collateral portfolio.',
    formula: 'LT Gains Realized × Combined LT Rate',
    impact: 'The primary cost of the strategy. Offset by the benefits above.',
  },

  'col-cumulative-savings': {
    title: 'Cumulative Tax Savings',
    definition: 'Running total of tax savings through this year.',
    formula: 'Sum of Tax Savings from Year 1 to current year',
    impact: 'Shows total value accumulated from the strategy.',
  },

  'col-eff-rate': {
    title: 'Effective ST Loss Rate',
    definition:
      'The actual ST loss rate used for this year (includes decay and any custom overrides).',
    formula: 'Custom Rate OR (Base Rate × 0.93^(year-1))',
    impact: 'Edit rates using the "Edit Rates by Year" button. Changes affect ST losses harvested.',
  },

  'col-st-carryforward': {
    title: 'ST Capital Loss Carryforward',
    definition: 'Accumulated short-term capital losses not yet used.',
    formula: 'Prior C/F + Current Year Net ST Loss - Used vs LT Gains - $3K Ordinary',
    impact: 'Offsets future capital gains; $3K/year against ordinary income.',
  },

  'col-nol-carryforward': {
    title: 'NOL Carryforward',
    definition: 'Total unused NOL available for future years.',
    formula: 'Prior NOL + This Year Excess - NOL Used This Year',
    impact: 'Can offset 80% of future taxable income each year.',
  },

  'col-state-nol-expired': {
    title: 'State NOL Expired',
    definition:
      'State-side NOL dollars that expired unused at the end of this year. California NOLs ' +
      'expire 20 years after the loss year (R&TC §17276, post-2008 losses); SB 167 extends the ' +
      'carryover of NOLs whose deduction was suspended (tax years 2024–2026, MAGI ≥ $1M) by one ' +
      'year per suspension year. NOL vintages are consumed oldest-first (FIFO).',
    formula: 'Unused balance of each NOL vintage at the end of its 20(+) year carryover period',
    impact:
      'Expired dollars stop earning the state rate when NOL is deducted in later years — only ' +
      'the unexpired state-side pool is valued at the state rate. Federal NOLs are indefinite ' +
      'and are NOT affected.',
  },

  'col-lt-carryforward': {
    title: 'LT Capital Loss Carryforward',
    definition: 'Accumulated long-term capital losses not yet used.',
    formula:
      'Prior C/F − Used vs LT Gains − Cross-applied vs ST Gains − $3K Ordinary (after ST C/F)',
    impact: 'Offsets future capital gains; applied after ST carryforward for the $3K deduction.',
  },

  'col-capital-cf': {
    title: 'Capital Loss Carryforwards',
    definition:
      'Total unused capital loss carryforward (ST + LT) at the end of this year. Click to ' +
      'expand for the ST/LT split and the $3K applied against ordinary income.',
    formula: 'ST Carryforward + LT Carryforward (end of year)',
    impact:
      'This is the banked shelter available against future capital gains — concentrated stock ' +
      'sales, business exits, or the embedded gain at liquidation.',
  },

  'col-cash-returned': {
    title: 'QFAF Cash Returned',
    definition:
      'Cash returned to the client from the QFAF this year: dynamic resizing distributions ' +
      'plus the full redemption at the end of the QFAF program.',
    formula: 'Resizing reductions + terminal unwind proceeds (end-of-year value)',
    impact:
      'Held outside the strategy (modeled as uninvested) and included in Final Total Wealth. ' +
      'With "Redeploy QFAF redemptions" enabled, proceeds flow back into the core at the ' +
      'start of the following year instead, so this column shows $0.',
  },

  'col-income-required': {
    title: 'Income Required for Full Utilization',
    definition:
      'The minimum W-2/ordinary income this year that (1) fully absorbs the §461(l) ordinary ' +
      'deduction and (2) lets the 80% NOL limit consume the entire start-of-year NOL balance. ' +
      'Capital-gain income generated by the strategy already contributes, so it is netted out.',
    formula: '§461(l) Deduction + $3K Used + (Start-of-Year NOL ÷ 80%) − Net Taxable ST/LT Gains',
    impact:
      'A planning target for bonuses, option exercises, or Roth conversions: income at or above ' +
      "this level wastes none of the year's shelter; income below it strands NOL for later years.",
  },

  'col-capital-loss-benefit': {
    title: '$3K Deduction Benefit',
    definition:
      'Tax savings from applying up to $3,000 ($1,500 MFS) of capital loss carryforward ' +
      'against ordinary income per IRC §1211(b).',
    formula: 'Capital Loss Used vs Income × Combined Ordinary Rate (no NIIT)',
    impact: 'Small but recurring; continues through wind-down years while carryforward remains.',
  },

  'col-st-leak-cost': {
    title: 'ST Gain Cost',
    definition:
      'Tax on net short-term gains remaining after collateral ST losses and carryforwards ' +
      'offset QFAF ST gains. Nonzero when the QFAF is oversized relative to harvested losses ' +
      '(e.g., fixed sizing in later years as harvest rates decay).',
    formula: 'max(0, Net ST Gain) × Combined ST Rate (incl. NIIT)',
    impact: 'A drag to watch in fixed sizing mode; dynamic resizing keeps this near zero.',
  },

  'col-net-capital': {
    title: 'Net Capital Activity',
    definition:
      'The net result of all capital gains and losses for the year. Click to expand and see component details (ST Losses, LT Gains, ST Gains).',
    formula: 'QFAF ST Gains - Collateral ST Losses + Collateral LT Gains',
    impact:
      'With proper auto-sizing, net capital ≈ LT gains only (ST gains and losses offset). This is what flows to your tax return.',
  },

  'col-max-offset': {
    title: 'Max Shelter',
    definition:
      'Maximum income that could be sheltered from tax this year. Useful for planning when to exercise stock options or realize other taxable income. Click to expand for NOL details. In wind-down years (marked with *), this reflects available carryforward capacity only — no new losses are generated.',
    formula: '§461(l) Limit + Start-of-Year NOL Balance + Capital Loss Limit ($3K/$1.5K)',
    impact:
      'Higher values indicate better years to realize additional taxable income. The §461(l) limit renews annually; the NOL balance accumulates over time.',
  },

  'col-nol-activity': {
    title: 'NOL Change',
    definition:
      'Net change in NOL for the year. Shows whether NOL is building (+) or being used (−).',
    formula: 'NOL Generated (Excess Ordinary Loss) − NOL Used This Year',
    impact:
      'Positive values mean NOL is accumulating faster than it can be used. NOL usage is limited to 80% of taxable income per year.',
  },

  // ============================================
  // ADVANCED MODE - YEAR BY YEAR
  // ============================================

  'w2-income-override': {
    title: 'W-2 Income Override',
    definition: 'Override the annual income for this specific year.',
    impact: 'Affects §461(l) limit calculation and NOL usage (80% of taxable income).',
  },

  'cash-infusion': {
    title: 'Cash Infusion',
    definition: 'Additional capital added to the strategy in this year.',
    formula: 'Added to collateral at year start, triggers QFAF re-sizing',
    impact: 'Increases collateral base, which increases ST loss capacity and required QFAF.',
  },

  // ============================================
  // ADVANCED MODE - SENSITIVITY
  // ============================================

  'sens-federal-rate': {
    title: 'Federal Rate Change',
    definition: 'Model potential changes to federal tax rates.',
    formula: 'Adjusts both ordinary and LT federal rates by this amount',
    impact: 'Higher rates increase strategy value; lower rates decrease it.',
  },

  'sens-state-rate': {
    title: 'State Rate Change',
    definition: 'Model potential changes to state tax rates.',
    impact: 'Similar to federal - higher state rates increase strategy value.',
  },

  'sens-annual-return': {
    title: 'Annual Return',
    definition: 'Model different portfolio growth scenarios.',
    formula: 'Replaces default 0% growth rate for projections',
    impact: 'Negative returns show how strategy performs in bear markets.',
  },

  'sens-tracking-error': {
    title: 'Tracking Error Impact',
    definition: 'Model deviation from expected strategy performance.',
    formula: 'Multiplier on ST loss and LT gain rate variance',
    impact: 'Higher tracking error means more uncertainty in realized tax events.',
  },

  'sens-st-loss-variance': {
    title: 'ST Loss Rate Variance',
    definition: 'Model variation in tax-loss harvesting effectiveness.',
    formula: 'Adjusts strategy ST loss rate by this percentage',
    impact: 'Lower ST losses reduce offset capacity and strategy benefits.',
  },

  'sens-lt-gain-variance': {
    title: 'LT Gain Rate Variance',
    definition: 'Model variation in realized LT gains.',
    formula: 'Adjusts strategy LT gain rate by this percentage',
    impact: 'Higher LT gains increase tax cost; lower gains reduce cost.',
  },

  // ============================================
  // ADVANCED MODE - STRATEGY COMPARISON
  // ============================================

  'comp-qfaf-required': {
    title: 'QFAF Required',
    definition: 'QFAF allocation needed for this strategy.',
    formula: '(Collateral × ST Loss Rate) ÷ 150%',
    impact: 'Higher leverage strategies require proportionally more QFAF.',
  },

  'comp-tracking-error': {
    title: 'Tracking Error',
    definition: 'Expected deviation from benchmark returns.',
    impact: 'Higher tracking error means more return volatility vs. index.',
  },

  // ============================================
  // ADVANCED MODE - SETTINGS
  // ============================================

  'setting-qfaf-multiplier': {
    title: 'QFAF Multiplier',
    definition:
      'The rate at which QFAF generates both ST gains and ordinary losses relative to its market value.',
    formula: 'Default: 150% (1.50x)',
    impact: 'Changing this affects auto-sizing and all tax event calculations.',
  },

  'setting-qfaf-growth': {
    title: 'QFAF Growth',
    definition: 'Controls whether the QFAF position appreciates with market returns over time.',
    formula: 'Enabled: QFAF grows at (Annual Return - Financing Cost). Disabled: QFAF stays flat.',
    impact:
      'Disabling models scenarios where QFAF returns are eaten by fees, hedging costs, or manager underperformance. This reduces final portfolio value but does not affect annual tax benefits.',
  },

  'setting-wash-sale': {
    title: 'Wash Sale Disallowance',
    definition:
      'Percentage of ST losses disallowed due to wash sale rule violations when repurchasing substantially identical securities within 30 days.',
    formula: 'Effective ST Losses = Gross ST Losses × (1 - Wash Sale Rate)',
    impact:
      'Typically 5-15% of losses are disallowed. Higher rates reduce ST offset capacity and overall tax benefits.',
  },

  'setting-nol-offset': {
    title: 'NOL Offset Limit',
    definition:
      'Maximum percentage of taxable income that can be offset by NOL carryforward in any given year.',
    formula: 'Default: 80% (per TCJA post-2017 rules)',
    impact: 'Lower limits extend NOL usage over more years; higher limits accelerate utilization.',
  },

  'setting-annual-return': {
    title: 'Default Annual Return',
    definition: 'Assumed portfolio growth rate for multi-year projections.',
    formula: 'Default: 0% (no growth assumption)',
    impact: 'Higher returns compound portfolio value; lower returns reduce projected wealth.',
  },

  'setting-niit': {
    title: 'NIIT Rate',
    definition:
      'Net Investment Income Tax on investment income above thresholds ($250K MFJ, $200K Single).',
    formula: 'Default: 3.8%',
    impact: 'Added to capital gains rates for high earners.',
  },

  'setting-ltcg': {
    title: 'LTCG Rate',
    definition: 'Federal long-term capital gains rate (top bracket).',
    formula: 'Default: 20%',
    impact: 'Lower LT rates increase the value of ST→LT conversion.',
  },

  'setting-stcg': {
    title: 'Top Ordinary Rate',
    definition: 'Highest marginal federal ordinary income tax rate.',
    formula: 'Default: 37%',
    impact: 'Higher ordinary rates increase the value of ordinary loss deductions.',
  },

  // ============================================
  // WORKSPACE — EDI-ONLY MODE & STEP-UP (D-014/D-015/D-018)
  // ============================================

  'loss-reserve-built': {
    title: 'Loss Reserve Built',
    definition:
      'The contingent tax value of the loss carryforwards (ST + LT) remaining at the end of ' +
      "the projection, valued at the final year's state-aware combined capital gains rates by " +
      'character. This is the EDI product: a reserve that shelters future capital gains — a ' +
      'business sale, concentrated-stock exit, or portfolio transition.',
    formula: 'Final ST CF × Combined ST Rate + Final LT CF × Combined LT Rate',
    impact:
      'Contingent on future gains being realized — it is NEVER added to the realized Est. Tax ' +
      'Savings headline. When you model a gain event, the sheltered portion moves into realized ' +
      'savings and the reserve shrinks. Expiration: federal capital-loss carryforwards never ' +
      'expire during life (they are lost at death — see Net If Held to Step-Up), and post-2017 ' +
      'NOLs carry forward indefinitely. PA and NJ give individuals no state loss carryforwards, ' +
      'so the reserve is valued at federal-only rates there.',
  },

  'protection-ratio': {
    title: 'Protection Ratio',
    definition:
      'Loss-reserve shelter value generated per dollar of cumulative financing cost — what the ' +
      'protection cost to build. Shown as "—" when financing costs are disabled (no cost to ' +
      'compare against).',
    formula: 'Loss Reserve Shelter Value ÷ Cumulative Financing Cost',
    impact:
      'Above 1.0× means more protection value than cost; 2–4× is typical for overlay ' +
      'strategies. The protection only materializes when a gain event uses the reserve.',
  },

  'break-even-gain-event': {
    title: 'Break-Even Gain Event',
    definition:
      'The largest single capital gain that the ending carryforward balances could fully ' +
      'shelter. Capital-vs-capital netting has no annual dollar limit, and ST/LT carryforwards ' +
      'cross-apply under §1211.',
    formula: 'Final ST Carryforward + Final LT Carryforward',
    impact:
      'A gain event up to this size — stock sale, business exit — would be fully sheltered by ' +
      'the reserve. Larger events are sheltered up to this amount, with the excess taxed normally.',
  },

  'cumulative-financing-cost': {
    title: 'Cumulative Financing Cost',
    definition:
      'Total dollar financing fees charged across the projection: margin interest on the long ' +
      'extension plus borrow and dividend costs on the shorts. $0 when financing costs & fees ' +
      'are disabled in the Model panel.',
    formula: 'Σ Financing Cost Paid per year',
    impact:
      "The carrying cost of building the loss reserve. Compare against the reserve's shelter " +
      'value (the Protection Ratio) to judge strategy efficiency.',
  },

  'net-if-held-to-step-up': {
    title: 'Net If Held to Step-Up',
    definition:
      'Estimated net benefit if the portfolio is never liquidated and is instead held until ' +
      'death: basis steps up under IRC §1014, the deferred exit tax is never paid, and the ' +
      'strategy keeps its full projected savings. Unused capital loss carryforwards die with ' +
      'the taxpayer (§1212) — their contingent shelter value is lost, and is disclosed rather ' +
      'than netted (it was never counted in savings).',
    formula: 'Total Tax Savings (no deferred-tax surrender; CFs lapse unused)',
    impact:
      'Mortality-contingent and based on current law — the conservative anchor remains Net If ' +
      'Liquidated. If the carryforward exceeds the embedded gain, a partial unwind during life ' +
      'can use the reserve before it is lost.',
  },

  'col-financing-cost': {
    title: 'Financing Cost',
    definition:
      'Dollar financing fees charged this year (margin interest on long leverage, borrow fees ' +
      'and dividend costs on shorts, across QFAF and collateral legs). $0 when financing costs ' +
      '& fees are disabled.',
    formula: 'Year-End Portfolio Value × Financing Rate',
    impact:
      'Shown for reference: financing fees are netted out of portfolio growth, not subtracted ' +
      'from the Savings column, so this column is NOT part of the Savings component sum.',
  },

  'projection-years': {
    title: 'Projection Years',
    definition:
      'How many years the model projects (default 10, max 40). The projection auto-extends ' +
      'past this horizon while loss carryforwards (NOL or capital) remain AND something is ' +
      'consuming them — wind-down income using NOL, realized LT gains or deleveraging unwinds ' +
      'burning capital-loss carryforwards.',
    impact:
      'A capital-loss reserve consumed only by the $3,000/yr ordinary-income offset does not ' +
      'auto-extend the projection (a multi-million reserve would take centuries at that rate) — ' +
      'raise this setting to see more of the tail. Liquidation and step-up analyses are valued ' +
      'at the final projected year.',
  },

  // ============================================
  // DELEVERAGING (D-016/D-017)
  // ============================================

  'deleverage-plan': {
    title: 'Deleveraging Plan',
    definition:
      'Models unwinding the extension strategy to a lower-leverage target — all at once ' +
      '(duration 1) or linearly over a glide path. Harvest and LT gain rates blend from the ' +
      'current strategy to the target (sampled at the current year, never restarted — the ' +
      'book is already seasoned), financing reprices at the interpolated leverage ratios, and ' +
      'unwinding realizes a pro-rata share of the embedded gain. Net portfolio value is ' +
      'unchanged: gross exposure falls, the collateral stays invested.',
    impact:
      "Unwind gains are strategy costs: they net against the year's harvested losses and " +
      'carryforwards first, and any residual tax is charged against the savings column — ' +
      'unlike planned gain events, which are reported separately.',
  },

  'col-extension-fraction': {
    title: 'Extension %',
    definition:
      'End-of-year extension weight: 100% = fully levered at the current strategy, 0% = fully ' +
      "delevered to the plan target. Glides linearly from the plan's start year over its " +
      'duration (1 year = all at once).',
    formula: '1 − (years elapsed since start ÷ duration), floored at 0',
    impact:
      'All blended quantities — harvest rate, LT gain rate, financing — move with this ' +
      'weight, so the year-by-year economics transition smoothly to the target book.',
  },

  'col-deleverage-gain': {
    title: 'Unwind Gain',
    definition:
      'Capital gain realized this year by selling down the long extension (plus any modeled ' +
      "short-cover gain). Sized as the unwound extension dollars × the portfolio's pro-rata " +
      'embedded gain percentage. Character defaults to long-term once the position is ' +
      'seasoned (plan starts after year 2), short-term before.',
    formula: 'Lot Haircut × Embedded Gain % × Extension Dollars Unwound',
    impact:
      "Nets WITH the strategy's own flows: current-year harvested losses absorb it first, " +
      'then carryforwards (§1211 ordering). Only the unsheltered residue is taxed. Gains ' +
      'realized here step up basis, so they are NOT taxed again at the horizon exit.',
  },

  'col-deleverage-tax': {
    title: 'Tax on Unwind',
    definition:
      "Incremental tax attributable to this year's unwind gains after netting and " +
      "carryforward shelter, at the year's combined rates. Already included in the LT/ST " +
      'cost columns (and therefore charged against Savings) — shown here as a decomposition, ' +
      'not an additional charge.',
    formula: 'Taxable Unwind ST × Combined ST Rate + Taxable Unwind LT × Combined LT Rate',
    impact:
      '$0 means the harvested losses and carryforwards fully absorbed the unwind — the ' +
      'deleveraging was executed tax-free out of the loss reserve.',
  },

  'col-financing-saved': {
    title: 'Financing Saved',
    definition:
      "Financing fees avoided this year versus staying fully levered: (source strategy's " +
      "financing rate − the blended rate at this year's interpolated leverage) × collateral. " +
      '$0 when financing costs & fees are disabled in the Model panel.',
    formula: '(Source Financing Rate − Blended Rate) × Collateral Value',
    impact:
      'The recurring economic benefit of deleveraging — it offsets the one-time unwind tax. ' +
      'Like financing costs, it is informational: fees are netted out of portfolio growth.',
  },
};

// Helper function to get popup content by key
export function getPopupContent(key: string): PopupContent | undefined {
  return POPUP_CONTENT[key];
}
