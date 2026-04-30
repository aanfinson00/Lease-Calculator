# RFP Analyzer

A web app for comparing industrial lease proposals on a Net Effective Rent
(NER) basis. Built as a side-by-side replacement for the Excel workbook in
`RFP_Analysis_Spec.md`, with the bugs fixed and N-scenario support.

100% client-side: no backend, no database, no analytics. Inputs persist to
the browser's `localStorage`.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 60+ unit tests (Vitest)
npm run test:run     # one-shot test run
```

Code layout:
```
app/        Next.js App Router — layout, page, globals.css
components/ React components (ui/ = shadcn-style primitives)
lib/        types.ts, calc.ts, solver.ts, store.ts, format.ts, utils.ts
scripts/    distribution launcher scripts (Mac + Windows)
```

## Distribute (the offline ZIP for coworkers)

```bash
npm run package
```

This produces **`rfp-analyzer.zip`** (~1MB). Email it to a coworker; they
unzip and double-click `start.command` (Mac) or `start.bat` (Windows). The
app runs entirely in their browser — no internet, no central URL, no risk
of leaking deal data.

The ZIP contents:
```
rfp-analyzer/
├── start.command       Mac launcher (double-click)
├── start.bat           Windows launcher (double-click)
├── README.md           User-facing instructions
├── index.html          Static export
└── _next/, *.svg, ...  bundled JS/CSS/assets
```

## Deploy (Vercel)

Static export is on by default (`output: "export"` in `next.config.ts`).
Vercel will pick this up automatically. To deploy a normal Vercel app
instead, remove `output: "export"` from `next.config.ts` first.

## Spec

The original Excel workbook spec lives in `RFP_Analysis_Spec.md`. The
calc engine in `lib/calc.ts` rebuilds those formulas with the bugs called
out in §10 fixed (UW/Proposal symmetry, free-rent valuation, single
discount-rate variable, dynamic shell cost).
