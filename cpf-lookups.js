// Lookups: the only code that reads the CPF database (cpf-data.js) directly.
// Only published figures are used. For a year after the latest published one,
// the latest published figure is used (no estimates).

const latestYear = table => Math.max(...Object.keys(table).map(Number));
const earliestYear = table => Math.min(...Object.keys(table).map(Number));

// Returns null for a year before the table starts.
function lookup(table, year) {
  const y = Math.min(year, latestYear(table));
  return table[y] ?? null;
}

// BHS that applies to someone born in `birthYear`, in calendar `year`:
// the current year's BHS until they reach bhsFixedAge, then fixed for life.
function getBHS(birthYear, year) {
  const { bhsFixedAge } = CPF_DATA.milestones;
  const y = Math.min(year, birthYear + bhsFixedAge);
  return lookup(CPF_DATA.bhs, Math.max(earliestYear(CPF_DATA.bhs), y));
}

// Retirement sums row in effect on an ISO date ('YYYY-MM-DD'): the last row
// starting on or before it (so dates after the last row reuse it), or null if
// the date is before the table starts.
function retirementSumsOn(date) {
  let row = null;
  for (const r of CPF_DATA.retirementSums) if (r.from <= date) row = r;
  return row;
}
// The figures in effect for a calendar year (its latest cohort).
const retirementSumsInYear = year => retirementSumsOn(`${year}-12-31`);
// The last year with published retirement sums.
const latestRetirementSumsYear = () =>
  Number(CPF_DATA.retirementSums[CPF_DATA.retirementSums.length - 1].from.slice(0, 4));

// The FRS published for a calendar year. This is the cap used for SA/RA in
// that year (e.g. when MA overflow or contributions top up the RA).
function getCurrentFRS(year) {
  return retirementSumsInYear(year).frs;
}

// Retirement sums for someone born on `birthDate` ('YYYY-MM-DD'), as at
// calendar `year`: { brs, frs, ers, date }, where `date` is their raAge birthday.
// BRS/FRS are fixed by cohort; ERS follows the calendar year from
// ersYearlyFromYear. BRS/ERS are null for Minimum Sum cohorts (none published).
// Returns null if they reached raAge before the data starts.
function getRetirementSums(birthDate, year = new Date().getFullYear()) {
  const { raAge, ersYearlyFromYear } = CPF_DATA.milestones;
  const date = `${Number(birthDate.slice(0, 4)) + raAge}${birthDate.slice(4)}`;
  const cohort = retirementSumsOn(date);
  if (!cohort) return null;
  const sums = { brs: cohort.brs ?? null, frs: cohort.frs, ers: cohort.ers ?? null, date };
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

// Monthly CPF contribution on a salary at a given age: { total, employee,
// employer, oa, sa, ma }. Salary above the OW ceiling is ignored; low salaries
// use CPF's lower rates (see contributions.lowWage).
function getMonthlyContribution(salary, age) {
  const { owCeiling, lowWage, rates, allocation } = CPF_DATA.contributions;
  const wage = Math.min(Math.max(0, salary), owCeiling);
  const rate = rates.find(b => age <= b.upTo);
  const employee = wage <= lowWage.employerOnly ? 0
    : wage <= lowWage.full ? lowWage.employeePhaseIn * rate.employee / 100 * (wage - lowWage.employerOnly)
    : wage * rate.employee / 100;
  const employer = wage <= lowWage.nil ? 0 : wage * rate.employer / 100;
  const total = employee + employer;
  const split = allocation.find(b => age <= b.upTo);
  const ma = total * split.ma, sa = total * split.sa;
  return { total, employee, employer, oa: total - ma - sa, sa, ma };
}
