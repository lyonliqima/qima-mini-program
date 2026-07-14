/**
 * Client-side access gate for the GitHub Pages demo.
 * Deterrence only — HTML/JS remain publicly readable.
 *
 * Rotate password: change ACCESS_PASSWORD, recompute SHA-256 hex, update ACCESS_HASH, redeploy.
 * Current password: QIMA-Demo-2026
 */
(function () {
  var STORAGE_KEY = 'qima_demo_access_v1';
  // SHA-256 of "QIMA-Demo-2026"
  var ACCESS_HASH = 'dd09ca0c603740c93889a501e3a05c6dad3f2245efa46578463428f1c1128c07';
  var LOGO_SRC = 'assets/frame207.svg';

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
    el.textContent = '密码不正确';
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
    root.setAttribute('aria-label', '访问验证');
    root.innerHTML =
      '<div class="qima-gate-phone">' +
        '<img class="qima-gate-brand" src="' + LOGO_SRC + '" alt="QIMA" />' +
        '<div class="qima-gate-copy">' +
          '<p class="qima-gate-title">内部演示</p>' +
          '<p class="qima-gate-sub">请输入访问密码后继续</p>' +
        '</div>' +
        '<form class="qima-gate-form" autocomplete="off">' +
          '<input class="qima-gate-input" type="password" name="access" autocomplete="current-password" placeholder="访问密码" aria-label="访问密码" />' +
          '<button class="qima-gate-btn" type="submit">进入演示</button>' +
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
            err.textContent = '无法验证，请使用 HTTPS 打开';
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
