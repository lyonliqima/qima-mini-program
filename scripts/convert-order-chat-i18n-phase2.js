#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'order-chat.html');
let s = fs.readFileSync(filePath, 'utf8');

// botMsg string replacements
const botReplacements = [
  ["botMsg('收到，我会把这条信息作为补充说明记录下来。', false);", "botMsg(t('orderChat.supplementNote'), false);"],
  ["botMsg('已记录 ✅', false);", "botMsg(t('orderChat.recorded'), false);"],
  ["botMsg('已载入 <b>'+id+'</b> 的信息 ✅ 正在为您预填订单表单…', false);", "botMsg(tHtml('orderChat.loadedOrder', {id: id}), false);"],
  ["botMsg('已基于'+prefill.sourceType+'「<b>'+id+'</b>」预填完成。请检查以下信息，缺失或不准确的字段可以继续编辑。', false);", "botMsg(tHtml('orderChat.prefillDone', {sourceType: prefill.sourceType, id: id}), false);"],
  ["botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn primary\" onclick=\"placeOrder(this)\">'+ciIcon('cart')+' 信息正确，去下单</button><button class=\"chip-btn\" onclick=\"openFieldEditor(this)\">'+ciIcon('edit')+' 编辑字段</button><button class=\"chip-btn\" onclick=\"continueReuseMissing(this)\">'+ciIcon('plus')+' 补充缺失项</button></div></div>', true);",
   "botMsg(chipsRow(I18n.chipHtml('orderChat.chipPlaceOrder','cart','placeOrder(this)')+I18n.chipHtml('orderChat.chipEditFields','edit','openFieldEditor(this)')+I18n.chipHtml('orderChat.chipAddMissing','plus','continueReuseMissing(this)')), true);"],
  ["botMsg('当前预填信息里没有明显缺失项 ✅ 您可以直接去下单，或点击「编辑字段」微调内容。', false);", "botMsg(t('orderChat.noMissingReuse'), false);"],
  ["botMsg('历史记录里没有完整物流信息。请在下方补充本批样品的快递信息；如果暂时没有，也可以先生成订单草稿。', false);", "botMsg(t('orderChat.reuseShippingHint'), false);"],
  ["botMsg('已补充物流信息 ✅ 请再次确认订单信息。', false);", "botMsg(t('orderChat.shippingRecordedConfirm'), false);"],
  ["botMsg('已记录为稍后补充。您仍然可以先生成订单草稿，之后再完善物流信息。', false);", "botMsg(t('orderChat.fillLaterDraftHint'), false);"],
  ["botMsg('收到！这是一次<b>全新产品</b>的检测。<br>请上传任意产品相关资料，或粘贴商品链接，我来自动识别并填写表单 👇', false);", "botMsg(tHtml('orderChat.newProductMsg'), false);"],
  ["botMsg('好的，请在弹出的表单中填写完整的订单信息。', false);", "botMsg(t('orderChat.manualFormPrompt'), false);"],
  ["botMsg('已收到表单信息 ✅ 请确认以下订单信息，确认无误后即可下单。', false);", "botMsg(t('orderChat.manualFormReceived'), false);"],
  ["botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn primary\" onclick=\"placeOrder(this)\">'+ciIcon('cart')+' 信息正确，去下单</button><button class=\"chip-btn\" onclick=\"openFieldEditor(this)\">'+ciIcon('edit')+' 编辑字段</button></div></div>', true);",
   "botMsg(placeOrderChips(), true);"],
  ["botMsg('请再选择本次要参考的<b>产品检验订单参考编号</b>。', false);", "botMsg(tHtml('orderChat.selectRefPrompt'), false);"],
  ["botMsg('请选择寄送实验室，将样品寄至对应地址。', false);", "botMsg(t('orderChat.selectLabPrompt'), false);"],
  ["botMsg('请补充物流信息。您可以拍照识别快递面单，也可以手动填写。', false);", "botMsg(t('orderChat.shippingInfoPrompt'), false);"],
  ["botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn\" onclick=\"chooseShippingInput(\\'photo\\', this, \\''+flowSource+'\\')\">拍照识别面单</button><button class=\"chip-btn\" onclick=\"chooseShippingInput(\\'manual\\', this, \\''+flowSource+'\\')\">手动填写物流</button><button class=\"chip-btn\" onclick=\"chooseShippingInput(\\'skip\\', this, \\''+flowSource+'\\')\">稍后补充</button></div></div>', true);",
   "botMsg(chipsRow(I18n.chipHtml('orderChat.chipPhotoWaybill','check','chooseShippingInput(\\'photo\\', this, \\''+flowSource+'\\')')+I18n.chipHtml('orderChat.chipManualShipping','edit','chooseShippingInput(\\'manual\\', this, \\''+flowSource+'\\')')+I18n.chipHtml('orderChat.chipFillLater','refresh','chooseShippingInput(\\'skip\\', this, \\''+flowSource+'\\')')), true);"],
  ["botMsg('已记录参考编号 ✅', false);", "botMsg(t('orderChat.refRecorded'), false);"],
  ["botMsg('已记录为稍后补充 ✅', false);", "botMsg(t('orderChat.fillLaterRecorded'), false);"],
  ["botMsg('已记录物流信息 ✅', false);", "botMsg(t('orderChat.shippingRecorded'), false);"],
  ["botMsg('已记录物流信息 ✅ 请再次确认订单信息。', false);", "botMsg(t('orderChat.shippingRecordedConfirm'), false);"],
  ["botMsg('已选择供应商 ✅', false);", "botMsg(t('orderChat.supplierSelected'), false);"],
  ["botMsg('已更新供应商 ✅', false);", "botMsg(t('orderChat.supplierUpdated'), false);"],
  ["botMsg('已根据您的回答完成主要字段填写。请确认订单信息，确认无误后即可去下单。', false);", "botMsg(t('orderChat.manualDone'), false);"],
  ["botMsg('收到！'+src+'上传成功 ✅<br>我已开始识别商品信息，请稍候…', false);", "botMsg(tHtml('orderChat.uploadSuccess', {src: src}), false);"],
  ["botMsg('识别完成！已自动完成 <b>7/10（70%）</b> 字段填写 🎉<br>还有 <b>3</b> 项需要您确认，请在下方一次性补充 👇', false);", "botMsg(tHtml('orderChat.recognizeDone'), false);"],
  ["botMsg('已保存修改 ✅<br>当前必填字段已全部完成，我会以更新后的字段继续确认。', false);", "botMsg(tHtml('orderChat.savedEditComplete'), false);"],
  ["botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn primary\" onclick=\"placeOrder(this)\">'+ciIcon('cart')+' 信息正确，去下单</button><button class=\"chip-btn\" onclick=\"openFieldEditor(this)\">'+ciIcon('edit')+' 继续编辑</button></div></div>', true);",
   "botMsg(chipsRow(I18n.chipHtml('orderChat.chipPlaceOrder','cart','placeOrder(this)')+I18n.chipHtml('orderChat.chipContinueEdit','edit','openFieldEditor(this)')), true);"],
  ["botMsg('已保存修改 ✅<br>当前必填字段完成度 <b>'+completion+'%</b>，还有 <b>'+missing.length+'</b> 项需要补充 👇', false);",
   "botMsg(tHtml('orderChat.savedEditPartial', {percent: completion, count: missing.length}), false);"],
  ["botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn primary\" onclick=\"openFieldEditor(this)\">'+ciIcon('edit')+' 继续编辑</button></div></div>', true);",
   "botMsg(chipsRow(I18n.chipHtml('orderChat.chipContinueEdit','edit','openFieldEditor(this)')), true);"],
  ["botMsg('请对准快递面单拍照，尽量让运单号和快递公司完整入镜。', false);", "botMsg(t('orderChat.waybillCameraHint'), false);"],
  ["botMsg('已从面单照片中识别出快递信息 ✅', false);", "botMsg(t('orderChat.waybillRecognized'), false);"],
  ["botMsg('请确认以上订单信息是否正确。确认后我会帮您提交检测订单。', false);", "botMsg(t('orderChat.confirmOrderPrompt'), false);"],
  ["botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn primary\" onclick=\"placeOrder(this)\">'+ciIcon('cart')+' 信息正确，去下单</button><button class=\"chip-btn\" onclick=\"openFieldEditor(this)\">'+ciIcon('edit')+' 返回编辑字段</button></div></div>', true);",
   "botMsg(chipsRow(I18n.chipHtml('orderChat.chipPlaceOrder','cart','placeOrder(this)')+I18n.chipHtml('orderChat.chipBackEditFields','edit','openFieldEditor(this)')), true);"],
  ["botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn primary\" onclick=\"placeOrder(this)\">'+ciIcon('cart')+' 提交下单</button><button class=\"chip-btn\" onclick=\"openFieldEditor(this)\">'+ciIcon('edit')+' 继续修改</button></div></div>', true);",
   "botMsg(chipsRow(I18n.chipHtml('orderChat.chipSubmitOrder','cart','placeOrder(this)')+I18n.chipHtml('orderChat.chipContinueModify','edit','openFieldEditor(this)')), true);"],
];

botReplacements.forEach(([from, to]) => { s = s.split(from).join(to); });

// finishConfirm complex message
s = s.replace(
  /botMsg\('太好了！信息已'\+\(shippingComplete \? '全部补齐' : '基本补齐'\)\+'，<b>表单完成度 '\+pct\+'%<\/b> 🎉<br>'\+\(shippingComplete \? '' : '物流信息尚未填写，将先生成订单草稿，之后仍可补充。<br>'\)\+'请确认订单信息，确认无误后即可去下单。', false\);/,
  "botMsg(tHtml(shippingComplete ? 'orderChat.finishComplete' : 'orderChat.finishPartial', {pct: pct}), false);"
);

// finishConfirm chips
s = s.replace(
  /const chips = '<div class="chips" data-keep="true">'\+[\s\S]*?'<\/div>';/,
  "const chips = '<div class=\"chips\" data-keep=\"true\">'+I18n.chipHtml('orderChat.chipPlaceOrder','cart','placeOrder(this)')+I18n.chipHtml('orderChat.chipEditFields','edit','openFieldEditor(this)')+'</div>';"
);

// userMsg replacements for pickType etc
s = s.replace("userMsg('首次测试');", "userMsg(t('orderChat.firstTest'));");
s = s.replace("userMsg('补充缺失项');", "userMsg(t('orderChat.chipAddMissing'));");
s = s.replace("userMsg('暂无资料，直接填写');", "userMsg(t('orderChat.noDataFill'));");
s = s.replace("userMsg('确认订单信息');", "userMsg(t('orderChat.confirmOrderInfo'));");
s = s.replace("userMsg('已补充缺失信息');", "userMsg(t('orderChat.userMissingFilled'));");
s = s.replace("userMsg('已编辑识别字段');", "userMsg(t('orderChat.editedFields'));");
s = s.replace("userMsg('已填写报告额外字段');", "userMsg(t('orderChat.userReportFieldsFilled'));");
s = s.replace("userMsg('补充商品信息');", "userMsg(t('orderChat.userSupplementProduct'));");
s = s.replace("userMsg('拍照识别面单');", "userMsg(t('orderChat.chipPhotoWaybill'));");
s = s.replace("userMsg('稍后补充');", "userMsg(t('orderChat.chipFillLater'));");
s = s.replace("userMsg('手动填写物流');", "userMsg(t('orderChat.chipManualShipping'));");

// pickCopyOrder label
s = s.replace("startReuseOrder(id, '复制订单');", "startReuseOrder(id, t('orderChat.copyOrder'));");

// startReuseOrder default label
s = s.replace("const label = actionLabel || '复用';", "const label = actionLabel || t('orderChat.reuse');");

// runRecognize src
s = s.replace("runRecognize('图片/文档和商品链接');", "runRecognize(t('orderChat.recognizeSourceBoth'));");
s = s.replace("runRecognize('图片/文档');", "runRecognize(t('orderChat.recognizeSourceDoc'));");
s = s.replace("runRecognize('商品链接');", "runRecognize(t('orderChat.recognizeSourceLink'));");

// uploaded files
s = s.replace("'已上传'", "t('common.uploaded')");
s = s.replace(/return '<div class="thumbs">'\+\s*icons\+'<span style="margin-left:4px">已上传 '\+uploadedFileList\.length\+' 个文件<\/span><\/div>';/,
  "return '<div class=\"thumbs\">'+icons+'<span style=\"margin-left:4px\">'+t('orderChat.uploadedCount', {count: uploadedFileList.length})+'</span></div>';");

// history empty
s = s.replace("'<div class=\"history-empty\">没有匹配的历史记录</div>'", "'<div class=\"history-empty\">'+t('orderChat.noHistoryMatch')+'</div>'");

// field() helper
s = s.replace(
  /function field\(k, v, ok, optional\)\{[\s\S]*?return '<div class="field" data-field="'\+k\+'"'+opt\+'><div class="fk">'\+\s*label\+'<\/div><div class="fv miss">待确认<\/div><div class="badge-miss">缺失<\/div><\/div>';\s*\}/,
  `function field(k, v, ok, optional){
      const label = fieldLabel(k);
      const opt = optional ? ' data-optional="true"' : '';
      const pending = t('orderChat.fieldPending');
      const missing = t('orderChat.fieldMissing');
      if(ok) return '<div class="field" data-field="'+k+'"'+opt+'><div class="fk">'+label+'</div><div class="fv">'+escapeHtml(v)+'</div><div class="badge-ok">✓</div></div>';
      if(optional) return '<div class="field" data-field="'+k+'"'+opt+'><div class="fk">'+label+'</div><div class="fv">—</div></div>';
      return '<div class="field" data-field="'+k+'"'+opt+'><div class="fk">'+label+'</div><div class="fv miss">'+pending+'</div><div class="badge-miss">'+missing+'</div></div>';
    }`
);

// Remove old fieldLabel if still present
s = s.replace(
  /function fieldLabel\(key\)\{\s*const labels = \{[\s\S]*?\};\s*return labels\[key\] \|\| key;\s*\}\s*/,
  ''
);

// extractCard
s = s.replace(
  /function extractCard\(\)\{[\s\S]*?'<button class="edit-fields" onclick="openFieldEditor\(\)"><span>有错误？<\/span>去编辑<\/button>'\+[\s\S]*?'\<\/div>';\s*\}/,
  `function extractCard(){
      return '<div class="panel">'+
        '<div class="extract-head"><div class="eh-title">'+t('orderChat.extractTitle')+'</div><div class="progress-pill">'+t('orderChat.progress70')+'</div></div>'+
        '<div class="fields">'+
          field('Product Name', t('orderChat.productRobotToy'), true)+
          field('Program', t('orderChat.projectTemuHardwareRefund'), true)+
          field('Country of Origin', t('orderChat.originAland'), true)+
          field('Countries/Regions of Distribution', t('orderChat.distributionPresetEn'), true)+
          field('Item#/model#', 'RBT-2025-X9', true)+
          field('Manufacturer', t('orderChat.manufacturerDemo'), true)+
          field('Manufacturer Address', t('orderChat.manufacturerAddrDemo'), true)+
          field('Sample Collection Method','', false)+
          field('Carrier','', false)+
          field('Tracking Number','', false)+
          field('Shipping Remark','', false, true)+
        '</div>'+
        '<button class="edit-fields" onclick="openFieldEditor()"><span>'+t('orderChat.hasError')+'</span>'+t('orderChat.goEdit')+'</button>'+
      '</div>';
    }`
);

// runRecognize product panel
s = s.replace(
  /botMsg\('<div class="panel panel-pad"><div class="prod"><div class="pimg">🤖<\/div>'\+[\s\S]*?'<div class="pmeta">品牌：未知 ｜ 类别：玩具 Toys<\/div><\/div><\/div><\/div>', true\);/,
  "botMsg('<div class=\"panel panel-pad\"><div class=\"prod\"><div class=\"pimg\">🤖</div>'+\n            '<div><div class=\"ptag\">'+t('orderChat.suspectedProduct')+'</div><div class=\"pname\">'+t('orderChat.productRobotToy')+'</div>'+\n            '<div class=\"pmeta\">'+t('orderChat.brandUnknown')+'</div></div></div></div>', true);"
);

// editableSections - convert to function
s = s.replace(
  /const editableSections = \[[\s\S]*?\];\s*/,
  `function getEditableSections(){
      return [
        {
          title: t('orderChat.basicInfo'),
          fields: [
            { name:'Product Name', fallback: t('orderChat.productRobotToy') },
            { name:'Program', fallback: t('orderChat.projectTemuHardwareRefund'), type:'select', options: getProgramOptions() },
            { name:'Country of Origin', fallback: t('orderChat.originAland'), type:'select', options: getOriginOptions() },
            { name:'Countries/Regions of Distribution', fallback: t('orderChat.distributionPresetEn'), type:'multi-country' },
            { name:'Item#/model#', fallback: 'RBT-2025-X9' },
            { name:'Manufacturer', fallback: t('orderChat.manufacturerDemo') },
            { name:'Manufacturer Address', fallback: t('orderChat.manufacturerAddrDemo') }
          ]
        },
        {
          title: t('orderChat.sampleCollection'),
          fields: [
            { name:'Sample Collection Method', fallback:'', type:'select', options:['', sampleMethodShip(), sampleMethodCollect(), sampleMethodReceived()] },
            { name:'Carrier', fallback:'', type:'select', options:[''].concat(getCarriers()) },
            { name:'Tracking Number', fallback:'' },
            { name:'Shipping Remark', fallback:'' }
          ]
        }
      ];
    }
    `
);

s = s.replace('editableSections.map', 'getEditableSections().map');

// DISTRIBUTION
s = s.replace(
  /const DISTRIBUTION_PRESETS = \[[^\]]+\];\s*const DISTRIBUTION_SEARCH_LIST = \[[^\]]+\];\s*const DISTRIBUTION_EN_TO_CN = \{[\s\S]*?\};\s*/,
  `function getDistributionPresets(){ return I18n.getDistributionPresets(); }
    function getDistributionSearchList(){ return I18n.getDistributionSearchList(); }
    `
);

s = s.replace('DISTRIBUTION_EN_TO_CN[part] || part', 'I18n.displayCountry(part) || part');
s = s.replace('DISTRIBUTION_SEARCH_LIST', 'getDistributionSearchList()');
s = s.replace('DISTRIBUTION_PRESETS', 'getDistributionPresets()');

// syncEditCountrySummary
s = s.replace("summary.textContent = '请选择至少一个国家或地区';", "summary.textContent = t('common.selectAtLeastOneCountry');");
s = s.replace(/summary\.textContent = '已选 ' \+ items\.length \+ ' 项：' \+ items\.join\('、'\);/,
  "summary.textContent = t('common.selectedCount', {count: items.length, list: items.map(function(c){ return I18n.displayCountry(c); }).join(t('orderChat.listSep'))});");
s = s.replace(/const summaryText = selected\.size \? '已选 ' \+ selected\.size \+ ' 项：' \+ \[\.\.\.selected\]\.join\('、'\) : '请选择至少一个国家或地区';/,
  "const summaryText = selected.size ? t('common.selectedCount', {count: selected.size, list: [...selected].map(function(c){ return I18n.displayCountry(c); }).join(t('orderChat.listSep'))}) : t('common.selectAtLeastOneCountry');");

// renderEditCountryResults add country
s = s.replace(
  /results\.innerHTML = '<button class="edit-country-option" type="button" data-country="'\+escapeHtml\(raw\)\+'" onmousedown="addEditCountryOption\(this\)">添加「'\+\s*escapeHtml\(raw\)\+'」<\/button>';/,
  "results.innerHTML = '<button class=\"edit-country-option\" type=\"button\" data-country=\"'+escapeHtml(raw)+'\" onmousedown=\"addEditCountryOption(this)\">'+t('common.addCountry', {value: escapeHtml(raw)})+'</button>';"
);

// renderEditField placeholders
s = s.replace("const label = opt || '请选择';", "const label = opt || t('common.selectPlaceholder');");
s = s.replace("placeholder=\"搜索其他国家\"", "placeholder=\"'+t('common.searchOtherCountry')+'\"");
s = s.replace("placeholder=\"'+(field.addPlaceholder || '输入新选项')+'\"", "placeholder=\"'+(field.addPlaceholder || t('orderChat.inputNewOption'))+'\"");
s = s.replace("onclick=\"addEditSelectOption(this)\">添加</button>", "onclick=\"addEditSelectOption(this)\">'+t('orderChat.addOption')+'</button>");
s = s.replace('placeholder="请输入\'+fieldLabel(field.name)+\'">', "placeholder=\"'+t('orderChat.fieldInputPlaceholder', {field: fieldLabel(field.name)})+'\">");
s = s.replace("title=\"选择产品拟销售的国家或地区\"", "title=\"'+t('orderDetail.countryInfoTip')+'\"");

// saveFieldEditor pending values
s = s.replace("valueNode.textContent = '待确认';", "valueNode.textContent = t('orderChat.fieldPending');");
s = s.replace("statusNode.textContent = '缺失';", "statusNode.textContent = t('orderChat.fieldMissing');");

// getFieldDisplayValue
s = s.replace("return value && value !== '待确认' ? value : '';", "return value && value !== t('orderChat.fieldPending') ? value : '';");

// pendingRequiredFieldsCard
s = s.replace(
  /function pendingRequiredFieldsCard\(\)\{[\s\S]*?'<button class="edit-fields" onclick="openFieldEditor\(\)"><span>继续补充<\/span>去编辑<\/button>'\+[\s\S]*?'\<\/div>';\s*\}/,
  `function pendingRequiredFieldsCard(){
      const missing = getMissingRequiredFields();
      if(!missing.length) return '';
      return '<div class="panel">'+
        '<div class="extract-head"><div class="eh-title">'+t('orderChat.pendingRequiredTitle')+'</div><div class="progress-pill">'+t('orderChat.pendingCount', {count: missing.length})+'</div></div>'+
        '<div class="fields">'+missing.map(name => field(name, '', false)).join('')+'</div>'+
        '<button class="edit-fields" onclick="openFieldEditor()"><span>'+t('orderChat.continueFill')+'</span>'+t('orderChat.goEdit')+'</button>'+
      '</div>';
    }`
);

// reuseOrderCard
s = s.replace(
  /function reuseOrderCard\(id, prefill\)\{[\s\S]*?'<button class="edit-fields" onclick="openFieldEditor\(\)"><span>需要调整？<\/span>去编辑<\/button>'\+[\s\S]*?'\<\/div>';\s*\}/,
  `function reuseOrderCard(id, prefill){
      const fields = prefill.fields;
      const collectMethod = fields['Sample Collection Method'];
      return '<div class="panel">'+
        '<div class="extract-head"><div class="eh-title">'+t('orderChat.prefillCardTitle')+'</div><div class="progress-pill">'+t('orderChat.fromSource', {source: prefill.sourceType})+'</div></div>'+
        '<div class="fields">'+
          field('Source ID', id, true)+
          field('Service', prefill.sourceDesc, true)+
          field('Product Name', fields['Product Name'], !!fields['Product Name'])+
          field('Program', fields['Program'], !!fields['Program'])+
          field('Country of Origin', fields['Country of Origin'], !!fields['Country of Origin'])+
          field('Countries/Regions of Distribution', fields['Countries/Regions of Distribution'], !!fields['Countries/Regions of Distribution'])+
          field('Item#/model#', fields['Item#/model#'], !!fields['Item#/model#'])+
          field('Manufacturer', fields['Manufacturer'], !!fields['Manufacturer'])+
          field('Manufacturer Address', fields['Manufacturer Address'], !!fields['Manufacturer Address'])+
          field('Sample Collection Method', collectMethod, !!collectMethod)+
          (isSampleCollect(collectMethod) ? '' :
            field('Carrier', fields['Carrier'], !!fields['Carrier'])+
            field('Tracking Number', fields['Tracking Number'], !!fields['Tracking Number'])+
            field('Shipping Remark', fields['Shipping Remark'], !!fields['Shipping Remark'], true)
          )+
        '</div><button class="edit-fields" onclick="openFieldEditor()"><span>'+t('orderChat.needAdjust')+'</span>'+t('orderChat.goEdit')+'</button>'+
      '</div>';
    }`
);

// mfConfirmCard, manualOrderCard, orderSummaryCard titles
s = s.replace(/'<div class="extract-head"><div class="eh-title">订单信息确认<\/div><div class="progress-pill">待提交<\/div><\/div>'\+/g,
  "'<div class=\"extract-head\"><div class=\"eh-title\">'+t('orderChat.confirmCardTitle')+'</div><div class=\"progress-pill\">'+t('orderChat.pendingSubmit')+'</div></div>'+");

s = s.replace("'<span>需要修改？</span>编辑</button>'", "'<span>'+t('orderChat.chipNeedModify')+'</span>'+t('orderChat.chipEdit')+'</button>'");
s = s.replace("'<span>有错误？</span>去编辑</button>'", "'<span>'+t('orderChat.hasError')+'</span>'+t('orderChat.goEdit')+'</button>'");

// mfConfirmCard - use English field keys
s = s.replace(
  /function mfConfirmCard\([\s\S]*?'\<\/div>';\s*\}/,
  `function mfConfirmCard(pn, prog, origin, countries, sku, electricLabel, electricVal, electricDescription, mfr, mfrAddr, sampleLabel, sampleVal, lab, carrier, tracking, remark){
      return '<div class="panel">'+
        '<div class="extract-head"><div class="eh-title">'+t('orderChat.confirmCardTitle')+'</div><div class="progress-pill">'+t('orderChat.pendingSubmit')+'</div></div>'+
        '<div class="fields">'+
          field('Product Name', pn, !!pn)+
          field('Program', prog, !!prog)+
          field('Country of Origin', origin, !!origin)+
          field('Countries/Regions of Distribution', countries.map(function(c){ return I18n.displayCountry(c); }).join(t('orderChat.listSep')), countries.length > 0)+
          field('Item#/model#', sku, !!sku)+
          field('Product Name', electricLabel, !!electricLabel)+
          (electricVal === 'electric' ? field('Product Name', electricDescription, !!electricDescription) : '')+
          field('Manufacturer', mfr, !!mfr)+
          field('Manufacturer Address', mfrAddr, !!mfrAddr)+
          field('Sample Collection Method', sampleLabel, !!sampleLabel)+
          (sampleVal === 'collect' ? field('Product Name', document.getElementById('mf_refNumber').value || '', !!document.getElementById('mf_refNumber').value) : '')+
          (sampleVal === 'ship' && lab ? field('Product Name', lab, true) : '')+
          (sampleVal !== 'collect' ?
            field('Carrier', carrier, !!carrier)+
            field('Tracking Number', tracking, !!tracking)+
            field('Shipping Remark', remark, !!remark)
          : '')+
        '</div>'+
        '<button class="edit-fields" onclick="openFieldEditor()"><span>'+t('orderChat.chipNeedModify')+'</span>'+t('orderChat.chipEdit')+'</button>'+
      '</div>';
    }`
);

// Fix mfConfirmCard - I made errors with field keys. Let me fix in a separate pass.

// manualQuestions -> function
s = s.replace(
  /const manualQuestions = \[[\s\S]*?\];\s*let manualIndex/,
  `function getManualQuestions(){
      return [
        { key:'Product Name', q: tHtml('orderChat.manualQProductName'), options:[t('orderChat.productRobotToy'), t('orderChat.productBlockToy'), t('orderChat.productBlackFabric')] },
        { key:'Program', q: tHtml('orderChat.manualQProgram'), options: getProgramOptions(), control:'select', selectTitle: t('orderChat.selectProgramTitle'), selectDesc: t('orderChat.selectProgramDesc') },
        { key:'Country of Origin', q: tHtml('orderChat.manualQOrigin'), options: getOriginOptions(), control:'select', selectTitle: t('orderChat.selectOriginTitle'), selectDesc: t('orderChat.selectOriginDesc') },
        { key:'Countries/Regions of Distribution', q: tHtml('orderChat.manualQDistribution'), options:[t('orderChat.distributionPresetEn'), t('orderChat.distributionPresetAuCa'), t('orderChat.distributionPresetZa'), t('orderChat.distributionPresetAll')] },
        { key:'Item#/model#', q: tHtml('orderChat.manualQItemModel'), options:['RBT-2025-X9','SKU-TOY-001', t('orderChat.uncertain')] },
        { key:'Manufacturer', q: tHtml('orderChat.manualQManufacturer'), options:[t('orderChat.manufacturerDemo'), t('orderChat.supplierAsManufacturer'), t('orderChat.uncertain')] },
        { key:'Manufacturer Address', q: tHtml('orderChat.manualQManufacturerAddress'), options:[t('orderChat.manufacturerAddrDemo'), t('orderChat.manufacturerAddrDemo2'), t('orderChat.uncertain')] },
        { key:'Sample Collection', q: tHtml('orderChat.manualQSample'), options:[sampleMethodShip(), sampleMethodCollect(), sampleMethodReceived()] }
      ];
    }
    let manualIndex`
);

s = s.replace('manualQuestions.length', 'getManualQuestions().length');
s = s.replace('manualQuestions[manualIndex]', 'getManualQuestions()[manualIndex]');
s = s.replace('const item = manualQuestions[manualIndex];', 'const item = getManualQuestions()[manualIndex];');

// selectFieldCard
s = s.replace(
  /'<div class="select-card-title">'\+ \(item\.selectTitle \|\| item\.key \|\| '请选择'\)\+'<\/div>'\+[\s\S]*?'<div class="select-card-desc">'\+ \(item\.selectDesc \|\| '请从下拉框中选择一个选项，然后点击确定。'\)\+'<\/div>'\+/,
  "'<div class=\"select-card-title\">'+(item.selectTitle || item.key || t('common.select'))+'</div>'+\n        '<div class=\"select-card-desc\">'+(item.selectDesc || t('orderChat.selectCardDefaultDesc'))+'</div>'+"
);
s = s.replace("onclick=\"confirmSelectField(this,'\"+source+\"','\"+escapeJs(item.key || '')+\"')\">确定</button>", "onclick=\"confirmSelectField(this,'\"+source+\"','\"+escapeJs(item.key || '')+\"')\">'+t('orderChat.selectCardConfirm')+'</button>");

// distributionCard
s = s.replace(
  /function distributionCard\(\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function distributionCard(){
      const options = getDistributionPresets();
      return '<div class="select-card distribution-card">'+
        '<div class="select-card-title">'+t('orderChat.distributionTitle')+'</div>'+
        '<div class="select-card-desc">'+t('orderChat.distributionDesc')+'</div>'+
        '<div class="distribution-options">'+
          options.map(function(option, i){ return distributionOption(option, i < 2); }).join('')+
        '</div>'+
        '<div class="distribution-add">'+
          '<input class="distribution-input" type="text" placeholder="'+t('orderChat.distributionAddPlaceholder')+'">'+
          '<button type="button" onclick="addDistributionOption(this)">'+t('orderChat.distributionAdd')+'</button>'+
        '</div>'+
        '<button class="select-confirm" type="button" onclick="confirmDistributionSelection(this)">'+t('orderChat.selectCardConfirm')+'</button>'+
      '</div>';
    }`
);

s = s.replace("userMsg(escapeHtml(value || '暂不确定'));", "userMsg(escapeHtml(value || t('orderChat.uncertain')));");
s = s.replace("manualAnswers['Countries/Regions of Distribution'] = value || '暂不确定';", "manualAnswers['Countries/Regions of Distribution'] = value || t('orderChat.uncertain');");

// sampleCollectionCard
s = s.replace(
  /function sampleCollectionCard\(source\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function sampleCollectionCard(source){
      const cardSource = source || 'manual';
      return '<div class="select-card">'+
        '<div class="select-card-title">'+t('orderChat.sampleCollectionTitle')+'</div>'+
        '<div class="select-card-desc">'+t('orderChat.sampleCollectionDesc')+'</div>'+
        '<div class="shipping-methods">'+
          shippingMethodButton('ship', sampleMethodShip(), t('orderChat.sampleShipDesc'), cardSource)+
          shippingMethodButton('collect', sampleMethodCollect(), t('orderChat.sampleCollectDesc'), cardSource)+
          shippingMethodButton('received', sampleMethodReceived(), t('orderChat.sampleReceivedDesc'), cardSource)+
        '</div>'+
      '</div>';
    }`
);

// labs
s = s.replace(
  /const labs = \[[\s\S]*?\];\s*/,
  `function getLabs(){
      return I18n.getTestingLabs().map(function(lab, i){
        return { name: lab.label, address: lab.address, icon: ['🔬','🧪','🧫'][i] || '🔬', key: lab.key };
      });
    }
    `
);

s = s.replace('labs.map', 'getLabs().map');
s = s.replace('supplierOptions.find', 'getSupplierOptions().find');
s = s.replace('supplierOptions.filter', 'getSupplierOptions().filter');
s = s.replace('selectedSupplier = supplierOptions.find', 'selectedSupplier = getSupplierOptions().find');
s = s.replace('selectSupplier(index, name){\n      selectedSupplier = supplierOptions.find', 'selectSupplier(index, name){\n      selectedSupplier = getSupplierOptions().find');

s = s.replace(
  /const supplierOptions = \[[\s\S]*?\];\s*let supplierPickerSource/,
  `function getSupplierOptions(){
      return [
        { name:'Shenzhen Zhichuang Co., Ltd.', address: t('orderChat.manufacturerAddrDemo'), contact:'Sally Xu' },
        { name:'Qiming Toy Supplier Co., Ltd.', address: t('orderChat.manufacturerAddrDemo2'), contact:'David Chen' },
        { name:'QIMA Toy Supplier', address:'Dongguan, Guangdong, China', contact:'Amy Li' },
        { name: t('orderDetail.sameAsManufacturer'), address: t('orderDetail.sameAsManufacturerAddr'), contact:'-' }
      ];
    }
    let supplierPickerSource`
);

// labSelectionCard
s = s.replace(
  /function labSelectionCard\(source\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function labSelectionCard(source){
      const cardSource = source || 'manual';
      return '<div class="select-card">'+
        '<div class="select-card-title">'+t('lab.selectLab')+'</div>'+
        '<div class="select-card-desc">'+t('lab.selectLabDesc')+'</div>'+
        '<div class="shipping-methods">'+
          getLabs().map(function(lab){ return labOptionButton(lab, cardSource); }).join('')+
        '</div>'+
      '</div>';
    }`
);

// readonly renders
s = s.replace(/'<div class="select-card-title">选择寄送实验室<\/div>'\+/g, "'<div class=\"select-card-title\">'+t('lab.selectLab')+'</div>'+");
s = s.replace(/'<div class="readonly-choice-label">已选择<\/div>'\+/g, "'<div class=\"readonly-choice-label\">'+t('orderChat.selected')+'</div>'+");
s = s.replace(/'<div class="select-card-title">样品收集方式<\/div>'\+/g, "'<div class=\"select-card-title\">'+t('orderChat.sampleCollectionTitle')+'</div>'+");
s = s.replace(/'<div class="select-card-title">产品检验订单参考编号<\/div>'\+/g, "'<div class=\"select-card-title\">'+t('orderChat.refNumberTitle')+'</div>'+");

// refNumberCard
s = s.replace(
  /function refNumberCard\(source\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function refNumberCard(source){
      const cardSource = source || 'manual';
      return '<div class="select-card ref-card">'+
        '<div class="select-card-title">'+t('orderChat.refNumberTitle')+'</div>'+
        '<div class="select-card-desc">'+t('orderChat.refNumberDesc')+'</div>'+
        '<div class="history-list">'+
          refNumberItem('T-25617004', t('orderChat.historyDescLtToys'), cardSource)+
          refNumberItem('T-25590011', t('orderChat.historyDescEn71'), cardSource)+
          refNumberItem('Q202349103', t('orderChat.historyDescLtPsi'), cardSource)+
        '</div>'+
      '</div>';
    }`
);

// shippingManualForm
s = s.replace(
  /function shippingManualForm\(source\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function shippingManualForm(source){
      shippingFormSource = source || 'manual';
      const carrierOpts = getCarriers().map(function(c){ return '<option>'+escapeHtml(c)+'</option>'; }).join('');
      return '<div class="select-card">'+
        '<div class="select-card-title">'+t('orderChat.shippingFormTitle')+'</div>'+
        '<div class="select-card-desc">'+t('orderChat.shippingFormDesc')+'</div>'+
        '<div class="shipping-form">'+
          '<div><label class="shipping-label">'+t('orderChat.shippingCarrier')+'</label><select class="select-control" id="manualCarrier"><option value="">'+t('common.selectPlaceholder')+'</option>'+carrierOpts+'</select></div>'+
          '<div><label class="shipping-label">'+t('carrier.trackingSearch')+'</label><input class="select-control" id="manualTrackingNo" placeholder="'+t('carrier.trackingSearchPlaceholder')+'"></div>'+
          '<div><label class="shipping-label">'+t('index.shippingRemark')+'</label><textarea class="shipping-textarea" id="manualShippingRemark" maxlength="3600" placeholder="'+t('index.shippingRemarkPlaceholder')+'"></textarea></div>'+
          '<button class="select-confirm" type="button" onclick="confirmManualShipping()">'+t('orderChat.selectCardConfirm')+'</button>'+
        '</div>'+
      '</div>';
    }`
);

s = s.replace("(carrier || '未选择承运商')", "(carrier || t('carrier.noCarrierSelected'))");

// waybill card
s = s.replace(
  /botMsg\('<div class="waybill-card"><div class="waybill-photo"><\/div><div class="waybill-row"><span>Carrier<\/span><span>'\+carrier\+'<\/span><\/div><div class="waybill-row"><span>Tracking Number<\/span><span>'\+tracking\+'<\/span><\/div><\/div>', true\);/,
  "botMsg('<div class=\"waybill-card\"><div class=\"waybill-photo\"></div><div class=\"waybill-row\"><span>'+t('carrier.label')+'</span><span>'+escapeHtml(carrier)+'</span></div><div class=\"waybill-row\"><span>'+t('carrier.trackingNo')+'</span><span>'+escapeHtml(tracking)+'</span></div></div>', true);"
);

// missingFieldsCard - large replace
s = s.replace(
  /function missingFieldsCard\(\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function missingFieldsCard(){
      const carrierOpts = getCarriers().map(function(c, i){ return '<option'+(i===0?' selected':'')+'>'+escapeHtml(c)+'</option>'; }).join('');
      const labOpts = getLabs().map(function(lab, i){ return '<option'+(i===0?' selected':'')+'>'+escapeHtml(lab.name)+' · '+escapeHtml(lab.address)+'</option>'; }).join('');
      return '<div class="panel missing-card">'+
        '<div class="missing-title">'+t('orderChat.missingTitle')+'</div>'+
        '<div class="missing-desc">'+t('orderChat.missingDesc')+'</div>'+
        '<div class="missing-form">'+
          '<div class="missing-group">'+
            '<div class="missing-label">'+t('orderChat.sampleMethodLabel')+' <span class="req">*</span></div>'+
            missingRadio('ship', sampleMethodShip(), true)+
            missingRadio('collect', sampleMethodCollect(), false)+
            missingRadio('received', sampleMethodReceived(), false)+
          '</div>'+
          '<div class="missing-subsection" data-section="ref">'+
            '<div class="missing-group">'+
              '<div class="missing-label">'+t('index.inspectionRef')+' <span class="req">*</span></div>'+
              '<select class="missing-select" id="missingRefNumber"><option value="">'+t('orderChat.refNumberPlaceholder')+'</option><option>T-25617004 · '+t('common.serviceLabTestDot')+'</option><option>T-25590011 · EN71 · Toys</option><option>Q202349103 · '+t('orderChat.historyDescLtPsiShort')+'</option></select>'+
              '<div class="missing-hint">'+t('orderChat.missingRefHint')+'</div>'+
            '</div>'+
          '</div>'+
          '<div class="missing-subsection show" data-section="lab">'+
            '<div class="missing-group">'+
              '<div class="missing-label">'+t('lab.sendToLab')+' <span class="req">*</span></div>'+
              '<select class="missing-select" id="missingLab"><option value="">'+t('orderChat.missingSelectLab')+'</option>'+labOpts+'</select>'+
            '</div>'+
          '</div>'+
          '<div class="missing-subsection show" data-section="shipping">'+
            '<button class="waybill-scan-btn" type="button" onclick="scanWaybillIntoMissingCard(this)">'+t('orderChat.chipPhotoWaybill')+'</button>'+
            '<div class="missing-row">'+
              '<div class="missing-group">'+
                '<div class="missing-label">'+t('carrier.label')+'</div>'+
                '<select class="missing-select" id="missingCarrier"><option value="">'+t('common.selectPlaceholder')+'</option>'+carrierOpts+'</select>'+
              '</div>'+
              '<div class="missing-group">'+
                '<div class="missing-label">'+t('carrier.trackingNo')+'</div>'+
                '<input class="missing-input" id="missingTracking" value="SF1234567890123" placeholder="SF1234567890123">'+
              '</div>'+
            '</div>'+
            '<div class="missing-group">'+
              '<div class="missing-label">'+t('index.shippingRemark')+'</div>'+
              '<textarea class="missing-textarea" id="missingRemark" placeholder="'+t('orderChat.missingRemarkPlaceholder')+'"></textarea>'+
            '</div>'+
          '</div>'+
          '<div class="missing-group">'+
            '<div class="missing-label">'+t('index.reportFieldsNeed')+' <span class="req">*</span></div>'+
            missingReportRadio(t('common.yes'), false)+
            missingReportRadio(t('common.no'), true)+
          '</div>'+
          '<div class="missing-subsection" data-section="report-fields-detail">'+
            '<div class="missing-group">'+
              '<div class="missing-label">'+t('index.reportFieldsDetail')+' <span class="req">*</span></div>'+
              '<textarea class="missing-textarea" id="missingReportFieldsDetail" placeholder="'+t('index.reportFieldsDetailPlaceholder')+'"></textarea>'+
            '</div>'+
          '</div>'+
          '<div class="missing-error" id="missingFormError">'+t('orderChat.missingError')+'</div>'+
          '<button class="missing-submit" type="button" onclick="submitMissingFields(this)">'+t('orderChat.confirmUpdateFields')+'</button>'+
        '</div>'+
      '</div>';
    }`
);

// missing report radio toggle
s = s.replace("const isYes = input.value === '是' && input.checked;", "const isYes = input.value === t('common.yes') && input.checked;");

// scanWaybillIntoMissingCard
s = s.replace("btn.textContent = '识别中...';", "btn.textContent = t('carrier.scanning');");
s = s.replace("btn.textContent = '已识别面单';", "btn.textContent = t('carrier.scanned');");
s = s.replace("card.querySelector('#missingCarrier').value = '顺丰速运';", "card.querySelector('#missingCarrier').value = t('carrier.sf');");

// submitMissingFields errors
s = s.replace("error.textContent = '请选择产品检验订单参考编号。';", "error.textContent = t('orderChat.missingErrorRef');");
s = s.replace("error.textContent = '请选择寄送实验室。';", "error.textContent = t('orderChat.missingErrorLab');");
s = s.replace("error.textContent = '请补充快递公司和运单号。';", "error.textContent = t('orderChat.missingErrorShipping');");
s = s.replace("error.textContent = '请填写需要增加展示在报告上的字段。';", "error.textContent = t('orderChat.missingErrorReport');");
s = s.replace("const reportFields = ((card.querySelector('input[name=\"missingReportFields\"]:checked') || {}).value || '否').trim();", "const reportFields = ((card.querySelector('input[name=\"missingReportFields\"]:checked') || {}).value || t('common.no')).trim();");
s = s.replace("if(reportFields === '是' && !reportFieldsDetail){", "if(reportFields === t('common.yes') && !reportFieldsDetail){");
s = s.replace("manualAnswers['报告额外字段'] = reportFields === '是' ? reportFieldsDetail : '';", "manualAnswers['报告额外字段'] = reportFields === t('common.yes') ? reportFieldsDetail : '';");

// finishConfirm sample method check
s = s.replace(
  "const needShipping = collectionMethod !== '启迈 QIMA 将在执行产品服务时收集样本';",
  "const needShipping = !isSampleCollect(collectionMethod);"
);

// missingQueue
s = s.replace(
  /const missingQueue = \[[\s\S]*?\];\s*let mi/,
  `const missingQueue = [
      { key:'Sample Collection', q: tHtml('orderChat.manualQSample') }
    ];
    let mi`
);

// answerMissing waybill checks - use t keys
s = s.replace("if(val === '打开相机拍照识别面单'){", "if(val === t('orderChat.openCameraWaybill')){");

// REPORT_FIELDS
s = s.replace("const REPORT_FIELDS_QUESTION = '是否需要增加更多字段展示在报告上？';", "function reportFieldsQuestion(){ return t('index.reportFieldsNeed'); }");
s = s.replace('botMsg(REPORT_FIELDS_QUESTION, false);', 'botMsg(reportFieldsQuestion(), false);');
s = s.replace(
  "botMsg('<div style=\"width:268px\"><div class=\"chips\"><button class=\"chip-btn primary\" onclick=\"selectReportFieldsNeed(\\'是\\', this)\">是</button><button class=\"chip-btn\" onclick=\"selectReportFieldsNeed(\\'否\\', this)\">否</button></div></div>', true);",
  "botMsg(chipsRow('<button class=\"chip-btn primary\" onclick=\"selectReportFieldsNeed(\\''+escapeJs(t('common.yes'))+'\\', this)\">'+t('common.yes')+'</button><button class=\"chip-btn\" onclick=\"selectReportFieldsNeed(\\''+escapeJs(t('common.no'))+'\\', this)\">'+t('common.no')+'</button>'), true);"
);
s = s.replace("if(answer === '否'){", "if(answer === t('common.no')){");
s = s.replace("manualAnswers['是否需要增加更多字段展示在报告上'] = '否';", "manualAnswers['是否需要增加更多字段展示在报告上'] = t('common.no');");

// reportFieldsDetailCard
s = s.replace(
  /function reportFieldsDetailCard\(\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function reportFieldsDetailCard(){
      return '<div class="select-card">'+
        '<div class="select-card-title">'+t('index.reportFieldsDetail')+'</div>'+
        '<div class="select-card-desc">'+t('index.reportFieldsDetailPlaceholder')+'</div>'+
        '<textarea class="missing-textarea" id="chatReportFieldsDetail" placeholder="'+t('index.reportFieldsDetailPlaceholder')+'" style="width:100%;min-height:88px;margin-top:8px;box-sizing:border-box;"></textarea>'+
        '<button class="missing-submit" type="button" onclick="submitReportFieldsDetail(this)">'+t('common.confirm')+'</button>'+
      '</div>';
    }`
);

s = s.replace("alert('请填写需要增加展示在报告上的字段。');", "alert(t('orderChat.missingErrorReport'));");

// orderSummaryCard pending values
s = s.replace(/getFieldValue\('Sample Collection Method'\) \|\| '待确认'/g, "getFieldValue('Sample Collection Method') || t('orderChat.fieldPending')");
s = s.replace(/getFieldValue\('Carrier'\) \|\| '待确认'/g, "getFieldValue('Carrier') || t('orderChat.fieldPending')");
s = s.replace(/getFieldValue\('Tracking Number'\) \|\| '待确认'/g, "getFieldValue('Tracking Number') || t('orderChat.fieldPending')");

// readonlyOrderConfirmCard
s = s.replace(/carrier !== '待确认'/g, "carrier !== t('orderChat.fieldPending')");
s = s.replace(/tracking !== '待确认'/g, "tracking !== t('orderChat.fieldPending')");
s = s.replace(
  "const collectionMethod = manualAnswers['Sample Collection Method'] || getFieldValue('Sample Collection Method') || '待确认';",
  "const collectionMethod = manualAnswers['Sample Collection Method'] || getFieldValue('Sample Collection Method') || t('orderChat.fieldPending');"
);
s = s.replace(
  "const carrier = manualAnswers['Carrier'] || getFieldValue('Carrier') || '待确认';",
  "const carrier = manualAnswers['Carrier'] || getFieldValue('Carrier') || t('orderChat.fieldPending');"
);
s = s.replace(
  "const tracking = manualAnswers['Tracking Number'] || getFieldValue('Tracking Number') || '待确认';",
  "const tracking = manualAnswers['Tracking Number'] || getFieldValue('Tracking Number') || t('orderChat.fieldPending');"
);
s = s.replace(
  "const reportFieldsNeed = manualAnswers['是否需要增加更多字段展示在报告上'] || '否';",
  "const reportFieldsNeed = manualAnswers['是否需要增加更多字段展示在报告上'] || t('common.no');"
);
s = s.replace(
  "(collectionMethod === '启迈 QIMA 将在执行产品服务时收集样本' ? '' :",
  "(isSampleCollect(collectionMethod) ? '' :"
);
s = s.replace(
  "(reportFieldsNeed === '是' && reportFieldsDetail ?",
  "(reportFieldsNeed === t('common.yes') && reportFieldsDetail ?"
);

// Convert readonlyOrderConfirmCard field keys to English
s = s.replace(
  /function readonlyOrderConfirmCard\(\)\{[\s\S]*?'\<\/div>';\s*\}/,
  `function readonlyOrderConfirmCard(){
      const productName = manualAnswers['Product Name'] || getFieldValue('Product Name') || t('orderChat.productRobotToy');
      const program = manualAnswers['Program'] || getFieldValue('Program') || t('orderChat.projectTemuHardwareRefund');
      const manufacturer = manualAnswers['Manufacturer'] || getFieldValue('Manufacturer') || t('orderChat.manufacturerDemo');
      const origin = manualAnswers['Country of Origin'] || getFieldValue('Country of Origin') || t('orderChat.originAland');
      const distribution = manualAnswers['Countries/Regions of Distribution'] || getFieldValue('Countries/Regions of Distribution') || t('orderChat.distributionPresetEn');
      const itemModel = manualAnswers['Item#/model#'] || getFieldValue('Item#/model#') || 'RBT-2025-X9';
      const electricType = manualAnswers['产品是否带电'] || '';
      const electricDescription = manualAnswers['产品说明'] || '';
      const manufacturerAddress = manualAnswers['Manufacturer Address'] || getFieldValue('Manufacturer Address') || t('orderChat.manufacturerAddrDemo');
      const carrier = manualAnswers['Carrier'] || getFieldValue('Carrier') || t('orderChat.fieldPending');
      const tracking = manualAnswers['Tracking Number'] || getFieldValue('Tracking Number') || t('orderChat.fieldPending');
      const collectionMethod = manualAnswers['Sample Collection Method'] || getFieldValue('Sample Collection Method') || t('orderChat.fieldPending');
      const shippingRemark = manualAnswers['Shipping Remark'] || getFieldValue('Shipping Remark') || '';
      const reportFieldsNeed = manualAnswers['是否需要增加更多字段展示在报告上'] || t('common.no');
      const reportFieldsDetail = manualAnswers['报告额外字段'] || '';
      return '<div class="panel">'+
        '<div class="fields">'+
          field('Product Name', productName, true)+
          field('Program', program, true)+
          field('Country of Origin', origin, true)+
          field('Countries/Regions of Distribution', distribution, true)+
          field('Item#/model#', itemModel, true)+
          (electricType ? field('Product Name', electricType, true) : '')+
          (electricDescription ? field('Product Name', electricDescription, true) : '')+
          field('Manufacturer', manufacturer, true)+
          field('Manufacturer Address', manufacturerAddress, true)+
          field('Sample Collection Method', collectionMethod, true)+
          field('Product Name', reportFieldsNeed, true)+
          (reportFieldsNeed === t('common.yes') && reportFieldsDetail ? field('Product Name', reportFieldsDetail, true) : '')+
          (isSampleCollect(collectionMethod) ? '' :
            field('Carrier', carrier, carrier !== t('orderChat.fieldPending'))+
            field('Tracking Number', tracking, tracking !== t('orderChat.fieldPending'))+
            field('Shipping Remark', shippingRemark, !!shippingRemark, true)
          )+
        '</div>'+
      '</div>';
    }`
);

// askUpload card - dynamic
s = s.replace(
  /const card =[\s\S]*?'<button class="manual-fill" onclick="startManualFill\(\)">暂无资料，直接填写<\/button>'\+[\s\S]*?'\<\/div>';\s*botMsg\(card, true\);/,
  `const card =
        '<div class="panel panel-pad">'+
          '<div class="panel-title">'+t('orderChat.uploadTitle')+'</div>'+
          '<div class="upload-options">'+
            '<div class="upload-option" onclick="doUpload()">'+
              '<div class="up-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>'+
              '<div class="up-title">'+t('orderChat.cameraCapture')+'</div>'+
            '</div>'+
            '<div class="upload-option" onclick="openUploadSourcePicker()">'+
              '<div class="up-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>'+
              '<div class="up-title">'+t('orderChat.uploadDoc')+'</div>'+
            '</div>'+
          '</div>'+
          '<div class="uploaded-files" id="uploadedFiles"></div>'+
          '<div class="src-tabs">'+t('orderChat.fileTypes')+'</div>'+
          '<div class="upload-hint">'+
            '<div class="upload-hint-head"><span class="upload-hint-title">'+t('orderChat.uploadHintTitle')+'</span><button class="detail-link" onclick="showUploadExamples()">'+t('orderChat.viewDetails')+'</button></div>'+
            '<div class="upload-hint-tags">'+t('orderChat.uploadHintTags')+'</div>'+
          '</div>'+
          '<div class="link-row"><input id="linkIn" placeholder="'+t('orderChat.linkPlaceholder')+'" oninput="updateParseButtonState()"><button class="parse-btn" id="parseBtn" onclick="doParse()" disabled>'+t('orderChat.parseBtn')+'</button></div>'+
          '<button class="manual-fill" onclick="startManualFill()">'+t('orderChat.noDataFill')+'</button>'+
        '</div>';
      botMsg(card, true);`
);

// mfLabAddresses
s = s.replace(
  /const mfLabAddresses = \{[\s\S]*?\};\s*/,
  `function getMfLabAddresses(){
      var labs = I18n.getTestingLabs();
      var map = {};
      labs.forEach(function(l){ map[l.key] = l.address; });
      return map;
    }
    `
);
s = s.replace('mfLabAddresses[key]', 'getMfLabAddresses()[key]');

// submitManualForm alert and electric
s = s.replace("alert('请选择样品收集方式。');", "alert(t('orderChat.alertSelectSample'));");
s = s.replace("row.style.display = selected.value === '带电' ? 'block' : 'none';", "row.style.display = selected.value === 'electric' ? 'block' : 'none';");
s = s.replace("manualAnswers['产品说明'] = electricVal === '带电' ? electricDescription : '';", "manualAnswers['产品说明'] = electricVal === 'electric' ? electricDescription : '';");

// openManualFormModal - populate i18n
s = s.replace(
  "function openManualFormModal(){\n      document.getElementById('manualFormModal').classList.add('show');\n      mfToggleSampleFields();\n    }",
  "function openManualFormModal(){\n      document.getElementById('manualFormModal').classList.add('show');\n      populateManualFormI18n();\n      mfToggleSampleFields();\n    }"
);

// supplier empty
s = s.replace("'<tr><td class=\"supplier-empty\" colspan=\"3\">无数据</td></tr>'", "'<tr><td class=\"supplier-empty\" colspan=\"3\">'+t('common.noData')+'</td></tr>'");

// remove duplicate escapeHtml
s = s.replace(
  /function escapeHtml\(str\)\{\s*return String\(str\)\.replace\([\s\S]*?\}\s*\}\);\s*\}\s*/,
  ''
);

// reusePrefills - convert to function with t()
s = s.replace(
  /const reusePrefills = \{[\s\S]*?\};\s*function reuse/,
  `function getReusePrefills(){
      return {
        'T-25617004': {
          sourceType: t('orderChat.historyOrder'),
          sourceDesc: t('orderChat.historyDescLtToys'),
          fields: {
            'Product Name': t('orderChat.productRobotToy'),
            'Program': t('orderChat.projectTemuHardwareRefund'),
            'Country of Origin': t('orderChat.originChina'),
            'Countries/Regions of Distribution': t('orderChat.distributionPresetEn'),
            'Item#/model#': 'RBT-2025-X9',
            'Manufacturer': t('orderChat.manufacturerDemo'),
            'Manufacturer Address': t('orderChat.manufacturerAddrDemo'),
            'Sample Collection Method': sampleMethodShip(),
            'Carrier': t('carrier.sf'),
            'Tracking Number': 'SF1234567890123',
            'Shipping Remark': ''
          }
        },
        'T-25617005': {
          sourceType: t('orderChat.historyOrder'),
          sourceDesc: t('orderChat.historyDescLtToysZh'),
          fields: {
            'Product Name': t('orderChat.productRobotToy'),
            'Program': t('orderChat.projectTemuToys'),
            'Country of Origin': t('orderChat.originChina'),
            'Countries/Regions of Distribution': t('country.us'),
            'Item#/model#': 'RBT-2025-X9',
            'Manufacturer': t('orderChat.manufacturerDemo'),
            'Manufacturer Address': t('orderChat.manufacturerAddrDemo'),
            'Sample Collection Method': sampleMethodShip(),
            'Carrier': '',
            'Tracking Number': '',
            'Shipping Remark': ''
          }
        },
        'T-25590011': {
          sourceType: t('orderChat.historyTest'),
          sourceDesc: t('orderChat.historyDescEn71'),
          fields: {
            'Product Name': t('orderChat.productBlockToy'),
            'Program': t('orderChat.projectTemuHardwareRefund'),
            'Country of Origin': t('orderChat.originChina'),
            'Countries/Regions of Distribution': t('country.eu'),
            'Item#/model#': 'BLOCK-EN71-001',
            'Manufacturer': t('orderChat.manufacturerDemo2'),
            'Manufacturer Address': t('orderChat.manufacturerAddrDemo2'),
            'Sample Collection Method': sampleMethodCollect(),
            'Carrier': '',
            'Tracking Number': '',
            'Shipping Remark': ''
          }
        },
        'Q202349103': {
          sourceType: t('orderChat.historyOrderCap'),
          sourceDesc: t('orderChat.historyDescLtPsi'),
          fields: {
            'Product Name': t('orderChat.productToysPsi'),
            'Program': t('orderChat.projectTemuHardwareRefund'),
            'Country of Origin': t('orderChat.originChina'),
            'Countries/Regions of Distribution': t('orderChat.distributionUsCa'),
            'Item#/model#': 'Q202349103',
            'Manufacturer': 'QIMA Toy Factory',
            'Manufacturer Address': 'Dongguan, Guangdong, China',
            'Sample Collection Method': sampleMethodReceived(),
            'Carrier': '',
            'Tracking Number': '',
            'Shipping Remark': ''
          }
        },
        'Q202310887': {
          sourceType: t('orderChat.historyOrderCap'),
          sourceDesc: t('orderChat.historyDescLtToys'),
          fields: {
            'Product Name': t('orderChat.productRobotToy'),
            'Program': t('orderChat.projectTemuHardwareRefund'),
            'Country of Origin': t('orderChat.originChina'),
            'Countries/Regions of Distribution': t('orderChat.distributionPresetAll'),
            'Item#/model#': 'Q202310887',
            'Manufacturer': t('orderChat.manufacturerDemo'),
            'Manufacturer Address': t('orderChat.manufacturerAddrDemo'),
            'Sample Collection Method': sampleMethodShip(),
            'Carrier': t('carrier.zto'),
            'Tracking Number': 'FDX-202310887',
            'Shipping Remark': ''
          }
        }
      };
    }
    function reuse`
);

s = s.replace('reusePrefills[id] || reusePrefills', 'getReusePrefills()[id] || getReusePrefills()');

// processWaybillPhoto carrier
s = s.replace("const carrier = '顺丰速运';", "const carrier = t('carrier.sf');");

// answerManualField sample checks
s = s.replace("if(item.key === 'Sample Collection' && value === '打开相机拍照识别面单'){", "if(item.key === 'Sample Collection' && value === t('orderChat.openCameraWaybill')){");
s = s.replace("if(item.key === 'Sample Collection' && value === '手动填写快递信息'){", "if(item.key === 'Sample Collection' && value === t('carrier.manualFill')){");
s = s.replace("manualAnswers['Carrier'] = '顺丰速运';", "manualAnswers['Carrier'] = t('carrier.sf');");

// answerReuseShipping
s = s.replace("if(value === '打开相机拍照识别面单'){", "if(value === t('orderChat.openCameraWaybill')){");
s = s.replace("if(value === '手动填写快递信息'){", "if(value === t('carrier.manualFill')){");

// initLangToggle at end
if (!s.includes('I18n.initLangToggle')) {
  s = s.replace(
    'function reedit(btn){ removeActionRow(btn); userMsg(\'补充商品信息\'); openFieldEditor(); }\n  </script>',
    `function reedit(btn){ removeActionRow(btn); userMsg(t('orderChat.userSupplementProduct')); openFieldEditor(); }
    if (window.I18n) {
      I18n.onLangApplied = function(){ populateManualFormI18n(); };
      I18n.initLangToggle();
    }
  </script>`
  );
}

// mf radio values electric
s = s.replace('value="带电"', 'value="electric"');
s = s.replace('value="非电"', 'value="non-electric"');

fs.writeFileSync(filePath, s);
console.log('Phase 2 JS conversion done');
