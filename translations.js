// translations.js — Hijri date + i18n system (EN/AR)

// ── Hijri date fallback ──────────────────────────────────────
function toHijri(date, arabic) {
  const HIJRI_MONTHS_EN = ['Muharram','Safar','Rabi\' al-Awwal','Rabi\' al-Thani',
    'Jumada al-Awwal','Jumada al-Thani','Rajab','Sha\'ban','Ramadan','Shawwal',
    'Dhu al-Qi\'dah','Dhu al-Hijjah'];
  const HIJRI_MONTHS_AR = ['محرم','صفر','ربيع الأول','ربيع الآخر',
    'جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال',
    'ذو القعدة','ذو الحجة'];
  const Y = date.getFullYear(), M = date.getMonth() + 1, D = date.getDate();
  const JD = Math.floor((1461*(Y+4800+Math.floor((M-14)/12)))/4)
    + Math.floor((367*(M-2-12*Math.floor((M-14)/12)))/12)
    - Math.floor((3*Math.floor((Y+4900+Math.floor((M-14)/12))/100))/4)
    + D - 32075;
  let l = JD - 1948440 + 10632;
  const n = Math.floor((l-1)/10631);
  l = l - 10631*n + 354;
  const j = Math.floor((10985-l)/5316)*Math.floor((50*l)/17719)
    + Math.floor(l/5670)*Math.floor((43*l)/15238);
  l = l - Math.floor((30-j)/15)*Math.floor((17719*j)/50)
    - Math.floor(j/16)*Math.floor((15238*j)/43) + 29;
  const hMonth = Math.floor((24*l)/709);
  const hDay = l - Math.floor((709*hMonth)/24);
  const hYear = 30*n + j - 29;
  const months = arabic ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  return arabic
    ? `${hDay} ${months[hMonth-1]} ${hYear} هـ`
    : `${hDay} ${months[hMonth-1]} ${hYear} AH`;
}

// ═══════════════════════════════════════════════════════
//  TRANSLATIONS
// ═══════════════════════════════════════════════════════
var currentLang = 'en';

var TRANSLATIONS = {
  en: {
    // Tabs
    tab_overview: 'Dashboard', tab_profile: 'My Profile',
    tab_contracts: 'My Contracts', tab_assets: 'Assets',
    tab_dc: 'Data Center', tab_contract: 'Contract',
    tab_reports: 'Visit Reports', tab_subs: 'Subscriptions', tab_renewals: 'Renewals', card_issue_tags: 'Issue Tags',
    btn_view_all: 'View All',
    // Stat cards
    stat_days_remaining: 'Contract Days Remaining',
    stat_total_assets: 'Total Assets',
    stat_visits_completed: 'Visits Completed',
    stat_notifications: 'Notifications',
    stat_registered: 'Registered',
    stat_assigned: 'Assigned',
    stat_completed: 'Completed',
    // Card headings
    card_contract_overview: 'Contract Overview',
    card_asset_statuses: 'Asset Status',
    card_asset_health: 'Asset Health',
    card_visit_section_scores: 'Visit Section Scores',
    card_asset_visit_scores: 'Asset Visit Scores',
    card_my_profile: 'My Profile',
    card_my_contracts: 'My Contracts',
    card_asset_health_breakdown: 'Asset Health Breakdown',
    card_my_assets: 'My Assets',
    card_visit_reports: 'Visit Reports',
    card_visit_dates: 'Visit Dates',
    visit_last: 'Last Visit',
    visit_next: 'Next Scheduled',
    // Hero
    hero_sub: 'ArabSpec AMC Portal — Service & Contract Management',
    // Status labels
    status_critical: 'Critical', status_warning: 'Warning', status_pass: 'Pass',
    no_active_status: 'No Active Status',
    // Asset groups
    group_end_user: 'End User Devices',
    group_data_center: 'Data Center Devices',
    // Visit scores
    result_pass: 'Pass', result_ok: 'OK', result_fail: 'Fail',
    no_visit_yet: 'No visit yet',
    overall_total: 'Overall Total',
    // Contract
    contract_active: 'active', contract_expired: 'expired',
    contract_days_remaining: 'days remaining',
    contract_days_left: 'days left',
    btn_view_contract: 'View full contract →',
    // Visit dates
    visit_no_visits: 'No visits yet',
    visit_not_scheduled: 'Not scheduled',
    visit_overdue: '(overdue)',
    visit_today: '(today)',
    visit_in_days: 'in {n} days',
    // Notifications
    notif_tap: 'Tap to view',
    notif_all_clear: 'All clear',
    notif_critical: '{n} Critical Asset',
    notif_criticals: '{n} Critical Assets',
    // Subscriptions
    sub_active: 'Active',
    sub_expiring: 'Expiring in {n}d',
    sub_expired: 'Expired',
    sub_no_subs: 'No subscriptions found.',
    // Status tiles
    click_to_view: 'Click to view assets →',
    // Empty states
    loading: 'Loading…',
    no_assets: 'No assets registered yet.',
    no_contracts: 'No contracts assigned yet.',
    no_reports: 'No visit reports yet.',
    no_statuses: 'No active statuses assigned to your assets.',
    no_visit_data: 'No visit report data yet.',
    no_issue_tags: 'No issue tags recorded yet.',
    // Buttons
    btn_view_report: 'View Report',
    btn_click_assets: 'Click to view assets →',
    btn_close: 'Close',
    btn_download_report: 'Download Report',
    // Signout
    signout: 'Sign out',
    // Section names (for visit checklist)
    sec_system_health: 'System Health Check',
    sec_performance: 'Performance Optimization',
    sec_security: 'Security Check',
    sec_backup: 'Backup Verification',
    sec_network: 'Network Check',
    sec_hardware: 'Hardware Inspection',
    sec_compliance: 'Compliance Check',
  },
  ar: {
    // Tabs
    tab_overview: 'لوحة التحكم', tab_profile: 'ملفي الشخصي',
    tab_contracts: 'عقودي', tab_assets: 'الأصول',
    tab_dc: 'مركز البيانات', tab_contract: 'العقد',
    tab_reports: 'تقارير الزيارات', tab_subs: 'الاشتراكات', tab_renewals: 'التجديدات', card_issue_tags: 'ملخص الأصول',
    btn_view_all: 'عرض الكل',
    // Stat cards
    stat_days_remaining: 'أيام العقد المتبقية',
    stat_total_assets: 'إجمالي الأصول',
    stat_visits_completed: 'الزيارات المكتملة',
    stat_notifications: 'الإشعارات',
    stat_registered: 'مسجّلة',
    stat_assigned: 'مُعيَّنة',
    stat_completed: 'مكتملة',
    // Card headings
    card_contract_overview: 'نظرة على العقد',
    card_asset_statuses: 'حالة الأصول',
    card_asset_health: 'صحة الأصول',
    card_visit_section_scores: 'نتائج أقسام الزيارة',
    card_asset_visit_scores: 'نتائج الأصول في الزيارة',
    card_my_profile: 'ملفي الشخصي',
    card_my_contracts: 'عقودي',
    card_asset_health_breakdown: 'تفصيل صحة الأصول',
    card_my_assets: 'أصولي',
    card_visit_reports: 'تقارير الزيارات',
    card_visit_dates: 'تواريخ الزيارات',
    visit_last: 'آخر زيارة',
    visit_next: 'الزيارة القادمة',
    // Hero
    hero_sub: 'بوابة ArabSpec للصيانة — إدارة الخدمات والعقود',
    // Status labels
    status_critical: 'حرج', status_warning: 'تحذير', status_pass: 'ناجح',
    no_active_status: 'لا توجد حالة نشطة',
    // Asset groups
    group_end_user: 'أجهزة المستخدمين',
    group_data_center: 'أجهزة مركز البيانات',
    // Visit scores
    result_pass: 'ناجح', result_ok: 'مقبول', result_fail: 'فاشل',
    no_visit_yet: 'لا توجد زيارة بعد',
    overall_total: 'المجموع الكلي',
    // Contract
    contract_active: 'نشط', contract_expired: 'منتهي',
    contract_days_remaining: 'يوم متبقٍ',
    contract_days_left: 'يوم متبقٍ',
    btn_view_contract: 'عرض العقد كاملاً ←',
    // Visit dates
    visit_no_visits: 'لا توجد زيارات بعد',
    visit_not_scheduled: 'غير مجدولة',
    visit_overdue: '(متأخرة)',
    visit_today: '(اليوم)',
    visit_in_days: 'خلال {n} أيام',
    // Notifications
    notif_tap: 'اضغط للعرض',
    notif_all_clear: 'كل شيء سليم',
    notif_critical: '{n} أصل حرج',
    notif_criticals: '{n} أصول حرجة',
    // Subscriptions
    sub_active: 'نشط',
    sub_expiring: 'تنتهي خلال {n} يوم',
    sub_expired: 'منتهي',
    sub_no_subs: 'لا توجد اشتراكات.',
    // Status tiles
    click_to_view: 'اضغط لعرض الأصول ←',
    // Empty states
    loading: 'جارٍ التحميل…',
    no_assets: 'لا توجد أصول مسجّلة بعد.',
    no_contracts: 'لم يتم تعيين عقود بعد.',
    no_reports: 'لا توجد تقارير زيارات بعد.',
    no_statuses: 'لا توجد حالات نشطة مُعيَّنة لأصولك.',
    no_visit_data: 'لا توجد بيانات تقرير زيارة بعد.',
    no_issue_tags: 'لا توجد تسميات مشكلات مسجّلة بعد.',
    // Buttons
    btn_view_report: 'عرض التقرير',
    btn_click_assets: 'اضغط لعرض الأصول ←',
    btn_close: 'إغلاق',
    btn_download_report: 'تحميل التقرير',
    // Signout
    signout: 'تسجيل الخروج',
    // Section names
    sec_system_health: 'فحص صحة النظام',
    sec_performance: 'تحسين الأداء',
    sec_security: 'فحص الأمان',
    sec_backup: 'التحقق من النسخ الاحتياطية',
    sec_network: 'فحص الشبكة',
    sec_hardware: 'فحص الأجهزة',
    sec_compliance: 'فحص الامتثال',
  }
};

function t(key) {
  return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en[key] || key;
}

// Section name → translation key map
var SECTION_KEYS = {
  'System Health Check':      'sec_system_health',
  'Performance Optimization': 'sec_performance',
  'Security Check':           'sec_security',
  'Backup Verification':      'sec_backup',
  'Network Check':            'sec_network',
  'Hardware Inspection':      'sec_hardware',
  'Compliance Check':         'sec_compliance',
};

function tSection(name) {
  const key = SECTION_KEYS[name];
  return key ? t(key) : name;
}

function applyTranslations() {
  const isAr = currentLang === 'ar';
  const custView = document.getElementById('customer-view');

  // RTL
  if (custView) {
    custView.classList.toggle('rtl', isAr);
    custView.style.direction = isAr ? 'rtl' : 'ltr';
  }

  // data-t elements
  const scope = custView || document;
  scope.querySelectorAll('[data-t]').forEach(el => {
    el.textContent = t(el.dataset.t);
  });

  // Hero sub
  const heroSub = document.getElementById('dash-hero-sub');
  if (heroSub) heroSub.textContent = t('hero_sub');

  // Sign out
  const signout = document.getElementById('signout-link');
  if (signout) signout.textContent = t('signout');

  // Date
  const dateEl = document.getElementById('dash-hero-date');
  if (dateEl) {
    const now = new Date();
    const locale = isAr ? 'ar-SA' : 'en-GB';
    const gregStr = now.toLocaleDateString(locale, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    let hijriStr = '';
    try {
      hijriStr = now.toLocaleDateString(isAr ? 'ar-SA-u-ca-islamic' : 'en-u-ca-islamic', {
        year:'numeric', month:'long', day:'numeric', calendar:'islamic'
      });
    } catch(e) { hijriStr = toHijri(now, isAr); }
    dateEl.innerHTML = `<span>📅</span>
      <span style="opacity:0.95;font-weight:600;">${hijriStr}</span>
      <span style="opacity:0.35;">·</span>
      <span style="opacity:0.65;">${gregStr}</span>`;
  }

  // Language toggle
  document.getElementById('lang-btn-en')?.classList.toggle('active', !isAr);
  document.getElementById('lang-btn-ar')?.classList.toggle('active', isAr);

  // Download Report button
  const dlBtn = scope.querySelector('[onclick="downloadDashboardPDF()"]');
  if (dlBtn) dlBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3"/></svg> ${t('btn_download_report')}`;

  // Re-render dynamic sections if profile loaded
  if (myProfile?.id) {
    // Asset group section headers
    const euHeader = scope.querySelector('[data-group-label="end_user"]');
    const dcHeader = scope.querySelector('[data-group-label="data_center"]');
    if (euHeader) euHeader.textContent = t('group_end_user');
    if (dcHeader) dcHeader.textContent = t('group_data_center');

    // Re-render notification sub-label
    const notifSub = document.getElementById('istat-notif-sub');
    const notifCount = parseInt(document.getElementById('istat-notif-count')?.textContent) || 0;
    if (notifSub) {
      if (notifCount > 0) {
        notifSub.textContent = (notifCount === 1 ? t('notif_critical') : t('notif_criticals')).replace('{n}', notifCount);
      } else {
        notifSub.textContent = t('notif_all_clear');
      }
    }

    // Re-render visit dates
    if (typeof loadVisitDates === 'function') loadVisitDates(getCustomerId(), myProfile.next_visit_date);
    // Re-render customer statuses
    if (typeof loadCustomerStatuses === 'function') loadCustomerStatuses(getCustomerId());
    // Re-render customer assets
    if (typeof loadCustomerAssets === 'function') loadCustomerAssets(getCustomerId());
    // Re-render subscriptions dashboard tile
    if (typeof loadCustomerSubscriptions === 'function') loadCustomerSubscriptions(getCustomerId());
    if (typeof loadDashIssueTags === 'function') loadDashIssueTags(getCustomerId());
    if (typeof loadCustomerIssueTags === 'function') loadCustomerIssueTags(getCustomerId());
  }
}

async function setLanguage(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  applyTranslations();
  const { data: { user } } = await sb.auth.getUser();
  if (user) await sb.from('profiles').update({ language: lang }).eq('id', user.id);
}

function initLanguage(lang) {
  currentLang = lang || 'en';
  document.getElementById('lang-toggle').style.display = 'flex';
  applyTranslations();
}

// Enter key handled in auth.js
