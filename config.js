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

// ── Client-side 24h session timeout (Supabase free tier has no server-side time-box) ──
var SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isSessionExpired() {
  const loginAt = localStorage.getItem('login_at');
  return loginAt !== null && (Date.now() - parseInt(loginAt, 10)) > SESSION_MAX_AGE_MS;
}

// Catches a tab left open across the 24h mark
setInterval(() => {
  if (myProfile && isSessionExpired()) {
    logout();
    alert('Your session has expired. Please sign in again.');
  }
}, 5 * 60 * 1000);

// ── Boot: restore session after ALL scripts have loaded ──
window.addEventListener('load', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  if (isSessionExpired()) {
    localStorage.removeItem('login_at');
    await sb.auth.signOut();
    return;
  }
  await afterLogin();
});
