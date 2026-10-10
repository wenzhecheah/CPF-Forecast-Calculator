// App settings: no CPF figures here (those are all in cpf-data.js).
const CPF_CONFIG = {
  // Modelling assumptions (not CPF rules).
  assumptions: {
    // Each month's contribution is credited that month and earns interest from
    // the next month, so a year's contributions earn on average (11+10+...+0)/12
    // = 5.5 months of interest in the year they're paid.
    contributionInterestMonths: 5.5,
    // Share of MA overflow sent to OA under the 50/50 scenario.
    splitToOA: 0.5,
  },

  // Form defaults: the form lets the user change all of these.

  // Where MA amounts above the BHS go.
  // 'official': to SA (below 55) or RA (55+) until it reaches the current FRS, then OA.
  // 'split':    a fixed share (assumptions.splitToOA) to OA, the rest to SA/RA.
  maOverflow: 'official',

  // Retirement sum to aim for when the RA is formed: 'frs' or 'ers'.
  // CPF fills the RA up to the FRS automatically. 'ers' moves more OA in, but
  // only if SA + OA can reach the ERS in full; otherwise it stays at the FRS.
  raTarget: 'frs',

  // Pledging a property lowers the minimum to keep in the RA to the BRS.
  pledged: false,
  // With a pledge, withdraw RA savings above the BRS as cash when the RA is formed.
  withdrawAboveBRS: false,

  // Last age the person works and contributes from salary.
  workUntilAge: 64,

  // Age the forecast runs to.
  targetAge: 55,

  // Age CPF LIFE payouts start (CPF_DATA.cpfLife.minAge to maxAge).
  payoutAge: 65,
  // CPF LIFE plan: a key of CPF_DATA.cpfLife.plans.
  cpfLifePlan: 'standard',
  // Starting monthly payout from CPF's Monthly Payout Estimator, if the user has
  // one. Required for Escalating; for Standard it replaces the app's estimate.
  cpfEstimate: 0,
};
