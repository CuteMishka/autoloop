import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { readDb, updateDb } from "./store.mjs";
import {
  buildSignedXmlResponse,
  createFreedomPayPayment,
  getFreedomPayConfig,
  getRequestParams,
  getScriptNameFromRequest,
  verifySignature
} from "./freedompay.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4200);
const demoMode = process.env.TELEGRAM_DEMO_MODE !== "false";
const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const freedomPayConfig = getFreedomPayConfig();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const clients = new Set();
let botUsername = process.env.TELEGRAM_BOT_USERNAME || null;
let telegramOffset = 0;
const pendingChatCodes = new Map();

const paymentProviders = [
  { id: "freedom", name: "Freedom Pay", accent: "#16a34a" },
  { id: "kaspi", name: "Kaspi", accent: "#ef4444" },
  { id: "card", name: "Банковская карта", accent: "#7c3aed" }
];

const legalInfo = {
  companyName: process.env.LEGAL_COMPANY_NAME || "ИП ORIGINAL BAR",
  bin: process.env.LEGAL_BIN || "980311451341",
  address: process.env.LEGAL_ADDRESS || "Усть-Каменогорск Г.А., Усть-Каменогорск, УЛИЦА 30-Й ГВАРДЕЙСКОЙ ДИВИЗИИ, дом 46, кв/офис 38",
  phone: process.env.LEGAL_PHONE || "+77711546680",
  email: process.env.LEGAL_EMAIL || "eshenbaev@gmail.com",
  bankAccount: process.env.LEGAL_BANK_ACCOUNT || "KZ71722S000029932182",
  bankName: process.env.LEGAL_BANK_NAME || "АО \"Kaspi Bank\"",
  bankBik: process.env.LEGAL_BANK_BIK || "CASPKZKA",
  bankKbe: process.env.LEGAL_BANK_KBE || "19"
};

function normalizePhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

function publicDb() {
  const db = readDb();
  return {
    points: db.points,
    orders: db.orders,
    customers: db.customers.map((customer) => ({
      phone: customer.phone,
      name: customer.name,
      createdAt: customer.createdAt
    })),
    paymentProviders,
    freedomPay: {
      configured: freedomPayConfig.configured,
      testingMode: freedomPayConfig.testingMode,
      demoMode: freedomPayConfig.demoMode
    },
    legal: legalInfo,
    demoMode,
    botUsername
  };
}

function broadcast(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => client.write(message));
}

function getPointOrThrow(db, pointId) {
  const point = db.points.find((item) => item.id === pointId || item.code === pointId);
  if (!point) {
    const error = new Error("Точка не найдена");
    error.status = 404;
    throw error;
  }
  return point;
}

function createStats(db) {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const paidOrders = db.orders.filter((order) => order.paidAt);
  const returnedOrders = db.orders.filter((order) => order.issuedAt && order.returnedAt);
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

  const forgotten = db.orders.filter((order) => {
    if (!order.issuedAt || order.returnedAt) return false;
    return now - new Date(order.issuedAt).getTime() > 4 * 60 * 60 * 1000;
  });

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
    activeCount: db.orders.filter((order) => order.status === "in_use").length,
    forgotten,
    timeline,
    network: db.points.map((point) => {
      const pointOrders = db.orders.filter((order) => order.pointId === point.id);
      return {
        ...point,
        revenue: pointOrders.reduce((sum, order) => sum + order.amount, 0),
        active: pointOrders.filter((order) => order.status === "in_use").length,
        paidAwaiting: pointOrders.filter((order) => order.status === "paid").length
      };
    })
  };
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateReceiptId(point) {
  const date = new Date();
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const pointCode = String(point.id || "SL").slice(0, 3).toUpperCase();
  return `SL-${pointCode}-${y}${m}${d}-${nanoid(6).toUpperCase()}`;
}

function generatePaymentReference(provider) {
  return `${provider.id.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${nanoid(8).toUpperCase()}`;
}

function getClientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "")
    .split(",")[0]
    .trim();
}

function createOrderDraft(db, body) {
  const verification = db.verifications.find((item) => item.id === body.verificationId);
  if (!verification || verification.status !== "verified") {
    const error = new Error("Сначала подтвердите номер через Telegram");
    error.status = 403;
    throw error;
  }

  const point = getPointOrThrow(db, body.pointId);
  const towelCount = Math.max(1, Math.min(10, Number(body.towelCount || 1)));
  const provider = paymentProviders.find((item) => item.id === body.providerId);
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

  const customer = db.customers.find((item) => item.phone === verification.phone);
  const order = {
    id: nanoid(10),
    receiptId: generateReceiptId(point),
    paymentReference: generatePaymentReference(provider),
    pointId: point.id,
    pointName: point.name,
    phone: verification.phone,
    customerName: customer?.name || verification.name || "Гость",
    towelCount,
    amount: towelCount * point.pricePerTowel,
    providerId: provider.id,
    providerName: provider.name,
    status: provider.id === "freedom" ? "pending_payment" : "paid",
    paymentStatus: provider.id === "freedom" ? "created" : "demo_paid",
    paymentCreatedAt: new Date().toISOString(),
    paidAt: provider.id === "freedom" ? null : new Date().toISOString(),
    issuedAt: null,
    returnedAt: null
  };
  db.orders.unshift(order);
  return { order, point, provider };
}

function publicOrder(order) {
  if (!order) return null;
  return {
    ...order,
    phone: order.phone ? `${String(order.phone).slice(0, 4)}***${String(order.phone).slice(-2)}` : ""
  };
}

function updateOrderPayment(id, mutator) {
  return updateDb((db) => {
    const order = db.orders.find((item) => item.id === id);
    if (!order) return null;
    mutator(order, db);
    return order;
  });
}

function sendFreedomXml(response, request, params) {
  const xml = buildSignedXmlResponse(getScriptNameFromRequest(request), params, freedomPayConfig.secretKey);
  response.type("application/xml; charset=utf-8").send(xml);
}

function redirectToPaymentPage(response, request, status) {
  const params = getRequestParams(request);
  const orderId = params.pg_order_id || "";
  const paymentId = params.pg_payment_id || "";
  const query = new URLSearchParams({
    status,
    orderId: String(orderId),
    paymentId: String(paymentId)
  });

  response.redirect(`/#/payment/${status}?${query.toString()}`);
}

async function initTelegram() {
  if (!token) {
    console.log("Telegram bot token is not configured. Demo verification mode is available.");
    return;
  }

  await ensureBotUsername();
  console.log(`Telegram bot connected as @${botUsername}`);
  pollTelegram();
}

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!json.ok) {
    throw new Error(json.description || `Telegram ${method} failed`);
  }
  return json;
}

async function ensureBotUsername() {
  if (!token || botUsername) return botUsername;

  try {
    const me = await telegram("getMe");
    botUsername = me.result.username;
  } catch (error) {
    console.error("Telegram getMe failed:", error.message);
  }

  return botUsername;
}

async function pollTelegram() {
  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset: telegramOffset,
        timeout: 25,
        allowed_updates: ["message"]
      });

      for (const update of updates.result) {
        telegramOffset = update.update_id + 1;
        if (update.message) {
          await handleTelegramMessage(update.message);
        }
      }
    } catch (error) {
      console.error("Telegram polling error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

function isVerificationExpired(verification) {
  return verification.expiresAt && new Date(verification.expiresAt).getTime() < Date.now();
}

function contactKeyboard() {
  return {
    resize_keyboard: true,
    one_time_keyboard: true,
    keyboard: [[{ text: "Отправить номер", request_contact: true }]]
  };
}

function linkTelegramCode(code, message) {
  const chatId = String(message.chat.id);
  const userId = message.from?.id ? String(message.from.id) : "";

  return updateDb((db) => {
    const verification = db.verifications.find((item) => {
      return item.code === code && item.status === "pending" && !isVerificationExpired(item);
    });

    if (!verification) {
      return { ok: false, reason: "Код не найден или устарел" };
    }

    verification.telegramChatId = chatId;
    verification.telegramUserId = userId;
    verification.telegramLinkedAt = new Date().toISOString();
    return { ok: true, verification };
  });
}

async function handleTelegramMessage(message) {
  const chatId = String(message.chat.id);
  const userId = message.from?.id ? String(message.from.id) : "";
  const text = message.text?.trim();

  if (text?.startsWith("/start")) {
    const [, code] = text.split(" ");
    if (code) {
      pendingChatCodes.set(chatId, code);
      const result = linkTelegramCode(code, message);
      await telegram("sendMessage", {
        chat_id: chatId,
        text: result.ok
          ? "Код принят. Теперь отправьте контакт кнопкой ниже, чтобы подтвердить номер для аренды."
          : result.reason,
        reply_markup: result.ok ? contactKeyboard() : { remove_keyboard: true }
      });
      return;
    }
  }

  if (/^\d{6}$/.test(text || "")) {
    pendingChatCodes.set(chatId, text);
    const result = linkTelegramCode(text, message);
    await telegram("sendMessage", {
      chat_id: chatId,
      text: result.ok ? "Отлично. Теперь отправьте контакт кнопкой ниже." : result.reason,
      reply_markup: result.ok ? contactKeyboard() : { remove_keyboard: true }
    });
    return;
  }

  if (message.contact) {
    if (message.contact.user_id && userId && String(message.contact.user_id) !== userId) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Отправьте именно свой контакт через кнопку Telegram, не пересланный номер."
      });
      return;
    }

    const code = pendingChatCodes.get(chatId);
    const phone = normalizePhone(message.contact.phone_number);
    const result = updateDb((db) => {
      const verification = db.verifications.find((item) => {
        if (item.status !== "pending" || isVerificationExpired(item)) return false;
        if (code && item.code === code) return true;
        if (String(item.telegramChatId || "") !== chatId) return false;
        return !item.telegramUserId || !userId || String(item.telegramUserId) === userId;
      });
      if (!verification) return { ok: false, reason: "Код не найден или устарел" };
      if (verification.phone !== phone) return { ok: false, reason: "Номер Telegram не совпал с номером на сайте" };

      verification.status = "verified";
      verification.chatId = chatId;
      verification.telegramChatId = chatId;
      verification.telegramUserId = userId;
      verification.verifiedAt = new Date().toISOString();

      let customer = db.customers.find((item) => item.phone === phone);
      if (!customer) {
        customer = {
          phone,
          name: verification.name || message.contact.first_name || "Гость",
          createdAt: new Date().toISOString()
        };
        db.customers.push(customer);
      } else if (verification.name) {
        customer.name = verification.name;
      }

      return { ok: true, verification, customer };
    });

    if (result.ok) {
      pendingChatCodes.delete(chatId);
      broadcast("verification.verified", { verificationId: result.verification.id });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Номер подтверждён. Можно вернуться на страницу аренды.",
        reply_markup: { remove_keyboard: true }
      });
    } else {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: result.reason
      });
    }
  }
}

app.get("/api/config", (_request, response) => {
  response.json(publicDb());
});

app.post("/api/telegram/webhook", async (request, response) => {
  if (!token) {
    response.status(503).json({ message: "Telegram bot token is not configured" });
    return;
  }

  if (webhookSecret && request.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    response.status(401).send("Invalid Telegram webhook secret");
    return;
  }

  try {
    if (request.body?.message) {
      await handleTelegramMessage(request.body.message);
    }
    response.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error.message);
    response.json({ ok: false });
  }
});

app.get("/api/events", (request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  clients.add(response);
  request.on("close", () => clients.delete(response));
});

app.post("/api/auth/request", async (request, response) => {
  const phone = normalizePhone(request.body.phone);
  const name = String(request.body.name || "").trim();

  if (phone.length < 10) {
    response.status(400).json({ message: "Введите корректный номер телефона" });
    return;
  }

  const verification = updateDb((db) => {
    const item = {
      id: nanoid(12),
      phone,
      name,
      code: generateCode(),
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };
    db.verifications = db.verifications.filter((old) => {
      return !(old.phone === phone && old.status === "pending");
    });
    db.verifications.push(item);
    return item;
  });

  const username = await ensureBotUsername();

  response.json({
    verificationId: verification.id,
    code: verification.code,
    botUsername: username,
    botLink: username ? `https://t.me/${username}?start=${verification.code}` : null,
    demoMode
  });
});

app.get("/api/auth/status/:id", (request, response) => {
  const db = readDb();
  const verification = db.verifications.find((item) => item.id === request.params.id);
  if (!verification) {
    response.status(404).json({ message: "Проверка не найдена" });
    return;
  }
  response.json({
    status: verification.status,
    verified: verification.status === "verified"
  });
});

app.post("/api/auth/demo-verify", (request, response) => {
  if (!demoMode) {
    response.status(403).json({ message: "Демо-подтверждение отключено" });
    return;
  }

  const result = updateDb((db) => {
    const verification = db.verifications.find((item) => item.id === request.body.verificationId);
    if (!verification) return null;
    verification.status = "verified";
    verification.verifiedAt = new Date().toISOString();
    let customer = db.customers.find((item) => item.phone === verification.phone);
    if (!customer) {
      customer = {
        phone: verification.phone,
        name: verification.name || "Гость",
        createdAt: new Date().toISOString()
      };
      db.customers.push(customer);
    }
    return { verification, customer };
  });

  if (!result) {
    response.status(404).json({ message: "Проверка не найдена" });
    return;
  }

  broadcast("verification.verified", { verificationId: result.verification.id });
  response.json({ ok: true });
});

app.post("/api/orders", async (request, response) => {
  try {
    if (
      request.body.providerId === "freedom"
      && !freedomPayConfig.configured
      && !freedomPayConfig.demoMode
    ) {
      throw Object.assign(new Error("FreedomPay не настроен: добавьте MID и secret key"), { status: 503 });
    }

    const result = updateDb((db) => {
      return createOrderDraft(db, {
        ...request.body,
        clientIp: getClientIp(request)
      });
    });

    if (result.provider.id !== "freedom") {
      broadcast("order.created", result.order);
      response.status(201).json(publicOrder(result.order));
      return;
    }

    if (!freedomPayConfig.configured) {
      const demoOrder = updateOrderPayment(result.order.id, (order) => {
        order.status = "paid";
        order.paymentStatus = "demo_paid";
        order.paidAt = new Date().toISOString();
      });
      broadcast("order.created", demoOrder);
      response.status(201).json(publicOrder(demoOrder));
      return;
    }

    try {
      const freedomPayment = await createFreedomPayPayment(result.order, result.point, freedomPayConfig);
      const updated = updateOrderPayment(result.order.id, (order) => {
        order.paymentStatus = "redirect_created";
        order.paymentRedirectUrl = freedomPayment.pg_redirect_url;
        order.freedomPaymentId = freedomPayment.pg_payment_id || null;
        order.freedomPayCreatedAt = new Date().toISOString();
      });
      broadcast("order.created", updated);
      response.status(201).json({
        ...publicOrder(updated),
        payment: {
          provider: "freedom",
          redirectUrl: freedomPayment.pg_redirect_url,
          paymentId: freedomPayment.pg_payment_id || null
        }
      });
    } catch (paymentError) {
      updateOrderPayment(result.order.id, (order) => {
        order.status = "payment_failed";
        order.paymentStatus = "create_failed";
        order.paymentError = paymentError.message;
      });
      throw Object.assign(paymentError, { status: 502 });
    }
  } catch (error) {
    response.status(error.status || 500).json({ message: error.message });
  }
});

app.get("/api/orders/:id", (request, response) => {
  const db = readDb();
  const order = db.orders.find((item) => item.id === request.params.id);
  if (!order) {
    response.status(404).json({ message: "Заказ не найден" });
    return;
  }
  response.json(publicOrder(order));
});

app.all("/api/payments/freedom/check", (request, response) => {
  const params = getRequestParams(request);
  if (!verifySignature(getScriptNameFromRequest(request), params, freedomPayConfig.secretKey)) {
    response.status(400).send("Invalid signature");
    return;
  }

  const db = readDb();
  const order = db.orders.find((item) => item.id === params.pg_order_id);
  const amountMatches = order && Number(order.amount).toFixed(2) === Number(params.pg_amount).toFixed(2);
  const canPay = order
    && order.providerId === "freedom"
    && amountMatches
    && ["pending_payment", "paid"].includes(order.status);

  sendFreedomXml(response, request, {
    pg_status: canPay ? "ok" : "rejected",
    pg_description: canPay ? "Платеж разрешен" : "Заказ недоступен для оплаты"
  });
});

app.all("/api/payments/freedom/result", (request, response) => {
  const params = getRequestParams(request);
  if (!verifySignature(getScriptNameFromRequest(request), params, freedomPayConfig.secretKey)) {
    response.status(400).send("Invalid signature");
    return;
  }

  const result = updateDb((db) => {
    const order = db.orders.find((item) => item.id === params.pg_order_id);
    if (!order) {
      return {
        response: {
          pg_status: "rejected",
          pg_description: "Заказ не найден"
        },
        order: null,
        changed: false
      };
    }

    if (order.freedomResultResponse) {
      return {
        response: order.freedomResultResponse,
        order,
        changed: false
      };
    }

    const amountMatches = Number(order.amount).toFixed(2) === Number(params.pg_amount).toFixed(2);
    if (!amountMatches || order.providerId !== "freedom") {
      order.freedomResultResponse = {
        pg_status: params.pg_can_reject === "1" ? "rejected" : "ok",
        pg_description: "Параметры платежа не совпадают с заказом"
      };
      order.paymentStatus = "result_mismatch";
      order.paymentError = order.freedomResultResponse.pg_description;
      return {
        response: order.freedomResultResponse,
        order,
        changed: true
      };
    }

    const paid = String(params.pg_result) === "1";
    order.freedomPaymentId = params.pg_payment_id || order.freedomPaymentId || null;
    order.freedomResult = {
      result: params.pg_result || null,
      paymentId: params.pg_payment_id || null,
      amount: params.pg_amount || null,
      currency: params.pg_currency || null,
      paymentDate: params.pg_payment_date || null,
      testingMode: params.pg_testing_mode || null,
      receivedAt: new Date().toISOString()
    };

    if (paid) {
      order.status = "paid";
      order.paymentStatus = "paid";
      order.paidAt = order.paidAt || new Date().toISOString();
      order.freedomResultResponse = {
        pg_status: "ok",
        pg_description: "Order paid"
      };
    } else {
      order.status = "payment_failed";
      order.paymentStatus = "failed";
      order.paymentError = params.pg_failure_description
        || params.pg_error_description
        || params.pg_description
        || "Платеж не завершен";
      order.freedomResultResponse = {
        pg_status: "ok",
        pg_description: "Payment result saved"
      };
    }

    return {
      response: order.freedomResultResponse,
      order,
      changed: true
    };
  });

  if (result?.changed && result.order) {
    broadcast("order.updated", result.order);
  }

  sendFreedomXml(response, request, result.response);
});

app.get("/api/payments/freedom/success", (request, response) => {
  const params = getRequestParams(request);
  if (params.pg_sig && !verifySignature(getScriptNameFromRequest(request), params, freedomPayConfig.secretKey)) {
    response.redirect("/#/payment/failure?status=failure&reason=signature");
    return;
  }
  redirectToPaymentPage(response, request, "success");
});

app.get("/api/payments/freedom/failure", (request, response) => {
  const params = getRequestParams(request);
  if (params.pg_sig && !verifySignature(getScriptNameFromRequest(request), params, freedomPayConfig.secretKey)) {
    response.redirect("/#/payment/failure?status=failure&reason=signature");
    return;
  }
  redirectToPaymentPage(response, request, "failure");
});

app.post("/api/orders/:id/issue", (request, response) => {
  try {
    const result = updateDb((db) => {
      const order = db.orders.find((item) => item.id === request.params.id);
      if (!order) {
        const error = new Error("Заказ не найден");
        error.status = 404;
        throw error;
      }
      if (order.status !== "paid") {
        const error = new Error("Этот заказ уже обработан");
        error.status = 409;
        throw error;
      }
      const point = getPointOrThrow(db, order.pointId);
      if (point.cleanOnShelf < order.towelCount) {
        const error = new Error("Недостаточно чистых полотенец на полке");
        error.status = 409;
        throw error;
      }
      point.cleanOnShelf -= order.towelCount;
      order.status = "in_use";
      order.issuedAt = new Date().toISOString();
      return order;
    });

    broadcast("order.updated", result);
    response.json(result);
  } catch (error) {
    response.status(error.status || 500).json({ message: error.message });
  }
});

app.post("/api/orders/:id/return", (request, response) => {
  try {
    const result = updateDb((db) => {
      const order = db.orders.find((item) => item.id === request.params.id);
      if (!order) {
        const error = new Error("Заказ не найден");
        error.status = 404;
        throw error;
      }
      if (order.status !== "in_use") {
        const error = new Error("Заказ не находится в выдаче");
        error.status = 409;
        throw error;
      }
      const point = getPointOrThrow(db, order.pointId);
      point.cleanOnShelf += order.towelCount;
      order.status = "returned";
      order.returnedAt = new Date().toISOString();
      return order;
    });

    broadcast("order.updated", result);
    response.json(result);
  } catch (error) {
    response.status(error.status || 500).json({ message: error.message });
  }
});

app.get("/api/dashboard", (_request, response) => {
  const db = readDb();
  response.json({
    ...publicDb(),
    stats: createStats(db)
  });
});

const clientDist = path.resolve(__dirname, "../dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((error, _request, response, _next) => {
  response.status(error.status || 500).json({ message: error.message || "Ошибка сервера" });
});

if (!process.env.VERCEL) {
  initTelegram().catch((error) => {
    console.error("Telegram bot failed to start:", error.message);
  });

  app.listen(port, () => {
    console.log(`Autoloop backend is running on http://127.0.0.1:${port}`);
  });
}

export default app;
