import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { readDb, updateDb } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4200);
const demoMode = process.env.TELEGRAM_DEMO_MODE !== "false";
const token = process.env.TELEGRAM_BOT_TOKEN;

app.use(cors());
app.use(express.json());

const clients = new Set();
let botUsername = null;
let telegramOffset = 0;
const pendingChatCodes = new Map();

const paymentProviders = [
  { id: "kaspi", name: "Kaspi", accent: "#ef4444" },
  { id: "freedom", name: "Freedom Pay", accent: "#16a34a" },
  { id: "apple-pay", name: "Apple Pay", accent: "#111827" },
  { id: "google-pay", name: "Google Pay", accent: "#2563eb" },
  { id: "card", name: "Банковская карта", accent: "#7c3aed" }
];

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

async function initTelegram() {
  if (!token) {
    console.log("Telegram bot token is not configured. Demo verification mode is available.");
    return;
  }

  const me = await telegram("getMe");
  botUsername = me.result.username;
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

async function handleTelegramMessage(message) {
  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (text?.startsWith("/start")) {
    const [, code] = text.split(" ");
    if (code) {
      pendingChatCodes.set(chatId, code);
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Код принят. Теперь отправьте контакт кнопкой ниже, чтобы подтвердить номер для аренды.",
        reply_markup: {
          resize_keyboard: true,
          one_time_keyboard: true,
          keyboard: [[{ text: "Отправить номер", request_contact: true }]]
        }
      });
      return;
    }
  }

  if (/^\d{6}$/.test(text || "")) {
    pendingChatCodes.set(chatId, text);
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Отлично. Теперь отправьте контакт кнопкой ниже.",
      reply_markup: {
        resize_keyboard: true,
        one_time_keyboard: true,
        keyboard: [[{ text: "Отправить номер", request_contact: true }]]
      }
    });
    return;
  }

  if (message.contact) {
    const code = pendingChatCodes.get(chatId);
    const phone = normalizePhone(message.contact.phone_number);
    const result = updateDb((db) => {
      const verification = db.verifications.find((item) => item.code === code && item.status === "pending");
      if (!verification) return { ok: false, reason: "Код не найден или устарел" };
      if (verification.phone !== phone) return { ok: false, reason: "Номер Telegram не совпал с номером на сайте" };

      verification.status = "verified";
      verification.chatId = chatId;
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

app.post("/api/auth/request", (request, response) => {
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

  response.json({
    verificationId: verification.id,
    code: verification.code,
    botUsername,
    botLink: botUsername ? `https://t.me/${botUsername}?start=${verification.code}` : null,
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

app.post("/api/orders", (request, response) => {
  try {
    const result = updateDb((db) => {
      const verification = db.verifications.find((item) => item.id === request.body.verificationId);
      if (!verification || verification.status !== "verified") {
        const error = new Error("Сначала подтвердите номер через Telegram");
        error.status = 403;
        throw error;
      }

      const point = getPointOrThrow(db, request.body.pointId);
      const towelCount = Math.max(1, Math.min(10, Number(request.body.towelCount || 1)));
      const provider = paymentProviders.find((item) => item.id === request.body.providerId);
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
        status: "paid",
        paidAt: new Date().toISOString(),
        issuedAt: null,
        returnedAt: null
      };
      db.orders.unshift(order);
      return order;
    });

    broadcast("order.created", result);
    response.status(201).json(result);
  } catch (error) {
    response.status(error.status || 500).json({ message: error.message });
  }
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
