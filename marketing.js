// marketing.js — admin bulk marketing email module: upload an Excel/CSV
// recipient list, compose a subject + HTML body, and send. Kept in its own
// file so it doesn't get tangled up with the other admin tab scripts.

var _marketingRecipients = [];
var _marketingCampaignsData = [];
const MARKETING_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function handleMarketingFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      let text = '';
      workbook.SheetNames.forEach(name => {
        text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]) + '\n';
      });
      const found = text.match(MARKETING_EMAIL_RE) || [];
      const deduped = Array.from(new Set(found.map(e => e.trim().toLowerCase())));
      _marketingRecipients = deduped;
      renderMarketingRecipients();
    } catch (err) {
      alert('Could not read that file: ' + err.message);
      clearMarketingRecipients();
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderMarketingRecipients() {
  const summaryEl = document.getElementById('marketing-recipients-summary');
  const countEl = document.getElementById('marketing-recipients-count');
  const previewEl = document.getElementById('marketing-recipients-preview');
  if (!_marketingRecipients.length) {
    summaryEl.style.display = 'none';
    return;
  }
  summaryEl.style.display = 'block';
  countEl.textContent = _marketingRecipients.length;
  const preview = _marketingRecipients.slice(0, 15).map(escapeHtml).join(', ');
  const more = _marketingRecipients.length > 15 ? ` … and ${_marketingRecipients.length - 15} more` : '';
  previewEl.innerHTML = preview + more;
}

function clearMarketingRecipients() {
  _marketingRecipients = [];
  const fileInput = document.getElementById('marketing-file-input');
  if (fileInput) fileInput.value = '';
  renderMarketingRecipients();
}

// Mirrors the footer send-marketing-email appends server-side, so the
// preview shows exactly what recipients will see. The real link is unique
// per recipient (signed with their email) and only exists once the email
// is actually sent, so the preview uses a placeholder href instead.
function marketingFooterHtml() {
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#94A3B8;font-family:Arial,sans-serif;">
    You received this email from ArabSpec AMC. <a href="#" style="color:#94A3B8;">Unsubscribe</a>
  </div>`;
}

function openMarketingPreview() {
  const subject = document.getElementById('marketing-subject-input').value.trim();
  const html = document.getElementById('marketing-html-input').value.trim();
  if (!html) {
    alert('Paste the email HTML first.');
    return;
  }
  const footer = marketingFooterHtml();
  const finalHtml = html.includes('</body>') ? html.replace('</body>', `${footer}</body>`) : `${html}${footer}`;

  document.getElementById('marketing-preview-subject').textContent = subject || '(no subject)';
  document.getElementById('marketing-preview-frame').srcdoc = finalHtml;
  document.getElementById('marketing-preview-overlay').classList.add('open');
}

function closeMarketingPreview() {
  document.getElementById('marketing-preview-overlay').classList.remove('open');
}

async function sendMarketingCampaign() {
  const subject = document.getElementById('marketing-subject-input').value.trim();
  const html = document.getElementById('marketing-html-input').value.trim();
  const statusEl = document.getElementById('marketing-send-status');
  const btn = document.getElementById('marketing-send-btn');
  statusEl.style.display = 'none';

  if (!_marketingRecipients.length) {
    statusEl.style.display = 'block'; statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Upload a recipient list first.';
    return;
  }
  if (!subject) {
    statusEl.style.display = 'block'; statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Enter a subject.';
    return;
  }
  if (!html) {
    statusEl.style.display = 'block'; statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Paste the email HTML.';
    return;
  }

  if (!confirm(`Send this email to ${_marketingRecipients.length} recipient(s)? This cannot be undone.`)) return;

  btn.disabled = true;
  btn.textContent = 'Sending…';

  const { data, error } = await sb.functions.invoke('send-marketing-email', {
    body: { subject, html, recipients: _marketingRecipients },
  });

  btn.disabled = false;
  btn.textContent = 'Send Campaign';
  statusEl.style.display = 'block';

  if (error || data?.error) {
    statusEl.style.color = 'var(--rust)';
    statusEl.textContent = 'Failed to send: ' + (data?.error || error.message);
    return;
  }

  statusEl.style.color = 'var(--accent)';
  statusEl.textContent = `Sent to ${data.sent} of ${data.total} recipient(s).` +
    (data.skippedUnsubscribed ? ` ${data.skippedUnsubscribed} skipped (unsubscribed).` : '') +
    (data.failed ? ` ${data.failed} failed.` : '');

  document.getElementById('marketing-subject-input').value = '';
  document.getElementById('marketing-html-input').value = '';
  clearMarketingRecipients();
  loadMarketingTab();
}

async function loadMarketingTab() {
  const tbody = document.getElementById('marketing-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading…</td></tr>';

  const { data, error } = await sb.from('marketing_campaigns')
    .select('*').order('created_at', { ascending: false }).limit(50);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No campaigns sent yet.</td></tr>';
    return;
  }
  _marketingCampaignsData = data;

  const { data: recipRows } = await sb.from('marketing_campaign_recipients').select('campaign_id, opened_at, clicked_at');
  const openedByCampaign = {}, clickedByCampaign = {};
  (recipRows || []).forEach(r => {
    if (r.opened_at) openedByCampaign[r.campaign_id] = (openedByCampaign[r.campaign_id] || 0) + 1;
    if (r.clicked_at) clickedByCampaign[r.campaign_id] = (clickedByCampaign[r.campaign_id] || 0) + 1;
  });

  tbody.innerHTML = data.map(c => `
    <tr>
      <td>${escapeHtml(c.subject)}</td>
      <td>${c.total_recipients}</td>
      <td>${c.sent_count}</td>
      <td>${c.skipped_unsubscribed}</td>
      <td>${(c.failed_emails || []).length}</td>
      <td>${openedByCampaign[c.id] || 0}</td>
      <td>${clickedByCampaign[c.id] || 0}</td>
      <td>${fmtDateTime(c.created_at)}</td>
      <td><button class="secondary" style="padding:4px 10px;font-size:11.5px;" onclick="openMarketingDetail('${c.id}')">View</button></td>
    </tr>
  `).join('');
}

async function openMarketingDetail(campaignId) {
  const campaign = _marketingCampaignsData.find(c => c.id === campaignId);
  document.getElementById('marketing-detail-title').textContent = `Campaign Detail — ${campaign ? campaign.subject : ''}`;
  const tbody = document.getElementById('marketing-detail-tbody');
  tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Loading…</td></tr>';
  document.getElementById('marketing-detail-overlay').classList.add('open');

  const { data, error } = await sb.from('marketing_campaign_recipients')
    .select('*').eq('campaign_id', campaignId).order('email');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No recipients recorded for this campaign.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${escapeHtml(r.email)}</td>
      <td>${r.opened_at ? `Yes (${r.open_count}×) — ${fmtDateTime(r.opened_at)}` : '—'}</td>
      <td>${r.clicked_at ? `Yes (${r.click_count}×) — ${fmtDateTime(r.clicked_at)}` : '—'}</td>
    </tr>
  `).join('');
}

function closeMarketingDetail() {
  document.getElementById('marketing-detail-overlay').classList.remove('open');
}
