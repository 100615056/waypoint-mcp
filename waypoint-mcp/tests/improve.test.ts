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
  assert(names.includes("waypoint_improve"), "waypoint_improve is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_improve");
  assert(tool?.inputSchema?.required?.includes("workspacePath"), "workspacePath is required");
  assert("area" in (tool?.inputSchema?.properties ?? {}), "area param exists");
}

// ── Test 2: no goal → guidance ────────────────────────────────────────────────

section("waypoint_improve — no goal.md present");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_improve", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No goal found", "shows no-goal guidance");
  assertIncludes(text, "waypoint_goal", "suggests waypoint_goal");
}

// ── Setup: goal only (no measure) ────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_goal", { workspacePath: workspace, goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools" })]);

// ── Test 3: goal only, warns about no measure ─────────────────────────────────

section("waypoint_improve — goal only, no measure.md");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_improve", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Improvement plan generated", "shows generated heading");
  assertIncludes(text, "waypoint_measure", "warns about missing measure");
}

// ── Setup: add measure.md ─────────────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_research", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_compare", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_plan", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_build", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_test", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_measure", { workspacePath: workspace })]);

// ── Test 4: happy path, no area ───────────────────────────────────────────────

section("waypoint_improve — full chain, no area");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_improve", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Improvement plan generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed");
  assertIncludes(text, "improve.md", "mentions artifact");
  assertIncludes(text, "Must-have", "mentions must-have tier");
  assertIncludes(text, "Should-have", "mentions should-have tier");
  assertIncludes(text, "Nice-to-have", "mentions nice-to-have tier");
}

// ── Test 5: with area param ───────────────────────────────────────────────────

section("waypoint_improve — with area param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_improve", {
      workspacePath: workspace,
      area: "Error handling in tool dispatch",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Error handling in tool dispatch", "area echoed");
}

// ── Test 6: artifact on disk ──────────────────────────────────────────────────

section("waypoint_improve — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "improve.md"), "utf8");
  assertIncludes(artifact, "# Improve", "has # Improve heading");
  assertIncludes(artifact, "Must-have improvements", "has must-have section");
  assertIncludes(artifact, "Should-have improvements", "has should-have section");
  assertIncludes(artifact, "Nice-to-have enhancements", "has nice-to-have section");
  assertIncludes(artifact, "Out of scope", "has out of scope section");
  assertIncludes(artifact, "Refactor prompt", "has refactor prompt");
}

summary();
