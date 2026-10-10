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
  return { sums, ra: bal.sa, saToOA, oaToRA, withdrawn, met,
           ersFellBack: wantsERS && target !== sums.ers };
}

// Add a year of contributions from salary. Contributions earn interest for
// part of the year they're paid (config.assumptions.contributionInterestMonths).
// Once the RA is formed, the RA share goes to the RA up to the current FRS
// (counting savings used for CPF LIFE), then to OA.
// Returns the year's totals and the interest they earned, for the table.
function addContributions(bal, age, salary, frs, rules, config) {
  const m = getMonthlyContribution(salary, age);
  const year = { oa: m.oa * 12, sa: m.sa * 12, ma: m.ma * 12 };
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
  return { total: m.total * 12, employee: m.employee * 12, employer: m.employer * 12, interest };
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
  return { monthly, premium, base, startAge, plan, source };
}

// Payout in a later year: the starting payout plus the plan's yearly increase.
function payoutInYear(life, age) {
  if (!life.monthly) return null;
  const g = (1 + CPF_DATA.cpfLife.plans[life.plan].escalation / 100) ** (age - life.startAge);
  return { low: life.monthly.low * g, high: life.monthly.high * g };
}

// Inputs: currentAge is the age the person reaches this calendar year. Each row
// is one calendar year, so CPF's "the year you turn 55/65" rules line up.
function forecast(inputs, config) {
  const rows = [];
  const bal = { oa: inputs.oa, sa: inputs.sa, ma: inputs.ma, life: 0, lifeJoined: 0 };
  const payoutAge = config.payoutAge;
  // Payouts can only be modelled if they haven't started yet.
  const modelPayouts = inputs.currentAge <= payoutAge;
  let base = null, started = null;
  for (let age = inputs.currentAge; age <= inputs.targetAge; age++) {
    const year = inputs.birthYear + age; // the calendar year the person turns `age`
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
                  bhs, ra, life, payout };
    rows.push(row);
    if (age === inputs.targetAge) break;

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
      row.contributions = addContributions(bal, age, inputs.salary, getCurrentFRS(year), rules, config);
      row.interest += row.contributions.interest;
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
