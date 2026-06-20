import { getArtifact } from "../context.js";

export const definition = {
  name: "waypoint_status",
  description:
    "Show which Waypoint artifacts exist for this project and suggest the natural next tool to run. Use this to orient yourself before starting or resuming work.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspacePath: {
        type: "string",
        description: "Absolute path to the workspace root. Defaults to the current working directory.",
      },
    },
    required: [],
  },
};

const WORKFLOW = [
  { artifact: "goal.md",     tool: "waypoint_goal",     phase: "Define" },
  { artifact: "research.md", tool: "waypoint_research",  phase: "Define" },
  { artifact: "compare.md",  tool: "waypoint_compare",   phase: "Define" },
  { artifact: "plan.md",     tool: "waypoint_plan",      phase: "Plan" },
  { artifact: "design.md",   tool: "waypoint_design",    phase: "Plan" },
  { artifact: "build.md",    tool: "waypoint_build",     phase: "Build" },
  { artifact: "test.md",     tool: "waypoint_test",      phase: "Build" },
  { artifact: "fix.md",      tool: "waypoint_fix",       phase: "Build" },
  { artifact: "debug.md",    tool: "waypoint_debug",     phase: "Build" },
  { artifact: "audit.md",    tool: "waypoint_audit",     phase: "Verify" },
  { artifact: "measure.md",  tool: "waypoint_measure",   phase: "Verify" },
  { artifact: "improve.md",  tool: "waypoint_improve",   phase: "Verify" },
  { artifact: "docs.md",     tool: "waypoint_document",  phase: "Ship" },
  { artifact: "review.md",   tool: "waypoint_review",    phase: "Ship" },
];

export async function run(args: {
  workspacePath?: string;
}): Promise<string> {
  const { workspacePath = process.cwd() } = args;

  const results = await Promise.all(
    WORKFLOW.map(async (w) => ({
      ...w,
      exists: !!(await getArtifact(workspacePath, w.artifact)),
    }))
  );

  const present = results.filter((r) => r.exists);
  const missing = results.filter((r) => !r.exists);

  if (present.length === 0) {
    return [
      "## waypoint_status — No artifacts yet",
      "",
      "This project has no `.waypoint/` artifacts. Start with `waypoint_goal` to define what you're building.",
    ].join("\n");
  }

  const goalContent = await getArtifact(workspacePath, "goal.md");
  const goalLine = goalContent?.match(/^# Goal\n+(.+)/m)?.[1] ?? "(goal not parsed)";

  // Find the suggested next tool: first missing artifact in workflow order
  const nextStep = missing[0];

  const lines = [
    "## waypoint_status",
    "",
    `**Goal:** ${goalLine}`,
    `**Progress:** ${present.length}/${WORKFLOW.length} artifacts`,
    "",
  ];

  // Group by phase
  const phases = ["Define", "Plan", "Build", "Verify", "Ship"];
  for (const phase of phases) {
    const items = results.filter((r) => r.phase === phase);
    if (items.length === 0) continue;
    const allDone = items.every((i) => i.exists);
    const noneDone = items.every((i) => !i.exists);
    const phaseIcon = allDone ? "✅" : noneDone ? "⬜" : "🔶";
    lines.push(`${phaseIcon} **${phase}**`);
    for (const item of items) {
      lines.push(`  ${item.exists ? "✅" : "⬜"} ${item.artifact}`);
    }
    lines.push("");
  }

  if (nextStep) {
    lines.push(`**Suggested next:** \`${nextStep.tool}\` → creates \`${nextStep.artifact}\``);
  } else {
    lines.push("**All artifacts present.** Run `waypoint_review` for a final check before shipping.");
  }

  return lines.join("\n");
}
