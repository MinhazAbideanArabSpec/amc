// config.js — Supabase init, global state
var SUPABASE_URL = 'https://taihtmdhismfnhmboryy.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWh0bWRoaXNtZm5obWJvcnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODgyODQsImV4cCI6MjA5NzA2NDI4NH0.DuK5pfabqbW-pWvfc5EJ8qc2-fvk0cVHIRuT1WUWS_c';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var myProfile = null;
var editingUserId = null; // null = create mode, otherwise editing this user's id

// ── Boot ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await afterLogin();
});
