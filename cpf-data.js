// CPF DATABASE: every CPF figure and rule the app uses, and nothing else.
// Data only: no calculations here (those read this through cpf-lookups.js).
//
// To update: when CPF announces new figures, add or change a row below.
// Nothing else in the app needs to change.
// - BHS: usually announced in December for the next year.
// - Retirement sums: usually announced at Budget.
// - Interest rates: reviewed every quarter.
// - Contribution / allocation rates: usually change on 1 January.
// Forecast years beyond the last row reuse the last row's figures.
// Last verified Oct 2026.
const CPF_DATA = {
  // Ages and years where CPF rules change.
  milestones: {
    raAge: 55,             // SA closes, RA is formed; 55+ extra interest and RA caps apply
    bhsFixedAge: 65,       // BHS is fixed for life at the figure for the year you turn this age
    ersYearlyFromYear: 2025, // from this year the ERS rises every year for everyone aged raAge+
  },

  // Interest, % per year. Source: cpf.gov.sg "Earning attractive interest" and
  // "How much extra interest can I earn on my CPF savings?" (rates for Q4 2026).
  // OA has a legislated 2.5% floor. SA/MA/RA have a 4% floor, extended to
  // 31 Dec 2027; the forecast assumes these floors carry on after that.
  interest: {
    base: { oa: 2.5, sa: 4, ma: 4, ra: 4 },
    // Extra interest on combined balances. Bands are cumulative (`upTo` is the
    // running total) and accounts are counted in `order`; OA counts for at most
    // oaCap. 'life' is savings used for CPF LIFE (counted as part of the RA).
    // Extra interest on OA goes to SA (below raAge) or RA; on the others it
    // stays in that account (or CPF LIFE).
    extra: {
      oaCap: 20000,
      belowRaAge: { order: ['oa', 'sa', 'ma'],
                    bands: [{ upTo: 60000, rate: 1 }] },
      fromRaAge:  { order: ['life', 'sa', 'oa', 'ma'],
                    bands: [{ upTo: 30000, rate: 2 }, { upTo: 60000, rate: 1 }] },
    },
  },

  // Basic Healthcare Sum by calendar year. Source: cpf.gov.sg/bhs.
  // Below bhsFixedAge: the current year's figure. From then: fixed for life at
  // the figure for the year you reached it. The BHS started in 2016; everyone
  // who had already reached bhsFixedAge then has the 2016 figure.
  bhs: {
    2016: 49800, 2017: 52000, 2018: 54500, 2019: 57200, 2020: 60000,
    2021: 63000, 2022: 66000, 2023: 68500, 2024: 71500, 2025: 75500,
    2026: 79000,
  },

  // Retirement sums by cohort: each row applies to members whose raAge
  // birthday is on or after `from` (until the next row). Sources: cpf.gov.sg/frs
  // and CPF's "past FRS" table. Until 2016 cohorts started on 1 July; from 2017
  // on 1 January. Before 1 July 2015 this was the Minimum Sum: only the FRS is
  // published (no BRS or ERS).
  // BRS and FRS are fixed for life at the cohort's figures.
  // ERS: fixed by cohort before ersYearlyFromYear; from then it rises every
  // year for everyone aged raAge and above.
  retirementSums: [
    { from: '1995-07-01', frs: 40000 },
    { from: '1996-07-01', frs: 45000 },
    { from: '1997-07-01', frs: 50000 },
    { from: '1998-07-01', frs: 55000 },
    { from: '1999-07-01', frs: 60000 },
    { from: '2000-07-01', frs: 65000 },
    { from: '2001-07-01', frs: 70000 },
    { from: '2002-07-01', frs: 75000 },
    { from: '2003-07-01', frs: 80000 },
    { from: '2004-07-01', frs: 84500 },
    { from: '2005-07-01', frs: 90000 },
    { from: '2006-07-01', frs: 94600 },
    { from: '2007-07-01', frs: 99600 },
    { from: '2008-07-01', frs: 106000 },
    { from: '2009-07-01', frs: 117000 },
    { from: '2010-07-01', frs: 123000 },
    { from: '2011-07-01', frs: 131000 },
    { from: '2012-07-01', frs: 139000 },
    { from: '2013-07-01', frs: 148000 },
    { from: '2014-07-01', frs: 155000 },
    { from: '2015-07-01', brs: 80500,  frs: 161000, ers: 241500 },
    { from: '2017-01-01', brs: 83000,  frs: 166000, ers: 249000 },
    { from: '2018-01-01', brs: 85500,  frs: 171000, ers: 256500 },
    { from: '2019-01-01', brs: 88000,  frs: 176000, ers: 264000 },
    { from: '2020-01-01', brs: 90500,  frs: 181000, ers: 271500 },
    { from: '2021-01-01', brs: 93000,  frs: 186000, ers: 279000 },
    { from: '2022-01-01', brs: 96000,  frs: 192000, ers: 288000 },
    { from: '2023-01-01', brs: 99400,  frs: 198800, ers: 298200 },
    { from: '2024-01-01', brs: 102900, frs: 205800, ers: 308700 },
    { from: '2025-01-01', brs: 106500, frs: 213000, ers: 426000 },
    { from: '2026-01-01', brs: 110200, frs: 220400, ers: 440800 },
    { from: '2027-01-01', brs: 114100, frs: 228200, ers: 456400 },
  ],

  // Monthly contributions from salary: Singapore Citizens and SPRs (3rd year
  // onwards), private sector. Source: CPF contribution and allocation rate
  // tables from 1 January 2026. `upTo` is the highest age in each band.
  contributions: {
    year: 2026,
    owCeiling: 8000, // contributions apply to monthly salary up to this amount
    // Lower rates for low salaries: nothing up to `nil`; employer share only
    // up to `employerOnly`; then the employee share phases in at
    // `employeePhaseIn` x the employee rate on the amount above `employerOnly`,
    // reaching the full rate at `full`.
    lowWage: { nil: 50, employerOnly: 500, full: 750, employeePhaseIn: 3 },
    // % of salary, for salary above lowWage.full.
    rates: [
      { upTo: 55,       employer: 17,   employee: 20 },
      { upTo: 60,       employer: 16,   employee: 18 },
      { upTo: 65,       employer: 12.5, employee: 12.5 },
      { upTo: 70,       employer: 9,    employee: 7.5 },
      { upTo: Infinity, employer: 7.5,  employee: 5 },
    ],
    // Share of each contribution. MA and SA/RA are worked out first; OA gets
    // the remainder. From raAge the SA/RA share goes to the RA up to the
    // current FRS, then to OA.
    allocation: [
      { upTo: 35,       sa: 0.1621, ma: 0.2162 },
      { upTo: 45,       sa: 0.1891, ma: 0.2432 },
      { upTo: 50,       sa: 0.2162, ma: 0.2702 },
      { upTo: 55,       sa: 0.3108, ma: 0.2837 },
      { upTo: 60,       sa: 0.3382, ma: 0.3088 },
      { upTo: 65,       sa: 0.44,   ma: 0.42 },
      { upTo: 70,       sa: 0.303,  ma: 0.6363 },
      { upTo: Infinity, sa: 0.08,   ma: 0.84 },
    ],
  },

  // CPF LIFE monthly payouts.
  // Payouts can start any time from minAge (the payout eligibility age) to maxAge.
  cpfLife: {
    minAge: 65,
    maxAge: 70,
    // Plans modelled. `escalation` is the % increase each year once payouts
    // start. `published`: CPF publishes payout estimates for this plan (see
    // `estimates`). Escalating starts lower by an amount CPF does not publish,
    // so its starting payout must come from CPF's Monthly Payout Estimator.
    plans: {
      standard:   { label: 'Standard',   escalation: 0, published: true },
      escalating: { label: 'Escalating', escalation: 2, published: false },
    },
    // CPF says each year of deferral raises payouts by "up to 7%" (35% at 70);
    // the actual figure depends on plan, gender, interest and life expectancy.
    // A deferred payout is shown as a range: `low` compounds (RA interest at the
    // 4% floor), `high` is simple (CPF's maximum).
    deferral: { low: 4, high: 7 },
    // CPF's published estimates for members turning 55 in 2026: Standard Plan,
    // male, payouts from 65. `ra65` is the RA balance at 65 each one assumes.
    estimates: {
      cohort: 2026,
      points: [
        { sum: 'BRS', ra65: 170200, monthly: 950 },
        { sum: 'FRS', ra65: 330100, monthly: 1780 },
        { sum: 'ERS', ra65: 650100, monthly: 3440 },
      ],
    },
  },
};
