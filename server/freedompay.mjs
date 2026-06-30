import crypto from "node:crypto";
import { nanoid } from "nanoid";

const DEFAULT_API_URL = "https://api.freedompay.kz";
const INIT_PAYMENT_SCRIPT = "init_payment.php";

function cleanBaseUrl(value) {
  return String(value || DEFAULT_API_URL).replace(/\/+$/, "");
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

export function createSignature(scriptName, params, secretKey) {
  const sortedValues = Object.keys(params)
    .filter((key) => key !== "pg_sig" && !stripEmpty(params[key]))
    .sort()
    .flatMap((key) => collectSignatureValues(params[key]));

  const signatureSource = [scriptName, ...sortedValues, secretKey].join(";");
  return crypto.createHash("md5").update(signatureSource).digest("hex");
}

export function signParams(scriptName, params, secretKey) {
  const signed = {
    ...params,
    pg_salt: params.pg_salt || nanoid(16)
  };
  signed.pg_sig = createSignature(scriptName, signed, secretKey);
  return signed;
}

export function verifySignature(scriptName, params, secretKey) {
  if (!params?.pg_sig || !secretKey) return false;
  const expected = createSignature(scriptName, params, secretKey);
  const received = String(params.pg_sig);

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSignedXmlResponse(scriptName, params, secretKey) {
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

export function parseFreedomPayResponse(text, contentType = "") {
  const raw = String(text || "").trim();
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

export function getFreedomPayConfig() {
  const merchantId = process.env.FREEDOMPAY_MERCHANT_ID || "";
  const secretKey = process.env.FREEDOMPAY_SECRET_KEY || "";

  return {
    merchantId,
    secretKey,
    apiUrl: cleanBaseUrl(process.env.FREEDOMPAY_API_URL),
    siteUrl: String(process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, ""),
    testingMode: process.env.FREEDOMPAY_TESTING_MODE !== "false",
    demoMode: process.env.FREEDOMPAY_DEMO_MODE !== "false",
    configured: Boolean(merchantId && secretKey)
  };
}

export function getScriptNameFromRequest(request) {
  const path = request.path || request.originalUrl?.split("?")[0] || "";
  return path.split("/").filter(Boolean).pop() || "";
}

export function getRequestParams(request) {
  return {
    ...(request.query || {}),
    ...(request.body && typeof request.body === "object" ? request.body : {})
  };
}

export async function createFreedomPayPayment(order, point, config = getFreedomPayConfig()) {
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
