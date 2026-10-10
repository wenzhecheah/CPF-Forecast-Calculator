# CPF Forecast Calculator

Forecasts CPF balances (OA, SA/RA, MA) year by year, with salary contributions,
interest, MediSave overflow, RA formation at 55 and CPF LIFE payouts.

Open `index.html` in a browser to use it. No install or build step.

## What it models

- Contributions from salary and bonuses, with yearly salary increases, using
  CPF's rates by year (including the higher rates for ages 55 to 65 from 2027),
  graduated rates for SPRs in their 1st and 2nd year, and MediSave-only
  contributions for the self-employed
- Housing paid from OA: a one-off payment and monthly loan payments
- Insurance premiums paid from MediSave
- Cash top-ups to SA/RA and MediSave, OA-to-SA/RA transfers, within CPF's
  limits, and Matched Retirement Savings Scheme grants
- RA formation at 55 (FRS or ERS, property pledge), and how much can be
  withdrawn then
- CPF LIFE payouts (Standard, Escalating, Basic), with deferral to 70
- Optionally, projected retirement sums and BHS for years CPF hasn't
  published yet

Results show headline figures, a chart, the year-by-year table, and can be
compared with a kept scenario, downloaded as CSV, printed, or shared: the
address bar holds a link to the forecast (the numbers are in the part after
`#`, which browsers don't send to the web server).

## Files

| File | Holds |
|---|---|
| `cpf-data.js` | The database: every CPF figure and rule. Update this when CPF announces new figures. |
| `cpf-lookups.js` | Functions that read the database |
| `config.js` | App settings: form defaults and modelling assumptions |
| `engine.js` | The forecast calculations |
| `app.js` | The page: form, results, chart, sharing and export |
| `index.html`, `style.css` | Page layout and styling |
