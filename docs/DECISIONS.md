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

---

## Pending decision queue (next batches)

### D-005 — State tax fidelity
The engine applies one flat state rate everywhere, assuming full federal conformity.
Materially wrong for PA/NJ (no wage offset for these losses), MA (split ST/LT rates),
WA (7% LTCG excise coded as 0%), CA (own excess-business-loss regime). Options:
(a) per-state engine adjustments for the ~5 worst states; (b) keep math as-is but show
hard per-state warnings with dollar-impact estimates; (c) phased: warnings now,
adjustments later. **PM recommendation: (c).**

### D-006 — Present-value option for multi-year savings
"Total Tax Savings" is an undiscounted nominal sum over 10–30 years. Options:
(a) NPV toggle with configurable discount rate; (b) show both nominal and PV;
(c) leave nominal (consistent with D-002 high-level philosophy). Interacts with D-003's
permanent-vs-deferral split. **PM recommendation: decide after D-003 ships.**

### D-007 — Official QFAF name and product description
"QFAF" is expanded four different ways across the app (README: "Quantified Alternative
Funds"; popupContent.ts: "Qualified Family Agricultural Fund"; TAX_CALCULATION_REVIEW.md:
"Qualified Fund of Allocated Funds"; MeetingMode.tsx: "Qualified Fund-of-Funds").
**Only the owner knows the correct expansion** — needs the real product name, plus a
one-paragraph approved description of the 150% tax treatment and its qualification
assumptions. Blocks the copy/disclosure pass.

### D-008 — Meeting Mode print handout disclosure depth
Current print footer is ~50 generic words. Compliance review says inadequate to leave
with a client. Options: (a) full disclosure block (state conformity, basis reduction,
QFAF regulatory contingency, wash-sale assumption); (b) minimal additions ("not tax
advice", basis-reduction caveat) keeping the 3-page layout clean. Depends on whether
handouts are left with clients or used live-only.

### D-009 — Qualified purchaser gate hardening
Gate is localStorage-only and trivially bypassable — fine for an educational tool,
insufficient if distributed as part of an advisory pitch. Decide intended distribution
model before investing here.

### D-010 — §461(l) income-cap modeling
`core.ts` caps the ordinary deduction at `min(losses, 461(l) limit, income)`. The income
cap is conceptually wrong per the Feb 2026 tax review (excess becomes NOL via negative
taxable income) and the cap base ignores capital-gain income. Decide: model precisely
(negative taxable income → NOL) vs. keep the conservative approximation with a
documented rationale.

### D-011 — Labeling of the high-level (gross) default view
Follows from D-002. Defaults stay gross/simple; decide the exact qualifier shown on
headline metrics and the print handout (e.g., "before financing costs and fees —
enable Advanced Settings to include them").

---

## Bugs — no decision required

1. ~~**NIIT in ordinary-deduction benefits**~~ **FIXED 2026-06-11** — `TaxRates` gains an
   NIIT-free `ordinaryRate` used to value ordinary-loss/NOL/$3K benefits in all three
   engines; ST/LT gain costs keep NIIT-inclusive rates. Regression tests added.
2. ~~**QFAF unwind principal vanishes**~~ **FIXED 2026-06-11** — terminal unwind proceeds
   recorded as `qfafCashReturned` in the last operating year; summary gains
   `totalQfafCashReturned` and `finalTotalWealth`.
3. **Custom QFAF multiplier inconsistency** — initial sizing (`sizing.ts:52`) and dynamic
   resizing (`core.ts`) use the 1.5 constant; infusion resizing
   (`overrides.ts`) and gains generation use the setting.
4. **Wash-sale haircut asymmetry** — initial sizing ignores the wash-sale rate, dynamic
   resizing applies it → Year-1 ST gain leakage in fixed mode when rate > 0.
5. **`calculateWithOverrides` ignores custom STCG/LTCG/NIIT rates** — Year-by-Year
   Planning disagrees with the standard view when custom rates are set.
6. **Negative-income edge** — `min(..., effectiveIncome)` can produce a negative ordinary
   deduction with negative year-income overrides.
7. ~~**Test suite red**~~ **FIXED 2026-06-11** — D-004 implemented; suite green (333 tests).
8. **Three duplicated projection loops** (`core.ts` / `overrides.ts` / `sensitivity.ts`,
   incl. copy-pasted `getEffectiveFinancingCost`) — consolidate to prevent recurrence of
   3–5.
9. **Pre-existing broken type-check build** — **FIXED 2026-06-11** (`ltGainsEnabled` made
   optional to match all consumers; dead props removed from ScenarioComparisonPanel).
