import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const resultsPath = path.resolve(
  process.env.TIMING_RESULTS_PATH || path.join(root, "docs", "timing-sweep-automated.json"),
);
const reportPath = path.resolve(
  process.env.TIMING_REPORT_PATH || path.join(root, "docs", "timing-sweep-automated.md"),
);
const projects = ["desktop-chrome", "iphone-14", "ipad"];
const runsPerProject = Number.parseInt(process.env.TIMING_RUNS || "20", 10);
const paceMs = Number.parseInt(process.env.TIMING_PACE_MS || "12000", 10);

function readRecords() {
  try {
    return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  } catch {
    return [];
  }
}

function percentile(values, percentileRank) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileRank;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function formatSeconds(ms) {
  return ms == null ? "n/a" : `${(ms / 1000).toFixed(3)}s`;
}

function stats(records, field) {
  const values = records
    .map((record) => record[field])
    .filter((value) => Number.isFinite(value));
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : null,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : null,
  };
}

function runProject(project) {
  const env = {
    ...process.env,
    TIMING_RESULTS_PATH: resultsPath,
    TIMING_PACE_MS: String(paceMs),
  };
  const result = spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "e2e/demo-path.pw.js",
      `--project=${project}`,
      `--repeat-each=${runsPerProject}`,
      "--workers=1",
      "--reporter=line",
    ],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      stdio: "inherit",
    },
  );
  return result.status ?? 1;
}

function appendMissingRecords(records) {
  const output = [...records];
  for (const project of projects) {
    const projectRecords = output.filter((record) => record.project === project);
    const seenRuns = new Set(projectRecords.map((record) => record.run));
    for (let run = 1; run <= runsPerProject; run += 1) {
      if (seenRuns.has(run)) continue;
      output.push({
        project,
        viewport: "unknown",
        run,
        retry: 0,
        initialMs: null,
        reviseMs: null,
        initialCounts: null,
        revisedCounts: null,
        assertions: [],
        errors: ["No result record was emitted by Playwright for this run."],
        status: "missing-record",
        durationMs: null,
      });
    }
  }
  return output.sort((a, b) =>
    a.project.localeCompare(b.project) || a.run - b.run || a.retry - b.retry,
  );
}

function writeReport(records, statuses) {
  const lines = [
    "# Automated browser timing sweep",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `The sweep requested ${runsPerProject} runs per viewport (${runsPerProject * projects.length} total). Each run used a fresh Playwright browser context and measured from submit to the requested rendered state. A ${paceMs}ms inter-run delay was used to avoid bypassing the application's rolling request limit.`,
    "",
    "## Runner status",
    "",
    ...statuses.map(({ project, status }) => `- ${project}: Playwright exit ${status}`),
    "",
  ];

  for (const project of projects) {
    const projectRecords = records.filter((record) => record.project === project);
    const viewport = projectRecords.find((record) => record.viewport)?.viewport || "unknown";
    lines.push(`## ${project} (${viewport})`, "");
    for (const [label, field] of [
      ["Initial analysis", "initialMs"],
      ["Revise step", "reviseMs"],
    ]) {
      const summary = stats(projectRecords, field);
      const failed = projectRecords.filter(
        (record) => !Number.isFinite(record[field]),
      ).length;
      lines.push(
        `### ${label}`,
        "",
        `- Successful timing values: ${summary.count}/${projectRecords.length}`,
        `- Failed or missing timing values: ${failed}`,
        `- Min / median / p95 / max: ${formatSeconds(summary.min)} / ${formatSeconds(summary.median)} / ${formatSeconds(summary.p95)} / ${formatSeconds(summary.max)}`,
        "",
      );
      if (failed) {
        lines.push(
          "Statistics use only successful timing values; failed assertions and missing records are retained below and are not silently treated as zero.",
          "",
        );
      }
      const slow = projectRecords.filter(
        (record) => Number.isFinite(record[field]) && record[field] > 15_000,
      );
      lines.push(
        slow.length
          ? `Runs over 15 seconds: ${slow.map((record) => `run ${record.run} (${formatSeconds(record[field])})`).join(", ")}`
          : "Runs over 15 seconds: none",
        "",
      );
    }

    lines.push("### Run outcomes", "", "| Run | Initial | Revise | Status | Errors |", "| ---: | ---: | ---: | --- | --- |");
    for (const record of projectRecords) {
      const errors = record.errors?.length ? record.errors.join(" <br> ") : "—";
      lines.push(
        `| ${record.run} | ${formatSeconds(record.initialMs)} | ${formatSeconds(record.reviseMs)} | ${record.status} | ${errors} |`,
      );
    }
    lines.push("");
  }

  const failures = records.filter(
    (record) => record.status !== "passed" || record.errors?.length,
  );
  lines.push(
    "## Assertion failures",
    "",
    failures.length
      ? failures
          .map(
            (record) =>
              `- ${record.project} run ${record.run}: ${record.errors?.join("; ") || record.status}`,
          )
          .join("\n")
      : "None.",
    "",
  );
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
fs.writeFileSync(resultsPath, "[]\n");
const statuses = projects.map((project) => ({ project, status: runProject(project) }));
const records = appendMissingRecords(readRecords());
fs.writeFileSync(
  resultsPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), runsPerProject, paceMs, records }, null, 2)}\n`,
);
writeReport(records, statuses);
process.exitCode = statuses.every(({ status }) => status === 0) ? 0 : 1;
