/**
 * Client-side product-label parsing fallback.
 * Used when Vercel /api/parse is unavailable; OCR via Tesseract.js CDN.
 */
(function (global) {
  'use strict';

  var MARK_TO_REGIONS = {
    CE: ['欧盟'],
    UKCA: ['英国'],
    UKNI: ['英国'],
    FCC: ['美国'],
    FC: ['美国'],
    FDA: ['美国'],
    CCC: ['中国'],
    PSE: ['日本'],
    KC: ['韩国'],
    RCM: ['澳大利亚']
  };

  var TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var tesseractLoading = null;

  function loadTesseract() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (tesseractLoading) return tesseractLoading;
    tesseractLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = function () {
        if (global.Tesseract) resolve(global.Tesseract);
        else reject(new Error('tesseract_load_failed'));
      };
      s.onerror = function () {
        reject(new Error('tesseract_cdn_failed'));
      };
      document.head.appendChild(s);
    });
    return tesseractLoading;
  }

  function simplifySpaces(text) {
    return String(text || '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function pick(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1]) return String(m[1]).replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function normalizeOrigin(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var low = s.toLowerCase();
    if (/china|中国|prc|p\.r\.c|cn\b/.test(low) || /中国/.test(s)) return '中国';
    if (/vietnam|越南/.test(low) || /越南/.test(s)) return '越南';
    if (/india|印度/.test(low) || /印度/.test(s)) return '印度';
    s = s.replace(/^made\s+in\s+/i, '').trim();
    return s;
  }

  function detectMarks(text) {
    var up = String(text || '').toUpperCase().replace(/[．。]/g, ' ');
    var found = [];
    // Longer tokens first so UKCA wins before nested false positives
    var keys = ['UKCA', 'UKNI', 'ROHS', 'FCC', 'FDA', 'CCC', 'PSE', 'RCM', 'CE', 'FC', 'KC'];
    keys.forEach(function (k) {
      var re = new RegExp('(?:^|[^A-Z0-9])' + k + '(?:[^A-Z0-9]|$)');
      if (re.test(up) && found.indexOf(k) === -1) found.push(k);
    });
    return found;
  }

  function regionsFromMarks(marks) {
    var out = [];
    var seen = {};
    (marks || []).forEach(function (m) {
      var regions = MARK_TO_REGIONS[String(m).toUpperCase()] || [];
      regions.forEach(function (r) {
        if (!seen[r]) {
          seen[r] = true;
          out.push(r);
        }
      });
    });
    return out;
  }

  function mergeRegions(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (raw) {
      String(raw || '')
        .split(/[,，、;/|]+/)
        .forEach(function (part) {
          var r = part.trim();
          if (!r) return;
          var map = {
            'european union': '欧盟',
            eu: '欧盟',
            'united states': '美国',
            usa: '美国',
            us: '美国',
            'united kingdom': '英国',
            uk: '英国',
            australia: '澳大利亚',
            canada: '加拿大',
            'south africa': '南非',
            china: '中国'
          };
          r = map[r.toLowerCase()] || r;
          if (!seen[r]) {
            seen[r] = true;
            out.push(r);
          }
        });
    });
    return out.join('、');
  }

  function extractFieldsFromOcrText(ocrText) {
    var text = simplifySpaces(ocrText);
    var productName = pick(text, [
      /Product\s*name\s*[:：]\s*([^\n]+)/i,
      /品名\s*[:：]\s*([^\n]+)/,
      /产品名称\s*[:：]\s*([^\n]+)/
    ]);
    var model = pick(text, [
      /Model\s*[:：]\s*([^\n]+)/i,
      /型号\s*[:：]\s*([^\n]+)/,
      /货号\s*[:：]\s*([^\n]+)/,
      /Item\s*#?\s*\/?\s*model\s*#?\s*[:：]?\s*([^\n]+)/i
    ]);
    var manufacturer = pick(text, [
      /Manufacturer\s*[:：]\s*([^\n]+)/i,
      /制造商\s*[:：]\s*([^\n]+)/,
      /生产商\s*[:：]\s*([^\n]+)/
    ]);
    var address = pick(text, [
      /Address\s*[:：]\s*([^\n]+)/i,
      /地址\s*[:：]\s*([^\n]+)/
    ]);
    var originRaw =
      pick(text, [
        /MADE\s+IN\s+([A-Z][A-Z\s]+)/i,
        /Manufacturing\s+location\s*[:：]\s*([^\n]+)/i,
        /原产地?\s*[:：]\s*([^\n]+)/,
        /产地\s*[:：]\s*([^\n]+)/
      ]) || (/MADE\s+IN\s+CHINA/i.test(text) ? '中国' : '');
    var batch = pick(text, [/Batch\s*[:：]\s*([^\n]+)/i, /批号\s*[:：]\s*([^\n]+)/]);
    var date = pick(text, [
      /Date\s+of\s+manufacture\s*[:：]\s*([^\n]+)/i,
      /生产日期\s*[:：]\s*([^\n]+)/
    ]);
    var ecRep = '';
    var ecMatch = text.match(/EC\s*REP[\s\S]{0,40}?([A-Za-z][^\n]+(?:\n[^\n]+){0,3})/i);
    if (ecMatch) ecRep = simplifySpaces(ecMatch[1]).split('\n').slice(0, 4).join(' ');

    var marks = detectMarks(text);
    var regions = mergeRegions(regionsFromMarks(marks));
    var remarkParts = [];
    if (batch) remarkParts.push('批号：' + batch);
    if (date) remarkParts.push('生产日期：' + date);
    if (ecRep) remarkParts.push('欧代：' + ecRep);
    if (marks.length) remarkParts.push('合规标识：' + marks.join('、'));

    var fields = {
      'Product Name': productName,
      Program: '',
      'Country of Origin': normalizeOrigin(originRaw),
      'Countries/Regions of Distribution': regions,
      'Item#/model#': model,
      Manufacturer: manufacturer,
      'Manufacturer Address': address,
      'Sample Collection Method': '',
      Carrier: '',
      'Tracking Number': '',
      'Shipping Remark': remarkParts.join('；')
    };

    return {
      product_summary: {
        name: productName || model || '已识别产品标签',
        brand: '',
        hint: marks.length ? '标签标识：' + marks.join(' / ') : '来自本地标签 OCR'
      },
      fields: fields,
      confidence: {},
      raw_excerpt: text.slice(0, 500),
      source: 'client_ocr'
    };
  }

  function ocrImageFile(file) {
    return loadTesseract().then(function (Tesseract) {
      return Tesseract.recognize(file, 'eng+chi_sim', {
        logger: function () {}
      }).then(function (result) {
        return (result && result.data && result.data.text) || '';
      });
    });
  }

  function parseFilesLocally(files, voiceText, link) {
    files = files || [];
    var imageFiles = files.filter(function (f) {
      return f && f.type && f.type.indexOf('image/') === 0;
    });
    var tasks = imageFiles.slice(0, 3).map(function (f) {
      return ocrImageFile(f).catch(function () {
        return '';
      });
    });

    return Promise.all(tasks).then(function (texts) {
      var combined = texts.filter(Boolean).join('\n\n');
      if (voiceText) combined = String(voiceText) + '\n\n' + combined;
      if (link) combined = combined + '\n\n' + String(link);
      if (!combined.trim()) {
        return Promise.reject(new Error('empty_local_ocr'));
      }
      return extractFieldsFromOcrText(combined);
    });
  }

  global.QimaLabelParse = {
    extractFieldsFromOcrText: extractFieldsFromOcrText,
    parseFilesLocally: parseFilesLocally,
    loadTesseract: loadTesseract
  };
})(window);
