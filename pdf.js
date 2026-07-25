// pdf.js — ArabSpec AMC Portal PDF Generation

const PDF_ACCENT = [59, 87, 115];
const PDF_DARK   = [28, 33, 39];
const PDF_MUTED  = [120, 130, 145];
const PDF_LINE   = [220, 222, 226];
const PDF_GREEN  = [39, 174, 96];
const PDF_AMBER  = [212, 160, 23];
const PDF_RED    = [192, 57, 43];
const PDF_BG     = [250, 250, 249];

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

// ─────────────────────────────────────────────────────────────
//  VISIT REPORT PDF
//  Matches the "View Report" modal exactly:
//  - Visit info header (Customer, Visit #, Date, Engineer, Notes)
//  - Per-asset dark header bar with overall result
//  - Each of 7 sections: name | result badge
//  - Note in italic below section if present
//  - Issue tag pills below note
// ─────────────────────────────────────────────────────────────
async function downloadVisitReportPDF(reportId, visitNum, visitDate, engineerName) {
  const btn  = event.target.closest('button');
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
          const tRgb = result === 'fail' ? PDF_RED : PDF_AMBER;
          const tBg  = result === 'fail' ? [253, 237, 236] : [254, 249, 231];
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
//  DASHBOARD PDF
//  Page 1: Contract Overview
//  Page 2: Asset Statuses (with asset names)
//  Page 3: Visit Section Scores
// ─────────────────────────────────────────────────────────────
async function downloadDashboardPDF() {
  const btn  = event.target.closest('button');
  const orig = btn.innerHTML;
  btn.innerHTML = 'Generating…';
  btn.disabled  = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc          = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw           = doc.internal.pageSize.getWidth();
    const customerName = myProfile?.name || 'Customer';
    const now          = new Date();
    const dateStr      = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Shared page header helper
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
      doc.text(`${dateStr}  -  ${toHijri(now, false)}`, 14, 28);
      doc.text(`Generated: ${now.toLocaleString('en-GB')}`, pw - 14, 28, { align: 'right' });
      doc.setDrawColor(...PDF_LINE);
      doc.setLineWidth(0.4);
      doc.line(0, 31, pw, 31);

      // Section title
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

    // ── Page 1: Contract Overview ───────────────────────────
    let y = pageTop('Contract Overview');
    const today = new Date();

    if (window._dashContracts?.length) {
      window._dashContracts.forEach((c, i) => {
        y = pdfCheckBreak(doc, y, 16);
        const days = Math.max(0, Math.round((new Date(c.end_date) - today) / 86400000));

        if (i % 2 === 0) { doc.setFillColor(247, 248, 250); doc.rect(14, y - 3, pw - 28, 13, 'F'); }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...PDF_DARK);
        doc.text(c.contract_number, 16, y + 4);

        const statusRgb = c.status === 'active' ? PDF_GREEN : c.status === 'expired' ? PDF_RED : PDF_AMBER;
        doc.setFillColor(...statusRgb);
        doc.rect(16 + doc.getStringUnitWidth(c.contract_number) * 9.5 / doc.internal.scaleFactor + 4, y - 1, 20, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(c.status.toUpperCase(), 16 + doc.getStringUnitWidth(c.contract_number) * 9.5 / doc.internal.scaleFactor + 4 + 10, y + 3.5, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...PDF_MUTED);
        doc.text(`${pdfFmtDate(c.start_date)}  ->  ${pdfFmtDate(c.end_date)}`, 16, y + 10);
        doc.text(c.status === 'expired' ? 'Expired' : `${days} days remaining`, pw - 16, y + 10, { align: 'right' });

        y += 16;
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_MUTED);
      doc.text('No contracts assigned.', 14, y);
    }

    // ── Page 3: Visit Section Scores with Tags ──────────────
    doc.addPage();
    y = pageTop('Visit Section Scores');

    const gt = window._dashGrandTotals || {};
    const grandTotal = (gt.pass || 0) + (gt.ok || 0) + (gt.fail || 0);

    // Fetch all latest VRA tags for this customer to group by section
    let sectionTagMap = {}; // { sectionName: [tagLabel, ...] }
    try {
      const { data: allAssets } = await sb.from('assets').select('id').eq('customer_id', myProfile.id);
      if (allAssets?.length) {
        const { data: vras } = await sb.from('visit_report_assets')
          .select('id, asset_id').in('asset_id', allAssets.map(a => a.id))
          .order('created_at', { ascending: false });
        const latestVraMap = {};
        (vras || []).forEach(v => { if (!latestVraMap[v.asset_id]) latestVraMap[v.asset_id] = v; });
        const vraIds = Object.values(latestVraMap).map(v => v.id);
        if (vraIds.length) {
          const { data: vitags } = await sb.from('visit_issue_tags')
            .select('visit_report_asset_id, issue_tag_definitions(label, section)')
            .in('visit_report_asset_id', vraIds);
          (vitags || []).forEach(vt => {
            const sec = vt.issue_tag_definitions?.section;
            const lbl = vt.issue_tag_definitions?.label;
            if (!sec || !lbl) return;
            if (!sectionTagMap[sec]) sectionTagMap[sec] = [];
            if (!sectionTagMap[sec].includes(lbl)) sectionTagMap[sec].push(lbl);
          });
        }
      }
    } catch(e) { /* tags optional */ }

    if (grandTotal > 0 && window._dashSectionTotals) {
      // Overall row
      doc.setFillColor(236, 240, 245);
      doc.rect(14, y - 3, pw - 28, 12, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_ACCENT);
      doc.text('Overall Total', 16, y + 5);
      doc.setTextColor(...PDF_GREEN);  doc.text(`${gt.pass || 0} Pass`,  pw - 80, y + 5);
      doc.setTextColor(...PDF_AMBER);  doc.text(`${gt.ok || 0} OK`,      pw - 54, y + 5);
      doc.setTextColor(...PDF_RED);    doc.text(`${gt.fail || 0} Fail`,  pw - 30, y + 5);
      y += 14;

      // Section rows
      Object.entries(window._dashSectionTotals).forEach(([section, s], i) => {
        const sTags   = sectionTagMap[section] || [];
        const sResult = s.fail > 0 ? 'fail' : s.ok > 0 ? 'ok' : s.total > 0 ? 'pass' : null;
        const tRgb    = sResult === 'fail' ? PDF_RED : PDF_AMBER;
        const tBg     = sResult === 'fail' ? [253, 237, 236] : [254, 249, 231];

        // Row height: base 11 + tags if any
        let rh = 11;
        if (sTags.length) rh += Math.ceil(sTags.length / 3) * 7 + 4;

        y = pdfCheckBreak(doc, y, rh + 2);
        if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(14, y - 2, pw - 28, rh, 'F'); }

        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
        doc.text(section, 16, y + 5);

        if (sResult) pdfResultBadge(doc, sResult, pw - 14 - 22, y + 1);

        if (s.total > 0) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
          doc.setTextColor(...PDF_GREEN);  doc.text(`${s.pass}P`, pw - 80, y + 5);
          doc.setTextColor(...PDF_AMBER);  doc.text(`${s.ok}OK`,  pw - 62, y + 5);
          doc.setTextColor(...PDF_RED);    doc.text(`${s.fail}F`, pw - 48, y + 5);
        }

        // Issue tags under the section row
        if (sTags.length) {
          let tx = 18;
          let ty = y + 12;
          sTags.forEach(lbl => {
            const tw = doc.getStringUnitWidth(lbl) * (7.5 / doc.internal.scaleFactor) + 8;
            if (tx + tw > pw - 16) { tx = 18; ty += 7; }
            doc.setFillColor(...tBg);
            doc.setDrawColor(...tRgb);
            doc.setLineWidth(0.3);
            doc.rect(tx, ty - 4, tw, 6, 'FD');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...tRgb);
            doc.text(lbl, tx + 4, ty + 0.5);
            tx += tw + 4;
          });
        }

        y += rh;
        doc.setDrawColor(...PDF_LINE);
        doc.setLineWidth(0.2);
        doc.line(14, y, pw - 14, y);
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_MUTED);
      doc.text('No visit report data yet.', 14, y);
    }

    pdfFooters(doc);
    doc.save(`ArabSpecIT_${now.toISOString().split('T')[0]}.pdf`);

  } catch (err) {
    console.error('Dashboard PDF error:', err);
    alert('PDF generation failed: ' + err.message);
  }

  btn.innerHTML = orig;
  btn.disabled  = false;
}
