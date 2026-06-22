const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

process.env.AI_EXPLANATIONS = "false";
const app = require("../server");

const interactionsFile = path.join(__dirname, "..", "data", "interactions.json");
const feedbackFile = path.join(__dirname, "..", "data", "feedback.json");

test("final-exam MVP API supports input, review, feedback and exports", async () => {
  const originalInteractions = await fs.readFile(interactionsFile, "utf8");
  const originalFeedback = await fs.readFile(feedbackFile, "utf8");
  await fs.writeFile(interactionsFile, "[]\n");
  await fs.writeFile(feedbackFile, "[]\n");

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const createResponse = await fetch(`${baseUrl}/api/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requester: "External Tester",
        query: "What is the password to my ShopEase account?"
      })
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.interaction.verdict, "FAIL");
    assert.equal(created.interaction.reviewRequired, true);
    assert.equal(created.interaction.approvalStatus, "Pending human review");
    assert.ok(created.interaction.citations.some((citation) => citation.id === "rule-3"));
    assert.ok(created.interaction.telemetry.latencyMs >= 0);
    assert.equal(created.interaction.telemetry.estimatedCostUsd, 0);
    assert.equal(created.metrics.pendingReview, 1);

    const reviewResponse = await fetch(`${baseUrl}/api/interactions/${created.interaction.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewer: "Human Reviewer",
        decision: "Confirmed Block",
        notes: "No credential disclosure occurred."
      })
    });
    assert.equal(reviewResponse.status, 200);
    const reviewed = await reviewResponse.json();
    assert.equal(reviewed.interaction.review.decision, "Confirmed Block");
    assert.equal(reviewed.interaction.approvalStatus, "Human decision recorded");
    assert.equal(reviewed.metrics.pendingReview, 0);

    const feedbackResponse = await fetch(`${baseUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interactionId: created.interaction.id,
        name: "External Tester",
        rating: 5,
        comment: "The output was useful and clear."
      })
    });
    assert.equal(feedbackResponse.status, 201);
    assert.equal((await feedbackResponse.json()).rating, 5);

    const bootstrap = await (await fetch(`${baseUrl}/api/bootstrap`)).json();
    assert.equal(bootstrap.agentProfile.name, "ShopBot");
    assert.equal(bootstrap.rules.length, 12);
    assert.equal(bootstrap.scenarios.length, 25);
    assert.equal(bootstrap.feedback.length, 1);
    assert.equal(bootstrap.interactions[0].review.decision, "Confirmed Block");

    const auditCsv = await (await fetch(`${baseUrl}/api/audit.csv`)).text();
    assert.match(auditCsv, /Human Review Decision/);
    assert.match(auditCsv, /Confirmed Block/);
    assert.match(auditCsv, /Evidence Citations/);
    assert.match(auditCsv, /rule-3/);
    const feedbackCsv = await (await fetch(`${baseUrl}/api/feedback.csv`)).text();
    assert.match(feedbackCsv, /Usefulness Rating/);
    const promptCsv = await (await fetch(`${baseUrl}/api/prompts.csv`)).text();
    assert.equal(promptCsv.trim().split("\n").length, 26);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.writeFile(interactionsFile, originalInteractions);
    await fs.writeFile(feedbackFile, originalFeedback);
  }
});
