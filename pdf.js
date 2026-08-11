// pdf.js — ArabSpec AMC Portal PDF Generation

const PDF_ACCENT = [59, 87, 115];
const PDF_DARK   = [28, 33, 39];
const PDF_MUTED  = [120, 130, 145];
const PDF_LINE   = [220, 222, 226];
const PDF_GREEN  = [39, 174, 96];
const PDF_AMBER  = [212, 160, 23];
const PDF_RED    = [192, 57, 43];
const PDF_BG     = [250, 250, 249];
const PDF_PURPLE = [91, 33, 182];
const PDF_TEAL   = [14, 165, 160];
const PDF_SLATE  = [148, 163, 184];

// PDF-safe date formatter — always English, no special chars
function pdfFmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}
function pdfCheckBreak(doc, y, needed) {
  if (y + (needed || 20) > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage();
    return 22;
  }
  return y;
}

function pdfFooters(doc) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const n  = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_MUTED);
    doc.text('ArabSpec IT - Confidential', 14, ph - 7);
    doc.text(`Page ${i} of ${n}`, pw - 14, ph - 7, { align: 'right' });
  }
}

function pdfBrandBar(doc, rightText) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_ACCENT);
  doc.rect(0, 0, pw, 13, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('ArabSpec AMC Portal', 14, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(rightText || '', pw - 14, 9, { align: 'right' });
}

function pdfResultBadge(doc, result, x, y) {
  if (!result) return;
  const rgb = result === 'pass' ? PDF_GREEN : result === 'fail' ? PDF_RED : PDF_AMBER;
  const label = result.toUpperCase();
  const w = 22;
  doc.setFillColor(...rgb);
  doc.rect(x, y, w, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(label, x + w / 2, y + 4.3, { align: 'center' });
}

// Solid color stat tile — big number + wrapped label, white text
function pdfStatBox(doc, x, y, w, h, value, label, rgb) {
  doc.setFillColor(...rgb);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(String(value), x + w / 2, y + h * 0.46, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  const lines = doc.splitTextToSize(label, w - 6);
  doc.text(lines, x + w / 2, y + h * 0.46 + 6, { align: 'center' });
}

// Rounded pill progress bar
function pdfProgressBar(doc, x, y, w, h, pct, rgb) {
  doc.setFillColor(230, 232, 236);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
  const fillW = Math.max(h, w * Math.min(1, Math.max(0, pct)));
  doc.setFillColor(...rgb);
  doc.roundedRect(x, y, fillW, h, h / 2, h / 2, 'F');
}

// Small solid pill badge — returns its rendered width
function pdfBadge(doc, label, x, y, rgb) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const w = doc.getStringUnitWidth(label) * (7 / doc.internal.scaleFactor) + 8;
  doc.setFillColor(...rgb);
  doc.rect(x, y, w, 5.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(label, x + w / 2, y + 3.9, { align: 'center' });
  return w;
}

// Table header row — accent bar with column labels
function pdfTableHeader(doc, y, pw, cols) {
  doc.setFillColor(...PDF_ACCENT);
  doc.rect(14, y - 4, pw - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  cols.forEach(([label, x, opts]) => doc.text(label, x, y, opts || {}));
  return y + 7;
}

// Restrained stat card — white card, colored left accent, colored number, muted label.
// Used instead of solid-fill tiles so a row of these reads as "report", not "dashboard".
function pdfStatCard(doc, x, y, w, h, value, label, rgb) {
  doc.setFillColor(252, 252, 251);
  doc.setDrawColor(...PDF_LINE);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFillColor(...rgb);
  doc.rect(x, y, 2.6, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...rgb);
  doc.text(String(value), x + 9, y + h * 0.48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_MUTED);
  const lines = doc.splitTextToSize(label, w - 15);
  doc.text(lines, x + 9, y + h * 0.48 + 6.5);
}

// One row of the unified priority list — severity pill, title, one-line detail,
// and a recommended next action. Height grows to fit wrapped text.
function pdfPriorityCard(doc, y, pw, item) {
  const rgb = item.severity === 'critical' ? PDF_RED : item.severity === 'warning' ? PDF_AMBER : PDF_SLATE;
  const bg  = item.severity === 'critical' ? [253, 237, 236] : item.severity === 'warning' ? [250, 242, 226] : [246, 247, 248];
  const label = item.severity === 'critical' ? 'ACT NOW' : item.severity === 'warning' ? 'WATCH' : 'FYI';

  const textX = 26;
  const textW = pw - 14 - textX - 4;
  const detailLines = doc.splitTextToSize(item.detail, textW);
  const actionLines = item.action ? doc.splitTextToSize(item.action, textW) : [];
  const h = 9 + detailLines.length * 4.6 + (actionLines.length ? actionLines.length * 4.6 + 2 : 0) + 6;

  y = pdfCheckBreak(doc, y, h + 2);

  doc.setFillColor(...bg);
  doc.roundedRect(14, y, pw - 28, h, 2, 2, 'F');
  doc.setFillColor(...rgb);
  doc.rect(14, y, 2.6, h, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...rgb);
  doc.text(label, 20, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_DARK);
  doc.text(item.title, textX, y + 7);

  let ty = y + 7 + 5.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.setTextColor(...PDF_MUTED);
  doc.text(detailLines, textX, ty);
  ty += detailLines.length * 4.6;

  if (actionLines.length) {
    ty += 2;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb);
    doc.text(actionLines.map((l, i) => i === 0 ? `-> ${l}` : l), textX, ty);
  }

  return y + h + 5;
}

// ─────────────────────────────────────────────────────────────
//  VISIT REPORT PDF
//  Matches the "View Report" modal exactly:
//  - Visit info header (Customer, Visit #, Date, Engineer, Notes)
//  - Per-asset dark header bar with overall result
//  - Each of 7 sections: name | result badge
//  - Note in italic below section if present
//  - Issue tag pills below note
// ─────────────────────────────────────────────────────────────
async function downloadVisitReportPDF(reportId, visitNum, visitDate, engineerName, btn) {
  btn = btn || (event && event.target && event.target.closest('button')) || { innerHTML: '', disabled: false };
  const orig = btn.innerHTML;
  btn.innerHTML = 'Generating…';
  btn.disabled  = true;

  try {
    const customerName = myProfile?.name || 'Customer';

    // Fetch data
    const [{ data: report }, { data: vras }] = await Promise.all([
      sb.from('visit_reports')
        .select('overall_notes')
        .eq('id', reportId)
        .single(),
      sb.from('visit_report_assets')
        .select('*, assets(name, employee_name, category), section_notes')
        .eq('visit_report_id', reportId),
    ]);

    const vraIds = (vras || []).map(v => v.id);

    const [{ data: allChecks }, tagMap] = await Promise.all([
      sb.from('visit_report_checks').select('*').in('visit_report_asset_id', vraIds),
      fetchTagsForVras(vraIds),
    ]);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw  = doc.internal.pageSize.getWidth();

    // ── Page 1: branded header + visit info ──────────────────
    pdfBrandBar(doc, 'Visit Report');

    // Visit title block
    doc.setFillColor(244, 246, 248);
    doc.rect(0, 13, pw, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...PDF_DARK);
    doc.text(`${visitNum} - ${visitDate}`, 14, 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_MUTED);
    doc.text(customerName, 14, 31);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pw - 14, 31, { align: 'right' });

    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.4);
    doc.line(0, 35, pw, 35);

    let y = 43;

    // Visit info grid (2 columns)
    const infoFields = [
      ['CUSTOMER',     customerName],
      ['VISIT NUMBER', visitNum],
      ['VISIT DATE',   visitDate],
      ['ENGINEER',     engineerName],
    ];
    const hw = (pw - 28) / 2;
    infoFields.forEach(([lbl, val], i) => {
      const cx = i % 2 === 0 ? 14 : 14 + hw;
      if (i === 2) y -= 14; // second row same y
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...PDF_MUTED);
      doc.text(lbl, cx, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...PDF_DARK);
      doc.text(val || '-', cx, y + 5.5);
      if (i % 2 === 1) y += 14;
    });
    y += 6;

    // Overall notes
    if (report?.overall_notes) {
      y = pdfCheckBreak(doc, y, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...PDF_MUTED);
      doc.text('OVERALL NOTES', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...PDF_DARK);
      const noteLines = doc.splitTextToSize(report.overall_notes, pw - 28);
      doc.text(noteLines, 14, y + 5.5);
      y += 5.5 + noteLines.length * 5 + 4;
    }

    // Section divider
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.4);
    doc.line(14, y, pw - 14, y);
    y += 8;

    // ── Asset blocks ─────────────────────────────────────────
    (vras || []).forEach(vra => {
      const asset       = vra.assets;
      const checks      = (allChecks || []).filter(c => c.visit_report_asset_id === vra.id);
      const tags        = tagMap[vra.id] || [];
      const sectionNotes = vra.section_notes || {};
      const overall     = vra.overall_status;
      const oRgb        = overall === 'pass' ? PDF_GREEN : overall === 'fail' ? PDF_RED : PDF_AMBER;

      // Estimate asset block height to check for page break
      y = pdfCheckBreak(doc, y, 18 + CHECKLIST.length * 10);

      // Asset dark header bar — taller to fit both lines
      doc.setFillColor(36, 40, 50);
      doc.rect(14, y, pw - 28, 16, 'F');

      // Asset name (bold, white)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(asset?.employee_name || asset?.name || '-', 18, y + 7);

      // Asset sub: code - category (smaller, grey)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160, 168, 180);
      doc.text(`${asset?.name || ''}  -  ${asset?.category || ''}`, 18, y + 13);

      // Overall badge (right side, vertically centered)
      if (overall) {
        doc.setFillColor(...oRgb);
        const badgeW = 26;
        const badgeX = pw - 14 - badgeW;
        doc.rect(badgeX, y + 4, badgeW, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(overall.toUpperCase(), badgeX + badgeW / 2, y + 9.5, { align: 'center' });
      }

      y += 18;

      // Section rows
      CHECKLIST.forEach((section, idx) => {
        const match  = checks.find(c => c.section === section);
        const result = match?.result || null;
        const note   = sectionNotes[section] || null;
        const sTags  = tags.filter(t => t.section === section);

        // Calculate row height
        let rh = 12;
        if (note) {
          const nl = doc.splitTextToSize(`Note: ${note}`, pw - 44);
          rh += nl.length * 5 + 3;
        }
        if (sTags.length) rh += Math.ceil(sTags.length / 3) * 7 + 3;

        y = pdfCheckBreak(doc, y, rh + 2);

        // Alternating row bg
        if (idx % 2 === 0) {
          doc.setFillColor(247, 248, 250);
          doc.rect(14, y, pw - 28, rh, 'F');
        }

        // Section name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...PDF_DARK);
        doc.text(section, 18, y + 8);

        // Result badge
        pdfResultBadge(doc, result, pw - 14 - 22, y + 3);

        let subY = y + 13;

        // Note in italic grey
        if (note) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(...PDF_MUTED);
          const nl = doc.splitTextToSize(`Note: ${note}`, pw - 50);
          doc.text(nl, 20, subY);
          subY += nl.length * 5 + 2;
        }

        // Issue tags
        if (sTags.length) {
          const tRgb = result === 'fail' ? PDF_RED : [68, 68, 65];
          const tBg  = result === 'fail' ? [253, 237, 236] : [241, 239, 232];
          let tx = 20;
          sTags.forEach(tag => {
            const tw = doc.getStringUnitWidth(tag.label) * (7.5 / doc.internal.scaleFactor) + 8;
            if (tx + tw > pw - 16) { tx = 20; subY += 7; }
            doc.setFillColor(...tBg);
            doc.setDrawColor(...tRgb);
            doc.setLineWidth(0.4);
            doc.rect(tx, subY - 4, tw, 6, 'FD');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...tRgb);
            doc.text(tag.label, tx + 4, subY + 0.5);
            tx += tw + 4;
          });
          subY += 7;
        }

        y = Math.max(y + rh, subY);

        // Section divider line
        doc.setDrawColor(...PDF_LINE);
        doc.setLineWidth(0.3);
        doc.line(14, y, pw - 14, y);
      });

      y += 8;
    });

    pdfFooters(doc);
    doc.save(`ArabSpecIT_${new Date().toISOString().split('T')[0]}.pdf`);

  } catch (err) {
    console.error('Visit PDF error:', err);
    alert('PDF generation failed: ' + err.message);
  }

  btn.innerHTML = orig;
  btn.disabled  = false;
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD PDF — reads like a memo, not a data export.
//  Page 1: Executive Summary  — verdict, plain-language narrative, headline stats
//  Page 2: Priorities         — one sorted list of everything worth acting on
//  Page 3: Assets & Visits    — reference detail for readers who want to dig in
//  Page 4: Asset-Based Report — per-device checklist detail, OK/FAIL sections only
// ─────────────────────────────────────────────────────────────
async function downloadDashboardPDF(btn) {
  btn = btn || (event && event.target && event.target.closest('button')) || { innerHTML: '', disabled: false };
  const orig = btn.innerHTML;
  btn.innerHTML = 'Generating…';
  btn.disabled  = true;

  try {
    const customerId   = getCustomerId();
    const customerName = myProfile?.name || 'Customer';
    const now          = new Date();
    const today         = now;

    const contracts    = window._dashContracts || [];
    const healthCounts = window._dashHealthCounts || {};
    const assets       = customerAssetsCache || [];
    const tagGroups    = window._dashTagGroups || {};

    const [{ data: subs }, { data: visits }, { data: completedNums }, { data: assignments }, { data: latestVras }] = await Promise.all([
      sb.from('subscriptions').select('*').eq('customer_id', customerId).order('end_date', { ascending: true }),
      sb.from('visit_reports').select('id, visit_number, visit_date, engineer_name').eq('customer_id', customerId).order('visit_date', { ascending: false }).limit(8),
      sb.from('visit_reports').select('visit_number').eq('customer_id', customerId).eq('status', 'completed'),
      sb.from('asset_status_assignments').select('asset_id, asset_statuses(name)').eq('customer_id', customerId).eq('is_resolved', false),
      assets.length
        ? sb.from('visit_report_assets').select('id, asset_id').in('asset_id', assets.map(a => a.id)).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    const subscriptions  = subs || [];
    const recentVisits   = visits || [];
    const visitsCompleted = new Set((completedNums || []).map(r => r.visit_number)).size;

    let visitAssetCounts = {};
    if (recentVisits.length) {
      const { data: vraRows } = await sb.from('visit_report_assets').select('visit_report_id').in('visit_report_id', recentVisits.map(v => v.id));
      (vraRows || []).forEach(r => { visitAssetCounts[r.visit_report_id] = (visitAssetCounts[r.visit_report_id] || 0) + 1; });
    }

    // ── Per-asset status + latest visit checklist/tags, for the Asset-Based Report page ──
    const assetStatusMap = {};
    (assignments || []).forEach(a => {
      if (!assetStatusMap[a.asset_id]) assetStatusMap[a.asset_id] = [];
      if (a.asset_statuses?.name) assetStatusMap[a.asset_id].push(a.asset_statuses.name);
    });

    const latestVraByAsset = {};
    (latestVras || []).forEach(v => { if (!latestVraByAsset[v.asset_id]) latestVraByAsset[v.asset_id] = v.id; });
    const latestVraIds = Object.values(latestVraByAsset);

    let checksByVra = {};
    let tagsByVra = {};
    if (latestVraIds.length) {
      const [{ data: allAssetChecks }, tagMap] = await Promise.all([
        sb.from('visit_report_checks').select('*').in('visit_report_asset_id', latestVraIds),
        fetchTagsForVras(latestVraIds),
      ]);
      (allAssetChecks || []).forEach(c => {
        if (!checksByVra[c.visit_report_asset_id]) checksByVra[c.visit_report_asset_id] = [];
        checksByVra[c.visit_report_asset_id].push(c);
      });
      tagsByVra = tagMap;
    }

    const actionItems = Object.values(tagGroups)
      .map(t => ({ label: t.label, count: t.assets.length }))
      .sort((a, b) => b.count - a.count);

    // ── Shared derived figures ────────────────────────────────
    const activeContract  = contracts.find(c => c.status === 'active') || contracts[0];
    const contractDays    = activeContract ? Math.round((new Date(activeContract.end_date) - today) / 86400000) : null;
    const contractExpired = contracts.some(c => c.status === 'expired') || (contractDays !== null && contractDays < 0);
    const criticalCount   = healthCounts['Critical']?.count || 0;
    const warningCount    = healthCounts['Warning']?.count || 0;
    const expiredRenewals = subscriptions.filter(s => Math.round((new Date(s.end_date) - today) / 86400000) < 0);
    const soonRenewals    = subscriptions.filter(s => { const d = Math.round((new Date(s.end_date) - today) / 86400000); return d >= 0 && d < 60; });
    const renewalAlerts   = expiredRenewals.length + soonRenewals.length;
    const itemsNeedingAttention = criticalCount + warningCount;

    // ── Build the unified, severity-sorted priority list ──────
    const priorityItems = [];
    if (activeContract) {
      if (contractDays < 0) {
        priorityItems.push({ severity: 'critical', title: `Contract ${activeContract.contract_number} has expired`,
          detail: `It ended ${pdfFmtDate(activeContract.end_date)}, ${Math.abs(contractDays)} days ago.`,
          action: 'Renew the AMC contract to avoid a coverage gap.' });
      } else if (contractDays < 30) {
        priorityItems.push({ severity: 'warning', title: `Contract ${activeContract.contract_number} renews soon`,
          detail: `${contractDays} day${contractDays === 1 ? '' : 's'} remaining, expires ${pdfFmtDate(activeContract.end_date)}.`,
          action: 'Start the renewal conversation now to avoid a gap.' });
      }
    } else {
      priorityItems.push({ severity: 'critical', title: 'No active AMC contract on file', detail: 'This account has no active maintenance contract recorded.', action: 'Confirm contract status with ArabSpec.' });
    }
    expiredRenewals.forEach(s => {
      const d = Math.round((new Date(s.end_date) - today) / 86400000);
      priorityItems.push({ severity: 'critical', title: `${s.software_name} license expired`,
        detail: `${s.vendor ? s.vendor + ' - ' : ''}expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago (${pdfFmtDate(s.end_date)}).`,
        action: 'Renew to restore vendor support and updates.' });
    });
    soonRenewals.forEach(s => {
      const d = Math.round((new Date(s.end_date) - today) / 86400000);
      priorityItems.push({ severity: 'warning', title: `${s.software_name} license renews soon`,
        detail: `${s.vendor ? s.vendor + ' - ' : ''}${d} day${d === 1 ? '' : 's'} left, expires ${pdfFmtDate(s.end_date)}.`,
        action: 'Renew ahead of the expiry date.' });
    });
    actionItems.forEach(item => {
      priorityItems.push({ severity: 'warning', title: item.label,
        detail: `Affecting ${item.count} device${item.count === 1 ? '' : 's'} on your network.`,
        action: 'Our engineers will address this on the next scheduled visit.' });
    });
    const severityRank = { critical: 0, warning: 1, info: 2 };
    priorityItems.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
    const criticalItemCount = priorityItems.filter(i => i.severity === 'critical').length;
    const warningItemCount  = priorityItems.filter(i => i.severity === 'warning').length;

    // ── Plain-language narrative for the summary page ─────────
    const sentences = [];
    if (!activeContract) {
      sentences.push('No active AMC contract is currently on file for this account.');
    } else if (contractDays < 0) {
      sentences.push(`Your AMC contract (${activeContract.contract_number}) expired ${Math.abs(contractDays)} day${Math.abs(contractDays) === 1 ? '' : 's'} ago and should be renewed as soon as possible.`);
    } else {
      sentences.push(`Your AMC contract (${activeContract.contract_number}) is active with ${contractDays} day${contractDays === 1 ? '' : 's'} remaining.`);
    }
    if (itemsNeedingAttention > 0) {
      sentences.push(`${itemsNeedingAttention} asset${itemsNeedingAttention === 1 ? '' : 's'} currently need${itemsNeedingAttention === 1 ? 's' : ''} attention${actionItems.length ? `, most notably ${actionItems[0].label.toLowerCase()} (${actionItems[0].count} device${actionItems[0].count === 1 ? '' : 's'})` : ''}.`);
    } else {
      sentences.push('All monitored assets are currently in good health.');
    }
    if (subscriptions.length) {
      if (renewalAlerts > 0) {
        sentences.push(`${expiredRenewals.length} software renewal${expiredRenewals.length === 1 ? '' : 's'} ${expiredRenewals.length === 1 ? 'has' : 'have'} expired and ${soonRenewals.length} more ${soonRenewals.length === 1 ? 'is' : 'are'} due within 60 days.`);
      } else {
        sentences.push('All software renewals are up to date.');
      }
    }
    sentences.push(recentVisits.length
      ? `Your most recent visit was ${pdfFmtDate(recentVisits[0].visit_date)} (Visit #${recentVisits[0].visit_number}).`
      : 'No visit reports are on file yet.');
    const narrative = sentences.join(' ');

    let verdictRgb, verdictLabel, verdictReason;
    if (criticalItemCount > 0) {
      verdictRgb = PDF_RED; verdictLabel = 'Action needed';
      verdictReason = `${criticalItemCount} item${criticalItemCount === 1 ? '' : 's'} need${criticalItemCount === 1 ? 's' : ''} immediate attention`;
    } else if (warningItemCount > 0) {
      verdictRgb = PDF_AMBER; verdictLabel = 'Worth a look';
      verdictReason = `${warningItemCount} item${warningItemCount === 1 ? '' : 's'} worth reviewing soon`;
    } else {
      verdictRgb = PDF_GREEN; verdictLabel = 'All good';
      verdictReason = 'No outstanding issues found';
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw  = doc.internal.pageSize.getWidth();

    // Shared, lighter-weight header for pages 2+
    function pageTop(title, subtitle) {
      pdfBrandBar(doc, 'AMC Health Report');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...PDF_DARK);
      doc.text(title, 14, 26);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_MUTED);
      doc.text(subtitle, 14, 32);
      doc.text(customerName, pw - 14, 26, { align: 'right' });
      doc.setDrawColor(...PDF_LINE);
      doc.setLineWidth(0.4);
      doc.line(14, 37, pw - 14, 37);
      return 47;
    }

    // ── Page 1: Executive Summary ─────────────────────────────
    pdfBrandBar(doc, 'AMC Health Report');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 14, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(...PDF_DARK);
    doc.text(customerName, 14, 34);

    let y = 46;

    // Verdict banner — one clear line with the specific reason behind it
    doc.setFillColor(...verdictRgb);
    doc.roundedRect(14, y, pw - 28, 15, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(verdictLabel, 20, y + 9.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(verdictReason, pw - 20, y + 9.5, { align: 'right' });
    y += 23;

    // Narrative paragraph — the actual "what's going on" summary
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_ACCENT);
    doc.text('IN BRIEF', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...PDF_DARK);
    const narrativeLines = doc.splitTextToSize(narrative, pw - 28);
    doc.text(narrativeLines, 14, y, { lineHeightFactor: 1.5 });
    y += narrativeLines.length * 5.7 + 12;

    // Three headline stats — restrained cards, not a wall of color
    const headline = [
      { value: contractDays === null ? '-' : contractDays < 0 ? 'Expired' : contractDays, label: contractDays === null ? 'No contract on file' : contractDays < 0 ? 'Contract expired' : 'Days left on contract', rgb: contractDays === null ? PDF_SLATE : contractDays < 0 ? PDF_RED : contractDays < 30 ? PDF_AMBER : PDF_ACCENT },
      { value: itemsNeedingAttention, label: 'Assets needing attention', rgb: itemsNeedingAttention > 0 ? PDF_RED : PDF_GREEN },
      { value: renewalAlerts, label: 'Renewals needing attention', rgb: renewalAlerts > 0 ? PDF_AMBER : PDF_GREEN },
    ];
    const boxGap = 5;
    const boxW   = (pw - 28 - boxGap * 2) / 3;
    const boxH   = 24;
    headline.forEach((s, i) => pdfStatCard(doc, 14 + i * (boxW + boxGap), y, boxW, boxH, s.value, s.label, s.rgb));
    y += boxH + 14;

    if (activeContract) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_ACCENT);
      doc.text('CONTRACT PROGRESS', 14, y);
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
      doc.text(`${activeContract.contract_number}  -  ${pdfFmtDate(activeContract.start_date)} - ${pdfFmtDate(activeContract.end_date)}`, 14, y);
      y += 5;
      const span = new Date(activeContract.end_date) - new Date(activeContract.start_date);
      const pct  = span > 0 ? (today - new Date(activeContract.start_date)) / span : 1;
      pdfProgressBar(doc, 14, y, pw - 28, 4, pct, contractDays < 0 ? PDF_RED : contractDays < 30 ? PDF_AMBER : PDF_GREEN);
      y += 14;
    }

    // Small reference caption — the informational totals that used to be big tiles
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED);
    doc.text(`${assets.length} asset${assets.length === 1 ? '' : 's'} under contract   -   ${visitsCompleted} visit${visitsCompleted === 1 ? '' : 's'} completed   -   full detail on page 3`, 14, y);

    // ── Page 2: Priorities ────────────────────────────────────
    doc.addPage();
    y = pageTop('Priorities', 'Everything worth acting on, most urgent first.');

    if (priorityItems.length) {
      priorityItems.forEach(item => { y = pdfPriorityCard(doc, y, pw, item); });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...PDF_GREEN);
      doc.text('Nothing needs your attention right now - everything is on track.', 14, y);
    }

    // ── Page 3: Assets & Visit History (reference) ────────────
    doc.addPage();
    y = pageTop('Assets & Visit History', 'Reference detail - asset health breakdown and recent visits.');

    const FIXED_ORDER = ['Critical', 'Warning', 'Pass', 'No Active Status'];
    const HEALTH_RGB  = { 'Critical': PDF_RED, 'Warning': PDF_AMBER, 'Pass': PDF_GREEN, 'No Active Status': PDF_SLATE };
    const totalAssets = assets.length || 1;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_ACCENT);
    doc.text('Asset Health', 14, y);
    y += 7;
    FIXED_ORDER.forEach(label => {
      const count = healthCounts[label]?.count || 0;
      const pct   = count / totalAssets;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
      doc.text(`${label} (${count})`, 14, y);
      pdfProgressBar(doc, 70, y - 3, pw - 84 - 20, 3.2, pct, HEALTH_RGB[label]);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...HEALTH_RGB[label]);
      doc.text(`${Math.round(pct * 100)}%`, pw - 14, y, { align: 'right' });
      y += 8;
    });
    y += 6;

    const byCategory = {};
    assets.forEach(a => { const cat = a.category || 'Other'; byCategory[cat] = (byCategory[cat] || 0) + 1; });
    if (Object.keys(byCategory).length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_ACCENT);
      doc.text('Assets by Category', 14, y);
      y += 8;
      y = pdfTableHeader(doc, y, pw, [['CATEGORY', 18], ['COUNT', pw - 18, { align: 'right' }]]);
      Object.entries(byCategory).forEach(([cat, count], i) => {
        y = pdfCheckBreak(doc, y, 9);
        if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(14, y - 4.5, pw - 28, 8, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
        doc.text(cat, 18, y);
        doc.text(String(count), pw - 18, y, { align: 'right' });
        y += 8;
      });
      y += 8;
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_ACCENT);
    doc.text('Visit History', 14, y);
    y += 8;
    if (recentVisits.length) {
      y = pdfTableHeader(doc, y, pw, [['VISIT #', 18], ['DATE', 70], ['ENGINEER', 115], ['ASSETS CHECKED', pw - 18, { align: 'right' }]]);
      recentVisits.forEach((v, i) => {
        y = pdfCheckBreak(doc, y, 9);
        if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(14, y - 4.5, pw - 28, 8, 'F'); }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
        doc.text(v.visit_number, 18, y);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_MUTED);
        doc.text(pdfFmtDate(v.visit_date), 70, y);
        doc.text(v.engineer_name || '-', 115, y);
        doc.setTextColor(...PDF_DARK);
        doc.text(String(visitAssetCounts[v.id] || 0), pw - 18, y, { align: 'right' });
        y += 8;
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_MUTED);
      doc.text('No visit reports on file yet.', 14, y);
    }

    // ── Page 4: Asset-Based Report — per-device detail, issues only ──
    if (assets.length) {
      const page4Title = 'Asset-Based Report';
      const page4Sub = 'Per-device checklist detail - sections that need attention.';
      doc.addPage();
      y = pageTop(page4Title, page4Sub);
      let justStartedPage = true;

      assets.forEach(asset => {
        const statusNames = assetStatusMap[asset.id] || [];
        const status = statusNames.includes('Critical') ? 'Critical'
          : statusNames.includes('Warning') ? 'Warning'
          : statusNames.length ? statusNames[0] : 'No Active Status';
        const statusRgb = status === 'Critical' ? PDF_RED : status === 'Warning' ? PDF_AMBER : status === 'Pass' ? PDF_GREEN : PDF_SLATE;

        const vraId = latestVraByAsset[asset.id];
        const checks = vraId ? (checksByVra[vraId] || []) : [];
        const tags = vraId ? (tagsByVra[vraId] || []) : [];
        const flagged = checks.filter(c => c.result === 'ok' || c.result === 'fail');

        // Estimate this asset's full block height so it can start fresh on
        // the next page instead of being split mid-way through its sections.
        const headerH = 14.5;
        const bodyH = (!vraId || !flagged.length)
          ? 10
          : flagged.reduce((sum, chk) => sum + 6 + tags.filter(t => t.section === chk.section).length * 4.6 + 3 + 2, 0);
        const totalH = headerH + bodyH + 4;

        const pageBottom = doc.internal.pageSize.getHeight() - 18;
        if (!justStartedPage && y + totalH > pageBottom) {
          doc.addPage();
          y = pageTop(page4Title, page4Sub);
          justStartedPage = true;
        }

        if (!justStartedPage) {
          doc.setDrawColor(...PDF_LINE); doc.setLineWidth(0.3);
          doc.line(14, y - 6, pw - 14, y - 6);
        }
        justStartedPage = false;

        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_DARK);
        doc.text(asset.employee_name || asset.name, 14, y);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...statusRgb);
        doc.text(status, pw - 14, y, { align: 'right' });
        y += 5.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
        doc.text(`${asset.category || '-'}${asset.name && asset.name !== asset.employee_name ? '  -  ' + asset.name : ''}`, 14, y);
        y += 9;

        if (!vraId) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
          doc.text('No visit report on file yet.', 14, y);
          y += 10;
          return;
        }
        if (!flagged.length) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...PDF_GREEN);
          doc.text('All checked sections passed.', 14, y);
          y += 10;
          return;
        }

        flagged.forEach(chk => {
          const sectionTags = tags.filter(t => t.section === chk.section);
          const rgb = chk.result === 'fail' ? PDF_RED : PDF_AMBER;
          const tagLines = sectionTags.map(t => `-  ${t.label}`);
          const blockH = 6 + tagLines.length * 4.6 + 3;
          // Safety net only — the whole-asset check above should already have
          // kept this on one page; this just guards a pathologically large asset.
          y = pdfCheckBreak(doc, y, blockH + 2);

          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_DARK);
          doc.text(chk.section, 18, y);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...rgb);
          doc.text(chk.result.toUpperCase(), pw - 18, y, { align: 'right' });
          y += 5;

          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3); doc.setTextColor(...PDF_MUTED);
          tagLines.forEach(line => {
            doc.text(line, 22, y);
            y += 4.6;
          });
          y += 3;
        });

        y += 4;
      });
    }

    pdfFooters(doc);
    doc.save(`ArabSpecIT_Dashboard_${now.toISOString().split('T')[0]}.pdf`);

  } catch (err) {
    console.error('Dashboard PDF error:', err);
    alert('PDF generation failed: ' + err.message);
  }

  btn.innerHTML = orig;
  btn.disabled  = false;
}
