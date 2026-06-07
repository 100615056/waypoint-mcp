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
  assert(names.includes("waypoint_fix"), "waypoint_fix is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_fix");
  assert(tool?.inputSchema?.required?.includes("workspacePath"), "workspacePath is required");
  assert("bug" in (tool?.inputSchema?.properties ?? {}), "bug param exists");
}

// ── Test 2: no bug and no fix.md → guidance ───────────────────────────────────

section("waypoint_fix — no bug param, no fix.md");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_fix", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No bug description provided", "shows no-bug guidance");
}

// ── Setup: full chain ─────────────────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_goal", { workspacePath: workspace, goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools" })]);
await sendToServer([callTool(1, "waypoint_research", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_compare", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_plan", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_build", { workspacePath: workspace })]);

// ── Test 3: with bug param ────────────────────────────────────────────────────

section("waypoint_fix — with bug param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_fix", {
      workspacePath: workspace,
      bug: "waypoint_goal returns isError:true when workspacePath contains spaces",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Fix guide generated", "shows generated heading");
  assertIncludes(text, "workspacePath contains spaces", "bug echoed");
  assertIncludes(text, "fix.md", "mentions artifact");
  assertIncludes(text, "waypoint_test", "suggests waypoint_test as next step");
  assertIncludes(text, "Minimal footprint", "mentions minimal footprint principle");
}

// ── Test 4: re-call without bug reads existing fix.md ────────────────────────

section("waypoint_fix — re-call without bug reads existing fix.md");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_fix", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Fix guide generated", "shows generated heading (not guidance)");
}

// ── Test 5: artifact on disk ──────────────────────────────────────────────────

section("waypoint_fix — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "fix.md"), "utf8");
  assertIncludes(artifact, "# Fix", "has # Fix heading");
  assertIncludes(artifact, "## Bug", "has Bug section");
  assertIncludes(artifact, "Root cause hypothesis", "has root cause section");
  assertIncludes(artifact, "Fix approach", "has fix approach section");
  assertIncludes(artifact, "Verification", "has verification checklist");
  assertIncludes(artifact, "minimal footprint", "mentions minimal footprint");
}

summary();
