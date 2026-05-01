# RFP Analyzer

A web app for comparing industrial lease proposals on a Net Effective Rent
(NER) basis. Built as a side-by-side replacement for the Excel workbook in
`RFP_Analysis_Spec.md`, with the bugs fixed and N-scenario support.

100% client-side: no backend, no database, no analytics. Inputs persist in
each user's browser `localStorage`.

## Live URL

> **TODO:** paste the Vercel URL here after the first deploy.

Coworkers bookmark the URL — nothing to install. Each user's data lives
only in their own browser.

## Deploy (Vercel, one-time setup)

1. Go to https://vercel.com/new
2. Sign in with GitHub
3. Import `aanfinson00/lease-calculator`
4. Click **Deploy** (no config needed — Next.js is auto-detected)

Subsequent deploys are automatic: every push to `main` ships to production
in ~60 seconds. Every push to a feature branch gets its own preview URL.

## Develop locally

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
```

## Offline distribution (fallback)

The static export build also produces a self-contained folder you can ZIP
and email. Useful if Vercel is ever unavailable or you need to share with
someone outside the firm.

```bash
npm run package      # builds → out/ → rfp-analyzer.zip
```

Recipients unzip and double-click `start.bat` (Windows) or
`start.command` (Mac). See `scripts/README-DIST.md` for caveats — note
that locked-down corporate Windows machines may block the launcher
scripts, in which case the Vercel URL is the easier path.

## Spec

The original Excel workbook spec lives in `RFP_Analysis_Spec.md`. The calc
engine in `lib/calc.ts` rebuilds those formulas with the §10 bugs fixed
(UW/Proposal symmetry, free-rent valuation, single discount rate variable,
dynamic shell cost).
