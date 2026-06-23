const database = require("../data/shopease.json");

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "can", "do", "for", "from", "how", "i", "in",
  "is", "it", "me", "my", "of", "on", "or", "the", "this", "to", "what", "with", "you", "your"
]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9$%\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
}

function evidenceRecord(id, category, title, content, metadata = {}) {
  return {
    id,
    category,
    title,
    content,
    metadata,
    searchable: normalize(`${title} ${content} ${Object.values(metadata).join(" ")}`)
  };
}

function buildEvidenceIndex(source = database) {
  const records = [];

  for (const product of source.products) {
    records.push(evidenceRecord(
      `product-${product.id}`,
      "product",
      product.name,
      `${product.name} costs $${product.price.toFixed(2)}, is ${product.stock.toLowerCase()}, includes ${product.features.join(", ")}, and is rated ${product.rating}.`,
      { aliases: product.aliases.join(", ") }
    ));
  }

  for (const policy of source.policies) {
    records.push(evidenceRecord(
      `policy-${normalize(policy.name).replace(/\s+/g, "-")}`,
      "policy",
      policy.name,
      policy.detail
    ));
  }

  for (const [name, value] of Object.entries(source.delivery)) {
    const content = typeof value === "string"
      ? value
      : Object.entries(value).map(([key, detail]) => `${key}: ${detail}`).join("; ");
    records.push(evidenceRecord(`delivery-${name}`, "delivery", `${name} delivery`, content));
  }

  records.push(evidenceRecord(
    "payment-methods",
    "payment",
    "Accepted payment methods",
    source.payments.join(", ")
  ));

  for (const offer of [...source.promotions, ...source.coupons]) {
    records.push(evidenceRecord(
      `offer-${offer.code.toLowerCase()}`,
      "offer",
      offer.code,
      `${offer.value}; ${offer.condition}`,
      { type: offer.type || "promotion" }
    ));
  }

  for (const rule of source.rules) {
    records.push(evidenceRecord(
      `rule-${rule.id}`,
      "governance-rule",
      `Rule ${rule.id}: ${rule.title}`,
      rule.description,
      { ruleId: rule.id }
    ));
  }

  records.push(evidenceRecord(
    "company-support",
    "support",
    "Customer support",
    `${source.company.supportPhone}; ${source.company.supportEmail}; ${source.company.supportHours}`
  ));
  for (const [name, url] of Object.entries(source.accountSupport)) {
    records.push(evidenceRecord(`support-${name}`, "support", `${name} support`, url));
  }

  return records;
}

const EVIDENCE_INDEX = buildEvidenceIndex();

function scoreRecord(record, queryTokens) {
  const searchableTokens = new Set(tokens(record.searchable));
  const matches = queryTokens.filter((token) => searchableTokens.has(token));
  const titleMatches = queryTokens.filter((token) => normalize(record.title).includes(token));
  return matches.length * 2 + titleMatches.length * 3;
}

function retrieveEvidence(query, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 5, 10));
  const requiredRuleIds = new Set((options.ruleIds || []).map(Number));
  const queryTokens = tokens(query);
  const ranked = EVIDENCE_INDEX
    .map((record) => ({ record, score: scoreRecord(record, queryTokens) }))
    .filter(({ record, score }) => score > 0 || requiredRuleIds.has(Number(record.metadata.ruleId)))
    .map(({ record, score }) => ({
      ...record,
      score: requiredRuleIds.has(Number(record.metadata.ruleId)) ? score + 100 : score
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const selected = ranked.slice(0, limit);
  if (!selected.length) {
    selected.push(EVIDENCE_INDEX.find((record) => record.id === "company-support"));
  }
  return selected.map(({ searchable, score, ...record }) => record);
}

function validateCitationIds(citationIds, evidence) {
  const allowed = new Set(evidence.map((item) => item.id));
  return [...new Set((citationIds || []).filter((id) => allowed.has(String(id))))];
}

module.exports = {
  buildEvidenceIndex,
  retrieveEvidence,
  validateCitationIds,
  tokens
};
