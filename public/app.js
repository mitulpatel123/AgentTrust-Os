const state = {
  company: null,
  agentProfile: {},
  governanceBoundaries: {},
  systemEvidence: {},
  products: [],
  delivery: {},
  promotions: [],
  coupons: [],
  policies: [],
  payments: [],
  rules: [],
  scenarios: [],
  interactions: [],
  feedback: [],
  metrics: { total: 0, compliant: 0, flagged: 0, blocked: 0, pendingReview: 0, complianceRate: 100 },
  ruleViolations: [],
  ai: { enabled: false, model: "gemini-3.5-flash" },
  activityFilter: "ALL",
  expandedId: null,
  dataTab: "products"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}`);
  return data;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatDate(value, includeTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], includeTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" });
}

function verdictClass(verdict) {
  return String(verdict || "").toLowerCase();
}

function badge(verdict) {
  return `<span class="badge ${verdictClass(verdict)}">${escapeHtml(verdict)}</span>`;
}

function metricCards(metrics) {
  const rateStatus = metrics.complianceRate >= 80 ? "Healthy" : metrics.complianceRate >= 60 ? "Needs attention" : "Critical attention";
  return [
    { label: "Total interactions", value: metrics.total, note: "All monitored requests", className: "" },
    { label: "Compliant", value: metrics.compliant, note: "PASS outcomes", className: "pass" },
    { label: "Flagged", value: metrics.flagged, note: "WARNING outcomes", className: "warning" },
    { label: "Blocked", value: metrics.blocked, note: "FAIL outcomes", className: "fail" },
    { label: "Compliance rate", value: `${metrics.complianceRate}%`, note: rateStatus, className: "rate" }
  ].map((item) => `
    <article class="metric-card ${item.className}">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      <small>${item.note}</small>
    </article>
  `).join("");
}

function renderMetrics() {
  $("#monitorMetrics").innerHTML = metricCards(state.metrics);
  $("#auditMetrics").innerHTML = metricCards(state.metrics);
  $("#navActivityCount").textContent = state.metrics.total;
  $("#navReviewCount").textContent = state.metrics.pendingReview || 0;
  $("#pendingReviewCount").textContent = state.metrics.pendingReview || 0;
  $("#attentionCount").textContent = state.metrics.flagged + state.metrics.blocked;
  $("#filterAll").textContent = state.metrics.total;
  $("#filterPass").textContent = state.metrics.compliant;
  $("#filterWarning").textContent = state.metrics.flagged;
  $("#filterFail").textContent = state.metrics.blocked;

  let briefing = "No interactions have been reviewed. TRUST OS is active and ready.";
  if (state.metrics.total && state.metrics.flagged + state.metrics.blocked === 0) {
    briefing = `All ${state.metrics.total} monitored interactions are compliant. No action is currently required.`;
  } else if (state.metrics.total) {
    briefing = `${state.metrics.flagged} interaction${state.metrics.flagged === 1 ? "" : "s"} flagged and ${state.metrics.blocked} blocked. Review the evidence before ShopBot policy changes are approved.`;
  }
  $("#briefingText").textContent = briefing;
}

function renderScenarioOptions() {
  const category = $("#scenarioCategory").value;
  const matching = state.scenarios.filter((scenario) => scenario.verdict === category);
  $("#scenarioSelect").innerHTML = matching.map((scenario) => `
    <option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.label)}</option>
  `).join("");
  if (matching[0]) setQueryFromScenario(matching[0].id);
}

function setQueryFromScenario(id) {
  const scenario = state.scenarios.find((item) => item.id === id);
  if (!scenario) return;
  $("#queryInput").value = scenario.query;
  updateQueryCount();
}

function updateQueryCount() {
  $("#queryCount").textContent = `${$("#queryInput").value.length} / 1000`;
}

function renderResult(interaction) {
  if (!interaction) return;
  $("#resultEmpty").classList.add("hidden");
  $("#resultContent").classList.remove("hidden");
  const rules = interaction.rulesViolated?.length
    ? interaction.rulesViolated.map((rule) => `<span class="rule-tag">Rule ${rule.id}: ${escapeHtml(rule.title)}</span>`).join("")
    : '<span class="rule-tag">No rules violated</span>';
  const checks = (interaction.checks || []).map((check) => `
    <div class="check-item ${check.passed ? "" : "failed"}">
      <span class="check-status">${check.passed ? "OK" : "!"}</span>
      <strong>${escapeHtml(check.name)}</strong>
      <small>${escapeHtml(check.detail)}</small>
    </div>
  `).join("");
  const analysis = interaction.aiAnalysis || {
    summary: interaction.explanation,
    riskReasoning: interaction.explanation,
    recommendedFollowUp: "Retain this interaction in the audit log."
  };
  const provider = interaction.aiProvider || { source: "Local fallback", model: "Deterministic rules" };
  const providerClass = provider.source === "Gemini" ? "gemini" : "fallback";
  const citations = (interaction.citations || []).map((citation) => `
    <li><strong>[${escapeHtml(citation.id)}] ${escapeHtml(citation.title)}</strong><span>${escapeHtml(citation.content)}</span></li>
  `).join("");
  const telemetry = interaction.telemetry || {};
  const telemetryText = `${Number(telemetry.latencyMs || 0).toFixed(2)} ms · ${telemetry.inputTokensEstimated || 0} input tokens · ${telemetry.outputTokensEstimated || 0} output tokens · $${Number(telemetry.estimatedCostUsd || 0).toFixed(6)}`;

  $("#resultContent").innerHTML = `
    <div class="verdict-header">
      ${badge(interaction.verdict)}
      <div><h3>${escapeHtml(interaction.intent)}</h3><p>${formatDate(interaction.createdAt)}</p></div>
      <div class="risk-label">Risk level<strong>${escapeHtml(interaction.riskLevel)}</strong></div>
    </div>
    <div class="result-summary-grid">
      <div class="summary-field"><span>Customer intent</span><strong>${escapeHtml(interaction.intent)}</strong></div>
      <div class="summary-field"><span>AI response quality</span><strong>${escapeHtml(interaction.responseQuality)}</strong></div>
    </div>
    <div class="transcript-block"><span>Customer query</span><p>${escapeHtml(interaction.query)}</p></div>
    <div class="transcript-block shopbot"><span>ShopBot response</span><p>${escapeHtml(interaction.shopbotResponse)}</p></div>
    <div class="explanation-block"><span>Policy engine explanation</span><p>${escapeHtml(interaction.explanation)}</p></div>
    <section class="ai-analysis-block">
      <div class="ai-analysis-heading">
        <div><span>AI-generated analysis</span><strong>Management review</strong></div>
        <span class="provider-badge ${providerClass}">${escapeHtml(provider.source)}${provider.model ? ` / ${escapeHtml(provider.model)}` : ""}</span>
      </div>
      <div class="ai-analysis-content">
        <div><span>Summary</span><p>${escapeHtml(analysis.summary)}</p></div>
        <div><span>Risk reasoning</span><p>${escapeHtml(analysis.riskReasoning)}</p></div>
        <div><span>Recommended follow-up</span><p>${escapeHtml(analysis.recommendedFollowUp)}</p></div>
        <div><span>Traceable evidence</span><ul class="citation-list">${citations || "<li>No citations recorded for this legacy interaction.</li>"}</ul></div>
        <div><span>Latency and cost</span><p class="telemetry-line">${escapeHtml(telemetryText)}</p></div>
        <div><span>Human approval state</span><p>${escapeHtml(interaction.approvalStatus || (interaction.reviewRequired ? "Pending human review" : "Not required"))}</p></div>
      </div>
    </section>
    <div class="rules-block"><span>Rules triggered</span><div class="rule-tags">${rules}</div></div>
    <div class="checks-block"><span>Seven compliance checks</span><div class="check-list">${checks}</div></div>
    <div class="action-line"><strong>Action taken:</strong> ${escapeHtml(interaction.action)}</div>
  `;
}

function emptyRow(columns, message) {
  return `<tr class="empty-row"><td colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function renderRecent() {
  const recent = state.interactions.slice(0, 5);
  $("#recentTableBody").innerHTML = recent.length ? recent.map((item) => `
    <tr>
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
      <td>${escapeHtml(item.requester)}</td>
      <td class="query-cell" title="${escapeHtml(item.query)}">${escapeHtml(item.query)}</td>
      <td>${badge(item.verdict)}</td>
      <td>${escapeHtml(item.riskLevel)}</td>
      <td>${escapeHtml(item.action)}</td>
    </tr>
  `).join("") : emptyRow(6, "No monitored interactions yet.");
}

function detailDrawer(item) {
  const rules = item.rulesViolated?.length
    ? item.rulesViolated.map((rule) => `Rule ${rule.id}: ${rule.title}`).join("; ")
    : "None";
  const review = item.review
    ? `${item.review.decision} by ${item.review.reviewer} on ${formatDate(item.review.decidedAt)}${item.review.notes ? ` - ${item.review.notes}` : ""}`
    : item.reviewRequired ? "Pending human review" : "Not required";
  const provider = `${item.aiProvider?.source || "Local fallback"}${item.aiProvider?.model ? ` / ${item.aiProvider.model}` : ""}`;
  const citations = item.citations?.length
    ? item.citations.map((citation) => `[${citation.id}] ${citation.title}`).join("; ")
    : "None recorded";
  const telemetry = item.telemetry || {};
  return `
    <tr class="detail-row">
      <td colspan="6">
        <div class="detail-drawer">
          <div><h3>Customer query</h3><p>${escapeHtml(item.query)}</p></div>
          <div><h3>ShopBot response</h3><p>${escapeHtml(item.shopbotResponse)}</p></div>
          <div><h3>TRUST OS explanation</h3><p>${escapeHtml(item.explanation)}</p></div>
          <div><h3>Rules triggered</h3><p>${escapeHtml(rules)}</p></div>
          <div><h3>AI analysis source</h3><p>${escapeHtml(provider)}</p></div>
          <div><h3>Evidence citations</h3><p>${escapeHtml(citations)}</p></div>
          <div><h3>Latency / estimated cost</h3><p>${escapeHtml(`${Number(telemetry.latencyMs || 0).toFixed(2)} ms / $${Number(telemetry.estimatedCostUsd || 0).toFixed(6)}`)}</p></div>
          <div><h3>Human review</h3><p>${escapeHtml(review)}</p></div>
          <div class="full-span"><h3>Action taken</h3><p>${escapeHtml(item.action)}</p></div>
        </div>
      </td>
    </tr>
  `;
}

function renderReviewQueue() {
  const reviewItems = state.interactions.filter((item) => item.reviewRequired);
  $("#reviewTableBody").innerHTML = reviewItems.length ? reviewItems.map((item) => `
    <tr>
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
      <td class="query-cell" title="${escapeHtml(item.query)}">${escapeHtml(item.query)}</td>
      <td>${badge(item.verdict)}</td>
      <td>${item.review ? escapeHtml(item.review.decision) : '<span class="review-pending">Pending review</span>'}</td>
      <td>${escapeHtml(item.review?.reviewer || "Unassigned")}</td>
      <td><button class="table-action" type="button" data-review-id="${escapeHtml(item.id)}">${item.review ? "Update" : "Review"}</button></td>
    </tr>
  `).join("") : emptyRow(6, "No WARNING or FAIL interactions require review.");
}

function renderFeedback() {
  const ratings = state.feedback.map((item) => Number(item.rating)).filter(Number.isFinite);
  const average = ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1) : null;
  $("#feedbackSummary").textContent = average ? `${average} / 5 from ${ratings.length} tester${ratings.length === 1 ? "" : "s"}` : "No ratings yet";
  $("#feedbackList").innerHTML = state.feedback.length ? state.feedback.slice(0, 5).map((item) => `
    <article class="feedback-item">
      <div><strong>${escapeHtml(item.name)}</strong><span>${"*".repeat(Number(item.rating))} / 5</span></div>
      <p>${escapeHtml(item.comment || "No written comment")}</p>
      <small>${escapeHtml(formatDate(item.createdAt))}</small>
    </article>
  `).join("") : '<div class="result-empty compact-empty"><p>No external tester feedback has been submitted.</p></div>';
}

function renderActivity() {
  const filtered = state.activityFilter === "ALL"
    ? state.interactions
    : state.interactions.filter((item) => item.verdict === state.activityFilter);
  if (!filtered.length) {
    $("#activityTableBody").innerHTML = emptyRow(6, `No ${state.activityFilter === "ALL" ? "" : state.activityFilter.toLowerCase()} interactions found.`);
    return;
  }
  $("#activityTableBody").innerHTML = filtered.map((item) => `
    <tr>
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
      <td>${escapeHtml(item.requester)}</td>
      <td class="query-cell" title="${escapeHtml(item.query)}">${escapeHtml(item.query)}</td>
      <td>${badge(item.verdict)}</td>
      <td>${escapeHtml(item.riskLevel)}</td>
      <td><button class="table-action" type="button" data-expand-id="${escapeHtml(item.id)}">${state.expandedId === item.id ? "Close" : "View"}</button></td>
    </tr>
    ${state.expandedId === item.id ? detailDrawer(item) : ""}
  `).join("");
}

function renderAudit() {
  const total = Math.max(state.metrics.total, 1);
  const bars = [
    { label: "PASS", value: state.metrics.compliant, className: "pass" },
    { label: "WARNING", value: state.metrics.flagged, className: "warning" },
    { label: "FAIL", value: state.metrics.blocked, className: "fail" }
  ];
  $("#verdictChart").innerHTML = bars.map((bar) => `
    <div class="chart-row">
      <span class="chart-label">${bar.label}</span>
      <div class="chart-track"><div class="chart-fill ${bar.className}" style="width:${Math.round((bar.value / total) * 100)}%"></div></div>
      <span class="chart-value">${bar.value}</span>
    </div>
  `).join("");

  const triggered = state.ruleViolations.filter((rule) => rule.count > 0).slice(0, 6);
  const maxCount = Math.max(...triggered.map((rule) => rule.count), 1);
  $("#ruleChart").innerHTML = triggered.length ? triggered.map((rule) => `
    <div class="rule-row">
      <span title="Rule ${rule.id}: ${escapeHtml(rule.title)}">Rule ${rule.id}: ${escapeHtml(rule.title)}</span>
      <div class="rule-mini-track"><div class="rule-mini-fill" style="width:${Math.round((rule.count / maxCount) * 100)}%"></div></div>
      <strong>${rule.count}</strong>
    </div>
  `).join("") : '<div class="result-empty"><p>No rule violations have been recorded.</p></div>';

  $("#auditTableBody").innerHTML = state.interactions.length ? state.interactions.map((item) => {
    const rules = item.rulesViolated?.length ? item.rulesViolated.map((rule) => rule.id).join(", ") : "None";
    return `
      <tr>
        <td>${escapeHtml(item.id)}</td>
        <td>${escapeHtml(formatDate(item.createdAt, false))}</td>
        <td class="query-cell" title="${escapeHtml(item.query)}">${escapeHtml(item.query)}</td>
        <td>${badge(item.verdict)}</td>
        <td>${escapeHtml(rules)}</td>
        <td>${escapeHtml(item.review?.decision || (item.reviewRequired ? "Pending review" : "Not required"))}</td>
        <td>${escapeHtml(item.action)}</td>
      </tr>
    `;
  }).join("") : emptyRow(7, "Run a compliance check to create audit evidence.");
}

function renderRules() {
  $("#rulesTableBody").innerHTML = state.rules.map((rule) => `
    <tr>
      <td><strong>${String(rule.id).padStart(2, "0")}</strong></td>
      <td>${escapeHtml(rule.title)}</td>
      <td>${escapeHtml(rule.description)}</td>
      <td><span class="system-state"><span class="status-dot"></span> Active</span></td>
    </tr>
  `).join("");
  renderAgentProfile();
  renderOfficialData();
}

function renderAgentProfile() {
  const profile = state.agentProfile || {};
  const fields = [
    ["Agent name", profile.name],
    ["Owner", profile.owner],
    ["Department", profile.department],
    ["Risk category", profile.riskCategory],
    ["Purpose", profile.purpose],
    ["Approved data access", (profile.dataAccess || []).join(", ")]
  ];
  $("#agentProfileGrid").innerHTML = fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not defined")}</strong></div>`).join("");

  const boundaryGroups = [
    ["Approved actions", state.governanceBoundaries.approvedActions || [], "approved"],
    ["Human review required", state.governanceBoundaries.reviewRequiredActions || [], "review"],
    ["Prohibited actions", state.governanceBoundaries.prohibitedActions || [], "prohibited"]
  ];
  $("#boundaryGrid").innerHTML = boundaryGroups.map(([title, items, className]) => `
    <article class="boundary-column ${className}"><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
  `).join("");
}

function renderSystemEvidence() {
  const evidence = state.systemEvidence || {};
  const fillList = (selector, items) => {
    $(selector).innerHTML = (items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  };
  fillList("#architectureList", evidence.architecture);
  fillList("#scaleList", evidence.scalePath);
  fillList("#costList", evidence.costDrivers);
  fillList("#remainingRiskList", evidence.remainingRisks);
  $("#modelDisclosure").textContent = state.ai.enabled
    ? `${state.ai.model} management analysis`
    : `${state.ai.model} configured with local fallback active`;
  const assumptions = evidence.ventureAssumptions || {};
  const assumptionFields = [
    ["Target customer", assumptions.targetCustomer],
    ["Daily user", assumptions.user],
    ["Economic buyer", assumptions.buyer],
    ["Value proposition", assumptions.valueProposition],
    ["Revenue model", assumptions.revenueModel],
    ["Validation status", assumptions.validationStatus]
  ];
  $("#ventureAssumptionGrid").innerHTML = assumptionFields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not defined")}</strong></div>`).join("");
}

function renderOfficialData() {
  let items = [];
  if (state.dataTab === "products") {
    items = state.products.map((product) => ({
      title: product.name,
      value: `$${Number(product.price).toFixed(2)} | ${product.stock}`,
      detail: `${product.features.join(", ")}. ${product.rating}.`
    }));
  } else if (state.dataTab === "policies") {
    items = [
      ...state.policies.map((policy) => ({ title: policy.name, value: "Confirmed policy", detail: policy.detail })),
      { title: "Standard delivery", value: state.delivery.time || state.delivery.standard?.time, detail: state.delivery.standard?.cost || "" },
      { title: "Express delivery", value: state.delivery.express?.time, detail: state.delivery.express?.cost }
    ];
  } else {
    items = [
      ...state.promotions.map((offer) => ({ title: offer.code, value: offer.value, detail: offer.condition })),
      ...state.coupons.map((offer) => ({ title: offer.code, value: offer.value, detail: offer.condition }))
    ];
  }
  $("#officialDataContent").innerHTML = `<div class="data-grid">${items.map((item) => `
    <article class="data-item">
      <h3>${escapeHtml(item.title)}</h3>
      <p class="data-value">${escapeHtml(item.value)}</p>
      <p>${escapeHtml(item.detail)}</p>
    </article>
  `).join("")}</div>`;
}

function renderAll() {
  $("#aiRuntime").textContent = state.ai.enabled
    ? `AI analysis: ${state.ai.model}`
    : "AI analysis: local fallback";
  renderMetrics();
  renderRecent();
  renderReviewQueue();
  renderActivity();
  renderAudit();
  renderRules();
  renderFeedback();
  renderSystemEvidence();
}

function pipelineState(activeStep, completeSteps = []) {
  $$(".pipeline-step").forEach((step) => {
    const name = step.dataset.step;
    step.classList.toggle("active", name === activeStep);
    step.classList.toggle("complete", completeSteps.includes(name));
  });
}

async function runComplianceCheck(event) {
  event.preventDefault();
  const query = $("#queryInput").value.trim();
  if (!query) {
    showToast("Enter a customer query first.");
    return;
  }

  const button = $("#runButton");
  button.disabled = true;
  button.innerHTML = "Analyzing interaction...";
  pipelineState("shopbot");

  try {
    const request = api("/api/interactions", {
      method: "POST",
      body: JSON.stringify({ query, requester: $("#requesterInput").value.trim() || "Demo Customer" })
    });
    await delay(240);
    pipelineState("trust", ["shopbot"]);
    await delay(300);
    const data = await request;
    pipelineState("log", ["shopbot", "trust"]);
    await delay(180);
    pipelineState(null, ["shopbot", "trust", "log"]);

    state.interactions.unshift(data.interaction);
    state.metrics = data.metrics;
    state.ruleViolations = data.ruleViolations;
    state.expandedId = null;
    renderResult(data.interaction);
    renderAll();
    showToast(`${data.interaction.verdict} verdict recorded in the audit log.`);
  } catch (error) {
    pipelineState(null);
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">&#9654;</span> Run compliance check';
  }
}

function openReviewDialog(interactionId) {
  const interaction = state.interactions.find((item) => item.id === interactionId);
  if (!interaction) return;
  $("#reviewInteractionId").value = interaction.id;
  $("#reviewQueryPreview").textContent = interaction.query;
  $("#reviewerName").value = interaction.review?.reviewer || "";
  $("#reviewDecision").value = interaction.review?.decision || "";
  $("#reviewNotes").value = interaction.review?.notes || "";
  $("#reviewDialog").showModal();
}

async function submitReview(event) {
  event.preventDefault();
  const interactionId = $("#reviewInteractionId").value;
  try {
    const data = await api(`/api/interactions/${encodeURIComponent(interactionId)}/review`, {
      method: "PATCH",
      body: JSON.stringify({
        reviewer: $("#reviewerName").value.trim(),
        decision: $("#reviewDecision").value,
        notes: $("#reviewNotes").value.trim()
      })
    });
    const index = state.interactions.findIndex((item) => item.id === interactionId);
    if (index >= 0) state.interactions[index] = data.interaction;
    state.metrics = data.metrics;
    state.ruleViolations = data.ruleViolations;
    $("#reviewDialog").close();
    renderAll();
    if (!$("#resultContent").classList.contains("hidden") && state.interactions[0]?.id === interactionId) renderResult(data.interaction);
    showToast(`Human decision recorded: ${data.interaction.review.decision}.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function submitFeedback(event) {
  event.preventDefault();
  try {
    const item = await api("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        interactionId: state.interactions[0]?.id || "",
        name: $("#feedbackName").value.trim(),
        rating: Number($("#feedbackRating").value),
        comment: $("#feedbackComment").value.trim()
      })
    });
    state.feedback.unshift(item);
    $("#feedbackForm").reset();
    renderFeedback();
    showToast("Tester feedback recorded.");
  } catch (error) {
    showToast(error.message);
  }
}

function openView(viewName) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  const activeView = $(`#view-${viewName}`);
  $("#breadcrumbCurrent").textContent = activeView?.dataset.title || "Dashboard";
  $("#sidebar").classList.remove("open");
  $("#mobileMenu").setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  $("#themeIcon").innerHTML = dark ? "&#9790;" : "&#9788;";
  $("#themeToggle").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  localStorage.setItem("agent-trust-theme", theme);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 3200);
}

async function clearInteractions() {
  try {
    await api("/api/interactions", { method: "DELETE" });
    state.interactions = [];
    state.metrics = { total: 0, compliant: 0, flagged: 0, blocked: 0, pendingReview: 0, complianceRate: 100 };
    state.ruleViolations = state.rules.map((rule) => ({ ...rule, count: 0 }));
    state.expandedId = null;
    $("#resultContent").classList.add("hidden");
    $("#resultEmpty").classList.remove("hidden");
    pipelineState(null);
    renderAll();
    showToast("Activity log cleared.");
  } catch (error) {
    showToast(error.message);
  }
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => openView(button.dataset.view)));
  $$('[data-open-view]').forEach((button) => button.addEventListener("click", () => openView(button.dataset.openView)));
  $("#mobileMenu").addEventListener("click", () => {
    const open = $("#sidebar").classList.toggle("open");
    $("#mobileMenu").setAttribute("aria-expanded", String(open));
  });
  $("#themeToggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#scenarioCategory").addEventListener("change", renderScenarioOptions);
  $("#scenarioSelect").addEventListener("change", (event) => setQueryFromScenario(event.target.value));
  $("#queryInput").addEventListener("input", updateQueryCount);
  $("#monitorForm").addEventListener("submit", runComplianceCheck);
  $$(".filter-button").forEach((button) => button.addEventListener("click", () => {
    state.activityFilter = button.dataset.filter;
    state.expandedId = null;
    $$(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
    renderActivity();
  }));
  $("#activityTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-expand-id]");
    if (!button) return;
    state.expandedId = state.expandedId === button.dataset.expandId ? null : button.dataset.expandId;
    renderActivity();
  });
  $("#reviewTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-id]");
    if (button) openReviewDialog(button.dataset.reviewId);
  });
  $("#reviewForm").addEventListener("submit", submitReview);
  $("#cancelReview").addEventListener("click", () => $("#reviewDialog").close());
  $("#feedbackForm").addEventListener("submit", submitFeedback);
  $("#printAudit").addEventListener("click", () => window.print());
  $$(".data-tab").forEach((button) => button.addEventListener("click", () => {
    state.dataTab = button.dataset.dataTab;
    $$(".data-tab").forEach((item) => item.classList.toggle("active", item === button));
    renderOfficialData();
  }));
  $("#clearLogButton").addEventListener("click", () => $("#clearDialog").showModal());
  $("#clearDialog").addEventListener("close", () => {
    if ($("#clearDialog").returnValue === "confirm") clearInteractions();
  });
}

async function initialize() {
  const savedTheme = localStorage.getItem("agent-trust-theme");
  setTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#currentDate").textContent = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  bindEvents();

  try {
    const data = await api("/api/bootstrap");
    Object.assign(state, data);
    renderScenarioOptions();
    renderAll();
    if (state.interactions[0]) renderResult(state.interactions[0]);
  } catch (error) {
    showToast(`Unable to load Agent Trust OS: ${error.message}`);
  }
}

document.addEventListener("DOMContentLoaded", initialize);
