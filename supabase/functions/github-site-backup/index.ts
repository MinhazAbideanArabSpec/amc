// github-site-backup — zips up the caller's site at the current branch HEAD
// and returns it directly (not via sb.functions.invoke, which JSON-decodes —
// the frontend calls this with plain fetch() + res.blob()). Read-only: no
// commit, no state change, safe to call as often as the customer likes
// before editing.

import JSZip from 'https://esm.sh/jszip@3.10.1';
import { resolveCallerSite, isResponse, ghHeaders, corsHeaders } from '../_shared/githubSite.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const site = await resolveCallerSite(req);
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
    const blobs = (treeData.tree || []).filter((e: any) => e.type === 'blob');

    const zip = new JSZip();
    for (const entry of blobs) {
      const blobRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${entry.sha}`, { headers: gh });
      if (!blobRes.ok) continue; // skip anything unreadable rather than fail the whole backup
      const blobData = await blobRes.json();
      const bytes = base64ToBytes(blobData.content.replace(/\n/g, ''));
      zip.file(entry.path, bytes);
    }

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const filename = `${(repo.split('/')[1] || 'site')}-backup.zip`;

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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
