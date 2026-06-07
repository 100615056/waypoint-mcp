import { getBaseContext, getArtifact, saveArtifact } from "../context.js";

export const definition = {
  name: "waypoint_audit",
  description:
    "Diagnostic design health check on existing code. Infers project tier, confirms with one question, then produces tiered findings: Must Fix, Should Fix, Consider Later. Runs after Build or Fix, or standalone on any existing codebase.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspacePath: {
        type: "string",
        description: "Absolute path to the workspace root.",
      },
      tier: {
        type: "string",
        enum: ["prototype", "product", "platform"],
        description:
          "Explicitly set the project tier (optional). Omit to let waypoint_audit infer it and ask for confirmation.",
      },
      focus: {
        type: "string",
        description:
          "Specific file, folder, or concern to audit (optional). E.g. 'auth/', 'routes/user.js', 'error handling'. Omit to audit the full codebase.",
      },
    },
    required: ["workspacePath"],
  },
};

// ─── Tier inference ───────────────────────────────────────────────────────────

function inferTier(
  ctx: { fileTree?: string; packageJson?: string | null }
): { tier: "prototype" | "product" | "platform"; confidence: "high" | "medium" } {
  let score = 0;

  const fileTree = ctx.fileTree ?? "";
  const pkg = (() => {
    try { return JSON.parse(ctx.packageJson ?? "{}"); }
    catch { return {}; }
  })();
  const deps: string[] = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const allText = [fileTree, ctx.packageJson ?? ""].join("\n").toLowerCase();

  const fileCount = (fileTree.match(/\n/g) ?? []).length;
  if (fileCount > 40) score += 2;
  else if (fileCount > 15) score += 1;

  if (allText.includes("dockerfile") || allText.includes("docker-compose")) score += 2;
  if (allText.includes(".github/workflows") || allText.includes("ci.yml")) score += 1;
  if (allText.includes(".env.example") || allText.includes("config/")) score += 1;

  if (deps.some(d => ["prisma", "typeorm", "sequelize", "drizzle", "mongoose"].includes(d))) score += 2;
  if (deps.some(d => ["passport", "jsonwebtoken", "next-auth", "clerk"].includes(d))) score += 1;
  if (deps.some(d => ["jest", "vitest", "mocha", "playwright", "cypress"].includes(d))) score += 1;
  if (deps.some(d => ["@anthropic-ai/sdk", "openai", "langchain"].includes(d))) score += 1;

  if (allText.includes("console.log") && fileCount < 10) score -= 1;
  if (!ctx.packageJson) score -= 1;

  if (score >= 6) return { tier: "platform", confidence: "high" };
  if (score >= 3) return { tier: "product", confidence: score >= 4 ? "high" : "medium" };
  return { tier: "prototype", confidence: score <= 1 ? "high" : "medium" };
}

// ─── Findings rubric ──────────────────────────────────────────────────────────

type Severity = "must" | "should" | "consider";

interface Finding {
  id: string;
  label: string;
  detail: string;
  severity: { prototype: Severity; product: Severity; platform: Severity };
}

const FINDINGS: Finding[] = [
  {
    id: "secrets",
    label: "Hardcoded secrets or credentials in code",
    detail: "Any API key, password, or token literal in source code is a credential leak risk. Move to environment variables and add to .env.example.",
    severity: { prototype: "must", product: "must", platform: "must" },
  },
  {
    id: "no-error-handling",
    label: "Unhandled promise rejections or missing try/catch on I/O",
    detail: "Silent failures corrupt state and are hard to debug in production. Every async I/O path needs explicit error handling.",
    severity: { prototype: "must", product: "must", platform: "must" },
  },
  {
    id: "god-file",
    label: "God file or module (single file doing too much)",
    detail: "Files over ~200 lines that mix concerns (routing, logic, data access) become hard to test and change. Split by responsibility.",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  {
    id: "auth-inline",
    label: "Auth logic inside route handlers",
    detail: "Auth mixed into handlers can't be tested in isolation and is easy to omit on new routes. Extract to middleware.",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  {
    id: "no-input-validation",
    label: "No input validation at system boundaries",
    detail: "Unvalidated input leads to silent data corruption and security risks. Add schema validation (Zod, joi) before handler logic.",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  {
    id: "no-service-layer",
    label: "Direct DB or external API calls in route handlers",
    detail: "Bypassing a service layer makes testing require real infrastructure and makes the DB/API harder to swap. Add a services/ or repositories/ layer.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
  {
    id: "scattered-env",
    label: "Scattered process.env access throughout the codebase",
    detail: "Direct process.env reads in multiple files make config hard to audit and validate. Centralise in a config module.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
  {
    id: "no-tests",
    label: "No automated tests",
    detail: "Without tests, changes regress silently. Add at minimum unit tests for core logic and one integration test per entry point.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
  {
    id: "magic-values",
    label: "Magic numbers or strings in logic",
    detail: "Unexplained literals (timeouts, limits, status codes) are hard to understand and change safely. Use named constants.",
    severity: { prototype: "should", product: "should", platform: "must" },
  },
  {
    id: "no-logging",
    label: "No structured logging",
    detail: "console.log is fine early on, but structured logging (with levels and context) is needed before onboarding a team or going to production.",
    severity: { prototype: "consider", product: "consider", platform: "must" },
  },
  {
    id: "inconsistent-naming",
    label: "Inconsistent naming conventions",
    detail: "Mixed camelCase/snake_case, unclear abbreviations, or generic names (data, result, obj) slow down reading. Align on a convention and apply it.",
    severity: { prototype: "consider", product: "should", platform: "should" },
  },
  {
    id: "inline-prompts",
    label: "Prompt strings hardcoded inline in business logic",
    detail: "Inline prompt strings mix concerns and make prompt iteration require code changes. Extract to a dedicated prompts/ module.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
  {
    id: "no-llm-resilience",
    label: "LLM calls without retry or error handling",
    detail: "LLM APIs are unreliable — timeouts, rate limits, and transient errors are common. Wrap every call in retry logic with a fallback.",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  {
    id: "fat-agent-tools",
    label: "Agent tool functions with multiple responsibilities",
    detail: "Tool functions that do too many things degrade model tool-use accuracy and are hard to test. Each tool should do exactly one thing.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
  {
    id: "no-llm-observability",
    label: "No token usage or cost tracking on LLM calls",
    detail: "Without observability on LLM usage, costs are invisible and runaway spending is easy to miss. Log token counts at the call site or service layer.",
    severity: { prototype: "consider", product: "consider", platform: "must" },
  },
];

// ─── Tier label map ───────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  prototype: "Prototype",
  product: "Product",
  platform: "Platform",
};

// ─── Confirmation note ────────────────────────────────────────────────────────

function confirmationNote(
  tier: "prototype" | "product" | "platform",
  confidence: string,
  explicit: boolean
): string {
  if (explicit) {
    return `> **Tier set explicitly: ${TIER_LABELS[tier]}**`;
  }
  if (confidence === "high") {
    return `> **Tier inferred: ${TIER_LABELS[tier]}** (high confidence)\n> If this is wrong, re-run \`waypoint_audit\` with an explicit \`tier\` parameter.`;
  }
  const alternates = (["prototype", "product", "platform"] as const).filter(t => t !== tier);
  return [
    `> **Tier inferred: ${TIER_LABELS[tier]}** (medium confidence — mixed signals)`,
    `> Re-run with \`tier: "${alternates[0]}"\` or \`"${alternates[1]}"\` if this doesn't match your intent.`,
  ].join("\n");
}

// ─── Run ──────────────────────────────────────────────────────────────────────

export async function run(args: {
  workspacePath: string;
  tier?: "prototype" | "product" | "platform";
  focus?: string;
}): Promise<string> {
  const { workspacePath, tier: explicitTier, focus } = args;

  const ctx = await getBaseContext(workspacePath);
  const buildArtifact = await getArtifact(workspacePath, "build.md");
  const goalArtifact = await getArtifact(workspacePath, "goal.md");
  const designArtifact = await getArtifact(workspacePath, "design.md");
  const fixArtifact = await getArtifact(workspacePath, "fix.md");

  const goalLine = goalArtifact?.match(/^# Goal\n+(.+)/m)?.[1] ?? "(no goal defined)";

  let tierKey: "prototype" | "product" | "platform";
  let confidence: string;

  if (explicitTier) {
    tierKey = explicitTier;
    confidence = "explicit";
  } else {
    const inferred = inferTier(ctx);
    tierKey = inferred.tier;
    confidence = inferred.confidence;
  }

  const tierLabel = TIER_LABELS[tierKey];
  const tierNote = confirmationNote(tierKey, confidence, !!explicitTier);

  const contextNotes = [
    !buildArtifact && !goalArtifact && "> ℹ️ No EDP context found — running as standalone audit on existing codebase.",
    !buildArtifact && goalArtifact && "> ⚠️ No build.md found — audit has no build baseline.",
    designArtifact && "> ✅ design.md found — checking compliance with design contract.",
    fixArtifact && "> ℹ️ fix.md present — checking that recent fixes haven't introduced structural drift.",
  ].filter(Boolean) as string[];

  const must = FINDINGS.filter(f => f.severity[tierKey] === "must");
  const should = FINDINGS.filter(f => f.severity[tierKey] === "should");
  const consider = FINDINGS.filter(f => f.severity[tierKey] === "consider");

  const pkg = (() => {
    try { return JSON.parse(ctx.packageJson ?? "{}"); }
    catch { return {}; }
  })();
  const deps: string[] = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const isAiNative = deps.some(d =>
    ["@anthropic-ai/sdk", "openai", "langchain", "@langchain"].includes(d)
  );

  const aiFindings = ["inline-prompts", "no-llm-resilience", "fat-agent-tools", "no-llm-observability"];

  function renderFindings(findings: Finding[]): string[] {
    if (findings.length === 0) return ["_None at this tier._"];
    return findings.flatMap((f, i) => {
      const isAi = aiFindings.includes(f.id);
      const tag = isAiNative && isAi ? " _(AI-native)_" : "";
      const focusNote = focus ? ` _(check in: ${focus})_` : "";
      return [
        `### ${i + 1}. ${f.label}${tag}`,
        `${f.detail}${focusNote}`,
        "- [ ] Investigated",
        "- [ ] Action taken or explicitly deferred",
        "",
      ];
    });
  }

  const artifact = [
    "# Audit",
    "",
    `**Goal:** ${goalLine}`,
    focus ? `**Focus:** ${focus}` : "",
    `**Tier:** ${tierLabel}`,
    ...contextNotes,
    "",
    tierNote,
    "",
    "## Must Fix",
    "<!-- Address these before shipping or sharing this code -->",
    "",
    ...renderFindings(must),
    "## Should Fix",
    "<!-- Address before next release or when touching this area -->",
    "",
    ...renderFindings(should),
    "## Consider Later",
    "<!-- Worth doing at scale — not urgent at current tier -->",
    "",
    ...renderFindings(consider),
    "## Design contract compliance",
    designArtifact
      ? "<!-- Check findings against the contract in design.md -->"
      : "<!-- No design.md found — run `waypoint_design` to establish a contract, then re-audit -->",
    "- [ ] All Must Fix items from the design contract are addressed",
    "- [ ] Structure matches design.md recommendations",
    "",
    "## Audit summary",
    `| Severity | Count |`,
    `|----------|-------|`,
    `| Must Fix | ${must.length} |`,
    `| Should Fix | ${should.length} |`,
    `| Consider Later | ${consider.length} |`,
    "",
    "**Overall verdict:**",
    "<!-- ✅ Clean | ⚠️ Needs attention | ❌ Significant issues -->",
    "",
    `_Generated by waypoint_audit (${tierLabel}) — ${new Date().toISOString()}_`,
  ]
    .filter(l => l !== undefined)
    .join("\n");

  await saveArtifact(workspacePath, "audit.md", artifact);

  const hasMust = must.length > 0;
  const hasShould = should.length > 0;
  const nextStep = hasMust
    ? "Run `waypoint_fix` for Must Fix items — minimal targeted patches. Then re-run `waypoint_audit` to confirm."
    : hasShould
      ? "No Must Fix items. Run `waypoint_improve` to work through Should Fix items as structured refactors."
      : "No Must Fix or Should Fix items. Run `waypoint_review` for a final pre-ship quality check.";

  return [
    "## waypoint_audit — Audit complete",
    "",
    `**Tier:** ${tierLabel}`,
    `**Goal:** ${goalLine}`,
    focus ? `**Focus:** ${focus}` : "",
    isAiNative ? "**AI-native patterns:** checked" : "",
    "",
    "### Findings summary",
    `- **Must Fix:** ${must.length} — address before shipping`,
    `- **Should Fix:** ${should.length} — address before next release`,
    `- **Consider Later:** ${consider.length} — low urgency at current tier`,
    "",
    "### Artifact saved",
    "`audit.md` written to `.waypoint/audit.md`.",
    "Work through each checklist item — check off as you investigate and act.",
    "",
    "### Suggested next step",
    nextStep,
  ]
    .filter(l => l !== undefined)
    .join("\n");
}
