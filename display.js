// display.js — office wall-screen dashboard. Self-contained: does NOT use
// config.js's session timeout, so this screen never logs itself out — it
// relies purely on Supabase's own token auto-refresh, which keeps the
// session alive indefinitely as long as this tab stays open and online.

const SUPABASE_URL = 'https://taihtmdhismfnhmboryy.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWh0bWRoaXNtZm5obWJvcnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODgyODQsImV4cCI6MjA5NzA2NDI4NH0.DuK5pfabqbW-pWvfc5EJ8qc2-fvk0cVHIRuT1WUWS_c';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const THRESHOLD_DAYS = 60;
const PAGE_SIZE = 8;
const PAGE_INTERVAL_MS = 12000;
const DATA_REFRESH_MS = 5 * 60 * 1000;

var _otpEmail = '';
var _items = [];
var _page = 0;

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
    await sb.auth.signOut();
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

async function loadData() {
  const [{ data: contracts }, { data: subs }] = await Promise.all([
    sb.from('contracts').select('contract_number, end_date, profiles!contracts_customer_id_fkey(name)').eq('status', 'active'),
    sb.from('subscriptions').select('software_name, vendor, end_date, profiles!subscriptions_customer_id_fkey(name)'),
  ]);

  const items = [];
  (contracts || []).forEach(c => {
    const days = daysUntil(c.end_date);
    if (days <= THRESHOLD_DAYS) items.push({ type: 'Contract', name: c.contract_number, customer: c.profiles?.name || '—', end_date: c.end_date, days });
  });
  (subs || []).forEach(s => {
    const days = daysUntil(s.end_date);
    if (days <= THRESHOLD_DAYS) items.push({ type: 'Renewal', name: s.software_name, vendor: s.vendor, customer: s.profiles?.name || '—', end_date: s.end_date, days });
  });

  items.sort((a, b) => a.days - b.days);
  _items = items;
  if (_page * PAGE_SIZE >= _items.length) _page = 0;
  renderPage();
}

function renderPage() {
  const grid = document.getElementById('disp-grid');
  const dots = document.getElementById('disp-pagedots');

  if (!_items.length) {
    grid.innerHTML = '<div class="disp-empty">✓ Nothing expiring in the next ' + THRESHOLD_DAYS + ' days — all clear.</div>';
    dots.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(_items.length / PAGE_SIZE);
  const pageItems = _items.slice(_page * PAGE_SIZE, _page * PAGE_SIZE + PAGE_SIZE);

  grid.innerHTML = pageItems.map(it => {
    const urgent = it.days < 0;
    const soon = !urgent && it.days <= 14;
    const rowCls = urgent ? 'urgent' : soon ? 'soon' : '';
    const daysCls = urgent ? 'urgent-text' : soon ? 'soon-text' : '';
    const daysLabel = urgent ? `${Math.abs(it.days)}d overdue` : `${it.days}d left`;
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
  }).join('');

  dots.innerHTML = totalPages > 1
    ? Array.from({ length: totalPages }, (_, i) => `<div class="disp-dot ${i === _page ? 'active' : ''}"></div>`).join('')
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
    const totalPages = Math.ceil(_items.length / PAGE_SIZE);
    if (totalPages > 1) {
      _page = (_page + 1) % totalPages;
      renderPage();
    }
  }, PAGE_INTERVAL_MS);
}
