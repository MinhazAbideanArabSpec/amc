// pdf.js — Visit Report PDF (matches the view report modal exactly)

const PDF_ACCENT = [59, 87, 115];
const PDF_DARK   = [28, 33, 39];
const PDF_MUTED  = [100, 116, 139];
const PDF_LINE   = [220, 222, 226];
const PDF_GREEN  = [39, 174, 96];
const PDF_AMBER  = [212, 160, 23];
const PDF_RED    = [192, 57, 43];
const PDF_BG     = [250, 250, 249];

// ── Helpers ──────────────────────────────────────────────────
function checkPageBreak(doc, y, needed) {
  needed = needed || 20;
  const ph = doc.internal.pageSize.getHeight();
  if (y + needed > ph - 16) { doc.addPage(); return 20; }
  return y;
}

function pdfPageNum(doc) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(`Page ${i} of ${total}`, pw - 14, ph - 8, { align: 'right' });
    doc.text('ArabSpec IT — Confidential', 14, ph - 8);
  }
}

// ── Top branded header ────────────────────────────────────────
function pdfHeader(doc, customerName, visitNum, visitDate, engineer) {
  const pw = doc.internal.pageSize.getWidth();

  // Accent bar
  doc.setFillColor(...PDF_ACCENT);
  doc.rect(0, 0, pw, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ArabSpec AMC Portal', 14, 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Visit Report', pw - 14, 9.5, { align: 'right' });

  // Visit title line
  doc.setFillColor(...PDF_BG);
  doc.rect(0, 14, pw, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...PDF_DARK);
  doc.text(`${visitNum}  —  ${visitDate}`, 14, 26);

  // Subtitle: customer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  doc.text(customerName, 14, 33);

  // Generated date right-aligned
  const now = new Date();
  doc.text(`Generated: ${now.toLocaleString('en-GB')}`, pw - 14, 33, { align: 'right' });

  // Divider
  doc.setDrawColor(...PDF_LINE);
  doc.setLineWidth(0.4);
  doc.line(14, 37, pw - 14, 37);

  return 45;
}

// ── Visit info block ──────────────────────────────────────────
function pdfVisitInfo(doc, y, report) {
  const pw = doc.internal.pageSize.getWidth();
  const fields = [
    ['CUSTOMER',      report.customerName],
    ['VISIT NUMBER',  report.visitNumber],
    ['VISIT DATE',    report.visitDate],
    ['ENGINEER',      report.engineer],
  ];
  const colW = (pw - 28) / 2;
  let x = 14;
  fields.forEach(([label, val], i) => {
    if (i === 2) { x = 14 + colW; y -= 14; } // 2 per row
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_DARK);
    doc.text(val || '—', x, y + 5.5);
    if (i % 2 === 0) x += colW;
    else { x = 14; y += 14; }
  });
  y += 6;

  // Overall notes
  if (report.overallNotes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text('OVERALL NOTES', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_DARK);
    const lines = doc.splitTextToSize(report.overallNotes, pw - 28);
    doc.text(lines, 14, y + 5.5);
    y += 5.5 + lines.length * 5 + 4;
  }

  // Divider
  doc.setDrawColor(...PDF_LINE);
  doc.setLineWidth(0.4);
  doc.line(14, y, pw - 14, y);
  return y + 6;
}

// ── Asset block ───────────────────────────────────────────────
function pdfAssetBlock(doc, y, vra, checks, tags) {
  const pw = doc.internal.pageSize.getWidth();
  const asset = vra.assets;
  const overall = vra.overall_status;
  const overallRgb = overall === 'pass' ? PDF_GREEN : overall === 'fail' ? PDF_RED : PDF_AMBER;

  // Check space
  y = checkPageBreak(doc, y, 30);

  // Asset header bar
  doc.setFillColor(40, 45, 55);
  doc.rect(14, y, pw - 28, 11, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`${asset?.employee_name || asset?.name || '—'}`, 18, y + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 185, 195);
  doc.text(`${asset?.name || ''} · ${asset?.category || ''}`, 18, y + 14 > y + 11 ? y + 10 : y + 10);

  // Overall badge right
  if (overall) {
    doc.setFillColor(...overallRgb);
    doc.roundedRect(pw - 40, y + 2, 24, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(overall.toUpperCase(), pw - 28, y + 7, { align: 'center' });
  }
  y += 14;

  // Section rows
  CHECKLIST.forEach((section, i) => {
    const match = checks.find(c => c.section === section);
    const result = match?.result || null;
    const note = vra.section_notes?.[section];
    const sectionTags = tags.filter(t => t.section === section);

    const rowH = 9 + (note ? Math.ceil(note.length / 55) * 4.5 : 0) + (sectionTags.length ? Math.ceil(sectionTags.length / 4) * 5.5 : 0);
    y = checkPageBreak(doc, y, rowH + 2);

    // Alternating row bg
    if (i % 2 === 0) {
      doc.setFillColor(248, 249, 250);
      doc.rect(14, y, pw - 28, rowH, 'F');
    }

    // Section name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_DARK);
    doc.text(section, 18, y + 6);

    // Result badge
    if (result) {
      const rgb = result === 'pass' ? PDF_GREEN : result === 'fail' ? PDF_RED : PDF_AMBER;
      doc.setFillColor(...rgb);
      doc.roundedRect(pw - 38, y + 1.5, 22, 6.5, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(result.toUpperCase(), pw - 27, y + 6, { align: 'center' });
    }
    let subY = y + 9;

    // Note
    if (note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_MUTED);
      const noteLines = doc.splitTextToSize(`Note: ${note}`, pw - 40);
      doc.text(noteLines, 20, subY);
      subY += noteLines.length * 4.5;
    }

    // Issue tag pills (drawn as text labels)
    if (sectionTags.length) {
      let tx = 20;
      sectionTags.forEach(tag => {
        const tagW = doc.getStringUnitWidth(tag.label) * 7.5 / doc.internal.scaleFactor + 6;
        if (tx + tagW > pw - 16) { tx = 20; subY += 5.5; }
        const rgb = result === 'fail' ? PDF_RED : PDF_AMBER;
        doc.setFillColor(rgb[0], rgb[1], rgb[2], 0.08);
        doc.setDrawColor(...rgb);
        doc.setLineWidth(0.3);
        doc.roundedRect(tx, subY - 3.5, tagW, 5.5, 1, 1, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...rgb);
        doc.text(tag.label, tx + 3, subY + 0.5);
        tx += tagW + 3;
      });
      subY += 5.5;
    }

    y = Math.max(y + rowH, subY);

    // Row divider
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.2);
    doc.line(14, y, pw - 14, y);
  });

  return y + 8;
}

// ── Main: Download Visit Report PDF ──────────────────────────
async function downloadVisitReportPDF(reportId, visitNum, visitDate, engineerName) {
  const btn = event.target.closest('button');
  const orig = btn.innerHTML;
  btn.innerHTML = 'Generating…'; btn.disabled = true;

  const customerName = myProfile?.name || 'Customer';

  // Fetch full report
  const { data: report } = await sb.from('visit_reports')
    .select('overall_notes, profiles!visit_reports_customer_id_fkey(name)')
    .eq('id', reportId).single();

  // Fetch VRAs with assets and section notes
  const { data: vras } = await sb.from('visit_report_assets')
    .select('*, assets(name, employee_name, category), section_notes')
    .eq('visit_report_id', reportId);

  // Fetch all checks
  const { data: allChecks } = await sb.from('visit_report_checks')
    .select('*')
    .in('visit_report_asset_id', (vras || []).map(v => v.id));

  // Fetch all issue tags
  const tagMap = await fetchTagsForVras((vras || []).map(v => v.id));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let y = pdfHeader(doc, customerName, visitNum, visitDate, engineerName);

  // Visit info
  y = pdfVisitInfo(doc, y, {
    customerName,
    visitNumber: visitNum,
    visitDate,
    engineer: engineerName,
    overallNotes: report?.overall_notes,
  });

  // Asset blocks
  (vras || []).forEach(vra => {
    const checks = (allChecks || []).filter(c => c.visit_report_asset_id === vra.id);
    const tags   = tagMap[vra.id] || [];
    y = pdfAssetBlock(doc, y, vra, checks, tags);
  });

  pdfPageNum(doc);
  doc.save(`ArabSpec_VisitReport_${visitNum.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);

  btn.innerHTML = orig; btn.disabled = false;
}

// ── Dashboard PDF ─────────────────────────────────────────────
async function downloadDashboardPDF() {
  const btn = event.target.closest('button');
  const orig = btn.innerHTML;
  btn.innerHTML = 'Generating…'; btn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const customerName = myProfile?.name || 'Customer';
    const now = new Date();

    // ── Page 1: Header + Contract Overview ──
    doc.setFillColor(...PDF_ACCENT);
    doc.rect(0, 0, pw, 16, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text('ArabSpec AMC Portal', 14, 11);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.text('Dashboard Report', pw - 14, 11, { align: 'right' });

    doc.setFillColor(245,247,250);
    doc.rect(0, 16, pw, 22, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...PDF_DARK);
    doc.text(customerName, 14, 28);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED);
    const gregDate = now.toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    doc.text(`${gregDate}  ·  ${toHijri(now,false)}`, 14, 34);
    doc.text(`Generated: ${now.toLocaleString('en-GB')}`, pw - 14, 34, { align: 'right' });
    doc.setDrawColor(...PDF_LINE); doc.setLineWidth(0.5); doc.line(0, 38, pw, 38);

    let y = 48;

    // Section heading helper
    const sectionHead = (title) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(11);
      doc.setFillColor(...PDF_ACCENT);
      doc.rect(14, y - 1, 3, 8, 'F');
      doc.setTextColor(...PDF_ACCENT);
      doc.text(title, 20, y + 5.5);
      doc.setDrawColor(...PDF_LINE); doc.setLineWidth(0.3);
      doc.line(14, y + 9, pw - 14, y + 9);
      y += 14;
    };

    // ── Contract Overview ──
    sectionHead('Contract Overview');
    const today = new Date();
    if (window._dashContracts?.length) {
      window._dashContracts.forEach((c, i) => {
        y = checkPageBreak(doc, y, 14);
        const days = Math.max(0, Math.round((new Date(c.end_date) - today) / 86400000));
        if (i % 2 === 0) { doc.setFillColor(247,248,250); doc.rect(14, y-2, pw-28, 11, 'F'); }
        doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...PDF_DARK);
        doc.text(c.contract_number, 16, y + 5);
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED);
        doc.text(`${c.status}  ·  ${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}`, pw - 16, y + 2, { align: 'right' });
        doc.text(c.status === 'expired' ? 'Expired' : `${days} days remaining`, pw - 16, y + 7, { align: 'right' });
        y += 12;
      });
    } else {
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
      doc.text('No contracts assigned.', 14, y); y += 10;
    }

    // ── Asset Statuses ──
    doc.addPage(); y = 24;
    sectionHead('Asset Statuses');
    const STATUS_RGB = { red: PDF_RED, amber: PDF_AMBER, sage: PDF_GREEN, slate: PDF_MUTED };
    if (window._statusGroups && Object.keys(window._statusGroups).length) {
      Object.values(window._statusGroups).forEach(g => {
        y = checkPageBreak(doc, y, 24);
        const rgb = STATUS_RGB[g.status.color] || PDF_MUTED;
        // Status name badge
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.roundedRect(14, y, pw - 28, 9, 1.5, 1.5, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(255,255,255);
        doc.text(`${g.status.name}  (${g.assets.length} asset${g.assets.length !== 1 ? 's' : ''})`, 18, y + 6.5);
        y += 12;
        // Asset names
        const names = g.assets.map(a => a?.employee_name || a?.name || '—').join('    ');
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
        const nameLines = doc.splitTextToSize(names, pw - 28);
        doc.text(nameLines, 16, y);
        y += nameLines.length * 5 + 8;
      });
    } else {
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
      doc.text('No active statuses.', 14, y); y += 10;
    }

    // ── Visit Section Scores ──
    if (window._dashSectionTotals) {
      doc.addPage(); y = 24;
      sectionHead('Visit Section Scores');
      const gt = window._dashGrandTotals || {};
      const grandTotal = (gt.pass || 0) + (gt.ok || 0) + (gt.fail || 0);
      if (grandTotal > 0) {
        // Overall row
        doc.setFillColor(245,247,250); doc.rect(14, y-2, pw-28, 11, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...PDF_ACCENT);
        doc.text('Overall Total', 16, y + 5);
        doc.setTextColor(...PDF_GREEN); doc.text(`${gt.pass || 0} Pass`, pw-70, y+5);
        doc.setTextColor(...PDF_AMBER); doc.text(`${gt.ok || 0} OK`, pw-48, y+5);
        doc.setTextColor(...PDF_RED);   doc.text(`${gt.fail || 0} Fail`, pw-28, y+5);
        y += 14;
        // Section rows
        Object.entries(window._dashSectionTotals).forEach(([section, t], i) => {
          y = checkPageBreak(doc, y, 12);
          if (i % 2 === 0) { doc.setFillColor(250,250,251); doc.rect(14, y-2, pw-28, 11, 'F'); }
          doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
          doc.text(section, 16, y + 5);
          if (t.total > 0) {
            doc.setTextColor(...PDF_GREEN); doc.text(`${t.pass} Pass`, pw-70, y+5);
            doc.setTextColor(...PDF_AMBER); doc.text(`${t.ok} OK`, pw-48, y+5);
            doc.setTextColor(...PDF_RED);   doc.text(`${t.fail} Fail`, pw-28, y+5);
          } else {
            doc.setTextColor(...PDF_MUTED); doc.text('No data', pw-28, y+5, { align: 'right' });
          }
          y += 12;
        });
      } else {
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
        doc.text('No visit data yet.', 14, y);
      }
    }

    pdfPageNum(doc);
    doc.save(`ArabSpec_Dashboard_${customerName.replace(/\s+/g,'_')}_${now.toISOString().split('T')[0]}.pdf`);
  } catch(err) {
    console.error('PDF error:', err);
    alert('PDF generation failed: ' + err.message);
  }

  btn.innerHTML = orig; btn.disabled = false;
}
