# Tax Optimization Calculator

A React-based financial calculator for high-net-worth individuals to model tax optimization strategies using direct indexing with Quantified Alternative Funds (QFAF).

## Overview

This calculator helps financial advisors and qualified purchasers evaluate the tax benefits of pairing direct indexing strategies with QFAF investments. It models:

- **Direct Indexing Strategies**: Core (cash-funded) and Overlay (appreciated stock collateral) approaches with varying leverage ratios
- **QFAF Tax Mechanics**: 150% short-term gains offset by 150% ordinary losses
- **Multi-Year Projections**: 10-year wealth and tax savings forecasts
- **Advanced Tax Rules**: Section 461(l) limits, NOL carryforwards, capital loss limitations per IRC §1211(b)

## Features

- **Strategy Comparison**: Compare 8 different direct indexing strategies (4 Core, 4 Overlay)
- **Auto-Sizing**: QFAF position automatically sized to offset collateral's short-term losses
- **State Tax Support**: All 50 states + DC with 2026 tax rates
- **Filing Status**: Single, Married Filing Jointly, Married Filing Separately, Head of Household
- **Advanced Mode**: Year-by-year planning, sensitivity analysis, scenario modeling
- **Interactive Charts**: Wealth accumulation and tax savings visualizations

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd EnhancedDirectIndexingCalc

# Install dependencies
npm install
```

### Environment Variables

No environment variables are required for local development or production builds. All configuration is embedded in TypeScript source files.

### Development

```bash
# Start development server (hot reload enabled)
npm run dev

# The app will be available at http://localhost:5173
```

### Build

```bash
# Type-check and build for production
npm run build

# Preview the production build
npm run preview
```

The build outputs a single HTML file (via `vite-plugin-singlefile`) for easy distribution. `TaxOptimizationCalculator.html` in the repo root is a pre-built distribution copy for offline sharing.

### Testing

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run
```

## Project Structure

```
src/
├── Calculator.tsx          # Main calculator component
├── ResultsTable.tsx        # Year-by-year results display
├── WealthChart.tsx         # Portfolio growth visualization
├── InfoPopup.tsx           # Field-level help popups
├── calculations.ts         # Core tax calculation engine
├── calculations.test.ts    # Calculation tests
├── types.ts                # TypeScript interfaces
├── taxData.ts              # Federal/state tax rates (2026)
├── strategyData.ts         # Strategy definitions and constants
├── popupContent.ts         # UI help content
├── index.css               # Styles
├── main.tsx                # App entry point
├── hooks/
│   ├── useAdvancedMode.ts      # Advanced mode state management
│   ├── useQualifiedPurchaser.ts # QP verification modal
│   └── useScrollHeader.ts       # Sticky header behavior
├── components/
│   ├── AdvancedModal.tsx       # Advanced mode container
│   ├── QualifiedPurchaserModal.tsx # QP verification
│   ├── ResultsSummary.tsx      # Summary statistics
│   ├── StickyHeader.tsx        # Scroll-aware header
│   └── Icons.tsx               # SVG icon components
├── AdvancedMode/
│   ├── AdvancedModeToggle.tsx  # Mode switch control
│   ├── SettingsPanel.tsx       # Advanced settings
│   ├── StrategyComparison.tsx  # Compare all strategies
│   ├── StrategyRateEditor.tsx  # Custom rate overrides
│   ├── SensitivityAnalysis.tsx # Parameter sensitivity
│   ├── ScenarioAnalysis.tsx    # Bull/Base/Bear scenarios
│   ├── YearByYearPlanning.tsx  # Annual income overrides
│   └── CollapsibleSection.tsx  # Accordion UI component
└── utils/
    ├── formatters.ts           # Number formatting utilities
    └── strategyRates.ts        # Rate override management
```

## Investment Strategies

### Core Strategies (Cash-Funded)

| Strategy | Leverage | ST Loss Rate | LT Gain Rate | Tracking Error |
|----------|----------|--------------|--------------|----------------|
| Core 130/30 | 1.3x | 10% | 2.4% | 1.3-1.5% |
| Core 145/45 | 1.45x | 13% | 2.9% | 1.8-2.0% |
| Core 175/75 | 1.75x | 19% | 3.8% | 2.5-3.0% |
| Core 225/125 | 2.25x | 29% | 5.3% | 4.0-4.5% |

### Overlay Strategies (Appreciated Stock Collateral)

| Strategy | Leverage | ST Loss Rate | LT Gain Rate | Tracking Error |
|----------|----------|--------------|--------------|----------------|
| Overlay 30/30 | 0.3x | 6% | 0.9% | 1.0% |
| Overlay 45/45 | 0.45x | 9% | 1.4% | 1.5% |
| Overlay 75/75 | 0.75x | 15% | 2.3% | 2.5% |
| Overlay 125/125 | 1.25x | 25% | 3.8% | 4.2% |

## Tax Rules Implemented

- **Section 461(l)**: Excess business loss limitations ($256K single / $512K MFJ for 2026)
- **IRC §1211(b)**: Capital loss deduction limits ($3,000 / $1,500 for MFS)
- **NOL Carryforwards**: 80% taxable income offset limitation
- **NIIT**: 3.8% Net Investment Income Tax
- **Tax-Loss Harvesting Decay**: 7% annual decay with 30% floor

## Tech Stack

- **React 19** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 7** - Build tool
- **Recharts 3** - Data visualization
- **Vitest 4** - Testing framework

## Configuration

The calculator uses sensible defaults that can be adjusted in Advanced Mode:

| Setting | Default | Description |
|---------|---------|-------------|
| Annual Return | 7% | Expected market return |
| Projection Years | 10 | Forecast horizon |
| QFAF Multiplier | 1.50x | ST gain and ordinary loss rates |
| NOL Offset Limit | 80% | Maximum taxable income offset |

## License

Private - All rights reserved.

## Contributing

This is a private project. Please contact the maintainers for contribution guidelines.
