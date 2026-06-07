import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import {
  sendToServer, listTools, callTool,
  assert, assertIncludes, section, summary, cleanArtifacts,
} from "./helpers.js";

const workspace = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Setup ─────────────────────────────────────────────────────────────────────

await cleanArtifacts(workspace);

// ── Test 1: tool appears in list ──────────────────────────────────────────────

section("tools/list");
{
  const [res] = await sendToServer([listTools()]) as any[];
  const names: string[] = res.result.tools.map((t: any) => t.name);
  assert(names.includes("waypoint_goal"), "waypoint_goal is listed");

  const tool = res.result.tools.find((t: any) => t.name === "waypoint_goal");
  assert(tool?.inputSchema?.required?.includes("workspacePath"), "workspacePath is required");
  assert("goal" in (tool?.inputSchema?.properties ?? {}), "goal param exists");
}

// ── Test 2: call with no goal → guidance output ───────────────────────────────

section("waypoint_goal — no goal provided");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_goal", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No goal defined yet", "shows no-goal guidance");
  assertIncludes(text, "**Path:**", "workspace path echoed");
}

// ── Test 3: call with a goal → captures and saves ─────────────────────────────

section("waypoint_goal — goal provided");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_goal", {
      workspacePath: workspace,
      goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Goal captured", "shows captured heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal text echoed");
  assertIncludes(text, "goal.md", "mentions artifact");
  assertIncludes(text, "waypoint_research", "suggests next step");
}

// ── Test 4: artifact written to disk ─────────────────────────────────────────

section("waypoint_goal — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "goal.md"), "utf8");
  assertIncludes(artifact, "# Goal", "has # Goal heading");
  assertIncludes(artifact, "Ship waypoint-mcp", "goal text in artifact");
  assertIncludes(artifact, "Success criteria", "has Success criteria section");
  assertIncludes(artifact, "Out of scope", "has Out of scope section");
}

// ── Test 5: re-call with no goal reads existing goal.md ───────────────────────

section("waypoint_goal — re-call reads existing artifact");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_goal", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assertIncludes(text, "Goal captured", "shows captured (not guidance) because goal.md exists");
  assertIncludes(text, "Ship waypoint-mcp", "existing goal text surfaced");
}

// ── Done ──────────────────────────────────────────────────────────────────────

summary();
