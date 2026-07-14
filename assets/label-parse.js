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

  function cleanModelValue(raw) {
    var s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    // Drop trailing label noise after the model token
    s = s.split(/\s{2,}|\s+[A-Z][a-z]+\s*[:：]/)[0].trim();
    var token = s.match(/([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/);
    return token ? token[1].replace(/[.,;:]+$/, '') : '';
  }

  function extractModel(text) {
    var normalized = String(text || '')
      // Common OCR: Model → ModeI / Modеl / Madel / M0del
      .replace(/\bMode[lI1]\b/gi, 'Model')
      .replace(/\bMadel\b/gi, 'Model')
      .replace(/\bM0del\b/gi, 'Model')
      .replace(/\bMODEI\b/g, 'MODEL')
      .replace(/型\s*号/g, '型号')
      .replace(/货\s*号/g, '货号');

    var patterns = [
      /Model\s*[:：#.=]?\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/i,
      /Model\s*[:：]?\s*\n\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/i,
      /型号\s*[:：#.=]?\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/,
      /货号\s*[:：#.=]?\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/,
      /Item\s*#?\s*(?:\/\s*)?model\s*#?\s*[:：#.=]?\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/i,
      /SKU\s*[:：#.=]?\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/i,
      /型\s*号\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{1,32})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = normalized.match(patterns[i]);
      if (m && m[1]) {
        var cleaned = cleanModelValue(m[1]);
        // Avoid grabbing words like "Wireless" from nearby lines
        if (cleaned && !/^(name|voltage|current|address|china|mouse|rated)$/i.test(cleaned)) {
          return cleaned;
        }
      }
    }
    return '';
  }

  function extractFieldsFromOcrText(ocrText) {
    var text = simplifySpaces(ocrText);
    var productName = pick(text, [
      /Product\s*name\s*[:：]\s*([^\n]+)/i,
      /品名\s*[:：]\s*([^\n]+)/,
      /产品名称\s*[:：]\s*([^\n]+)/
    ]);
    if (productName) {
      productName = productName.replace(/\s+/g, ' ').trim();
      // Stop before next label if OCR glued lines
      productName = productName.split(/\s+(?:Model|型号|Rated|FCC|Manufacturer)\b/i)[0].trim();
    }
    var model = extractModel(text);
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
    var regions = extractDistributionRegions(text);
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
      Carrier: '',
      'Tracking Number': '',
      'Shipping Remark': ''
    };
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

    var productName = pick(text, [
      /产品名称\s*[是为：:]\s*([^\n，。,]{2,60})/,
      /产品(?:叫|是|名为?)[：:]?\s*([^\n，。,]{2,60})/,
      /(?:要测|检测|测试)一款\s*([^\n，。,]{2,40})/,
      /一款\s*([^\n，。,]{2,40}?(?:玩具|产品|台灯|耳机|杯|车|机器人))/,
      /(?:测|做)\s*([^\n，。,]{2,40}?(?:玩具|产品))/,
      /product\s*name\s*[:=]\s*([^\n,.]{2,60})/i,
      /(?:need\s+testing\s+for|testing\s+for)\s+(?:a\s+)?([^\n,.]{2,50})/i
    ]);
    if (productName) {
      productName = productName.replace(/^(一款|这个|那个)/, '').trim();
    }

    var model = pick(text, [
      /型号\s*[是为：:]?\s*([A-Za-z0-9][\w\-./]{1,40})/,
      /货号\s*[是为：:]?\s*([A-Za-z0-9][\w\-./]{1,40})/,
      /Model\s*[:：#.=]?\s*([A-Za-z0-9][\w\-./]{1,40})/i,
      /model\s*[:=#]?\s*([A-Za-z0-9][\w\-./]{1,40})/i,
      /SKU\s*[:=#]?\s*([A-Za-z0-9][\w\-./]{1,40})/i
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
    var a = (primary && primary.fields) || primary || {};
    var b = (secondary && secondary.fields) || secondary || {};
    Object.keys(out).forEach(function (key) {
      var av = a[key] != null ? String(a[key]).trim() : '';
      var bv = b[key] != null ? String(b[key]).trim() : '';
      if (key === 'Countries/Regions of Distribution') {
        out[key] = mergeRegions([av, bv]);
        return;
      }
      if (key === 'Shipping Remark' && av && bv && av !== bv) {
        out[key] = av + '；' + bv;
        return;
      }
      out[key] = av || bv;
    });
    var summaryA = (primary && primary.product_summary) || {};
    var summaryB = (secondary && secondary.product_summary) || {};
    return {
      product_summary: {
        name: summaryA.name || out['Product Name'] || summaryB.name || '',
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

  function parseFilesLocally(files, voiceText, link, onProgress) {
    files = files || [];
    var voiceResult = voiceText ? extractFieldsFromVoiceText(voiceText) : null;
    var imageFiles = files.filter(function (f) {
      return f && f.type && f.type.indexOf('image/') === 0;
    });

    if (!imageFiles.length) {
      if (typeof onProgress === 'function') onProgress('正在匹配语音字段…');
      if (voiceResult && voiceResult.raw_excerpt) return Promise.resolve(voiceResult);
      if (link) {
        var linkOnly = extractFieldsFromVoiceText(String(link));
        return Promise.resolve(linkOnly);
      }
      return Promise.reject(new Error('empty_local_ocr'));
    }

    if (typeof onProgress === 'function') onProgress('正在识别上传图片…');

    var tasks = imageFiles.slice(0, 2).map(function (f) {
      return ocrImageFile(f, onProgress).catch(function () {
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
      return Promise.reject(new Error('empty_local_ocr'));
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
    extractFieldsFromOcrText: extractFieldsFromOcrText,
    extractFieldsFromVoiceText: extractFieldsFromVoiceText,
    extractWaybillFromOcrText: extractWaybillFromOcrText,
    recognizeWaybillImage: recognizeWaybillImage,
    mergeFieldSets: mergeFieldSets,
    parseFilesLocally: parseFilesLocally,
    loadTesseract: loadTesseract
  };
})(window);
