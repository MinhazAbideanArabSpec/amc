// translations.js — Hijri date + i18n system (EN/AR)
// ── Hijri date fallback (manual calculation) ────────────
function toHijri(date, arabic) {
  const HIJRI_MONTHS_EN = ['Muharram','Safar','Rabi\' al-Awwal','Rabi\' al-Thani',
    'Jumada al-Awwal','Jumada al-Thani','Rajab','Sha\'ban','Ramadan','Shawwal',
    'Dhu al-Qi\'dah','Dhu al-Hijjah'];
  const HIJRI_MONTHS_AR = ['محرم','صفر','ربيع الأول','ربيع الآخر',
    'جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال',
    'ذو القعدة','ذو الحجة'];

  // Julian Day Number
  const Y = date.getFullYear(), M = date.getMonth() + 1, D = date.getDate();
  const JD = Math.floor((1461 * (Y + 4800 + Math.floor((M - 14) / 12))) / 4)
    + Math.floor((367 * (M - 2 - 12 * Math.floor((M - 14) / 12))) / 12)
    - Math.floor((3 * Math.floor((Y + 4900 + Math.floor((M - 14) / 12)) / 100)) / 4)
    + D - 32075;

  // Convert JD to Hijri
  let l = JD - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719)
    + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hMonth = Math.floor((24 * l) / 709);
  const hDay = l - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 29;

  const months = arabic ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  return arabic
    ? `${hDay} ${months[hMonth - 1]} ${hYear} هـ`
    : `${hDay} ${months[hMonth - 1]} ${hYear} AH`;
}

// ═══════════════════════════════════════════════════════
//  LANGUAGE / TRANSLATION SYSTEM
// ═══════════════════════════════════════════════════════
var currentLang = 'en';

var TRANSLATIONS = {
  en: {
    // Tabs
    tab_overview: 'Overview', tab_profile: 'My Profile',
    tab_contracts: 'My Contracts', tab_assets: 'My Assets',
    tab_reports: 'Visit Reports', tab_subs: 'Subscriptions', btn_view_all: 'View All',
    // Stat cards
    stat_days_remaining: 'Days Remaining', stat_total_assets: 'Total Assets',
    stat_visits_completed: 'Visits Completed', stat_notifications: 'Notifications',
    stat_registered: 'Registered', stat_assigned: 'Assigned', stat_completed: 'Completed',
    // Card headings
    card_contract_overview: 'Contract Overview', card_asset_statuses: 'Asset Statuses',
    card_asset_health: 'Asset Health', card_visit_section_scores: 'Visit Section Scores',
    card_asset_visit_scores: 'Asset Visit Scores', card_my_profile: 'My Profile',
    card_my_contracts: 'My Contract(s)', card_asset_health_breakdown: 'Asset Health Breakdown',
    card_my_assets: 'My Assets', card_visit_reports: 'Visit Reports', card_visit_dates: 'Visit Dates', visit_last: 'Last Visit', visit_next: 'Next Scheduled',
    // Hero
    hero_sub: 'ArabSpec AMC Portal — Service & Contract Management',
    // Empty states / misc
    loading: 'Loading…', no_assets: 'No assets registered yet.',
    no_contracts: 'No contracts assigned yet.', no_reports: 'No visit reports yet.',
    no_statuses: 'No active statuses assigned to your assets.',
    no_visit_data: 'No visit report data yet.',
    // Buttons
    btn_view_report: 'View Report', btn_view_contract: 'View full contract →',
    btn_click_assets: 'Click to view assets →', btn_close: 'Close',
    // Result badges
    result_pass: 'Pass', result_ok: 'OK', result_fail: 'Fail',
    // Status
    no_active_status: 'No Active Status',
    // Section scores
    overall_total: 'Overall Total',
    // Date
    date_today: 'Today',
    // Signout
    signout: 'Sign out',
  },
  ar: {
    // Tabs
    tab_overview: 'نظرة عامة', tab_profile: 'ملفي الشخصي',
    tab_contracts: 'عقودي', tab_assets: 'أصولي',
    tab_reports: 'تقارير الزيارات', tab_subs: 'الاشتراكات', btn_view_all: 'عرض الكل',
    // Stat cards
    stat_days_remaining: 'الأيام المتبقية', stat_total_assets: 'إجمالي الأصول',
    stat_visits_completed: 'الزيارات المكتملة', stat_notifications: 'الإشعارات',
    stat_registered: 'مسجّلة', stat_assigned: 'مُعيَّنة', stat_completed: 'مكتملة',
    // Card headings
    card_contract_overview: 'نظرة على العقد', card_asset_statuses: 'حالات الأصول',
    card_asset_health: 'صحة الأصول', card_visit_section_scores: 'نتائج أقسام الزيارة',
    card_asset_visit_scores: 'نتائج الأصول في الزيارة', card_my_profile: 'ملفي الشخصي',
    card_my_contracts: 'عقودي', card_asset_health_breakdown: 'تفصيل صحة الأصول',
    card_my_assets: 'أصولي', card_visit_reports: 'تقارير الزيارات', card_visit_dates: 'تواريخ الزيارات', visit_last: 'آخر زيارة', visit_next: 'الزيارة القادمة',
    // Hero
    hero_sub: 'بوابة ArabSpec للصيانة — إدارة الخدمات والعقود',
    // Empty states / misc
    loading: 'جارٍ التحميل…', no_assets: 'لا توجد أصول مسجّلة بعد.',
    no_contracts: 'لم يتم تعيين عقود بعد.', no_reports: 'لا توجد تقارير زيارات بعد.',
    no_statuses: 'لا توجد حالات نشطة مُعيَّنة لأصولك.',
    no_visit_data: 'لا توجد بيانات تقرير زيارة بعد.',
    // Buttons
    btn_view_report: 'عرض التقرير', btn_view_contract: 'عرض العقد كاملاً ←',
    btn_click_assets: 'انقر لعرض الأصول ←', btn_close: 'إغلاق',
    // Result badges
    result_pass: 'ناجح', result_ok: 'مقبول', result_fail: 'فاشل',
    // Status
    no_active_status: 'لا توجد حالة نشطة',
    // Section scores
    overall_total: 'المجموع الكلي',
    // Date
    date_today: 'اليوم',
    // Signout
    signout: 'تسجيل الخروج',
  }
};

function t(key) {
  return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en[key] || key;
}

function applyTranslations() {
  const isAr = currentLang === 'ar';
  const custView = document.getElementById('customer-view');

  // RTL direction on customer view
  if (custView) {
    custView.classList.toggle('rtl', isAr);
    custView.style.direction = isAr ? 'rtl' : 'ltr';
  }

  // Translate all data-t elements inside customer view
  const scope = custView || document;
  scope.querySelectorAll('[data-t]').forEach(el => {
    const key = el.dataset.t;
    el.textContent = t(key);
  });

  // Hero sub text
  const heroSub = document.getElementById('dash-hero-sub');
  if (heroSub) heroSub.textContent = t('hero_sub');

  // Sign out link
  const signout = document.getElementById('signout-link');
  if (signout) signout.textContent = t('signout');

  // Update today's date in hero
  const dateEl = document.getElementById('dash-hero-date');
  if (dateEl) {
    const now = new Date();
    const locale = isAr ? 'ar-SA' : 'en-GB';

    // Gregorian date
    const gregStr = now.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Hijri date using Intl API (supported in modern browsers)
    let hijriStr = '';
    try {
      hijriStr = now.toLocaleDateString(isAr ? 'ar-SA-u-ca-islamic' : 'en-u-ca-islamic', {
        year: 'numeric', month: 'long', day: 'numeric', calendar: 'islamic'
      });
    } catch(e) {
      // Fallback: manual Hijri calculation
      hijriStr = toHijri(now, isAr);
    }

    dateEl.innerHTML = `
      <span>📅</span>
      <span style="opacity:0.95;font-weight:600;">${hijriStr}</span>
      <span style="opacity:0.35;">·</span>
      <span style="opacity:0.65;">${gregStr}</span>
    `;
  }

  // Update language toggle button states
  document.getElementById('lang-btn-en')?.classList.toggle('active', !isAr);
  document.getElementById('lang-btn-ar')?.classList.toggle('active', isAr);
}

async function setLanguage(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  applyTranslations();
  // Save to profile
  const { data: { user } } = await sb.auth.getUser();
  if (user) await sb.from('profiles').update({ language: lang }).eq('id', user.id);
}

function initLanguage(lang) {
  currentLang = lang || 'en';
  document.getElementById('lang-toggle').style.display = 'flex';
  applyTranslations();
}

// Enter key on login
['login-email','login-password'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if (e.key==='Enter') login(); })
);
