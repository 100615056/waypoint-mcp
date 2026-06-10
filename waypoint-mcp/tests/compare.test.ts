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
  assert(names.includes("waypoint_compare"), "waypoint_compare is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_compare");
  assert("workspacePath" in (tool?.inputSchema?.properties ?? {}), "workspacePath param exists");
  assert("decision" in (tool?.inputSchema?.properties ?? {}), "decision param exists");
}

// ── Test 2: no goal.md → guidance ────────────────────────────────────────────

section("waypoint_compare — no goal.md present");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_compare", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No goal found", "shows no-goal guidance");
  assertIncludes(text, "waypoint_goal", "suggests waypoint_goal");
}

// ── Setup: create goal.md only (no research.md) ───────────────────────────────

await sendToServer([
  callTool(1, "waypoint_goal", {
    workspacePath: workspace,
    goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools",
  }),
]);

// ── Test 3: goal present, no research → warns but still works ────────────────

section("waypoint_compare — goal only, no research.md");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_compare", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Decision framework generated", "shows generated heading");
  assertIncludes(text, "waypoint_research", "warns about missing research");
}

// ── Setup: add research.md ────────────────────────────────────────────────────

await sendToServer([
  callTool(1, "waypoint_research", { workspacePath: workspace }),
]);

// ── Test 4: full happy path without decision param ────────────────────────────

section("waypoint_compare — no decision param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_compare", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Decision framework generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed");
  assertIncludes(text, "compare.md", "mentions artifact");
  assertIncludes(text, "waypoint_plan", "suggests next step");
}

// ── Test 5: with decision param ───────────────────────────────────────────────

section("waypoint_compare — with decision param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_compare", {
      workspacePath: workspace,
      decision: "Which transport layer to use: stdio vs HTTP SSE",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "stdio vs HTTP SSE", "decision echoed in output");
}

// ── Test 6: artifact on disk ──────────────────────────────────────────────────

section("waypoint_compare — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "compare.md"), "utf8");
  assertIncludes(artifact, "# Options", "has # Options heading");
  assertIncludes(artifact, "Decision log", "has decision log section");
  assertIncludes(artifact, "Eliminated approaches", "has eliminated section");
  assertIncludes(artifact, "Assumptions & constraints", "has assumptions section");
}

summary();
