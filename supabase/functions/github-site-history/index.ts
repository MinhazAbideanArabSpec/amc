// github-site-history — lists recent commits on the caller's connected
// repo/branch, so the Website tab can show a version/edit history — every
// change to the site, whether published from the portal or pushed some
// other way. Read-only.

import { resolveCallerSite, isResponse, ghHeaders, corsHeaders } from '../_shared/githubSite.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const requestedCustomerId = new URL(req.url).searchParams.get('customerId');
    const site = await resolveCallerSite(req, requestedCustomerId);
    if (isResponse(site)) return site;
    const { repo, branch, token } = site;
    const gh = ghHeaders(token);

    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=30`,
      { headers: gh }
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Could not read commit history (GitHub ${res.status})` }), { status: 502, headers: corsHeaders });
    }
    const data = await res.json();
    const commits = (data || []).map((c: any) => ({
      sha: c.sha,
      message: c.commit?.message || '(no message)',
      authorName: c.commit?.author?.name || c.author?.login || 'Unknown',
      date: c.commit?.author?.date || null,
    }));

    return new Response(JSON.stringify({ commits }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
