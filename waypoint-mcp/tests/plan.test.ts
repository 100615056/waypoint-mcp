import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import {
  sendToServer, listTools, callTool,
  assert, assertIncludes, section, summary, cleanArtifacts,
} from "./helpers.js";

const workspace = join(dirname(fileURLToPath(import.meta.url)), "..");

await cleanArtifacts(workspace);

// ── Test 1: tool appears in list ──────────────────────────────────────────────

section("tools/list");
{
  const [res] = await sendToServer([listTools()]) as any[];
  const names: string[] = res.result.tools.map((t: any) => t.name);
  assert(names.includes("waypoint_plan"), "waypoint_plan is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_plan");
  assert("workspacePath" in (tool?.inputSchema?.properties ?? {}), "workspacePath param exists");
  assert("scope" in (tool?.inputSchema?.properties ?? {}), "scope param exists");
}

// ── Test 2: no goal.md → guidance ────────────────────────────────────────────

section("waypoint_plan — no goal.md present");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_plan", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No goal found", "shows no-goal guidance");
  assertIncludes(text, "waypoint_goal", "suggests waypoint_goal");
}

// ── Setup: goal only ──────────────────────────────────────────────────────────

await sendToServer([
  callTool(1, "waypoint_goal", {
    workspacePath: workspace,
    goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools",
  }),
]);

// ── Test 3: goal only, no options/research → warns but succeeds ───────────────

section("waypoint_plan — goal only, missing prior artifacts");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_plan", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Plan generated", "shows generated heading");
  assertIncludes(text, "Missing", "warns about missing artifacts");
}

// ── Setup: full chain ─────────────────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_research", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_compare", { workspacePath: workspace })]);

// ── Test 4: happy path, no scope ─────────────────────────────────────────────

section("waypoint_plan — full chain, no scope");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_plan", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Plan generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed");
  assertIncludes(text, "plan.md", "mentions artifact");
  assertIncludes(text, "Do not call another waypoint tool", "suggests next step");
}

// ── Test 5: with scope param ──────────────────────────────────────────────────

section("waypoint_plan — with scope param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_plan", {
      workspacePath: workspace,
      scope: "Phase 1: core tool registration only",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Phase 1: core tool registration only", "scope echoed");
}

// ── Test 6: artifact on disk ──────────────────────────────────────────────────

section("waypoint_plan — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "plan.md"), "utf8");
  assertIncludes(artifact, "# Plan", "has # Plan heading");
  assertIncludes(artifact, "Milestones", "has milestones section");
  assertIncludes(artifact, "Risk register", "has risk register");
  assertIncludes(artifact, "Dependencies", "has dependencies section");
}

summary();
