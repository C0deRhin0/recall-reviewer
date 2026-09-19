import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const questionBankDirectory = join(process.cwd(), "private", "question-banks");
const importDirectory = join(process.cwd(), "private", "imports");
const categories = [
  { slug: "general-concepts", name: "General security concepts", weight: 12 },
  {
    slug: "threats",
    name: "Threats, vulnerabilities, and mitigations",
    weight: 22,
  },
  { slug: "architecture", name: "Security architecture", weight: 18 },
  { slug: "operations", name: "Security operations", weight: 28 },
  { slug: "governance", name: "Governance, risk, and compliance", weight: 20 },
];

const readJson = async (file) =>
  JSON.parse(await readFile(join(questionBankDirectory, file), "utf8"));

const moduleFiles = readdirSync(questionBankDirectory)
  .filter((file) => /^security-plus-v7-google-cysec-c\d+m\d+\.json$/.test(file))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const modules = await Promise.all(moduleFiles.map(readJson));
const scenarioRelease = {
  schema_version: 1,
  exam_code: "COMPTIA-SECURITY-PLUS",
  edition: "SY0-701-v7",
  release_label: "Google CySec → Security+ V7 scenarios.1",
  categories,
  questions: modules.flatMap((bank) =>
    bank.questions.map((question) => ({
      ...question,
      objective_code: question.objective_code.startsWith("SY0-701-")
        ? question.objective_code
        : "SY0-701-" + question.objective_code,
    })),
  ),
};

await mkdir(importDirectory, { recursive: true, mode: 0o700 });
await writeFile(
  join(importDirectory, "google-cysec-security-plus-v7-scenarios.json"),
  JSON.stringify(scenarioRelease, null, 2) + "\n",
  { mode: 0o600 },
);

console.log(
  JSON.stringify({
    scenario_questions: scenarioRelease.questions.length,
  }),
);
