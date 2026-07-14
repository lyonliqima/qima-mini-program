/**
 * Multimodal order parse on Supabase Edge:
 * voice text + product-label images + PDF/DOCX + link
 * → structured fields via NVIDIA NIM (vision + LLM).
 *
 * Secret: NVIDIA_API_KEY
 * Frontend: POST multipart (voice_text, link, files) to
 *   /functions/v1/parse-order
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";
const VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
// nemotron-nano currently hangs on NIM; use a responsive instruct model
const LLM_MODEL = "meta/llama-3.1-8b-instruct";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const FIELD_KEYS = [
  "Product Name",
  "Program",
  "Country of Origin",
  "Countries/Regions of Distribution",
  "Item#/model#",
  "Manufacturer",
  "Manufacturer Address",
  "Sample Collection Method",
  "Electric Product",
  "Product Description",
  "Carrier",
  "Tracking Number",
  "Shipping Remark",
] as const;

const MARK_TO_REGIONS: Record<string, string[]> = {
  CE: ["欧盟"],
  UKCA: ["英国"],
  UKNI: ["英国"],
  FCC: ["美国"],
  FC: ["美国"],
  FDA: ["美国"],
  CCC: ["中国"],
  PSE: ["日本"],
  KC: ["韩国"],
  RCM: ["澳大利亚"],
  EAC: ["俄罗斯"],
};

/** Canonical Program options (AIMS display strings). Skip "… - Copy". */
const PROGRAM_CATALOG = [
  "TEMU Toys - TEMU Pay（TEMU 付款-玩具产品）",
  "TEMU Textile (Sleepwear) - TEMU Pay（TEMU 付款，睡衣产品）",
  "TEMU Hardware- Seller Pay（商家付款，杂货产品）",
  "DEFAULT",
  "TEMU Textile (Non-Sleepwear) - Seller Pay（商家付款，非睡衣类纺织品产品）",
  "TEMU FCM-Seller Pay（商家付款，食品接触产品）",
  "TEMU FCM-TEMU Pay（Temu 付款，食品接触产品）",
  "TEMU Textile (Non-Sleepwear) - TEMU Pay（TEMU 付款，非睡衣类纺织品产品）",
  "TEMU Toys - Seller Pay（商家付款，玩具产品）",
  "TEMU Textile (Sleepwear) - Seller Pay（商家付款，睡衣产品）",
  "TEMU Eyewear(PPE)-Seller Pay（商家付款,PPE 眼镜产品）",
  "TEMU Electric product -Seller Pay（商家付款，电子产品）",
  "SH-Self",
  "TEMU MSDS-Seller Pay（商家付款，只做MSDS专用program）",
] as const;

const PROGRAM_BY_KEY: Record<string, string> = {
  toys_temu: "TEMU Toys - TEMU Pay（TEMU 付款-玩具产品）",
  toys_seller: "TEMU Toys - Seller Pay（商家付款，玩具产品）",
  sleepwear_temu: "TEMU Textile (Sleepwear) - TEMU Pay（TEMU 付款，睡衣产品）",
  sleepwear_seller: "TEMU Textile (Sleepwear) - Seller Pay（商家付款，睡衣产品）",
  non_sleepwear_temu:
    "TEMU Textile (Non-Sleepwear) - TEMU Pay（TEMU 付款，非睡衣类纺织品产品）",
  non_sleepwear_seller:
    "TEMU Textile (Non-Sleepwear) - Seller Pay（商家付款，非睡衣类纺织品产品）",
  hardware_seller: "TEMU Hardware- Seller Pay（商家付款，杂货产品）",
  fcm_seller: "TEMU FCM-Seller Pay（商家付款，食品接触产品）",
  fcm_temu: "TEMU FCM-TEMU Pay（Temu 付款，食品接触产品）",
  eyewear_seller: "TEMU Eyewear(PPE)-Seller Pay（商家付款,PPE 眼镜产品）",
  electric_seller: "TEMU Electric product -Seller Pay（商家付款，电子产品）",
  msds_seller: "TEMU MSDS-Seller Pay（商家付款，只做MSDS专用program）",
  sh_self: "SH-Self",
  default: "DEFAULT",
};

type FieldMap = Record<string, string>;

function compactProgramKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s\-–—_/()（）,，.·]+/g, "")
    .replace(/selly/g, "seller");
}

function resolveProgramLabel(value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^__PROGRAM_TEMU_TOY__$/.test(v)) return PROGRAM_BY_KEY.toys_seller;
  if (/^__PROGRAM_TEMU_HW__$/.test(v)) return PROGRAM_BY_KEY.hardware_seller;
  if (/^__PROGRAM_AMAZON__$/.test(v)) return "";
  for (const label of PROGRAM_CATALOG) {
    if (label === v) return label;
  }
  const compact = compactProgramKey(v);
  if (compact.length >= 6) {
    for (const label of PROGRAM_CATALOG) {
      if (compactProgramKey(label) === compact) return label;
    }
  }
  if (compact.length >= 14) {
    for (const label of PROGRAM_CATALOG) {
      const cLabel = compactProgramKey(label);
      if (cLabel.includes(compact) || compact.includes(cLabel)) {
        return label;
      }
    }
  }
  if (
    /temu.*hardware|hardware.*seller|硬件|杂货/i.test(v) &&
    /seller|商家|退款|refund/i.test(v)
  ) {
    return PROGRAM_BY_KEY.hardware_seller;
  }
  if (
    /temu.*toys?|toys?.*seller|玩具/i.test(v) &&
    /seller|商家/i.test(v) &&
    !/temu\s*pay|temu付款|付款/i.test(v)
  ) {
    return PROGRAM_BY_KEY.toys_seller;
  }
  if (/temu.*toys?|玩具/i.test(v) && /temu\s*pay|temu付款|付款/i.test(v)) {
    return PROGRAM_BY_KEY.toys_temu;
  }
  if (/msds/i.test(v)) return PROGRAM_BY_KEY.msds_seller;
  if (/^sh[-\s]?self$/i.test(v) || /自助\s*program|self\s*program/i.test(v)) {
    return PROGRAM_BY_KEY.sh_self;
  }
  if (/^default$/i.test(v)) return PROGRAM_BY_KEY.default;
  return "";
}

function detectProgramPayer(text: string): "" | "temu" | "seller" {
  const t = String(text || "");
  const temuPay = /TEMU\s*Pay|TEMU\s*付款|Temu\s*付款|平台付款|TEMU付款/i.test(t);
  const sellerPay =
    /Seller\s*Pay|Selly\s*Pay|商家付款|卖家付款|seller\s*paid/i.test(t);
  if (temuPay && !sellerPay) return "temu";
  if (sellerPay && !temuPay) return "seller";
  if (temuPay && sellerPay) {
    if (
      /Program.{0,40}(?:TEMU\s*Pay|TEMU\s*付款)|(?:TEMU\s*Pay|TEMU\s*付款).{0,40}Program/i
        .test(t)
    ) {
      return "temu";
    }
    if (
      /Program.{0,40}(?:Seller\s*Pay|商家付款)|(?:Seller\s*Pay|商家付款).{0,40}Program/i
        .test(t)
    ) {
      return "seller";
    }
  }
  return "";
}

function detectProgramCategory(
  text: string,
  hints: { productName?: string; electricYes?: boolean } = {},
): string {
  const t = String(text || "");
  const name = String(hints.productName || "").trim();
  const blob = (name + "\n" + t).toLowerCase();
  const electricHint = !!hints.electricYes;
  if (
    electricHint ||
    /__ELECTRIC_YES__/i.test(t) ||
    /\b(?:electric\s+fan|electric\s+product|electronics?|battery|voltage|charger|motor|adapter|电源|电机|充电|电池|电压|功率|电子产品|电风扇|带电)\b/i
      .test(blob) ||
    /\d+\s*V(?:olt)?|\d+\s*W(?:att)?|\d+\s*Hz/i.test(blob)
  ) {
    const toyCue =
      /\b(?:toy|toys|en\s*71|cpsia|玩具|机器人玩具|积木)\b/i.test(blob);
    const electricName =
      /\b(?:fan|lamp|light|heater|blender|mixer|vacuum|speaker|耳机|风扇|台灯|吹风机|充电器)\b/i
        .test(blob) ||
      /electric\s+product|电子产品|带电产品/i.test(blob);
    if (electricName || (electricHint && !toyCue)) return "electric";
    if (!toyCue) return "electric";
  }
  if (
    /\b(?:msds\s*only|only\s*msds|只做\s*msds|msds专用|msds\s*program)\b/i
      .test(blob) ||
    (/msds/i.test(blob) && /只做|专用|only/i.test(blob))
  ) {
    return "msds";
  }
  if (/\bsh[-\s]?self\b|自助\s*program|self\s*program/i.test(blob)) {
    return "sh_self";
  }
  if (
    /\b(?:eyewear|glasses|goggles|ppe\b|safety\s*glasses|护目镜|眼镜|ppe\s*眼镜)\b/i
      .test(blob)
  ) {
    return "eyewear";
  }
  if (
    /\b(?:food\s*contact|fcm\b|lfgb|食品接触|餐具|水杯|bowl|cup\b(?!\s*toy))/i
      .test(blob)
  ) {
    return "fcm";
  }
  // Check non-sleepwear before sleepwear (hyphenated "non-sleepwear" contains "sleepwear")
  if (/\b(?:non[-\s]?sleepwear|非睡衣)/i.test(blob)) {
    return "non_sleepwear";
  }
  if (
    /\b(?:sleepwear|pajamas?|pyjamas?|nightgown|睡衣|睡袍|家居服)\b/i.test(blob)
  ) {
    return "sleepwear";
  }
  if (
    /\b(?:textile|fabric|apparel|garment|clothing|面料|纺织|衣服|服装|布料)\b/i
      .test(blob)
  ) {
    return "non_sleepwear";
  }
  if (/\b(?:toy|toys|en\s*71|cpsia|玩具|积木|公仔|doll|plush)\b/i.test(blob)) {
    return "toys";
  }
  if (
    /\b(?:hardware|grocery|kitchen\s*gadget|杂货|五金|厨具|日用|餐刀|scissors)\b/i
      .test(blob) ||
    (/temu/i.test(blob) && /硬件|杂货/.test(t))
  ) {
    return "hardware";
  }
  if (/\bdefault\b/i.test(blob) && /program|关联项目|项目/i.test(blob)) {
    return "default";
  }
  return "";
}

function matchProgramFromText(
  text: string,
  hints: { productName?: string; electricYes?: boolean } = {},
): string {
  const raw = String(text || "");
  if (!raw && !hints.productName) return "";

  const programMention = raw.match(
    /(?:关联)?(?:项目|Program)\s*[是为：:=]\s*([^\n，。;；]{2,80})/i,
  );
  const direct = resolveProgramLabel(programMention?.[1]?.trim() || "");
  if (direct) return direct;

  for (const label of PROGRAM_CATALOG) {
    if (label.length >= 4 && raw.includes(label)) return label;
    const compactLabel = compactProgramKey(label);
    if (
      compactLabel.length >= 8 &&
      compactProgramKey(raw).includes(compactLabel)
    ) {
      return label;
    }
  }

  const category = detectProgramCategory(raw, hints);
  if (!category) return "";
  if (category === "default") return PROGRAM_BY_KEY.default;
  if (category === "sh_self") return PROGRAM_BY_KEY.sh_self;
  if (category === "electric") return PROGRAM_BY_KEY.electric_seller;
  if (category === "hardware") return PROGRAM_BY_KEY.hardware_seller;
  if (category === "eyewear") return PROGRAM_BY_KEY.eyewear_seller;
  if (category === "msds") return PROGRAM_BY_KEY.msds_seller;

  let payer = detectProgramPayer(raw) || "seller";
  const key = `${category}_${payer}`;
  if (PROGRAM_BY_KEY[key]) return PROGRAM_BY_KEY[key];
  return PROGRAM_BY_KEY[`${category}_seller`] || "";
}

function ensureProgramMatched(
  fields: FieldMap,
  opts: { rawExcerpt?: string } = {},
): FieldMap {
  const existing = resolveProgramLabel(fields.Program || "");
  if (existing) {
    fields.Program = existing;
    return fields;
  }
  const hintText = [
    opts.rawExcerpt || "",
    fields["Product Name"] || "",
    fields["Product Description"] || "",
    fields["Electric Product"] || "",
    fields["Shipping Remark"] || "",
  ].join("\n");
  fields.Program = matchProgramFromText(hintText, {
    productName: fields["Product Name"] || "",
    electricYes:
      /带电|electric\s*yes|^electric$/i.test(
        String(fields["Electric Product"] || ""),
      ),
  }) || "";
  return fields;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin &&
      (origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.includes("vercel.app") ||
        origin.includes("github.io"))
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function nvidiaChat(payload: Record<string, unknown>): Promise<string> {
  const apiKey = Deno.env.get("NVIDIA_API_KEY") || "";
  if (!apiKey) throw new Error("missing_nvidia_key");
  const res = await fetch(NVIDIA_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 500);
    throw new Error(`upstream_http_${res.status}:${errBody}`);
  }
  const body = await res.json();
  const choices = body?.choices || [];
  if (!choices.length) return "";
  return String(choices[0]?.message?.content || "").trim();
}

function isImage(filename: string, mime: string): boolean {
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(filename);
}

function parseJsonFromLlm(text: string): Record<string, unknown> {
  let t = (text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("invalid_llm_json");
  }
}

/** Keep product_name concise — strip service wrappers and trailing clauses. */
function cleanProductName(raw: string): string {
  let name = String(raw || "").replace(/\s+/g, " ").trim();
  if (!name) return "";

  name = name.replace(
    /^(?:实验室(?:检测|测试)|检测服务|验货服务|装运前(?:检测|检验)|质检|Lab(?:oratory)?\s*(?:testing|test|inspection)|Pre[-\s]?Shipment\s*Inspection|PSI|Inspection|Testing)\s*[·•\-–—|:\/]+\s*/i,
    "",
  );
  name = name.replace(/^[·•]\s*/, "");
  name = name.replace(
    /^(?:我需要|我想要|我想|请帮我|帮我|需要)?(?:给|为|对)?(?:一款|一个|一台|一件)?(?:做|进行|申请|下单|测试|检测|测)?(?:一下)?(?:实验室)?(?:检测|测试|验货|服务)?(?:订单)?[：:\s]*/i,
    "",
  );
  name = name.replace(
    /^(?:(?:I|we)\s+(?:need|want|would\s+like)|please)\s+/i,
    "",
  );
  name = name.replace(
    /^(?:(?:to\s+)?(?:order|book|do|get|request)\s+)?(?:lab(?:oratory)?\s+)?(?:testing|test|inspection)\s+(?:for|of|on)\s+/i,
    "",
  );
  name = name.replace(/^product\s*name\s*[:：=]\s*/i, "");
  name = name.replace(/^品名\s*[:：=]\s*/, "");
  name = name.replace(/^产品名称\s*[:：=]\s*/, "");
  name = name.split(
    /\s+(?:sold\s+(?:in|to|for)|manufactured\s+by|made\s+(?:by|in)|produced\s+by|exported\s+to|shipped\s+to|distribut(?:ed|ion)\s+(?:in|to|for)|intended\s+for|for\s+(?:the\s+)?(?:US|U\.S\.|USA|UK|EU|European|American|Chinese|market)|from\s+(?:the\s+)?(?:factory|manufacturer|supplier)|that\s+(?:is|are|was|were|has|have)|which\s+(?:is|are|was|were)|and\s+(?:I|we|the|it)|(?:I|we)\s+(?:need|want|will)|with\s+(?:batter|power)|Model\b|型号|item\s*(?:no\.?|number|#)|SKU|P\s*\/?\s*N)\b/i,
  )[0];
  name = name.split(
    /(?:[，,。；;]\s*)?(?:销往|销售(?:国家|地区|市场)?|出口到?|运往|发往|制造商(?:名称|全称)?|厂家|工厂|生产商|厂商|原产(?:国家或地区|国|地)|产自|产地|型号|货号|SKU|需要(?:做)?(?:检测|测试)|做(?:实验室)?检测|检测服务|带电|非电|样本|送样|寄送)/,
  )[0];
  name = name.replace(/^(?:一款|一个|一台|一件|这种|这个|那个|该|a|an|the|my|our|this|that)\s+/i, "").trim();
  name = name.replace(/(?:做(?:实验室)?(?:检测|测试)|的检测|的测试|for\s+(?:lab\s+)?(?:testing|test|inspection))$/i, "").trim();
  name = name.replace(/[,，。.;；:：!！?？\-~–—|/\\·•]+$/g, "").trim();
  name = name.replace(/^[,，。.;；:：\-~–—|/\\·•]+/, "").trim();

  const hasCjk = /[\u4e00-\u9fff]/.test(name);
  const maxLen = hasCjk ? 24 : 48;
  if (name.length > maxLen) {
    if (hasCjk) {
      name = name.slice(0, maxLen).replace(/[的地得了着过与和及]$/, "");
    } else {
      const cut = name.slice(0, maxLen);
      const sp = cut.lastIndexOf(" ");
      name = (sp > 12 ? cut.slice(0, sp) : cut).trim();
    }
  }
  if (
    /^(?:实验室(?:检测|测试)?|检测服务|验货|装运前(?:检测|检验)|Lab(?:oratory)?\s*(?:testing|test|inspection)?|Pre[-\s]?Shipment\s*Inspection|PSI|Inspection|Testing|EN\s*71|CPSIA|ASTM|RoHS|CE|UKCA|FCC)$/i
      .test(name)
  ) {
    return "";
  }
  if (
    /^(?:实验室|检测|测试|lab|testing|inspection)\b/i.test(name) &&
    !/(?:玩具|机器人|风扇|鼠标|Fan|Toy|Mouse|Robot)/i.test(name)
  ) {
    if (name.length > 12) return "";
  }
  const commaCount = (name.match(/[,，;；]/g) || []).length;
  if (commaCount >= 2) return "";
  if (
    /\b(?:sold\s+in|manufactured\s+by|I\s+need|lab\s+testing\s+for|销往|制造商)\b/i
      .test(name)
  ) {
    return "";
  }
  const wordCount = name.split(/\s+/).filter(Boolean).length;
  if (!hasCjk && wordCount > 8) return "";
  return name.length >= 2 ? name : "";
}

function countWords(s: string): number {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function looksLikeSentence(s: string): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length > 120) return true;
  if (
    /\b(?:I\s+need|we\s+need|please|sold\s+in|manufactured\s+by|lab\s+testing\s+for|我想|我需要|帮我|销往|制造商是)\b/i
      .test(t)
  ) {
    return true;
  }
  if (/[。.！？!?]/.test(t) && t.length > 40) return true;
  const commas = (t.match(/[,，;；]/g) || []).length;
  if (commas >= 2 && t.length > 50) return true;
  if (commas >= 3) return true;
  return false;
}

function looksLikeAddress(s: string): boolean {
  return /(?:路|街|号|区|市|省|镇|村|大道|Building|Bldg|Floor|Fl\.|Road|Rd\.|Street|St\.|Ave|Avenue|District|City|Province|Zip|邮编|P\.?O\.?\s*Box|\d{1,5}\s+[A-Za-z])/i
    .test(s);
}

function looksLikeTracking(s: string): boolean {
  const t = String(s || "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9\-]{8,32}$/.test(t)) return false;
  if (/[A-Za-z]/.test(t) && /\d/.test(t)) return true;
  if (/^\d{10,22}$/.test(t)) return true;
  return false;
}

function looksLikeCompanyName(s: string): boolean {
  const t = String(s || "").trim();
  if (!t || t.length < 2 || t.length > 80) return false;
  if (looksLikeAddress(t) && t.length > 40) return false;
  if (looksLikeTracking(t)) return false;
  if (/^(?:MADE\s+IN|Rating|Model|Address|Contact)\b/i.test(t)) return false;
  if (/\d+\s*V|\d+\s*W|\d+\s*Hz|Rated|Rating/i.test(t) && t.length < 40) {
    return false;
  }
  return /[\u4e00-\u9fffA-Za-z]/.test(t) && !looksLikeSentence(t);
}

const KNOWN_ORIGIN_RE =
  /^(?:中国|China|CN|PRC|越南|Vietnam|VN|印度|India|IN|美国|USA?|United\s+States|英国|UK|United\s+Kingdom|欧盟|EU|European\s+Union|德国|Germany|DE|法国|France|FR|意大利|Italy|IT|日本|Japan|JP|韩国|Korea|KR|加拿大|Canada|CA|澳大利亚|Australia|AU|墨西哥|Mexico|MX|泰国|Thailand|TH|马来西亚|Malaysia|MY|印尼|Indonesia|ID|台湾|Taiwan|TW|香港|Hong\s+Kong|HK)$/i;

const KNOWN_REGION_TOKEN_RE =
  /^(?:中国|欧盟|英国|美国|日本|韩国|澳大利亚|加拿大|德国|法国|意大利|越南|印度|墨西哥|泰国|马来西亚|印尼|台湾|香港|Russia|俄罗斯|南美|中东|全球|Worldwide|Global|EU|UK|USA?|China|Japan|Korea|Australia|Canada)$/i;

const KNOWN_CARRIER_RE =
  /^(?:顺丰(?:速运|快递)?|SF\s*Express|中通(?:快递)?|圆通(?:速递)?|韵达(?:快递)?|京东(?:物流|快递)?|极兔(?:速递)?|申通(?:快递)?|德邦|邮政(?:EMS)?|EMS|DHL|UPS|FedEx|TNT|Aramex|YTO|ZTO|STO|JT(?:Express)?|JD|YunExpress|4PX|Yanwen)$/i;

function isPlausibleField(key: string, value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (
    /^(n\/?a|none|null|undefined|unknown|未知|无|暂无|不清楚|not\s*available|-|—|–|\.)$/i
      .test(v)
  ) {
    return false;
  }

  switch (key) {
    case "Product Name": {
      if (v.length > 100) return false;
      if (looksLikeSentence(v)) return false;
      if (
        /^(?:实验室(?:检测|测试)?|检测服务|Lab(?:oratory)?\s*(?:testing|test)?|PSI|Inspection|Testing|EN\s*71|CPSIA)$/i
          .test(v)
      ) {
        return false;
      }
      const cleaned = cleanProductName(v);
      if (!cleaned || cleaned.length < 2) return false;
      if (cleaned.length > 80) return false;
      const hasCjk = /[\u4e00-\u9fff]/.test(cleaned);
      if (!hasCjk && countWords(cleaned) > 8) return false;
      if (hasCjk && cleaned.length > 28) return false;
      return true;
    }
    case "Program": {
      if (/^__PROGRAM_(?:TEMU_HW|TEMU_TOY)__$/.test(v)) return true;
      if (v.length > 120 || looksLikeSentence(v)) return false;
      return !!resolveProgramLabel(v);
    }
    case "Country of Origin": {
      if (v.length > 40 || looksLikeSentence(v)) return false;
      const originNorm = normalizeOrigin(v);
      if (KNOWN_ORIGIN_RE.test(originNorm) || KNOWN_ORIGIN_RE.test(v)) {
        return true;
      }
      if (/[\u4e00-\u9fff]/.test(v)) {
        return v.length >= 2 && v.length <= 12 && !looksLikeAddress(v);
      }
      return countWords(v) <= 3 && /^[A-Za-z][A-Za-z\s\-.]{1,35}$/.test(v);
    }
    case "Countries/Regions of Distribution": {
      if (v.length > 80 || looksLikeSentence(v)) return false;
      const parts = v.split(/[,，、;/|]+/).map((p) => p.trim()).filter(Boolean);
      if (!parts.length) return false;
      let ok = 0;
      for (const p of parts) {
        if (
          KNOWN_REGION_TOKEN_RE.test(p) || KNOWN_ORIGIN_RE.test(p) ||
          (p.length <= 12 && /[\u4e00-\u9fffA-Za-z]/.test(p))
        ) {
          ok += 1;
        }
      }
      return ok > 0 && ok >= Math.ceil(parts.length / 2);
    }
    case "Item#/model#": {
      if (v.length > 40 || looksLikeSentence(v) || looksLikeAddress(v)) {
        return false;
      }
      if (/^(?:No\.?|Number|#|N\/A)$/i.test(v)) return false;
      const compact = v.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9][A-Za-z0-9\-_.\/#]{0,38}$/.test(compact)) {
        if (
          !/^[A-Za-z0-9][A-Za-z0-9\-_.\/# ]{1,38}$/.test(v) ||
          countWords(v) > 3
        ) {
          return false;
        }
      }
      if (/^(?:Manufacturer|Address|Rating|Made|China|Product)$/i.test(v)) {
        return false;
      }
      return true;
    }
    case "Manufacturer": {
      if (v.length > 80 || looksLikeSentence(v)) return false;
      if (/^MADE\s+IN\b/i.test(v)) return false;
      if (looksLikeTracking(v)) return false;
      if (/\d+\s*V|\d+\s*W|\d+\s*Hz|^Rating\b/i.test(v)) return false;
      return looksLikeCompanyName(v);
    }
    case "Manufacturer Address": {
      if (v.length > 160) return false;
      if (v.length < 6) return false;
      if (/^(?:Manufacturer|Model|Rating|Contact|Company)$/i.test(v)) {
        return false;
      }
      if (looksLikeTracking(v)) return false;
      if (looksLikeAddress(v)) return true;
      if (looksLikeSentence(v)) return false;
      if (/[\u4e00-\u9fff]/.test(v) && v.length >= 8) return true;
      return v.length >= 12 && countWords(v) >= 2;
    }
    case "Sample Collection Method": {
      if (/^__SAMPLE_(?:SHIP|COLLECT|RECEIVED)__$/.test(v)) return true;
      if (v.length > 80 || looksLikeSentence(v)) return false;
      return /(?:寄送|邮寄|送样|现场收集|上门取样|已经拿到|已收到|仓库|ship|collect|received|courier|mail\s*sample)/i
        .test(v);
    }
    case "Electric Product": {
      if (/^__ELECTRIC_(?:YES|NO)__$/.test(v)) return true;
      if (
        /^(?:带电产品|非电产品|带电|非电|electric|non[-\s]?electric|yes|no)$/i
          .test(v)
      ) {
        return true;
      }
      return false;
    }
    case "Product Description": {
      if (v.length > 200 || looksLikeSentence(v)) return false;
      if (/额定|Rating|Rated|\d+\s*[VvWw]|\d+\s*Hz|电池|充电|Input|Output|电压|功率/.test(v)) {
        return true;
      }
      return v.length >= 2 && v.length <= 120 && countWords(v) <= 25;
    }
    case "Carrier": {
      if (v.length > 40 || looksLikeSentence(v)) return false;
      if (looksLikeTracking(v) && !KNOWN_CARRIER_RE.test(v)) return false;
      if (KNOWN_CARRIER_RE.test(v)) return true;
      return countWords(v) <= 4 && /[\u4e00-\u9fffA-Za-z]/.test(v) &&
        !/^\d+$/.test(v);
    }
    case "Tracking Number": {
      if (looksLikeSentence(v) || looksLikeAddress(v)) return false;
      const tr = v.replace(/[\s\-]/g, "");
      if (tr.length < 8 || tr.length > 32) return false;
      if (!/^[A-Za-z0-9]+$/.test(tr)) return false;
      if (/^(?:toy|fan|robot|product|china|made)/i.test(tr)) return false;
      return looksLikeTracking(v) ||
        (/[A-Za-z]/.test(tr) && /\d/.test(tr)) ||
        /^\d{10,22}$/.test(tr);
    }
    case "Shipping Remark": {
      if (v.length > 240) return false;
      if (
        looksLikeSentence(v) &&
        !/(?:批号|生产日期|欧代|合规标识|\bCE\b|\bUKCA\b|\bFCC\b|\bRoHS\b|Batch|Remark)/i
          .test(v)
      ) {
        return false;
      }
      return true;
    }
    default:
      return v.length > 0 && v.length <= 200 && !looksLikeSentence(v);
  }
}

function sanitizeParsedFields(
  fields: FieldMap,
  opts?: { rawExcerpt?: string },
): FieldMap {
  const out: FieldMap = {};
  for (const key of FIELD_KEYS) {
    out[key] = "";
  }
  const src = fields || {};
  for (const key of FIELD_KEYS) {
    let raw = String(src[key] || "").trim();
    if (!raw) continue;
    let candidate = raw;
    if (key === "Product Name") {
      candidate = cleanProductName(raw) || "";
    } else if (key === "Country of Origin") {
      candidate = normalizeOrigin(raw) || raw;
    } else if (key === "Program") {
      candidate = resolveProgramLabel(raw) || "";
    }
    if (!candidate || !isPlausibleField(key, candidate)) {
      out[key] = "";
      continue;
    }
    if (key === "Product Name") {
      const cleaned = cleanProductName(candidate) || candidate;
      out[key] = isPlausibleField(key, cleaned) ? cleaned : "";
    } else if (key === "Program") {
      out[key] = resolveProgramLabel(candidate) || "";
    } else {
      out[key] = candidate;
    }
  }

  ensureProgramMatched(out, { rawExcerpt: opts?.rawExcerpt || "" });

  if (opts?.rawExcerpt && out["Shipping Remark"]) {
    const excerpt = String(opts.rawExcerpt || "").replace(/\s+/g, " ").trim()
      .toLowerCase();
    const remark = out["Shipping Remark"].replace(/\s+/g, " ").trim()
      .toLowerCase();
    if (excerpt.length > 40 && remark.length > 40) {
      const overlap =
        excerpt.indexOf(remark.slice(0, Math.min(40, remark.length))) !== -1 ||
        remark.indexOf(excerpt.slice(0, Math.min(40, excerpt.length))) !== -1;
      const hasBetter = !!(
        out["Product Name"] || out["Manufacturer"] || out["Item#/model#"] ||
        out["Country of Origin"]
      );
      if (
        overlap && hasBetter &&
        !/(?:批号|生产日期|欧代|合规标识|\bce\b|\bukca\b|\bfcc\b|batch)/i.test(remark)
      ) {
        out["Shipping Remark"] = "";
      }
    }
  }

  if (out["Product Description"] && out["Product Description"].length > 200) {
    out["Product Description"] = out["Product Description"].slice(0, 200).trim();
  }
  if (out["Shipping Remark"] && out["Shipping Remark"].length > 240) {
    out["Shipping Remark"] = out["Shipping Remark"].slice(0, 240).trim();
  }
  return out;
}

function isEmptyishField(val: unknown): boolean {
  const s = String(val ?? "").trim();
  if (!s) return true;
  return /^(n\/?a|none|null|undefined|unknown|未知|无|暂无|不清楚|not\s*available|-|—|–|\.)$/i
    .test(s);
}

/** Map alternate vision/LLM keys onto canonical FIELD_KEYS. */
function canonicalizeFieldMap(
  raw: Record<string, unknown> | null | undefined,
): FieldMap {
  const out: FieldMap = {};
  if (!raw || typeof raw !== "object") return out;
  const alias: Record<string, (typeof FIELD_KEYS)[number]> = {
    "product name": "Product Name",
    product_name: "Product Name",
    productname: "Product Name",
    品名: "Product Name",
    产品名称: "Product Name",
    program: "Program",
    关联项目: "Program",
    "country of origin": "Country of Origin",
    country_of_origin: "Country of Origin",
    origin: "Country of Origin",
    "made in": "Country of Origin",
    原产国: "Country of Origin",
    原产国家或地区: "Country of Origin",
    产地: "Country of Origin",
    "countries/regions of distribution": "Countries/Regions of Distribution",
    "countries of distribution": "Countries/Regions of Distribution",
    distribution: "Countries/Regions of Distribution",
    "sales regions": "Countries/Regions of Distribution",
    销售国家或地区: "Countries/Regions of Distribution",
    "item#/model#": "Item#/model#",
    "item # / model #": "Item#/model#",
    "item/model": "Item#/model#",
    item_model: "Item#/model#",
    model: "Item#/model#",
    "model no": "Item#/model#",
    "model no.": "Item#/model#",
    "model number": "Item#/model#",
    "model#": "Item#/model#",
    sku: "Item#/model#",
    "p/n": "Item#/model#",
    pn: "Item#/model#",
    型号: "Item#/model#",
    货号: "Item#/model#",
    "货号 / 型号": "Item#/model#",
    manufacturer: "Manufacturer",
    "manufacturer name": "Manufacturer",
    company: "Manufacturer",
    factory: "Manufacturer",
    制造商: "Manufacturer",
    生产商: "Manufacturer",
    厂家: "Manufacturer",
    厂商: "Manufacturer",
    "manufacturer address": "Manufacturer Address",
    manufacturer_address: "Manufacturer Address",
    address: "Manufacturer Address",
    "factory address": "Manufacturer Address",
    制造商地址: "Manufacturer Address",
    厂址: "Manufacturer Address",
    地址: "Manufacturer Address",
    "sample collection method": "Sample Collection Method",
    "sample collection": "Sample Collection Method",
    样品收集方式: "Sample Collection Method",
    "electric product": "Electric Product",
    "electrical product": "Electric Product",
    产品是否带电: "Electric Product",
    "product description": "Product Description",
    rating: "Product Description",
    产品说明: "Product Description",
    carrier: "Carrier",
    快递公司: "Carrier",
    "tracking number": "Tracking Number",
    "tracking no": "Tracking Number",
    运单号: "Tracking Number",
    "shipping remark": "Shipping Remark",
    remark: "Shipping Remark",
    remarks: "Shipping Remark",
    备注: "Shipping Remark",
    物流备注: "Shipping Remark",
  };
  for (const [key, value] of Object.entries(raw)) {
    if (isEmptyishField(value)) continue;
    const text = String(value).trim();
    let canon: (typeof FIELD_KEYS)[number] | undefined;
    if ((FIELD_KEYS as readonly string[]).includes(key)) {
      canon = key as (typeof FIELD_KEYS)[number];
    } else {
      canon = alias[key.trim().toLowerCase()];
    }
    if (!canon) continue;
    if (!out[canon]) out[canon] = text;
  }
  return out;
}

function normalizeOrigin(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (
    low.includes("china") ||
    s.includes("中国") ||
    /\bcn\b/i.test(s) ||
    low.includes("p.r.c") ||
    low.includes("prc") ||
    low.includes("made in china")
  ) {
    return "中国";
  }
  if (low.includes("vietnam") || s.includes("越南")) return "越南";
  if (low.includes("india") || s.includes("印度")) return "印度";
  if (low.includes("aland") || low.includes("åland") || s.includes("奥兰")) {
    return "奥兰群岛";
  }
  return s.replace(/^made\s+in\s+/i, "").trim();
}

function regionsFromMarks(marks: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  if (!marks) return found;
  const items = Array.isArray(marks)
    ? marks
    : String(marks).split(/[,，/\s]+/);
  for (const item of items) {
    let key = String(item || "").trim().toUpperCase().replace(/\./g, "");
    if (!key || key === "ROHS") continue;
    let regions = MARK_TO_REGIONS[key] ||
      MARK_TO_REGIONS[key.replace("MARK", "")];
    if (!regions && key.includes("UKCA")) regions = MARK_TO_REGIONS.UKCA;
    if (!regions && (key === "CE" || key === "ＣＥ")) {
      regions = MARK_TO_REGIONS.CE;
    }
    if (!regions) continue;
    for (const region of regions) {
      if (!seen.has(region)) {
        seen.add(region);
        found.push(region);
      }
    }
  }
  return found;
}

function mergeRegionList(...parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const mapping: Record<string, string> = {
    "european union": "欧盟",
    eu: "欧盟",
    europe: "欧盟",
    "united states": "美国",
    usa: "美国",
    us: "美国",
    "u.s.a": "美国",
    "u.s.": "美国",
    "united kingdom": "英国",
    uk: "英国",
    "great britain": "英国",
    australia: "澳大利亚",
    canada: "加拿大",
    "south africa": "南非",
    china: "中国",
  };
  for (const part of parts) {
    if (!part) continue;
    for (const token of String(part).split(/[,，、;/|]+/)) {
      let region = token.trim();
      if (!region) continue;
      region = mapping[region.toLowerCase()] || region;
      if (!seen.has(region)) {
        seen.add(region);
        out.push(region);
      }
    }
  }
  return out.join("、");
}

function buildShippingRemark(extra: Record<string, unknown>): string {
  const bits: string[] = [];
  const batch = String(extra.Batch || extra.batch || "").trim();
  const date = String(
    extra["Date of manufacture"] ||
      extra["Manufacture Date"] ||
      extra.date ||
      "",
  ).trim();
  const ec = String(extra["EC REP"] || extra.ec_rep || "").trim();
  const marks = extra.marks || extra.compliance_marks || [];
  const marksS = Array.isArray(marks)
    ? marks.map((m) => String(m).trim()).filter(Boolean).join("、")
    : String(marks || "").trim();
  if (batch) bits.push(`批号：${batch}`);
  if (date) bits.push(`生产日期：${date}`);
  if (ec) bits.push(`欧代：${ec}`);
  if (marksS) bits.push(`合规标识：${marksS}`);
  return bits.join("；");
}

async function extractDocx(data: Uint8Array): Promise<string> {
  const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
  const zip = await JSZip.loadAsync(data);
  const file = zip.file("word/document.xml");
  if (!file) return "";
  const xml = await file.async("string");
  return xml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(data: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import(
      "https://esm.sh/unpdf@0.12.1"
    );
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text || "").trim();
  } catch (err) {
    console.error("pdf extract failed", err);
    return "";
  }
}

function extractPlain(data: Uint8Array): string {
  const encodings: string[] = ["utf-8", "gb18030", "latin-1"];
  for (const enc of encodings) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(data);
    } catch {
      /* try next */
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

async function ocrImageStructured(
  data: Uint8Array,
  mime: string,
  _filename: string,
): Promise<Record<string, unknown>> {
  const b64 = bytesToBase64(data);
  let media = mime.startsWith("image/") ? mime : "image/jpeg";
  if (media === "application/octet-stream") media = "image/jpeg";
  const prompt =
    "你是产品标签/合格证/铭牌识别助手。请仔细阅读图片中的全部文字与标识，" +
    "抽取检测下单所需字段，只返回合法 JSON（不要 markdown）。\n" +
    "字段说明：\n" +
    '- "Product Name": 简短产品名称 ONLY（如 Electric Fan、Toy Race Car、智能机器人玩具）。' +
    '不要整句、不要「实验室检测 · xxx」、不要销往/制造商/型号后缀。从语音长句中只抠出品名\n' +
    '- "Item#/model#": 型号/货号，优先取 Model / Model No / 型号 / SKU / Item No / P/N（如 XP-085、XY-03）。键名必须是 Item#/model#，不要用 Model\n' +
    '- "Manufacturer": 制造商公司全称（Manufacturer / Manufactured by / 制造商）\n' +
    '- "Manufacturer Address": 制造商地址完整一行（Address / 厂址）；不要把欧代地址当作制造商地址\n' +
    '- "Country of Origin": 原产国（优先 MADE IN / Manufacturing location，值用简体如「中国」）\n' +
    '- "Batch": 批号/Batch\n' +
    '- "Date of manufacture": 生产日期\n' +
    '- "Rating": 额定参数原文（如 110/240~, 50/60Hz, 60W）\n' +
    '- "Electric Product": 是否带电，填「带电产品」或「非电产品」；' +
    "有电压/功率/Hz/电池/充电/电机/Electric 等视为带电产品\n" +
    '- "Product Description": 带电说明，可写入 Rating / 电池 / 充电方式\n' +
    '- "EC REP": 欧代公司+地址（如有 EC REP）\n' +
    '- "UK REP": 英代（如有）\n' +
    '- "marks": 图片上出现的合规标识数组，可能含 CE, UKCA, FC, FCC, RoHS, WEEE 等\n' +
    '- "Countries/Regions of Distribution": 销售国家/地区；' +
    "若未写明，则根据标识/代表处推断：CE/EC REP/Triman→欧盟，UKCA/UK REP→英国，FC/FCC→美国，CCC→中国，RCM→澳大利亚\n" +
    '- "ocr_text": 关键可见关键文字要点（简体）\n' +
    "无法确定的字段用空字符串；marks 用数组。";

  const raw = await nvidiaChat({
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${media};base64,${b64}` },
          },
        ],
      },
    ],
    max_tokens: 1600,
    temperature: 0.05,
  });
  try {
    return parseJsonFromLlm(raw);
  } catch {
    return { ocr_text: raw, marks: [] };
  }
}

function labelDictToSnippet(
  label: Record<string, unknown>,
  filename: string,
): string {
  const lines = [`【产品标签识别: ${filename}】`];
  for (
    const key of [
      "Product Name",
      "Item#/model#",
      "Manufacturer",
      "Manufacturer Address",
      "Country of Origin",
      "Countries/Regions of Distribution",
      "Batch",
      "Date of manufacture",
      "EC REP",
      "UK REP",
      "Rating",
      "Electric Product",
      "Product Description",
      "ocr_text",
    ]
  ) {
    const val = label[key];
    if (val) lines.push(`${key}: ${val}`);
  }
  const marks = label.marks || [];
  if (Array.isArray(marks) && marks.length) {
    lines.push("marks: " + marks.map(String).join(", "));
  }
  return lines.join("\n");
}

async function extractFile(
  filename: string,
  mime: string,
  data: Uint8Array,
): Promise<{ text: string; label: Record<string, unknown> | null }> {
  const lower = filename.toLowerCase();
  try {
    if (isImage(filename, mime)) {
      const label = await ocrImageStructured(data, mime, filename);
      return { text: labelDictToSnippet(label, filename), label };
    }
    if (mime === "application/pdf" || lower.endsWith(".pdf")) {
      const text = await extractPdf(data);
      if (text) return { text: `【文件: ${filename}】\n${text}`, label: null };
      return {
        text: `[PDF ${filename}: 未提取到文本，建议上传照片或截图]`,
        label: null,
      };
    }
    if (
      mime.includes("wordprocessingml") ||
      lower.endsWith(".docx") ||
      lower.endsWith(".doc")
    ) {
      if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) {
        const text = await extractDocx(data);
        return { text: `【文件: ${filename}】\n${text}`, label: null };
      }
      return { text: `[Word ${filename}: 仅支持 .docx]`, label: null };
    }
    if (mime.startsWith("text/") || /\.(txt|csv|md)$/i.test(lower)) {
      return {
        text: `【文件: ${filename}】\n${extractPlain(data)}`,
        label: null,
      };
    }
  } catch (exc) {
    return { text: `[${filename}: 提取失败 ${exc}]`, label: null };
  }
  return {
    text: `[${filename}: 暂不支持的格式，请上传图片/PDF/DOCX]`,
    label: null,
  };
}

function seedFieldsFromLabels(
  labels: Record<string, unknown>[],
): FieldMap {
  const seed: FieldMap = Object.fromEntries(FIELD_KEYS.map((k) => [k, ""]));
  const remarkBits: string[] = [];
  const regions: string[] = [];
  for (const label of labels) {
    const flat = canonicalizeFieldMap(label);
    for (
      const key of [
        "Product Name",
        "Item#/model#",
        "Manufacturer",
        "Manufacturer Address",
      ] as const
    ) {
      const val = String(flat[key] || "").trim();
      if (val && !seed[key]) {
        seed[key] = key === "Product Name" ? (cleanProductName(val) || "") : val;
      }
    }
    const origin = normalizeOrigin(String(flat["Country of Origin"] || ""));
    if (origin && !seed["Country of Origin"]) {
      seed["Country of Origin"] = origin;
    }
    regions.push(String(flat["Countries/Regions of Distribution"] || ""));
    regions.push(...regionsFromMarks(label.marks));
    if (String(label["EC REP"] || "").trim()) regions.push("欧盟");
    if (String(label["UK REP"] || "").trim()) regions.push("英国");

    const elec = String(flat["Electric Product"] || "").trim();
    if (elec && !seed["Electric Product"]) {
      if (/非电|non[-\s]?electric|no/i.test(elec)) {
        seed["Electric Product"] = "非电产品";
      } else if (/带电|electric|yes/i.test(elec)) {
        seed["Electric Product"] = "带电产品";
      }
    }
    const rating = String(
      flat["Product Description"] || label.Rating || "",
    ).trim();
    if (rating && !seed["Product Description"]) {
      seed["Product Description"] = rating.startsWith("额定")
        ? rating
        : /V|W|Hz|电池|充电|Rated|Rating/i.test(rating)
        ? `额定：${rating}`
        : rating;
      if (
        !seed["Electric Product"] &&
        /\d+\s*V|\d+\s*W|\d+\s*Hz|电池|充电|Electric/i.test(rating)
      ) {
        seed["Electric Product"] = "带电产品";
      }
    }
    if (!seed.Program) {
      const hintBlob = [
        seed["Product Name"],
        seed["Product Description"],
        seed["Electric Product"],
        String(label.ocr_text || ""),
      ].join("\n");
      seed.Program = matchProgramFromText(hintBlob, {
        productName: seed["Product Name"] || "",
        electricYes: /带电|electric/i.test(seed["Electric Product"] || ""),
      });
    }
    const extraRemark = buildShippingRemark(label);
    if (extraRemark) remarkBits.push(extraRemark);
  }
  seed["Countries/Regions of Distribution"] = mergeRegionList(...regions);
  if (remarkBits.length && !seed["Shipping Remark"]) {
    seed["Shipping Remark"] = remarkBits.join("；");
  }
  return seed;
}

function normalizeResult(
  parsed: Record<string, unknown>,
  seedFields: FieldMap,
): Record<string, unknown> {
  const fieldsInRaw =
    parsed.fields && typeof parsed.fields === "object"
      ? parsed.fields as Record<string, unknown>
      : {};
  const fieldsIn = canonicalizeFieldMap(fieldsInRaw);
  let fields: FieldMap = {};
  for (const key of FIELD_KEYS) {
    let val = fieldsIn[key];
    if (isEmptyishField(val)) val = seedFields[key] || "";
    fields[key] = val != null ? String(val).trim() : "";
  }
  if (fields["Product Name"]) {
    fields["Product Name"] = cleanProductName(fields["Product Name"]) || "";
  }
  if (fields["Country of Origin"]) {
    fields["Country of Origin"] = normalizeOrigin(fields["Country of Origin"]);
  }
  if (fields.Program) {
    fields.Program = resolveProgramLabel(fields.Program) || fields.Program;
  }
  fields["Countries/Regions of Distribution"] = mergeRegionList(
    seedFields["Countries/Regions of Distribution"] || "",
    fields["Countries/Regions of Distribution"] || "",
  );
  if (!fields["Shipping Remark"] && seedFields["Shipping Remark"]) {
    fields["Shipping Remark"] = seedFields["Shipping Remark"];
  } else if (fields["Shipping Remark"] && seedFields["Shipping Remark"]) {
    if (!fields["Shipping Remark"].includes(seedFields["Shipping Remark"])) {
      fields["Shipping Remark"] += "；" + seedFields["Shipping Remark"];
    }
  }
  // Prefer richer seed Manufacturer / Model / Address when LLM left them blankish
  for (
    const key of [
      "Item#/model#",
      "Manufacturer",
      "Manufacturer Address",
      "Electric Product",
      "Product Description",
    ] as const
  ) {
    if (isEmptyishField(fields[key]) && seedFields[key]) {
      fields[key] = seedFields[key];
    }
  }

  const excerpt = String(parsed.raw_excerpt || "").slice(0, 500);
  // Plausibility gate — drop clearly unreasonable OCR/LLM junk per field
  fields = sanitizeParsedFields(fields, { rawExcerpt: excerpt });

  const summaryIn =
    parsed.product_summary && typeof parsed.product_summary === "object"
      ? parsed.product_summary as Record<string, unknown>
      : {};
  let summaryName = String(summaryIn.name || fields["Product Name"] || "").trim();
  summaryName = cleanProductName(summaryName) || "";
  if (summaryName && !isPlausibleField("Product Name", summaryName)) {
    summaryName = "";
  }
  if (!summaryName) summaryName = fields["Product Name"] || "";
  const productSummary = {
    name: summaryName,
    brand: String(summaryIn.brand || "").trim(),
    hint: String(summaryIn.hint || "").trim(),
  };
  const confidence =
    parsed.confidence && typeof parsed.confidence === "object"
      ? parsed.confidence
      : {};

  return {
    product_summary: productSummary,
    fields,
    confidence,
    raw_excerpt: excerpt,
  };
}

async function structureFields(
  context: string,
  seedFields: FieldMap,
): Promise<Record<string, unknown>> {
  const fieldList = FIELD_KEYS.map((k) => `- "${k}"`).join("\n");
  const system =
    "你是 QIMA 检测订单信息抽取助手。根据用户提供的语音、文档、产品标签识别结果和商品链接，" +
    "抽取订单字段。必须输出合法 JSON，不要 markdown。字段值可用简体中文或与原文一致的英文品名。\n" +
    "规则：\n" +
    "1) Product Name：只填简洁产品名（2–8 个英文词或 ≤24 个汉字），例如「Toy Race Car」「智能机器人玩具」。" +
    "禁止整句语音、禁止「Lab testing · … / 实验室检测 · …」、禁止带上 sold in / manufactured by / 销往 / 制造商 / 型号等从句。" +
    "从 rambling 语音中智能抠出品名，其余信息分别写入对应字段。\n" +
    "2) Country of Origin：MADE IN CHINA / Manufacturing location 含 China →「中国」\n" +
    "3) Countries/Regions of Distribution：CE/EC REP/Triman→欧盟，UKCA/UK REP→英国，" +
    "FC/FCC→美国；多个用顿号「、」连接\n" +
    "4) Item#/model# 取 Model / Model No / SKU / 货号（不要把 NO/Number 当成型号）\n" +
    "5) Electric Product：有电压/功率/Hz/电池/充电/电机/Electric/Rating 填「带电产品」，" +
    "明确非电填「非电产品」，否则空字符串\n" +
    "6) Product Description：带电时写入 Rating/电池/充电等要点\n" +
    "7) Shipping Remark 可汇总批号、生产日期、欧代、合规标识\n" +
    "8) Program：只能从下列固定列表中选择完整字符串之一，禁止自创：" +
    PROGRAM_CATALOG.map((p) => `「${p}」`).join("、") +
    "。根据品名/品类推断：玩具→Toys，睡衣→Textile Sleepwear，纺织/面料非睡衣→Textile Non-Sleepwear，" +
    "食品接触/FCM→FCM，眼镜/PPE→Eyewear，电子/电压/风扇→Electric product，杂货/五金→Hardware，" +
    "只做MSDS→MSDS，SH-Self 字样→SH-Self，字面 DEFAULT→DEFAULT。" +
    "付款方：TEMU Pay / TEMU 付款 vs Seller Pay / 商家付款；未提及付款方时默认 Seller Pay 变体（若该品类有）。" +
    "置信度不足则 Program 留空字符串。\n" +
    "9) 无法确定或明显不合理的字段留空字符串，不要编造、不要把整段语音塞进任一字段\n" +
    'JSON：{"product_summary":{"name":"短品名","brand":"","hint":""},' +
    '"fields":{...},"confidence":{...},"raw_excerpt":""}';

  const seedNote = Object.values(seedFields).some(Boolean)
    ? "\n\n已从标签直接识别的候选字段（可校对合并）：\n" +
      JSON.stringify(seedFields)
    : "";
  const user =
    `请从以下资料抽取订单字段。\n\n字段列表：\n${fieldList}\n\n` +
    `资料内容：\n${context.slice(0, 24000)}${seedNote}\n\n只返回 JSON。`;

  const raw = await nvidiaChat({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 2048,
  });
  const parsed = parseJsonFromLlm(raw);
  return normalizeResult(parsed, seedFields);
}

async function parseOrderRequest(
  voiceText: string,
  link: string,
  files: { filename: string; mime: string; data: Uint8Array }[],
): Promise<Record<string, unknown>> {
  const chunks: string[] = [];
  const labels: Record<string, unknown>[] = [];
  if (voiceText) chunks.push(`【语音转写】\n${voiceText}`);
  if (link) chunks.push(`【商品链接】\n${link}`);
  for (const item of files) {
    const { text, label } = await extractFile(
      item.filename,
      item.mime,
      item.data,
    );
    if (text.trim()) chunks.push(text);
    if (label) labels.push(label);
  }
  const context = chunks.join("\n\n").trim();
  if (!context) throw new Error("empty_input");
  const seed = seedFieldsFromLabels(labels);
  try {
    return await structureFields(context, seed);
  } catch (err) {
    if (FIELD_KEYS.some((k) => seed[k])) {
      return {
        product_summary: {
          name: seed["Product Name"] || "",
          brand: "",
          hint: "来自产品标签识别",
        },
        fields: seed,
        confidence: {},
        raw_excerpt: context.slice(0, 500),
      };
    }
    throw err;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: "invalid_multipart" }, 400, origin);
  }

  const voiceText = String(form.get("voice_text") || "").trim();
  const link = String(form.get("link") || "").trim();
  const files: { filename: string; mime: string; data: Uint8Array }[] = [];

  for (const [name, value] of form.entries()) {
    if (name !== "files" && !String(name).startsWith("files")) continue;
    if (!(value instanceof File)) continue;
    if (files.length >= MAX_FILES) continue;
    if (value.size <= 0) continue;
    if (value.size > MAX_FILE_BYTES) {
      return jsonResponse({ error: "file_too_large" }, 413, origin);
    }
    const buf = new Uint8Array(await value.arrayBuffer());
    files.push({
      filename: value.name || "upload.bin",
      mime: (value.type || "application/octet-stream").toLowerCase(),
      data: buf,
    });
  }

  if (!voiceText && !link && !files.length) {
    return jsonResponse({ error: "empty_input" }, 400, origin);
  }

  try {
    const result = await parseOrderRequest(voiceText, link, files);
    return jsonResponse(result, 200, origin);
  } catch (err) {
    const code = err instanceof Error ? err.message : "upstream_failed";
    console.error("parse-order error", err);
    if (code === "empty_input") {
      return jsonResponse({ error: code }, 400, origin);
    }
    if (code === "missing_nvidia_key") {
      return jsonResponse({ error: code }, 503, origin);
    }
    if (code.startsWith("upstream_http_")) {
      return jsonResponse({ error: code }, 502, origin);
    }
    return jsonResponse({ error: "upstream_failed" }, 502, origin);
  }
});
