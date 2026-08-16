// marketing.js — admin bulk marketing email module: upload an Excel/CSV
// recipient list, compose a subject + HTML body, and send. Kept in its own
// file so it doesn't get tangled up with the other admin tab scripts.

var _marketingRecipients = [];
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

function updateMarketingPreview() {
  const html = document.getElementById('marketing-html-input').value;
  const frame = document.getElementById('marketing-preview-frame');
  if (frame) frame.srcdoc = html;
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
  updateMarketingPreview();
  clearMarketingRecipients();
  loadMarketingTab();
}

async function loadMarketingTab() {
  const tbody = document.getElementById('marketing-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';

  const { data, error } = await sb.from('marketing_campaigns')
    .select('*').order('created_at', { ascending: false }).limit(50);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No campaigns sent yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(c => `
    <tr>
      <td>${escapeHtml(c.subject)}</td>
      <td>${c.total_recipients}</td>
      <td>${c.sent_count}</td>
      <td>${c.skipped_unsubscribed}</td>
      <td>${(c.failed_emails || []).length}</td>
      <td>${fmtDateTime(c.created_at)}</td>
    </tr>
  `).join('');
}
