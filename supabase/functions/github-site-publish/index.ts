// github-site-publish — takes an uploaded zip and commits its contents to
// the caller's connected repo/branch as a single commit, authored by the
// ArabSpec Hosting Bot identity (never the customer's own name). Uses the
// Git Data API (blobs → tree → commit → ref update) so all files land in
// one atomic commit instead of one commit per file.
//
// This function's job ends the moment the ref update succeeds — whatever
// deploys the repo afterward (e.g. an existing Vercel↔GitHub integration)
// is unrelated to it: no status polling, no dependency in either direction.

import JSZip from 'https://esm.sh/jszip@3.10.1';
import { resolveCallerSite, isResponse, ghHeaders, corsHeaders } from '../_shared/githubSite.ts';

const BOT_AUTHOR = { name: 'ArabSpec Hosting Bot', email: 'hosting@arabspec.com' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400, headers: corsHeaders });
    }
    const requestedCustomerId = form.get('customerId');

    const site = await resolveCallerSite(req, typeof requestedCustomerId === 'string' ? requestedCustomerId : null);
    if (isResponse(site)) return site;
    const { repo, branch, token } = site;
    const gh = ghHeaders(token);

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries: { path: string; bytes: Uint8Array }[] = [];
    for (const path of Object.keys(zip.files)) {
      const entry = zip.files[path];
      if (entry.dir) continue;
      // zip-slip guard: refuse absolute paths or '..' segments
      if (path.startsWith('/') || path.split('/').includes('..')) continue;
      entries.push({ path, bytes: await entry.async('uint8array') });
    }
    if (!entries.length) {
      return new Response(JSON.stringify({ error: 'The uploaded zip has no files in it' }), { status: 400, headers: corsHeaders });
    }

    // Current tip of the branch
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: gh });
    if (!refRes.ok) {
      return new Response(JSON.stringify({ error: `Could not read the branch (GitHub ${refRes.status})` }), { status: 502, headers: corsHeaders });
    }
    const refData = await refRes.json();
    const baseCommitSha = refData.object.sha;

    const baseCommitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits/${baseCommitSha}`, { headers: gh });
    if (!baseCommitRes.ok) {
      return new Response(JSON.stringify({ error: `Could not read the current commit (GitHub ${baseCommitRes.status})` }), { status: 502, headers: corsHeaders });
    }
    const baseCommitData = await baseCommitRes.json();
    const baseTreeSha = baseCommitData.tree.sha;

    // One blob per file
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const { path, bytes } of entries) {
      const blobRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
        method: 'POST',
        headers: { ...gh, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: bytesToBase64(bytes), encoding: 'base64' }),
      });
      if (!blobRes.ok) {
        return new Response(JSON.stringify({ error: `Failed to upload ${path} (GitHub ${blobRes.status})` }), { status: 502, headers: corsHeaders });
      }
      const blobData = await blobRes.json();
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: blobData.sha });
    }

    // New tree on top of the current one
    const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
      method: 'POST',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to build the update (GitHub ${treeRes.status})` }), { status: 502, headers: corsHeaders });
    }
    const newTree = await treeRes.json();

    // The commit itself, authored by the bot identity
    const commitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
      method: 'POST',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update via ArabSpec Hosting Portal',
        tree: newTree.sha,
        parents: [baseCommitSha],
        author: { ...BOT_AUTHOR, date: new Date().toISOString() },
      }),
    });
    if (!commitRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to create the commit (GitHub ${commitRes.status})` }), { status: 502, headers: corsHeaders });
    }
    const newCommit = await commitRes.json();

    // Fast-forward only — if someone else published in between, this fails
    // loudly instead of silently overwriting their change.
    const updateRefRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
    if (!updateRefRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Someone else published a change just now — refresh and try again.' }),
        { status: 409, headers: corsHeaders }
      );
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
