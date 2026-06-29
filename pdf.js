// pdf.js — dashboard and visit report PDF generation
  // ══════════════════════════════════════════════════════════
  //  PDF GENERATION
  // ══════════════════════════════════════════════════════════
  const PDF_ACCENT  = [59, 87, 115];   // #3B5773
  const PDF_DARK    = [28, 33, 39];    // #1C2127
  const PDF_MUTED   = [100, 116, 139]; // muted text
  const PDF_LINE    = [229, 225, 216]; // #E5E1D8
  const PDF_GREEN   = [91, 125, 107];  // sage/pass
  const PDF_AMBER   = [146, 102, 15];  // amber/ok
  const PDF_RED     = [192, 57, 43];   // crimson/fail
  const PDF_BG      = [250, 250, 249]; // paper

  function pdfHeader(doc, customerName, subtitle) {
    const pw = doc.internal.pageSize.getWidth();
    // Top bar
    doc.setFillColor(...PDF_ACCENT);
    doc.rect(0, 0, pw, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('ArabSpec AMC Portal', 14, 11.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(subtitle || 'Service & Contract Management', pw - 14, 11.5, { align: 'right' });

    // Customer name block
    doc.setFillColor(...PDF_BG);
    doc.rect(0, 18, pw, 22, 'F');
    doc.setTextColor(...PDF_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(customerName, 14, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_MUTED);
    const now = new Date();
    const gregDate = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const hijri = toHijri(now, false);
    doc.text(`${gregDate}  ·  ${hijri}`, 14, 37);
    doc.text(`Generated: ${now.toLocaleString('en-GB')}`, pw - 14, 37, { align: 'right' });

    return 48; // y position after header
  }

  function pdfSectionTitle(doc, title, y) {
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(...PDF_ACCENT);
    doc.rect(14, y, 3, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_ACCENT);
    doc.text(title, 20, y + 5.5);
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.3);
    doc.line(14, y + 8, pw - 14, y + 8);
    return y + 14;
  }

  function pdfTableRow(doc, cols, y, widths, isHeader = false, shade = false) {
    const pw = doc.internal.pageSize.getWidth();
    const rowH = 8;
    if (shade) { doc.setFillColor(245, 245, 247); doc.rect(14, y, pw - 28, rowH, 'F'); }
    if (isHeader) { doc.setFillColor(...PDF_ACCENT); doc.rect(14, y, pw - 28, rowH, 'F'); }
    doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(isHeader ? 255 : PDF_DARK[0], isHeader ? 255 : PDF_DARK[1], isHeader ? 255 : PDF_DARK[2]);
    let x = 14;
    cols.forEach((col, i) => {
      const w = widths[i];
      doc.text(String(col ?? '—'), x + 2, y + 5.5, { maxWidth: w - 4 });
      x += w;
    });
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.2);
    doc.line(14, y + rowH, pw - 14, y + rowH);
    return y + rowH;
  }

  function pdfPageNum(doc) {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...PDF_MUTED);
      doc.text(`Page ${i} of ${total}`, pw - 14, ph - 8, { align: 'right' });
      doc.text('ArabSpec IT — Confidential', 14, ph - 8);
    }
  }

  function checkPageBreak(doc, y, needed = 20) {
    const ph = doc.internal.pageSize.getHeight();
    if (y + needed > ph - 20) { doc.addPage(); return 24; }
    return y;
  }

  // ── PDF 1: Full Dashboard Report ─────────────────────────
  async function downloadDashboardPDF() {
    const btn = event.target.closest('button');
    const orig = btn.innerHTML;
    btn.innerHTML = 'Generating…'; btn.disabled = true;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();

    const customerName = myProfile?.name || 'Customer';
    let y = pdfHeader(doc, customerName, 'Full Dashboard Report');

    // ── 1. Contract Overview ──
    y = pdfSectionTitle(doc, 'Contract Overview', y);
    if (window._dashContracts?.length) {
      const today = new Date();
      y = pdfTableRow(doc, ['Contract #', 'Status', 'Start Date', 'End Date', 'Days Remaining'], y, [50, 30, 35, 35, 36], true);
      window._dashContracts.forEach((c, i) => {
        y = checkPageBreak(doc, y);
        const days = Math.max(0, Math.round((new Date(c.end_date) - today) / 86400000));
        y = pdfTableRow(doc, [c.contract_number, c.status, fmtDate(c.start_date), fmtDate(c.end_date), c.status === 'expired' ? 'Expired' : `${days} days`], y, [50, 30, 35, 35, 36], false, i % 2 === 1);
      });
    } else { doc.setFontSize(8); doc.setTextColor(...PDF_MUTED); doc.text('No contracts assigned.', 14, y); y += 8; }

    // ── 2. Asset Statuses — bar chart + asset names ──
    doc.addPage(); y = 24;
    y = pdfSectionTitle(doc, 'Asset Statuses', y);
    if (window._statusGroups && Object.keys(window._statusGroups).length) {
      const STATUS_COLOR_MAP_S = {
        red: PDF_RED, amber: PDF_AMBER, blue: [30, 95, 142], purple: [91, 33, 182],
        teal: [14, 165, 160], slate: PDF_MUTED, green: [26, 107, 58],
        orange: [194, 81, 14], pink: [157, 44, 110], brown: [107, 58, 42],
        navy: [28, 47, 94], lime: [74, 122, 30]
      };
      const statusEntries = Object.values(window._statusGroups);
      const maxSCount = Math.max(...statusEntries.map(g => g.assets.length));
      const BAR_MAX_W_S = pw - 84; const BAR_H_S = 7; const LABEL_W_S = 54;

      statusEntries.forEach(g => {
        const count = g.assets.length;
        const rgb = STATUS_COLOR_MAP_S[g.status.color] || PDF_MUTED;
        const barW = maxSCount > 0 ? (count / maxSCount) * BAR_MAX_W_S : 0;
        y = checkPageBreak(doc, y, 28);

        // Status name
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_DARK);
        doc.text(g.status.name.length > 24 ? g.status.name.substring(0, 24) + '…' : g.status.name, 14, y + BAR_H_S - 0.5);

        // Bar track + fill
        doc.setFillColor(235, 235, 235);
        doc.roundedRect(14 + LABEL_W_S, y, BAR_MAX_W_S, BAR_H_S, 1.5, 1.5, 'F');
        if (barW > 0) { doc.setFillColor(...rgb); doc.roundedRect(14 + LABEL_W_S, y, barW, BAR_H_S, 1.5, 1.5, 'F'); }

        // Count
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...rgb);
        doc.text(String(count), pw - 10, y + BAR_H_S - 0.5, { align: 'right' });
        // Asset names — rendered as individual name pills per row
        y += BAR_H_S + 4;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_DARK);
        const assetNames = g.assets.map(a => a?.employee_name || a?.name || '—');
        const nameStr = assetNames.join('    ');
        const nameLines = doc.splitTextToSize(nameStr, pw - 28);
        doc.text(nameLines, 14 + LABEL_W_S, y);
        y += nameLines.length * 5.5 + 8;
      });
    } else { doc.setFontSize(8); doc.setTextColor(...PDF_MUTED); doc.text('No active statuses.', 14, y); y += 8; }

    y += 6;

    // ── 3. Asset Status Cards Grid ──
    doc.addPage(); y = 24;
    y = pdfSectionTitle(doc, 'Asset Status Overview', y);

    if (customerAssetsCache?.length && window._statusGroups) {
      const STATUS_COLOR_MAP_G = {
        red: PDF_RED, amber: PDF_AMBER, blue: [30, 95, 142], purple: [91, 33, 182],
        teal: [14, 165, 160], slate: PDF_MUTED, green: [26, 107, 58],
        orange: [194, 81, 14], pink: [157, 44, 110], brown: [107, 58, 42],
        navy: [28, 47, 94], lime: [74, 122, 30]
      };

      // Build assetId → [status] map from _statusGroups
      const assetStatusMap = {};
      Object.values(window._statusGroups).forEach(g => {
        g.assets.forEach(a => {
          const id = a?.id || (a?.employee_name + a?.name);
          if (!assetStatusMap[id]) assetStatusMap[id] = [];
          assetStatusMap[id].push({ name: g.status.name, color: g.status.color });
        });
      });

      // Also map by employee_name+name for matching (since we don't have id in _statusGroups assets)
      const assetStatusByKey = {};
      Object.values(window._statusGroups).forEach(g => {
        g.assets.forEach(a => {
          const key = (a?.employee_name || '') + '|' + (a?.name || '');
          if (!assetStatusByKey[key]) assetStatusByKey[key] = [];
          assetStatusByKey[key].push({ name: g.status.name, color: g.status.color, notes: a.notes || '' });
        });
      });

      const CARD_W = (pw - 28 - 8) / 3; // 3 cards per row with 4mm gap
      const CARD_GAP = 4;
      const CARD_X_OFFSETS = [14, 14 + CARD_W + CARD_GAP, 14 + (CARD_W + CARD_GAP) * 2];

      let col = 0;
      let rowStartY = y;
      let maxCardH = 0;

      customerAssetsCache.forEach((a, i) => {
        const key = (a.employee_name || '') + '|' + (a.name || '');
        const statuses = assetStatusByKey[key] || [];
        // Card height: header (16) + divider (3) + each status row (6) + note lines per status + padding (8)
        const noteLines = statuses.reduce((acc, s) => acc + (s.notes ? Math.ceil(s.notes.length / 38) : 0), 0);
        const cardH = 19 + (statuses.length || 1) * 6 + noteLines * 4.5 + 6;

        if (col === 0) {
          y = checkPageBreak(doc, y, cardH + 4);
          rowStartY = y;
          maxCardH = 0;
        }

        const cx = CARD_X_OFFSETS[col];
        maxCardH = Math.max(maxCardH, cardH);

        // Card border — darker
        doc.setDrawColor(180, 185, 195);
        doc.setLineWidth(0.5);
        doc.roundedRect(cx, rowStartY, CARD_W, cardH, 2, 2, 'S');

        // Left accent bar matching first status color
        const firstRgb = statuses.length ? (STATUS_COLOR_MAP_G[statuses[0].color] || PDF_MUTED) : PDF_MUTED;
        doc.setFillColor(...firstRgb);
        doc.rect(cx, rowStartY, 2.5, cardH, 'F');

        // Employee name
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_DARK);
        doc.text(a.employee_name || a.name || '—', cx + 6, rowStartY + 7);

        // Asset name · category
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_MUTED);
        doc.text(`${a.name}  ·  ${a.category}`, cx + 6, rowStartY + 13);

        // Divider
        doc.setDrawColor(210, 213, 220);
        doc.setLineWidth(0.3);
        doc.line(cx + 6, rowStartY + 16, cx + CARD_W - 3, rowStartY + 16);

        // Status list with icon badges + notes
        if (!statuses.length) {
          // Grey dot for no status
          doc.setFillColor(...PDF_MUTED);
          doc.circle(cx + 8, rowStartY + 21, 1.5, 'F');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_MUTED);
          doc.text('No Active Status', cx + 12, rowStartY + 22);
        } else {
          let sy = rowStartY + 21;
          statuses.forEach(s => {
            const rgb = STATUS_COLOR_MAP_G[s.color] || PDF_MUTED;
            // Colored circle icon badge
            doc.setFillColor(...rgb);
            doc.circle(cx + 8, sy, 1.8, 'F');
            // Status name
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...rgb);
            doc.text(s.name, cx + 12, sy + 1);
            sy += 5.5;
            // Note below status if present
            if (s.notes) {
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_MUTED);
              const noteWrapped = doc.splitTextToSize(s.notes, CARD_W - 14);
              doc.text(noteWrapped, cx + 12, sy);
              sy += noteWrapped.length * 4.5;
            }
          });
        }

        col++;
        if (col === 3) {
          col = 0;
          y = rowStartY + maxCardH + CARD_GAP;
        }
      });

      // Flush last partial row
      if (col > 0) y = rowStartY + maxCardH + CARD_GAP;
    } else {
      doc.setFontSize(8); doc.setTextColor(...PDF_MUTED); doc.text('No asset data.', 14, y); y += 8;
    }

    y += 6;

    // ── 4. Visit Section Scores ──
    doc.addPage(); y = 24;
    y = pdfSectionTitle(doc, 'Visit Section Scores', y);
    if (window._dashSectionTotals) {
      y = pdfTableRow(doc, ['Section', 'Pass', 'OK', 'Fail', 'Total'], y, [80, 22, 22, 22, 20], true);
      const gt = window._dashGrandTotals || {};
      y = pdfTableRow(doc, ['Overall Total', gt.pass || 0, gt.ok || 0, gt.fail || 0, (gt.pass || 0) + (gt.ok || 0) + (gt.fail || 0)], y, [80, 22, 22, 22, 20], false, false);
      Object.entries(window._dashSectionTotals).forEach(([section, t], i) => {
        y = checkPageBreak(doc, y);
        y = pdfTableRow(doc, [section, t.pass, t.ok, t.fail, t.total], y, [80, 22, 22, 22, 20], false, i % 2 === 1);
      });
    } else { doc.setFontSize(8); doc.setTextColor(...PDF_MUTED); doc.text('No visit data.', 14, y); y += 8; }

    // ── 6. Asset Visit Scores ──
    doc.addPage(); y = 24;
    y = pdfSectionTitle(doc, 'Asset Visit Scores', y);
    if (window._dashAssetResults?.length) {
      y = pdfTableRow(doc, ['Employee', 'Asset', 'Last Visit', 'Pass', 'OK', 'Fail'], y, [34, 42, 34, 18, 18, 18], true);
      window._dashAssetResults.forEach(({ asset: a, vra, checks }, i) => {
        y = checkPageBreak(doc, y);
        const pass = checks.filter(c => c.result === 'pass').length;
        const ok   = checks.filter(c => c.result === 'ok').length;
        const fail = checks.filter(c => c.result === 'fail').length;
        const visitDate = vra?.visit_reports?.visit_date ? fmtDate(vra.visit_reports.visit_date) : '—';
        y = pdfTableRow(doc, [a.employee_name || a.name, a.name, visitDate, pass, ok, fail], y, [34, 42, 34, 18, 18, 18], false, i % 2 === 1);
      });
    } else { doc.setFontSize(8); doc.setTextColor(...PDF_MUTED); doc.text('No visit scores.', 14, y); y += 8; }

    pdfPageNum(doc);
    doc.save(`ArabSpec_Dashboard_${customerName.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);

    btn.innerHTML = orig; btn.disabled = false;
  }

  // ── PDF 2: Individual Visit Report ───────────────────────
  async function downloadVisitReportPDF(reportId, visitNum, visitDate, engineerName) {
    const btn = event.target.closest('button');
    const orig = btn.innerHTML;
    btn.innerHTML = 'Generating…'; btn.disabled = true;

    // Fetch full report data
    const { data: vras } = await sb.from('visit_report_assets')
      .select('*, assets(name, employee_name, category), visit_report_checks(*)')
      .eq('visit_report_id', reportId);

    const { data: report } = await sb.from('visit_reports').select('overall_notes').eq('id', reportId).single();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const customerName = myProfile?.name || 'Customer';

    let y = pdfHeader(doc, customerName, `Visit Report — ${visitNum}`);

    // Report header info
    y = pdfSectionTitle(doc, 'Visit Information', y);
    const infoRows = [
      ['Visit Number', visitNum],
      ['Visit Date', visitDate],
      ['Engineer', engineerName],
      ['Overall Notes', report?.overall_notes || '—'],
    ];
    infoRows.forEach(([label, val]) => {
      y = checkPageBreak(doc, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED);
      doc.text(label, 14, y + 5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_DARK);
      doc.text(String(val), 60, y + 5);
      y += 7;
    });

    y += 4;

    // Per-asset summary
    doc.addPage(); y = 24;
    y = pdfSectionTitle(doc, 'Asset Summaries', y);

    (vras || []).forEach(vra => {
      const asset = vra.assets;
      const checks = vra.visit_report_checks || [];

      y = checkPageBreak(doc, y, 40);

      // Asset header row
      doc.setFillColor(240, 242, 245);
      doc.rect(14, y, pw - 28, 9, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_DARK);
      doc.text(`${asset?.employee_name || asset?.name || '—'}  ·  ${asset?.name || ''}  ·  ${asset?.category || ''}`, 16, y + 6);
      const overall = vra.overall_status;
      const overallColor = overall === 'pass' ? PDF_GREEN : overall === 'ok' ? PDF_AMBER : overall === 'fail' ? PDF_RED : PDF_MUTED;
      doc.setTextColor(...overallColor);
      doc.text((overall || '—').toUpperCase(), pw - 16, y + 6, { align: 'right' });
      y += 10;

      // Section scores table
      y = pdfTableRow(doc, ['Section', 'Pass', 'OK', 'Fail'], y, [100, 22, 22, 22], true);

      CHECKLIST.forEach((s, i) => {
        const sChecks = checks.filter(c => c.section === s.section);
        const pass = sChecks.filter(c => c.result === 'pass').length;
        const ok   = sChecks.filter(c => c.result === 'ok').length;
        const fail = sChecks.filter(c => c.result === 'fail').length;
        y = checkPageBreak(doc, y);
        y = pdfTableRow(doc, [s.section, pass, ok, fail], y, [100, 22, 22, 22], false, i % 2 === 1);
      });

      y += 6;
    });

    pdfPageNum(doc);
    doc.save(`ArabSpec_VisitReport_${visitNum.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);

    btn.innerHTML = orig; btn.disabled = false;
  }
