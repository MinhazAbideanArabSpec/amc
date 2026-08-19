// display.js — office wall-screen dashboard. Self-contained: does NOT use
// config.js's session timeout, so this screen never logs itself out — it
// relies purely on Supabase's own token auto-refresh, which keeps the
// session alive indefinitely as long as this tab stays open and online.

const SUPABASE_URL = 'https://taihtmdhismfnhmboryy.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWh0bWRoaXNtZm5obWJvcnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODgyODQsImV4cCI6MjA5NzA2NDI4NH0.DuK5pfabqbW-pWvfc5EJ8qc2-fvk0cVHIRuT1WUWS_c';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const RENEWAL_THRESHOLD_DAYS = 90;
const VISIT_THRESHOLD_DAYS = 30;
const PAGE_SIZE = 5;
const PAGE_INTERVAL_MS = 12000;
const DATA_REFRESH_MS = 5 * 60 * 1000;

var _otpEmail = '';
var _renewalItems = [];
var _visitItems = [];
var _pages = [];      // [{ section:'renewal'|'visit', items:[...] }, ...]
var _pageIndex = 0;

const SECTION_META = {
  renewal: { title: 'Expiring & Expired Renewals', subtitle: `ArabSpec AMC Portal — Office Display · updates automatically` },
  visit:   { title: 'Upcoming AMC Site Visits',     subtitle: `Scheduled maintenance visits — next ${VISIT_THRESHOLD_DAYS} days, plus any active AMC company with no visit set this month` },
};

// ── Login (minimal, same OTP flow as the main app) ──────────────
async function dSendOtp() {
  const email = document.getElementById('dlogin-email').value.trim();
  const errEl = document.getElementById('dlogin-error');
  const btn   = document.getElementById('dbtn-send-otp');
  errEl.style.display = 'none';

  if (!email) { errEl.textContent = 'Enter your email address.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Sending…';
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: null } });
  btn.disabled = false;
  btn.textContent = 'Send Sign-In Code';

  if (error) {
    errEl.textContent = 'Failed to send code: ' + error.message;
    errEl.style.display = 'block';
    return;
  }

  _otpEmail = email;
  document.getElementById('dlogin-otp-msg').textContent = `We sent an 8-digit code to ${email}`;
  document.getElementById('dlogin-step-email').style.display = 'none';
  document.getElementById('dlogin-step-otp').style.display = 'block';
  document.getElementById('dlogin-otp').value = '';
  document.getElementById('dlogin-otp').focus();
}

async function dVerifyOtp() {
  const token = document.getElementById('dlogin-otp').value.trim().replace(/\s/g, '');
  const errEl = document.getElementById('dlogin-otp-error');
  const btn   = document.getElementById('dbtn-verify-otp');
  errEl.style.display = 'none';

  if (!token || token.length < 6) { errEl.textContent = 'Enter the code from your email.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Verifying…';
  const { error } = await sb.auth.verifyOtp({ email: _otpEmail, token, type: 'email' });
  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (error) {
    errEl.textContent = 'Invalid or expired code. Try again.';
    errEl.style.display = 'block';
    return;
  }

  await checkAdminAndStart();
}

function showLogin(message) {
  document.getElementById('display-login').style.display = 'flex';
  document.getElementById('display-screen').style.display = 'none';
  if (message) {
    const errEl = document.getElementById('dlogin-error');
    errEl.textContent = message;
    errEl.style.display = 'block';
  }
}

async function checkAdminAndStart() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return showLogin();

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    await sb.auth.signOut({ scope: 'local' });
    return showLogin('This screen is for admin accounts only.');
  }

  document.getElementById('display-login').style.display = 'none';
  document.getElementById('display-screen').style.display = 'block';
  startDisplay();
}

window.addEventListener('load', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await checkAdminAndStart();
  else showLogin();

  document.getElementById('dlogin-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') dSendOtp(); });
  document.getElementById('dlogin-otp')?.addEventListener('keydown', e => { if (e.key === 'Enter') dVerifyOtp(); });
});

// ── Data + rendering ─────────────────────────────────────────────
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function fmtDispDate(iso) {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function isInCurrentMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function renderRenewalRow(it) {
  const expired = it.days < 0;
  const rowCls = expired ? 'expired' : 'expiring';
  const daysCls = expired ? 'expired-text' : 'expiring-text';
  const daysLabel = expired ? `${Math.abs(it.days)}d overdue` : `${it.days}d left`;
  const badgeCls = it.type === 'Contract' ? 'contract' : 'renewal';
  return `
    <div class="disp-row ${rowCls}">
      <div class="disp-type-badge ${badgeCls}">${it.type}</div>
      <div>
        <div class="disp-customer">${it.customer}</div>
        <div class="disp-item">${it.name}${it.vendor ? ' · ' + it.vendor : ''}</div>
      </div>
      <div class="disp-date">Expires ${fmtDispDate(it.end_date)}</div>
      <div class="disp-days ${daysCls}">${daysLabel}</div>
    </div>`;
}

function renderVisitRow(it) {
  if (it.notScheduled) {
    return `
      <div class="disp-row expired">
        <div class="disp-type-badge visit">Visit</div>
        <div>
          <div class="disp-customer">${it.customer}</div>
          <div class="disp-item">Active AMC contract</div>
        </div>
        <div class="disp-date">This month</div>
        <div class="disp-days expired-text">NOT SCHEDULED</div>
      </div>`;
  }
  if (it.reported) {
    return `
      <div class="disp-row reported">
        <div class="disp-type-badge visit">Visit</div>
        <div>
          <div class="disp-customer">${it.customer}</div>
        </div>
        <div class="disp-date">Visited ${fmtDispDate(it.next_visit_date)}</div>
        <div class="disp-days reported-text">REPORT UPDATED</div>
      </div>`;
  }
  const daysLabel = it.days === 0 ? 'today' : it.days === 1 ? '1d away' : `${it.days}d away`;
  return `
    <div class="disp-row visit">
      <div class="disp-type-badge visit">Visit</div>
      <div>
        <div class="disp-customer">${it.customer}</div>
      </div>
      <div class="disp-date">Scheduled ${fmtDispDate(it.next_visit_date)}</div>
      <div class="disp-days visit-text">${daysLabel}</div>
    </div>`;
}

async function loadData() {
  const [{ data: contracts }, { data: subs }, { data: allCustomers }, { data: reports }] = await Promise.all([
    sb.from('contracts').select('contract_number, end_date, customer_id, profiles!contracts_customer_id_fkey(name)').eq('status', 'active'),
    sb.from('subscriptions').select('software_name, vendor, end_date, profiles!subscriptions_customer_id_fkey(name)'),
    sb.from('profiles').select('id, name, next_visit_date').eq('role', 'customer').is('customer_id', null),
    sb.from('visit_reports').select('customer_id, visit_date'),
  ]);

  const renewalItems = [];
  (contracts || []).forEach(c => {
    const days = daysUntil(c.end_date);
    if (days <= RENEWAL_THRESHOLD_DAYS) renewalItems.push({ type: 'Contract', name: c.contract_number, customer: c.profiles?.name || '—', end_date: c.end_date, days });
  });
  (subs || []).forEach(s => {
    const days = daysUntil(s.end_date);
    if (days <= RENEWAL_THRESHOLD_DAYS) renewalItems.push({ type: 'Renewal', name: s.software_name, vendor: s.vendor, customer: s.profiles?.name || '—', end_date: s.end_date, days });
  });
  renewalItems.sort((a, b) => a.days - b.days);
  _renewalItems = renewalItems;

  const visitDateByCustomer = {};
  (allCustomers || []).forEach(p => { visitDateByCustomer[p.id] = p.next_visit_date; });

  // Active-AMC companies (dedup by customer, they may hold multiple active contracts)
  // that have no visit dated within the current calendar month.
  const activeContractCustomers = new Map();
  (contracts || []).forEach(c => {
    if (c.customer_id) activeContractCustomers.set(c.customer_id, c.profiles?.name || '—');
  });
  const notScheduledItems = [];
  activeContractCustomers.forEach((name, custId) => {
    if (!isInCurrentMonth(visitDateByCustomer[custId])) notScheduledItems.push({ customer: name, notScheduled: true });
  });
  notScheduledItems.sort((a, b) => a.customer.localeCompare(b.customer));

  // A visit report already filed for the customer on their scheduled date means
  // that visit is done — show it as reported instead of a pending countdown.
  const reportedKeys = new Set((reports || []).map(r => r.customer_id + '|' + r.visit_date));

  const pendingItems = [];
  const reportedItems = [];
  (allCustomers || []).forEach(p => {
    if (!p.next_visit_date) return;
    const days = daysUntil(p.next_visit_date);
    if (days < 0 || days > VISIT_THRESHOLD_DAYS) return;
    const item = { customer: p.name, next_visit_date: p.next_visit_date, days };
    if (reportedKeys.has(p.id + '|' + p.next_visit_date)) reportedItems.push({ ...item, reported: true });
    else pendingItems.push(item);
  });
  pendingItems.sort((a, b) => a.days - b.days);
  reportedItems.sort((a, b) => a.days - b.days);

  _visitItems = [...notScheduledItems, ...pendingItems, ...reportedItems];

  buildPages();
  renderCurrentPage();
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]]; // always at least one (possibly empty) page
}

function buildPages() {
  const pages = [];
  chunk(_renewalItems, PAGE_SIZE).forEach(items => pages.push({ section: 'renewal', items }));
  chunk(_visitItems, PAGE_SIZE).forEach(items => pages.push({ section: 'visit', items }));
  _pages = pages;
  if (_pageIndex >= _pages.length) _pageIndex = 0;
}

function renderCurrentPage() {
  const grid = document.getElementById('disp-grid');
  const dots = document.getElementById('disp-pagedots');
  const page = _pages[_pageIndex];
  if (!page) return;

  const meta = SECTION_META[page.section];
  document.getElementById('disp-title').textContent = meta.title;
  document.getElementById('disp-subtitle').textContent = meta.subtitle;

  if (!page.items.length) {
    const emptyMsg = page.section === 'renewal'
      ? `✓ Nothing expiring in the next ${RENEWAL_THRESHOLD_DAYS} days — all clear.`
      : `✓ No visits scheduled in the next ${VISIT_THRESHOLD_DAYS} days, and every active AMC company has a visit set this month.`;
    grid.innerHTML = `<div class="disp-empty">${emptyMsg}</div>`;
  } else {
    grid.innerHTML = page.items.map(it => page.section === 'renewal' ? renderRenewalRow(it) : renderVisitRow(it)).join('');
  }

  dots.innerHTML = _pages.length > 1
    ? _pages.map((_, i) => `<div class="disp-dot ${i === _pageIndex ? 'active' : ''}"></div>`).join('')
    : '';
}

function updateClock() {
  const now = new Date();
  document.getElementById('disp-time').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('disp-date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function startDisplay() {
  loadData();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(loadData, DATA_REFRESH_MS);
  setInterval(() => {
    if (_pages.length > 1) {
      _pageIndex = (_pageIndex + 1) % _pages.length;
      renderCurrentPage();
    }
  }, PAGE_INTERVAL_MS);
}
