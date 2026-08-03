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

  // Group by section — includes both EU and DC sections
  const allSections = [...CHECKLIST, ...DC_CHECKLIST];
  const groups = {};
  allSections.forEach(s => { groups[s] = []; });
  allTagDefs.forEach(t => {
    if (groups[t.section] !== undefined) groups[t.section].push(t);
  });

function renderSectionBlock(section) {
    return `
      <div class="tag-section-block">
        <div class="tag-section-header">
          <span class="tag-section-title">${section}</span>
          <span style="font-size:11px;color:#8A8377;">${groups[section].length} tag${groups[section].length !== 1 ? 's' : ''}</span>
        </div>
        <div class="tag-list" id="taglist-${slugifySection(section)}">
          ${groups[section].map(t => `
            <div class="tag-item" id="tagitem-${t.id}">
              <div style="display:flex;flex-direction:column;flex:1;min-width:0;gap:1px;">
                <span class="tag-item-label" id="taglabel-${t.id}">${t.label}</span>
                <span style="font-size:11px;color:#8A8377;direction:rtl;" id="taglabel-ar-${t.id}">${t.label_ar || '<em style=\"color:#ccc;\">No Arabic</em>'}</span>
                <div id="taginput-wrap-${t.id}" style="display:none;flex-direction:column;gap:3px;">
                  <input type="text" id="taginput-${t.id}" value="${t.label}"
                    style="margin-bottom:0;padding:2px 6px;font-size:12px;height:24px;" placeholder="English"
                    onkeydown="if(event.key==='Enter') saveTagEdit('${t.id}'); if(event.key==='Escape') cancelTagEdit('${t.id}')"/>
                  <input type="text" id="taginput-ar-${t.id}" value="${t.label_ar || ''}"
                    style="margin-bottom:0;padding:2px 6px;font-size:12px;height:24px;direction:rtl;" placeholder="العربية"
                    onkeydown="if(event.key==='Enter') saveTagEdit('${t.id}'); if(event.key==='Escape') cancelTagEdit('${t.id}')"/>
                </div>
              </div>
              <button class="tag-item-del" title="Edit" onclick="startTagEdit('${t.id}')" style="color:var(--accent);margin-right:2px;">✎</button>
              <button class="tag-item-del" title="Delete" onclick="deleteTag('${t.id}','${t.label.replace(/'/g, "\\'")}')">×</button>
            </div>
          `).join('') || '<span style="font-size:12px;color:#8A8377;padding:2px 0;">No tags yet</span>'}
        </div>
        <div class="tag-add-row" style="flex-direction:column;gap:4px;">
          <input type="text" id="tag-input-${slugifySection(section)}" placeholder="Add new tag (English)…"
            onkeydown="if(event.key==='Enter') addTag('${section}')"/>
          <input type="text" id="tag-input-ar-${slugifySection(section)}" placeholder="التسمية بالعربية (اختياري)" style="direction:rtl;"
            onkeydown="if(event.key==='Enter') addTag('${section}')"/>
          <button onclick="addTag('${section}')" style="padding:6px 14px;font-size:12.5px;align-self:flex-start;">+ Add</button>
        </div>
      </div>`;
  }

  body.innerHTML =
    `<div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.07em;
      padding:6px 10px;background:#F0FDF4;border-radius:6px;margin-bottom:12px;border:1px solid #BBF7D0;">
      💻 End User Sections
    </div>` +
    CHECKLIST.map(renderSectionBlock).join('') +
    `<div style="font-size:11px;font-weight:700;color:#3730A3;text-transform:uppercase;letter-spacing:0.07em;
      padding:6px 10px;background:#EEF2FF;border-radius:6px;margin:20px 0 12px;border:1px solid #C7D2FE;">
      🖥️ Data Center Sections
    </div>` +
    DC_CHECKLIST.map(renderSectionBlock).join('');
}

function slugifySection(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function startTagEdit(tagId) {
  document.getElementById(`taglabel-${tagId}`).style.display = 'none';
  document.getElementById(`taglabel-ar-${tagId}`).style.display = 'none';
  const wrap = document.getElementById(`taginput-wrap-${tagId}`);
  if (wrap) { wrap.style.display = 'flex'; }
  const input = document.getElementById(`taginput-${tagId}`);
  if (input) { input.focus(); input.select(); }
}

function cancelTagEdit(tagId) {
  document.getElementById(`taglabel-${tagId}`).style.display = 'inline';
  document.getElementById(`taglabel-ar-${tagId}`).style.display = 'block';
  const wrap = document.getElementById(`taginput-wrap-${tagId}`);
  if (wrap) wrap.style.display = 'none';
}

async function saveTagEdit(tagId) {
  const input = document.getElementById(`taginput-${tagId}`);
  const inputAr = document.getElementById(`taginput-ar-${tagId}`);
  const newLabel = input?.value.trim();
  const newLabelAr = inputAr?.value.trim() || null;
  if (!newLabel) { cancelTagEdit(tagId); return; }

  const { error } = await sb.from('issue_tag_definitions')
    .update({ label: newLabel, label_ar: newLabelAr })
    .eq('id', tagId);
  if (error) { alert('Failed to update: ' + error.message); return; }

  const labelEl = document.getElementById(`taglabel-${tagId}`);
  if (labelEl) labelEl.textContent = newLabel;
  const labelArEl = document.getElementById(`taglabel-ar-${tagId}`);
  if (labelArEl) labelArEl.innerHTML = newLabelAr || '<span style="color:#ccc;font-style:italic;">No Arabic</span>';
  cancelTagEdit(tagId);
}

async function addTag(section) {
  const inputId = `tag-input-${slugifySection(section)}`;
  const inputArId = `tag-input-ar-${slugifySection(section)}`;
  const input = document.getElementById(inputId);
  const inputAr = document.getElementById(inputArId);
  const label = input?.value.trim();
  const label_ar = inputAr?.value.trim() || null;
  if (!label) return;

  const { error } = await sb.from('issue_tag_definitions').insert({ section, label, label_ar });
  if (error) { alert('Failed: ' + error.message); return; }
  input.value = '';
  if (inputAr) inputAr.value = '';
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

// ── Render issue tag checkboxes for a section (shown when result = ok/fail) ──
function renderIssueTags(assetId, section) {
  const sectionTags = allTagDefs.filter(t => t.section === section);
  return `
    <div class="issue-checks-wrap">
      <div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Issues Observed</div>
      ${sectionTags.length
        ? sectionTags.map(t => `
            <div class="issue-check-row">
              <input type="checkbox" id="itag-${slugify(assetId + t.id)}"
                onchange="onTagChange('${assetId}','${section}','${t.id}',this.checked)"/>
              <label for="itag-${slugify(assetId + t.id)}" style="cursor:pointer;">${t.label}</label>
            </div>
          `).join('')
        : `<div style="font-size:12px;color:#8A8377;font-style:italic;">No tags defined for this section. Add them in the Tags tab.</div>`
      }
    </div>`;
}

// Show/hide issue tags when OK or FAIL is selected for a section
function toggleIssueTags(assetId, section, result) {
  const wrap = document.getElementById(`issue-wrap-${slugify(assetId + section)}`);
  if (!wrap) return;
  if (result === 'fail' || result === 'ok') {
    wrap.style.display = 'block';
  } else {
    // Hide and clear all checkboxes + state for this section
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
    .select('visit_report_asset_id, issue_tag_definitions(id, label, label_ar, section)')
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
  return tags.map(t => {
    const displayLabel = (currentLang === 'ar' && t.label_ar) ? t.label_ar : t.label;
    return `<span class="issue-tag-pill ${isCritical ? 'critical' : ''}">${displayLabel}</span>`;
  }).join('');
}
