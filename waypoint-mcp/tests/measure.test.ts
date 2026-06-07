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
  assert(names.includes("waypoint_measure"), "waypoint_measure is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_measure");
  assert(tool?.inputSchema?.required?.includes("workspacePath"), "workspacePath is required");
  assert(!("extra" in (tool?.inputSchema?.properties ?? { extra: true })), "no extra params");
}

// ── Test 2: no goal → guidance ────────────────────────────────────────────────

section("waypoint_measure — no goal.md present");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_measure", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No goal found", "shows no-goal guidance");
  assertIncludes(text, "waypoint_goal", "suggests waypoint_goal");
}

// ── Setup: goal only (no build/test) ─────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_goal", { workspacePath: workspace, goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools" })]);

// ── Test 3: goal only, warns about missing build/test ────────────────────────

section("waypoint_measure — goal only, missing build and test");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_measure", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Measurement framework generated", "shows generated heading");
  assertIncludes(text, "build.md", "warns about missing build");
  assertIncludes(text, "test.md", "warns about missing test");
}

// ── Setup: full chain ─────────────────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_research", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_compare", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_plan", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_build", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_test", { workspacePath: workspace })]);

// ── Test 4: happy path, full chain ────────────────────────────────────────────

section("waypoint_measure — full chain");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_measure", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Measurement framework generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed");
  assertIncludes(text, "measure.md", "mentions artifact");
  assertIncludes(text, "waypoint_improve", "suggests next step");
}

// ── Test 5: artifact on disk ──────────────────────────────────────────────────

section("waypoint_measure — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "measure.md"), "utf8");
  assertIncludes(artifact, "# Measure", "has # Measure heading");
  assertIncludes(artifact, "Success criteria scorecard", "has scorecard");
  assertIncludes(artifact, "Overall verdict", "has verdict section");
  assertIncludes(artifact, "What worked well", "has worked well section");
  assertIncludes(artifact, "What fell short", "has fell short section");
  assertIncludes(artifact, "Quantitative signals", "has quantitative section");
}

summary();
