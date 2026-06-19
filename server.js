require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILES = {
  agents: path.join(DATA_DIR, "agents.json"),
  policies: path.join(DATA_DIR, "policies.json"),
  logs: path.join(DATA_DIR, "logs.json"),
  reports: path.join(DATA_DIR, "reports.json"),
  feedback: path.join(DATA_DIR, "feedback.json")
};

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await Promise.all(Object.values(DATA_FILES).map(async (filePath) => {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, "[]\n");
    }
  }));
}

async function readJson(name) {
  await ensureDataFiles();
  const raw = await fs.readFile(DATA_FILES[name], "utf8");
  return raw.trim() ? JSON.parse(raw) : [];
}

async function writeJson(name, value) {
  await fs.writeFile(DATA_FILES[name], `${JSON.stringify(value, null, 2)}\n`);
}

function requireFields(source, fields) {
  const missing = fields.filter((field) => {
    const value = source[field];
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  });
  if (missing.length) {
    const error = new Error(`Missing required field(s): ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }
}

function splitRules(text) {
  return String(text || "")
    .split(/\n|,/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function ruleMatches(rule, actionText) {
  const normalizedRule = normalize(rule);
  const normalizedAction = normalize(actionText);
  if (!normalizedRule || !normalizedAction) return false;
  const ruleTokens = normalizedRule.split(" ").filter((token) => token.length > 3);
  if (normalizedAction.includes(normalizedRule)) return true;
  return ruleTokens.length >= 2 && ruleTokens.filter((token) => normalizedAction.includes(token)).length >= 2;
}

function classifyScore(score) {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

function determinePolicyStatus(action, policy) {
  if (!policy) {
    return {
      policyStatus: "Unclear",
      prohibitedMatch: null,
      approvalMatch: null,
      approvedMatch: null,
      policyRequiresApproval: false
    };
  }

  const actionText = [
    action.actionTitle,
    action.actionDescription,
    action.outputSummary,
    action.additionalNotes
  ].join(" ");

  const prohibitedMatch = splitRules(policy.prohibitedActions).find((rule) => ruleMatches(rule, actionText));
  const approvalMatch = splitRules(policy.approvalRequiredActions).find((rule) => ruleMatches(rule, actionText));
  const approvedMatch = splitRules(policy.approvedActions).find((rule) => ruleMatches(rule, actionText));
  const dataTouched = (action.dataTouched || []).map(normalize).join(" ");
  const sensitiveRules = policy.sensitiveDataRules || [];
  const sensitiveApproval = sensitiveRules.some((rule) => {
    const value = normalize(rule);
    return (value.includes("financial") && dataTouched.includes("financial"))
      || (value.includes("hr") && (dataTouched.includes("employee") || dataTouched.includes("hr")))
      || (value.includes("health") && dataTouched.includes("health"))
      || (value.includes("legal") && normalize(action.businessImpact).includes("legal"))
      || (value.includes("customer-facing") && normalize(action.intendedRecipient).includes("customer"));
  });

  if (prohibitedMatch) {
    return { policyStatus: "Prohibited", prohibitedMatch, approvalMatch, approvedMatch, policyRequiresApproval: true };
  }
  if (approvalMatch || sensitiveApproval) {
    return { policyStatus: "Approval Required", prohibitedMatch, approvalMatch, approvedMatch, policyRequiresApproval: true };
  }
  if (approvedMatch) {
    return { policyStatus: "Approved", prohibitedMatch, approvalMatch, approvedMatch, policyRequiresApproval: false };
  }
  return { policyStatus: "Unclear", prohibitedMatch, approvalMatch, approvedMatch, policyRequiresApproval: false };
}

function calculateRisk(action, policyMatch) {
  let score = 10;
  const data = (action.dataTouched || []).map(normalize).join(" ");
  const recipient = normalize(action.intendedRecipient);
  const impact = normalize(action.businessImpact);
  const approval = normalize(action.humanApprovalRequested);
  const external = normalize(action.externalAction);

  if (data.includes("financial")) score += 20;
  if (data.includes("employee") || data.includes("hr")) score += 25;
  if (data.includes("health")) score += 30;
  if (data.includes("credential") || data.includes("secret")) score += 25;
  if (data.includes("confidential")) score += 15;
  if (external === "yes") score += 20;
  if (["customer", "vendor", "consultant", "public"].includes(recipient)) score += 15;
  if (policyMatch.policyRequiresApproval && approval !== "yes") score += 20;
  if (policyMatch.prohibitedMatch) score += 30;
  if (policyMatch.approvalMatch) score += 20;
  if (impact === "high") score += 15;
  if (impact === "critical") score += 30;
  if (policyMatch.policyStatus === "Unclear") score += 10;
  if (approval === "yes") score -= 10;

  score = Math.max(0, Math.min(100, score));
  return { riskScore: score, riskLevel: classifyScore(score) };
}

function recommendedDecision(policyStatus, riskLevel) {
  if (policyStatus === "Prohibited" || riskLevel === "Critical") return "Reject";
  if (policyStatus === "Approval Required" || riskLevel === "High") return "Escalate";
  if (riskLevel === "Medium" || policyStatus === "Unclear") return "Request Human Review";
  return "Approve";
}

function requiredControls(action, policyMatch, riskLevel) {
  const controls = [];
  if (policyMatch.policyRequiresApproval || ["High", "Critical"].includes(riskLevel)) {
    controls.push("Documented human reviewer approval before the action proceeds");
  }
  if ((action.dataTouched || []).some((item) => normalize(item).includes("financial"))) {
    controls.push("Finance manager review before release");
  }
  if ((action.dataTouched || []).some((item) => normalize(item).includes("confidential"))) {
    controls.push("Confirm only approved recipients can access confidential information");
  }
  if (normalize(action.externalAction) === "yes") {
    controls.push("Verify external sharing authorization and recipient identity");
  }
  if (policyMatch.policyStatus === "Prohibited") {
    controls.push("Block the action unless policy ownership formally changes the rule");
  }
  return controls.length ? controls : ["Keep action log, policy evidence, and output summary with the review record"];
}

function buildFallbackReport({ agent, policy, action, policyMatch, riskScore, riskLevel, decision }) {
  const controls = requiredControls(action, policyMatch, riskLevel);
  return `AGENTTRUST OS RISK REVIEW

1. Agent Snapshot
Agent name: ${agent.name}
Owner: ${agent.owner}
Department: ${agent.department}
Purpose: ${agent.purpose}
Risk category: ${agent.riskCategory}

2. Action Summary
${action.actionTitle}: ${action.actionDescription}
Output summary: ${action.outputSummary || "No output summary provided."}

3. Policy Match
${policyMatch.policyStatus}
Reason: ${policyMatch.prohibitedMatch ? `The action appears to match prohibited rule "${policyMatch.prohibitedMatch}".` : policyMatch.approvalMatch ? `The action appears to match approval-required rule "${policyMatch.approvalMatch}".` : policyMatch.policyStatus === "Approved" ? "The action appears consistent with the approved action list." : policy ? "No clear policy rule matched the action." : "No policy was found for this agent."}

4. Risk Score
${riskScore} out of 100.

5. Risk Level
${riskLevel}

6. Data Sensitivity Review
Data touched: ${(action.dataTouched || []).join(", ") || "None listed"}. The sensitivity assessment is based on the declared data categories, recipient, business impact, and approval status.

7. Potential Risk Areas
Relevant areas may include privacy, security, financial, legal / compliance, customer trust, operational, vendor, data leakage, unauthorized action, and hallucination or inaccurate output.

8. Human Approval Requirement
${policyMatch.policyRequiresApproval || ["High", "Critical"].includes(riskLevel) ? "Yes" : "No"}. ${policyMatch.policyRequiresApproval ? "Policy or sensitive data rules require human review." : "The requirement is based on risk level and policy match."}

9. Recommended Decision
${decision}

10. Required Controls
${controls.map((control) => `- ${control}`).join("\n")}

11. Audit Summary
AgentTrust OS reviewed this action against the registered agent profile, policy rules, data touched, tools used, approval status, and preliminary risk score. The review should be retained as governance evidence.

12. Limitations
This AI-assisted review is decision support only and is not a substitute for qualified legal, cybersecurity, compliance, HR, financial, healthcare, or safety review.`;
}

function buildPrompts({ agent, policy, action, policyMatch, riskScore, riskLevel }) {
  const system = "You are an AI-agent governance and audit assistant. Use cautious professional wording. Do not provide legal, cybersecurity, financial, HR, healthcare, safety, or compliance advice. Treat your output as decision support only.";
  const user = `Compare the agent registration details, policy rules, logged action, data touched, tools used, intended recipient, human approval status, business impact, and preliminary risk score.

Return this exact structure:

AGENTTRUST OS RISK REVIEW

1. Agent Snapshot
Include agent name, owner, department, purpose, and risk category.

2. Action Summary
Summarize what the agent attempted or completed.

3. Policy Match
Choose: Approved, Approval Required, Prohibited, or Unclear. Explain why.

4. Risk Score
Show score from 0 to 100.

5. Risk Level
Choose: Low, Medium, High, or Critical.

6. Data Sensitivity Review
Explain the sensitivity of the data touched.

7. Potential Risk Areas
Identify relevant risks from privacy, security, financial, employment, legal / compliance, customer trust, operational, vendor, data leakage, unauthorized action, hallucination or inaccurate output.

8. Human Approval Requirement
State Yes or No and explain.

9. Recommended Decision
Choose: Approve, Reject, Escalate, or Request Human Review.

10. Required Controls
List practical controls needed before the action proceeds.

11. Audit Summary
Write a short professional audit note.

12. Limitations
Explain that AI review is not a substitute for qualified legal, cybersecurity, compliance, HR, financial, healthcare, or safety review.

Context:
Agent: ${JSON.stringify(agent, null, 2)}
Policy: ${JSON.stringify(policy || {}, null, 2)}
Action: ${JSON.stringify(action, null, 2)}
System policy status: ${policyMatch.policyStatus}
Preliminary risk score: ${riskScore}
Preliminary risk level: ${riskLevel}`;
  return { system, user };
}

async function getAiReview(context) {
  const decision = recommendedDecision(context.policyMatch.policyStatus, context.riskLevel);
  if (GEMINI_API_KEY) {
    try {
      const geminiReview = await getGeminiReview(context);
      if (geminiReview) return geminiReview;
    } catch (error) {
      console.error("Gemini review failed, trying next provider:", error.message);
    }
  }

  if (!openai) {
    return buildFallbackReport({ ...context, decision });
  }

  try {
    const prompts = buildPrompts(context);
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: prompts.system },
        { role: "user", content: prompts.user }
      ],
      temperature: 0.2
    });
    return completion.choices[0]?.message?.content || buildFallbackReport({ ...context, decision });
  } catch (error) {
    console.error("OpenAI review failed, using fallback review:", error.message);
    return buildFallbackReport({ ...context, decision });
  }
}

async function getGeminiReview(context) {
  const prompts = buildPrompts(context);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `${prompts.system}\n\n${prompts.user}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini request failed with status ${response.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini response did not include text output");
  }

  return text;
}

function extractControls(report) {
  const lines = String(report || "").split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("10."));
  const end = lines.findIndex((line, index) => index > start && line.trim().startsWith("11."));
  if (start === -1) return [];
  return lines.slice(start + 1, end === -1 ? undefined : end)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function extractAuditSummary(report) {
  const match = String(report || "").match(/11\.\s*Audit Summary\s*([\s\S]*?)(?:\n\s*12\.|$)/i);
  return match ? match[1].trim() : "Audit summary generated by AgentTrust OS.";
}

function buildAuditReport({ reportId, review, decision, agent }) {
  const controls = extractControls(review.report);
  return `AGENTTRUST OS AUDIT REPORT

Report ID: ${reportId}
Timestamp: ${new Date().toISOString()}
Agent name: ${agent.name}
Agent owner: ${agent.owner}
Department: ${agent.department}
Agent purpose: ${agent.purpose}
Action reviewed: ${review.action.actionTitle}
Tools used: ${(review.action.toolsUsed || []).join(", ") || "None listed"}
Data touched: ${(review.action.dataTouched || []).join(", ") || "None listed"}
Intended recipient: ${review.action.intendedRecipient}
Policy status: ${review.policyStatus}
Risk score: ${review.riskScore}
Risk level: ${review.riskLevel}
Approval required: ${review.approvalRequired ? "Yes" : "No"}
Recommended decision: ${review.recommendedDecision}
Final human decision: ${decision.decision}
Reviewer name: ${decision.reviewerName}
Reviewer notes: ${decision.reviewerNotes || "No reviewer notes provided."}

Required controls:
${(controls.length ? controls : requiredControls(review.action, { policyStatus: review.policyStatus, policyRequiresApproval: review.approvalRequired }, review.riskLevel)).map((control) => `- ${control}`).join("\n")}

Audit summary:
${extractAuditSummary(review.report)}

Human review notice:
This report supports human governance review. High-impact, sensitive, external, or unclear actions should be reviewed by qualified staff before implementation.

Disclaimer:
AgentTrust OS is an educational MVP and does not provide legal, regulatory, cybersecurity, financial, healthcare, HR, or professional compliance advice. Do not use real confidential or sensitive company data in demos. Risk classifications are decision support and may contain model or prompt limitations.`;
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "AgentTrust OS" });
});

app.get("/api/agents", async (_req, res, next) => {
  try {
    res.json(await readJson("agents"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/agents", async (req, res, next) => {
  try {
    requireFields(req.body, ["name", "purpose", "department", "owner", "riskCategory", "businessImpact"]);
    const agents = await readJson("agents");
    const agent = {
      id: makeId("agent"),
      name: req.body.name.trim(),
      purpose: req.body.purpose.trim(),
      department: req.body.department,
      owner: req.body.owner.trim(),
      tools: req.body.tools || [],
      dataAccess: req.body.dataAccess || [],
      riskCategory: req.body.riskCategory,
      businessImpact: req.body.businessImpact,
      notes: req.body.notes || "",
      status: "Active",
      createdAt: new Date().toISOString()
    };
    agents.unshift(agent);
    await writeJson("agents", agents);
    res.status(201).json(agent);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/agents/:id", async (req, res, next) => {
  try {
    const agents = await readJson("agents");
    const updated = agents.map((agent) => agent.id === req.params.id ? { ...agent, status: "Inactive", deactivatedAt: new Date().toISOString() } : agent);
    await writeJson("agents", updated);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/policies", async (_req, res, next) => {
  try {
    res.json(await readJson("policies"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/policies", async (req, res, next) => {
  try {
    requireFields(req.body, ["agentId", "approvedActions", "approvalRequiredActions", "prohibitedActions", "escalationContact", "reviewFrequency"]);
    const policies = await readJson("policies");
    const existingIndex = policies.findIndex((policy) => policy.agentId === req.body.agentId);
    const policy = {
      id: existingIndex >= 0 ? policies[existingIndex].id : makeId("policy"),
      agentId: req.body.agentId,
      approvedActions: req.body.approvedActions,
      approvalRequiredActions: req.body.approvalRequiredActions,
      prohibitedActions: req.body.prohibitedActions,
      sensitiveDataRules: req.body.sensitiveDataRules || [],
      escalationContact: req.body.escalationContact,
      reviewFrequency: req.body.reviewFrequency,
      updatedAt: new Date().toISOString()
    };
    if (existingIndex >= 0) policies[existingIndex] = policy;
    else policies.unshift(policy);
    await writeJson("policies", policies);
    res.json(policy);
  } catch (error) {
    next(error);
  }
});

app.post("/api/review-action", async (req, res, next) => {
  try {
    requireFields(req.body, ["agentId", "actionTitle", "actionDescription", "intendedRecipient", "humanApprovalRequested", "externalAction", "businessImpact"]);
    const [agents, policies, logs] = await Promise.all([readJson("agents"), readJson("policies"), readJson("logs")]);
    const agent = agents.find((item) => item.id === req.body.agentId);
    if (!agent) {
      const error = new Error("Selected agent was not found");
      error.status = 404;
      throw error;
    }
    const policy = policies.find((item) => item.agentId === req.body.agentId);
    const action = {
      agentId: req.body.agentId,
      actionTitle: req.body.actionTitle,
      actionDescription: req.body.actionDescription,
      toolsUsed: req.body.toolsUsed || [],
      dataTouched: req.body.dataTouched || [],
      intendedRecipient: req.body.intendedRecipient,
      humanApprovalRequested: req.body.humanApprovalRequested,
      externalAction: req.body.externalAction,
      businessImpact: req.body.businessImpact,
      outputSummary: req.body.outputSummary || "",
      additionalNotes: req.body.additionalNotes || ""
    };
    const policyMatch = determinePolicyStatus(action, policy);
    const { riskScore, riskLevel } = calculateRisk(action, policyMatch);
    const approvalRequired = policyMatch.policyRequiresApproval || ["High", "Critical"].includes(riskLevel);
    const recommended = recommendedDecision(policyMatch.policyStatus, riskLevel);
    const reviewId = makeId("review");
    const report = await getAiReview({ agent, policy, action, policyMatch, riskScore, riskLevel });
    const review = {
      success: true,
      reviewId,
      agentId: agent.id,
      agentName: agent.name,
      action,
      riskScore,
      riskLevel,
      policyStatus: policyMatch.policyStatus,
      approvalRequired,
      recommendedDecision: recommended,
      report,
      decision: "Pending",
      createdAt: new Date().toISOString()
    };
    logs.unshift(review);
    await writeJson("logs", logs);
    res.json(review);
  } catch (error) {
    next(error);
  }
});

app.post("/api/decision", async (req, res, next) => {
  try {
    requireFields(req.body, ["reviewId", "decision", "reviewerName"]);
    const logs = await readJson("logs");
    const index = logs.findIndex((item) => item.reviewId === req.body.reviewId);
    if (index === -1) {
      const error = new Error("Review was not found");
      error.status = 404;
      throw error;
    }
    const decision = {
      decision: req.body.decision,
      reviewerName: req.body.reviewerName,
      reviewerNotes: req.body.reviewerNotes || "",
      decidedAt: new Date().toISOString()
    };
    logs[index] = { ...logs[index], decision: req.body.decision, reviewer: decision };
    await writeJson("logs", logs);
    res.json({ success: true, review: logs[index] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/generate-audit-report", async (req, res, next) => {
  try {
    requireFields(req.body, ["reviewId"]);
    const [agents, logs, reports] = await Promise.all([readJson("agents"), readJson("logs"), readJson("reports")]);
    const review = logs.find((item) => item.reviewId === req.body.reviewId);
    if (!review) {
      const error = new Error("Review was not found");
      error.status = 404;
      throw error;
    }
    const agent = agents.find((item) => item.id === review.agentId) || { name: review.agentName, owner: "Unknown", department: "Unknown", purpose: "Unknown" };
    const decision = review.reviewer || {
      decision: req.body.decision || review.decision || "Pending",
      reviewerName: req.body.reviewerName || "Not recorded",
      reviewerNotes: req.body.reviewerNotes || "No reviewer notes recorded."
    };
    const reportId = makeId("report");
    const reportText = buildAuditReport({ reportId, review, decision, agent });
    const report = {
      id: reportId,
      reviewId: review.reviewId,
      agentId: review.agentId,
      agentName: agent.name,
      actionTitle: review.action.actionTitle,
      riskScore: review.riskScore,
      riskLevel: review.riskLevel,
      policyStatus: review.policyStatus,
      finalDecision: decision.decision,
      reportText,
      createdAt: new Date().toISOString()
    };
    reports.unshift(report);
    await writeJson("reports", reports);
    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports", async (_req, res, next) => {
  try {
    res.json(await readJson("reports"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/feedback", async (req, res, next) => {
  try {
    requireFields(req.body, ["rating", "comment"]);
    const feedback = await readJson("feedback");
    const item = {
      id: makeId("feedback"),
      reportId: req.body.reportId || null,
      rating: Number(req.body.rating),
      comment: req.body.comment,
      createdAt: new Date().toISOString()
    };
    feedback.unshift(item);
    await writeJson("feedback", feedback);
    res.status(201).json({ success: true, feedback: item });
  } catch (error) {
    next(error);
  }
});

app.get("/api/logs", async (_req, res, next) => {
  try {
    res.json(await readJson("logs"));
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

ensureDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`AgentTrust OS running at http://localhost:${PORT}`);
  });
});
