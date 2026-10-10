// The calculation engine: maths only, no page code.
// CPF figures and rules come from the database via cpf-lookups.js; modelling
// assumptions and user choices come from `config` (see config.js).

const RA_AGE = () => CPF_DATA.milestones.raAge;

// Extra interest for one year, given start-of-year balances and the age's
// interest rules (getInterestRules). Returns how much extra interest each
// account earns ({ oa, sa, ma, life }). `sa` means SA, or the RA once formed.
// `life` is savings already used for CPF LIFE; its extra interest stays in CPF LIFE.
function extraInterest(bal, rules) {
  const { oaCap, order, bands } = rules.extra;
  const earned = { oa: 0, sa: 0, ma: 0, life: 0 };
  let counted = 0; // how much of the combined balance has been assigned to bands
  for (const acct of order) {
    let left = acct === 'oa' ? Math.min(bal.oa, oaCap) : bal[acct];
    for (const band of bands) {
      if (left <= 0) break;
      const room = band.upTo - counted;
      if (room <= 0) continue;
      const slice = Math.min(left, room);
      earned[acct] += slice * band.rate / 100;
      counted += slice;
      left -= slice;
    }
  }
  return earned;
}

// Move MA above the BHS into SA/RA and OA, according to config.maOverflow.
// 'split' sends a fixed share (config.assumptions.splitToOA) to OA.
// The RA savings used to join CPF LIFE still count towards the FRS cap.
// Returns how much went to each: { toSA, toOA }.
function overflowMA(bal, bhs, frs, config) {
  const excess = Math.max(0, bal.ma - bhs);
  if (excess === 0) return { toSA: 0, toOA: 0 };
  bal.ma -= excess;
  const toSA = config.maOverflow === 'split'
    ? excess * (1 - config.assumptions.splitToOA)
    : Math.min(excess, Math.max(0, frs - bal.sa - bal.lifeJoined)); // OA only once SA/RA is at the FRS
  bal.sa += toSA;
  bal.oa += excess - toSA;
  return { toSA, toOA: excess - toSA };
}

// At 55 the SA closes and an RA is created, following CPF's order: SA first,
// then OA, up to the FRS. If the target is the ERS and SA + OA can reach it in
// full, more OA moves in up to the ERS; otherwise it stays at the FRS. SA
// savings above the RA amount go to OA. With a property pledge the person may
// withdraw RA savings above the BRS, but not OA moved in above the FRS to reach
// the ERS (that is a top-up, which can't be withdrawn this way).
// After that, CPF allows withdrawing at least $5,000 (withdrawal.minAtRaAge),
// or all savings above the FRS (above the BRS with a pledge), whichever is
// more: everything left in OA, plus RA savings above the BRS with a pledge
// (not already withdrawn). With config.withdrawAt55 it is all taken as cash,
// from OA first.
// Returns what happened, for the results table.
function formRA(bal, birthDate, config) {
  const sums = getRetirementSums(birthDate, Number(birthDate.slice(0, 4)) + RA_AGE());
  const total = bal.sa + bal.oa;
  const wantsERS = config.raTarget === 'ers';
  const target = wantsERS && total >= sums.ers ? sums.ers : sums.frs;
  const ra = Math.min(total, target);
  const fromSA = Math.min(bal.sa, ra);
  const oaToRA = ra - fromSA;
  const saToOA = bal.sa - fromSA;
  bal.oa += saToOA - oaToRA;
  bal.sa = ra;

  let withdrawn = 0;
  if (config.pledged && config.withdrawAboveBRS) {
    withdrawn = Math.max(0, Math.min(bal.sa, sums.frs) - sums.brs);
    bal.sa -= withdrawn;
  }

  const met = bal.sa >= sums.ers ? 'ERS'
    : bal.sa >= sums.frs ? 'FRS'
    : bal.sa >= sums.brs && config.pledged ? 'BRS'
    : null; // short of the minimum (FRS, or BRS with a pledge)
  const raSetAside = bal.sa;

  const minimum = Math.max(0, CPF_DATA.withdrawal.minAtRaAge - withdrawn);
  const aboveBRS = config.pledged ? Math.max(0, Math.min(bal.sa, sums.frs) - sums.brs) : 0;
  const withdrawable = Math.max(bal.oa + aboveBRS, Math.min(minimum, bal.oa + bal.sa));
  let cashOut = 0;
  if (config.withdrawAt55) {
    const fromOA = Math.min(bal.oa, withdrawable);
    bal.oa -= fromOA;
    bal.sa -= withdrawable - fromOA;
    cashOut = withdrawable;
  }
  return { sums, ra: raSetAside, raAfter: bal.sa, saToOA, oaToRA, withdrawn, met, withdrawable, cashOut,
           ersFellBack: wantsERS && target !== sums.ers };
}

// A year's contributions for a salary: 12 months of Ordinary Wages plus the
// bonus (config.bonusMonths of salary, as Additional Wages). Self-employed
// members ('self') pay only MediSave, on 12 months of income as net trade
// income, at their age as at 1 January (one less than the age reached).
// Returns yearly { total, employee, employer, oa, sa, ma }.
function contributionsForYear(age, year, salary, memberType, config) {
  if (memberType === 'self') {
    const ma = getSelfEmployedMediSave(salary * 12, age - 1);
    return { total: ma, employee: ma, employer: 0, oa: 0, sa: 0, ma };
  }
  const m = getMonthlyContribution(salary, age, year, memberType);
  const b = getBonusContribution(salary * config.bonusMonths, salary, age, year, memberType);
  const sum = k => m[k] * 12 + b[k];
  return { total: sum('total'), employee: sum('employee'), employer: sum('employer'),
           oa: sum('oa'), sa: sum('sa'), ma: sum('ma') };
}

// Add a year of contributions (from contributionsForYear). Contributions earn
// interest for part of the year they're paid (config.assumptions.contributionInterestMonths).
// Once the RA is formed, the RA share goes to the RA up to the current FRS
// (counting savings used for CPF LIFE), then to OA.
// Returns the year's totals and the interest they earned, for the table.
function addContributions(bal, age, c, frs, rules, config) {
  const year = { oa: c.oa, sa: c.sa, ma: c.ma };
  if (age >= RA_AGE()) {
    const toRA = Math.min(year.sa, Math.max(0, frs - bal.sa - bal.lifeJoined));
    year.oa += year.sa - toRA;
    year.sa = toRA;
  }
  const share = config.assumptions.contributionInterestMonths / 12; // fraction of a year
  let interest = 0;
  for (const acct of ['oa', 'sa', 'ma']) {
    const earned = year[acct] * rules[acct] / 100 * share;
    bal[acct] += year[acct] + earned;
    interest += earned;
  }
  return { total: c.total, employee: c.employee, employer: c.employer, interest };
}

// A year of monthly housing loan payments from OA, as far as OA covers them
// (the rest is paid in cash). Paid monthly, so they lose part of a year's OA
// interest, the mirror of contributions earning it.
// Returns { used, short, interestLost }.
function payHousing(bal, yearly, oaRate, config) {
  const lose = oaRate / 100 * config.assumptions.contributionInterestMonths / 12;
  const used = Math.min(yearly, Math.max(0, bal.oa) / (1 + lose));
  const interestLost = used * lose;
  bal.oa -= used + interestLost;
  return { used, short: yearly - used, interestLost };
}

// Voluntary top-ups, made at the end of the year within CPF's limits: SA up to
// the current FRS (RA: up to the current ERS, counting savings used for CPF
// LIFE), MA up to the BHS. Cash goes in before OA transfers. With the MRSS,
// cash top-ups to an RA below the current BRS are matched, up to the yearly
// and lifetime caps (`state.mrssLeft`); CPF credits the grant by the following
// March, which is treated here as the same year end.
// Returns { cash, transfer, ma, grant }.
function addTopUps(bal, age, year, bhs, state, config) {
  const sums = getCurrentSums(year);
  const retirement = bal.sa + bal.lifeJoined;
  let room = Math.max(0, (age >= RA_AGE() ? sums.ers : sums.frs) - retirement);
  const cash = Math.min(config.topUpSA, room);
  room -= cash;
  const transfer = Math.min(config.transferOA, room, Math.max(0, bal.oa));
  const ma = Math.min(config.topUpMA, Math.max(0, bhs - bal.ma));
  const { minAge, yearlyMatch } = CPF_DATA.mrss;
  const grant = config.mrssEligible && age >= minAge && retirement < sums.brs
    ? Math.min(cash, yearlyMatch, state.mrssLeft) : 0;
  state.mrssLeft -= grant;
  bal.sa += cash + transfer + grant;
  bal.oa -= transfer;
  bal.ma += ma;
  return { cash, transfer, ma, grant };
}

// Start CPF LIFE: the RA is used to join CPF LIFE and monthly payouts begin.
// The starting payout is CPF's own estimate if the user entered one. Otherwise,
// for a plan with published estimates, it is estimated from the RA balance at
// the earliest payout age (`base.ra`, or at a later age if the forecast starts
// after that), as a { low, high } range when deferred. A plan without published
// figures has no payout (null) unless CPF's estimate is entered.
function startCpfLife(bal, base, startAge, config) {
  const plan = config.cpfLifePlan;
  const source = config.cpfEstimate > 0 ? 'cpf'
    : CPF_DATA.cpfLife.plans[plan].published ? 'app' : null;
  const monthly = source === 'cpf' ? { low: config.cpfEstimate, high: config.cpfEstimate }
    : source === 'app' ? getCpfLifePayout(base.ra, startAge - base.age)
    : null;
  const premium = bal.sa;
  bal.life += premium;       // premium balance: drawn down by payouts
  bal.lifeJoined += premium; // fixed: what was used to join CPF LIFE
  bal.sa = 0;
  return { monthly, premium, base, startAge, plan, source, sex: config.sex };
}

// Payout in a later year: the starting payout plus the plan's yearly increase.
function payoutInYear(life, age) {
  if (!life.monthly) return null;
  const g = (1 + CPF_DATA.cpfLife.plans[life.plan].escalation / 100) ** (age - life.startAge);
  return { low: life.monthly.low * g, high: life.monthly.high * g };
}

// Inputs: currentAge is the age the person reaches this calendar year. Each row
// is one calendar year, so CPF's "the year you turn 55/65" rules line up.
// Each row holds start-of-year balances, then what happened during the year.
function forecast(inputs, config) {
  setProjection(config.projectSums ? config.assumptions.growth : null);
  const rows = [];
  const bal = { oa: inputs.oa, sa: inputs.sa, ma: inputs.ma, life: 0, lifeJoined: 0 };
  const state = { mrssLeft: CPF_DATA.mrss.lifetimeCap, memberType: config.memberType };
  const payoutAge = config.payoutAge;
  // Payouts can only be modelled if they haven't started yet.
  const modelPayouts = inputs.currentAge <= payoutAge;
  const downpaymentAge = config.oaDownpaymentAge || inputs.currentAge;
  let base = null, started = null;
  for (let age = inputs.currentAge; age <= inputs.targetAge; age++) {
    const year = inputs.birthYear + age; // the calendar year the person turns `age`
    const yearsIn = age - inputs.currentAge;
    // The RA is formed in the year the person turns 55 (only if they start below 55).
    const ra = age === RA_AGE() && inputs.currentAge < RA_AGE()
      ? formRA(bal, inputs.birthDate, config) : null;
    // RA balance at 65 sets the payout (or today's balance if already past 65).
    if (modelPayouts && !base && age >= CPF_DATA.cpfLife.minAge) base = { ra: bal.sa, age };
    const life = modelPayouts && age === payoutAge ? startCpfLife(bal, base, payoutAge, config) : null;
    if (life) started = life;
    const payout = started ? payoutInYear(started, age) : null;
    const bhs = getBHS(inputs.birthYear, year);
    const row = { age, year, oa: bal.oa, sa: bal.sa, premiumLeft: bal.life, ma: bal.ma,
                  bhs, ra, life, payout, housing: 0, housingShort: 0 };
    rows.push(row);
    if (age === inputs.targetAge) break;

    // Start of the year: a one-off housing payment from OA, and the year's
    // insurance premiums from MediSave.
    if (config.oaDownpayment > 0 && age === downpaymentAge) {
      row.housing = Math.min(config.oaDownpayment, Math.max(0, bal.oa));
      row.housingShort = config.oaDownpayment - row.housing;
      bal.oa -= row.housing;
    }
    const premium = config.maPremiums * (1 + config.maPremiumGrowth / 100) ** yearsIn;
    row.premiums = Math.min(premium, Math.max(0, bal.ma));
    row.premiumsShort = premium - row.premiums;
    bal.ma -= row.premiums;

    // Interest for the year, compounded annually on start-of-year balances.
    const rules = getInterestRules(age);
    const extra = extraInterest(bal, rules);
    const interest = {
      oa: bal.oa * rules.oa / 100,
      sa: bal.sa * rules.sa / 100 + extra.sa + extra.oa, // OA's extra interest goes to SA/RA
      ma: bal.ma * rules.ma / 100 + extra.ma,
    }; // savings already in CPF LIFE earn interest inside CPF LIFE; not shown
    bal.oa += interest.oa;
    bal.sa += interest.sa;
    bal.ma += interest.ma;
    row.interest = interest.oa + interest.sa + interest.ma;
    if (inputs.salary > 0 && age <= config.workUntilAge) {
      row.salary = inputs.salary * (1 + config.salaryGrowth / 100) ** yearsIn;
      const c = contributionsForYear(age, year, row.salary, state.memberType, config);
      row.contributions = addContributions(bal, age, c, getCurrentFRS(year), rules, config);
      row.interest += row.contributions.interest;
    }
    if (state.memberType !== 'self') state.memberType = CPF_DATA.contributions.memberTypes[state.memberType].next;

    // Monthly housing loan payments from OA.
    if (config.oaHousingMonthly > 0 && (!config.oaHousingUntilAge || age <= config.oaHousingUntilAge)) {
      const paid = payHousing(bal, config.oaHousingMonthly * 12, rules.oa, config);
      row.housing += paid.used;
      row.housingShort += paid.short;
      row.interest -= paid.interestLost;
    }

    if (!config.topUpUntilAge || age <= config.topUpUntilAge) {
      row.topUps = addTopUps(bal, age, year, bhs, state, config);
    }

    const flow = overflowMA(bal, bhs, getCurrentFRS(year), config);
    row.overflowToSA = flow.toSA;
    row.overflowToOA = flow.toOA;
    // A year of payouts comes out of the CPF LIFE premium balance (what would go to
    // beneficiaries). Uses the higher payout figure, so the balance isn't overstated.
    if (payout) bal.life = Math.max(0, bal.life - 12 * payout.high);
  }
  return rows;
}
