const PAYMENT_PROVIDERS = [
  { id: "freedom", name: "Freedom Pay", accent: "#16a34a" },
  { id: "kaspi", name: "Kaspi", accent: "#ef4444" },
  { id: "card", name: "Банковская карта", accent: "#7c3aed" }
];

const DEFAULT_API_URL = "https://api.freedompay.kz";
const INIT_PAYMENT_SCRIPT = "init_payment.php";

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function text(payload, status = 200, headers = {}) {
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...headers
    }
  });
}

function envValue(env, key, fallback = "") {
  const value = env?.[key];
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function boolEnv(env, key, fallback = true) {
  const value = env?.[key];
  if (value === undefined || value === null || value === "") return fallback;
  return String(value) !== "false";
}

function cleanBaseUrl(value) {
  return String(value || DEFAULT_API_URL).replace(/\/+$/, "");
}

function randomId(length = 12) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function generateCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

function normalizePhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutesIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function getLegalInfo(env) {
  return {
    companyName: envValue(env, "LEGAL_COMPANY_NAME", "ИП ORIGINAL BAR"),
    bin: envValue(env, "LEGAL_BIN", "980311451341"),
    address: envValue(
      env,
      "LEGAL_ADDRESS",
      "Усть-Каменогорск Г.А., Усть-Каменогорск, УЛИЦА 30-Й ГВАРДЕЙСКОЙ ДИВИЗИИ, дом 46, кв/офис 38"
    ),
    phone: envValue(env, "LEGAL_PHONE", "+77711546680"),
    email: envValue(env, "LEGAL_EMAIL", "eshenbaev@gmail.com"),
    bankAccount: envValue(env, "LEGAL_BANK_ACCOUNT", "KZ71722S000029932182"),
    bankName: envValue(env, "LEGAL_BANK_NAME", "АО \"Kaspi Bank\""),
    bankBik: envValue(env, "LEGAL_BANK_BIK", "CASPKZKA"),
    bankKbe: envValue(env, "LEGAL_BANK_KBE", "19")
  };
}

function getFreedomPayConfig(env, request) {
  const merchantId = envValue(env, "FREEDOMPAY_MERCHANT_ID");
  const secretKey = envValue(env, "FREEDOMPAY_SECRET_KEY");
  const requestUrl = new URL(request.url);
  const siteUrl = envValue(env, "PUBLIC_SITE_URL", requestUrl.origin).replace(/\/+$/, "");

  return {
    merchantId,
    secretKey,
    apiUrl: cleanBaseUrl(envValue(env, "FREEDOMPAY_API_URL", DEFAULT_API_URL)),
    siteUrl,
    testingMode: boolEnv(env, "FREEDOMPAY_TESTING_MODE", true),
    demoMode: boolEnv(env, "FREEDOMPAY_DEMO_MODE", true),
    configured: Boolean(merchantId && secretKey)
  };
}

function stripEmpty(value) {
  return value === undefined || value === null || value === "";
}

function collectSignatureValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSignatureValues(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => collectSignatureValues(value[key]));
  }

  return [String(value)];
}

function md5(input) {
  function add32(a, b) {
    return (a + b) & 0xffffffff;
  }

  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function cycle(x, k) {
    let [a, b, c, d] = x;

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  const bytes = Array.from(new TextEncoder().encode(input));
  const originalBitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const lowBits = originalBitLength >>> 0;
  const highBits = Math.floor(originalBitLength / 0x100000000) >>> 0;
  for (let i = 0; i < 4; i += 1) bytes.push((lowBits >>> (8 * i)) & 0xff);
  for (let i = 0; i < 4; i += 1) bytes.push((highBits >>> (8 * i)) & 0xff);

  const state = [1732584193, -271733879, -1732584194, 271733878];
  for (let i = 0; i < bytes.length; i += 64) {
    const block = [];
    for (let j = 0; j < 64; j += 4) {
      block.push(bytes[i + j] | (bytes[i + j + 1] << 8) | (bytes[i + j + 2] << 16) | (bytes[i + j + 3] << 24));
    }
    cycle(state, block);
  }

  return state
    .flatMap((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff])
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createSignature(scriptName, params, secretKey) {
  const sortedValues = Object.keys(params)
    .filter((key) => key !== "pg_sig" && !stripEmpty(params[key]))
    .sort()
    .flatMap((key) => collectSignatureValues(params[key]));

  return md5([scriptName, ...sortedValues, secretKey].join(";"));
}

function signParams(scriptName, params, secretKey) {
  const signed = {
    ...params,
    pg_salt: params.pg_salt || randomId(16)
  };
  signed.pg_sig = createSignature(scriptName, signed, secretKey);
  return signed;
}

function verifySignature(scriptName, params, secretKey) {
  if (!params?.pg_sig || !secretKey) return false;
  return String(params.pg_sig) === createSignature(scriptName, params, secretKey);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSignedXmlResponse(scriptName, params, secretKey) {
  const signed = signParams(scriptName, params, secretKey);
  const body = Object.entries(signed)
    .map(([key, value]) => `    <${key}>${escapeXml(value)}</${key}>`)
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>\n<response>\n${body}\n</response>`;
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseFreedomPayResponse(textValue, contentType = "") {
  const raw = String(textValue || "").trim();
  if (!raw) return {};

  if (contentType.includes("application/json") || raw.startsWith("{")) {
    return JSON.parse(raw);
  }

  const result = {};
  const tagPattern = /<([a-zA-Z0-9_:-]+)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = tagPattern.exec(raw))) {
    const [, key, value] = match;
    if (key !== "response") {
      result[key] = decodeXml(value.replace(/^<!\[CDATA\[|\]\]>$/g, ""));
    }
  }
  return result;
}

function getScriptNameFromPath(pathname) {
  return pathname.split("/").filter(Boolean).pop() || "";
}

async function getRequestParams(request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  if (request.method === "GET" || request.method === "HEAD") return params;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return { ...params, ...(body && typeof body === "object" ? body : {}) };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return { ...params, ...Object.fromEntries(form.entries()) };
  }

  return params;
}

async function createFreedomPayPayment(order, point, config) {
  if (!config.configured) {
    throw new Error("FreedomPay MID или secret key не настроены");
  }
  if (!config.siteUrl) {
    throw new Error("PUBLIC_SITE_URL нужен для callback URL FreedomPay");
  }

  const params = signParams(
    INIT_PAYMENT_SCRIPT,
    {
      pg_merchant_id: config.merchantId,
      pg_order_id: order.id,
      pg_amount: Number(order.amount).toFixed(2),
      pg_currency: "KZT",
      pg_description: `Аренда полотенец ${point.name}, чек ${order.receiptId}`,
      pg_testing_mode: config.testingMode ? "true" : "false",
      pg_auto_clearing: "1",
      pg_lifetime: "900",
      pg_language: "ru",
      pg_payment_method: "bankcard",
      pg_request_method: "GET",
      pg_check_url: `${config.siteUrl}/api/payments/freedom/check`,
      pg_result_url: `${config.siteUrl}/api/payments/freedom/result`,
      pg_success_url: `${config.siteUrl}/api/payments/freedom/success`,
      pg_failure_url: `${config.siteUrl}/api/payments/freedom/failure`,
      pg_success_url_method: "GET",
      pg_failure_url_method: "GET",
      pg_site_url: config.siteUrl,
      pg_user_phone: order.phone,
      softloop_receipt_id: order.receiptId
    },
    config.secretKey
  );

  const form = new FormData();
  Object.entries(params).forEach(([key, value]) => form.set(key, String(value)));

  const response = await fetch(`${config.apiUrl}/${INIT_PAYMENT_SCRIPT}`, {
    method: "POST",
    body: form
  });
  const raw = await response.text();
  const parsed = parseFreedomPayResponse(raw, response.headers.get("content-type") || "");

  if (!response.ok) {
    throw new Error(parsed.pg_error_description || parsed.message || `FreedomPay HTTP ${response.status}`);
  }

  if (parsed.pg_sig && !verifySignature(INIT_PAYMENT_SCRIPT, parsed, config.secretKey)) {
    throw new Error("FreedomPay вернул ответ с некорректной подписью");
  }

  if (parsed.pg_status && parsed.pg_status !== "ok") {
    throw new Error(parsed.pg_error_description || parsed.pg_description || "FreedomPay не создал платеж");
  }

  if (!parsed.pg_redirect_url) {
    throw new Error("FreedomPay не вернул pg_redirect_url");
  }

  return parsed;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function pointFromRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    city: row.city,
    address: row.address,
    pricePerTowel: row.price_per_towel,
    cleanOnShelf: row.clean_on_shelf,
    employees: parseJson(row.employees_json, [])
  };
}

function orderFromRow(row) {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    paymentReference: row.payment_reference,
    pointId: row.point_id,
    pointName: row.point_name,
    phone: row.phone,
    customerName: row.customer_name,
    towelCount: row.towel_count,
    amount: row.amount,
    providerId: row.provider_id,
    providerName: row.provider_name,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentCreatedAt: row.payment_created_at,
    paidAt: row.paid_at,
    issuedAt: row.issued_at,
    returnedAt: row.returned_at,
    paymentRedirectUrl: row.payment_redirect_url,
    freedomPaymentId: row.freedom_payment_id,
    freedomPayCreatedAt: row.freedom_pay_created_at,
    paymentError: row.payment_error,
    freedomResult: parseJson(row.freedom_result_json, null),
    freedomResultResponse: parseJson(row.freedom_result_response_json, null),
    createdAt: row.created_at
  };
}

function customerFromRow(row) {
  return {
    phone: row.phone,
    name: row.name,
    createdAt: row.created_at
  };
}

function verificationFromRow(row) {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    code: row.code,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    telegramChatId: row.telegram_chat_id,
    telegramUserId: row.telegram_user_id,
    telegramLinkedAt: row.telegram_linked_at,
    chatId: row.chat_id,
    verifiedAt: row.verified_at
  };
}

async function listPoints(db) {
  const { results } = await db.prepare("SELECT * FROM points ORDER BY id").all();
  return results.map(pointFromRow);
}

async function listOrders(db) {
  const { results } = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  return results.map(orderFromRow);
}

async function listCustomers(db) {
  const { results } = await db.prepare("SELECT * FROM customers ORDER BY created_at DESC").all();
  return results.map(customerFromRow);
}

async function publicDb(env, request) {
  const [points, orders, customers] = await Promise.all([
    listPoints(env.DB),
    listOrders(env.DB),
    listCustomers(env.DB)
  ]);
  const freedomPayConfig = getFreedomPayConfig(env, request);

  return {
    points,
    orders,
    customers,
    paymentProviders: PAYMENT_PROVIDERS,
    freedomPay: {
      configured: freedomPayConfig.configured,
      testingMode: freedomPayConfig.testingMode,
      demoMode: freedomPayConfig.demoMode
    },
    legal: getLegalInfo(env),
    demoMode: boolEnv(env, "TELEGRAM_DEMO_MODE", true),
    botUsername: envValue(env, "TELEGRAM_BOT_USERNAME", null)
  };
}

function createStats(points, orders) {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const paidOrders = orders.filter((order) => order.paidAt);
  const returnedOrders = orders.filter((order) => order.issuedAt && order.returnedAt);
  const dayRevenue = paidOrders
    .filter((order) => new Date(order.paidAt).getTime() >= startOfDay.getTime())
    .reduce((sum, order) => sum + order.amount, 0);
  const monthRevenue = paidOrders
    .filter((order) => new Date(order.paidAt).getTime() >= startOfMonth.getTime())
    .reduce((sum, order) => sum + order.amount, 0);
  const averageUseMinutes = returnedOrders.length
    ? Math.round(
        returnedOrders.reduce((sum, order) => {
          return sum + (new Date(order.returnedAt).getTime() - new Date(order.issuedAt).getTime()) / 60000;
        }, 0) / returnedOrders.length
      )
    : 0;

  const timeline = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    date.setHours(0, 0, 0, 0);
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const revenue = paidOrders
      .filter((order) => {
        const paidAt = new Date(order.paidAt).getTime();
        return paidAt >= date.getTime() && paidAt < next.getTime();
      })
      .reduce((sum, order) => sum + order.amount, 0);
    return {
      day: date.toLocaleDateString("ru-RU", { weekday: "short" }),
      revenue
    };
  });

  return {
    dayRevenue,
    monthRevenue,
    averageUseMinutes,
    paidCount: paidOrders.length,
    activeCount: orders.filter((order) => order.status === "in_use").length,
    forgotten: orders.filter((order) => {
      if (!order.issuedAt || order.returnedAt) return false;
      return now - new Date(order.issuedAt).getTime() > 4 * 60 * 60 * 1000;
    }),
    timeline,
    network: points.map((point) => {
      const pointOrders = orders.filter((order) => order.pointId === point.id);
      return {
        ...point,
        revenue: pointOrders.reduce((sum, order) => sum + order.amount, 0),
        active: pointOrders.filter((order) => order.status === "in_use").length,
        paidAwaiting: pointOrders.filter((order) => order.status === "paid").length
      };
    })
  };
}

async function getPointOrThrow(db, pointId) {
  const row = await db.prepare("SELECT * FROM points WHERE id = ? OR code = ?").bind(pointId, pointId).first();
  if (!row) {
    const error = new Error("Точка не найдена");
    error.status = 404;
    throw error;
  }
  return pointFromRow(row);
}

async function getOrder(db, id) {
  const row = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  return row ? orderFromRow(row) : null;
}

function generateReceiptId(point) {
  const date = new Date();
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const pointCode = String(point.id || "SL").slice(0, 3).toUpperCase();
  return `SL-${pointCode}-${y}${m}${d}-${randomId(6).toUpperCase()}`;
}

function generatePaymentReference(provider) {
  return `${provider.id.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${randomId(8).toUpperCase()}`;
}

function publicOrder(order) {
  if (!order) return null;
  return {
    ...order,
    phone: order.phone ? `${String(order.phone).slice(0, 4)}***${String(order.phone).slice(-2)}` : ""
  };
}

function isVerificationExpired(verification) {
  return verification.expiresAt && new Date(verification.expiresAt).getTime() < Date.now();
}

async function telegram(env, method, payload = {}) {
  const token = envValue(env, "TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Telegram bot token is not configured");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.description || `Telegram ${method} failed`);
  return body;
}

function contactKeyboard() {
  return {
    resize_keyboard: true,
    one_time_keyboard: true,
    keyboard: [[{ text: "Отправить номер", request_contact: true }]]
  };
}

async function linkTelegramCode(db, code, message) {
  const chatId = String(message.chat.id);
  const userId = message.from?.id ? String(message.from.id) : "";
  const row = await db
    .prepare("SELECT * FROM verifications WHERE code = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1")
    .bind(code)
    .first();
  const verification = row ? verificationFromRow(row) : null;

  if (!verification || isVerificationExpired(verification)) {
    return { ok: false, reason: "Код не найден или устарел" };
  }

  await db
    .prepare(
      "UPDATE verifications SET telegram_chat_id = ?, telegram_user_id = ?, telegram_linked_at = ? WHERE id = ?"
    )
    .bind(chatId, userId, nowIso(), verification.id)
    .run();

  return { ok: true, verification };
}

async function handleTelegramMessage(env, message) {
  const db = env.DB;
  const chatId = String(message.chat.id);
  const userId = message.from?.id ? String(message.from.id) : "";
  const messageText = message.text?.trim();

  if (messageText?.startsWith("/start")) {
    const [, code] = messageText.split(" ");
    if (code) {
      const result = await linkTelegramCode(db, code, message);
      await telegram(env, "sendMessage", {
        chat_id: chatId,
        text: result.ok
          ? "Код принят. Теперь отправьте контакт кнопкой ниже, чтобы подтвердить номер для аренды."
          : result.reason,
        reply_markup: result.ok ? contactKeyboard() : { remove_keyboard: true }
      });
      return;
    }
  }

  if (/^\d{6}$/.test(messageText || "")) {
    const result = await linkTelegramCode(db, messageText, message);
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: result.ok ? "Отлично. Теперь отправьте контакт кнопкой ниже." : result.reason,
      reply_markup: result.ok ? contactKeyboard() : { remove_keyboard: true }
    });
    return;
  }

  if (!message.contact) return;

  if (message.contact.user_id && userId && String(message.contact.user_id) !== userId) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "Отправьте именно свой контакт через кнопку Telegram, не пересланный номер."
    });
    return;
  }

  const phone = normalizePhone(message.contact.phone_number);
  const row = await db
    .prepare(
      "SELECT * FROM verifications WHERE telegram_chat_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
    )
    .bind(chatId)
    .first();
  const verification = row ? verificationFromRow(row) : null;

  if (!verification || isVerificationExpired(verification)) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "Код не найден или устарел"
    });
    return;
  }
  if (verification.telegramUserId && userId && String(verification.telegramUserId) !== userId) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "Этот код был открыт другим Telegram-аккаунтом."
    });
    return;
  }
  if (verification.phone !== phone) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "Номер Telegram не совпал с номером на сайте"
    });
    return;
  }

  const customerName = verification.name || message.contact.first_name || "Гость";
  await db.batch([
    db
      .prepare("UPDATE verifications SET status = 'verified', chat_id = ?, telegram_user_id = ?, verified_at = ? WHERE id = ?")
      .bind(chatId, userId, nowIso(), verification.id),
    db
      .prepare(
        "INSERT INTO customers (phone, name, created_at) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name"
      )
      .bind(phone, customerName, nowIso())
  ]);

  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: "Номер подтверждён. Можно вернуться на страницу аренды.",
    reply_markup: { remove_keyboard: true }
  });
}

async function handleAuthRequest(request, env) {
  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone);
  const name = String(body.name || "").trim();

  if (phone.length < 10) {
    return json({ message: "Введите корректный номер телефона" }, 400);
  }

  const id = randomId(12);
  const code = generateCode();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM verifications WHERE phone = ? AND status = 'pending'").bind(phone),
    env.DB
      .prepare(
        "INSERT INTO verifications (id, phone, name, code, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)"
      )
      .bind(id, phone, name, code, nowIso(), addMinutesIso(10))
  ]);

  const botUsername = envValue(env, "TELEGRAM_BOT_USERNAME");
  return json({
    verificationId: id,
    code,
    botUsername,
    botLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    demoMode: boolEnv(env, "TELEGRAM_DEMO_MODE", true)
  });
}

async function handleAuthStatus(pathname, env) {
  const id = pathname.split("/").pop();
  const row = await env.DB.prepare("SELECT * FROM verifications WHERE id = ?").bind(id).first();
  const verification = row ? verificationFromRow(row) : null;
  if (!verification) return json({ message: "Проверка не найдена" }, 404);

  return json({
    status: verification.status,
    verified: verification.status === "verified"
  });
}

async function handleDemoVerify(request, env) {
  if (!boolEnv(env, "TELEGRAM_DEMO_MODE", true)) {
    return json({ message: "Демо-подтверждение отключено" }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT * FROM verifications WHERE id = ?").bind(body.verificationId).first();
  const verification = row ? verificationFromRow(row) : null;
  if (!verification) return json({ message: "Проверка не найдена" }, 404);

  await env.DB.batch([
    env.DB.prepare("UPDATE verifications SET status = 'verified', verified_at = ? WHERE id = ?").bind(nowIso(), verification.id),
    env.DB
      .prepare(
        "INSERT INTO customers (phone, name, created_at) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name"
      )
      .bind(verification.phone, verification.name || "Гость", nowIso())
  ]);

  return json({ ok: true });
}

async function createOrderDraft(db, body) {
  const verificationRow = await db.prepare("SELECT * FROM verifications WHERE id = ?").bind(body.verificationId).first();
  const verification = verificationRow ? verificationFromRow(verificationRow) : null;
  if (!verification || verification.status !== "verified") {
    const error = new Error("Сначала подтвердите номер через Telegram");
    error.status = 403;
    throw error;
  }

  const point = await getPointOrThrow(db, body.pointId);
  const towelCount = Math.max(1, Math.min(10, Number(body.towelCount || 1)));
  const provider = PAYMENT_PROVIDERS.find((item) => item.id === body.providerId);
  if (!provider) {
    const error = new Error("Платёжный способ не найден");
    error.status = 400;
    throw error;
  }

  if (point.cleanOnShelf < towelCount) {
    const error = new Error("Недостаточно чистых полотенец на точке");
    error.status = 409;
    throw error;
  }

  const customerRow = await db.prepare("SELECT * FROM customers WHERE phone = ?").bind(verification.phone).first();
  const id = randomId(10);
  const order = {
    id,
    receiptId: generateReceiptId(point),
    paymentReference: generatePaymentReference(provider),
    pointId: point.id,
    pointName: point.name,
    phone: verification.phone,
    customerName: customerRow?.name || verification.name || "Гость",
    towelCount,
    amount: towelCount * point.pricePerTowel,
    providerId: provider.id,
    providerName: provider.name,
    status: provider.id === "freedom" ? "pending_payment" : "paid",
    paymentStatus: provider.id === "freedom" ? "created" : "demo_paid",
    paymentCreatedAt: nowIso(),
    paidAt: provider.id === "freedom" ? null : nowIso(),
    issuedAt: null,
    returnedAt: null,
    createdAt: nowIso()
  };

  await db
    .prepare(
      `INSERT INTO orders (
        id, receipt_id, payment_reference, point_id, point_name, phone, customer_name,
        towel_count, amount, provider_id, provider_name, status, payment_status,
        payment_created_at, paid_at, issued_at, returned_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      order.id,
      order.receiptId,
      order.paymentReference,
      order.pointId,
      order.pointName,
      order.phone,
      order.customerName,
      order.towelCount,
      order.amount,
      order.providerId,
      order.providerName,
      order.status,
      order.paymentStatus,
      order.paymentCreatedAt,
      order.paidAt,
      order.issuedAt,
      order.returnedAt,
      order.createdAt
    )
    .run();

  return { order, point, provider };
}

async function handleCreateOrder(request, env) {
  const body = await request.json().catch(() => ({}));
  const config = getFreedomPayConfig(env, request);

  try {
    if (body.providerId === "freedom" && !config.configured && !config.demoMode) {
      const error = new Error("FreedomPay не настроен: добавьте MID и secret key");
      error.status = 503;
      throw error;
    }

    const result = await createOrderDraft(env.DB, body);
    if (result.provider.id !== "freedom") {
      return json(publicOrder(result.order), 201);
    }

    if (!config.configured) {
      const paidAt = nowIso();
      await env.DB
        .prepare("UPDATE orders SET status = 'paid', payment_status = 'demo_paid', paid_at = ? WHERE id = ?")
        .bind(paidAt, result.order.id)
        .run();
      return json(publicOrder({ ...result.order, status: "paid", paymentStatus: "demo_paid", paidAt }), 201);
    }

    try {
      const freedomPayment = await createFreedomPayPayment(result.order, result.point, config);
      await env.DB
        .prepare(
          "UPDATE orders SET payment_status = 'redirect_created', payment_redirect_url = ?, freedom_payment_id = ?, freedom_pay_created_at = ? WHERE id = ?"
        )
        .bind(freedomPayment.pg_redirect_url, freedomPayment.pg_payment_id || null, nowIso(), result.order.id)
        .run();
      return json(
        {
          ...publicOrder({
            ...result.order,
            paymentStatus: "redirect_created",
            paymentRedirectUrl: freedomPayment.pg_redirect_url,
            freedomPaymentId: freedomPayment.pg_payment_id || null
          }),
          payment: {
            provider: "freedom",
            redirectUrl: freedomPayment.pg_redirect_url,
            paymentId: freedomPayment.pg_payment_id || null
          }
        },
        201
      );
    } catch (paymentError) {
      await env.DB
        .prepare("UPDATE orders SET status = 'payment_failed', payment_status = 'create_failed', payment_error = ? WHERE id = ?")
        .bind(paymentError.message, result.order.id)
        .run();
      paymentError.status = 502;
      throw paymentError;
    }
  } catch (error) {
    return json({ message: error.message }, error.status || 500);
  }
}

async function handleGetOrder(pathname, env) {
  const id = pathname.split("/").pop();
  const order = await getOrder(env.DB, id);
  if (!order) return json({ message: "Заказ не найден" }, 404);
  return json(publicOrder(order));
}

async function handleFreedomCheck(request, env, pathname) {
  const config = getFreedomPayConfig(env, request);
  const params = await getRequestParams(request);
  const scriptName = getScriptNameFromPath(pathname);

  if (!verifySignature(scriptName, params, config.secretKey)) {
    return text("Invalid signature", 400);
  }

  const order = await getOrder(env.DB, params.pg_order_id);
  const amountMatches = order && Number(order.amount).toFixed(2) === Number(params.pg_amount).toFixed(2);
  const canPay = order
    && order.providerId === "freedom"
    && amountMatches
    && ["pending_payment", "paid"].includes(order.status);

  return new Response(
    buildSignedXmlResponse(
      scriptName,
      {
        pg_status: canPay ? "ok" : "rejected",
        pg_description: canPay ? "Платеж разрешен" : "Заказ недоступен для оплаты"
      },
      config.secretKey
    ),
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
}

async function handleFreedomResult(request, env, pathname) {
  const config = getFreedomPayConfig(env, request);
  const params = await getRequestParams(request);
  const scriptName = getScriptNameFromPath(pathname);

  if (!verifySignature(scriptName, params, config.secretKey)) {
    return text("Invalid signature", 400);
  }

  const order = await getOrder(env.DB, params.pg_order_id);
  if (!order) {
    return new Response(
      buildSignedXmlResponse(
        scriptName,
        { pg_status: "rejected", pg_description: "Заказ не найден" },
        config.secretKey
      ),
      { headers: { "Content-Type": "application/xml; charset=utf-8" } }
    );
  }

  if (order.freedomResultResponse) {
    return new Response(buildSignedXmlResponse(scriptName, order.freedomResultResponse, config.secretKey), {
      headers: { "Content-Type": "application/xml; charset=utf-8" }
    });
  }

  const amountMatches = Number(order.amount).toFixed(2) === Number(params.pg_amount).toFixed(2);
  let responseParams;
  let status = order.status;
  let paymentStatus = order.paymentStatus;
  let paymentError = null;
  let paidAt = order.paidAt;

  if (!amountMatches || order.providerId !== "freedom") {
    responseParams = {
      pg_status: params.pg_can_reject === "1" ? "rejected" : "ok",
      pg_description: "Параметры платежа не совпадают с заказом"
    };
    paymentStatus = "result_mismatch";
    paymentError = responseParams.pg_description;
  } else if (String(params.pg_result) === "1") {
    responseParams = { pg_status: "ok", pg_description: "Order paid" };
    status = "paid";
    paymentStatus = "paid";
    paidAt = paidAt || nowIso();
  } else {
    responseParams = { pg_status: "ok", pg_description: "Payment result saved" };
    status = "payment_failed";
    paymentStatus = "failed";
    paymentError = params.pg_failure_description
      || params.pg_error_description
      || params.pg_description
      || "Платеж не завершен";
  }

  const freedomResult = {
    result: params.pg_result || null,
    paymentId: params.pg_payment_id || null,
    amount: params.pg_amount || null,
    currency: params.pg_currency || null,
    paymentDate: params.pg_payment_date || null,
    testingMode: params.pg_testing_mode || null,
    receivedAt: nowIso()
  };

  await env.DB
    .prepare(
      `UPDATE orders SET
        status = ?, payment_status = ?, paid_at = ?, payment_error = ?,
        freedom_payment_id = ?, freedom_result_json = ?, freedom_result_response_json = ?
      WHERE id = ?`
    )
    .bind(
      status,
      paymentStatus,
      paidAt,
      paymentError,
      params.pg_payment_id || order.freedomPaymentId || null,
      JSON.stringify(freedomResult),
      JSON.stringify(responseParams),
      order.id
    )
    .run();

  return new Response(buildSignedXmlResponse(scriptName, responseParams, config.secretKey), {
    headers: { "Content-Type": "application/xml; charset=utf-8" }
  });
}

async function handleFreedomRedirect(request, env, pathname, status) {
  const config = getFreedomPayConfig(env, request);
  const params = await getRequestParams(request);
  const scriptName = getScriptNameFromPath(pathname);
  const origin = new URL(request.url).origin;

  if (params.pg_sig && !verifySignature(scriptName, params, config.secretKey)) {
    return Response.redirect(`${origin}/#/payment/failure?status=failure&reason=signature`, 302);
  }

  const query = new URLSearchParams({
    status,
    orderId: String(params.pg_order_id || ""),
    paymentId: String(params.pg_payment_id || "")
  });
  return Response.redirect(`${origin}/#/payment/${status}?${query.toString()}`, 302);
}

async function handleIssueOrder(pathname, env) {
  const id = pathname.split("/").at(-2);
  const order = await getOrder(env.DB, id);
  if (!order) return json({ message: "Заказ не найден" }, 404);
  if (order.status !== "paid") return json({ message: "Этот заказ уже обработан" }, 409);

  const point = await getPointOrThrow(env.DB, order.pointId);
  if (point.cleanOnShelf < order.towelCount) {
    return json({ message: "Недостаточно чистых полотенец на полке" }, 409);
  }

  const issuedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE points SET clean_on_shelf = clean_on_shelf - ? WHERE id = ?").bind(order.towelCount, point.id),
    env.DB.prepare("UPDATE orders SET status = 'in_use', issued_at = ? WHERE id = ?").bind(issuedAt, order.id)
  ]);

  return json({ ...order, status: "in_use", issuedAt });
}

async function handleReturnOrder(pathname, env) {
  const id = pathname.split("/").at(-2);
  const order = await getOrder(env.DB, id);
  if (!order) return json({ message: "Заказ не найден" }, 404);
  if (order.status !== "in_use") return json({ message: "Заказ не находится в выдаче" }, 409);

  const returnedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE points SET clean_on_shelf = clean_on_shelf + ? WHERE id = ?").bind(order.towelCount, order.pointId),
    env.DB.prepare("UPDATE orders SET status = 'returned', returned_at = ? WHERE id = ?").bind(returnedAt, order.id)
  ]);

  return json({ ...order, status: "returned", returnedAt });
}

async function handleDashboard(env, request) {
  const data = await publicDb(env, request);
  return json({
    ...data,
    stats: createStats(data.points, data.orders)
  });
}

async function handleTelegramWebhook(request, env) {
  if (!envValue(env, "TELEGRAM_BOT_TOKEN")) {
    return json({ message: "Telegram bot token is not configured" }, 503);
  }

  const webhookSecret = envValue(env, "TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    return text("Invalid Telegram webhook secret", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.message) await handleTelegramMessage(env, body.message);
    return json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error.message);
    return json({ ok: false });
  }
}

function handleEvents() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`retry: 30000\nevent: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`));
      controller.close();
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

function requireDb(env) {
  if (!env.DB) {
    const error = new Error("Cloudflare D1 binding DB is not configured");
    error.status = 500;
    throw error;
  }
}

async function routeRequest(context) {
  const { request, env } = context;
  requireDb(env);

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "GET" && pathname === "/api/config") return json(await publicDb(env, request));
  if (method === "GET" && pathname === "/api/events") return handleEvents();
  if (method === "POST" && pathname === "/api/auth/request") return handleAuthRequest(request, env);
  if (method === "GET" && pathname.startsWith("/api/auth/status/")) return handleAuthStatus(pathname, env);
  if (method === "POST" && pathname === "/api/auth/demo-verify") return handleDemoVerify(request, env);
  if (method === "POST" && pathname === "/api/orders") return handleCreateOrder(request, env);
  if (method === "GET" && /^\/api\/orders\/[^/]+$/.test(pathname)) return handleGetOrder(pathname, env);
  if (method === "POST" && pathname.endsWith("/issue") && pathname.startsWith("/api/orders/")) return handleIssueOrder(pathname, env);
  if (method === "POST" && pathname.endsWith("/return") && pathname.startsWith("/api/orders/")) return handleReturnOrder(pathname, env);
  if (method === "GET" && pathname === "/api/dashboard") return handleDashboard(env, request);
  if (method === "POST" && pathname === "/api/telegram/webhook") return handleTelegramWebhook(request, env);

  if (pathname === "/api/payments/freedom/check") return handleFreedomCheck(request, env, pathname);
  if (pathname === "/api/payments/freedom/result") return handleFreedomResult(request, env, pathname);
  if (method === "GET" && pathname === "/api/payments/freedom/success") {
    return handleFreedomRedirect(request, env, pathname, "success");
  }
  if (method === "GET" && pathname === "/api/payments/freedom/failure") {
    return handleFreedomRedirect(request, env, pathname, "failure");
  }

  return json({ message: "Not found" }, 404);
}

export async function onRequest(context) {
  try {
    return await routeRequest(context);
  } catch (error) {
    return json({ message: error.message || "Server error" }, error.status || 500);
  }
}
