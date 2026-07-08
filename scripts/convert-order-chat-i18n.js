#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'order-chat.html');
let html = fs.readFileSync(filePath, 'utf8');

// ── 1. Head: i18n assets ──
if (!html.includes('assets/i18n-runtime.js')) {
  html = html.replace(
    '</style>\n</head>',
    `</style>
<link rel="stylesheet" href="assets/lang-toggle.css" />
<link rel="stylesheet" href="assets/i18n-en.css" />
<script>window.PAGE_TITLE_KEY = 'title.orderChat';</script>
<script src="assets/i18n/zh.js"></script>
<script src="assets/i18n/en.js"></script>
<script src="assets/i18n-runtime.js"></script>
</head>`
  );
}

// ── 2. Static HTML data-i18n ──
const htmlI18n = [
  ['<a href="index.html" onclick="return openBackConfirm(event)"><img class="back" src="assets/vector52.svg" alt="返回" />',
   '<a href="index.html" onclick="return openBackConfirm(event)"><img class="back" src="assets/vector52.svg" alt="返回" data-i18n-alt="common.back" />'],
  ['<div class="nav-title">下单助手 <span class="ai-badge">AI</span></div>',
   '<div class="nav-title"><span data-i18n="orderChat.title">下单助手</span> <span class="ai-badge">AI</span></div>'],
  ['<div class="nav-sub">智能创建检测订单</div>',
   '<div class="nav-sub" data-i18n="orderChat.navSub">智能创建检测订单</div>'],
  ['<img class="avatar bot" src="assets/robot.png" alt="下单助手" />',
   '<img class="avatar bot" src="assets/robot.png" alt="下单助手" data-i18n-alt="orderChat.botAvatarAlt" />'],
  ['<div class="bubble">您好，我是下单助手 🤖<br>在开始之前，请选择首次测试，或直接复制历史订单快速下单～</div>',
   '<div class="bubble" data-i18n="orderChat.welcome" data-i18n-html="true">您好，我是下单助手 🤖<br>在开始之前，请选择首次测试，或直接复制历史订单快速下单～</div>'],
  ['<div class="panel-title">请选择本次需求类型</div>',
   '<div class="panel-title" data-i18n="orderChat.selectType">请选择本次需求类型</div>'],
  ['<div class="cb-name">首次测试</div>',
   '<div class="cb-name" data-i18n="orderChat.firstTest">首次测试</div>'],
  ['<div class="cb-desc">全新产品，第一次创建检测订单</div>',
   '<div class="cb-desc" data-i18n="orderChat.firstTestDesc">全新产品，第一次创建检测订单</div>'],
  ['<div class="copy-orders-title">复制历史订单</div>',
   '<div class="copy-orders-title" data-i18n="orderChat.copyHistory">复制历史订单</div>'],
  ['<div class="copy-orders-tip">点选订单号即可复用信息，无需多次选择</div>',
   '<div class="copy-orders-tip" data-i18n="orderChat.copyHistoryTip">点选订单号即可复用信息，无需多次选择</div>'],
  ['<div class="examples-title">资料示例</div>',
   '<div class="examples-title" data-i18n="orderChat.examplesTitle">资料示例</div>'],
  ['<button class="examples-close" onclick="closeUploadExamples()" aria-label="关闭">×</button>',
   '<button class="examples-close" onclick="closeUploadExamples()" aria-label="关闭" data-i18n-title="common.close">×</button>'],
  ['<div class="examples-note">以下是可上传资料的照片示例。资料越完整，AI 自动识别字段越准确。</div>',
   '<div class="examples-note" data-i18n="orderChat.examplesNote">以下是可上传资料的照片示例。资料越完整，AI 自动识别字段越准确。</div>'],
  ['<div class="example-name">Product Spec / 规格书</div>',
   '<div class="example-name" data-i18n="orderChat.exampleSpec">Product Spec / 规格书</div>'],
  ['<div class="example-desc">产品名称、SKU、材质、年龄段、尺寸</div>',
   '<div class="example-desc" data-i18n="orderChat.exampleSpecDesc">产品名称、SKU、材质、年龄段、尺寸</div>'],
  ['<div class="example-name">Product Photos</div>',
   '<div class="example-name" data-i18n="orderChat.examplePhoto">Product Photos</div>'],
  ['<div class="example-desc">产品正面、细节、铭牌、配件照片</div>',
   '<div class="example-desc" data-i18n="orderChat.examplePhotoDesc">产品正面、细节、铭牌、配件照片</div>'],
  ['<div class="example-name">Packaging / Label</div>',
   '<div class="example-name" data-i18n="orderChat.examplePackaging">Packaging / Label</div>'],
  ['<div class="example-desc">包装六面图、标签、警告语、条码</div>',
   '<div class="example-desc" data-i18n="orderChat.examplePackagingDesc">包装六面图、标签、警告语、条码</div>'],
  ['<div class="example-name">PO / PI / Invoice</div>',
   '<div class="example-name" data-i18n="orderChat.examplePo">PO / PI / Invoice</div>'],
  ['<div class="example-desc">采购单号、供应商、数量、收货信息</div>',
   '<div class="example-desc" data-i18n="orderChat.examplePoDesc">采购单号、供应商、数量、收货信息</div>'],
  ['<div class="example-name">测试报告</div>',
   '<div class="example-name" data-i18n="orderChat.exampleReport">测试报告</div>'],
  ['<div class="example-desc">历史测试项目、标准、结果、实验室信息</div>',
   '<div class="example-desc" data-i18n="orderChat.exampleReportDesc">历史测试项目、标准、结果、实验室信息</div>'],
  ['<div class="example-name">商品链接</div>',
   '<div class="example-name" data-i18n="orderChat.exampleLink">商品链接</div>'],
  ['<div class="example-desc">Amazon、TEMU、Shopify 商品页链接</div>',
   '<div class="example-desc" data-i18n="orderChat.exampleLinkDesc">Amazon、TEMU、Shopify 商品页链接</div>'],
  ['<div class="action-sheet-title">选择上传方式</div>',
   '<div class="action-sheet-title" data-i18n="orderChat.uploadSourceTitle">选择上传方式</div>'],
  ['onclick="chooseUploadSource(\'wechat\')">从微信上传</button>',
   'onclick="chooseUploadSource(\'wechat\')" data-i18n="orderChat.uploadWechat">从微信上传</button>'],
  ['onclick="chooseUploadSource(\'phone\')">从手机上传</button>',
   'onclick="chooseUploadSource(\'phone\')" data-i18n="orderChat.uploadPhone">从手机上传</button>'],
  ['onclick="closeUploadSourcePicker()">取消</button>',
   'onclick="closeUploadSourcePicker()" data-i18n="common.cancel">取消</button>'],
  ['<div class="edit-modal-title">表单填写</div>',
   '<div class="edit-modal-title" data-i18n="orderChat.fieldEditorTitle">表单填写</div>'],
  ['<button class="edit-close" onclick="closeFieldEditor()" aria-label="关闭">×</button>',
   '<button class="edit-close" onclick="closeFieldEditor()" aria-label="关闭" data-i18n-title="common.close">×</button>'],
  ['onclick="closeFieldEditor()">取消</button>',
   'onclick="closeFieldEditor()" data-i18n="common.cancel">取消</button>'],
  ['onclick="saveFieldEditor()">保存修改</button>',
   'onclick="saveFieldEditor()" data-i18n="common.save">保存修改</button>'],
  ['<div class="order-confirm-title">订单确认信息</div>',
   '<div class="order-confirm-title" data-i18n="orderChat.orderConfirmTitle">订单确认信息</div>'],
  ['onclick="dismissOrderConfirm()" aria-label="关闭">×</button>',
   'onclick="dismissOrderConfirm()" aria-label="关闭" data-i18n-title="common.close">×</button>'],
  ['onclick="editOrderFromConfirm()">返回修改</button>',
   'onclick="editOrderFromConfirm()" data-i18n="orderChat.backToEdit">返回修改</button>'],
  ['onclick="submitOrderSuccess()">提交下单</button>',
   'onclick="submitOrderSuccess()" data-i18n="common.submit">提交下单</button>'],
  ['<div class="back-confirm-text">您确定返回主页吗？现在的进度将不会保存</div>',
   '<div class="back-confirm-text" data-i18n="orderChat.backConfirmText">您确定返回主页吗？现在的进度将不会保存</div>'],
  ['onclick="closeBackConfirm()">取消</button>',
   'onclick="closeBackConfirm()" data-i18n="common.cancel">取消</button>'],
  ['onclick="goBackHome()">确定返回</button>',
   'onclick="goBackHome()" data-i18n="orderChat.backConfirmOk">确定返回</button>'],
  ['<div class="supplier-title">选择供应商</div>',
   '<div class="supplier-title" data-i18n="orderChat.supplierTitle">选择供应商</div>'],
  ['placeholder="搜索" oninput="renderSupplierRows()"',
   'placeholder="搜索" data-i18n-placeholder="common.search" oninput="renderSupplierRows()"'],
  ['<th>供应商名称</th>', '<th data-i18n="orderChat.supplierNameCol">供应商名称</th>'],
  ['<th>地址</th>', '<th data-i18n="orderChat.supplierAddressCol">地址</th>'],
  ['<th>主要联系人</th>', '<th data-i18n="orderChat.supplierContactCol">主要联系人</th>'],
  ['<button class="supplier-add" type="button">添加新供应商?</button>',
   '<button class="supplier-add" type="button" data-i18n="orderChat.supplierAddNew">添加新供应商?</button>'],
  ['onclick="closeSupplierPicker()">取消</button>',
   'onclick="closeSupplierPicker()" data-i18n="common.cancel">取消</button>'],
  ['onclick="confirmSupplierSelection()" disabled>选择</button>',
   'onclick="confirmSupplierSelection()" disabled data-i18n="common.select">选择</button>'],
  ['<div class="form-modal-title">详细填写订单</div>',
   '<div class="form-modal-title" data-i18n="orderChat.manualFormTitle">详细填写订单</div>'],
  ['onclick="closeManualFormModal()" aria-label="关闭">×</button>',
   'onclick="closeManualFormModal()" aria-label="关闭" data-i18n-title="common.close">×</button>'],
  ['<div class="fm-section-title">基本信息</div>',
   '<div class="fm-section-title" data-i18n="orderChat.basicInfo">基本信息</div>'],
  ['<div class="fm-label">产品名称 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.productName">产品名称</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['placeholder="请输入产品名称">', 'placeholder="请输入产品名称" data-i18n-placeholder="index.productNamePlaceholder">'],
  ['<div class="fm-label">关联项目 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.project">关联项目</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['<option value="" disabled selected>请选择关联项目</option>',
   '<option value="" disabled selected data-i18n="index.projectPlaceholder">请选择关联项目</option>'],
  ['<div class="fm-label">原产国家或地区 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.originCountry">原产国家或地区</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['<option value="" disabled selected>请选择原产国家或地区</option>',
   '<option value="" disabled selected data-i18n="index.originCountryPlaceholder">请选择原产国家或地区</option>'],
  ['<div class="fm-label">销售国家或地区 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.salesCountry">销售国家或地区</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['<div class="fm-label">货号 / 型号 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.sku">货号 / 型号</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['placeholder="请输入货号或型号">', 'placeholder="请输入货号或型号" data-i18n-placeholder="index.skuPlaceholder">'],
  ['<div class="fm-label">产品是否带电 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.electric">产品是否带电</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['onchange="mfToggleElectricDescription()"> 带电产品</label>',
   'onchange="mfToggleElectricDescription()"> <span data-i18n="index.electricYes">带电产品</span></label>'],
  ['checked onchange="mfToggleElectricDescription()"> 非电产品</label>',
   'checked onchange="mfToggleElectricDescription()"> <span data-i18n="index.electricNo">非电产品</span></label>'],
  ['<div class="fm-label">产品说明 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.productDesc">产品说明</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['id="mf_electricDescription" placeholder="请说明产品的带电部件、电池/电源类型、额定参数、充电方式等信息"></textarea>',
   'id="mf_electricDescription" placeholder="请说明产品的带电部件、电池/电源类型、额定参数、充电方式等信息" data-i18n-placeholder="index.productDescPlaceholder"></textarea>'],
  ['<div class="fm-label">制造商 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.manufacturer">制造商</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['id="mf_manufacturer" type="text" placeholder="请输入制造商完整工厂全称">',
   'id="mf_manufacturer" type="text" placeholder="请输入制造商完整工厂全称" data-i18n-placeholder="index.manufacturerPlaceholder">'],
  ['⚠ 请务必提供完整的工厂全称，不可简写</div>',
   '<span data-i18n="index.manufacturerWarn">⚠ 请务必提供完整的工厂全称，不可简写</span></div>'],
  ['<div class="fm-label">制造商地址 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="index.manufacturerAddress">制造商地址</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['id="mf_manufacturerAddr" type="text" placeholder="请输入制造商完整地址（省/市/区/街道/门牌号）">',
   'id="mf_manufacturerAddr" type="text" placeholder="请输入制造商完整地址（省/市/区/街道/门牌号）" data-i18n-placeholder="index.manufacturerAddressPlaceholder">'],
  ['⚠ 请务必提供完整地址，包括省、市、区、街道和门牌号</div>',
   '<span data-i18n="index.manufacturerAddressWarn">⚠ 请务必提供完整地址，包括省、市、区、街道和门牌号</span></div>'],
  ['<div class="fm-section-title">样品收集</div>',
   '<div class="fm-section-title" data-i18n="orderChat.sampleCollection">样品收集</div>'],
  ['<div class="fm-label">样品收集方式 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="orderChat.sampleMethodLabel">样品收集方式</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['<div class="fm-label">产品检验订单参考编号</div>',
   '<div class="fm-label" data-i18n="index.inspectionRef">产品检验订单参考编号</div>'],
  ['<option value="" disabled selected>请选择参考编号</option>',
   '<option value="" disabled selected data-i18n="orderChat.refNumberPlaceholder">请选择参考编号</option>'],
  ['<div class="fm-label">寄送实验室 <span class="req">*</span></div>',
   '<div class="fm-label"><span data-i18n="lab.sendToLab">寄送实验室</span> <span class="req" data-i18n="common.required">*</span></div>'],
  ['<div class="fm-label">快递公司</div>', '<div class="fm-label" data-i18n="carrier.label">快递公司</div>'],
  ['<option value="" disabled selected>请选择快递公司</option>',
   '<option value="" disabled selected data-i18n="carrier.selectPlaceholder">请选择快递公司</option>'],
  ['<div class="fm-label">运单号</div>', '<div class="fm-label" data-i18n="carrier.trackingNo">运单号</div>'],
  ['id="mf_trackingNo" type="text" placeholder="请输入运单号">',
   'id="mf_trackingNo" type="text" placeholder="请输入运单号" data-i18n-placeholder="carrier.trackingPlaceholder">'],
  ['<div class="fm-label">备注</div>', '<div class="fm-label" data-i18n="index.shippingRemark">备注</div>'],
  ['id="mf_shippingRemark" placeholder="请输入备注信息"></textarea>',
   'id="mf_shippingRemark" placeholder="请输入备注信息" data-i18n-placeholder="index.shippingRemarkPlaceholder"></textarea>'],
  ['onclick="closeManualFormModal()">取消</button>',
   'onclick="closeManualFormModal()" data-i18n="common.cancel">取消</button>'],
  ['onclick="submitManualForm()">提交下单</button>',
   'onclick="submitManualForm()" data-i18n="common.submit">提交下单</button>'],
  ['placeholder="请输入您的消息..." onkeydown="handleInputKey(event)"',
   'placeholder="请输入您的消息..." data-i18n-placeholder="orderChat.chatPlaceholder" onkeydown="handleInputKey(event)"'],
  ['onclick="sendChatInput()">发送</button>',
   'onclick="sendChatInput()" data-i18n="orderChat.send">发送</button>'],
];
htmlI18n.forEach(([from, to]) => { html = html.split(from).join(to); });

// ── 3. Inject i18n helpers after script open ──
const helpers = `
    /* ── i18n helpers ── */
    function escapeHtml(str){ return I18n.escapeHtml(str); }

    function sampleMethodShip(){ return t('index.sampleShip'); }
    function sampleMethodCollect(){ return t('index.sampleCollect'); }
    function sampleMethodReceived(){ return t('index.sampleReceived'); }
    function isSampleCollect(val){ return val === sampleMethodCollect(); }
    function isSampleShip(val){ return val === sampleMethodShip(); }

    function getCarriers(){
      return ['carrier.sf','carrier.zto','carrier.yto','carrier.sto','carrier.yunda','carrier.jd','carrier.jt','carrier.other'].map(function(k){ return t(k); });
    }

    function getProgramOptions(){
      return [t('orderChat.projectTemuHardwareRefund'), t('orderChat.projectTemuToys'), t('orderChat.projectAmazon')];
    }

    function getOriginOptions(){
      return [t('orderChat.originAland'), t('orderChat.originChina'), t('orderChat.originVietnam'), t('orderChat.originIndia')];
    }

    function fieldLabel(key){
      var map = {
        'Source ID': 'orderChat.sourceId',
        'Service': 'orderChat.serviceType',
        'Product Name': 'orderChat.fieldProductName',
        'Program': 'orderChat.fieldProgram',
        'Country of Origin': 'orderChat.fieldOrigin',
        'Countries/Regions of Distribution': 'orderChat.fieldDistribution',
        'Item#/model#': 'orderChat.fieldItemModel',
        'Manufacturer': 'orderChat.fieldManufacturer',
        'Manufacturer Address': 'orderChat.fieldManufacturerAddress',
        'Sample Collection Method': 'orderChat.fieldSampleMethod',
        'Carrier': 'carrier.label',
        'Tracking Number': 'carrier.trackingNo',
        'Shipping Remark': 'index.shippingRemark',
        'Supplier': 'index.supplier',
        '产品名称': 'orderChat.fieldProductName',
        '关联项目': 'orderChat.fieldProject',
        '原产国家或地区': 'orderChat.fieldOrigin',
        '原产国': 'orderChat.fieldOrigin',
        '销售国家或地区': 'orderChat.fieldDistribution',
        '货号 / 型号': 'orderChat.fieldSku',
        'Item # / model #': 'orderChat.fieldItemModel',
        '产品是否带电': 'orderChat.fieldElectric',
        '产品说明': 'orderChat.fieldElectricDesc',
        '制造商': 'orderChat.fieldManufacturer',
        '制造商地址': 'orderChat.fieldManufacturerAddress',
        '样品收集方式': 'orderChat.fieldSampleMethod',
        '产品检验订单参考编号': 'index.inspectionRef',
        '寄送实验室': 'lab.sendToLab',
        '快递公司': 'carrier.label',
        '运单号': 'carrier.trackingNo',
        '备注': 'index.shippingRemark',
        '物流备注': 'orderChat.fieldLogisticsRemark',
        '是否需要增加更多字段展示在报告上？': 'index.reportFieldsNeed',
        '报告额外字段': 'index.reportFieldsDetail'
      };
      return t(map[key] || key);
    }

    function chipsRow(inner){ return '<div style="width:268px"><div class="chips">'+inner+'</div></div>'; }

    function placeOrderChips(extra){
      var html = I18n.chipHtml('orderChat.chipPlaceOrder','cart','placeOrder(this)') +
        I18n.chipHtml('orderChat.chipEditFields','edit','openFieldEditor(this)');
      if(extra) html += extra;
      return chipsRow(html);
    }

    function populateManualFormI18n(){
      var distChecks = document.querySelectorAll('#manualFormModal .fm-check-grid input[type="checkbox"]');
      var presets = I18n.getDistributionPresets();
      distChecks.forEach(function(cb, i){ if(presets[i]){ cb.value = presets[i]; var sp = cb.parentElement.querySelector('span') || cb.parentElement; if(sp.tagName==='SPAN') sp.textContent = presets[i]; else cb.parentElement.appendChild(document.createTextNode(' '+presets[i])); } });
      var prog = document.getElementById('mf_program');
      if(prog && prog.options.length > 1){
        var opts = getProgramOptions();
        for(var i=1;i<prog.options.length && i-1<opts.length;i++) prog.options[i].textContent = opts[i-1];
      }
      var origin = document.getElementById('mf_origin');
      if(origin && origin.options.length > 1){
        var origins = getOriginOptions();
        for(var j=1;j<origin.options.length && j-1<origins.length;j++) origin.options[j].textContent = origins[j-1];
      }
      var sampleLabels = document.querySelectorAll('#manualFormModal input[name="mf_sample"]');
      var sampleTexts = [sampleMethodShip(), sampleMethodCollect(), sampleMethodReceived()];
      sampleLabels.forEach(function(r,i){ var lab = r.parentElement; if(lab && sampleTexts[i]){ var sp = lab.querySelector('span'); if(sp) sp.textContent = sampleTexts[i]; } });
      var labRadios = document.querySelectorAll('#manualFormModal input[name="mf_lab"]');
      var labs = I18n.getTestingLabs();
      labRadios.forEach(function(r,i){ var lab = r.parentElement; if(lab && labs[i]){ var sp = lab.querySelector('span'); if(sp) sp.textContent = labs[i].label; } });
      var carrier = document.getElementById('mf_carrier');
      if(carrier){
        var carriers = getCarriers();
        for(var k=1;k<carrier.options.length && k-1<carriers.length;k++) carrier.options[k].textContent = carriers[k-1];
      }
    }

`;

if (!html.includes('function sampleMethodShip')) {
  html = html.replace(
    '    const chat = document.getElementById(\'chat\');',
    helpers + '    const chat = document.getElementById(\'chat\');'
  );
}

// BOT_AVATAR dynamic alt
html = html.replace(
  "const BOT_AVATAR = '<img class=\"avatar bot\" src=\"assets/robot.png\" alt=\"下单助手\" />';",
  "function botAvatarHtml(){ return '<img class=\"avatar bot\" src=\"assets/robot.png\" alt=\"'+escapeHtml(t('orderChat.botAvatarAlt'))+'\" />'; }"
);
html = html.replace(/BOT_AVATAR \+/g, 'botAvatarHtml() +');

fs.writeFileSync(filePath, html);
console.log('Phase 1 HTML + helpers done');
