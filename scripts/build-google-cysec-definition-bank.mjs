import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const bankDirectory = join(root, "private", "question-banks");
const definitionDirectory = join(bankDirectory, "definition-banks");
const importDirectory = join(root, "private", "imports");
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

const baseline = JSON.parse(
  await readFile(
    join(bankDirectory, "security-plus-v7-term-coverage-baseline.json"),
    "utf8",
  ),
);

const clean = (value) =>
  value
    .replace(/\*\*/g, "")
    .replace(/\\([!_*[\]])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const definitionFrom = (prompt) =>
  clean(
    prompt
      .replace(
        /^An analyst at Meridian Systems needs to identify the concept described as:\s*/i,
        "",
      )
      .replace(/\s*Which term best matches this description\?\s*$/i, ""),
  );

const technicalContext = {
  "general-concepts":
    "It gives analysts a precise way to discuss a core security idea and distinguish it from related concepts.",
  threats:
    "Correctly classifying it helps an analyst recognize the relevant risk or attack behavior and choose an appropriate mitigation or escalation path.",
  architecture:
    "It matters when designing or assessing how systems, network traffic, identities, or data are protected.",
  operations:
    "It matters in day-to-day security work because it guides how analysts collect evidence, investigate activity, or operate security tools.",
  governance:
    "It matters because it connects security decisions to organizational responsibilities, policies, risk, or compliance obligations.",
};

const plainContext = {
  "general-concepts": "It is a clear name for an important security idea.",
  threats:
    "It names a danger or attack pattern, so people know what to watch for.",
  architecture: "It names a way systems, networks, or data can be protected.",
  operations: "It names a tool or task security teams use in their daily work.",
  governance:
    "It names a rule, responsibility, or process that helps an organization stay safe.",
};

const conceptContext = (term, definition, category) => {
  const text = (term + " " + definition).toLowerCase();
  if (/rainbow table/.test(text))
    return {
      technical:
        "It is a precomputed lookup resource that can speed attempts to recover weak or unsalted password hashes. Unique, sufficiently strong salts make a single table far less reusable.",
      eli5: "It is like a ready-made answer sheet that can help someone guess weak passwords faster.",
    };
  if (/vpn protocol|wireguard|ipsec/.test(text))
    return {
      technical:
        "It concerns the rules a virtual private network uses to create and protect a tunnel. The protocol determines how peers authenticate, exchange keys, encapsulate traffic, and protect data in transit.",
      eli5: "It is the set of rules that lets a VPN build a protected path between computers.",
    };
  if (/virtual private network|\\bvpn\\b/.test(text))
    return {
      technical:
        "It creates a protected tunnel across an untrusted network. A VPN can encrypt traffic in transit and restrict access to resources, but it does not by itself make every endpoint or application secure.",
      eli5: "It is like a protected tunnel for information traveling across the internet.",
    };
  if (/style guide/.test(text))
    return {
      technical:
        "It standardizes writing, formatting, and design so documents or code remain readable and consistent across contributors. It guides presentation; it does not itself execute or validate the work.",
      eli5: "It is a shared rulebook that helps everyone make documents look and read the same way.",
    };
  if (
    /financial loss|brand trust|reputation|business productivity|downtime/.test(
      text,
    )
  )
    return {
      technical:
        "It is a business impact, not a technical control. Risk decisions should account for lost revenue, recovery cost, downtime, fines, and loss of customer confidence.",
      eli5: "It describes how a security problem can hurt the organization and the people who rely on it.",
    };
  if (/regulatory|compliance|hipaa|gdpr|law|legal/.test(text))
    return {
      technical:
        "It concerns obligations set by laws, regulations, contracts, or policy. Analysts must identify the applicable requirement and show that the relevant safeguards and evidence exist.",
      eli5: "It means following the safety rules the organization is required to follow.",
    };
  if (/phish|social engineering|vishing|smishing|baiting|pretext/.test(text))
    return {
      technical:
        "It concerns manipulation of people rather than a purely technical exploit. Verify unexpected requests through a trusted channel and report suspected attempts.",
      eli5: "It is a trick meant to make someone do or reveal something unsafe.",
    };
  if (/malware|ransomware|virus|worm|rootkit|spyware|trojan/.test(text))
    return {
      technical:
        "It describes malicious software or a related behavior. Detection should be followed by containment, evidence preservation, eradication, and recovery under the incident-response process.",
      eli5: "It is harmful software or a way harmful software behaves.",
    };
  if (
    /encrypt|cipher|hash|cryptograph|certificate|key pair|signature/.test(text)
  )
    return {
      technical:
        "It is a cryptography concept. Distinguish whether the mechanism protects confidentiality, integrity, authenticity, or key management before choosing or evaluating it.",
      eli5: "It is part of the set of tools used to keep information secret or prove it has not been changed.",
    };
  if (
    /privacy|personally identifiable|\\bpii\\b|sensitive data|personal data/.test(
      text,
    )
  )
    return {
      technical:
        "It concerns information that requires controlled handling. Apply data classification, least privilege, approved retention, and secure disposal according to organizational and legal requirements.",
      eli5: "It is about protecting information that can identify or affect a person.",
    };
  if (/log|siem|alert|monitor|packet|traffic|query|splunk|chronicle/.test(text))
    return {
      technical:
        "It is used in detection or investigation. Preserve the underlying evidence and verify any conclusion against the relevant logs, packets, or other telemetry.",
      eli5: "It helps security teams look for clues and check what happened.",
    };
  if (/incident response|containment|forensic|evidence|remediat/.test(text))
    return {
      technical:
        "It supports an incident-handling activity. Follow the documented process so containment, evidence preservation, communication, eradication, and recovery are coordinated.",
      eli5: "It is part of the team’s plan for handling a security problem safely.",
    };
  if (
    /access|permission|identity|authentication|authoriz|account|least privilege/.test(
      text,
    )
  )
    return {
      technical:
        "It is an identity-and-access concept. Confirm the identity involved and grant only the permissions needed for the approved task.",
      eli5: "It helps make sure the right person gets only the access they need.",
    };
  if (/network|protocol|vpn|ip address|firewall|dns|tcp|udp|router/.test(text))
    return {
      technical:
        "It is a networking concept. Consider where it operates in the communication path and how it affects trusted connections, visibility, or access control.",
      eli5: "It is part of how computers communicate and stay protected while they do.",
    };
  if (
    /python|sql|code|programming|function|list|tuple|regex|style guide/.test(
      text,
    )
  )
    return {
      technical:
        "It is a programming or data-analysis concept. Use it consistently, test the result, and review automated output before it informs a security decision.",
      eli5: "It is a building block used to give computers clear instructions or examine information.",
    };
  if (/threat|attack|exploit|vulnerab|risk/.test(text))
    return {
      technical:
        "It describes a security risk or attack-related concept. Identifying it accurately helps analysts assess impact, prioritize action, and select an appropriate mitigation.",
      eli5: "It names a kind of danger so the team can decide how to protect itself.",
    };
  return {
    technical:
      technicalContext[category] +
      " Focus on the role described in the definition; that role separates this term from the other choices.",
    eli5: plainContext[category],
  };
};

const seenDefinitions = new Set();
const questions = baseline.questions.flatMap((question) => {
  const prompt = definitionFrom(question.prompt);
  if (!prompt || seenDefinitions.has(prompt.toLowerCase())) return [];
  seenDefinitions.add(prompt.toLowerCase());
  const answer = clean(
    question.choices.find((choice) => choice.id === question.correct_choice_id)
      .text,
  );
  const choices = question.choices.map((choice) => ({
    ...choice,
    text: clean(choice.text),
  }));
  const context = conceptContext(answer, prompt, question.category_slug);
  return [
    {
      ...question,
      external_id: "definition-" + question.external_id,
      prompt,
      choices,
      explanation_technical:
        answer + " is the correct term. " + context.technical,
      explanation_eli5: context.eli5,
      tags: ["definition", "google-cysec", "definition-bank"],
      source_reference: "Google Cybersecurity Certificate definition bank.",
      change_note:
        "Definition-bank rewrite: direct definition prompt and expanded rationale.",
    },
  ];
});

const release = {
  schema_version: 1,
  exam_code: "COMPTIA-SECURITY-PLUS",
  edition: "SY0-701-v7",
  release_label: "Google CySec → Security+ V7 definitions.1",
  categories,
  questions,
};

await Promise.all([
  mkdir(definitionDirectory, { recursive: true, mode: 0o700 }),
  mkdir(importDirectory, { recursive: true, mode: 0o700 }),
]);
await Promise.all([
  writeFile(
    join(definitionDirectory, "google-cysec-security-plus-v7-definitions.json"),
    JSON.stringify(release, null, 2) + "\n",
    { mode: 0o600 },
  ),
  writeFile(
    join(importDirectory, "google-cysec-security-plus-v7-definitions.json"),
    JSON.stringify(release, null, 2) + "\n",
    { mode: 0o600 },
  ),
]);

console.log(
  JSON.stringify({
    source_questions: baseline.questions.length,
    published_definition_questions: questions.length,
    removed_duplicate_definitions: baseline.questions.length - questions.length,
  }),
);
