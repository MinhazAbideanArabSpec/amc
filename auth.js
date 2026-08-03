// auth.js — authentication and tab switching

var _otpEmail = '';

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
    errEl.textContent = (error.message.includes('not found') || error.message.includes('Invalid') || error.message.includes('Signups not allowed'))
      ? 'Login Error. Please contact your admin.'
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
  const whoNameEl = document.getElementById('who-name');
  const whoRoleEl = document.getElementById('who-role');
  if (whoNameEl) whoNameEl.textContent = profile.name;
  if (whoRoleEl) whoRoleEl.textContent = profile.role;

  if (profile.role === 'admin') {
    document.getElementById('admin-view').style.display = 'block';
    document.getElementById('customer-view').style.display = 'none';
    document.getElementById('admin-sidebar').style.display = 'flex';
    document.getElementById('customer-sidebar').style.display = 'none';
    document.getElementById('admin-refresh-btn').style.display = 'inline-flex';
    document.getElementById('topbar-bell').style.display = 'none';
    const avatarEl = document.getElementById('topbar-avatar');
    if (avatarEl) avatarEl.textContent = (profile.name || 'A').substring(0,2).toUpperCase();
    const nameAdminEl = document.getElementById('who-name-admin');
    if (nameAdminEl) nameAdminEl.textContent = profile.name;
    const savedTab = window.location.hash.replace('#','').toLowerCase();
    const adminTabs = ['overview','clients','users','contracts','assets','reports','status','subs','tags'];
    switchAdminTab(adminTabs.includes(savedTab) ? savedTab : 'overview');
  } else {
    document.getElementById('customer-view').style.display = 'block';
    document.getElementById('admin-view').style.display = 'none';
    const savedCustTab = window.location.hash.replace('#','').toLowerCase();
    const custTabs = ['overview','reports','assets','dc','renewals','contract'];
    switchCustomerTab(custTabs.includes(savedCustTab) ? savedCustTab : 'overview');
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
    loadCustomerReportsCount(cid);
    setTimeout(() => loadCustomerSubscriptions(cid), 300);
    setTimeout(() => loadNotifications(cid), 600);
    setTimeout(() => loadDashIssueTags(cid), 900);
    setTimeout(() => loadCustomerIssueTags(cid), 1200);

    // For staff accounts, fetch next_visit_date from company profile
    if (profile.customer_id) {
      const { data: company } = await sb.from('profiles')
        .select('next_visit_date').eq('id', profile.customer_id).single();
      loadVisitDates(cid, company?.next_visit_date);
    } else {
      loadVisitDates(cid, profile.next_visit_date);
    }
  }
}

// ── Customer: switch between Overview / Profile / Contracts / Assets tabs ──
function switchCustomerTab(tab) {
  ['overview','reports','assets','dc','renewals','contract'].forEach(t => {
    document.getElementById(`cust-tab-${t}`)?.classList.toggle('active', t === tab);
    const panel = document.getElementById(`cust-panel-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'reports')  loadCustomerReports();
  if (tab === 'renewals') loadCustomerRenewalsTab(getCustomerId());
  if (tab === 'contract') { loadCustomerSubscriptions(getCustomerId()); }
  if (tab === 'assets')   loadGroupAssets('end_user', getCustomerId());
  if (tab === 'dc')       loadGroupAssets('data_center', getCustomerId());
}

// ── Admin: switch tabs ──
// Track which admin tabs have already loaded data
var _adminTabLoaded = {};

function refreshAdminTab() {
  const active = ['overview','clients','users','contracts','assets','reports','status','subs','tags']
    .find(t => document.getElementById(`nav-tab-${t}`)?.classList.contains('active'));
  if (active) {
    delete _adminTabLoaded[active];
    switchAdminTab(active);
  }
}

const ADMIN_TAB_TITLES = {
  overview: 'Dashboard', clients: 'Clients', users: 'Admin Users',
  contracts: 'Contracts', assets: 'Assets', reports: 'Visit Reports',
  status: 'Status', subs: 'Renewals', tags: 'Asset Summary'
};

function switchAdminTab(tab, forceReload) {
  ['overview','clients','users','contracts','assets','reports','status','subs','tags'].forEach(t => {
    document.getElementById(`nav-tab-${t}`)?.classList.toggle('active', t === tab);
    const panel = document.getElementById(`admin-panel-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  const topbarTitle = document.getElementById('app-topbar-title');
  if (topbarTitle) topbarTitle.textContent = ADMIN_TAB_TITLES[tab] || 'Dashboard';
  // Only load data if not already loaded (or forced)
  if (_adminTabLoaded[tab] && !forceReload) return;
  _adminTabLoaded[tab] = true;
  if (tab === 'overview')  loadAdminOverview();
  if (tab === 'clients')   loadClientsList();
  if (tab === 'users')     loadUsersList();
  if (tab === 'contracts') loadContractsList();
  if (tab === 'assets')    loadAssetsList();
  if (tab === 'reports')   loadReportsList();
  if (tab === 'status')    loadStatusTab();
  if (tab === 'subs')      loadSubscriptions();
  if (tab === 'tags')      loadTagsTab();
}

// Call after any mutation to force next visit to reload
function invalidateAdminTab(tab) {
  delete _adminTabLoaded[tab];
}

