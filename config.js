// App settings: no CPF figures here (those are all in cpf-data.js).
const CPF_CONFIG = {
  // Modelling assumptions (not CPF rules).
  assumptions: {
    // Each month's contribution is credited that month and earns interest from
    // the next month, so a year's contributions earn on average (11+10+...+0)/12
    // = 5.5 months of interest in the year they're paid. Monthly housing loan
    // payments from OA lose the same amount of interest.
    contributionInterestMonths: 5.5,
    // Share of MA overflow sent to OA under the 50/50 scenario.
    splitToOA: 0.5,
    // Yearly growth used when projecting retirement sums and the BHS past the
    // latest published year (only if the user ticks "project"). Retirement
    // sums: the 3.5% a year CPF set for 2023 to 2027. BHS: its average rise
    // from 2016 ($49,800) to 2026 ($79,000), about 4.7% a year.
    growth: { retirementSums: 3.5, bhs: 4.7 },
  },

  // Oldest age the calculator forecasts to (form limits and checks).
  maxAge: 95,

  // Form defaults: the form lets the user change all of these.

  // Contribution rates to use: a key of CPF_DATA.contributions.memberTypes, or
  // 'self' for a self-employed person (MediSave only).
  memberType: 'full',
  // Yearly bonus (Additional Wages), in months of salary.
  bonusMonths: 0,
  // Salary increase each year, %.
  salaryGrowth: 0,

  // Housing paid from OA: a one-off amount at an age (e.g. a downpayment), and
  // a monthly loan payment up to an age.
  oaDownpayment: 0,
  oaDownpaymentAge: 0,
  oaHousingMonthly: 0,
  oaHousingUntilAge: 0,

  // Insurance premiums paid from MediSave each year (MediShield Life,
  // CareShield Life, Integrated Shield Plans), and their yearly increase, %.
  maPremiums: 0,
  maPremiumGrowth: 0,

  // Voluntary top-ups each year, up to an age: cash to SA/RA, cash to MA,
  // and transfers from OA to SA/RA.
  topUpSA: 0,
  topUpMA: 0,
  transferOA: 0,
  topUpUntilAge: 0,
  // Eligible for the Matched Retirement Savings Scheme (from 55).
  mrssEligible: false,

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
  // Withdraw everything allowed as cash when the RA is formed.
  withdrawAt55: false,

  // Project retirement sums and the BHS past the latest published year, using
  // assumptions.growth. Off: reuse the latest published figures.
  projectSums: false,

  // Last age the person works and contributes from salary.
  workUntilAge: 64,

  // Age the forecast runs to.
  targetAge: 55,

  // Age CPF LIFE payouts start (CPF_DATA.cpfLife.minAge to maxAge).
  payoutAge: 65,
  // CPF LIFE plan: a key of CPF_DATA.cpfLife.plans.
  cpfLifePlan: 'standard',
  // 'male' or 'female': CPF's published payout figures are for men.
  sex: 'male',
  // Starting monthly payout from CPF's Monthly Payout Estimator, if the user has
  // one. Required for Escalating and Basic; for Standard it replaces the app's estimate.
  cpfEstimate: 0,
};
