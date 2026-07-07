// auth.js — authentication and tab switching
// ── Login / Logout ──────────────────────────────────────
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = 'Login failed: ' + error.message;
    errEl.style.display = 'block';
    return;
  }
  await afterLogin();
}

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
  document.getElementById('who-name').textContent = profile.name;
  document.getElementById('who-role').textContent = profile.role;

  if (profile.role === 'admin') {
    document.getElementById('admin-view').style.display = 'block';
    document.getElementById('customer-view').style.display = 'none';
    switchAdminTab('overview');
  } else {
    document.getElementById('customer-view').style.display = 'block';
    document.getElementById('admin-view').style.display = 'none';
    switchCustomerTab('overview');
    renderCustomerProfile(profile);
    // Set hero name
    document.getElementById('dash-hero-name').textContent = profile.name;
    const hour = new Date().getHours();
    document.getElementById('dash-hero-greeting').textContent =
      hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';
    // Init language from saved preference
    initLanguage(profile.language || 'en');
    // Show customer logo in hero if available
    const heroRight = document.querySelector('.dash-hero-right');
    if (profile.logo_path && heroRight) {
      const { data: logoData } = sb.storage.from('logos').getPublicUrl(profile.logo_path);
      if (logoData?.publicUrl) {
        heroRight.innerHTML = `<img src="${logoData.publicUrl}" alt="Logo" style="height:80px;max-width:160px;object-fit:contain;border-radius:8px;background:#fff;padding:8px;"/>`;
      }
    }
    // Set total assets stat (populated after loadCustomerAssets resolves)
    loadCustomerContracts(profile.id);
    loadCustomerAssets(profile.id);
    loadVisitDashboard(profile.id);
    loadCustomerStatuses(profile.id);
    loadCustomerReportsCount(profile.id);
    loadVisitDates(profile.id, profile.next_visit_date);
    loadCustomerSubscriptions(profile.id);
  }
}

// ── Customer: switch between Overview / Profile / Contracts / Assets tabs ──
function switchCustomerTab(tab) {
  ['overview','profile','contracts','assets','reports','subs'].forEach(t => {
    document.getElementById(`cust-tab-${t}`)?.classList.toggle('active', t === tab);
    const panel = document.getElementById(`cust-panel-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'reports') loadCustomerReports();
  if (tab === 'subs')    loadCustomerSubscriptions(myProfile?.id);
}

// ── Admin: switch tabs ──
function switchAdminTab(tab) {
  ['overview','users','contracts','assets','reports','status','subs'].forEach(t => {
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
}

