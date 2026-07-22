// tags.js — Issue Tags management and rendering

var allTagDefs = []; // { id, section, label }

// ── Admin: load and render all tag definitions grouped by section ──
async function loadTagsTab() {
  const body = document.getElementById('tags-panel-body');
  if (!body) return;
  body.innerHTML = '<div class="empty-state">Loading…</div>';

  const { data: tags, error } = await sb.from('issue_tag_definitions')
    .select('*').order('section').order('label');
  if (error) { body.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }

  allTagDefs = tags || [];

  // Group by section
  const groups = {};
  CHECKLIST.forEach(s => { groups[s] = []; });
  allTagDefs.forEach(t => { if (groups[t.section]) groups[t.section].push(t); });

  body.innerHTML = CHECKLIST.map(section => `
    <div class="tag-section-block">
      <div class="tag-section-header">
        <span class="tag-section-title">${section}</span>
        <span style="font-size:11px;color:#8A8377;">${groups[section].length} tag${groups[section].length !== 1 ? 's' : ''}</span>
      </div>
      <div class="tag-list" id="taglist-${slugifySection(section)}">
        ${groups[section].map(t => `
          <div class="tag-item" id="tagitem-${t.id}">
            <span class="tag-item-label">${t.label}</span>
            <button class="tag-item-del" title="Delete" onclick="deleteTag('${t.id}','${t.label.replace(/'/g,"\\'")}')">×</button>
          </div>
        `).join('') || '<span style="font-size:12px;color:#8A8377;padding:2px 0;">No tags yet</span>'}
      </div>
      <div class="tag-add-row">
        <input type="text" id="tag-input-${slugifySection(section)}"
          placeholder="Add new tag…"
          onkeydown="if(event.key==='Enter') addTag('${section}')"/>
        <button onclick="addTag('${section}')" style="padding:6px 14px;font-size:12.5px;">+ Add</button>
      </div>
    </div>
  `).join('');
}

function slugifySection(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

async function addTag(section) {
  const inputId = `tag-input-${slugifySection(section)}`;
  const input = document.getElementById(inputId);
  const label = input?.value.trim();
  if (!label) return;

  const { error } = await sb.from('issue_tag_definitions').insert({ section, label });
  if (error) { alert('Failed: ' + error.message); return; }
  input.value = '';
  await loadTagsTab();
}

async function deleteTag(tagId, label) {
  if (!confirm(`Delete tag "${label}"?\nThis will also remove it from all existing visit reports.`)) return;
  const { error } = await sb.from('issue_tag_definitions').delete().eq('id', tagId);
  if (error) { alert('Failed: ' + error.message); return; }
  await loadTagsTab();
}

// ── Fetch all tag defs for visit report form (called once on modal open) ──
async function fetchAllTagDefs() {
  const { data } = await sb.from('issue_tag_definitions').select('*').order('section').order('label');
  allTagDefs = data || [];
}

// ── Render issue tag checkboxes for a section (shown when result = fail) ──
function renderIssueTags(assetId, section) {
  const sectionTags = allTagDefs.filter(t => t.section === section);
  if (!sectionTags.length) return '';
  return `
    <div class="issue-checks-wrap" id="issue-wrap-${slugify(assetId + section)}">
      <div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Issues Observed</div>
      ${sectionTags.map(t => `
        <div class="issue-check-row">
          <input type="checkbox" id="itag-${slugify(assetId + t.id)}"
            onchange="onTagChange('${assetId}','${section}','${t.id}',this.checked)"/>
          <label for="itag-${slugify(assetId + t.id)}" style="cursor:pointer;">${t.label}</label>
        </div>
      `).join('')}
    </div>`;
}

// Show/hide issue tags when FAIL is selected for a section
function toggleIssueTags(assetId, section, result) {
  const wrap = document.getElementById(`issue-wrap-${slugify(assetId + section)}`);
  if (!wrap) return;
  if (result === 'fail' || result === 'ok') {
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
    allTagDefs.filter(t => t.section === section).forEach(t => {
      const chk = document.getElementById(`itag-${slugify(assetId + t.id)}`);
      if (chk) chk.checked = false;
    });
    if (!reportIssueTags[assetId]) reportIssueTags[assetId] = {};
    reportIssueTags[assetId][section] = [];
  }
}

// ── Fetch existing tags for a visit report (edit mode) ──
async function fetchExistingIssueTags(vraId, assetId) {
  const { data } = await sb.from('visit_issue_tags')
    .select('*, issue_tag_definitions(id, section, label)')
    .eq('visit_report_asset_id', vraId);
  if (!data || !data.length) return;

  if (!reportIssueTags) reportIssueTags = {};
  if (!reportIssueTags[assetId]) reportIssueTags[assetId] = {};

  data.forEach(vit => {
    const section = vit.issue_tag_definitions?.section;
    const tagId = vit.issue_tag_definitions?.id;
    if (!section || !tagId) return;
    if (!reportIssueTags[assetId][section]) reportIssueTags[assetId][section] = [];
    if (!reportIssueTags[assetId][section].includes(tagId)) {
      reportIssueTags[assetId][section].push(tagId);
    }
  });
}

// ── Save issue tags after saving visit_report_assets ──
async function saveIssueTags(vraId, assetId) {
  const assetTags = reportIssueTags?.[assetId] || {};
  const tagIds = Object.values(assetTags).flat().filter(Boolean);
  if (!tagIds.length) return;

  const rows = tagIds.map(tid => ({ visit_report_asset_id: vraId, issue_tag_id: tid }));
  await sb.from('visit_issue_tags').insert(rows).select();
}

// ── Fetch tags for display (detail view / dashboard) ──
async function fetchTagsForVras(vraIds) {
  if (!vraIds.length) return {};
  const { data } = await sb.from('visit_issue_tags')
    .select('visit_report_asset_id, issue_tag_definitions(id, label, section)')
    .in('visit_report_asset_id', vraIds);
  const map = {};
  (data || []).forEach(vit => {
    const vraId = vit.visit_report_asset_id;
    if (!map[vraId]) map[vraId] = [];
    map[vraId].push(vit.issue_tag_definitions);
  });
  return map;
}

// ── Render tag pills for display ──
function renderTagPills(tags, isCritical) {
  if (!tags || !tags.length) return '';
  return tags.map(t => `<span class="issue-tag-pill ${isCritical ? 'critical' : ''}">${t.label}</span>`).join('');
}
