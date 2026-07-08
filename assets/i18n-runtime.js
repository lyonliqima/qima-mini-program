/**
 * QIMA Mini Program i18n runtime
 * Depends on assets/i18n/zh.js and assets/i18n/en.js loaded first.
 */
(function (global) {
  'use strict';

  var LANG_STORAGE_KEY = 'qima-mini-lang';
  var DEFAULT_LANG = 'zh';
  var SUPPORTED = ['zh', 'en'];

  /** @type {string|null} Set per page, e.g. window.PAGE_TITLE_KEY = 'title.index' */
  var PAGE_TITLE_KEY = global.PAGE_TITLE_KEY || null;

  /** @type {((lang: string) => void)|null} */
  var onLangApplied = null;

  var STATUS_CLASS_MAP = {
    '进行中': 'blue',
    '待验证': 'blue',
    '报告已完成': 'green',
    '合格': 'green',
    '待确认': 'orange',
    'in progress': 'blue',
    'pending verification': 'blue',
    'report ready': 'green',
    'report completed': 'green',
    'pass': 'green',
    'pending confirmation': 'orange'
  };

  var COUNTRY_CANONICAL = {
    '欧盟': 'eu',
    '美国': 'us',
    '澳大利亚': 'au',
    '加拿大': 'ca',
    '南非': 'za',
    '中国': 'cn',
    '越南': 'vn',
    '印度': 'in',
    '英国': 'gb',
    '德国': 'de',
    '法国': 'fr',
    '意大利': 'it',
    '西班牙': 'es',
    '日本': 'jp',
    '韩国': 'kr',
    '新加坡': 'sg',
    '马来西亚': 'my',
    '泰国': 'th',
    '墨西哥': 'mx',
    '巴西': 'br',
    '奥兰群岛': 'ax',
    'european union': 'eu',
    'united states': 'us',
    'australia': 'au',
    'canada': 'ca',
    'south africa': 'za',
    'china': 'cn',
    'vietnam': 'vn',
    'india': 'in',
    'united kingdom': 'gb',
    'germany': 'de',
    'france': 'fr',
    'italy': 'it',
    'spain': 'es',
    'japan': 'jp',
    'south korea': 'kr',
    'korea': 'kr',
    'singapore': 'sg',
    'malaysia': 'my',
    'thailand': 'th',
    'mexico': 'mx',
    'brazil': 'br',
    'aland islands': 'ax',
    'aland': 'ax'
  };

  var STATUS_ZH_TO_KEY = {
    '进行中': 'status.inProgress',
    '待验证': 'status.pendingVerification',
    '报告已完成': 'status.reportCompleted',
    '合格': 'status.pass',
    '待确认': 'status.pendingConfirmation'
  };

  var MAIL_TYPE_KEYS = [
    'mailType.all',
    'mailType.reportOnly',
    'mailType.paymentOnly',
    'mailType.quotationOnly'
  ];

  var LAB_KEYS = [
    { key: 'hangzhou', labelKey: 'lab.hangzhou', addressKey: 'lab.hangzhouAddress' },
    { key: 'shanghai', labelKey: 'lab.shanghai', addressKey: 'lab.shanghaiAddress' },
    { key: 'dongguan', labelKey: 'lab.dongguan', addressKey: 'lab.dongguanAddress' }
  ];

  var DISTRIBUTION_PRESET_KEYS = [
    'country.us',
    'country.eu',
    'country.ca',
    'country.za',
    'country.au'
  ];

  var DISTRIBUTION_SEARCH_KEYS = [
    'country.eu', 'country.us', 'country.au', 'country.ca', 'country.za',
    'country.cn', 'country.vn', 'country.in', 'country.gb', 'country.de',
    'country.fr', 'country.it', 'country.es', 'country.jp', 'country.kr',
    'country.sg', 'country.my', 'country.th', 'country.mx', 'country.br'
  ];

  var CHIP_ICONS = {
    cart: '<path d="M3 3h2l1.4 7.2a1.5 1.5 0 0 0 1.5 1.2h4.2a1.5 1.5 0 0 0 1.4-1l1-4.4H6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="16" r="1" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="13" cy="16" r="1" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    edit: '<path d="M4 13.5V17h3.5L16 8.5 12.5 5 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    plus: '<path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    check: '<path d="M4 10.2l3.5 3.5L16 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    refresh: '<path d="M15.5 7A6 6 0 0 0 5 5.4L3.5 7M4.5 13a6 6 0 0 0 10.5 1.6l1.5-1.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 3.8V7h3.2M16.5 16.2V13h-3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  };

  function normalizeLang(lang) {
    var value = String(lang || '').toLowerCase();
    if (value === 'en' || value.indexOf('en') === 0) return 'en';
    return 'zh';
  }

  function getLang() {
    try {
      var stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (e) { /* ignore */ }
    return DEFAULT_LANG;
  }

  function setLang(lang) {
    var next = normalizeLang(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch (e) { /* ignore */ }
    return next;
  }

  function getDict(lang) {
    var code = normalizeLang(lang || getLang());
    return code === 'en' ? (global.I18N_EN || {}) : (global.I18N_ZH || {});
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function interpolate(template, vars) {
    if (!vars) return template;
    return String(template).replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] != null ? String(vars[name]) : '';
    });
  }

  function cleanFieldLabel(text) {
    return String(text == null ? '' : text).replace(/\s*\*+\s*$/g, '').trim();
  }

  function t(key, vars) {
    var dict = getDict();
    var value = dict[key];
    if (value == null) return key;
    return interpolate(value, vars);
  }

  function tHtml(key, vars) {
    return t(key, vars);
  }

  function applyHtmlLang(lang) {
    var code = normalizeLang(lang || getLang());
    document.documentElement.lang = code === 'en' ? 'en' : 'zh-CN';
  }

  function applyDocumentTitle() {
    var titleKey = global.PAGE_TITLE_KEY || PAGE_TITLE_KEY;
    if (titleKey) {
      document.title = t(titleKey);
    }
  }

  function applyPageI18n(root) {
    var scope = root || document;
    applyHtmlLang();

    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      if (el.getAttribute('data-i18n-html') === 'true') {
        el.innerHTML = tHtml(key);
      } else {
        el.textContent = t(key);
      }
    });

    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    });

    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.title = t(key);
    });

    scope.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-alt');
      if (key) el.alt = t(key);
    });

    applyDocumentTitle();

    if (typeof onLangApplied === 'function') {
      onLangApplied(getLang());
    }
  }

  function ensureLangToggleStyles() {
    if (document.getElementById('qima-lang-toggle-css')) return;
    var link = document.createElement('link');
    link.id = 'qima-lang-toggle-css';
    link.rel = 'stylesheet';
    link.href = 'assets/lang-toggle.css';
    document.head.appendChild(link);
  }

  function initLangToggle(options) {
    options = options || {};
    if (options.pageTitleKey) {
      PAGE_TITLE_KEY = options.pageTitleKey;
      global.PAGE_TITLE_KEY = options.pageTitleKey;
    }
    if (typeof options.onLangApplied === 'function') {
      onLangApplied = options.onLangApplied;
    }

    ensureLangToggleStyles();

    var existing = document.getElementById('qima-lang-switcher');
    if (existing) existing.remove();

    var current = getLang();
    var wrap = document.createElement('div');
    wrap.id = 'qima-lang-switcher';
    wrap.className = 'lang-switcher';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language');

    var zhBtn = document.createElement('button');
    zhBtn.type = 'button';
    zhBtn.textContent = '中文';
    zhBtn.className = current === 'zh' ? 'active' : '';
    zhBtn.setAttribute('data-lang', 'zh');

    var enBtn = document.createElement('button');
    enBtn.type = 'button';
    enBtn.textContent = 'EN';
    enBtn.className = current === 'en' ? 'active' : '';
    enBtn.setAttribute('data-lang', 'en');

    function switchLang(lang) {
      if (normalizeLang(lang) === getLang()) return;
      setLang(lang);
      if (options.reloadOnSwitch !== false) {
        location.reload();
        return;
      }
      applyPageI18n();
      zhBtn.classList.toggle('active', getLang() === 'zh');
      enBtn.classList.toggle('active', getLang() === 'en');
    }

    zhBtn.addEventListener('click', function () { switchLang('zh'); });
    enBtn.addEventListener('click', function () { switchLang('en'); });

    wrap.appendChild(zhBtn);
    wrap.appendChild(enBtn);
    document.body.appendChild(wrap);

    applyPageI18n();
  }

  function resolveCountryCanonical(country) {
    var raw = String(country || '').trim();
    if (!raw) return '';
    var lower = raw.toLowerCase();
    if (COUNTRY_CANONICAL[raw]) return COUNTRY_CANONICAL[raw];
    if (COUNTRY_CANONICAL[lower]) return COUNTRY_CANONICAL[lower];
    var slugLabel = t('country.' + lower);
    if (slugLabel && slugLabel !== 'country.' + lower) return lower;
    var dict = getDict();
    for (var key in dict) {
      if (key.indexOf('country.') === 0 && dict[key] === raw) {
        return key.slice('country.'.length);
      }
    }
    return '';
  }

  function resolveCountryKey(country) {
    var raw = String(country || '').trim();
    if (!raw) return '';
    var canon = resolveCountryCanonical(raw);
    return canon || raw;
  }

  function displayCountry(country) {
    var raw = String(country || '').trim();
    if (!raw) return '';
    var key = resolveCountryKey(raw);
    if (key) {
      var translated = t('country.' + key);
      if (translated && translated !== 'country.' + key) return translated;
    }
    return raw;
  }

  function translateStatus(status) {
    var raw = String(status || '').trim();
    if (!raw) return '';
    var lang = getLang();
    if (lang === 'zh') {
      var zhDict = global.I18N_ZH || {};
      for (var enKey in STATUS_ZH_TO_KEY) {
        if (t('status.' + STATUS_ZH_TO_KEY[enKey].replace('status.', '')) === raw) return enKey;
      }
      if (STATUS_ZH_TO_KEY[raw]) return raw;
      var reverseKey = null;
      Object.keys(STATUS_ZH_TO_KEY).forEach(function (zh) {
        var key = STATUS_ZH_TO_KEY[zh];
        if (t(key) === raw) reverseKey = zh;
      });
      return reverseKey || raw;
    }
    if (STATUS_ZH_TO_KEY[raw]) return t(STATUS_ZH_TO_KEY[raw]);
    var lower = raw.toLowerCase();
    for (var zhStatus in STATUS_ZH_TO_KEY) {
      if (t(STATUS_ZH_TO_KEY[zhStatus]).toLowerCase() === lower) return t(STATUS_ZH_TO_KEY[zhStatus]);
    }
    return raw;
  }

  function statusClass(status) {
    var raw = String(status || '').trim();
    if (!raw) return 'blue';
    if (STATUS_CLASS_MAP[raw]) return STATUS_CLASS_MAP[raw];
    var lower = raw.toLowerCase();
    if (STATUS_CLASS_MAP[lower]) return STATUS_CLASS_MAP[lower];
    var translated = translateStatus(raw);
    if (STATUS_CLASS_MAP[translated]) return STATUS_CLASS_MAP[translated];
    if (STATUS_CLASS_MAP[translated.toLowerCase()]) return STATUS_CLASS_MAP[translated.toLowerCase()];
    return 'blue';
  }

  function getContactMailTypes() {
    return MAIL_TYPE_KEYS.map(function (key) { return t(key); });
  }

  function getTestingLabs() {
    return LAB_KEYS.map(function (lab) {
      return {
        key: lab.key,
        label: t(lab.labelKey),
        address: t(lab.addressKey)
      };
    });
  }

  function getDistributionPresets() {
    return DISTRIBUTION_PRESET_KEYS.map(function (key) { return t(key); });
  }

  function getDistributionSearchList() {
    return DISTRIBUTION_SEARCH_KEYS.map(function (key) { return t(key); });
  }

  function chipIconSvg(name) {
    var path = CHIP_ICONS[name] || CHIP_ICONS.check;
    return '<span class="ci"><svg viewBox="0 0 20 20" aria-hidden="true">' + path + '</svg></span>';
  }

  function chipHtml(labelKey, icon, onclick) {
    var label = t(labelKey);
    var iconHtml = icon ? chipIconSvg(icon) : '';
    var handler = onclick ? ' onclick="' + String(onclick).replace(/"/g, '&quot;') + '"' : '';
    return '<button class="chip-btn" type="button"' + handler + '>' + iconHtml + escapeHtml(label) + '</button>';
  }

  var I18n = {
    LANG_STORAGE_KEY: LANG_STORAGE_KEY,
    getLang: getLang,
    setLang: setLang,
    t: t,
    tHtml: tHtml,
    applyPageI18n: applyPageI18n,
    initLangToggle: initLangToggle,
    get PAGE_TITLE_KEY() { return PAGE_TITLE_KEY; },
    set PAGE_TITLE_KEY(value) {
      PAGE_TITLE_KEY = value;
      global.PAGE_TITLE_KEY = value;
    },
    get onLangApplied() { return onLangApplied; },
    set onLangApplied(fn) { onLangApplied = fn; },
    getContactMailTypes: getContactMailTypes,
    getTestingLabs: getTestingLabs,
    getDistributionPresets: getDistributionPresets,
    getDistributionSearchList: getDistributionSearchList,
    translateStatus: translateStatus,
    displayCountry: displayCountry,
    resolveCountryKey: resolveCountryKey,
    chipHtml: chipHtml,
    statusClass: statusClass,
    escapeHtml: escapeHtml,
    cleanFieldLabel: cleanFieldLabel
  };

  global.I18n = I18n;
  global.t = t;
  global.tHtml = tHtml;
})(typeof window !== 'undefined' ? window : globalThis);
