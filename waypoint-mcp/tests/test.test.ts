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
  assert(names.includes("waypoint_test"), "waypoint_test is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_test");
  assert(tool?.inputSchema?.required?.includes("workspacePath"), "workspacePath is required");
  assert("feature" in (tool?.inputSchema?.properties ?? {}), "feature param exists");
}

// ── Test 2: no build or goal → guidance ──────────────────────────────────────

section("waypoint_test — no build or goal present");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_test", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No build or goal found", "shows no-build guidance");
  assertIncludes(text, "waypoint_build", "suggests waypoint_build");
}

// ── Setup: full chain ─────────────────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_goal", { workspacePath: workspace, goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools" })]);
await sendToServer([callTool(1, "waypoint_research", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_compare", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_plan", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_build", { workspacePath: workspace })]);

// ── Test 3: happy path, no feature ───────────────────────────────────────────

section("waypoint_test — no feature param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_test", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Test plan generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed");
  assertIncludes(text, "test.md", "mentions artifact");
  assertIncludes(text, "waypoint_fix", "suggests waypoint_fix as next step");
  assertIncludes(text, "waypoint_measure", "suggests waypoint_measure as next step");
}

// ── Test 4: with feature param ────────────────────────────────────────────────

section("waypoint_test — with feature param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_test", {
      workspacePath: workspace,
      feature: "tools/list returns all 12 tools",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "tools/list returns all 12 tools", "feature echoed");
}

// ── Test 5: artifact on disk ──────────────────────────────────────────────────

section("waypoint_test — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "test.md"), "utf8");
  assertIncludes(artifact, "# Test", "has # Test heading");
  assertIncludes(artifact, "Feature checklist", "has feature checklist");
  assertIncludes(artifact, "Unit test prompt", "has unit test prompt");
  assertIncludes(artifact, "Integration test prompt", "has integration test prompt");
  assertIncludes(artifact, "Manual test cases", "has manual test cases table");
  assertIncludes(artifact, "Known gaps", "has known gaps section");
}

summary();
