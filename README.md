# CPF Forecast Calculator

Forecasts CPF balances (OA, SA/RA, MA) year by year, with salary contributions,
interest, MediSave overflow, RA formation at 55 and CPF LIFE payouts.

Open `index.html` in a browser to use it. No install or build step.

## Files

| File | Holds |
|---|---|
| `cpf-data.js` | The database: every CPF figure and rule. Update this when CPF announces new figures. |
| `cpf-lookups.js` | Functions that read the database |
| `config.js` | App settings: form defaults and modelling assumptions |
| `engine.js` | The forecast calculations |
| `app.js` | The page: form and results table |
| `index.html`, `style.css` | Page layout and styling |
