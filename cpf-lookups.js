// Lookups: the only code that reads the CPF database (cpf-data.js) directly.
// Only published figures are used. For a year after the latest published one,
// the latest published figure is used, unless a projection is set (see
// setProjection), in which case retirement sums and the BHS grow from it.

const latestYear = table => Math.max(...Object.keys(table).map(Number));
const earliestYear = table => Math.min(...Object.keys(table).map(Number));
const round100 = n => Math.round(n / 100) * 100; // CPF sets these sums in $100 steps

// Growth for years after the latest published figure: null (reuse the latest
// figure, the default) or { retirementSums, bhs } in % a year. These are
// estimates, not CPF figures.
let projection = null;
function setProjection(growth) { projection = growth; }

// Returns null for a year before the table starts.
function lookup(table, year, growth) {
  const last = latestYear(table);
  const value = table[Math.min(year, last)] ?? null;
  if (value == null || year <= last || !growth) return value;
  return round100(value * (1 + growth / 100) ** (year - last));
}

// BHS that applies to someone born in `birthYear`, in calendar `year`:
// the current year's BHS until they reach bhsFixedAge, then fixed for life.
function getBHS(birthYear, year) {
  const { bhsFixedAge } = CPF_DATA.milestones;
  const y = Math.min(year, birthYear + bhsFixedAge);
  return lookup(CPF_DATA.bhs, Math.max(earliestYear(CPF_DATA.bhs), y), projection?.bhs);
}

// The last year with published retirement sums.
const latestRetirementSumsYear = () =>
  Number(CPF_DATA.retirementSums[CPF_DATA.retirementSums.length - 1].from.slice(0, 4));

// Retirement sums row in effect on an ISO date ('YYYY-MM-DD'): the last row
// starting on or before it (so dates after the last row reuse it), or null if
// the date is before the table starts. With a projection, a year after the
// last row grows the BRS from it and sets the FRS and ERS as multiples of it.
function retirementSumsOn(date) {
  let row = null;
  for (const r of CPF_DATA.retirementSums) if (r.from <= date) row = r;
  const years = Number(date.slice(0, 4)) - latestRetirementSumsYear();
  if (!row || !projection?.retirementSums || years <= 0) return row;
  const brs = round100(row.brs * (1 + projection.retirementSums / 100) ** years);
  const { frs, ers } = CPF_DATA.retirementSumRatios;
  return { from: `${date.slice(0, 4)}-01-01`, brs, frs: brs * frs, ers: brs * ers, projected: true };
}
// The figures in effect for a calendar year (its latest cohort).
const retirementSumsInYear = year => retirementSumsOn(`${year}-12-31`);

// The FRS published for a calendar year. This is the cap used for SA/RA in
// that year (e.g. when MA overflow or contributions top up the RA).
function getCurrentFRS(year) {
  return retirementSumsInYear(year).frs;
}

// All three sums in effect for a calendar year: the limits for top-ups (SA up
// to the FRS, RA up to the ERS) and the MRSS check (RA below the BRS).
function getCurrentSums(year) {
  const { brs, frs, ers } = retirementSumsInYear(year);
  return { brs, frs, ers };
}

// Retirement sums for someone born on `birthDate` ('YYYY-MM-DD'), as at
// calendar `year`: { brs, frs, ers, date, projected }, where `date` is their
// raAge birthday. BRS/FRS are fixed by cohort; ERS follows the calendar year
// from ersYearlyFromYear. BRS/ERS are null for Minimum Sum cohorts (none
// published). Returns null if they reached raAge before the data starts.
function getRetirementSums(birthDate, year = new Date().getFullYear()) {
  const { raAge, ersYearlyFromYear } = CPF_DATA.milestones;
  const date = `${Number(birthDate.slice(0, 4)) + raAge}${birthDate.slice(4)}`;
  const cohort = retirementSumsOn(date);
  if (!cohort) return null;
  const sums = { brs: cohort.brs ?? null, frs: cohort.frs, ers: cohort.ers ?? null, date,
                 projected: !!cohort.projected };
  const yearRA = Number(date.slice(0, 4));
  if (yearRA >= ersYearlyFromYear || year >= ersYearlyFromYear) {
    sums.ers = retirementSumsInYear(Math.max(year, yearRA)).ers;
  }
  return sums;
}

// Interest rules for a given age: base rates, and the extra interest order and bands.
function getInterestRules(age) {
  const { base, extra } = CPF_DATA.interest;
  const fromRA = age >= CPF_DATA.milestones.raAge;
  return {
    oa: base.oa, ma: base.ma,
    sa: fromRA ? base.ra : base.sa, // `sa` means the RA from raAge
    extra: { oaCap: extra.oaCap, ...(fromRA ? extra.fromRaAge : extra.belowRaAge) },
  };
}

// Estimated CPF LIFE monthly payout from an RA balance at minAge, with payouts
// deferred by `yearsDeferred`. Reads CPF's published estimates and interpolates
// between them. Returns { low, high }: the same figure when not deferred, and
// the deferral range otherwise.
function getCpfLifePayout(ra65, yearsDeferred) {
  const { deferral, estimates } = CPF_DATA.cpfLife;
  const pts = [{ ra65: 0, monthly: 0 }, ...estimates.points];
  let i = 1;
  while (i < pts.length - 1 && ra65 > pts[i].ra65) i++;
  const a = pts[i - 1], b = pts[i];
  const at65 = a.monthly + (ra65 - a.ra65) * (b.monthly - a.monthly) / (b.ra65 - a.ra65);
  const base = Math.max(0, at65);
  return {
    low: base * (1 + deferral.low / 100) ** yearsDeferred,
    high: base * (1 + deferral.high / 100 * yearsDeferred),
  };
}

// The rate table in effect in calendar `year`: the last one starting on or
// before it (or the first, for a year before them all).
function tableFor(tables, year) {
  let t = tables[0];
  for (const r of tables) if (r.from <= year) t = r;
  return t.bands;
}

// Split a contribution into accounts by the allocation for the age and year.
function allocate(total, age, year) {
  const split = tableFor(CPF_DATA.contributions.allocation, year).find(b => age <= b.upTo);
  const ma = total * split.ma, sa = total * split.sa;
  return { oa: total - ma - sa, sa, ma };
}

// Monthly CPF contribution on a salary at a given age, in calendar `year`, for
// a member type (a key of contributions.memberTypes): { total, employee,
// employer, oa, sa, ma }. Salary above the OW ceiling is ignored; low salaries
// use CPF's lower rates (see contributions.lowWage).
function getMonthlyContribution(salary, age, year, memberType = 'full') {
  const { owCeiling, lowWage, rates } = CPF_DATA.contributions;
  const wage = Math.min(Math.max(0, salary), owCeiling);
  const rate = tableFor(rates[memberType], year).find(b => age <= b.upTo);
  const employee = wage <= lowWage.employerOnly ? 0
    : wage <= lowWage.full ? lowWage.employeePhaseIn * rate.employee / 100 * (wage - lowWage.employerOnly)
    : wage * rate.employee / 100;
  const employer = wage <= lowWage.nil ? 0 : wage * rate.employer / 100;
  const total = employee + employer;
  return { total, employee, employer, ...allocate(total, age, year) };
}

// CPF contribution on a year's Additional Wages (bonuses), given the monthly
// salary: AW are capped at the annual ceiling less the year's OW subject to
// CPF, and use the same rates as salary. Same shape as getMonthlyContribution.
function getBonusContribution(bonus, salary, age, year, memberType = 'full') {
  const { owCeiling, annualCeiling, lowWage, rates } = CPF_DATA.contributions;
  const ow = Math.min(Math.max(0, salary), owCeiling) * 12;
  const aw = Math.min(Math.max(0, bonus), Math.max(0, annualCeiling - ow));
  const rate = tableFor(rates[memberType], year).find(b => age <= b.upTo);
  const employee = salary > lowWage.employerOnly ? aw * rate.employee / 100 : 0;
  const employer = salary > lowWage.nil ? aw * rate.employer / 100 : 0;
  const total = employee + employer;
  return { total, employee, employer, ...allocate(total, age, year), aw };
}

// Yearly MediSave contribution a self-employed person must pay on a year's
// net trade income, at `ageAtJan1` (age as at 1 January).
function getSelfEmployedMediSave(nti, ageAtJan1) {
  const { minNTI, phaseFrom, fullFrom, ntiCap, bands } = CPF_DATA.selfEmployed;
  const band = bands.find(b => ageAtJan1 < b.below);
  if (nti <= minNTI) return 0;
  if (nti <= phaseFrom) return nti * band.low / 100;
  if (nti <= fullFrom) {
    const start = phaseFrom * band.low / 100, end = fullFrom * band.full / 100;
    return start + (end - start) * (nti - phaseFrom) / (fullFrom - phaseFrom);
  }
  return Math.min(nti, ntiCap) * band.full / 100;
}
