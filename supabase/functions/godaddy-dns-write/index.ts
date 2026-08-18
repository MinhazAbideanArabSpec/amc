// godaddy-dns-write — adds, edits, or deletes a single DNS record via
// GoDaddy's v3 Domains API. v3 records have a real recordId, but the API
// only exposes POST (create) and DELETE (by recordId) — there's no PATCH/
// PUT to edit a record in place. "Edit" is implemented as create-then-
// delete: the new record is created first and only removed-the-old-one
// second, so if the create fails nothing has changed yet (safe abort), and
// if the delete of the old one fails afterward the customer ends up with
// both old and new rather than neither — a visible, recoverable state
// rather than data loss.

import { resolveCallerDomain, isResponse, gdHeaders, corsHeaders, zoneRecordsUrl, WRITABLE_TYPES } from '../_shared/godaddyDns.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { customerId, action, type, name, recordId, data, ttl, priority } = body;

    if (!['add', 'edit', 'delete'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: corsHeaders });
    }
    if (action === 'delete') {
      if (!recordId || typeof recordId !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing record reference — reload the list and try again.' }), { status: 400, headers: corsHeaders });
      }
    } else {
      if (!type || typeof type !== 'string' || !WRITABLE_TYPES.includes(type.toUpperCase())) {
        return new Response(JSON.stringify({ error: "This record type can't be edited from the portal — contact ArabSpec." }), { status: 400, headers: corsHeaders });
      }
      const recName = typeof name === 'string' ? name.trim() : '';
      if (!recName) {
        return new Response(JSON.stringify({ error: 'Missing record name (use @ for the root domain).' }), { status: 400, headers: corsHeaders });
      }
      if (!data || typeof data !== 'string' || !data.trim()) {
        return new Response(JSON.stringify({ error: 'Missing record value.' }), { status: 400, headers: corsHeaders });
      }
      if (action === 'edit' && (!recordId || typeof recordId !== 'string')) {
        return new Response(JSON.stringify({ error: 'Missing record reference — reload the list and try again.' }), { status: 400, headers: corsHeaders });
      }
    }

    const ctx = await resolveCallerDomain(req, typeof customerId === 'string' ? customerId : null);
    if (isResponse(ctx)) return ctx;
    const { domain, pat } = ctx;
    const headers = gdHeaders(pat);

    if (action === 'delete') {
      const delRes = await fetch(zoneRecordsUrl(domain, `/${encodeURIComponent(recordId)}`), { method: 'DELETE', headers });
      if (delRes.status === 404) {
        return new Response(JSON.stringify({ ok: true, note: 'This record was already removed.' }), { headers: corsHeaders });
      }
      if (delRes.status === 409) {
        return new Response(JSON.stringify({ error: "This is a GoDaddy-managed record and can't be deleted." }), { status: 409, headers: corsHeaders });
      }
      if (!delRes.ok) {
        const errBody = await delRes.json().catch(() => ({} as any));
        return new Response(JSON.stringify({ error: errBody.message || `Could not delete the record (GoDaddy ${delRes.status})` }), { status: 502, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // add or edit — both create a new record first.
    const recType = type.toUpperCase();
    const newRecord: Record<string, unknown> = {
      type: recType,
      name: name.trim(),
      data: data.trim(),
      ttl: Math.max(600, parseInt(ttl, 10) || 3600),
    };
    if (recType === 'MX') newRecord.priority = Number.isInteger(priority) ? priority : 10;

    const createRes = await fetch(zoneRecordsUrl(domain), {
      method: 'POST',
      headers,
      body: JSON.stringify(newRecord),
    });
    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({} as any));
      return new Response(JSON.stringify({ error: errBody.message || `Could not save the record (GoDaddy ${createRes.status})` }), { status: 502, headers: corsHeaders });
    }

    if (action === 'edit') {
      const delRes = await fetch(zoneRecordsUrl(domain, `/${encodeURIComponent(recordId)}`), { method: 'DELETE', headers });
      if (!delRes.ok && delRes.status !== 404) {
        return new Response(JSON.stringify({
          ok: true,
          warning: "The updated record was saved, but the old version couldn't be removed — you may see both until you delete the old one manually.",
        }), { headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
