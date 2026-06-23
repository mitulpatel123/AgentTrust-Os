const { performance } = require("node:perf_hooks");
const cases = require("../evaluation/retrieval-cases.json");
const { evaluateInteraction } = require("../lib/governance");
const { retrieveEvidence } = require("../lib/evidence");

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

const results = cases.map((item) => {
  const started = performance.now();
  const interaction = evaluateInteraction(item.query, "Evaluation Suite");
  const evidence = retrieveEvidence(item.query, {
    ruleIds: interaction.rulesViolated.map((rule) => rule.id)
  });
  const latencyMs = performance.now() - started;
  const ids = new Set(evidence.map((record) => record.id));
  return {
    id: item.id,
    verdictCorrect: interaction.verdict === item.expectedVerdict,
    evidenceCorrect: item.expectedEvidence.every((id) => ids.has(id)),
    latencyMs
  };
});

const verdictAccuracy = results.filter((item) => item.verdictCorrect).length / results.length;
const evidenceRecall = results.filter((item) => item.evidenceCorrect).length / results.length;
const latencies = results.map((item) => item.latencyMs);
const report = {
  evaluatedCases: results.length,
  verdictAccuracy: Number(verdictAccuracy.toFixed(3)),
  evidenceRecallAt5: Number(evidenceRecall.toFixed(3)),
  p50LatencyMs: Number(percentile(latencies, 0.5).toFixed(3)),
  p95LatencyMs: Number(percentile(latencies, 0.95).toFixed(3)),
  localEvaluationCostUsd: 0,
  generatedAt: new Date().toISOString()
};

console.log(JSON.stringify(report, null, 2));
if (verdictAccuracy < 1 || evidenceRecall < 0.9) process.exitCode = 1;
