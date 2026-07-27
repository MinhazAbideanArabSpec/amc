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

// ── Boot: restore session after ALL scripts have loaded ──
window.addEventListener('load', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await afterLogin();
});
