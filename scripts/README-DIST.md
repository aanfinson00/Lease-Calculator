# RFP Analyzer

A self-contained tool for comparing industrial lease proposals on a Net
Effective Rent (NER) basis. Everything runs in your own browser — your inputs
never leave this folder.

## How to use

### Mac
Double-click **`start.command`**. The app will open in your default browser.
A small terminal window will stay open while the app is running — leave it
alone, and close it when you're done.

> First time only — Mac may show "cannot be opened because it's from an
> unidentified developer." Right-click the file → Open → Open. Mac will
> remember and skip the warning next time.

### Windows
Double-click **`start.bat`**. The app will open in your default browser.
A console window will stay open while the app is running.

> If Windows says "Python not found," install Python 3 from
> [python.org](https://www.python.org/downloads/) (it's free, takes a minute,
> and is widely used). Reopen `start.bat` after install.

### Linux / advanced
From this folder, run:
```bash
python3 -m http.server 3057
```
Then open http://localhost:3057 in your browser.

## Privacy

- 100% client-side. No backend, no analytics, no telemetry.
- Inputs persist only in your browser's `localStorage`, scoped to
  `localhost:3057`. Other people on other machines cannot see your data.
- The PDF export runs in your browser; the PDF file is generated locally
  and saved to your downloads folder.
- If you're on a shared computer, clear browser data for `localhost:3057`
  when you're finished.

## What it does

- Side-by-side comparison of any two lease scenarios (UW vs Proposal,
  Counter v1 vs Counter v2, etc.)
- Headline metrics: undiscounted + discounted NER, Yield on Cost, Building
  Cost PSF, with deltas
- NER waterfall (Base Rent → Free Rent → TI → LC → Net CF) per scenario
- Annual rent schedule + monthly cash-flow grid
- Sensitivity sliders with Hold-NER mode (pin a target NER, the chosen free
  variable solves itself)
- One-click PDF export of the comparison view
