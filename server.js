require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
const {
  database,
  scenarios,
  evaluateInteraction,
  calculateMetrics
} = require("./lib/governance");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const INTERACTIONS_FILE = path.join(__dirname, "data", "interactions.json");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const AI_EXPLANATIONS = process.env.AI_EXPLANATIONS === "true";

app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(PUBLIC_DIR));

async function ensureInteractionsFile() {
  await fs.mkdir(path.dirname(INTERACTIONS_FILE), { recursive: true });
  try {
    await fs.access(INTERACTIONS_FILE);
  } catch {
    await fs.writeFile(INTERACTIONS_FILE, "[]\n");
  }
}

async function readInteractions() {
  await ensureInteractionsFile();
  const raw = await fs.readFile(INTERACTIONS_FILE, "utf8");
  const data = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

async function writeInteractions(interactions) {
  const tempFile = `${INTERACTIONS_FILE}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(interactions, null, 2)}\n`);
  await fs.rename(tempFile, INTERACTIONS_FILE);
}

async function getGeminiExplanation(interaction) {
  if (!AI_EXPLANATIONS || !GEMINI_API_KEY) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const prompt = `You are TRUST OS, a concise AI governance judge for ShopEase Retail Co.
Write one professional sentence explaining the fixed verdict below. Do not change the verdict, risk level, action, rules, facts, or ShopBot response. Do not provide legal advice.

Customer query: ${interaction.query}
ShopBot response: ${interaction.shopbotResponse}
Verdict: ${interaction.verdict}
Risk: ${interaction.riskLevel}
Rules: ${interaction.rulesViolated.map((rule) => `${rule.id}: ${rule.title}`).join(", ") || "None"}
Action: ${interaction.action}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 120 }
    }),
    signal: AbortSignal.timeout(8000)
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `Gemini returned ${response.status}`);
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || null;
}

function ruleViolationSummary(interactions) {
  const totals = new Map(database.rules.map((rule) => [rule.id, 0]));
  for (const interaction of interactions) {
    for (const rule of interaction.rulesViolated || []) {
      totals.set(rule.id, (totals.get(rule.id) || 0) + 1);
    }
  }
  return database.rules
    .map((rule) => ({ ...rule, count: totals.get(rule.id) || 0 }))
    .sort((a, b) => b.count - a.count || a.id - b.id);
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildAuditCsv(interactions) {
  const headers = [
    "Timestamp",
    "Requester",
    "Customer Query",
    "ShopBot Response",
    "Verdict",
    "Risk Level",
    "Rules Violated",
    "Explanation",
    "Action Taken"
  ];
  const rows = interactions.map((item) => [
    item.createdAt,
    item.requester,
    item.query,
    item.shopbotResponse,
    item.verdict,
    item.riskLevel,
    (item.rulesViolated || []).map((rule) => `Rule ${rule.id}: ${rule.title}`),
    item.explanation,
    item.action
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "Agent Trust OS",
    organization: database.company.name,
    mode: AI_EXPLANATIONS && GEMINI_API_KEY ? "Rules + Gemini explanations" : "Deterministic demo"
  });
});

app.get("/api/bootstrap", async (_req, res, next) => {
  try {
    const interactions = await readInteractions();
    res.json({
      company: database.company,
      products: database.products,
      delivery: database.delivery,
      promotions: database.promotions,
      coupons: database.coupons,
      policies: database.policies,
      payments: database.payments,
      rules: database.rules,
      scenarios,
      interactions,
      metrics: calculateMetrics(interactions),
      ruleViolations: ruleViolationSummary(interactions)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/interactions", async (_req, res, next) => {
  try {
    const interactions = await readInteractions();
    res.json({
      interactions,
      metrics: calculateMetrics(interactions),
      ruleViolations: ruleViolationSummary(interactions)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/interactions", async (req, res, next) => {
  try {
    const query = String(req.body.query || "").trim();
    const requester = String(req.body.requester || "Demo Customer").trim();
    if (!query) {
      const error = new Error("Enter a customer query before running TRUST OS");
      error.status = 400;
      throw error;
    }
    if (query.length > 1000) {
      const error = new Error("Customer queries must be 1,000 characters or fewer");
      error.status = 400;
      throw error;
    }

    const interaction = evaluateInteraction(query, requester);
    try {
      const enhanced = await getGeminiExplanation(interaction);
      if (enhanced) interaction.explanation = enhanced;
    } catch (error) {
      console.warn(`Gemini explanation unavailable; deterministic result retained: ${error.message}`);
    }

    const interactions = await readInteractions();
    interactions.unshift(interaction);
    const retained = interactions.slice(0, 1000);
    await writeInteractions(retained);
    res.status(201).json({
      interaction,
      metrics: calculateMetrics(retained),
      ruleViolations: ruleViolationSummary(retained)
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/interactions", async (_req, res, next) => {
  try {
    await writeInteractions([]);
    res.json({ success: true, metrics: calculateMetrics([]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audit.csv", async (_req, res, next) => {
  try {
    const interactions = await readInteractions();
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="agent-trust-os-audit-${date}.csv"`);
    res.send(buildAuditCsv(interactions));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    success: false,
    error: error.message || "Unexpected server error"
  });
});

if (require.main === module) {
  ensureInteractionsFile().then(() => {
    app.listen(PORT, () => {
      console.log(`Agent Trust OS running at http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
