// github-site-list — lists every file (path, size, blob sha) in the
// caller's connected repo at the current branch HEAD, so the Website tab
// can show a browsable file list without downloading a full zip. Read-only.

import { resolveCallerSite, isResponse, ghHeaders, corsHeaders } from '../_shared/githubSite.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const requestedCustomerId = new URL(req.url).searchParams.get('customerId');
    const site = await resolveCallerSite(req, requestedCustomerId);
    if (isResponse(site)) return site;
    const { repo, branch, token } = site;
    const gh = ghHeaders(token);

    const treeRes = await fetch(
      `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers: gh }
    );
    if (!treeRes.ok) {
      return new Response(JSON.stringify({ error: `Could not read the repo (GitHub ${treeRes.status})` }), { status: 502, headers: corsHeaders });
    }
    const treeData = await treeRes.json();
    const files = (treeData.tree || [])
      .filter((e: any) => e.type === 'blob')
      .map((e: any) => ({ path: e.path, sha: e.sha, size: e.size }))
      .sort((a: any, b: any) => a.path.localeCompare(b.path));

    return new Response(JSON.stringify({ files }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
