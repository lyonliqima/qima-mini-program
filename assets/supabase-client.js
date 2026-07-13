/**
 * Lightweight Supabase client for the QIMA mini program (vanilla JS).
 * Requires window.SUPABASE_URL and window.SUPABASE_ANON_KEY before this script loads,
 * or set them in assets/supabase-config.js.
 */
(function (global) {
  'use strict';

  var cfg = global.SUPABASE_CONFIG || {};
  var url = cfg.url || global.SUPABASE_URL || '';
  var anonKey = cfg.anonKey || global.SUPABASE_ANON_KEY || '';

  function ready() {
    return !!(url && anonKey && !String(url).includes('YOUR_PROJECT'));
  }

  function headers(extra) {
    var h = {
      apikey: anonKey,
      Authorization: 'Bearer ' + anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    }
    return h;
  }

  function request(method, path, body, prefer) {
    if (!ready()) {
      return Promise.reject(new Error('Supabase is not configured. Set SUPABASE_CONFIG in assets/supabase-config.js'));
    }
    var opts = {
      method: method,
      headers: headers(prefer ? { Prefer: prefer } : null)
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(url.replace(/\/$/, '') + '/rest/v1/' + path.replace(/^\//, ''), opts)
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error('Supabase ' + res.status + ': ' + text);
          });
        }
        if (res.status === 204) return null;
        return res.json();
      });
  }

  var api = {
    ready: ready,
    getLabs: function () {
      return request('GET', 'labs?select=*&order=id.asc');
    },
    getOrders: function () {
      return request('GET', 'orders?select=*,order_recipients(*)&order=ordered_at.desc.nullslast');
    },
    getOrderByApplicationNo: function (applicationNo) {
      return request(
        'GET',
        'orders?application_no=eq.' + encodeURIComponent(applicationNo) +
          '&select=*,order_recipients(*),order_files(*)&limit=1'
      ).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    },
    getReports: function (category) {
      var q = 'reports?select=*&order=report_date.desc.nullslast';
      if (category && category !== 'all') {
        q += '&category=eq.' + encodeURIComponent(category);
      }
      return request('GET', q);
    },
    getReportBySku: function (sku) {
      return request(
        'GET',
        'reports?sku=eq.' + encodeURIComponent(sku) + '&select=*&limit=1'
      ).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    },
    createOrder: function (payload) {
      return request('POST', 'orders', payload, 'return=representation').then(function (rows) {
        return rows && rows[0] ? rows[0] : rows;
      });
    },
    updateOrder: function (id, patch) {
      return request(
        'PATCH',
        'orders?id=eq.' + encodeURIComponent(id),
        patch,
        'return=representation'
      ).then(function (rows) {
        return rows && rows[0] ? rows[0] : rows;
      });
    },
    /**
     * Upload audio blob to Edge Function → NVIDIA Parakeet zh-CN ASR.
     * @param {Blob} blob WAV (preferred) or other audio
     * @param {string} [filename]
     * @returns {Promise<{text: string}>}
     */
    transcribeVoice: function (blob, filename) {
      if (!ready()) {
        return Promise.reject(new Error('missing_config'));
      }
      if (!blob || !blob.size) {
        return Promise.reject(new Error('empty_audio'));
      }
      var fd = new FormData();
      fd.append('file', blob, filename || 'recording.wav');
      return fetch(url.replace(/\/$/, '') + '/functions/v1/transcribe-voice', {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + anonKey
        },
        body: fd
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (_) {
            data = { error: 'bad_response', raw: text };
          }
          if (!res.ok) {
            var err = new Error((data && data.error) || ('http_' + res.status));
            err.code = (data && data.error) || ('http_' + res.status);
            err.status = res.status;
            throw err;
          }
          return { text: (data && data.text) ? String(data.text) : '' };
        });
      });
    }
  };

  global.QimaSupabase = api;
})(window);
