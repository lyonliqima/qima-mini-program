/**
 * Client-side product-label parsing fallback.
 * Used when Supabase Edge Function parse-order is unavailable; OCR via Tesseract.js CDN.
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
  var PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var MAMMOTH_CDN = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
  var tesseractLoading = null;
  var pdfjsLoading = null;
  var mammothLoading = null;

  function loadScriptOnce(src, key) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-qima-lib="' + key + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-qima-lib', key);
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('script_load_failed:' + key)); };
      document.head.appendChild(s);
    });
  }

  function loadTesseract() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (tesseractLoading) return tesseractLoading;
    tesseractLoading = loadScriptOnce(TESSERACT_CDN, 'tesseract').then(function () {
      if (global.Tesseract) return global.Tesseract;
      throw new Error('tesseract_load_failed');
    });
    return tesseractLoading;
  }

  function loadPdfJs() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    if (pdfjsLoading) return pdfjsLoading;
    pdfjsLoading = loadScriptOnce(PDFJS_CDN, 'pdfjs').then(function () {
      if (!global.pdfjsLib) throw new Error('pdfjs_load_failed');
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return global.pdfjsLib;
    });
    return pdfjsLoading;
  }

  function loadMammoth() {
    if (global.mammoth) return Promise.resolve(global.mammoth);
    if (mammothLoading) return mammothLoading;
    mammothLoading = loadScriptOnce(MAMMOTH_CDN, 'mammoth').then(function () {
      if (!global.mammoth) throw new Error('mammoth_load_failed');
      return global.mammoth;
    });
    return mammothLoading;
  }

  function fileNameOf(file) {
    return String((file && file.name) || '').toLowerCase();
  }

  function isImageFile(file) {
    var type = (file && file.type) || '';
    var name = fileNameOf(file);
    return type.indexOf('image/') === 0 || /\.(jpe?g|png|gif|webp|bmp|heic)$/.test(name);
  }

  function isPdfFile(file) {
    var type = (file && file.type) || '';
    var name = fileNameOf(file);
    return type === 'application/pdf' || name.endsWith('.pdf');
  }

  function isDocxFile(file) {
    var type = (file && file.type) || '';
    var name = fileNameOf(file);
    return (
      name.endsWith('.docx') ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  function isLegacyDocFile(file) {
    var type = (file && file.type) || '';
    var name = fileNameOf(file);
    return (name.endsWith('.doc') && !name.endsWith('.docx')) || type === 'application/msword';
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

  /**
   * Isolate a concise product name from voice transcripts, OCR lines, or
   * "service · product" list strings. Keeps EN/ZH titles short — no full sentences.
   *
   * Examples:
   *   "I need lab testing for a toy race car sold in the US manufactured by Acme"
   *     → "toy race car"
   *   "实验室检测 · 智能机器人玩具"
   *     → "智能机器人玩具"
   *   "需要给一款智能机器人玩具做检测，销往美国，制造商是深圳XX"
   *     → "智能机器人玩具"
   */
  function cleanProductName(raw) {
    var name = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!name) return '';

    // Strip "service · product" / "Lab testing · xxx" wrappers (ASCII or middle-dot)
    name = name.replace(
      /^(?:实验室(?:检测|测试)|检测服务|验货服务|装运前(?:检测|检验)|质检|Lab(?:oratory)?\s*(?:testing|test|inspection)|Pre[-\s]?Shipment\s*Inspection|PSI|Inspection|Testing)\s*[·•\-–—|:\/]+\s*/i,
      ''
    );
    // Bare leading middle-dot / bullet left after bad splits
    name = name.replace(/^[·•]\s*/, '');

    // Leading service intent phrases (voice) — longest tokens first
    name = name.replace(
      /^(?:我需要|我想要|我想|请帮我|帮我|需要)?(?:给|为|对)?(?:一款|一个|一台|一件)?(?:做|进行|申请|下单|测试|检测|测)?(?:一下)?(?:实验室)?(?:检测|测试|验货|服务)?(?:订单)?[：:\s]*/i,
      ''
    );
    // English: "I need lab testing for …"
    name = name.replace(
      /^(?:(?:I|we)\s+(?:need|want|would\s+like)|please)\s+/i,
      ''
    );
    name = name.replace(
      /^(?:(?:to\s+)?(?:order|book|do|get|request)\s+)?(?:lab(?:oratory)?\s+)?(?:testing|test|inspection)\s+(?:for|of|on)\s+/i,
      ''
    );
    name = name.replace(/^product\s*name\s*[:：=]\s*/i, '');
    name = name.replace(/^品名\s*[:：=]\s*/, '');
    name = name.replace(/^产品名称\s*[:：=]\s*/, '');

    // Cut English trailing clauses / model suffixes
    name = name.split(
      /\s+(?:sold\s+(?:in|to|for)|manufactured\s+by|made\s+(?:by|in)|produced\s+by|exported\s+to|shipped\s+to|distribut(?:ed|ion)\s+(?:in|to|for)|intended\s+for|for\s+(?:the\s+)?(?:US|U\.S\.|USA|UK|EU|European|American|Chinese|market)|from\s+(?:the\s+)?(?:factory|manufacturer|supplier)|that\s+(?:is|are|was|were|has|have)|which\s+(?:is|are|was|were)|and\s+(?:I|we|the|it)|(?:I|we)\s+(?:need|want|will)|with\s+(?:batter|power)|Model\b|型号|item\s*(?:no\.?|number|#)|SKU|P\s*\/?\s*N)\b/i
    )[0];

    // Cut Chinese trailing clauses
    name = name.split(
      /(?:[，,。；;]\s*)?(?:销往|销售(?:国家|地区|市场)?|出口到?|运往|发往|制造商(?:名称|全称)?|厂家|工厂|生产商|厂商|原产(?:国家或地区|国|地)|产自|产地|型号|货号|SKU|需要(?:做)?(?:检测|测试)|做(?:实验室)?检测|检测服务|带电|非电|样本|送样|寄送)/
    )[0];

    // Drop leading articles / quantifiers
    name = name.replace(/^(?:一款|一个|一台|一件|这种|这个|那个|该|a|an|the|my|our|this|that)\s+/i, '').trim();
    // Drop trailing "做检测/for testing" leftovers
    name = name.replace(/(?:做(?:实验室)?(?:检测|测试)|的检测|的测试|for\s+(?:lab\s+)?(?:testing|test|inspection))$/i, '').trim();
    name = name.replace(/[,，。.;；:：!！?？\-~–—|/\\·•]+$/g, '').trim();
    name = name.replace(/^[,，。.;；:：\-~–—|/\\·•]+/, '').trim();

    // Prefer short titles — CJK vs Latin length caps
    var hasCjk = /[\u4e00-\u9fff]/.test(name);
    var maxLen = hasCjk ? 24 : 48;
    if (name.length > maxLen) {
      if (hasCjk) {
        name = name.slice(0, maxLen).replace(/[的地得了着过与和及]$/, '');
      } else {
        var cut = name.slice(0, maxLen);
        var sp = cut.lastIndexOf(' ');
        name = (sp > 12 ? cut.slice(0, sp) : cut).trim();
      }
    }

    // Reject if still looks like a whole sentence / bare service phrase
    if (/^(?:实验室|检测|测试|lab|testing|inspection)\b/i.test(name) && !/(?:玩具|机器人|风扇|鼠标|Fan|Toy|Mouse|Robot)/i.test(name)) {
      if (name.length > 12) return '';
    }
    if ((hasCjk && name.length > 1) || (!hasCjk && name.length > 1)) return name;
    return name.length >= 2 ? name : '';
  }

  function extractSpokenProductName(text) {
    var raw = String(text || '');
    // Fast path: "Lab testing · Product" / "实验室检测 · 品名"
    var serviceDot = raw.match(
      /^(?:实验室(?:检测|测试)|检测服务|装运前(?:检测|检验)|Lab(?:oratory)?\s*(?:testing|test|inspection)|PSI|Testing|Inspection)\s*[·•\-–—|:\/]+\s*(.+)$/i
    );
    if (serviceDot) {
      var fromDot = cleanProductName(serviceDot[1]);
      if (fromDot) return fromDot;
    }

    var candidate = pick(raw, [
      /产品名称\s*[是为：:]\s*([^\n，。,;；]{2,40})/,
      /产品(?:叫|是|名为?)[：:]?\s*([^\n，。,;；]{2,40})/,
      /品名\s*[是为：:]\s*([^\n，。,;；]{2,40})/,
      /(?:要测|检测|测试|检验)一款\s*([^\n，。,;；]{2,30})/,
      /(?:给|为|对)一款\s*([^\n，。,;；]{2,30}?)(?:做|进行|申请)/,
      /一款\s*([^\n，。,;；]{2,30}?(?:玩具|产品|台灯|耳机|杯|车|机器人|风扇|鼠标|音箱|水壶|灯|积木|娃娃|遥控(?:车|飞机)?))/,
      /(?:测|做|检)\s*([^\n，。,;；]{2,30}?(?:玩具|产品|机器人))/,
      /product\s*name\s*[:=]\s*([^\n,.;]{2,50})/i,
      /(?:product\s*(?:is|called|named)|called|named)\s+([A-Za-z][A-Za-z0-9 &'/\-]{1,45})/i,
      /(?:need|want|order|request|book)\s+(?:lab(?:oratory)?\s+)?(?:testing|test|inspection)\s+for\s+(?:a|an|the\s+)?([A-Za-z][A-Za-z0-9 &'/\-]{1,45}?)(?=\s+(?:sold|manufactured|made|produced|for|from|that|which|and|Model|,|;|\.|$))/i,
      /(?:lab(?:oratory)?\s+)?(?:testing|test|inspection)\s+(?:for|of|on)\s+(?:a|an|the\s+)?([A-Za-z][A-Za-z0-9 &'/\-]{1,45}?)(?=\s+(?:sold|manufactured|made|produced|for|from|that|which|and|Model|,|;|\.|$))/i,
      /(?:for\s+(?:a|an|the)\s+)((?:smart|electric|wireless|portable|toy|kids'?|children'?s?)\s+[A-Za-z][A-Za-z0-9 &'/\-]{1,35})/i
    ]);

    if (!candidate) {
      // Prefer product-noun endings (玩具 before 机器人 so "智能机器人玩具" stays whole)
      var zh = raw.match(
        /([\u4e00-\u9fff]{2,18}(?:玩具|积木|娃娃|遥控车|风扇|鼠标|耳机|音箱|台灯|水壶|充电器|机器人|灯))/
      );
      if (zh) candidate = zh[1];
    }
    if (!candidate) {
      var en = raw.match(
        /\b((?:smart|electric|wireless|portable|rechargeable|toy|kids'?|children'?s?)\s+(?:[A-Za-z]+(?:\s+[A-Za-z]+){0,3})|(?:[A-Za-z]+\s+){0,2}(?:toy|robot|car|fan|mouse|speaker|lamp|light|kettle|blender|headphones?|earbuds?|drone))\b/i
      );
      if (en) candidate = en[1];
    }

    var cleaned = cleanProductName(candidate);
    if (cleaned) return cleaned;
    // Last resort: clean the whole utterance (handles service wrappers / I-need-testing-for)
    return cleanProductName(raw);
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

  function cleanModelValue(raw) {
    var s = String(raw || '')
      .replace(/[‐‑‒–—―]/g, '-')
      .replace(/[：]/g, ':')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';

    // Drop leading No./Number/# noise often glued after "Model"
    s = s.replace(/^(?:No\.?|Number|Num|#|№|N°)\s*[:.#=]?\s*/i, '').trim();

    // Cut at next label / sentence noise
    s = s.split(
      /\s{2,}|\s+(?:Rated|Voltage|Current|Manufacturer|Address|MADE\b|Batch|Date|Product|FCC|FDA|CE\b|RoHS|Input|Output|Capacity)\b/i
    )[0].trim();
    s = s.split(/\s+[A-Z][a-z]+\s*[:：]/)[0].trim();

    // Normalize spaced dashes: "XY - 03" / "XY- 03" → "XY-03"
    s = s.replace(/\s*-\s*/g, '-');
    // "XY 03" (letters + spaces + digits) → "XY-03"
    s = s.replace(/^([A-Za-z][A-Za-z0-9]*?)\s+(\d[\dA-Za-z.\-\/]*)$/, '$1-$2');

    var token = s.match(/([A-Za-z0-9][A-Za-z0-9._\-\/]{0,32})/);
    if (!token) return '';
    var cleaned = token[1].replace(/[.,;:]+$/, '');
    if (!cleaned || isJunkModelToken(cleaned)) return '';
    // Prefer tokens that look like real model/SKU codes
    if (cleaned.length < 2) return '';
    return cleaned;
  }

  function isJunkModelToken(s) {
    return /^(no|number|num|name|model|sku|item|code|type|rated|voltage|current|address|china|prc|made|in|mouse|wireless|product|fcc|fda|ce|rohs|batch|date|manufacturer|origin|toys?|car|race)$/i.test(
      String(s || '')
    );
  }

  function normalizeModelHaystack(text) {
    return String(text || '')
      .replace(/[‐‑‒–—―]/g, '-')
      // Common OCR / confusable deformations of "Model" (incl. Cyrillic lookalikes)
      .replace(/[MМм][oо0О][dԁ][eеЕ][lI1І!|]/gi, 'Model')
      .replace(/\bMode[lI1!|]\b/gi, 'Model')
      .replace(/\bMad\s*el\b/gi, 'Model')
      .replace(/\bMadel\b/gi, 'Model')
      .replace(/\bM0del\b/gi, 'Model')
      .replace(/\bMODEI\b/g, 'MODEL')
      .replace(/\bMODFL\b/gi, 'Model')
      .replace(/\bMode\b(?=\s*(?:No|Number|#|:|：))/gi, 'Model')
      .replace(/型\s*号/g, '型号')
      .replace(/货\s*号/g, '货号')
      .replace(/型\s*號/g, '型号')
      .replace(/貨\s*號/g, '货号')
      .replace(/规格\s*型号/g, '型号')
      .replace(/料\s*号/g, '货号')
      .replace(/款\s*号/g, '货号');
  }

  function extractModel(text) {
    var normalized = normalizeModelHaystack(text);

    var patterns = [
      // Model No. / Model Number / Model# / Model：
      /Model\s*(?:No\.?|Number|Num|#|№|N°)?\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /Model\s*(?:No\.?|Number|Num|#)?\s*[:：#.=]?\s*\n\s*([^\n]{1,40})/i,
      // Glued: ModelNo.XY-03 / Model:XY-03
      /Model(?:No\.?|Number)?[:：#.=]?([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/i,
      /型号\s*[:：#.=]?\s*([^\n]{1,40})/,
      /货号\s*(?:\/\s*型号)?\s*[:：#.=]?\s*([^\n]{1,40})/,
      /Item\s*#?\s*(?:\/\s*)?model\s*#?\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /SKU\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /P\s*\/?\s*N\.?\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /Part\s*(?:No\.?|Number|#)?\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /Item\s*(?:No\.?|Number|#)?\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /Art(?:icle)?\.?\s*(?:No\.?|Number|#)?\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /Style\s*(?:No\.?|Number|#)?\s*[:：#.=]?\s*([^\n]{1,40})/i,
      /型\s*号\s*([^\n]{1,40})/,
      /货\s*号\s*([^\n]{1,40})/
    ];

    for (var i = 0; i < patterns.length; i++) {
      var m = normalized.match(patterns[i]);
      if (m && m[1]) {
        var cleaned = cleanModelValue(m[1]);
        if (cleaned) return cleaned;
      }
    }

    // Last-resort: "Model" on one line, code-like token on the next
    var lineMatch = normalized.match(
      /(?:^|\n)\s*Model\s*(?:No\.?|Number|#)?\s*[:：#.=]?\s*(?:\n|\r)+\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/i
    );
    if (lineMatch && lineMatch[1]) {
      var fromNextLine = cleanModelValue(lineMatch[1]);
      if (fromNextLine) return fromNextLine;
    }

    return '';
  }

  function pickLabelValue(text, labels) {
    var src = String(text || '');
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
      var patterns = [
        // Label: value
        new RegExp(escaped + '\\s*[:：#.=]\\s*([^\\n]{1,120})', 'i'),
        // Label\nvalue
        new RegExp(escaped + '\\s*[:：#.=]?\\s*(?:\\n|\\r)+\\s*([^\\n]{1,120})', 'i'),
        // Label value (same line, no colon) — stop before next known header
        new RegExp(
          escaped +
            '\\s+([^\\n]{1,120}?)(?=\\s+(?:Model|Rating|Manufacturer|Address|Contact|EC\\s*REP|UK\\s*REP|MADE\\s+IN|型号|额定|制造商|地址)\\b|$)',
          'i'
        )
      ];
      for (var p = 0; p < patterns.length; p++) {
        var m = src.match(patterns[p]);
        if (m && m[1]) {
          var val = String(m[1]).replace(/\s+/g, ' ').trim();
          // Reject if we accidentally captured another label name
          if (!val) continue;
          if (/^(Model|Rating|Manufacturer|Address|Contact|EC|UK|MADE)$/i.test(val)) continue;
          return val;
        }
      }
    }
    return '';
  }

  function extractProductName(text) {
    var productName = pick(text, [
      /Product\s*name\s*[:：]\s*([^\n]+)/i,
      /品名\s*[:：]?\s*([^\n]+)/,
      /产品名称\s*[:：]?\s*([^\n]+)/
    ]);
    if (productName) {
      productName = productName.replace(/\s+/g, ' ').trim();
      productName = productName.split(/\s+(?:Model|型号|Rated|Rating|FCC|Manufacturer)\b/i)[0].trim();
      productName = cleanProductName(productName);
      if (productName) return productName;
    }
    // Title line directly above Model (common nameplate / Word table export)
    var aboveModel = text.match(
      /(?:^|\n)\s*([A-Za-z\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff &/\-]{1,60}?)\s*(?:\n|\r)+\s*Model\b/i
    );
    if (aboveModel) {
      var title = cleanProductName(aboveModel[1]);
      if (title && !/^(Manufacturer|Address|Rating|Contact|EC\s*REP|UK\s*REP)$/i.test(title)) {
        return title;
      }
    }
    // Common appliance titles glued on one line: "Electric Fan Model XP-085"
    var glued = text.match(
      /\b((?:Electric|Wireless|Smart|Portable)?\s*(?:Fan|Heater|Lamp|Light|Mouse|Speaker|Robot|Toy|Blender|Kettle)[A-Za-z ]{0,20})\s+Model\b/i
    );
    if (glued) return cleanProductName(glued[1]);
    // Voice / free-text fallback when OCR layout patterns miss
    return extractSpokenProductName(text);
  }

  function canonicalizeFieldKeys(raw) {
    var out = emptyFields();
    if (!raw || typeof raw !== 'object') return out;
    var alias = {
      'product name': 'Product Name',
      product_name: 'Product Name',
      品名: 'Product Name',
      产品名称: 'Product Name',
      model: 'Item#/model#',
      'model no': 'Item#/model#',
      'model number': 'Item#/model#',
      'model#': 'Item#/model#',
      sku: 'Item#/model#',
      型号: 'Item#/model#',
      货号: 'Item#/model#',
      'item # / model #': 'Item#/model#',
      manufacturer: 'Manufacturer',
      'manufacturer name': 'Manufacturer',
      制造商: 'Manufacturer',
      生产商: 'Manufacturer',
      厂家: 'Manufacturer',
      address: 'Manufacturer Address',
      'manufacturer address': 'Manufacturer Address',
      制造商地址: 'Manufacturer Address',
      厂址: 'Manufacturer Address',
      地址: 'Manufacturer Address',
      origin: 'Country of Origin',
      'country of origin': 'Country of Origin',
      原产国: 'Country of Origin',
      rating: 'Product Description',
      'electric product': 'Electric Product',
      'electrical product': 'Electric Product',
      remark: 'Shipping Remark',
      remarks: 'Shipping Remark',
      备注: 'Shipping Remark'
    };
    var emptyish = /^(n\/?a|none|null|unknown|未知|无|暂无|-|—)$/i;
    Object.keys(raw).forEach(function (key) {
      var text = raw[key] != null ? String(raw[key]).trim() : '';
      if (!text || emptyish.test(text)) return;
      var canon = Object.prototype.hasOwnProperty.call(out, key)
        ? key
        : alias[String(key).trim().toLowerCase()];
      if (canon && !out[canon]) out[canon] = text;
    });
    return out;
  }

  function extractFieldsFromOcrText(ocrText) {
    var text = simplifySpaces(ocrText);
    var productName = extractProductName(text);
    var model = extractModel(text);
    var manufacturer = pickLabelValue(text, [
      'Manufacturer',
      'Manufactured by',
      'Manufactured By',
      'Made by',
      'Factory',
      'Company',
      '制造商',
      '生产商',
      '厂家',
      '厂商',
      '生产厂家'
    ]);
    var address = pickLabelValue(text, [
      'Manufacturer Address',
      'Factory Address',
      'Address',
      'Addr',
      '制造商地址',
      '工厂地址',
      '厂址',
      '地址'
    ]);
    if (!manufacturer) {
      var mfrLine = text.match(
        /(?:^|\n)\s*(?:Manufacturer|Manufactured\s+by|制造商|生产商|厂家)\s*[:：]?\s*([^\n]{2,120})/i
      );
      if (mfrLine) manufacturer = simplifySpaces(mfrLine[1]);
    }
    if (!address) {
      var addrLine = text.match(
        /(?:^|\n)\s*(?:Address|Addr\.?|制造商地址|厂址|地址)\s*[:：]?\s*([^\n]{2,160})/i
      );
      if (addrLine) address = simplifySpaces(addrLine[1]);
    }
    if (manufacturer) {
      manufacturer = manufacturer.split(/\s+(?:Address|Contact|EC\s*REP|UK\s*REP|Rating|Model)\b/i)[0].trim();
      manufacturer = manufacturer.replace(/[,，;；]\s*$/, '').trim();
      if (/^(Address|Model|Rating|Contact)$/i.test(manufacturer)) manufacturer = '';
    }
    if (address) {
      address = address.split(/\s+(?:Contact|EC\s*REP|UK\s*REP|Manufacturer|Model|Rating)\b/i)[0].trim();
      if (/^(Manufacturer|Model|Rating|Contact)$/i.test(address)) address = '';
    }

    var originRaw =
      pick(text, [
        /MADE\s+IN\s+([A-Z][A-Z\s]+)/i,
        /Manufacturing\s+location\s*[:：]\s*([^\n]+)/i,
        /原产地?\s*[:：]\s*([^\n]+)/,
        /产地\s*[:：]\s*([^\n]+)/
      ]) || (/MADE\s+IN\s+CHINA/i.test(text) ? '中国' : '');
    // Infer China from Shenzhen / CN address when Made-in missing
    if (!originRaw && /Shenzhen|深圳|\bCN\b|China/i.test(address || text)) {
      originRaw = '中国';
    }

    var batch = pick(text, [/Batch\s*[:：]\s*([^\n]+)/i, /批号\s*[:：]\s*([^\n]+)/]);
    var date = pick(text, [
      /Date\s+of\s+manufacture\s*[:：]\s*([^\n]+)/i,
      /生产日期\s*[:：]\s*([^\n]+)/
    ]);
    var rating = pickLabelValue(text, ['Rating', 'Rated', '额定', '额定参数', '规格']);
    var ecRep = '';
    var ecMatch = text.match(/EC\s*REP[\s\S]{0,80}?([A-Za-z][^\n]+(?:\n[^\n]+){0,3})/i);
    if (ecMatch) ecRep = simplifySpaces(ecMatch[1]).split('\n').slice(0, 4).join(' ');

    var marks = detectMarks(text);
    var regions = extractDistributionRegions(text);
    // French sorting marks / Triman often mean EU (France) market
    if (/Triman|LE\s*TRI|info-?tri|BAC\s*DE\s*TRI/i.test(text)) {
      regions = mergeRegions([regions, '欧盟']);
    }
    if (/UK\s*REP/i.test(text)) {
      regions = mergeRegions([regions, '英国']);
    }

    var electric = inferElectricFromText(text + (rating ? '\nRating: ' + rating : '') + (productName ? '\n' + productName : ''));
    if (rating && electric.code === '__ELECTRIC_YES__' && !electric.desc) {
      electric.desc = '额定：' + rating;
    } else if (rating && electric.code === '__ELECTRIC_YES__' && electric.desc && electric.desc.indexOf(rating) === -1) {
      electric.desc = ('额定：' + rating + '；' + electric.desc).slice(0, 200);
    }

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
      'Electric Product': electric.code,
      'Product Description': electric.desc,
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

  function emptyFields() {
    return {
      'Product Name': '',
      Program: '',
      'Country of Origin': '',
      'Countries/Regions of Distribution': '',
      'Item#/model#': '',
      Manufacturer: '',
      'Manufacturer Address': '',
      'Sample Collection Method': '',
      'Electric Product': '',
      'Product Description': '',
      Carrier: '',
      'Tracking Number': '',
      'Shipping Remark': ''
    };
  }

  function extractElectricDescription(text) {
    var parts = [];
    var rated = pick(text, [
      /Rated(?:\s*(?:voltage|current|power|input|output))?\s*[:：]?\s*([^\n]{2,60}?)(?=\s+(?:Manufacturer|Address|Model|Contact|MADE)|$)/i,
      /Rating\s*[:：]?\s*([^\n]{2,80}?)(?=\s+(?:Manufacturer|Address|Model|Contact|MADE)|$)/i,
      /额定(?:电压|电流|功率|参数|值)?\s*[:：]?\s*([^\n]{2,60})/
    ]);
    if (rated) rated = rated.replace(/\s+/g, ' ').trim();
    var input = pick(text, [/Input\s*[:：]\s*([^\n]{2,60})/i, /输入\s*[:：]\s*([^\n]{2,60})/]);
    var output = pick(text, [/Output\s*[:：]\s*([^\n]{2,60})/i, /输出\s*[:：]\s*([^\n]{2,60})/]);
    var battery = pick(text, [
      /Batter(?:y|ies)\s*[:：]?\s*([^\n]{2,60})/i,
      /(?:锂)?电池\s*[:：]?\s*([^\n]{2,60})/,
      /Power\s*(?:source|supply)?\s*[:：]\s*([^\n]{2,60})/i
    ]);
    var charge = pick(text, [
      /Charg(?:e|ing)\s*[:：]?\s*([^\n]{2,60})/i,
      /充电(?:方式|类型)?\s*[:：]?\s*([^\n]{2,60})/
    ]);
    if (rated) parts.push('额定：' + rated.replace(/\s+/g, ' ').trim());
    if (input) parts.push('输入：' + input.replace(/\s+/g, ' ').trim());
    if (output) parts.push('输出：' + output.replace(/\s+/g, ' ').trim());
    if (battery) parts.push('电池：' + battery.replace(/\s+/g, ' ').trim());
    if (charge) parts.push('充电：' + charge.replace(/\s+/g, ' ').trim());

    // Compact electrical specs scattered in text
    if (!parts.length) {
      var volt = text.match(/\b\d+(?:\.\d+)?\s*V(?:olt)?(?:\s*DC|\s*AC)?\b/i);
      var amp = text.match(/\b\d+(?:\.\d+)?\s*(?:mA|A)\b/i);
      var watt = text.match(/\b\d+(?:\.\d+)?\s*W\b/i);
      if (volt) parts.push(volt[0]);
      if (amp) parts.push(amp[0]);
      if (watt) parts.push(watt[0]);
    }
    return parts.join('；').slice(0, 200);
  }

  /**
   * Infer whether product is electric from OCR/voice text.
   * Returns { code: '__ELECTRIC_YES__'|'__ELECTRIC_NO__'|'', desc: string }
   */
  function inferElectricFromText(text) {
    var raw = String(text || '');
    if (!raw.trim()) return { code: '', desc: '' };

    // Explicit statements win
    if (/非电(?:产品)?|不带电|不含电池|无电池|不带电源|non[-\s]?electric|without\s+batter(?:y|ies)|no\s+batter(?:y|ies)|battery[-\s]?free/i.test(raw)) {
      return { code: '__ELECTRIC_NO__', desc: '' };
    }
    if (/带电(?:产品)?|含电池|内置电池|配电池|电动|electric\s+product|contains?\s+batter|powered\s+by|with\s+batter/i.test(raw)) {
      return { code: '__ELECTRIC_YES__', desc: extractElectricDescription(raw) };
    }

    var score = 0;
    if (/batter(?:y|ies)|rechargeable|锂电|锂电池|干电池|纽扣电池|蓄电池|充电电池/i.test(raw)) score += 4;
    if (/\b\d+(?:\.\d+)?\s*V(?:olt)?(?:\s*DC|\s*AC)?\b|\b\d+(?:\.\d+)?\s*(?:mA|A)\b|\b\d+(?:\.\d+)?\s*W\b|额定(?:电压|电流|功率)|电压|电流|功率/i.test(raw)) score += 3;
    if (/\b\d+\s*\/\s*\d+\s*Hz\b|\b50\s*\/\s*60\s*Hz\b|\b\d+\s*Hz\b|Rating\s*[:：]?\s*[^\n]*\d+\s*W/i.test(raw)) score += 3;
    if (/USB|Type-?C|DC\s*in(?:put)?|AC\s*(?:adapter|input)|充电器|适配器|电源适配|充电口|充电仓/i.test(raw)) score += 3;
    if (/FCC\s*ID|Bluetooth|Wi-?Fi|无线充电|电机|马达|\bLED\b|PCB|电路/i.test(raw)) score += 2;
    if (/Input\s*[:：]|Output\s*[:：]|Rated\s*[:：]|Power\s*[:：]|Rating\s*[:：]/i.test(raw)) score += 2;
    if (/Wireless\s+Mouse|无线鼠标|耳机|earbud|headphone|speaker|音箱|台灯|robot|机器人|drone|无人机|Electric\s+Fan|电风扇|风扇/i.test(raw)) score += 2;
    if (/充电|charger|adapter/i.test(raw)) score += 2;

    if (score >= 3) {
      return { code: '__ELECTRIC_YES__', desc: extractElectricDescription(raw) };
    }
    return { code: '', desc: '' };
  }

  function extractSpokenRegions(text) {
    var regions = [];
    var pairs = [
      [/欧盟|欧洲(?:联盟|市场|地区)?|EU\b|European\s+Union|Europe(?:an)?\s+market/i, '欧盟'],
      [/美国|北美|USA\b|U\.S\.A\.?|United\s+States|\bUS\b|U\.S\.?\s+market/i, '美国'],
      [/英国|UK\b|United\s+Kingdom|Great\s+Britain|England/i, '英国'],
      [/加拿大|Canada/i, '加拿大'],
      [/澳大利亚|澳洲|Australia/i, '澳大利亚'],
      [/南非|South\s+Africa/i, '南非'],
      [/日本|Japan/i, '日本'],
      [/韩国|Korea/i, '韩国']
    ];
    pairs.forEach(function (pair) {
      if (pair[0].test(text) && regions.indexOf(pair[1]) === -1) regions.push(pair[1]);
    });
    return regions;
  }

  function extractDistributionRegions(text) {
    var regionHint = pick(text, [
      /销往\s*([^\n。；;]{2,80})/,
      /销售(?:国家|地区|市场)?\s*[是为：:]\s*([^\n。；;]{2,80})/,
      /(?:出口|发往|运往|适用于)\s*([^\n。；;]{2,80})/,
      /(?:目标|目标销售)?市场\s*[是为：:]\s*([^\n。；;]{2,80})/,
      /sold\s+(?:in|to)\s+([^\n.;]{2,80})/i,
      /(?:for|intended\s+for)\s+(?:the\s+)?([^\n.;]{2,60}\s+market)/i,
      /distribut(?:ion|ed)\s+(?:in|to|for)\s+([^\n.;]{2,80})/i,
      /countries?\s*(?:\/\s*regions?)?\s+of\s+distribution\s*[:=]\s*([^\n.;]{2,80})/i,
      /destination\s*(?:market|country|countries)?\s*[:=]\s*([^\n.;]{2,80})/i
    ]);
    var fromText = extractSpokenRegions(regionHint || text);
    var marks = detectMarks(text);
    var fromMarks = regionsFromMarks(marks);
    // EC REP / Authorized Representative in Europe also implies EU sales
    if (/EC\s*REP|European\s+Authorized\s+Representative|欧代|欧盟授权代表/i.test(text)) {
      if (fromMarks.indexOf('欧盟') === -1) fromMarks = fromMarks.concat(['欧盟']);
    }
    return mergeRegions(fromText.concat(fromMarks));
  }

  function extractProgram(text) {
    if (/TEMU/i.test(text) && /硬件/.test(text)) return '__PROGRAM_TEMU_HW__';
    if (/TEMU\s*玩具|玩具\s*[-—]?\s*商家|temu.*toy/i.test(text)) return '__PROGRAM_TEMU_TOY__';
    if (/Amazon|亚马逊/i.test(text)) return '__PROGRAM_AMAZON__';
    if (/TEMU/i.test(text) && /商家付款|退款|program/i.test(text)) return '__PROGRAM_TEMU_HW__';
    if (/TEMU/i.test(text)) return '__PROGRAM_TEMU_HW__';
    var m = text.match(/(?:关联)?(?:项目|Program)\s*[是为：:]\s*([^\n，。,]{2,60})/i);
    return m ? m[1].trim() : '';
  }

  function extractSampleMethod(text) {
    if (/已经拿到|已拿到|已经收到|仓库里?已有|QIMA\s*已经|已经有样本/i.test(text)) {
      return 'received';
    }
    if (/现场收集|服务时收集|检验时收集|上门取样|QIMA\s*将?在|启迈.*收集/i.test(text)) {
      return 'collect';
    }
    if (/寄送|邮寄|快递.*样本|我们.*寄|供应商.*寄|送样/i.test(text)) {
      return 'ship';
    }
    return '';
  }

  function extractFieldsFromVoiceText(voiceText) {
    var text = simplifySpaces(voiceText);
    if (!text) {
      return {
        product_summary: { name: '', brand: '', hint: '' },
        fields: emptyFields(),
        confidence: {},
        raw_excerpt: '',
        source: 'voice'
      };
    }

    var productName = extractSpokenProductName(text);

    var model = pick(text, [
      /型号\s*[是为：:]?\s*([^\n，。,]{1,40})/,
      /货号\s*[是为：:]?\s*([^\n，。,]{1,40})/,
      /Model\s*(?:No\.?|Number|#)?\s*[:：#.=]?\s*([^\n，。,]{1,40})/i,
      /SKU\s*[:=#]?\s*([^\n，。,]{1,40})/i,
      /P\s*\/?\s*N\.?\s*[:=#]?\s*([^\n，。,]{1,40})/i
    ]);
    if (model) model = cleanModelValue(model);
    // Fallback shared Model extractor (OCR-tolerant)
    if (!model) model = extractModel(text);

    var manufacturer = pick(text, [
      /制造商(?:名称|全称)?\s*[是为：:]?\s*([^\n，。,]{2,80})/,
      /(?:厂家|工厂|生产商|厂商)\s*[是为：:]?\s*([^\n，。,]{2,80})/,
      /manufacturer\s*[:=]\s*([^\n,.]{2,80})/i
    ]);

    var address = pick(text, [
      /制造商地址\s*[是为：:]?\s*([^\n，。,;；]{4,80})/,
      /(?:工厂|厂家|公司)?地址\s*[是为：:]?\s*([^\n，。,;；]{4,80})/,
      /address\s*[:=]\s*([^\n,.;]{4,80})/i
    ]);
    if (address) {
      address = address.replace(/(?:我们|供应商|会|将).*$/, '').trim();
    }

    var originRaw =
      pick(text, [
        /原产国(?:家或地区)?\s*[是为：:]\s*([^\n，。,]{1,40})/,
        /原产地?\s*[是为：:]\s*([^\n，。,]{1,40})/,
        /产自\s*([^\n，。,]{1,40})/,
        /made\s+in\s+([A-Za-z\u4e00-\u9fff][^\n,.]{0,40})/i,
        /country\s+of\s+origin\s*[:=]\s*([^\n,.]{1,40})/i
      ]) || '';
    if (!originRaw) {
      if (/原产国.{0,6}中国|中国产|国产|中国制造/i.test(text)) originRaw = '中国';
      else if (/原产国.{0,6}越南|越南产/i.test(text)) originRaw = '越南';
      else if (/原产国.{0,6}印度|印度产/i.test(text)) originRaw = '印度';
    }

    var regions = extractDistributionRegions(text);

    var program = extractProgram(text);
    var sampleCode = extractSampleMethod(text);
    var sampleLabel = '';
    if (sampleCode === 'ship') sampleLabel = '__SAMPLE_SHIP__';
    if (sampleCode === 'collect') sampleLabel = '__SAMPLE_COLLECT__';
    if (sampleCode === 'received') sampleLabel = '__SAMPLE_RECEIVED__';

    var carrier = pick(text, [
      /承运商\s*[是为：:]\s*([^\n，。,]{2,40})/,
      /快递\s*[是为：:]\s*([^\n，。,]{2,40})/,
      /(?:顺丰|中通|圆通|韵达|京东|DHL|UPS|FedEx)/
    ]);
    if (carrier && /顺丰|SF/i.test(carrier)) carrier = '顺丰速运';
    var tracking = pick(text, [
      /运单号\s*[是为：:]\s*([A-Za-z0-9]{6,40})/,
      /快递单号\s*[是为：:]\s*([A-Za-z0-9]{6,40})/,
      /tracking\s*(?:number|no\.?)?\s*[:=]?\s*([A-Za-z0-9]{6,40})/i
    ]);

    var fields = emptyFields();
    fields['Product Name'] = productName;
    fields.Program = program;
    fields['Country of Origin'] = normalizeOrigin(originRaw);
    fields['Countries/Regions of Distribution'] = regions;
    fields['Item#/model#'] = model;
    fields.Manufacturer = manufacturer;
    fields['Manufacturer Address'] = address;
    fields['Sample Collection Method'] = sampleLabel;
    var electric = inferElectricFromText(text);
    fields['Electric Product'] = electric.code;
    fields['Product Description'] = electric.desc;
    fields.Carrier = carrier || '';
    fields['Tracking Number'] = tracking || '';

    return {
      product_summary: {
        name: productName || '语音描述产品',
        brand: '',
        hint: '来自语音识别'
      },
      fields: fields,
      sample_code: sampleCode,
      confidence: {},
      raw_excerpt: text.slice(0, 500),
      source: 'voice'
    };
  }

  function mergeFieldSets(primary, secondary) {
    var out = emptyFields();
    var a = canonicalizeFieldKeys((primary && primary.fields) || primary || {});
    var b = canonicalizeFieldKeys((secondary && secondary.fields) || secondary || {});
    Object.keys(out).forEach(function (key) {
      var av = a[key] != null ? String(a[key]).trim() : '';
      var bv = b[key] != null ? String(b[key]).trim() : '';
      if (key === 'Countries/Regions of Distribution') {
        out[key] = mergeRegions([av, bv]);
        return;
      }
      if ((key === 'Shipping Remark' || key === 'Product Description') && av && bv && av !== bv) {
        out[key] = av + '；' + bv;
        return;
      }
      // Prefer explicit electric yes/no when either side has it
      if (key === 'Electric Product') {
        out[key] = av || bv;
        if (av === '__ELECTRIC_YES__' || bv === '__ELECTRIC_YES__') out[key] = '__ELECTRIC_YES__';
        else if (av === '__ELECTRIC_NO__' || bv === '__ELECTRIC_NO__') out[key] = out[key] || '__ELECTRIC_NO__';
        return;
      }
      out[key] = av || bv;
      if (key === 'Product Name' && out[key]) {
        out[key] = cleanProductName(out[key]) || out[key];
      }
    });
    var summaryA = (primary && primary.product_summary) || {};
    var summaryB = (secondary && secondary.product_summary) || {};
    var mergedName = cleanProductName(summaryA.name || out['Product Name'] || summaryB.name || '') ||
      out['Product Name'] ||
      '';
    return {
      product_summary: {
        name: mergedName,
        brand: summaryA.brand || summaryB.brand || '',
        hint: summaryA.hint || summaryB.hint || ''
      },
      fields: out,
      sample_code: (primary && primary.sample_code) || (secondary && secondary.sample_code) || '',
      confidence: Object.assign({}, (secondary && secondary.confidence) || {}, (primary && primary.confidence) || {}),
      raw_excerpt: ((primary && primary.raw_excerpt) || (secondary && secondary.raw_excerpt) || '').slice(0, 500),
      source: [primary && primary.source, secondary && secondary.source].filter(Boolean).join('+') || 'merged'
    };
  }

  function ocrImageFile(file, onProgress) {
    return loadTesseract().then(function (Tesseract) {
      if (typeof onProgress === 'function') onProgress('正在识别图片文字…');
      return Tesseract.recognize(file, 'eng+chi_sim', {
        logger: function (m) {
          if (!onProgress || !m) return;
          if (m.status === 'recognizing text' && m.progress != null) {
            onProgress('正在识别图片文字… ' + Math.round(m.progress * 100) + '%');
          } else if (m.status === 'loading tesseract core') {
            onProgress('正在加载识别引擎…');
          } else if (m.status === 'initializing tesseract') {
            onProgress('正在初始化识别引擎…');
          } else if (m.status === 'loading language traineddata') {
            onProgress('正在加载语言包…');
          }
        }
      }).then(function (result) {
        return (result && result.data && result.data.text) || '';
      });
    });
  }

  function notifyProgress(onProgress, code, fallback) {
    if (typeof onProgress !== 'function') return;
    onProgress(code || fallback || '');
  }

  function extractTextFromDocx(file, onProgress) {
    return loadMammoth().then(function (mammoth) {
      notifyProgress(onProgress, 'parsingDocx', '正在读取 Word 文档…');
      return file.arrayBuffer().then(function (buf) {
        return mammoth.extractRawText({ arrayBuffer: buf });
      }).then(function (result) {
        return ((result && result.value) || '').trim();
      });
    });
  }

  function extractTextFromPdf(file, onProgress) {
    return loadPdfJs().then(function (pdfjsLib) {
      notifyProgress(onProgress, 'parsingPdf', '正在读取 PDF…');
      return file.arrayBuffer().then(function (buf) {
        return pdfjsLib.getDocument({ data: buf }).promise;
      }).then(function (pdf) {
        var maxPages = Math.min(pdf.numPages || 1, 3);
        var texts = [];
        var chain = Promise.resolve();
        for (var i = 1; i <= maxPages; i++) {
          (function (pageNum) {
            chain = chain.then(function () {
              return pdf.getPage(pageNum).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  var pageText = (tc.items || [])
                    .map(function (it) { return it.str; })
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                  if (pageText) texts.push(pageText);
                });
              });
            });
          })(i);
        }
        return chain.then(function () {
          var combined = texts.join('\n\n').trim();
          if (combined.length >= 30) return combined;

          // Scanned PDF: rasterize first page then OCR
          notifyProgress(onProgress, 'parsingPdfOcr', 'PDF 无文本层，改为图片识别…');
          return pdf.getPage(1).then(function (page) {
            var viewport = page.getViewport({ scale: 2 });
            var canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            var ctx = canvas.getContext('2d');
            return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
              return new Promise(function (resolve) {
                canvas.toBlob(function (blob) {
                  if (!blob) {
                    resolve('');
                    return;
                  }
                  var imgFile = new File([blob], 'pdf-page1.png', { type: 'image/png' });
                  ocrImageFile(imgFile, onProgress).then(resolve).catch(function () { resolve(''); });
                }, 'image/png');
              });
            });
          });
        });
      });
    });
  }

  function extractTextFromUpload(file, onProgress) {
    if (!file) return Promise.resolve('');
    if (isImageFile(file)) {
      notifyProgress(onProgress, 'parsingImage', '正在识别图片文字…');
      return ocrImageFile(file, onProgress).catch(function () { return ''; });
    }
    if (isPdfFile(file)) {
      return extractTextFromPdf(file, onProgress).catch(function (err) {
        console.warn('pdf extract failed', err);
        return '';
      });
    }
    if (isDocxFile(file)) {
      return extractTextFromDocx(file, onProgress).catch(function (err) {
        console.warn('docx extract failed', err);
        return '';
      });
    }
    if (isLegacyDocFile(file)) {
      notifyProgress(onProgress, 'parsingLegacyDoc', '暂不支持旧版 .doc，请另存为 .docx / PDF / 图片后再试');
      var err = new Error('legacy_doc_unsupported');
      err.code = 'legacy_doc_unsupported';
      return Promise.reject(err);
    }
    return Promise.resolve('');
  }

  function parseFilesLocally(files, voiceText, link, onProgress) {
    files = files || [];
    var voiceResult = voiceText ? extractFieldsFromVoiceText(voiceText) : null;
    var usable = files.filter(function (f) {
      return f && f.size && (isImageFile(f) || isPdfFile(f) || isDocxFile(f) || isLegacyDocFile(f));
    });
    var onlyLegacyDoc = usable.length > 0 && usable.every(isLegacyDocFile);

    if (!usable.length) {
      notifyProgress(onProgress, 'parsingVoice', '正在匹配语音字段…');
      if (voiceResult && voiceResult.raw_excerpt) return Promise.resolve(voiceResult);
      if (link) {
        var linkOnly = extractFieldsFromVoiceText(String(link));
        return Promise.resolve(linkOnly);
      }
      return Promise.reject(new Error('empty_local_ocr'));
    }

    if (onlyLegacyDoc) {
      notifyProgress(onProgress, 'parsingLegacyDoc', '暂不支持旧版 .doc，请另存为 .docx / PDF / 图片后再试');
      var legacyErr = new Error('legacy_doc_unsupported');
      legacyErr.code = 'legacy_doc_unsupported';
      return Promise.reject(legacyErr);
    }

    notifyProgress(onProgress, 'parsingFiles', '正在识别上传文件…');

    var tasks = usable.filter(function (f) { return !isLegacyDocFile(f); }).slice(0, 3).map(function (f) {
      return extractTextFromUpload(f, onProgress).catch(function (err) {
        if (err && err.code === 'legacy_doc_unsupported') return '';
        return '';
      });
    });

    return Promise.all(tasks).then(function (texts) {
      var combined = texts.filter(Boolean).join('\n\n');
      if (link) combined = combined + '\n\n' + String(link);
      var ocrResult = combined.trim() ? extractFieldsFromOcrText(combined) : null;
      if (voiceResult && ocrResult) return mergeFieldSets(ocrResult, voiceResult);
      if (ocrResult) return ocrResult;
      if (voiceResult && voiceResult.raw_excerpt) return voiceResult;
      var emptyErr = new Error('empty_local_ocr');
      emptyErr.code = 'empty_local_ocr';
      return Promise.reject(emptyErr);
    });
  }

  function extractWaybillFromOcrText(ocrText) {
    var text = simplifySpaces(ocrText);
    var upper = text.toUpperCase();
    var carrier = '';
    var carrierKey = '';

    var brandRules = [
      { key: 'sf', re: /顺丰|SF\s*EXPRESS|\bSFEXPRESS\b/i, label: '顺丰速运' },
      { key: 'zto', re: /中通|ZTO|ZHONG\s*TONG/i, label: '中通快递' },
      { key: 'yto', re: /圆通|YTO|YUAN\s*TONG/i, label: '圆通速递' },
      { key: 'sto', re: /申通|STO|SHEN\s*TONG/i, label: '申通快递' },
      { key: 'yunda', re: /韵达|YUNDA/i, label: '韵达快递' },
      { key: 'jd', re: /京东(物流|快递)?|\bJD\b|京东速运/i, label: '京东物流' },
      { key: 'jt', re: /极兔|J&T|JT\s*EXPRESS/i, label: '极兔速递' },
      { key: 'dhl', re: /\bDHL\b/i, label: 'DHL' },
      { key: 'ups', re: /\bUPS\b/i, label: 'UPS' },
      { key: 'fedex', re: /FEDEX|联邦快递/i, label: 'FedEx' }
    ];

    for (var i = 0; i < brandRules.length; i++) {
      if (brandRules[i].re.test(text)) {
        carrierKey = brandRules[i].key;
        carrier = brandRules[i].label;
        break;
      }
    }

    var tracking = '';
    var labeled = text.match(
      /(?:运单号|快递单号|物流单号|单号|邮件号|Waybill|Tracking(?:\s*No\.?)?|Consignment)\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9\-]{7,24})/i
    );
    if (labeled) tracking = labeled[1].toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!tracking) {
      var candidates = [];
      var re = /\b([A-Z]{0,3}\d{10,18}|[A-Z]{2}\d{9,18}[A-Z]?|SF[A-Z0-9]{10,18}|JD[A-Z0-9]{8,18}|YT\d{10,16}|JT\d{10,16})\b/gi;
      var m;
      while ((m = re.exec(upper)) !== null) {
        var code = String(m[1] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 10 || code.length > 22) continue;
        // Skip FCC / phone-like numbers
        if (/^(86)?1[3-9]\d{9}$/.test(code)) continue;
        if (/^XM\d+|FCC/i.test(code)) continue;
        candidates.push(code);
      }
      if (candidates.length) {
        candidates.sort(function (a, b) {
          var score = function (c) {
            var s = c.length;
            if (/^SF/.test(c)) s += 20;
            if (/^JD/.test(c)) s += 15;
            if (/^YT|^JT|^ZT|^STO/.test(c)) s += 12;
            if (/^\d{12,15}$/.test(c)) s += 8;
            return s;
          };
          return score(b) - score(a);
        });
        tracking = candidates[0];
      }
    }

    // Infer carrier from tracking prefix when brand text missing
    if (tracking && !carrier) {
      if (/^SF/.test(tracking)) {
        carrier = '顺丰速运';
        carrierKey = 'sf';
      } else if (/^JD/.test(tracking)) {
        carrier = '京东物流';
        carrierKey = 'jd';
      } else if (/^YT/.test(tracking)) {
        carrier = '圆通速递';
        carrierKey = 'yto';
      } else if (/^JT/.test(tracking)) {
        carrier = '极兔速递';
        carrierKey = 'jt';
      }
    }

    return {
      carrier: carrier,
      carrierKey: carrierKey,
      tracking: tracking,
      raw_excerpt: text.slice(0, 400),
      source: 'waybill_ocr'
    };
  }

  function recognizeWaybillImage(file, onProgress) {
    return ocrImageFile(file, onProgress).then(function (text) {
      var parsed = extractWaybillFromOcrText(text);
      if (!parsed.tracking && !parsed.carrier) {
        var err = new Error('waybill_not_recognized');
        err.code = 'waybill_not_recognized';
        err.raw = text;
        throw err;
      }
      return parsed;
    });
  }

  global.QimaLabelParse = {
    cleanProductName: cleanProductName,
    extractSpokenProductName: extractSpokenProductName,
    extractProductName: extractProductName,
    extractFieldsFromOcrText: extractFieldsFromOcrText,
    extractFieldsFromVoiceText: extractFieldsFromVoiceText,
    canonicalizeFieldKeys: canonicalizeFieldKeys,
    mergeFieldSets: mergeFieldSets,
    extractWaybillFromOcrText: extractWaybillFromOcrText,
    recognizeWaybillImage: recognizeWaybillImage,
    parseFilesLocally: parseFilesLocally,
    loadTesseract: loadTesseract
  };
})(window);
