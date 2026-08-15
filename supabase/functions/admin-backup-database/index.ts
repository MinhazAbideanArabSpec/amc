// admin-backup-database — admin-only. Exports every application table's
// data as JSON inside a single zip, for a one-click local backup download
// from Settings. This is a data export, not a true pg_dump (no schema,
// indexes, or functions) — Edge Functions have no pg_dump binary to shell
// out to, and this covers what actually matters for "let me grab a copy
// of everything" — plain data. Deliberately excludes app_secrets (the
// SMTP password and GitHub token): those are credentials to reconfigure,
// not data to restore, and shouldn't end up in a file that gets copied,
// shared, or lost.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TABLES = [
  'profiles', 'contracts', 'assets', 'subscriptions',
  'visit_reports', 'visit_report_assets', 'visit_report_checks',
  'asset_statuses', 'asset_status_assignments', 'asset_status_history',
  'health_statuses', 'issue_tag_definitions', 'visit_issue_tags',
  'customer_sites', 'alert_log', 'tickets', 'ticket_messages',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: corsHeaders });
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders });
    }

    const zip = new JSZip();
    const manifest: Record<string, number | string> = { generated_at: new Date().toISOString() };

    for (const table of TABLES) {
      const { data, error } = await admin.from(table).select('*');
      if (error) {
        manifest[table] = `error: ${error.message}`;
        continue;
      }
      zip.file(`${table}.json`, JSON.stringify(data ?? [], null, 2));
      manifest[table] = (data ?? []).length;
    }
    zip.file('_manifest.json', JSON.stringify(manifest, null, 2));

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const filename = `amc-backup-${new Date().toISOString().split('T')[0]}.zip`;

    return new Response(zipBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
