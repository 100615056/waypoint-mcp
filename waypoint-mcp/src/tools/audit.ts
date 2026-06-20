import { getBaseContext, getArtifact, saveArtifact, getSourceContext } from "../context.js";

export const definition = {
  name: "waypoint_audit",
  description:
    "Mid-cycle health check on your codebase — writes audit.md. Safe to run at any point; does not edit source files. Tiered findings: Must Fix / Should Fix / Consider Later. For the pre-ship final check, use waypoint_review instead.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspacePath: {
        type: "string",
        description: "Absolute path to the workspace root. Defaults to the current working directory.",
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
    required: [],
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

// ─── Structural checks (no source needed) ────────────────────────────────────

interface StructuralCheck {
  id: string;
  label: string;
  severity: { prototype: string; product: string; platform: string };
  check: (ctx: { fileTree: string; packageJson: string | null }) => boolean;
  detail: string;
}

const STRUCTURAL_CHECKS: StructuralCheck[] = [
  {
    id: "no-tests",
    label: "No test files detected",
    severity: { prototype: "consider", product: "should", platform: "must" },
    check: ({ fileTree }) => !/(test|spec)\.(ts|js|tsx|jsx|py|go|rb)/.test(fileTree) && !/__tests__|test\/|spec\//.test(fileTree),
    detail: "No test files found in the file tree. Add at minimum unit tests for core logic and one integration test per entry point.",
  },
  {
    id: "no-ci",
    label: "No CI configuration found",
    severity: { prototype: "consider", product: "should", platform: "must" },
    check: ({ fileTree }) => !/(\.github\/workflows|\.circleci|\.gitlab-ci|jenkinsfile|\.travis)/i.test(fileTree),
    detail: "No CI configuration detected. Automated test runs on every push prevent regressions from reaching the main branch.",
  },
  {
    id: "no-env-example",
    label: "No .env.example or documented config requirements",
    severity: { prototype: "consider", product: "should", platform: "must" },
    check: ({ fileTree }) => !/(\.env\.example|\.env\.sample|\.env\.template)/i.test(fileTree),
    detail: "No .env.example found. New contributors have no way to know which environment variables are required.",
  },
  {
    id: "no-package-json",
    label: "No package.json (Node project) or equivalent manifest",
    severity: { prototype: "should", product: "must", platform: "must" },
    check: ({ packageJson }) => !packageJson,
    detail: "No package.json found. Dependencies and scripts are not declared — reproducible installs are not possible.",
  },
];

// ─── Source-based finding prompts ─────────────────────────────────────────────

const FINDING_PROMPTS: Record<string, { label: string; pattern: string; severity: { prototype: string; product: string; platform: string } }> = {
  secrets: {
    label: "Hardcoded secrets or credentials",
    pattern: "Look for: string literals that look like API keys, tokens, or passwords assigned directly to variables (not via process.env). Patterns: `apiKey = \"...\"`, `password = \"...\"`, `token = \"sk-...\"`, long base64-looking strings in assignments.",
    severity: { prototype: "must", product: "must", platform: "must" },
  },
  no_error_handling: {
    label: "Unhandled async errors or missing try/catch on I/O",
    pattern: "Look for: async functions or .then() chains that have no .catch() and no surrounding try/catch. Promises returned from I/O (file reads, HTTP calls, DB queries) that are not awaited or caught.",
    severity: { prototype: "must", product: "must", platform: "must" },
  },
  god_module: {
    label: "God module — single file doing too much",
    pattern: "Look for: files where routing/handler logic, business logic, and data access are all mixed together. Signs: long chains of unrelated functions, imports from both HTTP and DB layers in the same file.",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  auth_inline: {
    label: "Auth logic inside route handlers",
    pattern: "Look for: JWT verification, session checks, or permission checks written directly inside route handler functions rather than in middleware. Signs: `req.headers.authorization` parsed inside a handler body.",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  no_input_validation: {
    label: "No input validation at system boundaries",
    pattern: "Look for: route handlers or public functions that use `req.body.x`, `params.x`, or user-supplied values directly without passing them through a schema validator (Zod, joi, yup, etc.).",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  scattered_env: {
    label: "Scattered process.env access",
    pattern: "Look for: `process.env.X` accessed in multiple unrelated files rather than via a single centralised config module. Signs: `process.env.` appearing in route files, service files, and utility files.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
  magic_values: {
    label: "Magic numbers or strings in logic",
    pattern: "Look for: unexplained numeric or string literals used in conditions, timeouts, limits, or status codes — not assigned to a named constant. Signs: `if (retries > 3)`, `setTimeout(..., 5000)`, `status === 'pending'` with no constant definition.",
    severity: { prototype: "should", product: "should", platform: "must" },
  },
  inline_prompts: {
    label: "Prompt strings hardcoded inline in business logic",
    pattern: "Look for: long template literal strings containing 'system:', 'user:', 'You are', or 'assistant:' appearing inside function bodies or handler logic rather than in a dedicated prompts/ module.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
  no_llm_resilience: {
    label: "LLM API calls without retry or error handling",
    pattern: "Look for: calls to anthropic.messages.create(), openai.chat.completions.create(), or similar LLM client methods that are not wrapped in try/catch and have no retry logic.",
    severity: { prototype: "should", product: "must", platform: "must" },
  },
  direct_db_in_handler: {
    label: "Direct DB or API calls in route handlers",
    pattern: "Look for: database client calls (prisma.x.findMany, db.query, collection.find, etc.) appearing directly inside route handler functions rather than in a service or repository layer.",
    severity: { prototype: "consider", product: "should", platform: "must" },
  },
};

// ─── Tier label map ───────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  prototype: "Prototype",
  product: "Product",
  platform: "Platform",
};

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
  workspacePath?: string;
  tier?: "prototype" | "product" | "platform";
  focus?: string;
}): Promise<string> {
  const { workspacePath = process.cwd(), tier: explicitTier, focus } = args;

  const ctx = await getBaseContext(workspacePath);
  const sourceCtx = await getSourceContext(workspacePath, ctx.fileTree);
  const goalArtifact = await getArtifact(workspacePath, "goal.md");
  const designArtifact = await getArtifact(workspacePath, "design.md");
  const buildArtifact = await getArtifact(workspacePath, "build.md");
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

  const pkg = (() => {
    try { return JSON.parse(ctx.packageJson ?? "{}"); }
    catch { return {}; }
  })();
  const deps: string[] = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const isAiNative = deps.some(d =>
    ["@anthropic-ai/sdk", "openai", "langchain", "@langchain/core"].includes(d)
  );

  // ── Structural checks ──────────────────────────────────────────────────────
  const structuralFindings = STRUCTURAL_CHECKS
    .filter(c => c.check({ fileTree: ctx.fileTree, packageJson: ctx.packageJson }))
    .filter(c => c.severity[tierKey] !== "consider" || tierKey === "platform");

  // ── Source-based finding prompts — filter to relevant ones ─────────────────
  const aiOnlyFindings = new Set(["inline_prompts", "no_llm_resilience"]);
  const relevantFindingIds = Object.keys(FINDING_PROMPTS).filter(id => {
    if (aiOnlyFindings.has(id) && !isAiNative) return false;
    if (id === "auth_inline" && !deps.some(d => ["passport", "jsonwebtoken", "next-auth", "clerk", "bcrypt"].includes(d))) return false;
    if (id === "direct_db_in_handler" && !deps.some(d => ["prisma", "typeorm", "sequelize", "drizzle", "mongoose", "pg", "mysql2", "sqlite3"].includes(d))) return false;
    return true;
  });

  // ── Source file block ──────────────────────────────────────────────────────
  const sourceBlock = Object.keys(sourceCtx.files).length > 0
    ? [
        "## Source files read",
        `_${sourceCtx.fileCount} files · ${sourceCtx.totalLines} lines${sourceCtx.truncated ? " (capped — large codebase)" : ""}_`,
        "",
        ...Object.entries(sourceCtx.files).flatMap(([path, content]) => [
          `### \`${path}\``,
          "```",
          content,
          "```",
          "",
        ]),
      ]
    : [
        "## Source files read",
        "_No source files found — structural checks only._",
        "",
      ];

  // ── Finding prompt section ─────────────────────────────────────────────────
  const findingInstructions = [
    "## Findings",
    "",
    `> **Instructions for Claude:** Review the source files above. For each finding below, determine whether it is actually present in this codebase. Include only findings you can support with a specific code snippet or file reference. If a finding does not apply, omit it entirely — do not include it as \"not found.\"`,
    "",
    `> **Tier: ${tierLabel}** — use the severity guidance to prioritise findings into Must Fix / Should Fix / Consider Later.`,
    focus ? `> **Focus:** ${focus} — concentrate findings on this area.` : "",
    "",
    "### Finding checklist",
    "",
    ...relevantFindingIds.flatMap(id => {
      const f = FINDING_PROMPTS[id];
      const sev = f.severity[tierKey];
      return [
        `**${f.label}** _(${sev} at ${tierLabel})_`,
        `> ${f.pattern}`,
        "- Evidence: _[cite the specific file and line if present, or omit this finding]_",
        "- Recommended fix: _[fill in if present]_",
        "",
      ];
    }),
  ].filter(Boolean);

  // ── Structural findings section ────────────────────────────────────────────
  const structuralSection = structuralFindings.length > 0
    ? [
        "## Structural findings",
        "_These are confirmed from the file tree — no source reading required._",
        "",
        ...structuralFindings.map(f => [
          `**${f.label}** _(${f.severity[tierKey]} at ${tierLabel})_`,
          f.detail,
          "- [ ] Addressed",
          "",
        ].join("\n")),
      ]
    : ["## Structural findings", "_None detected._", ""];

  // ── Design contract compliance ─────────────────────────────────────────────
  const complianceSection = [
    "## Design contract compliance",
    designArtifact
      ? "<!-- Check findings against the contract in design.md -->"
      : "<!-- No design.md found — run `waypoint_design` to establish a contract, then re-audit -->",
    "- [ ] All Must Fix findings addressed",
    "- [ ] Structure matches design.md recommendations",
    "",
  ];

  const contextNotes = [
    !buildArtifact && !goalArtifact && "> ℹ️ No EDP context found — running as standalone audit on existing codebase.",
    !buildArtifact && goalArtifact && "> ⚠️ No build.md found — audit has no build baseline.",
    designArtifact && "> ✅ design.md found — checking compliance with design contract.",
    fixArtifact && "> ℹ️ fix.md present — check that recent fixes haven't introduced structural drift.",
  ].filter(Boolean) as string[];

  const artifact = [
    "# Audit",
    "",
    `**Goal:** ${goalLine}`,
    focus ? `**Focus:** ${focus}` : "",
    `**Tier:** ${tierLabel}`,
    isAiNative ? "**AI-native patterns:** included" : "",
    ...contextNotes,
    "",
    tierNote,
    "",
    ...sourceBlock,
    ...findingInstructions,
    "",
    ...structuralSection,
    ...complianceSection,
    "## Audit verdict",
    "**Overall:** <!-- ✅ Clean | ⚠️ Needs attention | ❌ Significant issues -->",
    "**Must Fix count:** <!-- fill in -->",
    "**Should Fix count:** <!-- fill in -->",
    "",
    `_Generated by waypoint_audit (${tierLabel}) — ${new Date().toISOString()}_`,
  ]
    .filter(l => l !== undefined)
    .join("\n");

  await saveArtifact(workspacePath, "audit.md", artifact);

  const nextStep = structuralFindings.some(f => f.severity[tierKey] === "must")
    ? "Structural issues found — address those first, then run `waypoint_fix` for source-level findings."
    : "Review the findings above. Run `waypoint_fix` for Must Fix items, then re-run `waypoint_audit` to confirm.";

  return [
    "## waypoint_audit — Audit ready",
    "",
    `**Tier:** ${tierLabel}`,
    `**Goal:** ${goalLine}`,
    focus ? `**Focus:** ${focus}` : "",
    isAiNative ? "**AI-native patterns:** included" : "",
    "",
    "### Source context",
    sourceCtx.fileCount > 0
      ? `Read ${sourceCtx.fileCount} files (${sourceCtx.totalLines} lines)${sourceCtx.truncated ? " — capped, large codebase" : ""}.`
      : "No source files found — structural checks only.",
    sourceCtx.fileCount > 0
      ? `Files: ${Object.keys(sourceCtx.files).join(", ")}`
      : "",
    "",
    "### Structural checks",
    structuralFindings.length > 0
      ? structuralFindings.map(f => `- ⚠️ **${f.label}** (${f.severity[tierKey]})`).join("\n")
      : "- ✅ All structural checks passed",
    "",
    "> **Now:** Open `.waypoint/audit.md` and fill in every finding section with evidence from the source files above. Do not call another waypoint tool until all sections are complete.",
    "",
    "### Artifact saved",
    "`audit.md` written to `.waypoint/audit.md`.",
  ]
    .filter(l => l !== undefined)
    .join("\n");
}
