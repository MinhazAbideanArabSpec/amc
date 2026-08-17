// analytics.js — customer-facing website analytics (Vercel Web Analytics)

var _analyticsCharts = {};

function destroyAnalyticsCharts() {
  Object.values(_analyticsCharts).forEach(c => c?.destroy());
  _analyticsCharts = {};
}

// Validated categorical palette (fixed order — never cycled or reassigned
// by value). Run against scripts/validate_palette.js from the dataviz
// skill: passes lightness band, chroma floor, normal-vision floor (16.8,
// well clear of the 15 hard gate), and contrast (all 8 >= 3:1 on white).
// CVD separation sits in the legal 6-8 "floor" band (worst adjacent pair
// gold<->green, 6.7 protan) rather than the 8+ target — legal per the
// skill only with secondary encoding, which the legend on every chart
// that uses more than one of these already provides.
const ANALYTICS_PALETTE = ['#2E5E96', '#B5651D', '#2F8F5B', '#B8860B', '#7B4FA0', '#C0392B', '#0A9494', '#A83E70'];
const ANALYTICS_LINE_COLOR = '#2E5E96';   // Visitors — categorical slot 1
const ANALYTICS_LINE_COLOR_2 = '#2F8F5B'; // Page Views — categorical slot 3, validated pair with slot 1
const CHART_GRID_COLOR = '#E5E1D8';   // --line, one step off the card surface — recessive
const CHART_TICK_COLOR = '#8A8377';   // muted ink, matches .empty-state / label tone elsewhere in the app
const CHART_AXIS_LABEL_COLOR = '#475569'; // --ink-soft

async function loadCustomerAnalyticsTab(customerId) {
  const bodyEl = document.getElementById('analytics-body');
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div class="empty-state">Loading…</div>';
  destroyAnalyticsCharts();

  if (typeof Chart === 'undefined') {
    bodyEl.innerHTML = '<div class="empty-state">Charting library failed to load — check your connection and reload.</div>';
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  let result;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/vercel-analytics?customerId=${encodeURIComponent(customerId)}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not load analytics.');
  } catch (err) {
    bodyEl.innerHTML = `<div class="empty-state">${escapeHtml(err.message || 'Could not load analytics.')}</div>`;
    return;
  }

  bodyEl.innerHTML = '';
  bodyEl.appendChild(document.getElementById('analytics-template').content.cloneNode(true));

  document.getElementById('analytics-visitors').textContent = result.visitors;
  document.getElementById('analytics-pageviews').textContent = result.pageviews;
  document.getElementById('analytics-date-range').textContent = result.sinceDate && result.untilDate
    ? `${fmtDate(result.sinceDate)} – ${fmtDate(result.untilDate)}`
    : '';

  renderTrendChart(result.dailyTrend || []);
  renderBarChart('analytics-chart-pages', (result.topPages || []).map(p => ({ label: p.path || '/', value: p.visitors })));
  renderBarChart('analytics-chart-referrers', (result.topReferrers || []).map(r => ({ label: r.referrer, value: r.visitors })));
  renderBarChart('analytics-chart-countries', (result.topCountries || []).map(c => ({ label: c.country, value: c.visitors })));
  renderDoughnutChart('analytics-chart-devices', (result.devices || []).map(d => ({ label: d.device, value: d.visitors })));
  renderDoughnutChart('analytics-chart-browsers', (result.browsers || []).map(b => ({ label: b.browser, value: b.visitors })));

  const osRows = (result.operatingSystems || []).map(o => ({ label: o.os, value: o.visitors }));
  const osCard = document.getElementById('analytics-os-card');
  if (osRows.length) {
    renderDoughnutChart('analytics-chart-os', osRows);
  } else if (osCard) {
    osCard.style.display = 'none';
  }
}

function chartEmptyState(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.parentElement.innerHTML = '<div class="empty-state" style="padding:60px 20px;">No data for this period.</div>';
}

// Caps a categorical series at the 8 validated slots — a 9th category folds
// into "Other" (summed) rather than reusing a hue or extending the palette.
function foldToEight(rows) {
  if (rows.length <= 8) return rows;
  const kept = rows.slice(0, 7);
  const other = rows.slice(7).reduce((sum, r) => sum + (r.value || 0), 0);
  kept.push({ label: 'Other', value: other });
  return kept;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#1C2127',
  titleColor: '#fff',
  bodyColor: '#E5E7EB',
  padding: 10,
  cornerRadius: 6,
  displayColors: true,
  boxPadding: 4,
};

function renderTrendChart(rows) {
  const canvasId = 'analytics-chart-trend';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!rows.length) { chartEmptyState(canvasId); return; }

  _analyticsCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: rows.map(r => fmtDate(r.date)),
      datasets: [
        {
          label: 'Visitors', data: rows.map(r => r.visitors),
          borderColor: ANALYTICS_LINE_COLOR, backgroundColor: hexToRgba(ANALYTICS_LINE_COLOR, 0.1),
          borderWidth: 2, fill: true, tension: 0.3,
          pointRadius: 4, pointHoverRadius: 5,
          pointBackgroundColor: ANALYTICS_LINE_COLOR, pointBorderColor: '#fff', pointBorderWidth: 2,
        },
        {
          label: 'Page Views', data: rows.map(r => r.pageviews),
          borderColor: ANALYTICS_LINE_COLOR_2, backgroundColor: hexToRgba(ANALYTICS_LINE_COLOR_2, 0.1),
          borderWidth: 2, fill: true, tension: 0.3,
          pointRadius: 4, pointHoverRadius: 5,
          pointBackgroundColor: ANALYTICS_LINE_COLOR_2, pointBorderColor: '#fff', pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', color: CHART_AXIS_LABEL_COLOR, font: { size: 11.5 } } },
        tooltip: TOOLTIP_STYLE,
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: CHART_TICK_COLOR, font: { size: 11 } } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: CHART_TICK_COLOR, font: { size: 11 } },
          grid: { color: CHART_GRID_COLOR, drawTicks: false },
          border: { display: false },
        },
      },
    },
  });
}

function renderBarChart(canvasId, rows) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!rows.length) { chartEmptyState(canvasId); return; }

  _analyticsCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{
        label: 'Visitors', data: rows.map(r => r.value),
        backgroundColor: ANALYTICS_LINE_COLOR,
        borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 },
        borderSkipped: false,
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, color: CHART_TICK_COLOR, font: { size: 11 } },
          grid: { color: CHART_GRID_COLOR, drawTicks: false },
          border: { display: false },
        },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: CHART_AXIS_LABEL_COLOR, font: { size: 11.5 } } },
      },
    },
  });
}

function renderDoughnutChart(canvasId, rowsIn) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const rows = foldToEight(rowsIn);
  if (!rows.length) { chartEmptyState(canvasId); return; }

  _analyticsCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{
        data: rows.map(r => r.value),
        backgroundColor: rows.map((_, i) => ANALYTICS_PALETTE[i]),
        borderColor: '#fff', borderWidth: 2, // surface ring — separates adjacent slices, not a data-weight stroke
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', color: CHART_AXIS_LABEL_COLOR, font: { size: 11.5 } } },
        tooltip: TOOLTIP_STYLE,
      },
    },
  });
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
