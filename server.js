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
const { validateCitationIds } = require("./lib/evidence");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const INTERACTIONS_FILE = path.join(__dirname, "data", "interactions.json");
const FEEDBACK_FILE = path.join(__dirname, "data", "feedback.json");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const AI_EXPLANATIONS = process.env.AI_EXPLANATIONS === "true" || process.env.AI_MODE === "hybrid";
const GEMINI_INPUT_USD_PER_MILLION = Number(process.env.GEMINI_INPUT_USD_PER_MILLION) || 0;
const GEMINI_OUTPUT_USD_PER_MILLION = Number(process.env.GEMINI_OUTPUT_USD_PER_MILLION) || 0;

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

async function ensureFeedbackFile() {
  try {
    await fs.access(FEEDBACK_FILE);
  } catch {
    await fs.writeFile(FEEDBACK_FILE, "[]\n");
  }
}

async function readInteractions() {
  await ensureInteractionsFile();
  const raw = await fs.readFile(INTERACTIONS_FILE, "utf8");
  const data = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data.map((item) => ({
    ...item,
    reviewRequired: item.reviewRequired ?? item.verdict !== "PASS",
    review: item.review || null
  })) : [];
}

async function writeInteractions(interactions) {
  const tempFile = `${INTERACTIONS_FILE}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(interactions, null, 2)}\n`);
  await fs.rename(tempFile, INTERACTIONS_FILE);
}

async function readFeedback() {
  await ensureFeedbackFile();
  const raw = await fs.readFile(FEEDBACK_FILE, "utf8");
  const data = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

async function writeFeedback(feedback) {
  const tempFile = `${FEEDBACK_FILE}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(feedback, null, 2)}\n`);
  await fs.rename(tempFile, FEEDBACK_FILE);
}

async function getGeminiAnalysis(interaction) {
  if (!AI_EXPLANATIONS || !GEMINI_API_KEY) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const evidenceBlock = interaction.evidence
    .map((item) => `[${item.id}] ${item.title}: ${item.content}`)
    .join("\n");
  const prompt = `You are the AI analysis component inside TRUST OS, a governance monitor for ShopEase Retail Co.
Analyze the fixed compliance record below for a small-business manager. The deterministic policy engine has already made the final decision. Do not change, dispute, or recalculate the verdict, risk level, action, triggered rules, official facts, or ShopBot response. Do not provide legal advice.

Use only the supplied evidence. Cite evidence by its exact bracketed ID. Return only valid JSON with this structure:
{
  "summary": "One concise sentence explaining the outcome",
  "riskReasoning": "Two concise sentences connecting the customer intent and ShopBot response to the fixed verdict",
  "recommendedFollowUp": "One practical next step for the business manager",
  "citationIds": ["one or more supplied evidence IDs"]
}

Customer query: ${interaction.query}
ShopBot response: ${interaction.shopbotResponse}
Verdict: ${interaction.verdict}
Risk: ${interaction.riskLevel}
Rules: ${interaction.rulesViolated.map((rule) => `${rule.id}: ${rule.title}`).join(", ") || "None"}
Action: ${interaction.action}

Official evidence:
${evidenceBlock}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 280,
        responseMimeType: "application/json"
      }
    }),
    signal: AbortSignal.timeout(8000)
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `Gemini returned ${response.status}`);
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty analysis");
  const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  const fields = ["summary", "riskReasoning", "recommendedFollowUp"];
  if (!fields.every((field) => typeof parsed[field] === "string" && parsed[field].trim())) {
    throw new Error("Gemini analysis did not match the required structure");
  }
  const citationIds = validateCitationIds(parsed.citationIds, interaction.evidence);
  if (!citationIds.length) throw new Error("Gemini analysis did not cite supplied evidence");
  const inputTokensEstimated = Math.ceil(prompt.length / 4);
  const outputTokensEstimated = Math.ceil(text.length / 4);
  const estimatedCostUsd = (
    inputTokensEstimated * GEMINI_INPUT_USD_PER_MILLION
    + outputTokensEstimated * GEMINI_OUTPUT_USD_PER_MILLION
  ) / 1_000_000;
  return {
    analysis: Object.fromEntries(fields.map((field) => [field, parsed[field].trim()])),
    citationIds,
    telemetry: {
      inputTokensEstimated,
      outputTokensEstimated,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      costBasis: GEMINI_INPUT_USD_PER_MILLION || GEMINI_OUTPUT_USD_PER_MILLION
        ? "Configured per-million-token rates"
        : "Rates not configured; token estimates recorded"
    }
  };
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
    "AI Analysis Source",
    "AI Risk Reasoning",
    "AI Recommended Follow-up",
    "Evidence Citations",
    "AI Latency (ms)",
    "Estimated AI Cost (USD)",
    "Human Review Decision",
    "Human Reviewer",
    "Human Review Notes",
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
    `${item.aiProvider?.source || "Local fallback"}${item.aiProvider?.model ? ` (${item.aiProvider.model})` : ""}`,
    item.aiAnalysis?.riskReasoning || "",
    item.aiAnalysis?.recommendedFollowUp || "",
    (item.citations || []).map((citation) => `${citation.id}: ${citation.title}`),
    item.telemetry?.latencyMs ?? "",
    item.telemetry?.estimatedCostUsd ?? "",
    item.review?.decision || (item.reviewRequired ? "Pending review" : "Not required"),
    item.review?.reviewer || "",
    item.review?.notes || "",
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
    mode: AI_EXPLANATIONS && GEMINI_API_KEY ? "Hybrid rules + Gemini analysis" : "Deterministic fallback",
    gemini: {
      enabled: Boolean(AI_EXPLANATIONS && GEMINI_API_KEY),
      model: GEMINI_MODEL
    },
    retrieval: "Local lexical retrieval with validated evidence IDs"
  });
});

app.get("/api/bootstrap", async (_req, res, next) => {
  try {
    const [interactions, feedback] = await Promise.all([readInteractions(), readFeedback()]);
    res.json({
      company: database.company,
      agentProfile: database.agentProfile,
      governanceBoundaries: database.governanceBoundaries,
      systemEvidence: database.systemEvidence,
      products: database.products,
      delivery: database.delivery,
      promotions: database.promotions,
      coupons: database.coupons,
      policies: database.policies,
      payments: database.payments,
      rules: database.rules,
      scenarios,
      interactions,
      feedback,
      metrics: calculateMetrics(interactions),
      ruleViolations: ruleViolationSummary(interactions),
      ai: {
        enabled: Boolean(AI_EXPLANATIONS && GEMINI_API_KEY),
        model: GEMINI_MODEL,
        role: "Evidence-grounded management analysis and recommended follow-up",
        retrieval: "Local lexical retrieval",
        citationsRequired: true,
        telemetry: ["latencyMs", "inputTokensEstimated", "outputTokensEstimated", "estimatedCostUsd"]
      }
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
    const startedAt = process.hrtime.bigint();
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
      const result = await getGeminiAnalysis(interaction);
      if (result) {
        interaction.aiAnalysis = result.analysis;
        interaction.citations = interaction.evidence.filter((item) => result.citationIds.includes(item.id));
        interaction.aiProvider = {
          source: "Gemini",
          model: GEMINI_MODEL
        };
        interaction.telemetry = {
          ...interaction.telemetry,
          ...result.telemetry
        };
      }
    } catch (error) {
      console.warn(`Gemini analysis unavailable; local fallback retained: ${error.message}`);
    }

    interaction.telemetry.latencyMs = Number((Number(process.hrtime.bigint() - startedAt) / 1_000_000).toFixed(2));
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

app.patch("/api/interactions/:id/review", async (req, res, next) => {
  try {
    const allowedDecisions = ["Acknowledged", "Confirmed Block", "Approved Exception", "Escalated"];
    const reviewer = String(req.body.reviewer || "").trim();
    const decision = String(req.body.decision || "").trim();
    const notes = String(req.body.notes || "").trim();
    if (!reviewer || !allowedDecisions.includes(decision)) {
      const error = new Error("Reviewer name and a valid human decision are required");
      error.status = 400;
      throw error;
    }
    if (notes.length > 1000) {
      const error = new Error("Review notes must be 1,000 characters or fewer");
      error.status = 400;
      throw error;
    }

    const interactions = await readInteractions();
    const index = interactions.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
      const error = new Error("Interaction was not found");
      error.status = 404;
      throw error;
    }
    if (!interactions[index].reviewRequired) {
      const error = new Error("This PASS interaction does not require a human decision");
      error.status = 400;
      throw error;
    }

    interactions[index] = {
      ...interactions[index],
      review: {
        decision,
        reviewer,
        notes,
        decidedAt: new Date().toISOString()
      },
      approvalStatus: decision === "Approved Exception" ? "Exception approved" : "Human decision recorded"
    };
    await writeInteractions(interactions);
    res.json({
      interaction: interactions[index],
      metrics: calculateMetrics(interactions),
      ruleViolations: ruleViolationSummary(interactions)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/feedback", async (_req, res, next) => {
  try {
    res.json(await readFeedback());
  } catch (error) {
    next(error);
  }
});

app.post("/api/feedback", async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    const name = String(req.body.name || "Anonymous tester").trim();
    const comment = String(req.body.comment || "").trim();
    const interactionId = String(req.body.interactionId || "").trim() || null;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      const error = new Error("Select a usefulness rating from 1 to 5");
      error.status = 400;
      throw error;
    }
    if (comment.length > 1000) {
      const error = new Error("Feedback comments must be 1,000 characters or fewer");
      error.status = 400;
      throw error;
    }
    const feedback = await readFeedback();
    const item = {
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      interactionId,
      name: name || "Anonymous tester",
      rating,
      comment,
      createdAt: new Date().toISOString()
    };
    feedback.unshift(item);
    await writeFeedback(feedback.slice(0, 1000));
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

app.get("/api/feedback.csv", async (_req, res, next) => {
  try {
    const feedback = await readFeedback();
    const headers = ["Timestamp", "Tester", "Usefulness Rating", "Comment", "Interaction ID"];
    const rows = feedback.map((item) => [item.createdAt, item.name, item.rating, item.comment, item.interactionId]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=agent-trust-os-user-feedback.csv");
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/feedback", async (_req, res, next) => {
  try {
    await writeFeedback([]);
    res.json({ success: true });
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

app.get("/api/prompts.csv", (_req, res) => {
  const headers = ["Scenario ID", "Expected Verdict", "Label", "Test Prompt"];
  const rows = scenarios.map((scenario) => [scenario.id, scenario.verdict, scenario.label, scenario.query]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=agent-trust-os-prompt-library.csv");
  res.send(csv);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    success: false,
    error: error.message || "Unexpected server error"
  });
});

if (require.main === module) {
  Promise.all([ensureInteractionsFile(), ensureFeedbackFile()]).then(() => {
    app.listen(PORT, () => {
      console.log(`Agent Trust OS running at http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
