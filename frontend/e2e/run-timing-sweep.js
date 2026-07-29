import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(E2E_DIR, "..");
const REPO_ROOT = path.resolve(FRONTEND_DIR, "..");
const resultsPath = path.resolve(
  process.env.TIMING_RESULTS_PATH || path.join(REPO_ROOT, "docs", "timing-sweep-automated.json"),
);
const reportPath = path.resolve(
  process.env.TIMING_REPORT_PATH || path.join(REPO_ROOT, "docs", "timing-sweep-automated.md"),
);
const projects = [
  ["desktop-chrome", "1280x800"],
  ["iphone-14", "390x844"],
  ["ipad", "768x1024"],
];
const runsPerProject = Number.parseInt(process.env.TIMING_RUNS || "20", 10);
const paceMs = Number.parseInt(process.env.TIMING_PACE_MS || "12000", 10);

function readRecords() {
  try {
    const parsed = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.records || [];
  } catch {
    return [];
  }
}

function writeData(records) {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(
    resultsPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), runsPerProject, paceMs, records }, null, 2)}\n`,
  );
}

function percentile(values, rank) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * rank;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function formatSeconds(ms) {
  return ms == null ? "n/a" : `${(ms / 1000).toFixed(3)}s`;
}

function stats(records, field) {
  const values = records.map((record) => record[field]).filter(Number.isFinite);
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : null,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : null,
  };
}

function runOne(project, run) {
  if (paceMs > 0) spawnSync("sleep", [String(paceMs / 1000)], { stdio: "inherit" });
  const env = { ...process.env, TIMING_RESULTS_PATH: resultsPath, TIMING_RUN: String(run), TIMING_PACE_MS: "0" };
  const result = spawnSync(
    "npx",
    ["--no-install", "playwright", "test", "e2e/demo-path.pw.js", `--project=${project}`, "--workers=1", "--retries=0", "--reporter=line"],
    { cwd: FRONTEND_DIR, env, encoding: "utf8", stdio: "inherit" },
  );
  return { status: result.status ?? 1, error: result.error?.message || null, signal: result.signal || null };
}

function normalizeRecords(records) {
  return records.map((record) => ({
    ...record,
    viewport: projects.find(([project]) => project === record.project)?.[1] || record.viewport || "unknown",
  }));
}

function appendMissing(records) {
  const output = [...records];
  for (const [project, viewport] of projects) {
    for (let run = 1; run <= runsPerProject; run += 1) {
      const matches = output.filter((record) => record.project === project && record.run === run);
      if (matches.length === 1) continue;
      if (matches.length > 1) {
        output.push({ project, viewport, run, status: "duplicate", errors: [`${matches.length} records for logical run`] });
      } else {
        output.push({ project, viewport, run, retry: 0, initialMs: null, reviseMs: null, initialCounts: null, revisedCounts: null, assertions: [], errors: ["No result record was emitted by Playwright for this run."], status: "missing-record", durationMs: null });
      }
    }
  }
  return output.sort((a, b) => a.project.localeCompare(b.project) || a.run - b.run);
}

function writeReport(records, statuses) {
  const lines = [
    "# Automated browser timing sweep",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Requested ${runsPerProject} runs per viewport (${runsPerProject * projects.length} total), one fresh Playwright context per run, with ${paceMs}ms pacing before every run.`,
    "",
    "## Runner status",
    "",
    ...statuses.map(({ project, status, error, signal }) => `- ${project}: ${status}${signal ? ` (signal ${signal})` : ""}${error ? ` — ${error}` : ""}`),
    "",
  ];
  for (const [project, viewport] of projects) {
    const projectRecords = records.filter((record) => record.project === project);
    lines.push(`## ${project} (${viewport})`, "");
    for (const [label, field] of [["Initial analysis", "initialMs"], ["Revise step", "reviseMs"]]) {
      const summary = stats(projectRecords, field);
      const failed = projectRecords.length - summary.count;
      lines.push(`### ${label}`, "", `- Values: ${summary.count}/${projectRecords.length}`, `- Failed/missing: ${failed}`, `- Min / median / p95 / max: ${formatSeconds(summary.min)} / ${formatSeconds(summary.median)} / ${formatSeconds(summary.p95)} / ${formatSeconds(summary.max)}`);
      const slow = projectRecords.filter((record) => Number.isFinite(record[field]) && record[field] > 15_000);
      lines.push(`- Runs over 15 seconds: ${slow.length ? slow.map((record) => `run ${record.run} (${formatSeconds(record[field])})`).join(", ") : "none"}`, "");
    }
    lines.push("| Run | Initial | Revise | Status | Errors |", "| ---: | ---: | ---: | --- | --- |", ...projectRecords.map((record) => `| ${record.run} | ${formatSeconds(record.initialMs)} | ${formatSeconds(record.reviseMs)} | ${record.status || "unknown"} | ${record.errors?.join(" <br> ") || "—"} |`), "");
  }
  const failures = records.filter((record) => record.status !== "passed" || record.errors?.length);
  lines.push("## Failures", "", failures.length ? failures.map((record) => `- ${record.project} run ${record.run}: ${record.errors?.join("; ") || record.status}`).join("\n") : "None.", "");
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

writeData([]);
const statuses = [];
for (const [project] of projects) {
  for (let run = 1; run <= runsPerProject; run += 1) {
    statuses.push({ project, run, ...runOne(project, run) });
  }
}
const records = appendMissing(normalizeRecords(readRecords()));
writeData(records);
writeReport(records, projects.map(([project]) => ({ project, status: statuses.filter((item) => item.project === project).every((item) => item.status === 0) ? 0 : 1 })));
process.exitCode = statuses.every((item) => item.status === 0) && records.length === runsPerProject * projects.length ? 0 : 1;
