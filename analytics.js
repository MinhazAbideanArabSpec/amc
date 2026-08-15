// analytics.js — customer-facing website analytics (Vercel Web Analytics)

var _analyticsCharts = {};

function destroyAnalyticsCharts() {
  Object.values(_analyticsCharts).forEach(c => c?.destroy());
  _analyticsCharts = {};
}

const ANALYTICS_PALETTE = ['#3B5773', '#5B7D6B', '#D4A017', '#C0392B', '#7C8898', '#8E6FAF', '#2E8B8B', '#B5651D'];

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
          borderColor: '#3B5773', backgroundColor: 'rgba(59,87,115,0.12)',
          fill: true, tension: 0.3, pointRadius: 2,
        },
        {
          label: 'Page Views', data: rows.map(r => r.pageviews),
          borderColor: '#5B7D6B', backgroundColor: 'rgba(91,125,107,0.08)',
          fill: true, tension: 0.3, pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
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
      datasets: [{ label: 'Visitors', data: rows.map(r => r.value), backgroundColor: '#3B5773', borderRadius: 3 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderDoughnutChart(canvasId, rows) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!rows.length) { chartEmptyState(canvasId); return; }

  _analyticsCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{ data: rows.map(r => r.value), backgroundColor: ANALYTICS_PALETTE }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  });
}
