# RFP Analysis Workbook — Functional Spec

**Purpose:** Compare a tenant's lease proposal against the underwritten (UW) assumptions for an industrial deal, side-by-side. The headline output is **Net Effective Rent (NER) PSF** (annualized, undiscounted and discounted) plus **Yield on Cost**. This spec describes how the existing Excel model calculates everything so it can be rebuilt as an HTML app.

---

## 1. Sheets at a glance

| Sheet | Role |
|---|---|
| `underwriting comparison` | Old/legacy comparison from a 2013 deal. Reference only — **not the calc engine.** |
| `lease analysis - 3-year` | Standalone single-tenant lease cash flow tool. **Not used by Summary Analysis.** |
| `lease analysis - 12-year` | Same as above for longer terms. **Not used by Summary Analysis.** |
| **`Summary Analysis`** | **The actual RFP comparison engine. Build the HTML app from this sheet.** |

The two `lease analysis` sheets are precursor calculators that were collapsed into the Summary Analysis logic. You don't need to port them — Summary Analysis re-implements that math inline.

---

## 2. Mental model

A lease has three economic forces that pull against each other:

1. **Base rent** — what the tenant pays each month, escalating over time.
2. **Concessions** — free rent and TI (tenant improvement) allowance the landlord gives to win the deal.
3. **Costs to land the deal** — leasing commissions paid to brokers.

**NER** smushes all three into one number: the average annual rent PSF the landlord *actually* nets after concessions and LC are spread across the term. That's why NER is the apples-to-apples metric for comparing two deals with different rates / free rent / TI / term.

The workbook computes NER two ways:
- **Undiscounted** — straight average over the term.
- **Discounted** — present-valued using a discount rate, then annualized. This penalizes deals that backload rent or front-load concessions.

---

## 3. Inputs (the assumption block)

All inputs live in `Summary Analysis` columns C (Underwriting / "Latest Reval") and D (Proposal). Both sides take the same inputs so they're comparable.

| Field | Cell (UW / Prop) | Type | Notes |
|---|---|---|---|
| Project SF | C5 / D5 | int | Total project square footage |
| Building SF | C6 / D6 | int | Building square footage (often = Project SF) |
| Proposed Lease SF | C7 / D7 | int | What the tenant is leasing |
| Base Rate PSF Yr 1 | C11 / D11 | $ | Year-1 annual rent PSF |
| Annual Escalations | C16 / D16 | % | E.g. 0.03 = 3% bumps |
| TI Allowance PSF | C17 / D17 | $ | Landlord's TI contribution PSF |
| Leasing Commissions PSF | C20 / D20 | $ | **Calculated, not entered** — see §6 |
| Free Rent | C22 / D22 | months | Free rent period |
| Lease Term | C23 / D23 | months | Total months of the lease (incl. free rent? See §10) |
| Lease Commencement | C24 / D24 | date | Used for the discounted CF date axis |
| LC % | H25 / L25 | % | Leasing commission rate (default 9%) |
| Discount Rate | L29 | % | Used for present value (default 8%, monthly compounded) |

A few fields (Lease as % of Building, Remaining Vacancy, Yield on Cost, etc.) are **derived outputs** — see §7.

---

## 4. The annual rent schedule (the heart of the model)

For each side, the model builds a year-by-year rent table.

**UW side** lives in cols G/H/I, rows 5–22:
- `H5 = 0` (free rent rate is zero)
- `H6 = C11` (Year 1 = the input base rate)
- `H7 = H6 * (1 + C16) * I7/12` and so on for years 2–10

**Proposal side** is the mirror in cols K/L/M, rows 5–22 (uses D11 / D16 instead).

### How the escalation formula works

```
H7 = H6 * (1 + C16) * I7 / 12
     ▲    ▲           ▲
     |    |           └── # of months active in this year (usually 12)
     |    └── escalation factor (e.g. 1.03 for 3% bumps)
     └── prior year's annual rate PSF
```

The `I7/12` factor lets a year be partial. If a lease is 130 months, year 11 will only have 10 months → `I16 = 10`, so that row's annual amount is scaled down to 10/12 of a full year.

### How months are allocated to each year (the I/M column)

```
I6 = MIN(LeaseTerm - SUM(months already used), 12)
```

This greedily fills 12 months per year until the term runs out. Free rent (I5) is filled first, then year 1, year 2, etc.

> ⚠️ **Quirk #1:** On the UW side, this formula chain stops at row I15 (Year 10). On the Proposal side it goes through M22 (Year 17). If a UW lease term > ~120 months + free rent, the UW side under-counts rent. Fix this in the rebuild — both sides should support up to 17+ years.

### Average rate (used for Yield on Cost)

```
H23 = SUMPRODUCT(H5:H15, I5:I15) / SUM(I5:I15)
```

That's a weighted average of the annual rates, weighted by months. It's the average $ PSF/year over the entire term, including free-rent months at $0.

---

## 5. Free rent

Stored as a count of months (C22 / D22). It's applied at the **front of the lease**:
- Row 5 (Free Rent row) gets the free-rent month count.
- The base-rate cell for that row is forced to 0 (rent-free).

In the NER cash-flow calc, free rent is expressed as a negative dollar amount so it offsets base rent:

```
I34 (UW Free Rent PSF) = -(H6 / 12) * I5
                       = -(Year-1 monthly rate) × (free-rent months)
```

This treats free rent as forgone Year-1 rent. That's a simplification — see §10 quirk on this.

---

## 6. Leasing Commission calculator ⭐

LC is calculated, not entered. Formula:

```
H24 (UW LC PSF)  = H25 * SUM(H11:H22) / 2 + H25 * SUM(H5:H10)
L24 (Prop LC PSF) = L25 * SUM(L11:L22) / 2 + L25 * SUM(L6:L10)
```

Translated:
- **Years 1–5 (rows 5–10):** full LC % on rent paid.
- **Years 6+ (rows 11–22):** half LC % on rent paid.

This is the standard "9%/4.5%" tiered industrial commission structure. LC% defaults to 9% (H25/L25).

> ⚠️ **Quirk #2 (asymmetry):** UW formula uses `SUM(H5:H10)` (which includes the H5 free-rent row at $0) but Proposal uses `SUM(L6:L10)` (skips L5). Functionally they're equivalent because H5/L5 are both $0, but it's inconsistent. Pick one convention in the rebuild.

> 💡 **Why split-tier?** Brokers earn full commission on the early, "won" portion of the lease and a reduced rate on the later years that are essentially renewal-equivalent risk. Common practice in industrial.

---

## 7. Derived outputs (the key comparison metrics)

| Metric | Formula | Why it matters |
|---|---|---|
| **Monthly Rate PSF** | `C11/12` | Sanity check on quoted rate |
| **Average Rate over Term** | `H23` (UW) / `L23` (Prop) | Weighted-average annual rent |
| **Building Cost PSF** | UW: `C20 + 140` (140 hardcoded as base building cost). Prop: `C21 + (D17-C17) + (D20-C20)` | Total all-in basis: building shell + TI + LC |
| **Yield on Cost (Yr 1)** | `Yr1 Rate / Building Cost PSF` | Going-in unlevered yield |
| **Yield on Cost (Term)** | `Avg Rate / Building Cost PSF` | Yield averaged across term |
| **Undiscounted Annual NER** | See §8 | Headline NER metric |
| **Discounted Annual NER** | See §9 | NPV-based NER (proposal side only currently) |

> ⚠️ **Quirk #3:** That `+ 140` hardcode in C21 is a building shell cost PSF. It needs to become an input. The Proposal side derives its building cost as a *delta* from UW (different TI / different LC), which is clever — but if the rebuild lets users change the base building cost it should propagate to both sides.

---

## 8. Undiscounted NER calculation

For each side, sum these PSF values, then annualize:

```
Net Cash Flow PSF = Base Rent          [SUM of annual rents over term]
                  + Amortized TI Rent  [usually 0 — see §10]
                  + Free Rent          [-(Yr1 monthly rate × free rent months)]
                  + Nonrec OPEX        [usually 0 — see §10]
                  + Base TI            [-TI Allowance PSF]
                  + Additional TI      [usually 0]
                  + Landlord Work      [usually 0]
                  + Lease Commissions  [-LC PSF from §6]

Undiscounted Annual NER = Net Cash Flow PSF / Lease Term Months × 12
```

UW lives in I32:I41, Proposal lives in M32:M41.

**Worked example using the file's current values (Proposal):**
- Base Rent: 99.996
- Free Rent: -4.000  *(= -(8/12) × 6 = -$4)*
- Base TI: -10
- LC: -6.450
- **Net CF PSF: 79.546**
- **NER = 79.546 / 130 × 12 = $7.34 PSF/yr**

---

## 9. Discounted NER (and the monthly grid)

Only the Proposal side currently has this. The UW side displays "--" because it doesn't have a monthly cash flow grid built out.

### The monthly grid (cols Q through IT, rows 32–50)

This is a horizontal monthly cash-flow projection up to 238 months (~20 years). Each column is one month.

| Row | What it holds | Formula |
|---|---|---|
| 32 | Month number (1, 2, 3, …) | `=prev+1` |
| 33 | Calendar date | `=EDATE(prior_month, 1)`, starting from D24 |
| 35 | Base Rent (monthly PSF) | `=IF(month > term, 0, INDEX(annual_schedule, INT((month-1)/12)+1) / 12)` — looks up the right year's annual rate, divides by 12 |
| 36 | Amortized TI Rent | 0 (placeholder) |
| 37 | Free Rent | `=IF(month <= free_rent, -base_rent_that_month, 0)` |
| 38 | Rental Revenue | `=Q35 + Q36 + Q37` |
| 40 | Nonrecoverable OPEX | 0 (broken — see §10) |
| 41 | Net Income | `=Q38 + Q40` |
| 43 | Base TI | `-TI Allowance` in month 1 only |
| 44 | Additional TI | 0 |
| 45 | Landlord Work | 0 |
| 46 | Total TI + LLW | `=Q43+Q44+Q45` |
| 48 | Lease Commissions | `-LC PSF` in month 1 only |
| 50 | Net Cash Flow | `=Q41 + Q46 + Q48` |

### NPV calculation (cells M44–M53)

```
PV Base Rent (M44) = NPV(L29/12, R35:IT35) + Q35
```

- `L29/12` = monthly discount rate (annual rate ÷ 12, so monthly compounding)
- `Q35` is added back outside the NPV because Excel's `NPV()` assumes the first cash flow happens at end of period 1 — but the lease commencement IS period 1, so we want it discounted by 0 months, not 1. (This is a classic Excel-NPV gotcha.)

The same pattern repeats for each cash flow component (M44–M51), then they're summed:

```
PV Net Cash Flow (M52)         = SUM(M44:M51)
Discounted Annual NER (M53)    = M52 / Lease Term × 12
```

> ⚠️ **Quirk #4:** Several PV rows reference `$D$8` as the discount rate (e.g., M47, M48, M49, M50, M51) instead of `$L$29`. That's a bug — D8 is "Lease as % of Building" (=1.0 in this case), so the discount rate is effectively 100% for those line items. Only Base Rent (M44) and Free Rent (M46) correctly use L29. **Fix in the rebuild: one consistent discount rate input, applied everywhere.**

---

## 10. Known issues / things to clean up in the rebuild

| # | Issue | Where | Recommended fix |
|---|---|---|---|
| 1 | UW annual schedule only goes to Year 10; Proposal goes to Year 17 | Rows 6–22 | Build both sides with same horizon (say, 20 years) |
| 2 | LC formula uses `H5:H10` on UW but `L6:L10` on Proposal | H24 / L24 | Pick one — exclude the free-rent row |
| 3 | Building cost PSF hardcodes `+140` shell cost | C21 | Make shell cost an input |
| 4 | PV formulas reference `$D$8` instead of `$L$29` for discount rate | M47–M51 | Use one named discount rate everywhere |
| 5 | Nonrecoverable OPEX row references `$F$62` which doesn't exist; checks `$D$22="NNN"` but D22 holds free-rent months, not lease type | Q40:IT40 | Add a lease-type input (NNN/Modified Gross/Gross) and an OPEX PSF input |
| 6 | LC monthly cells (R48:IT48) use `VLOOKUP(month, $P$41:$Q$52, ...)` — but P41:Q52 has labels and totals, not a lookup table | R48 onward | Either remove (LC is paid upfront, all in month 1) or build a real LC payment-schedule table |
| 7 | Title cell `B2 = #REF! & " RFP Analysis"` | B2 | Replace with a property-name input |
| 8 | Lease term `I23` sums `I5:I15` only (free rent + 10 years) | I23 | Sum across full schedule |
| 9 | UW side has no discounted NER (no monthly grid) | — | Build symmetric grids for both sides |
| 10 | Free rent simplification: NER calc uses `Yr1 monthly rate × free months`, but if free rent spans into Year 2 the rate would technically step up. Minor unless free rent > 12. | I34 / M34 | Sum the actual free-rent months from the monthly grid instead |

---

## 11. Suggested HTML app structure

### Layout
- **Top bar:** Property name, date, scenario name (replaces the broken B2 cell).
- **Left column (Inputs panel):** Two-column form, UW vs. Proposal side-by-side. Each row is one input from §3. Use a clear visual separator so users see they're entering the same field on both sides.
- **Right column (Results panel):**
  - Headline metrics card: NER (undiscounted + discounted), Yield on Cost (Yr 1 + Term), Building Cost PSF — UW | Prop | Δ.
  - Annual rent schedule table (collapsible).
  - NER waterfall (Base Rent → Free Rent → TI → LC → Net CF), one for UW and one for Proposal, side-by-side.
  - Monthly cash flow grid (collapsible / virtualized — could be 240 columns).

### State / data model
Single state object with two scenarios:
```js
{
  property: { name, leaseCommencement },
  globals: { discountRate, lcPercent, shellCostPSF },
  scenarios: {
    underwriting: { baseRatePSF, escalation, tiAllowance, freeRent, leaseTerm, ... },
    proposal:     { baseRatePSF, escalation, tiAllowance, freeRent, leaseTerm, ... }
  }
}
```

### Calculation pipeline
For each scenario, run the same pipeline (this mirrors how the workbook is structured but cleanly):

1. **Build annual rent schedule** — array of `{ year, monthlyRate, annualPSF, monthsActive }` over the term.
2. **Calc LC PSF** using §6 split-tier formula.
3. **Build undiscounted NER** components (§8) → sum → annualize.
4. **Build monthly cash flow grid** (§9 row definitions).
5. **Calc PV of each component** at monthly compounding → sum → annualize → discounted NER.
6. **Calc derived metrics:** building cost PSF, yield on cost, average rate.

Both scenarios feed a single comparison view that shows Δ (proposal − UW) for every metric.

### Why a fresh HTML build makes sense (vs. fixing the Excel)
- The Excel has accumulated reference bugs (#10) that touch the discount math.
- It only handles one scenario pair at a time. A web app could let you save/load scenarios and compare more than two.
- The monthly grid lives in 238 columns of a spreadsheet, which is unwieldy. JS arrays handle this naturally.

---

## 12. Validation targets (numbers your rebuild should match)

Using the file's current Proposal inputs (300k SF, $8 PSF Yr1, 4% escalations, 10 PSF TI, 6 mo free, 130 mo term, 9% LC, 8% discount):

| Metric | Expected value |
|---|---|
| Avg Rate over Term | $9.00 PSF (≈ 8.99) |
| LC PSF | $6.45 |
| Building Cost PSF | $150.01 |
| Yield on Cost (Yr 1) | 6.24% |
| Yield on Cost (Term) | 6.95% |
| Undiscounted Annual NER | $7.34 PSF |
| Discounted Annual NER | $4.10 PSF *(but see Quirk #4 — this number is partly wrong because of the D8 bug; a clean rebuild will produce a different, correct number)* |

For UW (300k SF, $7 PSF, 3% esc, 5 PSF TI, 4 mo free, 125 mo term):

| Metric | Expected value |
|---|---|
| Avg Rate over Term | $9.11 PSF |
| LC PSF | $6.25 |
| Building Cost PSF | $146.25 |
| Yield on Cost (Yr 1) | 5.79% |
| Yield on Cost (Term) | 6.37% |
| Undiscounted Annual NER | $7.32 PSF |
