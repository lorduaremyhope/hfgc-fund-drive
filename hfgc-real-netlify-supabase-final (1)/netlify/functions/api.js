const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

const getPath = (event) => (event.path || "").replace(/^\/\.netlify\/functions\/api\/?/, "").replace(/^\/api\/?/, "").replace(/^\/?/, "");
const body = (event) => { try { return event.body ? JSON.parse(event.body) : {}; } catch { return {}; } };

const fallbackRatesToEUR = {
  EUR: 1,
  GBP: 1.17,
  USD: 0.93,
  CHF: 1.05,
  RUB: 0.010,
  NOK: 0.087
};

function requireEnv() {
  const missing = ["ADMIN_USER", "ADMIN_PASS", "JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function auth(event) {
  const header = event.headers.authorization || event.headers.Authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); } catch { return null; }
}

async function convertToEUR(amount, currency) {
  const from = String(currency || "EUR").toUpperCase();
  const value = Number(amount || 0);
  if (from === "EUR") return { eur_amount: value, exchange_rate: 1 };

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?amount=${encodeURIComponent(value)}&from=${encodeURIComponent(from)}&to=EUR`);
    if (!res.ok) throw new Error("Rate service failed");
    const data = await res.json();
    const eur = Number(data?.rates?.EUR);
    if (!Number.isFinite(eur)) throw new Error("Invalid rate");
    return { eur_amount: eur, exchange_rate: value ? eur / value : fallbackRatesToEUR[from] || 1 };
  } catch {
    const rate = fallbackRatesToEUR[from] || 1;
    return { eur_amount: value * rate, exchange_rate: rate };
  }
}

function cleanEntry(row, includeProof = false) {
  const amount = Number(row.amount || 0);
  const eurAmount = Number(row.eur_amount ?? row.amount ?? 0);
  const base = {
    id: row.id,
    name: row.name,
    district: row.district,
    locale: row.locale,
    amount,
    currency: row.currency || "EUR",
    eur_amount: eurAmount,
    exchange_rate: Number(row.exchange_rate || 1),
    payment_method: row.payment_method,
    pledge_date: row.pledge_date || "",
    note: row.note || "",
    status: row.status || "Pending",
    created_at: row.created_at
  };
  if (includeProof) base.proof = row.proof_url || "";
  return base;
}

async function getSettings(supabase) {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error || !data) return { id: 1, goal: 250000, show_progress: true, show_leaderboard: true };
  return data;
}

async function getEntries(supabase, includeProof = false) {
  const { data, error } = await supabase.from("donations").select("*").order("eur_amount", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(r => cleanEntry(r, includeProof));
}

exports.handler = async (event) => {
  try {
    requireEnv();
    const route = getPath(event);
    const method = event.httpMethod;
    const supabase = db();

    if (method === "POST" && route === "login") {
      const b = body(event);
      if (b.username === process.env.ADMIN_USER && b.password === process.env.ADMIN_PASS) {
        const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "8h" });
        return json(200, { ok: true, token });
      }
      return json(401, { ok: false, error: "Invalid login." });
    }

    if (method === "GET" && route === "public") {
      return json(200, { settings: await getSettings(supabase), entries: await getEntries(supabase, false) });
    }

    if (method === "POST" && route === "donations") {
      const b = body(event);
      const currency = String(b.currency || "EUR").toUpperCase();
      const conversion = await convertToEUR(Number(b.amount || 0), currency);
      const row = {
        name: b.name || "",
        district: b.district || "",
        locale: b.locale || "",
        amount: Number(b.amount || 0),
        currency,
        eur_amount: conversion.eur_amount,
        exchange_rate: conversion.exchange_rate,
        payment_method: b.payment_method || "OTHER",
        pledge_date: b.pledge_date || null,
        note: b.note || "",
        status: "Pending",
        proof_url: b.proof || ""
      };
      const { error } = await supabase.from("donations").insert(row);
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    const user = auth(event);
    if (!user) return json(401, { ok: false, error: "Admin login required." });

    if (method === "GET" && route === "admin") {
      return json(200, { settings: await getSettings(supabase), entries: await getEntries(supabase, true) });
    }

    if (method === "GET" && route.startsWith("convert")) {
      const params = event.queryStringParameters || {};
      const amount = Number(params.amount || 1);
      const currency = String(params.currency || "EUR").toUpperCase();
      const conversion = await convertToEUR(amount, currency);
      return json(200, { amount, currency, eur_amount: conversion.eur_amount, exchange_rate: conversion.exchange_rate });
    }

    if (method === "POST" && route === "admin/add") {
      const b = body(event);
      const currency = String(b.currency || "EUR").toUpperCase();
      const conversion = await convertToEUR(Number(b.amount || 0), currency);
      const { error } = await supabase.from("donations").insert({
        name: b.name || "",
        district: b.district || "",
        locale: b.locale || "",
        amount: Number(b.amount || 0),
        currency,
        eur_amount: conversion.eur_amount,
        exchange_rate: conversion.exchange_rate,
        payment_method: b.payment_method || "OTHER",
        pledge_date: b.pledge_date || null,
        note: b.note || "",
        status: b.status || "Pending",
        proof_url: ""
      });
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    if (method === "POST" && route === "settings") {
      const b = body(event);
      const current = await getSettings(supabase);
      const next = { ...current, goal: Number(b.goal || current.goal || 250000) };
      const { error } = await supabase.from("settings").upsert(next);
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    if (method === "POST" && route === "toggle-progress") {
      const current = await getSettings(supabase);
      const { error } = await supabase.from("settings").upsert({ ...current, show_progress: !current.show_progress });
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    if (method === "POST" && route === "toggle-leaderboard") {
      const current = await getSettings(supabase);
      const { error } = await supabase.from("settings").upsert({ ...current, show_leaderboard: !current.show_leaderboard });
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    if (method === "POST" && route === "status") {
      const b = body(event);
      const { error } = await supabase.from("donations").update({ status: b.status }).eq("id", b.id);
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    if (method === "POST" && route === "delete") {
      const b = body(event);
      const { error } = await supabase.from("donations").delete().eq("id", b.id);
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    if (method === "GET" && route.startsWith("proof/")) {
      const id = route.split("/")[1];
      const { data, error } = await supabase.from("donations").select("proof_url").eq("id", id).single();
      if (error || !data || !data.proof_url) return json(404, { error: "Proof not found." });
      return json(200, { proof: data.proof_url });
    }

    return json(404, { error: "Not found." });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Server error" });
  }
};
