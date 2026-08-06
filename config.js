// config.js — Supabase init, global state
var SUPABASE_URL = 'https://taihtmdhismfnhmboryy.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWh0bWRoaXNtZm5obWJvcnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODgyODQsImV4cCI6MjA5NzA2NDI4NH0.DuK5pfabqbW-pWvfc5EJ8qc2-fvk0cVHIRuT1WUWS_c';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var myProfile = null;
var editingUserId = null;
var customerAssetsCache = [];

// View-as customer mode (admin only)
var viewAsProfile = null;

// Returns the effective customer_id for data queries
function getCustomerId() {
  if (viewAsProfile) return viewAsProfile.customer_id || viewAsProfile.id;
  return myProfile?.customer_id || myProfile?.id;
}

// ── Site-wide ArabSpec logo (stored at a fixed path in the 'logos' bucket) ──
function loadSiteLogo() {
  const { data } = sb.storage.from('logos').getPublicUrl('site/logo');
  if (!data?.publicUrl) return;
  const url = data.publicUrl + '?t=' + Date.now();
  document.querySelectorAll('.site-logo-img').forEach(img => {
    img.onload = () => {
      img.style.display = 'inline-block';
      const empty = img.parentElement.querySelector('.site-logo-empty-msg');
      if (empty) empty.style.display = 'none';
    };
    img.onerror = () => { img.style.display = 'none'; };
    img.src = url;
  });
}

// ── Client-side session timeout (Supabase free tier has no server-side time-box) ──
var SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // default 24h, overridden by loadSessionTimeoutSetting()

function isSessionExpired() {
  const loginAt = localStorage.getItem('login_at');
  return loginAt !== null && (Date.now() - parseInt(loginAt, 10)) > SESSION_MAX_AGE_MS;
}

// Admin-configurable, stored as a plain-text hours value in the public 'logos' bucket
async function loadSessionTimeoutSetting() {
  try {
    const { data } = sb.storage.from('logos').getPublicUrl('site/session-timeout-hours');
    if (!data?.publicUrl) return;
    const res = await fetch(data.publicUrl + '?t=' + Date.now());
    if (!res.ok) return;
    const hours = parseFloat((await res.text()).trim());
    if (hours > 0) SESSION_MAX_AGE_MS = hours * 60 * 60 * 1000;
  } catch (e) { /* keep default */ }
}

async function saveSessionTimeoutSetting() {
  const input = document.getElementById('session-timeout-hours-input');
  const hours = parseFloat(input.value);
  if (!hours || hours <= 0) { alert('Enter a valid number of hours.'); return; }

  const blob = new Blob([String(hours)], { type: 'text/plain' });
  const { error } = await sb.storage.from('logos').upload('site/session-timeout-hours', blob, { upsert: true, contentType: 'text/plain' });
  if (error) { alert('Failed to save: ' + error.message); return; }

  SESSION_MAX_AGE_MS = hours * 60 * 60 * 1000;
  alert('Session timeout updated to ' + hours + ' hour(s).');
}

async function saveSmtpSettings() {
  const host     = document.getElementById('smtp-host-input').value.trim();
  const port     = document.getElementById('smtp-port-input').value.trim();
  const username = document.getElementById('smtp-username-input').value.trim();
  const password = document.getElementById('smtp-password-input').value;
  const secure   = document.getElementById('smtp-secure-input').checked;
  const statusEl = document.getElementById('smtp-save-status');
  const btn      = document.getElementById('smtp-save-btn');

  if (!host || !port || !username || !password) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Fill in host, port, username, and password.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';
  statusEl.style.display = 'none';

  const { data, error } = await sb.functions.invoke('save-smtp-settings', {
    body: { host, port, username, password, secure }
  });

  btn.disabled = false;
  btn.textContent = 'Save SMTP Settings';

  statusEl.style.display = 'block';
  if (error || data?.error) {
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Failed to save: ' + (data?.error || error.message);
  } else {
    statusEl.style.color = 'var(--sage)';
    statusEl.textContent = 'SMTP settings saved. Alerts will use these credentials starting with the next scheduled run.';
    document.getElementById('smtp-password-input').value = '';
  }
}

async function sendTestSmtpEmail() {
  const emailInput = document.getElementById('smtp-test-email-input');
  const to = emailInput.value.trim();
  const statusEl = document.getElementById('smtp-test-status');
  const btn = document.getElementById('smtp-test-btn');

  if (!to || !to.includes('@')) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Enter a valid email address.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';
  statusEl.style.display = 'none';

  const { data, error } = await sb.functions.invoke('send-test-email', { body: { to } });

  btn.disabled = false;
  btn.textContent = 'Send Test Email';

  statusEl.style.display = 'block';
  if (error || data?.error) {
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Failed to send: ' + (data?.error || error.message);
  } else {
    statusEl.style.color = 'var(--sage)';
    statusEl.textContent = 'Test email sent to ' + to + '. Check your inbox (and spam folder).';
  }
}

// Catches a tab left open across the timeout mark
setInterval(() => {
  if (myProfile && isSessionExpired()) {
    logout();
    alert('Your session has expired. Please sign in again.');
  }
}, 5 * 60 * 1000);

// ── Boot: restore session after ALL scripts have loaded ──
window.addEventListener('load', async () => {
  await loadSessionTimeoutSetting();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  if (isSessionExpired()) {
    localStorage.removeItem('login_at');
    await sb.auth.signOut();
    return;
  }
  await afterLogin();
});
