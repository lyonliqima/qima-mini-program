/**
 * Client-side access gate for the GitHub Pages demo.
 * Deterrence only — HTML/JS remain publicly readable.
 *
 * Rotate password: change ACCESS_PASSWORD, recompute SHA-256 hex, update ACCESS_HASH, redeploy.
 * Current password: QIMAproduct
 */
(function () {
  var STORAGE_KEY = 'qima_demo_access_v2';
  // SHA-256 of "QIMAproduct"
  var ACCESS_HASH = '5674506f0ae61d0f77a1a41b94f99c99186777fd15c12e8dd27a73bd8fee3c8f';
  var LOGO_SRC = 'assets/qima-logo.svg';

  function hex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
  }

  function sha256(text) {
    if (window.crypto && window.crypto.subtle) {
      return window.crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(text))
        .then(hex);
    }
    // Fallback for non-secure contexts: compare plaintext token derived once at build time is unavailable;
    // require subtle crypto (HTTPS / localhost).
    return Promise.reject(new Error('crypto.subtle unavailable'));
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === ACCESS_HASH;
    } catch (e) {
      return false;
    }
  }

  function setUnlocked() {
    try {
      sessionStorage.setItem(STORAGE_KEY, ACCESS_HASH);
    } catch (e) { /* private mode */ }
  }

  function unlock() {
    document.documentElement.classList.remove('qima-gate-locked');
    var gate = document.getElementById('qima-access-gate');
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
  }

  function showError(el, input) {
    el.textContent = 'Incorrect password';
    el.classList.add('show');
    input.classList.add('qima-gate-invalid');
    setTimeout(function () {
      input.classList.remove('qima-gate-invalid');
    }, 400);
  }

  function renderGate() {
    document.documentElement.classList.add('qima-gate-locked');

    var existing = document.getElementById('qima-access-gate');
    if (existing) return;

    var root = document.createElement('div');
    root.id = 'qima-access-gate';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Access verification');
    root.innerHTML =
      '<div class="qima-gate-phone">' +
        '<img class="qima-gate-brand" src="' + LOGO_SRC + '" width="126" height="28" alt="QIMA" />' +
        '<div class="qima-gate-copy">' +
          '<p class="qima-gate-title">Internal demo</p>' +
          '<p class="qima-gate-sub">Enter the access password to continue</p>' +
        '</div>' +
        '<form class="qima-gate-form" autocomplete="off">' +
          '<input class="qima-gate-input" type="password" name="access" autocomplete="current-password" placeholder="Access password" aria-label="Access password" />' +
          '<button class="qima-gate-btn" type="submit">Enter demo</button>' +
          '<p class="qima-gate-error" aria-live="polite"></p>' +
        '</form>' +
      '</div>';

    function mount() {
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
        return;
      }
      document.body.appendChild(root);
      var form = root.querySelector('form');
      var input = root.querySelector('.qima-gate-input');
      var err = root.querySelector('.qima-gate-error');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var pwd = (input.value || '').trim();
        if (!pwd) {
          showError(err, input);
          return;
        }
        sha256(pwd)
          .then(function (hash) {
            if (hash === ACCESS_HASH) {
              setUnlocked();
              unlock();
            } else {
              showError(err, input);
            }
          })
          .catch(function () {
            err.textContent = 'Unable to verify. Please open over HTTPS.';
            err.classList.add('show');
          });
      });
      setTimeout(function () { input.focus(); }, 50);
    }

    mount();
  }

  // Lock as early as possible to reduce flash of app content
  document.documentElement.classList.add('qima-gate-locked');

  if (isUnlocked()) {
    document.documentElement.classList.remove('qima-gate-locked');
    return;
  }

  renderGate();
})();
