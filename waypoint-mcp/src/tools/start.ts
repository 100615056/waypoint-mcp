import { getBaseContext, getArtifact } from "../context.js";

export const definition = {
  name: "waypoint_start",
  description:
    "Entry point for new users. Asks what you're building and routes to the right first tool. If a goal already exists, shows current status instead. Use this when you're not sure which waypoint tool to run.",
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

export async function run(args: {
  workspacePath?: string;
}): Promise<string> {
  const { workspacePath = process.cwd() } = args;
  const ctx = await getBaseContext(workspacePath);
  const goalArtifact = await getArtifact(workspacePath, "goal.md");

  if (goalArtifact) {
    const goalLine = goalArtifact.match(/^# Goal\n+(.+)/m)?.[1] ?? "(goal not parsed)";
    const artifacts = Object.keys(ctx.waypointArtifacts);

    return [
      "## waypoint_start — Goal already defined",
      "",
      `**Goal:** ${goalLine}`,
      `**Artifacts:** ${artifacts.length > 0 ? artifacts.join(", ") : "goal.md only"}`,
      "",
      "You already have a goal. Here's what to do next:",
      "",
      artifacts.includes("plan.md")
        ? "- Your plan exists. Run `waypoint_build` to start implementing, or `waypoint_audit` to check quality."
        : artifacts.includes("research.md")
          ? "- Research is done. Run `waypoint_compare` to evaluate options, then `waypoint_plan` to create milestones."
          : "- Run `waypoint_research` to surface best practices and open questions for your goal.",
      "",
      "Or run `waypoint_status` for a full progress overview.",
    ].join("\n");
  }

  const pkg = ctx.packageJson
    ? (() => { try { const p = JSON.parse(ctx.packageJson!); return p.name ?? null; } catch { return null; } })()
    : null;

  return [
    "## waypoint_start — What are you building?",
    "",
    pkg ? `Detected project: **${pkg}**` : "No package.json detected — this might be a new project.",
    "",
    "Tell me what you want to build or improve, and I'll set up the right Waypoint workflow.",
    "",
    "**Examples:**",
    '- "Add user authentication with email and OAuth"',
    '- "Refactor the API layer to use tRPC"',
    '- "Fix the checkout flow — users are dropping off at payment"',
    '- "Ship the MVP by Friday"',
    "",
    "> Call `waypoint_goal` with your goal to get started. A good goal answers: what are we delivering, who benefits, and what does done look like?",
  ].join("\n");
}
