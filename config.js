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

// Client-side access tier gate ('full' or 'hosting'), set once at login /
// view-as time by resolveAccessLevel() below. Staff sub-accounts store no
// access_level of their own — they inherit their parent company's, same as
// next_visit_date already works.
var myAccessLevel = 'full';

async function resolveAccessLevel(profile) {
  if (profile.customer_id) {
    const { data } = await sb.from('profiles').select('access_level').eq('id', profile.customer_id).single();
    return data?.access_level || 'full';
  }
  return profile.access_level || 'full';
}

// sb.functions.invoke()'s error.message is always the same generic string
// on any non-2xx response — the real message our function returned lives in
// error.context (the raw Response), which the SDK doesn't surface itself.
async function extractFunctionErrorMessage(error, data) {
  if (data?.error) return data.error;
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    } catch (_e) { /* body wasn't JSON — fall through */ }
  }
  return error?.message || 'Unknown error';
}

// PWA install support — service workers require a secure context
// (https, or localhost), so this silently no-ops on http/file:// during
// local testing and only actually registers once deployed.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
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
  const password = maskedFieldValue(document.getElementById('smtp-password-input'));
  const secure   = document.getElementById('smtp-secure-input').checked;
  const statusEl = document.getElementById('smtp-save-status');
  const btn      = document.getElementById('smtp-save-btn');

  if (!host || !port || !username) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Fill in host, port, and username.';
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
    statusEl.textContent = 'Failed to save: ' + await extractFunctionErrorMessage(error, data);
  } else {
    statusEl.style.color = 'var(--sage)';
    statusEl.textContent = 'SMTP settings saved. Alerts will use these credentials starting with the next scheduled run.';
    const pwInput = document.getElementById('smtp-password-input');
    if (password) maskField(pwInput, password.length);
    else pwInput.value = pwInput.dataset.placeholder || '';
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
    statusEl.textContent = '2 test emails (contract + software renewal samples) sent to ' + to + '. Check your inbox (and spam folder).';
  }
}

// Alert thresholds aren't sensitive, so they're read/written directly
// (admin RLS on alert_settings) rather than through an Edge Function.
async function loadAlertThresholds() {
  const input = document.getElementById('alert-thresholds-input');
  if (!input) return;
  const { data } = await sb.from('alert_settings').select('threshold_days').eq('id', 1).single();
  if (data?.threshold_days) input.value = data.threshold_days.join(', ');
}

// Fills a masked (type=password) field with a dot per character of the
// real saved value — never the value itself — so it looks populated
// instead of empty. The dot string is remembered on the element so saves
// can tell "left untouched" apart from "typed something new."
function maskField(input, length) {
  if (!input) return;
  if (length > 0) {
    const dots = '•'.repeat(length);
    input.value = dots;
    input.dataset.placeholder = dots;
  } else {
    input.value = '';
    delete input.dataset.placeholder;
  }
}

// Wired to onfocus on every masked field: clicking in to edit clears the
// placeholder dots so typing starts from a clean slate. Clicking away
// without typing leaves it blank, which every save endpoint treats as
// "keep the existing value" — never as "clear it."
function clearMaskedFieldOnFocus(input) {
  if (input.value === input.dataset.placeholder) input.value = '';
}

// Returns '' (meaning "unchanged, keep existing") if the field still holds
// its untouched placeholder dots, otherwise the real value the admin typed.
function maskedFieldValue(input) {
  return input.value === input.dataset.placeholder ? '' : input.value;
}

// Populates every settings field with its real (non-secret) or dot-masked
// (secret) saved value, so this tab doesn't look empty every time it's
// opened even though credentials were saved long ago (app_secrets is
// write-only — this is the only way the client learns what's already there).
async function loadSettingsStatus() {
  const { data, error } = await sb.functions.invoke('get-settings-status');
  if (error || data?.error || !data?.smtp) return;

  const smtpHost = document.getElementById('smtp-host-input');
  if (smtpHost) {
    smtpHost.value = data.smtp.host || '';
    document.getElementById('smtp-port-input').value = data.smtp.port || '';
    document.getElementById('smtp-username-input').value = data.smtp.username || '';
    document.getElementById('smtp-secure-input').checked = !!data.smtp.secure;
    maskField(document.getElementById('smtp-password-input'), data.smtp.passwordLength);
  }

  maskField(document.getElementById('github-token-input'), data.githubTokenLength);
  maskField(document.getElementById('vercel-token-input'), data.vercelTokenLength);
  maskField(document.getElementById('godaddy-token-input'), data.godaddyTokenLength);
}

async function saveAlertThresholds() {
  const input = document.getElementById('alert-thresholds-input');
  const statusEl = document.getElementById('alert-thresholds-status');
  const btn = document.getElementById('alert-thresholds-save-btn');
  statusEl.style.display = 'none';

  const days = input.value.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0);
  const uniqueDays = Array.from(new Set(days)).sort((a, b) => b - a);

  if (!uniqueDays.length) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Enter at least one positive whole number of days, comma-separated.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { error } = await sb.from('alert_settings')
    .update({ threshold_days: uniqueDays, updated_at: new Date().toISOString() }).eq('id', 1);

  btn.disabled = false;
  btn.textContent = 'Save';
  statusEl.style.display = 'block';

  if (error) {
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Failed to save: ' + error.message;
  } else {
    statusEl.style.color = 'var(--sage)';
    statusEl.textContent = `Saved. Alerts will fire at ${uniqueDays.join(', ')} day(s) before expiry starting with the next scheduled run.`;
    input.value = uniqueDays.join(', ');
  }
}

async function saveGithubToken() {
  const input = document.getElementById('github-token-input');
  const token = maskedFieldValue(input).trim();
  const statusEl = document.getElementById('github-token-status');
  const btn = document.getElementById('github-token-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  statusEl.style.display = 'none';

  const { data, error } = await sb.functions.invoke('save-github-token', { body: { token } });

  btn.disabled = false;
  btn.textContent = 'Save Token';

  statusEl.style.display = 'block';
  if (error || data?.error) {
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Failed to save: ' + await extractFunctionErrorMessage(error, data);
  } else {
    statusEl.style.color = 'var(--sage)';
    statusEl.textContent = 'GitHub token saved.';
    if (token) maskField(input, token.length);
    else input.value = input.dataset.placeholder || '';
  }
}

async function saveGodaddyToken() {
  const input = document.getElementById('godaddy-token-input');
  const token = maskedFieldValue(input).trim();
  const statusEl = document.getElementById('godaddy-token-status');
  const btn = document.getElementById('godaddy-token-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  statusEl.style.display = 'none';

  const { data, error } = await sb.functions.invoke('save-godaddy-token', { body: { token } });

  btn.disabled = false;
  btn.textContent = 'Save Token';

  statusEl.style.display = 'block';
  if (error || data?.error) {
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Failed to save: ' + await extractFunctionErrorMessage(error, data);
  } else {
    statusEl.style.color = 'var(--sage)';
    statusEl.textContent = 'GoDaddy token saved.';
    if (token) maskField(input, token.length);
    else input.value = input.dataset.placeholder || '';
  }
}

async function saveVercelToken() {
  const input = document.getElementById('vercel-token-input');
  const token = maskedFieldValue(input).trim();
  const statusEl = document.getElementById('vercel-token-status');
  const btn = document.getElementById('vercel-token-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  statusEl.style.display = 'none';

  const { data, error } = await sb.functions.invoke('save-vercel-token', { body: { token } });

  btn.disabled = false;
  btn.textContent = 'Save Token';

  statusEl.style.display = 'block';
  if (error || data?.error) {
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Failed to save: ' + await extractFunctionErrorMessage(error, data);
  } else {
    statusEl.style.color = 'var(--sage)';
    statusEl.textContent = 'Vercel token saved.';
    if (token) maskField(input, token.length);
    else input.value = input.dataset.placeholder || '';
  }
}

async function downloadDatabaseBackup() {
  const btn = document.getElementById('db-backup-btn');
  const statusEl = document.getElementById('db-backup-status');
  statusEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Preparing…';

  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-backup-database`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      throw new Error(result.error || 'Could not prepare the backup.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (res.headers.get('Content-Disposition') || '').match(/filename="(.+)"/)?.[1] || 'amc-backup.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = err.message || 'Could not prepare the backup.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download Backup';
  }
}

// Catches a tab left open across the timeout mark
setInterval(() => {
  if (myProfile && isSessionExpired()) {
    logout();
    alert('Your session has expired. Please sign in again.');
  }
}, 5 * 60 * 1000);

// ── Boot: restore session as soon as the DOM (and our own scripts) are ready —
// NOT window's 'load' event, which also waits on external CDN scripts/fonts and
// made a logged-in user visibly sit on the login screen for a moment on every
// reload before flipping to the dashboard.
function hideBootScreen() {
  const boot = document.getElementById('boot-screen');
  if (boot) boot.style.display = 'none';
}

async function bootApp() {
  loadSiteLogo(); // populate .site-logo-img everywhere, including the login screen
  await loadSessionTimeoutSetting();
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    hideBootScreen();
    document.getElementById('login-screen').style.display = 'flex';
    return;
  }
  if (isSessionExpired()) {
    localStorage.removeItem('login_at');
    await sb.auth.signOut({ scope: 'local' });
    hideBootScreen();
    document.getElementById('login-screen').style.display = 'flex';
    return;
  }
  await afterLogin();
  hideBootScreen();
}

document.addEventListener('DOMContentLoaded', bootApp);
