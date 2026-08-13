// github-site-file — returns the raw base64 content of a single file from
// the caller's connected repo, identified by its blob sha (from
// github-site-list). Uses the Git Data API's blob endpoint rather than the
// Contents API so there's no ~1MB inline-content ceiling. Read-only.

import { resolveCallerSite, isResponse, ghHeaders, corsHeaders } from '../_shared/githubSite.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const requestedCustomerId = url.searchParams.get('customerId');
    const sha = url.searchParams.get('sha');
    if (!sha) {
      return new Response(JSON.stringify({ error: 'Missing sha' }), { status: 400, headers: corsHeaders });
    }

    const site = await resolveCallerSite(req, requestedCustomerId);
    if (isResponse(site)) return site;
    const { repo, token } = site;
    const gh = ghHeaders(token);

    const blobRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${sha}`, { headers: gh });
    if (!blobRes.ok) {
      return new Response(JSON.stringify({ error: `Could not read the file (GitHub ${blobRes.status})` }), { status: 502, headers: corsHeaders });
    }
    const blobData = await blobRes.json();

    return new Response(JSON.stringify({
      content: (blobData.content || '').replace(/\n/g, ''),
      encoding: blobData.encoding,
      size: blobData.size,
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
