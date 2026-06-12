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
structured exposure" phrasing). `docs/reviews/TAX_CALCULATION_REVIEW.md` left as a historical
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

### Owner directive — UI review pass + Workspace (Beta) tab
**Date:** 2026-06-12
**Directive:** Full UI review; keep the current version as a tab, ship the redesigned UI
as a new tab.
**Review findings (current UI):** 7,049px single scroll mixing inputs/assumptions/
results/advanced tools; 52 inputs and 60 buttons on one page; changing an input while
reading results requires a full scroll round-trip (sticky header shows outputs only);
numbered "steps" imply a wizard that isn't enforced; the headline summary renders below
the detail table (inverted hierarchy); similar metrics repeat across sticky header,
sizing cards, and results summary.
**Status: IMPLEMENTED (2026-06-12)** — new "Workspace (Beta)" tab
(`src/workspace/WorkspaceTab.tsx`): persistent left input rail (client/strategy/QFAF/
model toggles) beside a results-first pane — headline metric strip (savings + PV,
incremental, Y1/Y2+, net-if-liquidated) over Overview / Year-by-Year / Charts sub-views.
Reuses the same engine, the audit-complete ResultsTable, charts, QP gate, and
disclosures. Classic Tax Calculator tab untouched (split allocation, year-by-year
planning, sensitivity, Meeting Mode remain there).

### Owner directive — Workspace as default + total-budget sizing
**Date:** 2026-06-12
**Directive:** Make the Workspace view the default tab (classic moves to a background
tab), and add a funding option where the QFAF and collateral together total the client's
available portfolio (e.g. a $20M client shouldn't have to guess collateral sizes).
**Status: IMPLEMENTED (2026-06-12)** — Workspace is the default view ("Classic
Calculator" remains as the second tab, unchanged). `solveCollateralForTotal`
(calculations/sizing.ts) solves C = T / (1 + k) where k is the scale-invariant
QFAF-to-collateral ratio (respects sizing window, cushion, wash-sale rate, and custom
multiplier). The Workspace rail gains a "Fund by: Collateral | Total portfolio"
segmented control with a live derived breakdown (e.g. $20M → Collateral $18,018,018 +
QFAF $1,981,982). In total-budget mode the standard-DI comparison puts the WHOLE budget
into direct indexing for a true apples-to-apples baseline.

### Owner directive — full-utilization income target + QFAF redeployment
**Date:** 2026-06-12
**Directive:** (1) Show, per year, the maximum income required to fully utilize the
prior-year NOL carryover and the §461(l) maximum. (2) Add a toggle to redeploy QFAF
redemptions into the core automatically.
**Status: IMPLEMENTED (2026-06-12)** — `YearResult.incomeRequiredForFullUtilization` =
§461(l) deduction + $3K used + (start-of-year NOL ÷ 80%) − net taxable gains, computed
in both engines and proven by test: at that income the entire prior-year NOL is consumed,
below it NOL strands. Surfaced as the "Inc. Req'd" column in the table's Total Losses
group with a planning-oriented tooltip. `inputs.redeployQfafProceeds` (default off,
Workspace toggle "Redeploy redemptions into core") routes dynamic-resize distributions
and terminal unwind proceeds into the collateral at the start of the following year —
cash bucket reports $0 (no double counting), totals conserve exactly with growth off,
and in dynamic mode the larger core increases harvesting and savings. CSV round-trip
covered.

### Owner directive — 2026 figure verification, Workspace completeness, CA/NY modeling
**Date:** 2026-06-12
**Directive:** Open items 2–5: verify 2026 tax figures; add carryforward inputs to the
Workspace; graduate features into the Workspace; extend state fidelity to CA/NY.
**Status: IMPLEMENTED (2026-06-12)**
- **Figures verified against Rev. Proc. 2025-32**: ordinary brackets ✓ correct;
  §461(l) $256K/$512K ✓ correct (OBBBA reset confirmed); **LTCG thresholds were stale
  2025 values — corrected** (MFJ 0%≤$98,900/15%≤$613,700; Single $49,450/$545,500;
  HoH $66,200/$579,600; MFS half-MFJ). WA exemption updated to $278K (published 2025;
  2026 pending DOR) **plus the ESSB 5813 surcharge tier: +2.9% on taxed gains above $1M
  (9.9% top)**, applied to annual gains and the liquidation analysis. Footer records the
  verification.
- **Carryforwards in Workspace**: rail group with existing ST/LT/NOL inputs.
- **Feature graduation**: Meeting Mode launches from the Workspace (full-screen, Esc
  returns), Excel export, CSV scenario export/import — all in a new Actions group.
  Split allocation, year-by-year planning, and sensitivity deliberately remain
  Classic-only.
- **CA/NY engine profiles**: CA 13.3% with SB 167 NOL suspension modeled (state NOL
  component excluded in year 1/tax-year 2026 for MAGI ≥ $1M; carryover-character nuance
  approximated); NY 10.9% with §461(l) retained (NY decoupled from the CARES suspension).
  Conformity warnings rewritten to describe modeled treatment. New tests: WA surcharge,
  2026 LTCG boundary, CA suspension year-1 vs year-2 (353 total).

### Owner directive — mock client-meeting findings (advisor / UHNW client / CPA)
**Date:** 2026-06-12
**Directive:** Remove-or-discuss the "vs. Standard DI" box; make client-meeting details
(esp. the income-required figure) clearly findable.
**Meeting findings:** (1) vs-DI box read $4,013,243 total vs $3,998,873 "incremental" —
99.6% identical, because totalTaxSavings credits standalone DI's carryforward *building*
at $0; mathematically true but reads as noise, and the honest CF-credited comparison
already lives in the EDI-Only tab. (2) Income-required was 1 sub-tab + 1 group-expansion
deep. (3) No rate breakdown visible for a CPA. (4) No wash-sale visibility/control in
the Workspace.
**Status: IMPLEMENTED (2026-06-12)** — vs-DI metric replaced with **"Income to Fully
Utilize" (peak + year)**; Overview gains a per-year income-required chip row (peak
highlighted); a "Rates assumed" line (fed ordinary/ST/LT incl. NIIT, state split,
combined, wash-sale %) for the CPA; and a wash-sale disallowance slider (0–15%) in the
Model group. If a DI comparison returns, it should credit carryforward value on both
sides (EDI-Only-tab methodology).

### Owner directive — three-archetype mock meetings (liquidity event / RSU / concentrated stock)
**Date:** 2026-06-12
**Findings:** (A) Liquidity-event client: per-year utilization chips + NOL balances answer
the shelter questions, but the sale itself can't be modeled (no capital-gain event input
anywhere in the main engine — Classic's year-by-year covers W-2 income only). (B) RSU
client: fully served by the chips (max need $2.27M vs $4.5M income) + CA SB 167 note.
(C) Concentrated-stock client: **no cost-basis input existed**, so the exit cards
understated his real embedded gain by the entire pre-existing gain, and the Workspace
lacked even the appreciated-stock caveat.
**Status: (C) FIXED 2026-06-12** — optional "Cost basis of collateral" input (rail,
CSV round-trip, classic pass-through); exit analysis includes pre-existing gain on BOTH
the strategy and passive sides (so incremental deferred tax stays strategy-attributable,
verified by test); embedded-gain card shows the split; an appreciated-stock caveat
appears for Overlay strategies until a basis is entered.

### D-012 — Liquidity-event modeling — DECIDED & IMPLEMENTED (2026-06-12)
**Decision:** Build gain-event modeling (option a). Also decided same batch: graduate
income overrides to the Workspace, draft the QFAF treatment paragraph for counsel
review, and add NYC resident local tax.
**Status: IMPLEMENTED (2026-06-12)** —
- `YearOverride.gainEvent {amount, character}`: events flow through the real netting
  EVENT-LAST (strategy gains claim carryforwards first), absorb the §461(l) deduction,
  and widen the NOL base. Event tax reported separately (`gainEventTax`,
  `gainEventTaxWithoutStrategy`, `gainEventCfShelter`) and never charged against
  strategy savings. NOL benefit now rate-allocated: ordinary-base first at the ordinary
  rate, overflow at LT-without-NIIT (an NOL doesn't reduce NII).
- **Workspace "Per-Year Events" editor**: income / cash infusion / gain event per year
  (income-override graduation); event summary notes on Overview; "Gain Events" section
  in the transposed table; income-utilization chips automatically reflect event income.
- **QFAF treatment draft** (§475(f) trader-fund framing with qualification conditions
  and IRS-scrutiny caveats), marked DRAFT pending counsel review — popup entry,
  collapsible Overview note, footer reference. Replace with approved language when
  available.
- **NYC resident local tax** (+3.876% on all characters) via NY-state checkbox,
  threaded through engines, classic, Workspace, CSV.

### D-013 — NOL run-until-used + income schedule — OWNER-DIRECTED & IMPLEMENTED (2026-06-12)
**Owner request:** "if there is left over NOL the plan runs until it's used" and "add
the option to add a schedule for income so that different income amounts per year can
be planned for."
**Status: IMPLEMENTED (2026-06-12)** —
- **NOL exhaustion extension** (`core.ts`, both `calculate` and overrides paths): when
  NOL carryforward remains at the end of the standard horizon (projection years, or
  QFAF duration + 2 wind-down years), the projection keeps running until the NOL is
  fully used. Guard rails: hard cap at 40 years; stall guard stops immediately if an
  extension year consumes no NOL (e.g., zero income); extension years continue the
  FINAL scheduled year's income (so a retirement-income override persists rather than
  snapping back to the base input). Workspace shows "(extended to use NOL)" on the
  headline metric and an Overview note explaining the extension; the year-by-year
  table and savings totals include extension years automatically.
- **Income schedule builder** (Workspace → Per-Year Events editor): start income +
  annual growth %/yr → "Apply schedule" fills the per-year income column with
  compounded values; rows stay hand-editable afterward (e.g., drop a year to
  retirement income); "Reset incomes" restores every row to the base input while
  preserving cash infusions and gain events.
- **Scope note:** `sensitivity.ts` intentionally keeps the fixed standard horizon — it
  compares *relative* deltas across rate assumptions, and letting each cell extend a
  different number of years would make the grid incomparable. Five regression tests
  added (extension-until-exhausted, no-extension baseline, stall guard, income
  continuation, 40-year cap); suite at 363.

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

### Pending decision queue — EDI-only & deleveraging (2026-06-12)

**ALL FIVE DECIDED 2026-06-12** (owner batch) — outcomes recorded under each item.
Implementation in two waves: Wave 1 = D-014/D-015/D-018 + exit-tax clamp fix;
Wave 2 = D-016/D-017 deleveraging.

Owner request: "Can we work more on the EDI-only part? … helpful to be able to run just
EDI. I think we have the pieces but don't have a good display or output for it. I'd also
like to model deleveraging, all at once or over time." Two reviews (EDI-only persona
review; deleveraging design analysis) triaged below. Sub-parameters are folded under
their parent decision as overridable defaults.

#### D-014 — EDI-only architecture: first-class Workspace mode vs. separate tab
**Context:** Two EDI surfaces disagree by ~150x on the same client ($2.3M "potential
savings" on the EDI-Only tab vs $15,090 in Workspace with QFAF off). The EDI-Only tab
(`src/components/EdiOnlyTab.tsx`, engine `src/calculations/ediOnly.ts`) has the richest
analytics (protection ratio, break-even, realization scenarios, unwind/estate, trad-DI
benchmark) but carries a "not for client presentations" banner, hardcodes $3M income,
ignores state profiles, and runs a third duplicate netting/projection loop. Workspace
with `qfafEnabled:false` already computes correct mechanics via `core.ts` — only
summary/display composition is QFAF-shaped.
**Options:**
(a) **(Recommended)** Make EDI-only a first-class Workspace mode on `core.ts`; refactor
`ediOnly.ts`'s unique analytics to consume `core.ts` outputs; retire
`computeEdiYear`/`computeEdiProjection`. EDI-Only tab survives as a deep-dive surface
fed by the same engine. Largest effort, but "one engine, one source of truth."
(b) Polish the separate EDI-Only tab into the client-grade surface (fix state math,
income input, banner). Faster, but permanently two engines and two answers.
(c) Workspace mode for the basics; freeze EDI-Only tab as internal-only. Loses the
unwind/estate/scenario analytics from any client surface.
**Recommendation:** (a) — the dual-engine divergence is a CPA-credibility killer, and
(a) is the only option where it can't recur. Defaults folded under this decision (owner
can override): scenario presets (business sale / RSU / concentrated stock) graduate to
the Workspace per-year-events editor; EDI-only mode inherits Workspace defaults (growth
off, fees off), not the tab's (7% growth, financing on); the "Under Development" banner
comes off only the surfaces that pass this refactor.
**DECIDED (owner's words):** "I want to get rid of the edi only tab and have everything
in the workspace tab. If there is too much information to fold into that we should see
if we can add it to the classic tab. Open to other ideas." → Stronger than (a): the
EDI-Only tab is REMOVED entirely (not kept as a deep-dive); its unique analytics fold
into the Workspace, with the Classic tab as overflow if the Workspace gets crowded.
Single engine (`core.ts`); duplicate projection loop retired. Folded defaults above
apply.

#### D-015 — EDI-only headline metric & Meeting Mode framing
**Context:** With QFAF off, `calculateSummary` credits carryforward *building* at $0, so
$10M/10yrs shows "Est. Tax Savings $15,090" and Meeting Mode opens "$0.02M in tax
savings" with QFAF copy ("ordinary loss deductions, NOL usage"). But the CF shield IS
the EDI product (~$6.9M CF ≈ ~$2.5M contingent shelter at statutory rates). The
question is what number leads.
**Options:**
(a) **(Recommended)** Two-part headline: realized savings PLUS a co-equal "loss reserve
built" metric — CF balance and its shelter value at statutory rates, explicitly labeled
contingent on future gains; when a gain event is entered, realized shelter moves into
the savings figure (engine already does this per D-012). EDI-specific Meeting Mode copy.
(b) Value the CF at full statutory rates *inside* the headline (matches EDI-Only tab's
$2.3M today). Bigger number, but presents contingent value as realized — fails the
CPA bar.
(c) Keep realized-only headline; rely on the gain-event editor to tell the story.
Zero engine work, but the default view kills the conversation.
**Recommendation:** (a) — defensible and it teaches the product: protection, not
deductions. Consistent with D-002 (high-level default, honest attribution).
**DECIDED:** (a) — realized + co-equal loss-reserve headline; EDI-specific Meeting
Mode copy.

#### D-016 — Deleveraging v1: scope, plan shape, and defaults
**Context:** Owner wants deleveraging "all at once or over time." Design review
recommends a glide path as a top-level input — `CalculatorInputs.deleveragePlan
{enabled, startYear, durationYears, target}` — implemented as a derived per-year
schedule feeding the existing per-year override hooks (`effectiveStLossRate`,
`ltGainRate`, `financingCost`), blending source→target like `splitAllocation.ts`;
all-at-once is simply `durationYears: 1`. NAV unchanged (gross falls, net stays 100%).
**Options:**
(a) **(Recommended)** Build the glide-path plan as designed; default when enabled =
all-at-once (duration 1), duration editable 1–N; targets = long-only or any
lower-leverage strategy; Workspace-only UI (rail group + conditional ResultsTable
column group + Overview note + CSV/Excel); Classic/EDI-Only-tab and sensitivity-grid
support deferred (D-013 precedent: grid keeps no-deleverage for comparability).
(b) All-at-once only in v1; glide path later. Saves little — the schedule machinery is
the same code.
(c) Full coverage now (Classic, sensitivity, split allocation). Highest effort, delays
the owner's ask.
**Recommendation:** (a) — one build delivers both of the owner's cases; deferred
surfaces are folded defaults the owner can override. QFAF interaction default: dynamic
sizing self-corrects (QFAF shrinks); fixed mode shows an oversized-QFAF warning.
**DECIDED:** (a) — glide-path plan, Workspace-only v1, all-at-once = duration 1.
**Status: IMPLEMENTED (2026-06-12)** — `CalculatorInputs.deleveragePlan` +
`src/calculations/deleverage.ts` (schedule resolution mirroring splitAllocation.ts);
per-year blended rates/financing feed the existing `CalculateYearOverrides` hook;
`financing.ts` refactored to a ratio-based core (`getFinancingCostForRatios`) so glide
years price interpolated leverage. New per-year outputs (extensionFraction, unwind
gain/character split, tax on unwind, financing saved) in the audit-complete table
(conditional "Deleverage" group, both orientations), Workspace rail group, Overview
note, CSV round-trip, and Excel export. Split allocation wins when both are enabled
(plan ignored + warning chip); sensitivity grid stays un-delevered (D-013 precedent).
Dynamic QFAF sizing self-corrects (consumes the blended rate); fixed sizing shows the
oversized-QFAF leakage warning. Exit tax subtracts realized unwind gains from the
basis reduction (no double taxation). 29 regression tests; suite at 352.

#### D-017 — Tax character and rate assumptions for unwind (deleveraging defaults)
**Context:** Deleveraging realizes gains on the long extension and covers shorts; the
assumptions swing the modeled cost by ~17 points of rate and decide whether
deleveraging looks "nearly free." These are modeling-philosophy defaults, all
overridable via plan sub-parameters (`unwindGainCharacter`, `shortCoverGainPct`,
`lotSelectionHaircut`).
**Options:**
(a) **(Recommended)** Defensible-default bundle: long-extension unwind gains 100% LT
once the position is seasoned (after year 2; ST character before that); short-cover
gain 0% (shorts continuously recycled by harvesting, so covering realizes ~no gain) —
with the assumption disclosed on-screen; lot selection pro-rata (no HIFO discount);
loss-rate transition uses the *seasoned* target schedule sampled at the current year
index (a restart would phantom-inflate harvesting).
(b) Aggressive bundle: HIFO lot discount + 0% short cover. Bigger headline, weakest
CPA defense.
(c) Conservative bundle: blended ST/LT character + positive ST short-cover gain.
Most cautious, likely overstates the unwind cost and undersells a real feature.
**Recommendation:** (a) — each piece is the mechanically-accurate middle, and every
knob stays exposed for a skeptical CPA to stress.
**DECIDED:** (a) — defensible-middle bundle, all knobs overridable per plan.
**Status: IMPLEMENTED (2026-06-12)** — with D-016. Long-extension unwind gains are LT
once seasoned (startYear > 2; ST before), short covers realize 0% gain (disclosed in
the rail while a plan is on), lot selection pro-rata (haircut 1.0), and the target
loss-rate schedule is sampled at the CURRENT year index (seasoned — never restarted;
long-only uses the canonical trad-DI rates from the retired ediOnly.ts). All three
knobs (`unwindGainCharacter`, `lotSelectionHaircut`, `shortCoverGainPct`) live on the
plan and round-trip through CSV. Unwind gains are endogenous: netted WITH strategy
flows (harvest first, then CFs per §1211) and charged against taxSavings — proven by
test against a same-year D-012 event, which still shelters event-LAST.

#### D-018 — Exit framing when the end state is long-only (hold-to-step-up)
**Context:** After deleveraging to long-only, the realistic UHNW endgame is often hold
until basis step-up, not liquidate at horizon — the EDI-Only tab already models estate
step-up vs unwind vs optimal-partial-unwind, but nothing in the Workspace does. Today's
headline trio (D-003) assumes liquidation.
**Options:**
(a) **(Recommended)** Keep "Net If Liquidated" as the headline discipline; add a
co-equal "Net If Held to Step-Up" metric (with estate-assumption disclosure) whenever
cost basis / embedded gain is in play — migrating the EDI-Only tab's estate analysis
onto `core.ts` outputs (pairs with D-014a).
(b) Liquidation framing only. Simplest, but systematically understates the strategy
for exactly the clients who'd use it (concentrated/estate-minded).
(c) Make step-up the headline. Bigger number, but presents a mortality-contingent
outcome as the base case — fails the CPA bar.
**Recommendation:** (a) — both numbers shown, liquidation stays the conservative
anchor, step-up is disclosed upside.
**DECIDED:** (a) — co-equal "Net If Held to Step-Up" with estate disclosure.

#### Bugs / work items from this triage — no decision required

**Fix regardless (engine correctness):**
- `exitTax.ts:123` clamps `incrementalDeferredTax = max(0, exitTax − passiveExitTax)`,
  structurally discarding the CF-shelter advantage vs passive from "Net If Liquidated" —
  the EDI selling point. Remove the clamp; test both signs.
- With deleveraging: subtract Σ deleverage gains realized from `cumulativeBasisReduction`
  (`exitTax.ts:83`) so exited gains aren't taxed twice.

**Bundled with D-014 (architecture):**
- Netting/$3K/CF logic now exists THREE times (`helpers.calculateCarryforwards`,
  `computeEdiYear`, inline copy in `computeBaselineComparison`) plus two financing
  models and two embedded-gain methods — consolidate to one (extends decided bug #8).
- EDI-Only tab math gaps (hardcoded $3M income; PA rate in `combinedStRate`; WA excise
  not computed; NYC missing; no LT-CF input) — resolved by consuming `core.ts`, or
  patched if the tab is kept standalone.
- Align EDI-Only tab defaults with Workspace defaults.

**Bundled with D-015 (EDI-only display):**
- Meeting Mode shows QFAF copy ("ordinary loss deductions, NOL usage") with QFAF off —
  swap to mode-appropriate copy.
- Hide/repurpose noise metrics when `qfafEnabled:false`: "Income to Fully Utilize
  $3,000" chips, dead "NOL Generated $0" card.
- Excel / Meeting Mode export parity for EDI-only outputs.

**Bundled with D-016/D-017 (deleveraging build):**
- New `src/calculations/deleverage.ts`; unwind gains are endogenous strategy costs —
  net WITH strategy flows (current-year harvest first, then CFs per §1211) and charge
  against `taxSavings` (unlike D-012 gain events, which are event-LAST and never
  charged). No changes inside `calculateCarryforwards`; pass through existing args.
- Refactor `getEffectiveFinancingCost` → ratio-based
  `getFinancingCostForRatios(longLev, shortRatio)` with interpolation.
- ResultsTable conditional column group (Extension %, Deleverage Gain Realized, Tax on
  Unwind, Financing Saved) + Overview note + CSV/Excel — per the audit-complete table
  directive.
- Fixed-QFAF-mode oversized-QFAF warning during deleverage.

### D-019 — Projection extension semantics (carryforward-aware)
**Date:** 2026-06-12
**Context:** Owner asked why data stopped at 10 years with carryforward remaining.
D-013's extension watched only NOL; capital-loss CFs never extended, and
`projectionYears` had no UI control.
**Decision (ratified as built):** the projection auto-extends past the horizon while
losses are being *meaningfully consumed* — NOL usage, realized LT gains, or deleverage
unwinds burning capital CFs — capped at 40 years. Consumption of only the $3,000/yr
ordinary offset does NOT extend (a multi-million reserve would take centuries); the
reserve framing plus the new "Projection years" rail control (1–40, default 10 per
D-002) covers that case.
**Status: IMPLEMENTED (2026-06-12).**

### D-020 — CA NOL 20-year expiration: model fully
**Date:** 2026-06-12
**Context:** California NOLs expire 20 years after the loss year (extended by SB 167
suspension years when the NOL was unusable). With D-019 projections reaching year 40,
a CA client's state NOL tail can now outlive its usability — the one real state-level
expiry in scope. Options were warning-chip-only, full modeling, or document-and-skip.
**Decision (owner):** model it fully — track state NOL vintages in the engine, expire
the CA state component past its carryover period, and surface expired amounts.
**Implications:** per the audit-complete table directive, any new per-year output
(e.g., state NOL expired) must appear in ResultsTable both orientations + popup.
Federal NOL (indefinite, 80% limit) is unaffected.
**Status: IMPLEMENTED (2026-06-12)** — state NOL vintage ledger in `core.ts` (mirrored
in `sensitivity.ts`), gated on a new `nolCarryoverYears` state-profile field (CA = 20;
undefined = indefinite, so non-CA behavior is bit-identical). Vintages are consumed
FIFO on NOL usage and expire at the end of year `yearCreated + 20` (+1 per SB 167
suspension year: a year-1 vintage suspended under the existing MAGI ≥ $1M check gets
21). Pre-existing NOL is vintage year 0 with carryover 20 + 3 (modeling assumption: a
pre-2024 loss whose use was suspended for all three SB 167 years). Only the STATE rate
component of `nolUsageBenefit` is capped at the unexpired pool; federal NOL math,
`nolCarryforward`, §461(l), and the 80% limit are untouched. New per-year
`stateNolExpired` + `summary.totalStateNolExpired`, surfaced in ResultsTable (both
orientations, NOL group, dash when 0), `col-state-nol-expired` popup, a Workspace
Overview warning note, and the Excel year-by-year sheet. Eight regression tests added
(`stateNolExpiry.test.ts`): non-CA bit-identical baselines (NY/PA), CA fully-used
no-op, vintage-0 expiry at year 23, FIFO ordering, SB 167 +1 timing, D-019
stall-guard/40-cap interaction, sensitivity mirror; suite at 360.

### D-021 — Export parity for EDI metrics: close now
**Date:** 2026-06-12
**Context:** Loss Reserve, Protection Ratio, Break-Even Gain Event, and Net If Held to
Step-Up exist in Workspace + Meeting Mode but not in the Excel export or the printed
one-pager (flagged during the D-015 build).
**Decision (owner):** close the gap now — advisors should not hand clients a sheet
missing the headline EDI numbers. Contingent values stay labeled contingent in every
export surface.
**Status: IMPLEMENTED (2026-06-12)** — Excel Summary sheet gains three blocks computed
inside `excelExport.ts` via `computeEdiInsights`/`computeStepUpComparison` from the
`CalculationResult` + `ExitTaxAnalysis` it now receives (`exitAnalysis` wired from
WorkspaceTab and, via a new `ResultsChartsSection` prop, the Classic tab): Loss Reserve
Built (final ST/LT CFs + shelter value, header reads "contingent on future gains, NOT
added to savings"), EDI Economics (Protection Ratio prints "—" when no financing cost
was modeled, Break-Even Gain Event, Cumulative Financing Cost), and Step-Up Comparison
(Net If Held to Step-Up, Net If Liquidated, SIGNED Step-Up Advantage, Carryforward
Value Lost at Death). Meeting Mode page 1 (screen + printed handout) gains a compact
step-up co-metric strip in BOTH modes — net-if-held vs net-if-liquidated with the IRC
§1014 / CFs-lost-at-death disclosure line, plus the protection ratio in EDI mode when
financing fees are on; the EDI hero/KPI cards already carried realized savings and the
contingent-labeled loss reserve. Print pagination re-verified at exactly 3 sheets via
headless-Chromium PDF render in QFAF, EDI, and EDI+fees scenarios. Tests: 10 added
(`excelExportEdi.test.ts` parses the workbook back, incl. "—" ratio and negative
signed advantage; `MeetingMode.test.tsx` asserts the new handout text both modes);
suite at 370.

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
13. ~~**Loss reserve overvalued for PA/NJ residents**~~ **FIXED 2026-06-12** —
    `lossReserveShelterValue` included the state gains-rate component for all states,
    but PA/NJ give individuals NO loss carryforwards: unused losses effectively expire
    each state tax year, so an end-of-horizon CF balance has zero state shelter value
    there. Both engines now zero the state component when
    `allowsLossOffsetAgainstIncome` is false; valued federal-only (incl. NIIT).
    Surfaced while answering the owner's "do losses expire?" question — the popup now
    states the expiration facts (federal CFs/post-2017 NOLs never expire during life;
    lost at death per the step-up card; PA/NJ state-level immediate expiry).

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
