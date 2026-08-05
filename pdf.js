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
//  DASHBOARD PDF — plain-language report for non-technical readers
//  Page 1: Summary (status banner + key numbers + contract bar)
//  Page 2: Contract & Renewals
//  Page 3: Asset Health Overview
//  Page 4: Action Items (top issues, ranked by devices affected)
//  Page 5: Visit History
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

    const [{ data: subs }, { data: visits }, { data: completedNums }] = await Promise.all([
      sb.from('subscriptions').select('*').eq('customer_id', customerId).order('end_date', { ascending: true }),
      sb.from('visit_reports').select('id, visit_number, visit_date, engineer_name').eq('customer_id', customerId).order('visit_date', { ascending: false }).limit(8),
      sb.from('visit_reports').select('visit_number').eq('customer_id', customerId).eq('status', 'completed'),
    ]);
    const subscriptions  = subs || [];
    const recentVisits   = visits || [];
    const visitsCompleted = new Set((completedNums || []).map(r => r.visit_number)).size;

    let visitAssetCounts = {};
    if (recentVisits.length) {
      const { data: vraRows } = await sb.from('visit_report_assets').select('visit_report_id').in('visit_report_id', recentVisits.map(v => v.id));
      (vraRows || []).forEach(r => { visitAssetCounts[r.visit_report_id] = (visitAssetCounts[r.visit_report_id] || 0) + 1; });
    }

    const actionItems = Object.values(tagGroups)
      .map(t => ({ label: t.label, count: t.assets.length }))
      .sort((a, b) => b.count - a.count);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw  = doc.internal.pageSize.getWidth();

    // Shared page header for pages 2+
    function pageTop(title) {
      pdfBrandBar(doc, 'Dashboard Report');
      doc.setFillColor(244, 246, 248);
      doc.rect(0, 13, pw, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...PDF_DARK);
      doc.text(customerName, 14, 23);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_MUTED);
      doc.text(now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 14, 28);
      doc.text(`Generated: ${now.toLocaleString('en-GB')}`, pw - 14, 28, { align: 'right' });
      doc.setDrawColor(...PDF_LINE);
      doc.setLineWidth(0.4);
      doc.line(0, 31, pw, 31);

      doc.setFillColor(...PDF_ACCENT);
      doc.rect(14, 37, 3, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...PDF_ACCENT);
      doc.text(title, 20, 43.5);
      doc.setDrawColor(...PDF_LINE);
      doc.setLineWidth(0.3);
      doc.line(14, 46, pw - 14, 46);
      return 54;
    }

    // ── Page 1: Summary ──────────────────────────────────────
    pdfBrandBar(doc, 'Dashboard Report');
    doc.setFillColor(...PDF_ACCENT);
    doc.rect(0, 13, pw, 30, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(255, 255, 255);
    doc.text(customerName, 14, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Annual Maintenance Contract - Dashboard Report', 14, 37);
    doc.setFontSize(8);
    doc.text(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), pw - 14, 37, { align: 'right' });

    let y = 52;

    const activeContract = contracts.find(c => c.status === 'active') || contracts[0];
    const contractDays   = activeContract ? Math.round((new Date(activeContract.end_date) - today) / 86400000) : null;
    const criticalCount  = healthCounts['Critical']?.count || 0;
    const warningCount   = healthCounts['Warning']?.count || 0;
    const contractExpired = contracts.some(c => c.status === 'expired') || (contractDays !== null && contractDays < 0);
    const expiredRenewals = subscriptions.filter(s => Math.round((new Date(s.end_date) - today) / 86400000) < 0).length;
    const soonRenewals    = subscriptions.filter(s => { const d = Math.round((new Date(s.end_date) - today) / 86400000); return d >= 0 && d < 60; }).length;

    // Plain-language status banner
    let bannerRgb, bannerText;
    if (criticalCount > 0 || contractExpired || expiredRenewals > 0) {
      bannerRgb = PDF_RED;
      bannerText = 'Some items need your attention soon.';
    } else if (warningCount > 0 || soonRenewals > 0 || (contractDays !== null && contractDays < 60)) {
      bannerRgb = PDF_AMBER;
      bannerText = 'A few things are worth keeping an eye on.';
    } else {
      bannerRgb = PDF_GREEN;
      bannerText = 'Everything is in good shape.';
    }
    doc.setFillColor(...bannerRgb);
    doc.roundedRect(14, y, pw - 28, 12, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(bannerText, pw / 2, y + 7.7, { align: 'center' });
    y += 20;

    // Key numbers strip (mirrors the on-screen dashboard tiles)
    const renewalAlerts = expiredRenewals + soonRenewals;
    const stats = [
      { value: contractDays === null ? '-' : contractDays < 0 ? 'Expired' : contractDays, label: 'Contract Days Remaining', rgb: contractDays === null ? PDF_SLATE : contractDays < 0 ? PDF_RED : contractDays < 60 ? PDF_AMBER : PDF_ACCENT },
      { value: assets.length, label: 'Total Assets', rgb: PDF_ACCENT },
      { value: visitsCompleted, label: 'Visits Completed', rgb: PDF_TEAL },
      { value: criticalCount, label: 'Critical Issues', rgb: criticalCount > 0 ? PDF_RED : PDF_GREEN },
      { value: renewalAlerts, label: 'Renewals Needing Attention', rgb: renewalAlerts > 0 ? PDF_AMBER : PDF_GREEN },
    ];
    const boxGap = 4;
    const boxW   = (pw - 28 - boxGap * 4) / 5;
    const boxH   = 28;
    stats.forEach((s, i) => pdfStatBox(doc, 14 + i * (boxW + boxGap), y, boxW, boxH, s.value, s.label, s.rgb));
    y += boxH + 14;

    if (activeContract) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_DARK);
      doc.text(`Current Contract: ${activeContract.contract_number}`, 14, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED);
      doc.text(`${pdfFmtDate(activeContract.start_date)} - ${pdfFmtDate(activeContract.end_date)}`, pw - 14, y, { align: 'right' });
      y += 5;
      const span = new Date(activeContract.end_date) - new Date(activeContract.start_date);
      const pct  = span > 0 ? (today - new Date(activeContract.start_date)) / span : 1;
      pdfProgressBar(doc, 14, y, pw - 28, 4, pct, contractDays < 0 ? PDF_RED : contractDays < 60 ? PDF_AMBER : PDF_GREEN);
      y += 12;
    }

    if (actionItems.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_DARK);
      doc.text('Top thing to address:', 14, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_MUTED);
      doc.text(`${actionItems[0].label} (${actionItems[0].count} device${actionItems[0].count === 1 ? '' : 's'}) - see Action Items on page 4`, 60, y);
    }

    // ── Page 2: Contract & Renewals ──────────────────────────
    doc.addPage();
    y = pageTop('Contract & Renewals');

    if (contracts.length) {
      contracts.forEach(c => {
        y = pdfCheckBreak(doc, y, 32);
        doc.setFillColor(247, 248, 250);
        doc.rect(14, y, pw - 28, 26, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_DARK);
        doc.text(c.contract_number, 18, y + 8);
        const statusRgb = c.status === 'active' ? PDF_GREEN : c.status === 'expired' ? PDF_RED : PDF_SLATE;
        pdfBadge(doc, c.status.toUpperCase(), pw - 14 - 26, y + 4, statusRgb);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED);
        doc.text(c.contract_type || '-', 18, y + 14);
        const cDays = Math.round((new Date(c.end_date) - today) / 86400000);
        doc.text(`${pdfFmtDate(c.start_date)} - ${pdfFmtDate(c.end_date)}`, 18, y + 20);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(cDays < 0 ? PDF_RED : cDays < 60 ? PDF_AMBER : PDF_GREEN));
        doc.text(cDays < 0 ? 'Expired' : `${cDays} days remaining`, pw - 18, y + 20, { align: 'right' });
        y += 32;
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_MUTED);
      doc.text('No contracts assigned.', 14, y);
      y += 10;
    }

    y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_ACCENT);
    doc.text('Software & License Renewals', 14, y);
    y += 8;

    if (subscriptions.length) {
      y = pdfTableHeader(doc, y, pw, [['SOFTWARE', 18], ['VENDOR', 90], ['EXPIRY', 135], ['STATUS', pw - 18, { align: 'right' }]]);
      subscriptions.forEach((s, i) => {
        y = pdfCheckBreak(doc, y, 9);
        if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(14, y - 4.5, pw - 28, 8, 'F'); }
        const days  = Math.round((new Date(s.end_date) - today) / 86400000);
        const rgb   = days < 0 ? PDF_RED : days < 60 ? PDF_AMBER : PDF_GREEN;
        const label = days < 0 ? 'Expired' : days < 60 ? `${days}d left` : 'Active';
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_DARK);
        doc.text(s.software_name, 18, y);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_MUTED);
        doc.text(s.vendor || '-', 90, y);
        doc.text(pdfFmtDate(s.end_date), 135, y);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb);
        doc.text(label, pw - 18, y, { align: 'right' });
        y += 8;
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_MUTED);
      doc.text('No software renewals on file.', 14, y);
    }

    // ── Page 3: Asset Health Overview ────────────────────────
    doc.addPage();
    y = pageTop('Asset Health Overview');

    const FIXED_ORDER = ['Critical', 'Warning', 'Pass', 'No Active Status'];
    const HEALTH_RGB  = { 'Critical': PDF_RED, 'Warning': PDF_AMBER, 'Pass': PDF_GREEN, 'No Active Status': PDF_SLATE };
    const totalAssets = assets.length || 1;
    const hGap = 5;
    const hW   = (pw - 28 - hGap * 3) / 4;
    const hH   = 30;
    FIXED_ORDER.forEach((label, i) => {
      const count = healthCounts[label]?.count || 0;
      const pct   = Math.round(count / totalAssets * 100);
      pdfStatBox(doc, 14 + i * (hW + hGap), y, hW, hH, count, `${label} (${pct}%)`, HEALTH_RGB[label]);
    });
    y += hH + 14;

    const byCategory = {};
    assets.forEach(a => {
      const cat = a.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_ACCENT);
    doc.text('Assets by Category', 14, y);
    y += 8;
    if (Object.keys(byCategory).length) {
      y = pdfTableHeader(doc, y, pw, [['CATEGORY', 18], ['COUNT', pw - 18, { align: 'right' }]]);
      Object.entries(byCategory).forEach(([cat, count], i) => {
        y = pdfCheckBreak(doc, y, 9);
        if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(14, y - 4.5, pw - 28, 8, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
        doc.text(cat, 18, y);
        doc.text(String(count), pw - 18, y, { align: 'right' });
        y += 8;
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_MUTED);
      doc.text('No assets registered yet.', 14, y);
    }

    // ── Page 4: Action Items ─────────────────────────────────
    doc.addPage();
    y = pageTop('Action Items');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_MUTED);
    doc.text('What our engineers recommend addressing, ranked by how many devices are affected.', 14, y);
    y += 10;

    if (actionItems.length) {
      actionItems.forEach((item, i) => {
        y = pdfCheckBreak(doc, y, 14);
        if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(14, y - 5, pw - 28, 12, 'F'); }
        doc.setFillColor(...PDF_AMBER);
        doc.circle(19, y - 0.5, 1.4, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...PDF_DARK);
        doc.text(item.label, 24, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED);
        doc.text(`${item.count} device${item.count === 1 ? '' : 's'} affected`, pw - 18, y, { align: 'right' });
        y += 12;
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_GREEN);
      doc.text('No open issues found. Great job keeping things maintained.', 14, y);
    }

    // ── Page 5: Visit History ─────────────────────────────────
    doc.addPage();
    y = pageTop('Visit History');

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

    pdfFooters(doc);
    doc.save(`ArabSpecIT_Dashboard_${now.toISOString().split('T')[0]}.pdf`);

  } catch (err) {
    console.error('Dashboard PDF error:', err);
    alert('PDF generation failed: ' + err.message);
  }

  btn.innerHTML = orig;
  btn.disabled  = false;
}
