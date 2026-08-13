// github-site-commit — returns the list of files changed by a single
// commit (added/modified/removed, plus +/- line counts), for the "what
// changed" detail view behind a row in the Version History list. Fetched
// on demand per commit rather than bundled into github-site-history, to
// avoid an N+1 GitHub API call for every commit just to render the list.
// Read-only.

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

    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(sha)}`, { headers: gh });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Could not read this commit (GitHub ${res.status})` }), { status: 502, headers: corsHeaders });
    }
    const data = await res.json();
    const files = (data.files || []).map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    }));

    return new Response(JSON.stringify({
      sha: data.sha,
      message: data.commit?.message || '(no message)',
      authorName: data.commit?.author?.name || data.author?.login || 'Unknown',
      date: data.commit?.author?.date || null,
      files,
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
