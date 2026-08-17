// version.js — single source of truth for the version shown in the sidebar
// footer ("Powered by ArabSpec IT · vX.Y.Z"). Bumped once per push: the
// patch number (Z) increments each time; when it would reach 10, it resets
// to 0 and the minor number (Y) increments instead (2.1.9 -> 2.2.0) — a
// base-10 odometer. This file is the only thing that changes for a bump.

const APP_VERSION = '2.1.3';

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-version-label').forEach(el => {
    el.textContent = `v${APP_VERSION}`;
  });
});
