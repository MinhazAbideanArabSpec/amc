// github-site-delete-file — deletes a single file from the caller's
// connected repo/branch via GitHub's Contents API, committed under the
// ArabSpec Hosting Bot identity (never the customer's own name). Requires
// the file's current blob sha (from github-site-list) so GitHub rejects
// the delete if the file changed since the list was loaded, rather than
// silently deleting the wrong version out from under a concurrent edit.

import { resolveCallerSite, isResponse, ghHeaders, corsHeaders } from '../_shared/githubSite.ts';

const BOT_AUTHOR = { name: 'ArabSpec Hosting Bot', email: 'hosting@arabspec.com' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { customerId, path, sha } = body;
    if (!path || typeof path !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing path' }), { status: 400, headers: corsHeaders });
    }
    // Defense in depth — these paths come from our own file list, but
    // never trust a client-supplied path blindly.
    if (path.startsWith('/') || path.split('/').includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400, headers: corsHeaders });
    }
    if (!sha || typeof sha !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing file sha' }), { status: 400, headers: corsHeaders });
    }

    const site = await resolveCallerSite(req, typeof customerId === 'string' ? customerId : null);
    if (isResponse(site)) return site;
    const { repo, branch, token } = site;
    const gh = ghHeaders(token);

    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const delRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, {
      method: 'DELETE',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Delete ${path} via ArabSpec Hosting Portal`,
        sha,
        branch,
        committer: BOT_AUTHOR,
        author: BOT_AUTHOR,
      }),
    });

    if (!delRes.ok) {
      if (delRes.status === 409) {
        return new Response(
          JSON.stringify({ error: 'This file changed since the list was loaded — refresh and try again.' }),
          { status: 409, headers: corsHeaders }
        );
      }
      const errData = await delRes.json().catch(() => ({} as any));
      return new Response(
        JSON.stringify({ error: errData.message || `Could not delete the file (GitHub ${delRes.status})` }),
        { status: 502, headers: corsHeaders }
      );
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
