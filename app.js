// Read "YYYY-MM-DD" as a local date (new Date(string) reads it as UTC).
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const money = n => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' });
const wholeMoney = n => money(n).replace(/\.00$/, '');
// Money inputs: accept pasted values like "012,345.6" or "$12345" and show
// them as $12,345.60 once the field loses focus.
const parseMoney = str => Number(String(str).replace(/[^0-9.]/g, '')) || 0;
const formatMoney = n => '$' + n.toLocaleString('en-SG',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
document.querySelectorAll('input.money').forEach(input => {
  input.addEventListener('focus', () => input.select()); // typing/pasting replaces, not appends
  input.addEventListener('blur', () => {
    if (input.value.trim() !== '') input.value = formatMoney(parseMoney(input.value));
  });
});

const dash = n => n ? money(n) : '–';
const byId = id => document.getElementById(id);

const { raAge, bhsFixedAge } = CPF_DATA.milestones;
const { growth } = CPF_CONFIG.assumptions;
const { maxAge } = CPF_CONFIG;
for (const id of ['workUntilAge', 'targetAge', 'oaDownpaymentAge', 'oaHousingUntilAge', 'topUpUntilAge']) {
  Object.assign(byId(id), { min: 0, max: maxAge });
}

// Fill page text that quotes CPF figures, so it always matches the database.
const pageText = {
  raAge: String(raAge),
  owCeiling: wholeMoney(CPF_DATA.contributions.owCeiling),
  splitLabel: `${CPF_CONFIG.assumptions.splitToOA * 100}/${(1 - CPF_CONFIG.assumptions.splitToOA) * 100} split: OA and SA/RA`,
  taxRelief: wholeMoney(CPF_DATA.topUps.taxRelief),
  mrssAge: String(CPF_DATA.mrss.minAge),
  mrssMatch: wholeMoney(CPF_DATA.mrss.yearlyMatch),
  mrssCap: wholeMoney(CPF_DATA.mrss.lifetimeCap),
  mrssCriteria: `Singapore Citizen, average income up to ${wholeMoney(CPF_DATA.mrss.maxMonthlyIncome)} a month,
    home annual value up to ${wholeMoney(CPF_DATA.mrss.maxAnnualValue)}, at most
    ${CPF_DATA.mrss.maxProperties === 1 ? 'one property' : `${CPF_DATA.mrss.maxProperties} properties`}.`,
  minWithdrawal: wholeMoney(CPF_DATA.withdrawal.minAtRaAge),
  latestSums: `${latestRetirementSumsYear()} (retirement sums) and ${latestYear(CPF_DATA.bhs)} (BHS)`,
  growthText: `${growth.retirementSums}% a year (retirement sums) and ${growth.bhs}% a year (BHS)`,
};
document.querySelectorAll('[data-cpf]').forEach(el => { el.textContent = pageText[el.dataset.cpf]; });

// Contribution rate choices, from the database, plus self-employed.
const memberSelect = byId('memberType');
for (const [key, type] of Object.entries(CPF_DATA.contributions.memberTypes)) {
  memberSelect.add(new Option(type.label, key));
}
memberSelect.add(new Option(CPF_DATA.selfEmployed.label, 'self'));

// The income field reads differently for self-employed members.
function updateIncomeLabels() {
  const self = memberSelect.value === 'self';
  byId('salaryLabel').textContent = self ? 'Monthly net trade income' : 'Monthly salary';
  byId('salaryHint').textContent = self
    ? `Only MediSave contributions are compulsory, on yearly net trade income (12 x this) up to ${wholeMoney(CPF_DATA.selfEmployed.ntiCap)}.`
    : `Contributions apply to the first ${pageText.owCeiling} a month. Bonuses count up to ${wholeMoney(CPF_DATA.contributions.annualCeiling)} a year in total wages.`;
  byId('bonusField').hidden = self;
}
memberSelect.addEventListener('change', updateIncomeLabels);

// CPF LIFE plans, from the database. CPF's estimate is required for a plan
// without published figures, and optional otherwise.
const planSelect = byId('cpfLifePlan');
for (const [key, plan] of Object.entries(CPF_DATA.cpfLife.plans)) {
  const rate = plan.escalation ? ` (${plan.escalation}% a year)` : '';
  planSelect.add(new Option(`${plan.label}: ${plan.description}${rate}`, key));
}
function updateEstimateHint() {
  const plan = CPF_DATA.cpfLife.plans[planSelect.value];
  byId('estimateHint').textContent = plan.published
    ? "Optional. If entered, replaces the app's estimate."
    : `Required for ${plan.label}: CPF does not publish ${plan.label} Plan figures.`;
}
planSelect.addEventListener('change', updateEstimateHint);

// CPF LIFE start age choices: minAge to maxAge.
const payoutSelect = byId('payoutAge');
for (let a = CPF_DATA.cpfLife.minAge; a <= CPF_DATA.cpfLife.maxAge; a++) {
  payoutSelect.add(new Option(a === CPF_DATA.cpfLife.minAge ? `${a} (earliest)` : String(a), a));
}

// Payout options only show once the forecast reaches the earliest payout age,
// and only offer start ages the forecast reaches.
const targetAgeInput = byId('targetAge');
function updatePayoutOptions() {
  const target = Number(targetAgeInput.value);
  byId('payoutGroup').hidden = !(target >= CPF_DATA.cpfLife.minAge);
  for (const opt of payoutSelect.options) opt.disabled = Number(opt.value) > target;
  if (payoutSelect.selectedOptions[0]?.disabled) {
    payoutSelect.value = String(Math.max(CPF_DATA.cpfLife.minAge, Math.min(target, CPF_DATA.cpfLife.maxAge)));
  }
}
targetAgeInput.addEventListener('input', updatePayoutOptions);

// Withdrawing above the BRS is only allowed with a property pledge.
const pledged = byId('pledged');
const withdraw = byId('withdrawAboveBRS');
function updatePledge() {
  withdraw.disabled = !pledged.checked;
  if (!pledged.checked) withdraw.checked = false;
}
pledged.addEventListener('change', updatePledge);

// Show the BHS and retirement sums that apply to this date of birth.
function updateLimits() {
  const box = byId('limits');
  const dob = byId('dob').value;
  if (!dob) { box.innerHTML = ''; return; }
  setProjection(byId('projectSums').checked ? growth : null);
  const birthYear = parseDate(dob).getFullYear();
  const thisYear = new Date().getFullYear();
  const bhs = getBHS(birthYear, thisYear);
  const sums = getRetirementSums(dob);
  const yearRA = birthYear + raAge;
  const latestRS = latestRetirementSumsYear();
  const orNA = n => n == null ? 'Did not exist yet (Minimum Sum)' : money(n);
  const status = sums?.projected ? ' (projected, not yet published)'
    : yearRA > latestRS ? ` (not yet published, showing ${latestRS})` : '';
  const sumsRows = sums ? `
      <dt>Retirement sums for turning ${raAge} in ${yearRA}${status}</dt><dd></dd>
      <dt>Basic Retirement Sum (BRS)</dt><dd>${orNA(sums.brs)}</dd>
      <dt>Full Retirement Sum (FRS)${sums.brs == null ? ', then called the Minimum Sum' : ''}</dt>
      <dd>${money(sums.frs)}</dd>
      <dt>Enhanced Retirement Sum (ERS)${sums.brs == null && sums.ers != null ? `, current (${thisYear})` : ''}</dt>
      <dd>${orNA(sums.ers)}</dd>`
    : `<dt>Retirement sums: turned ${raAge} before ${CPF_DATA.retirementSums[0].from.slice(0, 4)},
      not in CPF's published table</dt><dd></dd>`;
  box.innerHTML = `
    <dl>
      <dt>Basic Healthcare Sum (BHS)${birthYear + bhsFixedAge <= thisYear ? ', fixed for life' : ''}</dt>
      <dd>${money(bhs)}</dd>${sumsRows}
    </dl>`;
}
byId('dob').addEventListener('change', updateLimits);
byId('projectSums').addEventListener('change', updateLimits);

// ---- Form values ----------------------------------------------------------

// Every form field, by id. Number fields for an age are blank when unset (0).
const form = byId('cpf-form');
const fields = [...form.querySelectorAll('input[id], select[id]')];
const ageFields = ['oaDownpaymentAge', 'oaHousingUntilAge', 'topUpUntilAge'];

function setField(el, value) {
  if (el.type === 'checkbox') el.checked = value === true || value === '1';
  else if (el.classList.contains('money')) el.value = Number(value) ? formatMoney(Number(value)) : '';
  else if (ageFields.includes(el.id)) el.value = Number(value) ? String(value) : '';
  else el.value = String(value);
}

// Form starting values come from config.js.
for (const el of fields) if (el.id in CPF_CONFIG) setField(el, CPF_CONFIG[el.id]);

// Optional sections open when they hold values.
function openFilledSections() {
  for (const section of form.querySelectorAll('details')) {
    const filled = [...section.querySelectorAll('input')].some(el =>
      el.type === 'checkbox' ? el.checked : el.classList.contains('money') ? parseMoney(el.value) > 0 : Number(el.value) !== 0);
    if (filled) section.open = true;
  }
}

// Bring the dependent parts of the form in line with the field values.
function syncForm() {
  updateIncomeLabels();
  updateEstimateHint();
  updatePledge();
  updatePayoutOptions();
  updateLimits();
}

// ---- Shareable links: the inputs live in the address after # --------------
// The part after # never leaves the browser, so the numbers aren't sent to
// the web server, but anyone given the link can see them.

function formToHash() {
  const p = new URLSearchParams();
  for (const el of fields) {
    if (el.type === 'checkbox') { if (el.checked) p.set(el.id, '1'); }
    else if (el.classList.contains('money')) { const n = parseMoney(el.value); if (n) p.set(el.id, n); }
    else if (el.value !== '') p.set(el.id, el.value);
  }
  return p.toString();
}

function hashToForm(hash) {
  const p = new URLSearchParams(hash);
  for (const el of fields) {
    if (p.has(el.id)) setField(el, p.get(el.id));
    else if (el.type === 'checkbox') el.checked = false;
    else if (el.classList.contains('money') || ageFields.includes(el.id)) el.value = '';
  }
}

// ---- Validation -------------------------------------------------------------

function showError(el, message) {
  const box = byId('formError');
  form.querySelectorAll('[aria-invalid]').forEach(f => f.removeAttribute('aria-invalid'));
  if (!message) { box.hidden = true; return true; }
  box.textContent = message;
  box.hidden = false;
  el.setAttribute('aria-invalid', 'true');
  el.closest('details')?.setAttribute('open', '');
  el.focus();
  return false;
}

function validate() {
  const dob = byId('dob');
  if (!dob.value) return showError(dob, 'Enter your date of birth.');
  const born = parseDate(dob.value);
  if (born > new Date()) return showError(dob, 'The date of birth is in the future.');
  const currentAge = new Date().getFullYear() - born.getFullYear();
  if (currentAge > maxAge) return showError(dob, `The calculator covers ages up to ${maxAge}.`);
  const target = Number(targetAgeInput.value);
  if (!targetAgeInput.value || !Number.isInteger(target)) {
    return showError(targetAgeInput, 'Enter the age to forecast to, as a whole number.');
  }
  if (target < currentAge) {
    return showError(targetAgeInput, `Forecast to age ${currentAge} or later: you turn ${currentAge} this year.`);
  }
  if (target > maxAge) return showError(targetAgeInput, `Forecast to age ${maxAge} or younger.`);
  const work = byId('workUntilAge');
  if (work.value === '' || Number(work.value) < 0) return showError(work, 'Enter the age you expect to work until.');
  if (parseMoney(byId('oaDownpayment').value) > 0 && byId('oaDownpaymentAge').value
      && Number(byId('oaDownpaymentAge').value) < currentAge) {
    return showError(byId('oaDownpaymentAge'), `The one-off payment age is before this year (age ${currentAge}).`);
  }
  return showError(null, null);
}

// Inputs and settings for the engine, from the form.
function readForm() {
  const val = id => parseMoney(byId(id).value);
  const num = id => Number(byId(id).value) || 0;
  const birthDate = byId('dob').value; // 'YYYY-MM-DD'
  const birthYear = parseDate(birthDate).getFullYear();
  const inputs = {
    // Age reached this calendar year: the forecast runs year by year from now.
    currentAge: new Date().getFullYear() - birthYear, birthYear, birthDate,
    oa: val('oa'), sa: val('sa'), ma: val('ma'),
    salary: val('salary'), targetAge: num('targetAge'),
  };
  const config = {
    ...CPF_CONFIG,
    memberType: memberSelect.value,
    bonusMonths: memberSelect.value === 'self' ? 0 : num('bonusMonths'),
    salaryGrowth: num('salaryGrowth'),
    oaDownpayment: val('oaDownpayment'),
    oaDownpaymentAge: num('oaDownpaymentAge'),
    oaHousingMonthly: val('oaHousingMonthly'),
    oaHousingUntilAge: num('oaHousingUntilAge'),
    maPremiums: val('maPremiums'),
    maPremiumGrowth: num('maPremiumGrowth'),
    topUpSA: val('topUpSA'),
    topUpMA: val('topUpMA'),
    transferOA: val('transferOA'),
    topUpUntilAge: num('topUpUntilAge'),
    mrssEligible: byId('mrssEligible').checked,
    maOverflow: byId('maOverflow').value,
    raTarget: byId('raTarget').value,
    pledged: pledged.checked,
    withdrawAboveBRS: withdraw.checked,
    withdrawAt55: byId('withdrawAt55').checked,
    projectSums: byId('projectSums').checked,
    workUntilAge: num('workUntilAge'),
    payoutAge: Number(payoutSelect.value),
    cpfLifePlan: planSelect.value,
    sex: byId('sex').value,
    cpfEstimate: val('cpfEstimate'),
  };
  return { inputs, config };
}

// ---- Results: table ---------------------------------------------------------

// Monthly payout: one figure when starting at the earliest age; when deferred, a
// range from the 4%-a-year estimate to the 7%-a-year estimate, each labelled.
const payoutText = p => {
  if (!p) return '–';
  if (Math.round(p.low) === Math.round(p.high)) return money(p.low);
  const { low, high } = CPF_DATA.cpfLife.deferral;
  return `${money(p.low)} <span class="tag">(${low}%)</span> –
    ${money(p.high)} <span class="tag">(${high}%)</span>`;
};

const topUpTotal = t => t ? t.cash + t.transfer + t.ma : 0;

// Table columns. `always` columns show every time; the others only when some
// year has an amount. `value` is the number (for CSV and for hiding columns).
// `plain`: not money. `balance`: shown even when zero (others show a dash).
const COLUMNS = [
  { head: 'Year', value: r => r.year, always: true, plain: true },
  { head: 'Age', value: r => r.age, always: true, plain: true },
  { head: 'OA', value: r => r.oa, always: true, balance: true },
  { head: 'SA/RA', value: r => r.sa + r.premiumLeft, always: true, balance: true },
  { head: 'MA', value: r => r.ma, always: true, balance: true },
  { head: 'BHS', value: r => r.bhs, always: true, balance: true },
  { head: 'Contributions (employee + employer)', value: r => r.contributions?.total, always: true },
  { head: 'Interest earned', value: r => r.interest, always: true, balance: true },
  { head: 'MA overflow → SA/RA', value: r => r.overflowToSA, always: true },
  { head: 'MA overflow → OA', value: r => r.overflowToOA, always: true },
  { head: 'OA used for housing', value: r => r.housing },
  { head: 'MediSave premiums', value: r => r.premiums },
  { head: 'Top-ups and transfers', value: r => topUpTotal(r.topUps) },
  { head: 'MRSS grant', value: r => r.topUps?.grant },
  { head: 'CPF LIFE payout / month', value: r => r.payout?.low, html: r => payoutText(r.payout),
    csv: r => r.payout ? [r.payout.low, r.payout.high].map(n => n.toFixed(2)).join(' to ') : '', always: true },
];

const visibleColumns = rows => COLUMNS.filter(c => c.always || rows.some(r => c.value(r) > 0.005));

function cellHTML(col, r) {
  if (col.html) return col.html(r);
  const v = col.value(r);
  if (col.plain) return String(v);
  if (v == null) return '–';
  return col.balance ? money(v) : dash(v);
}

// Note under the row where the RA is formed: how, which retirement sum was
// met, and what can be withdrawn.
function raNote(ra, hasTopUps) {
  const parts = [`SA closed at ${raAge}. RA formed with ${money(ra.ra + ra.withdrawn)}.`];
  if (ra.saToOA) parts.push(`${money(ra.saToOA)} of SA above that moved to OA.`);
  if (ra.oaToRA) parts.push(`${money(ra.oaToRA)} moved from OA into the RA.`);
  if (ra.ersFellBack) parts.push(`SA + OA could not reach the ERS (${money(ra.sums.ers)}), so the RA stopped at the next sum available.`);
  if (ra.withdrawn) parts.push(`${money(ra.withdrawn)} above the BRS withdrawn as cash (property pledge).`);
  parts.push(ra.met
    ? `<strong>${ra.met} met</strong>${ra.met === 'BRS' ? ' with property pledge' : ''}.`
    : `<strong>Below the minimum</strong>: needs ${money(ra.sums.frs)} (FRS), or ${money(ra.sums.brs)} (BRS) with a property pledge.`);
  if (ra.cashOut) {
    parts.push(`${money(ra.cashOut)} withdrawn as cash.`);
    if (ra.raAfter < ra.ra - 0.005) parts.push(`RA left after the withdrawal: ${money(ra.raAfter)}.`);
  }
  else if (ra.withdrawable) parts.push(`Up to ${money(ra.withdrawable)} can be withdrawn as cash.`);
  if (hasTopUps) parts.push('Cash top-ups and grants can\'t be withdrawn, so the real amount may be lower.');
  if (ra.sums.projected) parts.push('<span class="tag">Retirement sums projected, not published.</span>');
  return parts.join(' ');
}

// Note under the row where CPF LIFE payouts start.
function lifeNote(life) {
  const plan = CPF_DATA.cpfLife.plans[life.plan];
  const intro = `CPF LIFE ${plan.label} Plan payouts start at ${life.startAge}.
    RA of ${money(life.premium)} used to join CPF LIFE.`;
  const rises = plan.escalation ? ` Rises ${plan.escalation}% every year after that.` : '';
  if (life.source === 'cpf') {
    return `${intro} Starting payout of ${money(life.monthly.low)}/month from CPF's
      Monthly Payout Estimator.${rises}`;
  }
  if (!life.source) {
    return `${intro} CPF does not publish ${plan.label} Plan figures, so enter the
      starting payout from CPF's Monthly Payout Estimator to see the payouts.`;
  }
  const deferred = life.startAge - life.base.age;
  const { low, high } = CPF_DATA.cpfLife.deferral;
  const range = deferred
    ? ` Deferring ${deferred} year${deferred > 1 ? 's' : ''} adds ${low}% a year (RA interest
      only) to up to ${high}% a year (CPF's maximum); CPF sets the actual figure when payouts start.`
    : '';
  const female = life.sex === 'female'
    ? ` <strong>CPF's figures are for men</strong>: a woman's payout on the same RA is lower.
      Use CPF's Monthly Payout Estimator for your figure.`
    : '';
  return `${intro} Estimated ${payoutText(life.monthly)}/month, based on an RA of
    ${money(life.base.ra)} at ${life.base.age}.${range}${female}`;
}

// Notes for each row, in order, as HTML strings.
function rowNotes(rows) {
  const notes = new Map();
  const add = (row, text) => notes.set(row, [...(notes.get(row) ?? []), text]);
  const hasTopUps = rows.some(r => topUpTotal(r.topUps) > 0);
  for (const r of rows) {
    if (r.ra) add(r, raNote(r.ra, hasTopUps));
    if (r.life) add(r, lifeNote(r.life));
  }
  const housingShort = rows.find(r => r.housingShort > 0.5);
  if (housingShort) {
    add(housingShort, `OA can't cover all the housing payments from age ${housingShort.age}
      (${money(housingShort.housingShort)} short this year); the rest would be paid in cash.`);
  }
  const premiumsShort = rows.find(r => r.premiumsShort > 0.5);
  if (premiumsShort) {
    add(premiumsShort, `MediSave can't cover all the premiums from age ${premiumsShort.age};
      the rest would be paid in cash.`);
  }
  const grants = rows.filter(r => r.topUps?.grant > 0);
  const totalGrant = grants.reduce((s, r) => s + r.topUps.grant, 0);
  if (totalGrant >= CPF_DATA.mrss.lifetimeCap - 0.5) {
    add(grants[grants.length - 1], `MRSS lifetime cap of ${money(CPF_DATA.mrss.lifetimeCap)} reached.`);
  }
  return notes;
}

function tableHTML(rows, cols) {
  const notes = rowNotes(rows);
  const noteRow = text => `<tr class="note"><td colspan="${cols.length}"><div>${text}</div></td></tr>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr>${cols.map(c => `<th>${c.head}</th>`).join('')}</tr></thead>
      <tbody>
      ${rows.map(r => `<tr>${cols.map(c => `<td>${cellHTML(c, r)}</td>`).join('')}</tr>${
        (notes.get(r) ?? []).map(noteRow).join('')}`).join('')}
      </tbody>
    </table></div>`;
}

// ---- Results: summary and comparison ----------------------------------------

// Headline figures for a forecast. Each item: { key (the same figure in any
// scenario, for comparing), label, value (number or null), text (shown
// instead of value, optional) }.
function summarize(rows, inputs, config) {
  const last = rows[rows.length - 1];
  const sum = f => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const raRow = rows.find(r => r.ra);
  const lifeRow = rows.find(r => r.life);
  const items = [
    { key: 'total', label: `Total CPF at ${last.age}`, value: last.oa + last.sa + last.premiumLeft + last.ma, main: true },
    { key: 'oa', label: `OA at ${last.age}`, value: last.oa },
    { key: 'sa', label: `${last.age >= raAge ? 'RA' : 'SA'} at ${last.age}`, value: last.sa + last.premiumLeft },
    { key: 'ma', label: `MA at ${last.age}`, value: last.ma },
  ];
  if (raRow) {
    items.push({ key: 'ra', label: `RA set aside at ${raAge}`, value: raRow.ra.ra,
                 text: `${wholeMoney(Math.round(raRow.ra.ra))} · ${raRow.ra.met ? `${raRow.ra.met} met` : 'below minimum'}` });
    items.push({ key: 'withdraw', label: raRow.ra.cashOut ? `Withdrawn at ${raAge}` : `Can withdraw at ${raAge}`,
                 value: raRow.ra.cashOut || raRow.ra.withdrawable });
  }
  if (lifeRow) {
    const m = lifeRow.life.monthly;
    items.push({ key: 'payout', label: `CPF LIFE from ${lifeRow.life.startAge}, per month`, value: m ? m.low : null,
                 text: m ? payoutText(m).replace(/\s+/g, ' ') : 'Needs CPF\'s estimate' });
  }
  items.push({ key: 'contributions', label: 'Contributions', value: sum(r => r.contributions?.total) });
  items.push({ key: 'interest', label: 'Interest earned', value: sum(r => r.interest) });
  const optional = [
    ['housing', 'OA used for housing', sum(r => r.housing)],
    ['premiums', 'MediSave premiums', sum(r => r.premiums)],
    ['topUps', 'Top-ups and transfers', sum(r => topUpTotal(r.topUps))],
    ['grants', 'MRSS grants', sum(r => r.topUps?.grant)],
  ];
  for (const [key, label, value] of optional) if (value) items.push({ key, label, value });
  return items;
}

let pinned = null; // a summary kept for comparison: { items, toAge }

function summaryHTML(items) {
  if (!pinned) {
    return `<div class="cards">${items.map(i => `
      <div class="card${i.main ? ' main' : ''}"><div class="card-label">${i.label}</div>
        <div class="card-value">${i.text ?? (i.value == null ? '–' : wholeMoney(Math.round(i.value)))}</div></div>`).join('')}
    </div>`;
  }
  // Side-by-side: kept scenario, this one, and the difference. Figures are
  // matched by key, so they line up even if the forecast ages differ.
  const keys = [...new Set([...items.map(i => i.key), ...pinned.items.map(i => i.key)])];
  const find = (list, key) => list.find(i => i.key === key);
  const show = i => !i ? '–' : i.text ?? (i.value == null ? '–' : wholeMoney(Math.round(i.value)));
  const toAge = current.rows[current.rows.length - 1].age;
  const ages = pinned.toAge === toAge ? '' : ` (to ${pinned.toAge})`;
  return `
    <div class="table-wrap compare"><table>
      <thead><tr><th></th><th>Kept scenario${ages}</th><th>This scenario${ages ? ` (to ${toAge})` : ''}</th><th>Difference</th></tr></thead>
      <tbody>${keys.map(key => {
        const a = find(pinned.items, key), b = find(items, key);
        // "at 70" would mislabel the kept figure when ages differ.
        const atEnd = ['total', 'oa', 'sa', 'ma'].includes(key);
        const label = ages && atEnd ? (b ?? a).label.replace(/ at \d+$/, ' at the end') : (b ?? a).label;
        const diff = a?.value != null && b?.value != null ? b.value - a.value : null;
        const diffText = diff == null || Math.abs(diff) < 0.5 ? '–'
          : `${diff > 0 ? '+' : '−'}${wholeMoney(Math.round(Math.abs(diff)))}`;
        return `<tr><td>${label}</td><td>${show(a)}</td><td>${show(b)}</td>
          <td class="${diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : ''}">${diffText}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

// ---- Results: chart -----------------------------------------------------------

const compact = n => n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

// A round step for about `count` gridlines up to `max`.
function niceStep(max, count) {
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(s => s * pow).find(s => s >= raw);
}

// Stacked bars of OA, SA/RA and MA at the start of each year, with lines at
// the RA age and the CPF LIFE start age.
function chartSVG(rows, config) {
  const W = 720, H = 260, L = 52, R = 8, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const stacks = rows.map(r => [Math.max(0, r.oa), Math.max(0, r.sa + r.premiumLeft), Math.max(0, r.ma)]);
  const maxTotal = Math.max(1, ...stacks.map(s => s[0] + s[1] + s[2]));
  const step = niceStep(maxTotal, 4);
  const top = Math.ceil(maxTotal / step) * step;
  const y = v => T + ph - v / top * ph;
  const slot = pw / rows.length;
  const bw = Math.max(1, slot * 0.78);
  const x = i => L + i * slot + (slot - bw) / 2;
  const labelEvery = Math.ceil(rows.length / 12);
  const parts = [];
  for (let v = 0; v <= top + 0.5; v += step) {
    parts.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`);
  }
  const names = ['OA', 'SA/RA', 'MA'], classes = ['c-oa', 'c-sa', 'c-ma'];
  rows.forEach((r, i) => {
    let base = 0;
    const tip = `Age ${r.age} (${r.year}): ` + names.map((n, k) => `${n} ${money(stacks[i][k])}`).join(', ');
    const rects = stacks[i].map((v, k) => {
      const rect = v > 0 ? `<rect class="${classes[k]}" x="${x(i)}" y="${y(base + v)}" width="${bw}" height="${y(base) - y(base + v)}"/>` : '';
      base += v;
      return rect;
    }).join('');
    parts.push(`<g><title>${tip}</title>${rects}<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ph}"/></g>`);
    if (i % labelEvery === 0) {
      parts.push(`<text class="axis" x="${x(i) + bw / 2}" y="${H - 8}" text-anchor="middle">${r.age}</text>`);
    }
  });
  const marker = (age, text) => {
    const i = rows.findIndex(r => r.age === age);
    if (i < 0) return;
    const mx = L + i * slot;
    parts.push(`<line class="marker" x1="${mx}" x2="${mx}" y1="${T}" y2="${T + ph}"/>
      <text class="axis marker-text" x="${mx + 4}" y="${T + 10}">${text}</text>`);
  };
  if (rows[0].age < raAge) marker(raAge, `RA at ${raAge}`);
  if (rows.some(r => r.life)) marker(config.payoutAge, `CPF LIFE at ${config.payoutAge}`);
  return `
    <figure class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="CPF balances by age, start of each year">${parts.join('')}</svg>
      <figcaption class="legend">
        <span><i class="c-oa"></i>OA</span><span><i class="c-sa"></i>SA/RA (incl. CPF LIFE premium left)</span><span><i class="c-ma"></i>MA</span>
        <span class="hint">Balances at the start of each year, by age.</span>
      </figcaption>
    </figure>`;
}

// ---- Results: footnote, CSV ---------------------------------------------------

function footnoteHTML(inputs, config) {
  const plan = CPF_DATA.cpfLife.plans[config.cpfLifePlan];
  const rateYears = CPF_DATA.contributions.rates.full.map(t => t.from).join(' and ');
  return `<p class="footnote">Each row is a calendar year; age is the age reached that year.
      Balances are at the start of the year. Contributions use CPF's contribution and
      allocation rates for ${rateYears} (later years reuse the latest), on salary up to
      ${wholeMoney(CPF_DATA.contributions.owCeiling)} a month plus bonuses within the
      ${wholeMoney(CPF_DATA.contributions.annualCeiling)} yearly ceiling, credited monthly.
      Graduated SPR rates step up each calendar year. Self-employed MediSave uses CPF's
      ${CPF_DATA.selfEmployed.year} rates. Top-ups are made at the end of each year.
      Once payouts start, SA/RA shows the CPF LIFE premium left (premium minus payouts
      received, which goes to beneficiaries) plus any new RA savings.
      ${config.projectSums
        ? `Retirement sums after ${latestRetirementSumsYear()} and the BHS after ${latestYear(CPF_DATA.bhs)}
           are projected at ${growth.retirementSums}% and ${growth.bhs}% a year: estimates, not CPF figures.`
        : `Uses CPF's published figures only. Years after ${latestYear(CPF_DATA.bhs)} (BHS) and
           ${latestRetirementSumsYear()} (retirement sums) reuse the latest published figure.`}
      ${config.cpfEstimate > 0
        ? "CPF LIFE payouts start from the figure entered from CPF's Monthly Payout Estimator."
        : !plan.published
        ? `${plan.label} Plan payouts need the starting figure from CPF's Monthly Payout Estimator.`
        : `${plan.label} Plan payouts are estimates from CPF's published
      ${CPF_DATA.cpfLife.estimates.cohort} figures (male), scaled to the RA balance. Deferred
      payouts are shown as a range, from ${CPF_DATA.cpfLife.deferral.low}% to
      ${CPF_DATA.cpfLife.deferral.high}% more per year deferred.`}
      ${plan.escalation ? `${plan.label} Plan payouts rise ${plan.escalation}% every year.` : ''}
      ${inputs.currentAge > config.payoutAge ? 'Payouts are not shown because the chosen start age has already passed.' : ''}
      This is an estimate, not advice: check your figures with CPF's own planners.</p>`;
}

function downloadCSV(rows) {
  const cols = visibleColumns(rows);
  const cell = (c, r) => {
    if (c.csv) return c.csv(r);
    const v = c.value(r);
    return v == null ? '' : c.plain ? String(v) : v.toFixed(2);
  };
  const quote = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [cols.map(c => quote(c.head)).join(','),
    ...rows.map(r => cols.map(c => quote(cell(c, r))).join(','))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }); // BOM: Excel then reads the → in headings as UTF-8
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date(); // local date, not UTC
  const ymd = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  a.download = `cpf-forecast-${ymd}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Calculate ----------------------------------------------------------------

let current = null; // the latest forecast: { rows, inputs, config, items }

function render() {
  const { rows, inputs, config, items } = current;
  const cols = visibleColumns(rows);
  byId('results').innerHTML = `
    <h2>Forecast</h2>
    ${summaryHTML(items)}
    <div class="actions">
      <button type="button" id="copyLink">Copy link to this forecast</button>
      <button type="button" id="pin">${pinned ? 'Keep this one instead' : 'Keep for comparison'}</button>
      ${pinned ? '<button type="button" id="unpin">Stop comparing</button>' : ''}
      <button type="button" id="csv">Download CSV</button>
      <button type="button" id="print">Print or save as PDF</button>
      <span id="actionStatus" class="hint" role="status"></span>
    </div>
    ${pinned ? '<p class="hint">Change the form and calculate again to compare with the kept scenario.</p>' : ''}
    ${chartSVG(rows, config)}
    ${tableHTML(rows, cols)}
    ${footnoteHTML(inputs, config)}`;

  byId('copyLink').addEventListener('click', async () => {
    const status = byId('actionStatus');
    try {
      await navigator.clipboard.writeText(location.href);
      status.textContent = 'Link copied. Anyone with it can see the numbers you entered.';
    } catch {
      status.textContent = 'Copy the address from the address bar to share this forecast.';
    }
  });
  byId('pin').addEventListener('click', () => {
    pinned = { items, toAge: rows[rows.length - 1].age };
    render();
    byId('actionStatus').textContent = 'Kept. Change the form and calculate again to compare.';
  });
  byId('unpin')?.addEventListener('click', () => { pinned = null; render(); });
  byId('csv').addEventListener('click', () => downloadCSV(rows));
  byId('print').addEventListener('click', () => window.print());
}

function calculate() {
  if (!validate()) return false;
  const { inputs, config } = readForm();
  const rows = forecast(inputs, config);
  current = { rows, inputs, config, items: summarize(rows, inputs, config) };
  render();
  history.replaceState(null, '', `#${formToHash()}`); // the address is now a link to this forecast
  return true;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (calculate()) byId('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Fill the form from a shared link, if any, and show its forecast. Runs at
// start, and when a different link is opened in the same tab.
function loadFromAddress() {
  if (location.hash.length > 1) hashToForm(location.hash.slice(1));
  syncForm();
  openFilledSections();
  if (location.hash.length > 1 && byId('dob').value) calculate();
}
window.addEventListener('hashchange', loadFromAddress);
loadFromAddress();
