import { getBaseContext, getArtifact, saveArtifact } from "../context.js";

export const definition = {
  name: "waypoint_design",
  description:
    "Produce a design contract before building. Infers project tier (Prototype / Product / Platform) from the workspace and plan, confirms with one question, then prescribes patterns, structure, and anti-patterns for Build to follow.",
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
          "Explicitly set the project tier (optional). Omit to let waypoint_design infer it from the workspace and ask for confirmation.",
      },
      focus: {
        type: "string",
        description:
          "Specific area to produce design guidance for (optional). E.g. 'auth layer', 'data access', 'API structure'. Omit to cover the full plan.",
      },
    },
    required: ["workspacePath"],
  },
};

// ─── Tier inference ───────────────────────────────────────────────────────────

function inferTier(
  ctx: { fileTree?: string; packageJson?: string | null },
  planArtifact: string | null
): { tier: "prototype" | "product" | "platform"; confidence: "high" | "medium" } {
  let score = 0;

  const fileTree = ctx.fileTree ?? "";
  const pkg = (() => {
    try { return JSON.parse(ctx.packageJson ?? "{}"); }
    catch { return {}; }
  })();
  const deps: string[] = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const allText = [fileTree, planArtifact ?? "", ctx.packageJson ?? ""].join("\n").toLowerCase();

  const fileCount = (fileTree.match(/\n/g) ?? []).length;
  if (fileCount > 40) score += 2;
  else if (fileCount > 15) score += 1;

  if (allText.includes("dockerfile") || allText.includes("docker-compose")) score += 2;
  if (allText.includes(".github/workflows") || allText.includes("ci.yml")) score += 1;
  if (allText.includes(".env.example") || allText.includes("config/")) score += 1;

  if (deps.some(d => ["prisma", "typeorm", "sequelize", "drizzle", "mongoose"].includes(d))) score += 2;
  if (deps.some(d => ["passport", "jsonwebtoken", "next-auth", "clerk"].includes(d))) score += 1;
  if (deps.some(d => ["jest", "vitest", "mocha", "playwright", "cypress"].includes(d))) score += 1;

  if (allText.includes("console.log") && fileCount < 10) score -= 1;
  if (allText.includes("todo") || allText.includes("fixme")) score -= 1;
  if (!ctx.packageJson) score -= 1;

  if (deps.some(d => ["@anthropic-ai/sdk", "openai", "langchain", "@langchain"].includes(d))) score += 1;

  if (score >= 6) return { tier: "platform", confidence: "high" };
  if (score >= 3) return { tier: "product", confidence: score >= 4 ? "high" : "medium" };
  return { tier: "prototype", confidence: score <= 1 ? "high" : "medium" };
}

// ─── Pattern sets per tier ────────────────────────────────────────────────────

const PATTERNS = {
  prototype: {
    label: "Prototype",
    description: "Solo or exploratory — readable, no obvious traps. Avoid premature abstraction.",
    structure: [
      "Flat file structure — group by feature, not by layer",
      "Single entry point (index.js / main.py)",
      "Inline config via process.env — no config module needed yet",
    ],
    apply: [
      "Meaningful naming — variables and functions describe intent",
      "No magic numbers — use named constants even in early code",
      "Early returns to reduce nesting",
      "Basic error handling — don't silently swallow errors",
    ],
    avoid: [
      "Dependency injection frameworks — premature at this scale",
      "Layered architecture (controllers/services/repos) — adds overhead without benefit",
      "Abstract base classes or interface hierarchies",
      "Over-engineered config systems",
    ],
    aiNative: [
      "Prompt strings can live inline — extract to a prompts.js file when there are 3+",
      "LLM calls should have at minimum a try/catch with a readable error message",
      "No observability needed yet — console.log is fine",
    ],
  },
  product: {
    label: "Product",
    description: "Small team, real users, will grow — SOLID basics, modularity, testability.",
    structure: [
      "Feature-based folders at the top level (e.g. auth/, payments/, users/)",
      "Within each feature: route/handler → service → repository/data-access",
      "Shared utilities in lib/ or utils/ — no circular imports",
      "Config module (config.js) as single source of truth for env vars",
      "Separate entry point from app setup (index.js bootstraps, app.js configures)",
    ],
    apply: [
      "Single responsibility — each function/module does one thing",
      "Dependency injection — pass dependencies as arguments, don't import globals into logic",
      "Input validation at system boundaries (Zod, joi, or equivalent)",
      "Centralized error handling — one error middleware, not scattered try/catches",
      "Named exports over default exports — easier to refactor and trace",
      "No direct DB calls in route handlers — always through a service",
    ],
    avoid: [
      "God modules — files over ~200 lines are a warning sign",
      "Hardcoded secrets or environment-specific values in code",
      "Shared mutable state across modules",
      "Deep callback nesting — use async/await throughout",
      "Direct SDK calls scattered across the codebase — wrap in a service",
    ],
    aiNative: [
      "Extract prompt strings to a dedicated prompts/ module — never inline in business logic",
      "Wrap every LLM call in a resilience layer: retry on transient errors, timeout, fallback message",
      "Agent tool functions must have single responsibility — one tool = one action",
      "Log token usage at the service layer for cost visibility",
      "Never put raw user input directly into a prompt — sanitize or structure first",
    ],
  },
  platform: {
    label: "Platform",
    description: "Multi-team, high scale, long-lived — full patterns, contracts, observability.",
    structure: [
      "Domain-driven folder structure — packages or modules per bounded context",
      "Explicit interface contracts between layers (TypeScript interfaces or JSDoc types)",
      "Shared kernel for cross-cutting concerns (logging, auth, config, errors)",
      "Infrastructure layer isolated from domain logic (ports & adapters)",
      "Separate read and write paths where contention is expected",
    ],
    apply: [
      "Full SOLID compliance — especially Open/Closed and Liskov",
      "Repository pattern — domain logic never touches query syntax",
      "Dependency inversion — depend on abstractions, inject implementations",
      "Structured logging with correlation IDs on every request",
      "Circuit breakers on all external service calls",
      "Event-driven side effects — don't couple services via direct calls",
      "Idempotency on all write operations that may be retried",
    ],
    avoid: [
      "Anemic domain models — logic belongs in the domain, not scattered in services",
      "Shotgun surgery patterns — a single change requiring edits in 5+ files",
      "Implicit service coupling — make dependencies explicit and injectable",
      "Unversioned external contracts (APIs, events, schemas)",
      "Synchronous calls to non-critical services in the request path",
    ],
    aiNative: [
      "Prompt versioning — treat prompts as versioned artifacts with changelogs",
      "LLM call abstraction layer — swap providers without touching business logic",
      "Structured output validation — never trust LLM output shape, always validate",
      "Agent observability — trace each tool call with input, output, latency, tokens",
      "Prompt injection hardening — sanitize all user-controlled content before interpolation",
      "Async agent pipelines — long-running agent tasks should be queued, not blocking",
    ],
  },
};

// ─── Confirmation prompt ──────────────────────────────────────────────────────

function confirmationPrompt(
  tier: "prototype" | "product" | "platform",
  confidence: "high" | "medium"
): string {
  const label = PATTERNS[tier].label;

  if (confidence === "high") {
    return `> **Tier inferred: ${label}** (high confidence)\n> If this is wrong, re-run \`waypoint_design\` with an explicit \`tier\` parameter.`;
  }

  const alternates = (["prototype", "product", "platform"] as const).filter(t => t !== tier);
  return [
    `> **Tier inferred: ${label}** (medium confidence — mixed signals in the workspace)`,
    `> If this doesn't match your intent, re-run \`waypoint_design\` with \`tier: "${alternates[0]}"\` or \`"${alternates[1]}"\`.`,
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
  const planArtifact = await getArtifact(workspacePath, "plan.md");
  const goalArtifact = await getArtifact(workspacePath, "goal.md");
  const optionsArtifact = await getArtifact(workspacePath, "compare.md");

  if (!planArtifact && !goalArtifact) {
    return [
      "## waypoint_design — No plan or goal found",
      "",
      "Run `waypoint_goal` → `waypoint_plan` before producing a design contract.",
      "waypoint_design needs to know what you're building before it can prescribe how to build it.",
    ].join("\n");
  }

  const goalLine = goalArtifact?.match(/^# Goal\n+(.+)/m)?.[1] ?? "(goal not parsed)";

  let tierKey: "prototype" | "product" | "platform";
  let confidence: string;
  let tierNote: string;

  if (explicitTier) {
    tierKey = explicitTier;
    confidence = "explicit";
    tierNote = `> **Tier set explicitly: ${PATTERNS[tierKey].label}**`;
  } else {
    const inferred = inferTier(ctx, planArtifact);
    tierKey = inferred.tier;
    confidence = inferred.confidence;
    tierNote = confirmationPrompt(tierKey, inferred.confidence);
  }

  const patterns = PATTERNS[tierKey];
  const focusNote = focus ? `\n**Focus:** ${focus}` : "";

  const hasOptions = !!optionsArtifact;
  const optionsNote = !hasOptions
    ? "\n> ⚠️ No compare.md found — design contract is based on goal/plan only. Run `waypoint_compare` for richer context."
    : "";

  const artifact = [
    "# Design",
    "",
    `**Goal:** ${goalLine}`,
    focusNote,
    `**Tier:** ${patterns.label} — ${patterns.description}`,
    optionsNote,
    "",
    tierNote,
    "",
    "## Recommended structure",
    ...patterns.structure.map(s => `- ${s}`),
    "",
    "## Patterns to apply",
    ...patterns.apply.map(p => `- ${p}`),
    "",
    "## Anti-patterns to avoid",
    ...patterns.avoid.map(a => `- ❌ ${a}`),
    "",
    "## AI-native considerations",
    ...patterns.aiNative.map(n => `- ${n}`),
    "",
    "## Design decisions",
    "<!-- Record any project-specific choices made here — deviations from the above and why -->",
    "- ",
    "",
    "## Contract for Build",
    "<!-- Summarise what Build must honour — fill this in before handing off -->",
    "- [ ] Follow the recommended structure above",
    "- [ ] Apply all patterns marked for this tier",
    "- [ ] Avoid all listed anti-patterns",
    "- [ ] ",
    "",
    `_Generated by waypoint_design (${patterns.label}) — ${new Date().toISOString()}_`,
  ]
    .filter(l => l !== undefined)
    .join("\n");

  await saveArtifact(workspacePath, "design.md", artifact);

  return [
    "## waypoint_design — Design contract generated",
    "",
    `**Goal:** ${goalLine}`,
    `**Tier:** ${patterns.label}`,
    focus ? `**Focus:** ${focus}` : "",
    !hasOptions ? "\n> No compare.md — run `waypoint_compare` for decision context." : "",
    "",
    "### Contract covers",
    `- **Structure** — ${patterns.structure.length} recommendations`,
    `- **Patterns to apply** — ${patterns.apply.length} rules`,
    `- **Anti-patterns to avoid** — ${patterns.avoid.length} rules`,
    `- **AI-native** — ${patterns.aiNative.length} considerations`,
    "",
    "### Artifact saved",
    "`design.md` written to `.waypoint/design.md`.",
    "Fill in **Design decisions** for any project-specific deviations, then complete the **Contract for Build** checklist.",
    "",
    "### Suggested next step",
    "Run `waypoint_build` — it will read `design.md` as a constraint alongside `plan.md`.",
  ]
    .filter(l => l !== undefined)
    .join("\n");
}
