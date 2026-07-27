// router.js — hash-based routing (loaded after all other scripts)

var ADMIN_TABS    = ['overview','users','contracts','assets','reports','status','subs','tags'];
var CUSTOMER_TABS = ['overview','reports','assets','dc','contract'];

// Patch switchAdminTab to also update the hash
var _origSwitchAdminTab = switchAdminTab;
switchAdminTab = function(tab) {
  _origSwitchAdminTab(tab);
  try { history.pushState(null, '', '#' + tab); } catch(e) {}
};

// Patch switchCustomerTab to also update the hash
var _origSwitchCustomerTab = switchCustomerTab;
switchCustomerTab = function(tab) {
  _origSwitchCustomerTab(tab);
  try { history.pushState(null, '', '#' + tab); } catch(e) {}
};

// Patch afterLogin to restore the correct tab from hash
var _origAfterLogin = afterLogin;
afterLogin = async function() {
  await _origAfterLogin();
  var hash = window.location.hash.replace('#','').toLowerCase();
  if (!myProfile) return;
  if (myProfile.role === 'admin' && ADMIN_TABS.includes(hash)) {
    switchAdminTab(hash);
  } else if (myProfile.role !== 'admin' && CUSTOMER_TABS.includes(hash)) {
    switchCustomerTab(hash);
  }
};

// Back/forward button support
window.addEventListener('popstate', function() {
  if (!myProfile) return;
  var hash = window.location.hash.replace('#','').toLowerCase();
  if (!hash) return;
  if (myProfile.role === 'admin' && ADMIN_TABS.includes(hash)) {
    switchAdminTab(hash);
  } else if (myProfile.role !== 'admin' && CUSTOMER_TABS.includes(hash)) {
    switchCustomerTab(hash);
  }
});
