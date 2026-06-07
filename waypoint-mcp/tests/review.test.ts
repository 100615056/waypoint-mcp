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
  assert(names.includes("waypoint_review"), "waypoint_review is listed");
  assert(names.length === 14, `all 14 tools registered (got ${names.length})`);
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_review");
  assert(tool?.inputSchema?.required?.includes("workspacePath"), "workspacePath is required");
}

// ── Test 2: no goal → guidance ────────────────────────────────────────────────

section("waypoint_review — no goal.md present");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_review", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No goal found", "shows no-goal guidance");
  assertIncludes(text, "waypoint_goal", "suggests waypoint_goal");
}

// ── Setup: goal only (minimal artifacts) ─────────────────────────────────────

await sendToServer([callTool(1, "waypoint_goal", { workspacePath: workspace, goal: "Ship waypoint-mcp as a fully working MCP server with 14 tools" })]);

// ── Test 3: partial artifacts — shows inventory with missing ─────────────────

section("waypoint_review — partial artifacts");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_review", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Final review generated", "shows generated heading");
  assertIncludes(text, "✅", "shows at least one present artifact");
  assertIncludes(text, "❌", "shows missing artifacts");
  assertIncludes(text, "review.md", "mentions artifact");
}

// ── Setup: full artifact chain ────────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_research", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_compare", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_plan", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_design", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_build", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_test", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_fix", { workspacePath: workspace, bug: "example bug" })]);
await sendToServer([callTool(1, "waypoint_debug", { workspacePath: workspace, mode: "troubleshoot" })]);
await sendToServer([callTool(1, "waypoint_audit", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_measure", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_improve", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_document", { workspacePath: workspace })]);

// ── Test 4: full artifact chain ───────────────────────────────────────────────

section("waypoint_review — full artifact chain");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_review", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Final review generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed");
  assertIncludes(text, "13/13", "all 13 artifacts present");
  assertIncludes(text, "All artifacts present", "confirms complete inventory");
}

// ── Test 5: artifact on disk ──────────────────────────────────────────────────

section("waypoint_review — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "review.md"), "utf8");
  assertIncludes(artifact, "# Review", "has # Review heading");
  assertIncludes(artifact, "Artifact inventory", "has artifact inventory");
  assertIncludes(artifact, "Pre-ship checklist", "has pre-ship checklist");
  assertIncludes(artifact, "Code quality", "has code quality checks");
  assertIncludes(artifact, "Security", "has security checks");
  assertIncludes(artifact, "Verdict", "has verdict section");
}

summary();
