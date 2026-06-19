const state = {
  agents: [],
  policies: [],
  logs: [],
  reports: [],
  currentReview: null,
  currentReport: null
};

const sample = {
  agent: {
    name: "Finance Report Agent",
    purpose: "Summarizes monthly sales, expenses, and vendor information",
    department: "Finance",
    owner: "Finance Manager",
    tools: ["Finance System", "Email", "File Storage"],
    dataAccess: ["Financial Records", "Confidential Documents", "Internal Business Data"],
    riskCategory: "High",
    businessImpact: "Financial impact",
    notes: "Sample high-risk finance governance scenario."
  },
  policy: {
    approvedActions: "Summarize monthly financial data\nPrepare internal financial reports",
    approvalRequiredActions: "Export reports outside the company\nEmail financial reports to consultants\nShare vendor information externally",
    prohibitedActions: "Modify financial records\nApprove payments\nSend reports externally without human review",
    sensitiveDataRules: [
      "Human review required for financial data",
      "No credentials or secrets",
      "No customer personal data in public AI tools"
    ],
    escalationContact: "Finance Manager",
    reviewFrequency: "High-risk actions only"
  },
  action: {
    actionTitle: "External Monthly Financial Report",
    actionDescription: "The agent created a monthly financial summary and attempted to email it to an outside consultant.",
    toolsUsed: ["Finance System", "Email"],
    dataTouched: ["Financial data", "Confidential documents"],
    intendedRecipient: "Consultant",
    humanApprovalRequested: "No",
    externalAction: "Yes",
    businessImpact: "High",
    outputSummary: "Monthly revenue, expenses, vendor names, and cash-flow summary",
    additionalNotes: "Sensitive financial data was prepared for external sharing without required approval."
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slug(value) {
  return String(value || "unclear").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function badge(value) {
  return `<span class="badge badge-${slug(value)}">${escapeHtml(value || "Pending")}</span>`;
}

function formatDate(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function collectChecked(form, groupName) {
  return Array.from(form.querySelectorAll(`[data-checkbox-group="${groupName}"] input:checked`)).map((input) => input.value);
}

function setChecked(form, groupName, values) {
  const selected = new Set(values || []);
  form.querySelectorAll(`[data-checkbox-group="${groupName}"] input`).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function setRadio(form, name, value) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = input.value === value;
  });
}

function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function activeAgents() {
  return state.agents.filter((agent) => agent.status !== "Inactive");
}

function selectedAgentId() {
  return $("#actionAgentSelect").value || $("#policyAgentSelect").value || activeAgents()[0]?.id;
}

async function loadAll() {
  const [agents, policies, logs, reports] = await Promise.all([
    api("/api/agents"),
    api("/api/policies"),
    api("/api/logs"),
    api("/api/reports")
  ]);
  state.agents = agents;
  state.policies = policies;
  state.logs = logs;
  state.reports = reports;
  renderAll();
}

function renderAll() {
  renderAgentSelects();
  renderAgents();
  renderPolicySummary();
  renderDashboard();
  renderApprovalQueue();
  renderReports();
}

function renderAgentSelects() {
  const options = activeAgents()
    .map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`)
    .join("");
  ["#policyAgentSelect", "#actionAgentSelect"].forEach((selector) => {
    const select = $(selector);
    const previous = select.value;
    select.innerHTML = options || "<option value=\"\">No active agents</option>";
    if (previous && activeAgents().some((agent) => agent.id === previous)) {
      select.value = previous;
    }
  });
}

function renderAgents() {
  const body = $("#agentsTableBody");
  if (!state.agents.length) {
    body.innerHTML = "<tr><td colspan=\"6\">No agents registered yet.</td></tr>";
    return;
  }
  body.innerHTML = state.agents.map((agent) => `
    <tr>
      <td><strong>${escapeHtml(agent.name)}</strong></td>
      <td>${escapeHtml(agent.owner)}</td>
      <td>${escapeHtml(agent.department)}</td>
      <td>${badge(agent.riskCategory)}</td>
      <td>${badge(agent.status)}</td>
      <td>
        <button class="btn btn-secondary table-action" type="button" data-select-agent="${escapeHtml(agent.id)}">Select</button>
        ${agent.status !== "Inactive" ? `<button class="btn btn-outline table-action" type="button" data-delete-agent="${escapeHtml(agent.id)}">Deactivate</button>` : ""}
      </td>
    </tr>
  `).join("");
}

function renderPolicySummary() {
  const agentId = $("#policyAgentSelect").value;
  const agent = state.agents.find((item) => item.id === agentId);
  const policy = state.policies.find((item) => item.agentId === agentId);
  const summary = $("#policySummary");

  if (!agent) {
    summary.innerHTML = "Register an active agent before saving policy rules.";
    return;
  }

  if (policy) {
    const policyForm = $("#policyForm");
    policyForm.approvedActions.value = policy.approvedActions || "";
    policyForm.approvalRequiredActions.value = policy.approvalRequiredActions || "";
    policyForm.prohibitedActions.value = policy.prohibitedActions || "";
    policyForm.escalationContact.value = policy.escalationContact || "";
    policyForm.reviewFrequency.value = policy.reviewFrequency || "Every action";
    setChecked(policyForm, "sensitiveDataRules", policy.sensitiveDataRules || []);

    summary.innerHTML = `
      <p><strong>Agent:</strong> ${escapeHtml(agent.name)}</p>
      <p><strong>Escalation contact:</strong> ${escapeHtml(policy.escalationContact)}</p>
      <p><strong>Review frequency:</strong> ${escapeHtml(policy.reviewFrequency)}</p>
      <p><strong>Approval rules:</strong> ${splitLines(policy.approvalRequiredActions).length}</p>
      <p><strong>Prohibited rules:</strong> ${splitLines(policy.prohibitedActions).length}</p>
    `;
  } else {
    $("#policyForm").reset();
    $("#policyAgentSelect").value = agentId;
    summary.innerHTML = `<p><strong>${escapeHtml(agent.name)}</strong> does not have a saved policy yet.</p>`;
  }
}

function splitLines(text) {
  return String(text || "").split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function renderDashboard() {
  const active = activeAgents();
  const pending = state.logs.filter((log) => log.approvalRequired && log.decision === "Pending").length;
  const high = state.logs.filter((log) => log.riskLevel === "High").length;
  const critical = state.logs.filter((log) => log.riskLevel === "Critical").length;
  const average = state.logs.length
    ? Math.round(state.logs.reduce((sum, log) => sum + Number(log.riskScore || 0), 0) / state.logs.length)
    : 0;

  $("#metricAgents").textContent = active.length;
  $("#metricPending").textContent = pending;
  $("#metricHigh").textContent = high;
  $("#metricCritical").textContent = critical;
  $("#metricReports").textContent = state.reports.length;
  $("#metricAverage").textContent = average;

  const body = $("#recentActivityBody");
  if (!state.logs.length) {
    body.innerHTML = "<tr><td colspan=\"6\">No reviewed activity yet.</td></tr>";
    return;
  }
  body.innerHTML = state.logs.slice(0, 8).map((log) => `
    <tr>
      <td>${escapeHtml(log.agentName)}</td>
      <td>${escapeHtml(log.action?.actionTitle)}</td>
      <td>${badge(log.riskLevel)}</td>
      <td>${badge(log.policyStatus)}</td>
      <td>${badge(log.decision || "Pending")}</td>
      <td>${formatDate(log.createdAt)}</td>
    </tr>
  `).join("");
}

function renderApprovalQueue() {
  const body = $("#approvalQueueBody");
  const queue = state.logs.filter((log) => log.approvalRequired && log.decision === "Pending");
  if (!queue.length) {
    body.innerHTML = "<tr><td colspan=\"6\">No pending approvals.</td></tr>";
    return;
  }
  body.innerHTML = queue.map((log) => `
    <tr>
      <td>${escapeHtml(log.agentName)}</td>
      <td>${escapeHtml(log.action?.actionTitle)}</td>
      <td>${badge(log.riskLevel)}</td>
      <td>${badge(log.policyStatus)}</td>
      <td>${formatDate(log.createdAt)}</td>
      <td>
        <button class="btn btn-success table-action" type="button" data-queue-decision="Approved" data-review-id="${escapeHtml(log.reviewId)}">Approve</button>
        <button class="btn btn-danger table-action" type="button" data-queue-decision="Rejected" data-review-id="${escapeHtml(log.reviewId)}">Reject</button>
        <button class="btn btn-warning table-action" type="button" data-queue-decision="Escalated" data-review-id="${escapeHtml(log.reviewId)}">Escalate</button>
      </td>
    </tr>
  `).join("");
}

function renderReports() {
  const body = $("#reportsTableBody");
  if (!state.reports.length) {
    body.innerHTML = "<tr><td colspan=\"5\">No audit reports generated yet.</td></tr>";
    return;
  }
  body.innerHTML = state.reports.map((report) => `
    <tr>
      <td><button class="link-button" type="button" data-open-report="${escapeHtml(report.id)}">${escapeHtml(report.id)}</button></td>
      <td>${escapeHtml(report.agentName)}</td>
      <td>${badge(report.riskLevel)}</td>
      <td>${badge(report.finalDecision)}</td>
      <td>${formatDate(report.createdAt)}</td>
    </tr>
  `).join("");
}

async function submitAgent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    ...getFormData(form),
    tools: collectChecked(form, "tools"),
    dataAccess: collectChecked(form, "dataAccess")
  };
  try {
    await api("/api/agents", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    await loadAll();
    showToast("Agent registered.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitPolicy(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    ...getFormData(form),
    sensitiveDataRules: collectChecked(form, "sensitiveDataRules")
  };
  try {
    await api("/api/policies", { method: "POST", body: JSON.stringify(payload) });
    await loadAll();
    $("#policyAgentSelect").value = payload.agentId;
    renderPolicySummary();
    showToast("Policy saved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitAction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    ...getFormData(form),
    toolsUsed: collectChecked(form, "toolsUsed"),
    dataTouched: collectChecked(form, "dataTouched")
  };
  setLoading(true);
  try {
    const review = await api("/api/review-action", { method: "POST", body: JSON.stringify(payload) });
    state.currentReview = review;
    renderReview(review);
    await loadAll();
    showToast("Risk review completed.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  $("#loadingState").classList.toggle("hidden", !isLoading);
  $("#reviewEmpty").classList.add("hidden");
}

function renderReview(review) {
  $("#reviewEmpty").classList.add("hidden");
  $("#reviewDetails").classList.remove("hidden");
  $("#riskScore").innerHTML = `${review.riskScore} ${badge(review.riskLevel)}`;
  $("#riskLevel").innerHTML = badge(review.riskLevel);
  $("#policyStatus").innerHTML = badge(review.policyStatus);
  $("#recommendedDecision").innerHTML = badge(review.recommendedDecision);
  $("#aiReport").textContent = review.report;
  $("#reviewerNotes").value = review.recommendedDecision === "Reject"
    ? "Sensitive action should not proceed without policy owner review."
    : "Reviewed for demo governance workflow.";
}

async function submitDecision(decision, reviewId = state.currentReview?.reviewId) {
  if (!reviewId) {
    showToast("No review selected.");
    return;
  }
  const payload = {
    reviewId,
    decision,
    reviewerName: $("#reviewerName").value || "Paul",
    reviewerNotes: $("#reviewerNotes").value || "Decision recorded in AgentTrust OS."
  };
  try {
    const data = await api("/api/decision", { method: "POST", body: JSON.stringify(payload) });
    if (state.currentReview?.reviewId === reviewId) {
      state.currentReview = data.review;
    }
    await loadAll();
    showToast(`Decision recorded: ${decision}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function generateAuditReport() {
  if (!state.currentReview?.reviewId) {
    showToast("Complete a risk review first.");
    return;
  }
  try {
    const data = await api("/api/generate-audit-report", {
      method: "POST",
      body: JSON.stringify({
        reviewId: state.currentReview.reviewId,
        reviewerName: $("#reviewerName").value || "Paul",
        reviewerNotes: $("#reviewerNotes").value || ""
      })
    });
    state.currentReport = data.report;
    $("#auditReportBox").textContent = data.report.reportText;
    await loadAll();
    document.querySelector("#reports").scrollIntoView({ behavior: "smooth" });
    showToast("Audit report generated.");
  } catch (error) {
    showToast(error.message);
  }
}

async function copyReport() {
  const text = $("#auditReportBox").textContent;
  if (!state.currentReport && text.startsWith("Generate")) {
    showToast("No report available to copy.");
    return;
  }
  await navigator.clipboard.writeText(text);
  showToast("Report copied.");
}

function downloadReport() {
  const text = $("#auditReportBox").textContent;
  if (!state.currentReport && text.startsWith("Generate")) {
    showToast("No report available to download.");
    return;
  }
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.currentReport?.id || "agenttrust-audit-report"}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

async function submitFeedback(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    ...getFormData(form),
    reportId: state.currentReport?.id || ""
  };
  try {
    await api("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    showToast("Feedback submitted.");
  } catch (error) {
    showToast(error.message);
  }
}

function fillSample() {
  const financeAgent = state.agents.find((agent) => agent.name === sample.agent.name && agent.status !== "Inactive") || activeAgents()[0];
  if (!financeAgent) {
    showToast("Register an agent before loading the sample.");
    return;
  }

  const policyForm = $("#policyForm");
  policyForm.agentId.value = financeAgent.id;
  policyForm.approvedActions.value = sample.policy.approvedActions;
  policyForm.approvalRequiredActions.value = sample.policy.approvalRequiredActions;
  policyForm.prohibitedActions.value = sample.policy.prohibitedActions;
  policyForm.escalationContact.value = sample.policy.escalationContact;
  policyForm.reviewFrequency.value = sample.policy.reviewFrequency;
  setChecked(policyForm, "sensitiveDataRules", sample.policy.sensitiveDataRules);

  const actionForm = $("#actionForm");
  actionForm.agentId.value = financeAgent.id;
  actionForm.actionTitle.value = sample.action.actionTitle;
  actionForm.actionDescription.value = sample.action.actionDescription;
  actionForm.intendedRecipient.value = sample.action.intendedRecipient;
  actionForm.businessImpact.value = sample.action.businessImpact;
  actionForm.outputSummary.value = sample.action.outputSummary;
  actionForm.additionalNotes.value = sample.action.additionalNotes;
  setChecked(actionForm, "toolsUsed", sample.action.toolsUsed);
  setChecked(actionForm, "dataTouched", sample.action.dataTouched);
  setRadio(actionForm, "humanApprovalRequested", sample.action.humanApprovalRequested);
  setRadio(actionForm, "externalAction", sample.action.externalAction);

  renderPolicySummary();
  document.querySelector("#review").scrollIntoView({ behavior: "smooth" });
  showToast("Sample finance scenario loaded.");
}

function fillSampleAgentForm() {
  const form = $("#agentForm");
  const sampleNumber = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  form.name.value = `${sample.agent.name} ${sampleNumber}`;
  form.purpose.value = sample.agent.purpose;
  form.department.value = sample.agent.department;
  form.owner.value = sample.agent.owner;
  form.riskCategory.value = sample.agent.riskCategory;
  form.businessImpact.value = sample.agent.businessImpact;
  form.notes.value = `${sample.agent.notes} Created from the sample autofill button.`;
  setChecked(form, "tools", sample.agent.tools);
  setChecked(form, "dataAccess", sample.agent.dataAccess);
  showToast("Sample agent form filled. Click Register Agent to save it.");
}

function fillSamplePolicyForm() {
  const form = $("#policyForm");
  const agentId = form.agentId.value;
  if (!agentId) {
    showToast("Select or register an agent before filling sample policy rules.");
    return;
  }

  form.approvedActions.value = sample.policy.approvedActions;
  form.approvalRequiredActions.value = sample.policy.approvalRequiredActions;
  form.prohibitedActions.value = sample.policy.prohibitedActions;
  form.escalationContact.value = sample.policy.escalationContact;
  form.reviewFrequency.value = sample.policy.reviewFrequency;
  setChecked(form, "sensitiveDataRules", sample.policy.sensitiveDataRules);
  const agent = state.agents.find((item) => item.id === agentId);
  $("#policySummary").innerHTML = `
    <p><strong>Agent:</strong> ${escapeHtml(agent?.name || "Selected agent")}</p>
    <p><strong>Escalation contact:</strong> ${escapeHtml(sample.policy.escalationContact)}</p>
    <p><strong>Review frequency:</strong> ${escapeHtml(sample.policy.reviewFrequency)}</p>
    <p><strong>Approval rules:</strong> ${splitLines(sample.policy.approvalRequiredActions).length}</p>
    <p><strong>Prohibited rules:</strong> ${splitLines(sample.policy.prohibitedActions).length}</p>
  `;
  showToast("Sample policy rules filled. Click Save Policy to store them.");
}

async function deactivateAgent(agentId) {
  try {
    await api(`/api/agents/${agentId}`, { method: "DELETE" });
    await loadAll();
    showToast("Agent deactivated.");
  } catch (error) {
    showToast(error.message);
  }
}

function openReport(reportId) {
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) return;
  state.currentReport = report;
  $("#auditReportBox").textContent = report.reportText;
  document.querySelector("#reports").scrollIntoView({ behavior: "smooth" });
}

function startNewReview() {
  state.currentReview = null;
  $("#actionForm").reset();
  $("#reviewDetails").classList.add("hidden");
  $("#reviewEmpty").classList.remove("hidden");
  $("#auditReportBox").textContent = "Generate an audit report after completing a review decision.";
  document.querySelector("#review").scrollIntoView({ behavior: "smooth" });
}

function attachEvents() {
  $("#navToggle").addEventListener("click", () => $("#navLinks").classList.toggle("open"));
  $("#agentForm").addEventListener("submit", submitAgent);
  $("#policyForm").addEventListener("submit", submitPolicy);
  $("#actionForm").addEventListener("submit", submitAction);
  $("#policyAgentSelect").addEventListener("change", renderPolicySummary);
  $("#sampleHeroBtn").addEventListener("click", fillSample);
  $("#sampleAgentFormBtn").addEventListener("click", fillSampleAgentForm);
  $("#samplePolicyFormBtn").addEventListener("click", fillSamplePolicyForm);
  $("#sampleActionBtn").addEventListener("click", fillSample);
  $("#generateReportBtn").addEventListener("click", generateAuditReport);
  $("#copyReportBtn").addEventListener("click", copyReport);
  $("#downloadReportBtn").addEventListener("click", downloadReport);
  $("#printReportBtn").addEventListener("click", () => window.print());
  $("#newReviewBtn").addEventListener("click", startNewReview);
  $("#feedbackForm").addEventListener("submit", submitFeedback);

  document.addEventListener("click", (event) => {
    const decisionButton = event.target.closest("[data-decision]");
    if (decisionButton) submitDecision(decisionButton.dataset.decision);

    const queueButton = event.target.closest("[data-queue-decision]");
    if (queueButton) submitDecision(queueButton.dataset.queueDecision, queueButton.dataset.reviewId);

    const deleteButton = event.target.closest("[data-delete-agent]");
    if (deleteButton) deactivateAgent(deleteButton.dataset.deleteAgent);

    const selectButton = event.target.closest("[data-select-agent]");
    if (selectButton) {
      $("#policyAgentSelect").value = selectButton.dataset.selectAgent;
      $("#actionAgentSelect").value = selectButton.dataset.selectAgent;
      renderPolicySummary();
      document.querySelector("#policies").scrollIntoView({ behavior: "smooth" });
    }

    const reportButton = event.target.closest("[data-open-report]");
    if (reportButton) openReport(reportButton.dataset.openReport);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  attachEvents();
  try {
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});
