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

const sentence = (value) => {
  const text = value.replace(/\s+/g, " ").trim();
  return /[.!?]["')\]]?$/.test(text) ? text : text + ".";
};

const concise = (value, max = 240) => {
  const text = sentence(value);
  if (text.length <= max) return text;
  const boundary = Math.max(
    text.lastIndexOf(". ", max),
    text.lastIndexOf("; ", max),
    text.lastIndexOf(", ", max),
    text.lastIndexOf(" ", max),
  );
  return (
    text.slice(0, boundary > 80 ? boundary : max).replace(/[,. ]+$/, "") + "…"
  );
};

const plainDefinition = (value) =>
  sentence(
    value
      .replace(/\s*\([^)]{1,120}\)/g, "")
      .replace(/cybersecurity analysts?/gi, "security teams")
      .replace(/organizations?/gi, "companies")
      .replace(/\s+/g, " ")
      .trim(),
  );

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function concealAnswer(definition, term) {
  if (term.length < 3) return definition;
  const expression = new RegExp(escapeRegex(term), "i");
  const sentences = definition.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [definition];
  const retained = sentences.filter((item) => !expression.test(item));
  return clean(retained.join(" "));
}

function explanationFor(term, definition, context) {
  const nameContext = (text) => {
    if (/^It\s+is\b/.test(text))
      return text.replace(/^It\s+is\b/, `${term} is`);
    if (/^It\s+supports\b/.test(text))
      return text.replace(/^It\s+supports\b/, `${term} supports`);
    if (/^It\s+matters\b/.test(text))
      return text.replace(/^It\s+matters\b/, `${term} matters`);
    if (/^It\s+concerns\b/.test(text))
      return text.replace(/^It\s+concerns\b/, `${term} concerns`);
    if (/^It\s+describes\b/.test(text))
      return text.replace(/^It\s+describes\b/, `${term} describes`);
    if (/^It\s+creates\b/.test(text))
      return text.replace(/^It\s+creates\b/, `${term} creates`);
    if (/^It\s+helps\b/.test(text))
      return text.replace(/^It\s+helps\b/, `${term} helps`);
    return text.startsWith(term) ? text : `${term}: ${text}`;
  };
  return {
    technical: nameContext(context.technical),
    eli5: nameContext(context.eli5),
  };
}

const promptOverrides = {
  "term-0011":
    "Considering several viewpoints and treating colleagues respectfully to find stronger solutions to a security problem.",
  "term-0072":
    "Malware that attaches to a host file or program and replicates when the host runs.",
  "term-0080":
    "People or groups that deliberately carry out harmful activity against systems, data, or organizations.",
  "term-0161":
    "The NIST RMF step where an organization puts approved security and privacy plans into operation.",
  "term-0169":
    "The process of verifying that a user, device, or service is the identity it claims to be.",
  "term-0177":
    "The NIST Cybersecurity Framework function that identifies possible security events and improves monitoring.",
  "term-0179":
    "The NIST Cybersecurity Framework function that restores systems and services after a security incident.",
  "term-0223":
    "Visual maps that show network devices, connections, and the architecture between them.",
  "term-0226":
    "Facilities away from the user’s premises where cloud providers host computing resources and data.",
  "term-0282":
    "A Wi-Fi security standard that uses AES-based encryption and CCMP to protect wireless traffic.",
  "term-0283":
    "A newer Wi-Fi security standard that strengthens wireless authentication with SAE and improves encryption protections.",
  "term-0298":
    "Standards such as WEP, WPA, WPA2, and WPA3 that define how Wi-Fi networks authenticate users and protect traffic.",
  "term-0302":
    "The rules a VPN uses to authenticate peers, exchange keys, and protect traffic in its tunnel.",
  "term-0306":
    "A subnet placed between an internal network and an untrusted network to limit direct exposure of internal systems.",
  "term-0331":
    "A packet-capture field that records the date and time an event or packet was observed.",
  "term-0332": "The IP address that identifies where a packet originated.",
  "term-0334":
    "The IP address that identifies the intended recipient of a packet.",
  "term-0364":
    "Software or firmware that abstracts physical hardware so multiple virtual machines can run on one host.",
  "term-0385":
    "A Linux kernel feature that provides hypervisor capabilities for creating and running virtual machines.",
  "term-0418":
    "A reusable unit of software that can be installed or combined with other units to build an application.",
  "term-0432":
    "The user, group, and other categories that Linux uses when applying file permissions.",
  "term-0467":
    "Characters placed around text, dates, or times so a query treats the value as a literal string.",
  "term-0593":
    "A threat-modeling process that analyzes an application through stages such as defining objectives, identifying threats, and assessing impact.",
  "term-0594":
    "A payment-card industry security standard that requires organizations handling cardholder data to maintain specified safeguards.",
  "term-0686":
    "The documented record showing who handled digital evidence, when they handled it, and how it was protected.",
  "term-0692":
    "The incident-response phase that removes the attacker’s presence, malicious code, and the weaknesses used in the incident.",
  "term-0693":
    "The incident-response phase that safely restores affected systems and validates normal operations.",
  "term-0742":
    "The query language used in Splunk to search, filter, transform, and analyze event data.",
  "term-0751":
    "A specialized team that coordinates the response to computer security incidents.",
  "term-0719":
    "The IDS rule field that specifies whether matching traffic should trigger an alert, pass, or be rejected.",
  "term-0154":
    "A community-maintained awareness document that highlights the most critical web-application security risks.",
  "term-0155":
    "A NIST process that helps organizations manage information-system risk through steps such as categorization, control selection, assessment, authorization, and monitoring.",
  "term-0497":
    "A 2014 OpenSSL vulnerability that could expose sensitive data from a server's memory when the affected heartbeat feature was queried.",
  "term-0525":
    "A knowledge base that organizes observed adversary tactics and techniques to help defenders understand and detect attacker behavior.",
  "term-0526":
    "A web-based directory that organizes open-source intelligence tools by source type and platform.",
  "term-0527":
    "A service that lets people check whether an email address or account appears in known data breaches.",
};

const choiceOverrides = {
  "term-0154": ["OWASP Top 10", "NIST RMF", "COBIT", "CIS Controls"],
  "term-0155": ["NIST RMF", "OWASP Top 10", "NIST CSF", "ISO 27001"],
  "term-0497": [
    "Heartbleed bug",
    "Shellshock vulnerability",
    "SQL injection",
    "Cross-site scripting",
  ],
  "term-0525": [
    "MITRE ATT&CK",
    "OSINT Framework",
    "Have I Been Pwned",
    "NIST RMF",
  ],
  "term-0526": [
    "OSINT Framework",
    "MITRE ATT&CK",
    "Have I Been Pwned",
    "Shodan",
  ],
  "term-0527": [
    "Have I Been Pwned",
    "OSINT Framework",
    "MITRE ATT&CK",
    "VirusTotal",
  ],
};

const excludedSourceQuestions = new Set([
  "term-0147",
  "term-0188",
  "term-0190",
  "term-0191",
  "term-0523",
  "term-0524",
  "term-0791",
  "term-0949",
  "term-0950",
  "term-0951",
  // Source headings and sentence tails; none contain a complete definition.
  "term-0075",
  "term-0186",
  "term-0236",
  "term-0249",
  "term-0251",
  "term-0404",
  "term-0405",
  "term-0479",
  "term-0480",
  "term-0484",
  "term-0498",
  "term-0500",
  "term-0552",
  "term-0554",
  "term-0561",
  "term-0562",
  "term-0565",
  "term-0575",
  "term-0578",
  "term-0587",
  "term-0598",
  "term-0600",
  "term-0603",
  "term-0607",
  "term-0609",
  "term-0611",
  "term-0615",
  "term-0617",
  "term-0618",
  "term-0621",
  "term-0622",
  "term-0747",
  "term-0760",
  "term-0761",
  "term-0766",
  "term-0767",
  "term-0772",
  "term-0777",
  "term-0779",
  "term-0781",
  "term-0786",
  "term-0788",
  "term-0871",
  "term-0873",
  "term-0876",
  "term-0887",
  "term-0893",
  "term-0969",
  "term-0970",
  "term-0972",
  "term-0973",
  "term-0980",
  "term-0981",
  "term-0985",
]);

const removeMarkdownLinks = (value) =>
  value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

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

const categoryFor = (term, definition, fallback) => {
  const text = (term + " " + definition).toLowerCase();
  if (
    /incident response|containment|eradication|forensic|evidence preservation|remediation|recovery phase|csirt/.test(
      text,
    )
  )
    return "operations";
  if (
    /intrusion detection|security information and event management|\bsiem\b|splunk|chronicle/.test(
      text,
    )
  )
    return "operations";
  if (
    /communication|growth mindset|problem-solving|time management|transferable skill|technical skill/.test(
      text,
    )
  )
    return "general-concepts";
  if (
    /financial loss|brand trust|reputation|business productivity|regulatory|compliance|hipaa|gdpr|law|legal|policy|governance|audit/.test(
      text,
    )
  )
    return "governance";
  if (
    /phish|social engineering|vishing|smishing|baiting|pretext|malware|ransomware|virus|worm|rootkit|spyware|trojan|threat actor|exploit|vulnerab/.test(
      text,
    )
  )
    return "threats";
  if (
    /encrypt|cipher|hash|cryptograph|certificate|key pair|signature|network|protocol|vpn|ip address|firewall|dns|tcp|udp|router|cloud|segmentation/.test(
      text,
    )
  )
    return "architecture";
  if (
    /\blog\b|siem|alert|monitor|packet|traffic|query|splunk|chronicle|incident response|containment|forensic|evidence|remediat|python|sql|code|programming|function|list|tuple|regex|style guide/.test(
      text,
    )
  )
    return "operations";
  return fallback;
};

const objectiveFor = {
  "general-concepts": "SY0-701-1.2",
  threats: "SY0-701-2.2",
  architecture: "SY0-701-3.1",
  operations: "SY0-701-4.4",
  governance: "SY0-701-5.4",
};

const conceptContext = (term, definition, category) => {
  const text = (term + " " + definition).toLowerCase();
  if (/incident response/.test(text))
    return {
      technical:
        "Incident response is the organized process for preparing for, detecting, containing, investigating, eradicating, and recovering from a security event. Following an established process preserves evidence and keeps the response coordinated.",
      eli5: "It is the team’s organized plan for handling a security emergency from the first alert through recovery.",
    };
  if (
    /\b(ids|intrusion detection|snort|suricata)\b/.test(text) ||
    /signature.*\b(alert|pass|reject)\b/.test(text)
  )
    return {
      technical:
        "In an IDS rule, this field determines the response after the rule conditions match. The chosen action can generate an alert, permit traffic, or reject it according to the rule design.",
      eli5: "It is the instruction that tells the alarm system what to do after it spots the pattern.",
    };
  if (/growth mindset/.test(text))
    return {
      technical:
        "It supports continuous professional development in a changing field. Analysts use it to keep their knowledge current, accept feedback, and improve their approach when a threat or tool changes.",
      eli5: "It means staying willing to learn and improve instead of giving up when something is new.",
    };
  if (/diverse perspectives|mutual respect/.test(text))
    return {
      technical:
        "Different backgrounds and viewpoints can expose assumptions or blind spots that one person may miss. Respectful collaboration helps a team compare options and choose a more complete response to a security problem.",
      eli5: "People who see a problem differently can spot things each other missed, so the team can make a better choice.",
    };
  if (/communication/.test(text))
    return {
      technical:
        "It lets analysts communicate risks, evidence, and recommended actions to both technical and nontechnical stakeholders. Clear communication supports timely decisions and coordinated incident response.",
      eli5: "It means explaining the security problem clearly so the right people can help fix it.",
    };
  if (/problem-solving|time management/.test(text))
    return {
      technical:
        "It supports sound operational decisions by helping an analyst prioritize the most important work, assess options, and act within the time available.",
      eli5: "It helps you focus on the most important problem and work through it step by step.",
    };
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
  if (
    /\blog\b|siem|alert|monitor|packet|traffic|query|splunk|chronicle/.test(
      text,
    )
  )
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
let removedLowQualityDefinitions = 0;
const questions = baseline.questions.flatMap((question) => {
  if (excludedSourceQuestions.has(question.external_id)) {
    removedLowQualityDefinitions++;
    return [];
  }
  const definition = removeMarkdownLinks(
    promptOverrides[question.external_id] || definitionFrom(question.prompt),
  );
  if (!definition || seenDefinitions.has(definition.toLowerCase())) return [];
  seenDefinitions.add(definition.toLowerCase());
  const sourceChoices = choiceOverrides[question.external_id]
    ? question.choices.map((choice, index) => ({
        ...choice,
        text: choiceOverrides[question.external_id][index],
      }))
    : question.choices;
  const answer = clean(
    sourceChoices.find((choice) => choice.id === question.correct_choice_id)
      .text,
  );
  const choices = sourceChoices.map((choice) => ({
    ...choice,
    text: clean(choice.text),
  }));
  const prompt = concealAnswer(definition, answer);
  if (!prompt || prompt.length < 24) {
    removedLowQualityDefinitions++;
    return [];
  }
  if (new RegExp(escapeRegex(answer), "i").test(prompt))
    throw new Error(`Definition prompt leaks its answer: ${answer}`);
  const category = categoryFor(answer, definition, question.category_slug);
  const context = conceptContext(answer, definition, category);
  const explanation = explanationFor(answer, definition, context);
  return [
    {
      ...question,
      external_id: "definition-" + question.external_id,
      category_slug: category,
      objective_code: objectiveFor[category],
      prompt,
      choices,
      explanation_technical: explanation.technical,
      explanation_eli5: explanation.eli5,
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
  release_label: "Google CySec → Security+ V7 definitions.6",
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
    removed_low_quality_definitions: removedLowQualityDefinitions,
  }),
);
