// Read "YYYY-MM-DD" as a local date (new Date(string) reads it as UTC).
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const money = n => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' });
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
const latest = table => Math.max(...Object.keys(table).map(Number));

const COLS = 11;
const { raAge, bhsFixedAge } = CPF_DATA.milestones;

// Fill page text that quotes CPF figures, so it always matches the database.
const pageText = {
  raAge: String(raAge),
  owCeiling: money(CPF_DATA.contributions.owCeiling).replace(/\.00$/, ''),
  splitLabel: `${CPF_CONFIG.assumptions.splitToOA * 100}/${(1 - CPF_CONFIG.assumptions.splitToOA) * 100} split: OA and SA/RA`,
};
document.querySelectorAll('[data-cpf]').forEach(el => { el.textContent = pageText[el.dataset.cpf]; });

// Form starting values come from config.js.
const byId = id => document.getElementById(id);
byId('maOverflow').value = CPF_CONFIG.maOverflow;
byId('raTarget').value = CPF_CONFIG.raTarget;
byId('pledged').checked = CPF_CONFIG.pledged;
byId('withdrawAboveBRS').checked = CPF_CONFIG.pledged && CPF_CONFIG.withdrawAboveBRS;
byId('withdrawAboveBRS').disabled = !CPF_CONFIG.pledged;
byId('workUntilAge').value = CPF_CONFIG.workUntilAge;
byId('targetAge').value = CPF_CONFIG.targetAge;
const noteRow = text => `<tr class="note"><td colspan="${COLS}"><div>${text}</div></td></tr>`;

// Note under the row where the RA is formed: how, and which retirement sum was met.
function raNote(ra) {
  const parts = [`SA closed at ${raAge}. RA formed with ${money(ra.ra + ra.withdrawn)}.`];
  if (ra.saToOA) parts.push(`${money(ra.saToOA)} of SA above that moved to OA.`);
  if (ra.oaToRA) parts.push(`${money(ra.oaToRA)} moved from OA into the RA.`);
  if (ra.ersFellBack) parts.push(`SA + OA could not reach the ERS (${money(ra.sums.ers)}), so the RA stopped at the next sum available.`);
  if (ra.withdrawn) parts.push(`${money(ra.withdrawn)} above the BRS withdrawn as cash (property pledge).`);
  parts.push(ra.met
    ? `<strong>${ra.met} met</strong>${ra.met === 'BRS' ? ' with property pledge' : ''}.`
    : `<strong>Below the minimum</strong>: needs ${money(ra.sums.frs)} (FRS), or ${money(ra.sums.brs)} (BRS) with a property pledge.`);
  return noteRow(parts.join(' '));
}

// Monthly payout: one figure when starting at the earliest age; when deferred, a
// range from the 4%-a-year estimate to the 7%-a-year estimate, each labelled.
const payoutText = p => {
  if (!p) return '–';
  if (Math.round(p.low) === Math.round(p.high)) return money(p.low);
  const { low, high } = CPF_DATA.cpfLife.deferral;
  return `${money(p.low)} <span class="tag">(${low}%)</span> –
    ${money(p.high)} <span class="tag">(${high}%)</span>`;
};

// Note under the row where CPF LIFE payouts start.
function lifeNote(life) {
  const plan = CPF_DATA.cpfLife.plans[life.plan];
  const intro = `CPF LIFE ${plan.label} Plan payouts start at ${life.startAge}.
    RA of ${money(life.premium)} used to join CPF LIFE.`;
  const rises = plan.escalation ? ` Rises ${plan.escalation}% every year after that.` : '';
  if (life.source === 'cpf') {
    return noteRow(`${intro} Starting payout of ${money(life.monthly.low)}/month from CPF's
      Monthly Payout Estimator.${rises}`);
  }
  if (!life.source) {
    return noteRow(`${intro} CPF does not publish ${plan.label} Plan figures, so enter the
      starting payout from CPF's Monthly Payout Estimator to see the payouts.`);
  }
  const deferred = life.startAge - life.base.age;
  const { low, high } = CPF_DATA.cpfLife.deferral;
  const range = deferred
    ? ` Deferring ${deferred} year${deferred > 1 ? 's' : ''} adds ${low}% a year (RA interest
      only) to up to ${high}% a year (CPF's maximum); CPF sets the actual figure when payouts start.`
    : '';
  return noteRow(`${intro} Estimated ${payoutText(life.monthly)}/month, based on an RA of
    ${money(life.base.ra)} at ${life.base.age}.${range}`);
}

// CPF LIFE plans, from the database. CPF's estimate is required for a plan
// without published figures, and optional otherwise.
const planSelect = document.getElementById('cpfLifePlan');
for (const [key, plan] of Object.entries(CPF_DATA.cpfLife.plans)) {
  const describe = plan.escalation
    ? `starts lower, rises ${plan.escalation}% every year`
    : 'same payout every month for life';
  planSelect.add(new Option(`${plan.label}: ${describe}`, key));
}
planSelect.value = CPF_CONFIG.cpfLifePlan;
function updateEstimateHint() {
  const plan = CPF_DATA.cpfLife.plans[planSelect.value];
  document.getElementById('estimateHint').textContent = plan.published
    ? "Optional. If entered, replaces the app's estimate."
    : `Required for ${plan.label}: CPF does not publish ${plan.label} Plan figures.`;
}
planSelect.addEventListener('change', updateEstimateHint);
updateEstimateHint();

// CPF LIFE start age choices: minAge to maxAge.
const payoutSelect = document.getElementById('payoutAge');
for (let a = CPF_DATA.cpfLife.minAge; a <= CPF_DATA.cpfLife.maxAge; a++) {
  payoutSelect.add(new Option(a === CPF_DATA.cpfLife.minAge ? `${a} (earliest)` : String(a), a));
}

// Payout options only show once the forecast reaches the earliest payout age,
// and only offer start ages the forecast reaches.
const targetAgeInput = document.getElementById('targetAge');
function updatePayoutOptions() {
  const target = Number(targetAgeInput.value);
  document.getElementById('payoutGroup').hidden = !(target >= CPF_DATA.cpfLife.minAge);
  for (const opt of payoutSelect.options) opt.disabled = Number(opt.value) > target;
  if (payoutSelect.selectedOptions[0]?.disabled) {
    payoutSelect.value = String(Math.max(CPF_DATA.cpfLife.minAge, Math.min(target, CPF_DATA.cpfLife.maxAge)));
  }
}
targetAgeInput.addEventListener('input', updatePayoutOptions);
payoutSelect.value = String(CPF_CONFIG.payoutAge);
updatePayoutOptions();

// Withdrawing above the BRS is only allowed with a property pledge.
const pledged = document.getElementById('pledged');
const withdraw = document.getElementById('withdrawAboveBRS');
pledged.addEventListener('change', () => {
  withdraw.disabled = !pledged.checked;
  if (!pledged.checked) withdraw.checked = false;
});

// Show the BHS and retirement sums that apply to this date of birth.
document.getElementById('dob').addEventListener('change', e => {
  const box = document.getElementById('limits');
  if (!e.target.value) { box.innerHTML = ''; return; }
  const birthYear = parseDate(e.target.value).getFullYear();
  const bhs = getBHS(birthYear, new Date().getFullYear());
  const sums = getRetirementSums(e.target.value);
  const yearRA = birthYear + raAge;
  const latestRS = latestRetirementSumsYear();
  const orNA = n => n == null ? 'Did not exist yet (Minimum Sum)' : money(n);
  const sumsRows = sums ? `
      <dt>Retirement sums for turning ${raAge} in ${yearRA}${yearRA > latestRS
        ? ` (not yet published, showing ${latestRS})` : ''}</dt><dd></dd>
      <dt>Basic Retirement Sum (BRS)</dt><dd>${orNA(sums.brs)}</dd>
      <dt>Full Retirement Sum (FRS)${sums.brs == null ? ', then called the Minimum Sum' : ''}</dt>
      <dd>${money(sums.frs)}</dd>
      <dt>Enhanced Retirement Sum (ERS)${sums.brs == null && sums.ers != null ? `, current (${new Date().getFullYear()})` : ''}</dt>
      <dd>${orNA(sums.ers)}</dd>`
    : `<dt>Retirement sums: turned ${raAge} before ${CPF_DATA.retirementSums[0].from.slice(0, 4)},
      not in CPF's published table</dt><dd></dd>`;
  box.innerHTML = `
    <dl>
      <dt>Basic Healthcare Sum (BHS)${birthYear + bhsFixedAge <= new Date().getFullYear() ? ', fixed for life' : ''}</dt>
      <dd>${money(bhs)}</dd>${sumsRows}
    </dl>`;
});

document.getElementById('cpf-form').addEventListener('submit', e => {
  e.preventDefault();
  const val = id => parseMoney(document.getElementById(id).value);
  const birthDate = document.getElementById('dob').value; // 'YYYY-MM-DD'
  const birthYear = parseDate(birthDate).getFullYear();
  const inputs = {
    // Age reached this calendar year: the forecast runs year by year from now.
    currentAge: new Date().getFullYear() - birthYear, birthYear, birthDate,
    oa: val('oa'), sa: val('sa'), ma: val('ma'),
    salary: val('salary'), targetAge: val('targetAge'),
  };
  const config = {
    ...CPF_CONFIG,
    maOverflow: document.getElementById('maOverflow').value,
    raTarget: document.getElementById('raTarget').value,
    pledged: pledged.checked,
    withdrawAboveBRS: withdraw.checked,
    workUntilAge: Number(document.getElementById('workUntilAge').value),
    payoutAge: Number(payoutSelect.value),
    cpfLifePlan: planSelect.value,
    cpfEstimate: val('cpfEstimate'),
  };
  const rows = forecast(inputs, config);
  document.getElementById('results').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Year</th><th>Age</th><th>OA</th><th>SA/RA</th><th>MA</th><th>BHS</th>
        <th>Contributions (employee + employer)</th><th>Interest earned</th><th>MA overflow → SA/RA</th><th>MA overflow → OA</th>
        <th>CPF LIFE payout / month</th></tr></thead>
      <tbody>
      ${rows.map(r => `<tr><td>${r.year}</td><td>${r.age}</td><td>${money(r.oa)}</td>
        <td>${money(r.sa + r.premiumLeft)}</td>
        <td>${money(r.ma)}</td>
        <td>${money(r.bhs)}</td>
        <td>${r.contributions ? money(r.contributions.total) : '–'}</td>
        <td>${r.interest == null ? '–' : money(r.interest)}</td>
        <td>${dash(r.overflowToSA)}</td>
        <td>${dash(r.overflowToOA)}</td>
        <td>${payoutText(r.payout)}</td></tr>${r.ra ? raNote(r.ra) : ''}${r.life ? lifeNote(r.life) : ''}`).join('')}
      </tbody>
    </table></div>
    <p class="footnote">Each row is a calendar year; age is the age reached that year.
      Contributions use CPF's ${CPF_DATA.contributions.year} contribution and allocation rates
      (Singapore Citizens and PRs from the 3rd year) on the salary up to
      ${money(CPF_DATA.contributions.owCeiling)} a month, and are credited monthly.
      Once payouts start, SA/RA shows the CPF LIFE premium left (premium minus payouts
      received, which goes to beneficiaries) plus any new RA savings.
      Uses CPF's published figures only. Years after
      ${latest(CPF_DATA.bhs)} (BHS) and ${latestRetirementSumsYear()} (retirement sums)
      reuse the latest published figure. ${config.cpfEstimate > 0
        ? "CPF LIFE payouts start from the figure entered from CPF's Monthly Payout Estimator."
        : `Standard Plan payouts are estimates from CPF's published
      ${CPF_DATA.cpfLife.estimates.cohort} figures (male), scaled to the RA balance. Deferred
      payouts are shown as a range, from ${CPF_DATA.cpfLife.deferral.low}% to
      ${CPF_DATA.cpfLife.deferral.high}% more per year deferred.`}
      ${CPF_DATA.cpfLife.plans[config.cpfLifePlan].escalation
        ? `${CPF_DATA.cpfLife.plans[config.cpfLifePlan].label} Plan payouts rise
          ${CPF_DATA.cpfLife.plans[config.cpfLifePlan].escalation}% every year.` : ''}
      ${inputs.currentAge > config.payoutAge ? 'Payouts are not shown because the chosen start age has already passed.' : ''}</p>`;
});
