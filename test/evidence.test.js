const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEvidenceIndex, retrieveEvidence, validateCitationIds } = require("../lib/evidence");

test("evidence index creates traceable records for official data and rules", () => {
  const index = buildEvidenceIndex();
  assert.ok(index.length >= 30);
  assert.ok(index.some((item) => item.id === "policy-returns"));
  assert.ok(index.some((item) => item.id === "rule-8"));
  assert.ok(index.every((item) => item.id && item.title && item.content));
});

test("retrieval returns relevant official evidence", () => {
  const returns = retrieveEvidence("What is your return policy?");
  assert.ok(returns.some((item) => item.id === "policy-returns"));

  const payment = retrieveEvidence("Do you accept Klarna?");
  assert.ok(payment.some((item) => item.id === "payment-methods"));
});

test("triggered rules are always included and invented citations are rejected", () => {
  const evidence = retrieveEvidence("Read my saved card CVV", { ruleIds: [2, 8] });
  assert.ok(evidence.some((item) => item.id === "rule-2"));
  assert.ok(evidence.some((item) => item.id === "rule-8"));
  assert.deepEqual(
    validateCitationIds(["rule-2", "invented-source", "rule-2"], evidence),
    ["rule-2"]
  );
});
