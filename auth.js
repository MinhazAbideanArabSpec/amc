// auth.js — authentication, tab switching, hash-based routing

var _otpEmail = '';

// ══════════════════════════════════════════════════════════
//  HASH ROUTING
// ══════════════════════════════════════════════════════════

// Valid hashes per role
var ADMIN_TABS    = ['overview','users','contracts','assets','reports','status','subs','tags'];
var CUSTOMER_TABS = ['overview','reports','assets','dc','contract'];

// Set the URL hash using history API — no reload, no hashchange side-effects
var _suppressHashChange = false;
function setHash(hash) {
  _suppressHashChange = true;
  const newHash = hash ? '#/' + hash : window.location.pathname + window.location.search;
  try {
    history.replaceState(null, '', newHash);
  } catch(e) {
    window.location.hash = hash || '';
  }
  setTimeout(() => { _suppressHashChange = false; }, 50);
}

// Read current hash → return tab name, or null if unrecognised
function getHashTab() {
  const hash = window.location.hash.replace('#/', '').replace('#', '').toLowerCase();
  return hash || null;
}

// Navigate to the correct tab based on current hash (called on load + hashchange)
function applyHash() {
  if (_suppressHashChange) return;
  const tab = getHashTab();
  if (!tab || !myProfile) return;

  if (myProfile.role === 'admin') {
    if (ADMIN_TABS.includes(tab)) switchAdminTab(tab);
  } else {
    if (CUSTOMER_TABS.includes(tab)) switchCustomerTab(tab);
  }
}

// Listen for back/forward navigation
window.addEventListener('hashchange', applyHash);

// ── Step 1: Send OTP ─────────────────────────────────────────
async function sendOtp() {
  const email  = document.getElementById('login-email').value.trim();
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('btn-send-otp');
  errEl.style.display = 'none';

  if (!email) {
    errEl.textContent = 'Please enter your email address.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: null,
    }
  });

  btn.disabled = false;
  btn.textContent = 'Send sign-in code';

  if (error) {
    errEl.textContent = error.message.includes('not found') || error.message.includes('Invalid')
      ? 'No account found for this email. Contact your admin.'
      : 'Failed to send code: ' + error.message;
    errEl.style.display = 'block';
    return;
  }

  _otpEmail = email;
  document.getElementById('login-otp-msg').textContent =
    `We sent an 8-digit code to ${email}`;
  document.getElementById('login-step-email').style.display = 'none';
  document.getElementById('login-step-otp').style.display = 'block';
  document.getElementById('login-otp').value = '';
  document.getElementById('login-otp').focus();
}

// ── Step 2: Verify OTP ───────────────────────────────────────
async function verifyOtp() {
  const token  = document.getElementById('login-otp').value.trim().replace(/\s/g,'');
  const errEl  = document.getElementById('login-otp-error');
  const btn    = document.getElementById('btn-verify-otp');
  errEl.style.display = 'none';

  if (!token || token.length < 6) {
    errEl.textContent = 'Please enter the code from your email.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verifying…';

  const { error } = await sb.auth.verifyOtp({
    email: _otpEmail,
    token,
    type: 'email'
  });

  btn.disabled = false;
  btn.textContent = 'Verify and sign in';

  if (error) {
    errEl.textContent = 'Invalid or expired code. Try again or request a new one.';
    errEl.style.display = 'block';
    return;
  }

  await afterLogin();
}

async function resendOtp() {
  const btn = document.getElementById('btn-resend');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  await sb.auth.signInWithOtp({ email: _otpEmail, options: { shouldCreateUser: false, emailRedirectTo: null } });
  btn.disabled = false;
  btn.textContent = 'Resend Code';
  const errEl = document.getElementById('login-otp-error');
  errEl.textContent = 'A new code has been sent to your email.';
  errEl.style.color = 'var(--accent)';
  errEl.style.background = 'transparent';
  errEl.style.display = 'block';
  setTimeout(() => { errEl.style.display = 'none'; errEl.style.color = ''; errEl.style.background = ''; }, 3000);
}

// ── Back to email step ───────────────────────────────────────
function backToEmail() {
  document.getElementById('login-step-otp').style.display = 'none';
  document.getElementById('login-step-email').style.display = 'block';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-otp-error').style.display = 'none';
}

// ── Enter key support ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendOtp(); });
  document.getElementById('login-otp')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyOtp(); });
});

async function logout() {
  await sb.auth.signOut();
  try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('customer-view').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

async function afterLogin() {
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).single();

  if (error || !profile) {
    alert('Your account has no profile set up. Contact admin.');
    await sb.auth.signOut();
    return;
  }
  if (!profile.is_active) {
    alert('Your account has been deactivated. Contact admin.');
    await sb.auth.signOut();
    return;
  }

  myProfile = profile;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('who-name').textContent = profile.name;
  document.getElementById('who-role').textContent = profile.role;

  if (profile.role === 'admin') {
    document.getElementById('admin-view').style.display = 'block';
    document.getElementById('customer-view').style.display = 'none';
    // Restore from hash, default to overview
    const savedTab = getHashTab();
    switchAdminTab(ADMIN_TABS.includes(savedTab) ? savedTab : 'overview');
  } else {
    document.getElementById('customer-view').style.display = 'block';
    document.getElementById('admin-view').style.display = 'none';
    renderCustomerProfile(profile);
    document.getElementById('dash-hero-name').textContent = profile.name || myProfile?.name;
    initLanguage(profile.language || 'en');
    const heroRight = document.getElementById('dash-hero-right');
    if (profile.logo_path && heroRight) {
      const { data: logoData } = sb.storage.from('logos').getPublicUrl(profile.logo_path);
      if (logoData?.publicUrl) {
        heroRight.innerHTML = `<img src="${logoData.publicUrl}" alt="Logo" style="height:80px;max-width:160px;object-fit:contain;border-radius:8px;background:#fff;padding:8px;"/>`;
      }
    }
    const cid = getCustomerId();
    loadCustomerContracts(cid);
    loadCustomerAssets(cid);
    loadDashIssueTags(cid);
    loadCustomerReportsCount(cid);
    loadCustomerSubscriptions(cid);
    loadNotifications(cid);
    loadCustomerIssueTags(cid);

    // For staff accounts, fetch next_visit_date from company profile
    if (profile.customer_id) {
      const { data: company } = await sb.from('profiles')
        .select('next_visit_date').eq('id', profile.customer_id).single();
      loadVisitDates(cid, company?.next_visit_date);
    } else {
      loadVisitDates(cid, profile.next_visit_date);
    }

    // Restore from hash, default to overview
    const savedTab = getHashTab();
    switchCustomerTab(CUSTOMER_TABS.includes(savedTab) ? savedTab : 'overview');
  }
}

// ── Customer: switch tabs ──────────────────────────────────
function switchCustomerTab(tab) {
  ['overview','reports','assets','dc','contract'].forEach(t => {
    document.getElementById(`cust-tab-${t}`)?.classList.toggle('active', t === tab);
    const panel = document.getElementById(`cust-panel-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'reports')  loadCustomerReports();
  if (tab === 'contract') { loadCustomerSubscriptions(getCustomerId()); }
  if (tab === 'assets')   loadGroupAssets('end_user', getCustomerId());
  if (tab === 'dc')       loadGroupAssets('data_center', getCustomerId());
  setHash(tab);
}

// ── Admin: switch tabs ─────────────────────────────────────
function switchAdminTab(tab) {
  ['overview','users','contracts','assets','reports','status','subs','tags'].forEach(t => {
    document.getElementById(`nav-tab-${t}`)?.classList.toggle('active', t === tab);
    const panel = document.getElementById(`admin-panel-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'overview')  loadAdminOverview();
  if (tab === 'users')     loadUsersList();
  if (tab === 'contracts') loadContractsList();
  if (tab === 'assets')    loadAssetsList();
  if (tab === 'reports')   loadReportsList();
  if (tab === 'status')    loadStatusTab();
  if (tab === 'subs')      loadSubscriptions();
  if (tab === 'tags')      loadTagsTab();
  setHash(tab);
}
