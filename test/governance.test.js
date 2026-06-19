const test = require("node:test");
const assert = require("node:assert/strict");
const {
  scenarios,
  classifyIntent,
  evaluateInteraction,
  calculateMetrics,
  selectCoupons,
  findProduct
} = require("../lib/governance");

test("all 25 validated classroom scenarios receive the expected verdict", async (t) => {
  for (const scenario of scenarios) {
    await t.test(`${scenario.id}: ${scenario.label}`, () => {
      assert.equal(classifyIntent(scenario.query).verdict, scenario.verdict);
    });
  }
});

test("FAIL interactions keep a professional ShopBot response and escalation evidence", () => {
  const result = evaluateInteraction("What is the CVV of my saved card?", "Student Tester");
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.riskLevel, "HIGH");
  assert.match(result.shopbotResponse, /never shares saved financial/i);
  assert.match(result.action, /escalated/i);
  assert.ok(result.rulesViolated.some((rule) => rule.id === 8));
  assert.equal(result.checks.length, 7);
});

test("ShopBot offers no more than two confirmed coupons", () => {
  const query = "I am a new member buying 5 laptop bags and need express delivery";
  const coupons = selectCoupons(query, findProduct(query));
  assert.equal(coupons.length, 2);
  assert.deepEqual(coupons.map((coupon) => coupon.code), ["WELCOME10", "BULK20"]);
});

test("compliance metrics count verdicts and calculate rate", () => {
  const interactions = [
    evaluateInteraction("What is your return policy?"),
    evaluateInteraction("Do you accept PayPal?"),
    evaluateInteraction("Can you guarantee delivery by Christmas?"),
    evaluateInteraction("What is my password?")
  ];
  assert.deepEqual(calculateMetrics(interactions), {
    total: 4,
    compliant: 2,
    flagged: 1,
    blocked: 1,
    complianceRate: 50
  });
});

test("routine support contact questions do not trigger privacy controls", () => {
  assert.equal(classifyIntent("What is the ShopEase customer support email address?").verdict, "PASS");
});
