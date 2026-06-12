# Product Decision Log

Single source of truth for owner decisions driving the calculator's improvement roadmap.
Maintained by the PM agent (`.claude/agents/pm.md`). Findings that are plain bugs are
listed at the bottom and do **not** require a decision — they just get fixed.

How this works: the PM agent triages review findings into decision memos, brings them to
the owner in batches of ≤4, and records outcomes here. Decided items are constraints on
all future work; don't re-ask them.

---

## Decided

### D-001 — Baseline preservation strategy
**Date:** 2026-06-11
**Context:** Owner wants the pre-improvement version kept intact as a comparison point
("fork the code here"). A true GitHub fork into the same account isn't possible.
**Decision:** Keep `main` untouched and pin an immutable marker at the pre-improvement
commit (`b6a8d4e`). Owner chose a tag; the remote rejects tag pushes (branch-restricted),
so the equivalent `baseline-2026-06-11` *branch* was created at `b6a8d4e` instead —
functionally identical and visible in the GitHub UI. All improvements land via PRs on
working branches. To compare against baseline:
`git diff origin/baseline-2026-06-11..HEAD` or check out the branch and `npm run build`.
**Implications:** No improvement work is committed directly to `main`. The pre-built
`TaxOptimizationCalculator.html` at the tag is the frozen distributable of the old version.

### D-002 — Default economics presentation (gross vs net)
**Date:** 2026-06-11
**Context:** Headline "Total Tax Savings" defaults to gross-of-everything
(`financingFeesEnabled: false`, `washSaleDisallowanceRate: 0` in `src/types.ts`).
Review flagged this as a credibility risk.
**Decision (owner's words):** "The main purpose of this tool is to show the tax impact of
this strategy at a high level. The default is to show this at a high level with the
option to add additional complexity as needed based on the audience and sophistication."
**Operating principle:** Defaults stay simple/high-level. Fees, wash sales, and other
complexity remain opt-in layers, not default-on. Do not propose flipping defaults.
**Implications:** The remaining open question is *labeling* of the high-level view so it
isn't misread as net (see D-011). No change to `DEFAULT_SETTINGS`.

### D-003 — Deferred-gain / exit-tax modeling in the main QFAF view
**Date:** 2026-06-11
**Context:** Main combined view shows tax savings and Final Portfolio Value with no
deferred-gain liability, even though basis erosion reverses at liquidation. The EDI-only
module (`src/calculations/ediOnly.ts`) already has embedded-gain estimation and unwind
analysis.
**Decision:** Full exit-tax modeling. Wire `estimateEmbeddedGainPct` / unwind analysis
into the main view: show embedded gain, exit tax if liquidated, and split the headline
into permanent savings vs. deferral.
**Implications:** Largest decided work item. Headline metrics and Meeting Mode handout
will change. Sequence after the engine is green (D-004 and bug fixes below).
**Status: IMPLEMENTED (2026-06-11)** — `src/calculations/exitTax.ts` computes embedded
gain from actual projected dollar flows (works in split mode), carryforward shelter,
exit tax vs. a passive baseline, and the permanent/deferred split. Surfaced in
ResultsSummary as three cards (Embedded Gain / Deferred Tax If Liquidated / Net Benefit
After Liquidation) with tooltips and a basis-reduction disclosure; footer disclosure
added. Meeting Mode integration deferred pending D-008.

### D-004 — Wind-down / projection-length semantics
**Date:** 2026-06-11
**Context:** 13 tests fail because `calculate()` in `src/calculations/core.ts` stops
projecting when carryforwards are exhausted, while the tests and
`calculateWithOverrides()` (`src/calculations/overrides.ts:116-117`) expect projection to
auto-extend to QFAF duration + 2 years.
**Decision:** Auto-extend is correct. Make `core.ts` match `overrides.ts` and the
existing tests: always project at least 2 post-QFAF wind-down years so clients see the
carryforward tail and the views agree.
**Implications:** Fix the engine, not the tests. Suite must be green before D-003 work
starts.
**Status: IMPLEMENTED (2026-06-11)** — all 13 failing tests now pass.

### D-005 — State tax fidelity (phased)
**Date:** 2026-06-12 (phase 2 decided same day)
**Decision:** Owner upgraded to **full per-state engine math for all four states**.
**Status: PHASE 2 IMPLEMENTED (2026-06-12)** — `getStateTaxProfile` (taxData.ts) drives
character-specific treatment in the engine: PA/NJ give $0 state benefit on ordinary
deductions/NOL (no wage offset, no individual carryforwards) while still taxing gains;
MA splits ST (12.5%) vs wages/LT (9%); WA applies the 7% LTCG excise above ~$270K/yr
including in the liquidation analysis. Other states keep the flat-conformity model.
State warnings now describe the modeled treatment. Four per-state regression tests.

### D-007 — Official QFAF name
**Date:** 2026-06-12
**Decision (owner):** QFAF stands for **"Quantinno Fundamental Arbitrage Fund."**
**Status: IMPLEMENTED (2026-06-12)** — standardized in README, popup tooltips,
ResultsTable, and Meeting Mode (which also lost its overstated "is established…giving
structured exposure" phrasing). `TAX_CALCULATION_REVIEW.md` left as a historical
point-in-time document. Still open from the original finding: an owner-approved
one-paragraph description of the 150% tax treatment and its qualification assumptions.

### D-008 — Meeting Mode print handout disclosures
**Date:** 2026-06-12
**Decision:** Full disclosure block.
**Status: IMPLEMENTED (2026-06-12)** — print footer now covers: not advice/not an offer,
fees and costs excluded, basis-reduction/deferral (with step-up nuance), §461(l) and NOL
80% limits, wash-sale assumption, QFAF qualification contingency, and state-variation
notice (CA/NY/PA/NJ/MA/WA). "Amplifying the baseline return" softened to
compliance-appropriate phrasing.

### Owner directive — audit-complete year-by-year table
**Date:** 2026-06-12
**Directive:** The expandable year-by-year table must contain every field any audience
(advisor, UHNW client, tax advisor) would ask about or need to see.
**Status: IMPLEMENTED (2026-06-12)** — added per-year ST/LT capital loss carryforward
balances + $3K deduction (new "Cap. CF" group), full savings reconciliation ($3K benefit
and net ST gain cost columns so components sum exactly to Savings), QFAF cash returned,
and effective harvest rate. Treat this as a standing requirement: when the engine gains
a new per-year output, surface it in the table.

---

## Pending decision queue (next batches)

### D-005 — State tax fidelity *(decided — see Decided section above)*

### D-006 — Present-value option
**Date:** 2026-06-12 · **Decision:** PV toggle, off by default.
**Status: IMPLEMENTED (2026-06-12)** — Advanced Settings → "Show Present Value" with a
configurable discount rate (default 5%); headline shows "Present value @ X%" beneath
the nominal total when enabled. `summary.totalTaxSavingsPV` always computed.

### D-007 — Official QFAF name *(decided — see Decided section above)*

### D-008 — Print handout disclosures *(decided — see Decided section above)*

### D-009 — Qualified purchaser gate
**Date:** 2026-06-12 · **Decision:** Keep as-is; the localStorage acknowledgment is
appropriate friction for an **advisor-internal educational tool** — real qualification
happens in the subscription process. Revisit only if the tool is distributed externally
(then consider Cloudflare Access on the Pages deployment: real enforcement, zero code).

### D-010 — §461(l) income-cap modeling
**Date:** 2026-06-12 · **Decision:** Model precisely.
**Status: IMPLEMENTED (2026-06-12)** — the deduction caps at the statutory limit only;
it shelters wages **plus net capital-gain income**; any unsheltered allowed amount flows
to NOL (negative taxable income → NOL, IRC §172) instead of being lost. Closes the Feb
2026 tax review's High-priority finding #2.

### D-011 — Labeling of the gross default view
**Date:** 2026-06-12 · **Decision:** Subtext under headline.
**Status: IMPLEMENTED (2026-06-12)** — "before financing costs & fees (enable in
Advanced Settings)" under the Estimated Tax Savings headline and in the Meeting Mode
hero, shown only while financing fees are disabled.

---

## Bugs — no decision required

1. ~~**NIIT in ordinary-deduction benefits**~~ **FIXED 2026-06-11** — `TaxRates` gains an
   NIIT-free `ordinaryRate` used to value ordinary-loss/NOL/$3K benefits in all three
   engines; ST/LT gain costs keep NIIT-inclusive rates. Regression tests added.
2. ~~**QFAF unwind principal vanishes**~~ **FIXED 2026-06-11** — terminal unwind proceeds
   recorded as `qfafCashReturned` in the last operating year; summary gains
   `totalQfafCashReturned` and `finalTotalWealth`.
3. ~~**Custom QFAF multiplier inconsistency**~~ **FIXED 2026-06-12** — sizing (fixed and
   dynamic) now uses the actual `qfafMultiplier` everywhere.
4. ~~**Wash-sale haircut asymmetry**~~ **FIXED 2026-06-12** — initial sizing nets out the
   wash-sale rate, matching the dynamic-resize target.
5. ~~**`calculateWithOverrides` ignores custom rates**~~ **FIXED 2026-06-12** — overrides
   path honors custom STCG/LTCG/NIIT rates like `calculate()`.
6. ~~**Negative-income edge**~~ **FIXED 2026-06-12** — §461(l) income cap clamped at 0
   (full negative-income modeling remains D-010).
7. ~~**Test suite red**~~ **FIXED 2026-06-11** — D-004 implemented; suite green (333 tests).
8. **Three duplicated projection loops** (`core.ts` / `overrides.ts` / `sensitivity.ts`,
   incl. copy-pasted `getEffectiveFinancingCost`) — consolidate to prevent recurrence of
   3–5.
9. **Pre-existing broken type-check build** — **FIXED 2026-06-11** (`ltGainsEnabled` made
   optional to match all consumers; dead props removed from ScenarioComparisonPanel).

### Found in CFP/CFA usability test session (2026-06-12)

10. ~~**SizingSummary/MeetingMode benefit math used NIIT-inclusive rate**~~ **FIXED
    2026-06-12** — Year-1/Year-2 benefit cards showed "$512K × 51.70%" while net values
    used the corrected 47.9% ordinary rate, so components didn't sum to the total. Both
    now use engine values + a `combinedOrdinaryRate` passed from Calculator; the
    Meeting Mode tax-math panel gained an "Ordinary (deductions)" row.
11. ~~**Meeting Mode showed "$0 of NOL" / "NOL GENERATED $0"**~~ **FIXED 2026-06-12** —
    cards read the final-year NOL *balance* (zero once consumed) instead of
    `summary.totalNolGenerated`.
12. ~~**Print handout paginated to 7–9 sheets with orphaned disclosure pages and a
    blank app-chrome lead page**~~ **FIXED 2026-06-12** — print zoom on handout pages,
    break-between (not after) pagination, app-nav hidden in print, compact footer.
    Verified: exactly 3 sheets, disclosures on every page.

**UX polish queue — ALL FIXED 2026-06-12:**
- ~~Tour started at results~~ → reordered to start at strategy/inputs, end at results.
- ~~No sticky Year column~~ → Year column now sticky during horizontal scroll.
- ~~Wind-down divider label off-screen~~ → label sticks to the visible viewport.
- ~~Sticky-header delta badge overlap~~ → badges suppressed in the sticky header only.

### CPA agent review (2026-06-12)
A CPA-persona technical review of the full engine confirmed the §1212/§1211
netting order, the precise §461(l) model and its NOL 80% interaction, the NIIT
placement (excluded from ordinary deductions, correctly included on LT gain
costs and ST leakage — LT gains ARE net investment income under §1411), the
state profiles, and the exit-tax assumptions. One High finding, fixed same day:
**ltGainCost charged on gross LT gains instead of taxable LT gains after
offsets** — in collateral-only mode harvested ST losses offset the LT gains, so
the old math overstated the baseline's cost and inflated the headline
"Incremental Benefit" of adding the QFAF. Now charged on `taxableLt` (identical
in QFAF mode; WA excise base updated to match). Owner's NIIT question resolved:
keep NIIT in the displayed Fed LT rate.

**Also closed 2026-06-12 (cleanup slice):** engine consolidation (one projection loop;
`financing.ts` shared), AMT-not-modeled disclosure, §1092/§469 disclosure, and a
"tax parameters as of June 2026" line in the footer.
