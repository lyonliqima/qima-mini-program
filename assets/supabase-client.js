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
    /** 完整订单列表（含实验室、收件人、附件） */
    getFullOrders: function () {
      return request('GET', 'order_full?select=*&order=ordered_at.desc.nullslast');
    },
    getOrderByApplicationNo: function (applicationNo) {
      return request(
        'GET',
        'orders?application_no=eq.' + encodeURIComponent(applicationNo) +
          '&select=*,order_recipients(*),order_files(*)&limit=1'
      ).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    },
    /** 按申请号读取完整订单视图 */
    getFullOrderByApplicationNo: function (applicationNo) {
      return request(
        'GET',
        'order_full?application_no=eq.' + encodeURIComponent(applicationNo) + '&limit=1'
      ).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    },
    /** 按订单号 / order_ref 读取完整订单视图 */
    getFullOrderByRef: function (orderRef) {
      return request(
        'GET',
        'order_full?order_ref=eq.' + encodeURIComponent(orderRef) + '&limit=1'
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
    /**
     * 原子写入完整订单（主表 + 收件人 + 附件）。
     * @param {object} payload
     * @param {object} payload.order 订单字段（可含 form_answers）
     * @param {Array<{email:string,mail_type?:string}>} [payload.recipients]
     * @param {Array<{file_name:string,file_type?:string,storage_path?:string,label_key?:string}>} [payload.files]
     */
    saveFullOrder: function (payload) {
      if (!ready()) {
        return Promise.reject(new Error('Supabase is not configured. Set SUPABASE_CONFIG in assets/supabase-config.js'));
      }
      return fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/save_order_full', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ payload: payload || {} })
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error('Supabase ' + res.status + ': ' + text);
          });
        }
        return res.json();
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
     * Multimodal parse: voice text + product link + uploaded files → order fields.
     * Tries parseEndpoint, then parseEndpointFallback.
     * @param {{voiceText?: string, link?: string, files?: File[]|Blob[]}} input
     * @returns {Promise<object>}
     */
    parseOrder: function (input) {
      var endpoints = [];
      if (cfg.parseEndpoint) endpoints.push(String(cfg.parseEndpoint).replace(/\/$/, ''));
      if (cfg.parseEndpointFallback) {
        var fb = String(cfg.parseEndpointFallback).replace(/\/$/, '');
        if (endpoints.indexOf(fb) === -1) endpoints.push(fb);
      }
      if (!endpoints.length) {
        return Promise.reject(new Error('missing_parse_endpoint'));
      }
      input = input || {};
      var fd = new FormData();
      if (input.voiceText) fd.append('voice_text', String(input.voiceText));
      if (input.link) fd.append('link', String(input.link));
      var files = input.files || [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f || !f.size) continue;
        var name = f.name || ('upload-' + i);
        fd.append('files', f, name);
      }

      function post(endpoint) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = null;
        if (controller) {
          timer = setTimeout(function () { controller.abort(); }, 60000);
        }
        return fetch(endpoint, {
          method: 'POST',
          body: fd,
          signal: controller ? controller.signal : undefined
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
            return data;
          });
        }).catch(function (err) {
          if (err && err.name === 'AbortError') {
            var te = new Error('remote_timeout');
            te.code = 'remote_timeout';
            te.status = 408;
            throw te;
          }
          throw err;
        }).finally(function () {
          if (timer) clearTimeout(timer);
        });
      }

      var chain = post(endpoints[0]);
      for (var e = 1; e < endpoints.length; e++) {
        (function (next) {
          chain = chain.catch(function (err) {
            var status = err && err.status;
            if (status === 404 || status === 405 || status === 408 || status === 502 || status === 503 || !status) {
              return post(next);
            }
            throw err;
          });
        })(endpoints[e]);
      }
      return chain;
    },
    /**
     * Upload audio blob → NVIDIA Whisper zh-CN ASR (Vercel /api/transcribe).
     * Falls back to Supabase Edge Function if asrEndpoint is unset.
     * @param {Blob} blob WAV (preferred) or other audio
     * @param {string} [filename]
     * @returns {Promise<{text: string}>}
     */
    transcribeVoice: function (blob, filename) {
      if (!blob || !blob.size) {
        return Promise.reject(new Error('empty_audio'));
      }
      var endpoint = (cfg.asrEndpoint || '').replace(/\/$/, '');
      if (!endpoint) {
        if (!ready()) return Promise.reject(new Error('missing_config'));
        endpoint = url.replace(/\/$/, '') + '/functions/v1/transcribe-voice';
      }
      var fd = new FormData();
      fd.append('file', blob, filename || 'recording.wav');
      var headers = {};
      if (endpoint.indexOf('/functions/v1/') !== -1 && anonKey) {
        headers.apikey = anonKey;
        headers.Authorization = 'Bearer ' + anonKey;
      }
      return fetch(endpoint, {
        method: 'POST',
        headers: headers,
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
