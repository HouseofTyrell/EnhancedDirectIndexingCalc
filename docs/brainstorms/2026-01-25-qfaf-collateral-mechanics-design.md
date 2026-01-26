# QFAF + Collateral Investment Mechanics

**Date**: 2026-01-25
**Status**: Validated through brainstorming session

## Overview

This document captures the complete mechanics of combining QFAF (hedge fund) with Collateral accounts (Core/Overlay SMAs) for tax-optimized investing.

## Product Structures

### QFAF (Hedge Fund)
| Attribute | Value |
|-----------|-------|
| Structure | K-1 Partnership (pass-through) |
| Leverage | 250/250 (500% gross exposure) |
| ST Capital Gains | **150% of MV per year** |
| Ordinary Losses | **150% of MV per year** |
| Leverage Lock | Fixed - cannot be changed |

### Collateral Accounts (SMA - investor owns securities directly)

**Core (Cash Funded)**
| Strategy | Long/Short | Gross | ST Loss | LT Gain | Tracking Error |
|----------|------------|-------|---------|---------|----------------|
| Core 130/30 | 130%/30% | 160% | -10.0% | 2.4% | 1.3-1.5% |
| Core 145/45 | 145%/45% | 190% | -13.0% | 2.9% | 1.8-2.0% |
| Core 175/75 | 175%/75% | 250% | -19.0% | 3.8% | 2.5-3.0% |
| Core 225/125 | 225%/125% | 350% | -29.0% | 5.3% | 4.0-4.5% |

**Overlay (Appreciated Stock as Collateral)**
| Strategy | Long/Short | Gross | ST Loss | LT Gain | Tracking Error |
|----------|------------|-------|---------|---------|----------------|
| Overlay 30/30 | 30%/30% | 60% | -6.0% | 0.9% | 1.0% |
| Overlay 45/45 | 45%/45% | 90% | -9.0% | 1.4% | 1.5% |
| Overlay 75/75 | 75%/75% | 150% | -15.0% | 2.3% | 2.5% |
| Overlay 125/125 | 125%/125% | 250% | -25.0% | 3.8% | 4.2% |

*Note: These are average annual rates, relatively stable over time.*

## ST Loss Generation Sources (Collateral)

Both sources contribute to ST losses:
1. **Short leg of the long/short extension** - closing short positions at gains/losses
2. **Tax-loss harvesting on long positions** - selling losers, replacing with similar securities

Short positions follow standard holding period rules (ST if held < 1 year, LT if > 1 year).

## Tax Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      INVESTOR TAX RETURN                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  QFAF (K-1)                   Collateral SMA                        │
│  ┌────────────────┐           ┌─────────────────────────────┐       │
│  │                │           │                             │       │
│  │ ST Gains ──────┼──────────►│ ST Losses (must match       │       │
│  │ (150% of MV)   │           │ annually or taxed at full   │       │
│  │                │           │ ordinary rate ~40.8%)       │       │
│  │                │           │                             │       │
│  │ Ordinary       │           │ LT Gains                    │       │
│  │ Losses ────────┼──┐        │ (taxed at 23.8%)            │       │
│  │ (150% of MV)   │  │        └─────────────────────────────┘       │
│  └────────────────┘  │                                              │
│                      │                                              │
│                      ▼                                              │
│              ┌───────────────────┐                                  │
│              │ W-2 / Ordinary    │                                  │
│              │ Income Offset     │                                  │
│              │                   │                                  │
│              │ CAPPED by §461(l) │                                  │
│              │ 2026: $512K MFJ   │                                  │
│              │       $256K Single│                                  │
│              │                   │                                  │
│              │ Excess → NOL      │                                  │
│              │ Carryforward      │                                  │
│              └───────────────────┘                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## QFAF Sizing Math

**Key constraint**: QFAF ST gains must be matched by Collateral ST losses annually.

**Formula**:
```
Max QFAF = (Collateral Amount × ST Loss Rate) / 150%
```

**QFAF Capacity per $1M Collateral**:

| Collateral Strategy | ST Loss Rate | Max QFAF per $1M |
|---------------------|--------------|------------------|
| Core 130/30 | 10% | $67K |
| Core 145/45 | 13% | $87K |
| Core 175/75 | 19% | $127K |
| Core 225/125 | 29% | $193K |
| Overlay 30/30 | 6% | $40K |
| Overlay 45/45 | 9% | $60K |
| Overlay 75/75 | 15% | $100K |
| Overlay 125/125 | 25% | $167K |

**Inverse (Collateral needed per $1M QFAF)**:

| Collateral Strategy | ST Loss Rate | Collateral per $1M QFAF |
|---------------------|--------------|-------------------------|
| Core 130/30 | 10% | $15.0M |
| Core 145/45 | 13% | $11.5M |
| Core 175/75 | 19% | $7.9M |
| Core 225/125 | 29% | $5.2M |
| Overlay 30/30 | 6% | $25.0M |
| Overlay 45/45 | 9% | $16.7M |
| Overlay 75/75 | 15% | $10.0M |
| Overlay 125/125 | 25% | $6.0M |

## Tax Alpha Calculation

### Annual Tax Alpha Components

1. **ST → LT Rate Conversion** (from matching ST gains with ST losses)
   ```
   = Min(QFAF_ST_Gains, Collateral_ST_Losses) × (ST_Rate - LT_Rate)
   = Matched_Amount × 17%  (at top bracket: 40.8% - 23.8%)
   ```

2. **Ordinary Loss Benefit** (from QFAF ordinary losses)
   ```
   = Min(QFAF_Ordinary_Losses, §461(l)_Limit) × Ordinary_Rate
   = Min(Losses, $512K_MFJ) × ~40.8%
   ```

3. **LT Gain Cost** (from Collateral LT gains)
   ```
   = Collateral_LT_Gains × LT_Rate
   = Collateral × LT_Gain_Rate × 23.8%
   ```

4. **Unmatched ST Gains Tax** (if QFAF oversized)
   ```
   = Max(0, QFAF_ST_Gains - Collateral_ST_Losses) × ST_Rate
   ```

### Net Annual Tax Alpha
```
Tax_Alpha = ST_LT_Conversion_Benefit
          + Ordinary_Loss_Benefit
          - LT_Gain_Cost
          - Unmatched_ST_Gains_Tax
```

## §461(l) Excess Business Loss Limitation

| Filing Status | 2025 | 2026 |
|---------------|------|------|
| Single/MFS | $313,000 | $256,000 |
| MFJ | $626,000 | $512,000 |

- Excess ordinary losses beyond limit become **NOL carryforward**
- NOL can offset **80% of taxable income** in future years
- Important for clients with large QFAF positions

## Example: $10M Core 145/45 + Optimal QFAF

**Setup**:
- Collateral: $10M in Core 145/45
- Max QFAF: $10M × 13% / 150% = **$867K**

**Annual Tax Events**:
| Item | Amount | Tax Impact |
|------|--------|------------|
| QFAF ST Gains | $867K × 150% = $1.30M | Offset by collateral |
| Collateral ST Losses | $10M × 13% = $1.30M | Offsets QFAF ST gains |
| QFAF Ordinary Losses | $867K × 150% = $1.30M | $512K usable (MFJ) |
| Collateral LT Gains | $10M × 2.9% = $290K | Taxed at 23.8% |

**Tax Alpha Calculation (MFJ, top bracket)**:
| Component | Calculation | Value |
|-----------|-------------|-------|
| ST→LT Conversion | $1.30M × 17% | +$221K |
| Ordinary Loss Benefit | $512K × 40.8% | +$209K |
| LT Gain Cost | $290K × 23.8% | -$69K |
| **Net Tax Alpha** | | **+$361K** |

**Tax Alpha as % of Total Investment ($10.87M)**: **3.3%/year**

## Calculator Requirements

### Primary Inputs
1. **Collateral Type**: Core vs Overlay (dropdown)
2. **Collateral Strategy**: Leverage level (130/30, 145/45, etc.)
3. **Collateral Amount**: Dollar value
4. **Filing Status**: Single, MFJ, MFS, HOH
5. **Annual Income**: For tax bracket determination
6. **State**: For state tax rate

### Auto-Calculated Outputs
1. **Max QFAF Size**: Based on ST loss offset capacity
2. **Total Exposure**: Collateral + QFAF
3. **Effective QFAF Ratio**: QFAF / Collateral

### Annual Projections
1. ST Gains (QFAF)
2. ST Losses (Collateral)
3. Ordinary Losses (QFAF) - split: usable vs NOL carryforward
4. LT Gains (Collateral)
5. Federal Tax
6. State Tax
7. Tax Savings vs Baseline
8. Cumulative NOL Carryforward

### Advanced Options
- Override QFAF size (show warning if exceeds max offset)
- Custom tax rates
- Existing loss carryforwards (ST, LT, NOL)

## Research Sources

- [Quantinno Solutions](https://www.quantinno.com/solutions)
- [Quantinno Risk Management](https://www.quantinno.com/insights/a-common-sense-approach-to-risk-management)
- [AQR 130/30 and 150/50 Research](https://www.aqr.com/Insights/Research/Tax-Aware-Investing/Improving-Direct-Indexing-13030-and-15050-Strategies)
- [IRS 2026 Inflation Adjustments](https://www.currentfederaltaxdevelopments.com/blog/2025/10/9/2026-inflation-adjustments-for-tax-professionals-revenue-procedure-2025-32-analysis)
- Quantinno Beta 1 Strategies (internal data)
