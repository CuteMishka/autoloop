import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, Check, ChevronRight, Clock, CreditCard, Grid3X3,
  LayoutDashboard, Minus, Package, Plus, RefreshCcw, Shield,
  ShieldCheck, Smartphone, TrendingUp, Users, Wallet
} from "lucide-react";
import "./styles.css";

/* ─── constants ─── */
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:4200";

const copy = {
  ru: {
    loading: "Загрузка", rent: "Аренда полотенец", location: "Точка",
    price: "за полотенце", name: "Имя", namePlaceholder: "Ваше имя",
    phone: "Телефон", phonePlaceholder: "+7 700 000 00 00",
    getCode: "Получить код в Telegram", code: "Код",
    openTelegram: "Открыть Telegram",
    botLater: "Бот подключится после добавления токена",
    demoConfirm: "Подтвердить локально", order: "Заказ",
    towels: "Полотенца", payment: "Оплата", total: "К оплате",
    pay: "Оплатить", paid: "Оплачено", amount: "Сумма",
    time: "Время", date: "Дата", receipt: "Чек", receiptNo: "Чек №",
    transaction: "Транзакция", customer: "Клиент", status: "Статус",
    paidNote: "Покажите этот чек администратору.",
    error: "Ошибка",
    admin: "Админ", monitoring: "Мониторинг", issueReturn: "Выдача / Возврат",
    inventory: "Инвентарь", issue: "Выдать", return: "Вернуть",
    cleanOnShelf: "На полке", noOrders: "Заказов пока нет",
    owner: "Владелец", stats: "Статистика", analytics: "Аналитика",
    forgotten: "Забывчивые", network: "Сеть", dayRevenue: "Выручка / день",
    monthRevenue: "Выручка / месяц", avgTime: "Среднее время", min: "мин",
    activeOrders: "В использовании", totalPaid: "Всего оплат",
    forgottenNote: "Не вернули >4 ч", noForgotten: "Забывчивых нет 🎉",
    revenue: "Выручка", active: "Активных", awaiting: "Ожидают"
  },
  kk: {
    loading: "Жүктелуде", rent: "Сүлгі жалға алу", location: "Нүкте",
    price: "бір сүлгіге", name: "Аты", namePlaceholder: "Атыңыз",
    phone: "Телефон", phonePlaceholder: "+7 700 000 00 00",
    getCode: "Telegram арқылы код алу", code: "Код",
    openTelegram: "Telegram ашу",
    botLater: "Бот токен қосылғаннан кейін жұмыс істейді",
    demoConfirm: "Жергілікті растау", order: "Тапсырыс",
    towels: "Сүлгілер", payment: "Төлем", total: "Төлеуге",
    pay: "Төлеу", paid: "Төленді", amount: "Сома",
    time: "Уақыт", date: "Күні", receipt: "Чек", receiptNo: "Чек №",
    transaction: "Транзакция", customer: "Клиент", status: "Статус",
    paidNote: "Осы чекті әкімшіге көрсетіңіз.",
    error: "Қате",
    admin: "Админ", monitoring: "Мониторинг", issueReturn: "Беру / Қайтару",
    inventory: "Инвентарь", issue: "Беру", return: "Қайтару",
    cleanOnShelf: "Сөреде", noOrders: "Тапсырыстар жоқ",
    owner: "Иесі", stats: "Статистика", analytics: "Аналитика",
    forgotten: "Ұмытшақтар", network: "Желі", dayRevenue: "Күнделікті кіріс",
    monthRevenue: "Айлық кіріс", avgTime: "Орташа уақыт", min: "мин",
    activeOrders: "Қолданыста", totalPaid: "Барлық төлемдер",
    forgottenNote: ">4 сағ қайтармаған", noForgotten: "Ұмытшақтар жоқ 🎉",
    revenue: "Кіріс", active: "Белсенді", awaiting: "Күтуде"
  },
  en: {
    loading: "Loading", rent: "Towel rental", location: "Location",
    price: "per towel", name: "Name", namePlaceholder: "Your name",
    phone: "Phone", phonePlaceholder: "+7 700 000 00 00",
    getCode: "Get Telegram code", code: "Code",
    openTelegram: "Open Telegram",
    botLater: "Bot will connect after token setup",
    demoConfirm: "Confirm locally", order: "Order",
    towels: "Towels", payment: "Payment", total: "Total",
    pay: "Pay", paid: "Paid", amount: "Amount",
    time: "Time", date: "Date", receipt: "Receipt", receiptNo: "Receipt #",
    transaction: "Transaction", customer: "Customer", status: "Status",
    paidNote: "Show this receipt to the administrator.",
    error: "Error",
    admin: "Admin", monitoring: "Monitoring", issueReturn: "Issue / Return",
    inventory: "Inventory", issue: "Issue", return: "Return",
    cleanOnShelf: "On shelf", noOrders: "No orders yet",
    owner: "Owner", stats: "Statistics", analytics: "Analytics",
    forgotten: "Forgotten", network: "Network", dayRevenue: "Revenue / day",
    monthRevenue: "Revenue / month", avgTime: "Avg time", min: "min",
    activeOrders: "In use", totalPaid: "Total paid",
    forgottenNote: "Not returned >4h", noForgotten: "No forgotten clients 🎉",
    revenue: "Revenue", active: "Active", awaiting: "Awaiting"
  }
};

const languages = [
  { id: "ru", label: "RU" },
  { id: "kk", label: "KZ" },
  { id: "en", label: "EN" }
];

/* ─── helpers ─── */
function money(v) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(v || 0);
}

function formatDateTime(value) {
  return new Date(value || Date.now()).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function fallbackReceiptId(order) {
  return order.receiptId || `SL-${String(order.id || "").toUpperCase()}`;
}

function fallbackPaymentReference(order) {
  return order.paymentReference || `${String(order.providerId || "PAY").toUpperCase()}-${String(order.id || "").toUpperCase()}`;
}

async function api(path, opts) {
  const r = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "Request failed");
  return j;
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const handler = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return hash;
}

/* ─── animation variants ─── */
const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } };
const stagger = { animate: { transition: { staggerChildren: 0.07 } } };
const scaleIn = { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.95 } };
const spring = { type: "spring", stiffness: 400, damping: 30 };

/* ═══════════════════════════════════════════
   Interactive Background — floating blurred blobs
   that subtly follow the cursor
   ═══════════════════════════════════════════ */
function InteractiveBackground() {
  const containerRef = useRef(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef(null);
  const blobRefs = useRef([null, null, null]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight
      };
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    let prevX = [0, 0, 0];
    let prevY = [0, 0, 0];

    const animate = () => {
      const { x, y } = mouseRef.current;
      const offsets = [
        { dx: (x - 0.5) * 60, dy: (y - 0.5) * 40 },
        { dx: (x - 0.5) * -40, dy: (y - 0.5) * 50 },
        { dx: (x - 0.5) * 30, dy: (y - 0.5) * -35 }
      ];
      blobRefs.current.forEach((blob, i) => {
        if (!blob) return;
        const tx = offsets[i].dx;
        const ty = offsets[i].dy;
        prevX[i] += (tx - prevX[i]) * 0.03;
        prevY[i] += (ty - prevY[i]) * 0.03;
        blob.style.setProperty("--mx", `${prevX[i]}px`);
        blob.style.setProperty("--my", `${prevY[i]}px`);
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="interactive-bg" ref={containerRef}>
      <div className="blob blob-1" ref={(el) => (blobRefs.current[0] = el)} />
      <div className="blob blob-2" ref={(el) => (blobRefs.current[1] = el)} />
      <div className="blob blob-3" ref={(el) => (blobRefs.current[2] = el)} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Animated Button wrapper
   ═══════════════════════════════════════════ */
function MButton({ children, className = "", ...props }) {
  return (
    <motion.button
      className={className}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/* ═══════════════════════════════════════════
   Logo
   ═══════════════════════════════════════════ */
function SoftLoopLogo() {
  return (
    <svg className="softloop-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 120" role="img" aria-label="SoftLoop">
      <defs>
        <linearGradient id="loopGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <g transform="translate(20, 20)">
        <path d="M 40 40 C 15 15, 15 65, 40 40 C 65 15, 65 65, 40 40 Z" fill="none" stroke="#1a1f2e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 65 40 C 40 15, 40 65, 65 40 C 90 15, 90 65, 65 40 Z" fill="none" stroke="url(#loopGradient)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
        <circle cx="52.5" cy="40" r="4" fill="#0d9488" />
      </g>
      <text x="135" y="65" fill="#1a1f2e">
        <tspan fontWeight="700" fontSize="42">Soft</tspan>
        <tspan fontWeight="500" fontSize="42" fill="#0d9488">Loop</tspan>
      </text>
      <text x="138" y="85" fontWeight="500" fontSize="11" letterSpacing="5" fill="#0d9488" opacity="0.8">
        TOWEL SHARING
      </text>
    </svg>
  );
}

/* ═══════════════════════════════════════════
   App Shell — root with router
   ═══════════════════════════════════════════ */
function App() {
  const [data, setData] = useState(null);
  const [lang, setLang] = useState(() => localStorage.getItem("softloop.lang") || "ru");
  const text = copy[lang];
  const hash = useHash();

  useEffect(() => { localStorage.setItem("softloop.lang", lang); }, [lang]);
  useEffect(() => { api("/api/config").then(setData).catch(() => setData({ error: true })); }, []);

  if (!data) {
    return (
      <>
        <InteractiveBackground />
        <main className="boot-screen">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          >
            <RefreshCcw size={28} />
          </motion.div>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {text.loading}
          </motion.span>
        </main>
      </>
    );
  }

  const route = hash.replace("#", "") || "/";
  const qrCode = window.location.pathname.match(/^\/q\/([^/]+)/)?.[1];

  return (
    <>
      <InteractiveBackground />
      <div className="app-shell">
        <AnimatePresence mode="wait">
          {route.startsWith("/admin") ? (
            <motion.div key="admin" {...fadeUp} transition={{ duration: 0.35 }}>
              <AdminPanel data={data} text={text} lang={lang} setLang={setLang} />
            </motion.div>
          ) : route.startsWith("/owner") ? (
            <motion.div key="owner" {...fadeUp} transition={{ duration: 0.35 }}>
              <OwnerPanel data={data} text={text} lang={lang} setLang={setLang} />
            </motion.div>
          ) : (
            <motion.div key="client" {...fadeUp} transition={{ duration: 0.35 }}>
              <ClientPage data={data} qrCode={qrCode} text={text} lang={lang} setLang={setLang} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   Client Page (existing, redesigned)
   ═══════════════════════════════════════════ */
function ClientPage({ data, qrCode, text, lang, setLang }) {
  return (
    <main className="client-page">
      <section className="client-card">
        <header className="client-header">
          <SoftLoopLogo />
          <div className="language-switch" aria-label="Language">
            {languages.map((item) => (
              <MButton
                key={item.id}
                className={lang === item.id ? "active" : ""}
                onClick={() => setLang(item.id)}
              >
                {item.label}
              </MButton>
            ))}
          </div>
        </header>
        <ClientFlow data={data} qrCode={qrCode} text={text} />
      </section>
    </main>
  );
}

/* ─── Client Flow ─── */
function ClientFlow({ data, qrCode, text }) {
  const point = useMemo(
    () => data.points?.find((p) => p.code === qrCode || p.id === qrCode) || data.points?.[0],
    [data.points, qrCode]
  );

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [verification, setVerification] = useState(null);
  const [verified, setVerified] = useState(false);
  const [count, setCount] = useState(1);
  const [provider, setProvider] = useState("kaspi");
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = count * (point?.pricePerTowel || 0);

  useEffect(() => {
    if (!verification?.verificationId || verified) return;
    const interval = setInterval(async () => {
      const status = await api(`/api/auth/status/${verification.verificationId}`);
      if (status.verified) { setVerified(true); clearInterval(interval); }
    }, 1700);
    return () => clearInterval(interval);
  }, [verification, verified]);

  const startVerification = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const payload = await api("/api/auth/request", { method: "POST", body: JSON.stringify({ phone, name }) });
      setVerification(payload);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const demoVerify = async () => {
    setBusy(true); setError("");
    try {
      await api("/api/auth/demo-verify", { method: "POST", body: JSON.stringify({ verificationId: verification.verificationId }) });
      setVerified(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const pay = async () => {
    setBusy(true); setError("");
    try {
      const payload = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({ pointId: point.id, towelCount: count, providerId: provider, verificationId: verification.verificationId })
      });
      setOrder(payload);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (!point) return <p className="error-text">{text.error}</p>;

  return (
    <motion.div className="flow" variants={stagger} initial="initial" animate="animate">
      {/* Location */}
      <motion.section className="location-card" variants={fadeUp}>
        <span>{text.location}</span>
        <h1>{point.name}</h1>
        <p>{point.address}</p>
        <strong>{money(point.pricePerTowel)} {text.price}</strong>
      </motion.section>

      <AnimatePresence mode="wait">
        {/* Step 1: auth */}
        {!verified && (
          <motion.form
            key="auth"
            className="step-card"
            onSubmit={startVerification}
            variants={fadeUp}
            initial="initial"
            animate="animate"
            exit="exit"
            layout
          >
            <div className="step-title">
              <span>01</span>
              <h2>{text.rent}</h2>
            </div>

            <label>
              {text.name}
              <motion.input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={text.namePlaceholder}
                autoComplete="name"
                whileFocus={{ scale: 1.01 }}
                transition={spring}
              />
            </label>

            <label>
              {text.phone}
              <motion.input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={text.phonePlaceholder}
                inputMode="tel"
                autoComplete="tel"
                whileFocus={{ scale: 1.01 }}
                transition={spring}
              />
            </label>

            <MButton className="primary-action" disabled={busy}>
              <Smartphone size={18} />
              {text.getCode}
            </MButton>

            <AnimatePresence>
              {verification && (
                <motion.div
                  className="telegram-card"
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <span>{text.code}</span>
                  <strong>{verification.code}</strong>
                  {verification.botLink ? (
                    <motion.a
                      href={verification.botLink}
                      target="_blank"
                      rel="noreferrer"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {text.openTelegram}
                      <ChevronRight size={16} />
                    </motion.a>
                  ) : (
                    <small>{text.botLater}</small>
                  )}
                  {verification.demoMode && (
                    <MButton type="button" className="secondary-action" onClick={demoVerify} disabled={busy}>
                      {text.demoConfirm}
                    </MButton>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.form>
        )}

        {/* Step 2: order */}
        {verified && !order && (
          <motion.section
            key="order"
            className="step-card"
            variants={fadeUp}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="step-title">
              <span>02</span>
              <h2>{text.order}</h2>
            </div>

            <div className="counter-line">
              <span>{text.towels}</span>
              <div className="counter">
                <MButton onClick={() => setCount(Math.max(1, count - 1))} aria-label="minus">
                  <Minus size={18} />
                </MButton>
                <motion.strong
                  key={count}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={spring}
                >
                  {count}
                </motion.strong>
                <MButton onClick={() => setCount(Math.min(10, count + 1))} aria-label="plus">
                  <Plus size={18} />
                </MButton>
              </div>
            </div>

            <div className="payment-grid" aria-label={text.payment}>
              {data.paymentProviders.map((item) => (
                <MButton
                  key={item.id}
                  className={provider === item.id ? "active" : ""}
                  onClick={() => setProvider(item.id)}
                >
                  {item.id.includes("pay") || item.id === "kaspi" ? <Wallet size={17} /> : <CreditCard size={17} />}
                  {item.name}
                </MButton>
              ))}
            </div>

            <motion.div className="total-line" layout>
              <span>{text.total}</span>
              <motion.strong
                key={total}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={spring}
              >
                {money(total)}
              </motion.strong>
            </motion.div>

            <MButton className="primary-action" onClick={pay} disabled={busy}>
              <ShieldCheck size={18} />
              {text.pay}
            </MButton>
          </motion.section>
        )}

        {/* Paid */}
        {order && (
          <motion.div key="paid" {...scaleIn} transition={{ duration: 0.4 }}>
            <PaidTicket order={order} point={point} text={text} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p className="error-text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Paid Ticket ─── */
function PaidTicket({ order, point, text }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
  const receiptId = fallbackReceiptId(order);
  const paymentReference = fallbackPaymentReference(order);
  const paidAt = order.paidAt || now.toISOString();

  return (
    <section className="paid-card">
      <div className="receipt-head">
        <div>
          <span>{text.receipt}</span>
          <strong>{receiptId}</strong>
        </div>
        <div className="paid-mark">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
          >
            <Check size={26} />
          </motion.div>
        </div>
      </div>

      <div className="receipt-status">
        <ShieldCheck size={16} />
        <span>{text.paid}</span>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {money(order.amount)}
      </motion.h2>

      <div className="receipt">
        <span>{text.receiptNo}</span>
        <strong>{receiptId}</strong>
        <span>{text.transaction}</span>
        <strong>{paymentReference}</strong>
        <span>{text.location}</span>
        <strong>{point.name}</strong>
        <span>{text.customer}</span>
        <strong>{order.customerName}</strong>
        <span>{text.towels}</span>
        <strong>{order.towelCount}</strong>
        <span>{text.payment}</span>
        <strong>{order.providerName}</strong>
        <span>{text.date}</span>
        <strong>{formatDateTime(paidAt)}</strong>
        <span>{text.status}</span>
        <strong>{text.paid}</strong>
      </div>

      <div className="receipt-total">
        <span>{text.total}</span>
        <strong>{money(order.amount)}</strong>
      </div>

      <div className="receipt-barcode" aria-hidden="true">
        {receiptId.split("").map((char, index) => (
          <i key={`${char}-${index}`} style={{ height: `${18 + ((char.charCodeAt(0) + index) % 26)}px` }} />
        ))}
      </div>

      <small>{text.paidNote}</small>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Admin Panel
   ═══════════════════════════════════════════ */
function AdminPanel({ data: initialData, text, lang, setLang }) {
  const [tab, setTab] = useState("monitoring");
  const [dashboard, setDashboard] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchDashboard = useCallback(() => {
    api("/api/dashboard").then(setDashboard).catch(console.error);
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard, refreshKey]);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource(`${API}/api/events`);
    es.addEventListener("order.created", () => setRefreshKey((k) => k + 1));
    es.addEventListener("order.updated", () => setRefreshKey((k) => k + 1));
    return () => es.close();
  }, []);

  const db = dashboard || initialData;
  const orders = db.orders || [];
  const points = db.points || [];

  const handleIssue = async (id) => {
    await api(`/api/orders/${id}/issue`, { method: "POST" });
    setRefreshKey((k) => k + 1);
  };

  const handleReturn = async (id) => {
    await api(`/api/orders/${id}/return`, { method: "POST" });
    setRefreshKey((k) => k + 1);
  };

  const paidOrders = orders.filter((o) => o.status === "paid");
  const activeOrders = orders.filter((o) => o.status === "in_use");

  const tabs = [
    { id: "monitoring", label: text.monitoring, icon: <LayoutDashboard size={15} /> },
    { id: "issue", label: text.issueReturn, icon: <Package size={15} /> },
    { id: "inventory", label: text.inventory, icon: <Grid3X3 size={15} /> }
  ];

  return (
    <div className="admin-page">
      <div className="panel-header">
        <h1>{text.admin}</h1>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>

      <div className="panel-tabs">
        {tabs.map((t) => (
          <MButton key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </MButton>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "monitoring" && (
          <motion.div key="mon" {...fadeUp} transition={{ duration: 0.25 }}>
            <div className="stat-grid" style={{ marginTop: 20 }}>
              <div className="stat-card">
                <span className="stat-label">{text.monitoring}</span>
                <span className="stat-value accent">{paidOrders.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{text.activeOrders}</span>
                <span className="stat-value">{activeOrders.length}</span>
              </div>
            </div>

            <motion.div className="order-list" style={{ marginTop: 16 }} variants={stagger} initial="initial" animate="animate">
              {paidOrders.length === 0 && <p className="empty-state">{text.noOrders}</p>}
              {paidOrders.map((o, i) => (
                <motion.div className="order-item" key={o.id} variants={fadeUp} custom={i}>
                  <div className="order-info">
                    <span className="order-name">{o.customerName}</span>
                    <span className="order-meta">{o.towelCount} {text.towels} · {o.providerName}</span>
                  </div>
                  <span className="order-amount">{money(o.amount)}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}

        {tab === "issue" && (
          <motion.div key="issue" {...fadeUp} transition={{ duration: 0.25 }}>
            <h3 style={{ color: "var(--text-secondary)", margin: "20px 0 12px", fontSize: 14, fontWeight: 600 }}>
              {text.monitoring} ({paidOrders.length})
            </h3>
            <div className="order-list">
              {paidOrders.map((o) => (
                <motion.div className="order-item" key={o.id} variants={fadeUp} initial="initial" animate="animate">
                  <div className="order-info">
                    <span className="order-name">{o.customerName}</span>
                    <span className="order-meta">{o.towelCount} {text.towels} · {money(o.amount)}</span>
                  </div>
                  <div className="order-actions">
                    <MButton className="action-btn issue" onClick={() => handleIssue(o.id)}>{text.issue}</MButton>
                  </div>
                </motion.div>
              ))}
              {paidOrders.length === 0 && <p className="empty-state">{text.noOrders}</p>}
            </div>

            <h3 style={{ color: "var(--text-secondary)", margin: "24px 0 12px", fontSize: 14, fontWeight: 600 }}>
              {text.activeOrders} ({activeOrders.length})
            </h3>
            <div className="order-list">
              {activeOrders.map((o) => (
                <motion.div className="order-item" key={o.id} variants={fadeUp} initial="initial" animate="animate">
                  <div className="order-info">
                    <span className="order-name">{o.customerName}</span>
                    <span className="order-meta">
                      {o.towelCount} {text.towels} · {new Date(o.issuedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="order-actions">
                    <MButton className="action-btn return" onClick={() => handleReturn(o.id)}>{text.return}</MButton>
                  </div>
                </motion.div>
              ))}
              {activeOrders.length === 0 && <p className="empty-state">{text.noOrders}</p>}
            </div>
          </motion.div>
        )}

        {tab === "inventory" && (
          <motion.div key="inv" {...fadeUp} transition={{ duration: 0.25 }}>
            <div className="inventory-grid" style={{ marginTop: 20 }}>
              {points.map((p) => (
                <motion.div className="inventory-card" key={p.id} variants={fadeUp} initial="initial" animate="animate">
                  <h3>{p.name}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "2px 0 8px" }}>{p.address}</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="shelf-count">{p.cleanOnShelf}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{text.cleanOnShelf}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav current="admin" text={text} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Owner Panel
   ═══════════════════════════════════════════ */
function OwnerPanel({ data: initialData, text, lang, setLang }) {
  const [tab, setTab] = useState("stats");
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => { api("/api/dashboard").then(setDashboard).catch(console.error); }, []);

  const db = dashboard || initialData;
  const stats = db.stats || {};
  const timeline = stats.timeline || [];
  const forgotten = stats.forgotten || [];
  const network = stats.network || db.points || [];
  const maxRevenue = Math.max(...timeline.map((t) => t.revenue), 1);

  const tabs = [
    { id: "stats", label: text.stats, icon: <BarChart3 size={15} /> },
    { id: "analytics", label: text.analytics, icon: <TrendingUp size={15} /> },
    { id: "forgotten", label: text.forgotten, icon: <Users size={15} /> },
    { id: "network", label: text.network, icon: <Grid3X3 size={15} /> }
  ];

  return (
    <div className="owner-page">
      <div className="panel-header">
        <h1>{text.owner}</h1>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>

      <div className="panel-tabs">
        {tabs.map((t) => (
          <MButton key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </MButton>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "stats" && (
          <motion.div key="stats" {...fadeUp} transition={{ duration: 0.25 }}>
            <div className="stat-grid" style={{ marginTop: 20 }}>
              <div className="stat-card">
                <span className="stat-label">{text.dayRevenue}</span>
                <span className="stat-value accent">{money(stats.dayRevenue)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{text.monthRevenue}</span>
                <span className="stat-value">{money(stats.monthRevenue)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{text.totalPaid}</span>
                <span className="stat-value">{stats.paidCount || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{text.activeOrders}</span>
                <span className="stat-value accent">{stats.activeCount || 0}</span>
              </div>
            </div>

            {/* Mini chart */}
            <motion.div className="stat-card" style={{ marginTop: 12 }} variants={fadeUp} initial="initial" animate="animate">
              <span className="stat-label" style={{ marginBottom: 8 }}>{text.dayRevenue} — 7 дней</span>
              <div className="chart-bar-container">
                {timeline.map((t, i) => (
                  <div className="chart-bar-wrapper" key={i}>
                    <motion.div
                      className={`chart-bar ${i === timeline.length - 1 ? "today" : ""}`}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max((t.revenue / maxRevenue) * 100, 4)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.08 }}
                    />
                    <span className="chart-bar-label">{t.day}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {tab === "analytics" && (
          <motion.div key="analytics" {...fadeUp} transition={{ duration: 0.25 }}>
            <div className="stat-grid" style={{ marginTop: 20 }}>
              <div className="stat-card" style={{ gridColumn: "1 / -1" }}>
                <span className="stat-label">{text.avgTime}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="stat-value accent">{stats.averageUseMinutes || 0}</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{text.min}</span>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-label">{text.totalPaid}</span>
                <span className="stat-value">{stats.paidCount || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{text.activeOrders}</span>
                <span className="stat-value accent">{stats.activeCount || 0}</span>
              </div>
            </div>
          </motion.div>
        )}

        {tab === "forgotten" && (
          <motion.div key="forgotten" {...fadeUp} transition={{ duration: 0.25 }}>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "16px 0 12px" }}>{text.forgottenNote}</p>
            <div className="forgotten-list">
              {forgotten.length === 0 && <p className="empty-state">{text.noForgotten}</p>}
              {forgotten.map((o) => {
                const hrs = Math.round((Date.now() - new Date(o.issuedAt).getTime()) / 3600000 * 10) / 10;
                return (
                  <motion.div className="forgotten-item" key={o.id} variants={fadeUp} initial="initial" animate="animate">
                    <div className="order-info">
                      <span className="order-name">{o.customerName}</span>
                      <span className="order-meta">{o.pointName} · {o.towelCount} {text.towels}</span>
                    </div>
                    <span className="time-badge"><Clock size={12} /> {hrs}h</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {tab === "network" && (
          <motion.div key="network" {...fadeUp} transition={{ duration: 0.25 }}>
            <div className="inventory-grid" style={{ marginTop: 20 }}>
              {network.map((p) => (
                <motion.div className="network-card" key={p.id} variants={fadeUp} initial="initial" animate="animate">
                  <h3>{p.name}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>{p.city} · {p.address}</p>
                  <div className="network-stats">
                    <div className="network-stat">
                      <span className="value">{money(p.revenue || 0)}</span>
                      <span className="label">{text.revenue}</span>
                    </div>
                    <div className="network-stat">
                      <span className="value">{p.active || 0}</span>
                      <span className="label">{text.active}</span>
                    </div>
                    <div className="network-stat">
                      <span className="value">{p.paidAwaiting || 0}</span>
                      <span className="label">{text.awaiting}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav current="owner" text={text} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════ */
function LangSwitch({ lang, setLang }) {
  return (
    <div className="language-switch" aria-label="Language">
      {languages.map((item) => (
        <MButton key={item.id} className={lang === item.id ? "active" : ""} onClick={() => setLang(item.id)}>
          {item.label}
        </MButton>
      ))}
    </div>
  );
}

function BottomNav({ current, text }) {
  const items = [
    { id: "client", hash: "#/", icon: <Smartphone size={20} />, label: "Client" },
    { id: "admin", hash: "#/admin", icon: <Shield size={20} />, label: text.admin },
    { id: "owner", hash: "#/owner", icon: <BarChart3 size={20} />, label: text.owner }
  ];

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <motion.a
          key={item.id}
          href={item.hash}
          className={`nav-item ${current === item.id ? "active" : ""}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {item.icon}
          <span>{item.label}</span>
          {current === item.id && (
            <motion.div className="nav-indicator" layoutId="nav-dot" transition={spring} />
          )}
        </motion.a>
      ))}
    </nav>
  );
}

/* ─── Mount ─── */
createRoot(document.getElementById("root")).render(<App />);
