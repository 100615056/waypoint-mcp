import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import {
  sendToServer, listTools, callTool,
  assert, assertIncludes, section, summary, cleanArtifacts,
} from "./helpers.js";

const workspace = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Setup: ensure goal.md exists, wipe research.md ───────────────────────────

await cleanArtifacts(workspace);

await sendToServer([
  callTool(1, "waypoint_goal", {
    workspacePath: workspace,
    goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools",
  }),
]);

// ── Test 1: tool appears in list ──────────────────────────────────────────────

section("tools/list");
{
  const [res] = await sendToServer([listTools()]) as any[];
  const names: string[] = res.result.tools.map((t: any) => t.name);
  assert(names.includes("waypoint_research"), "waypoint_research is listed");

  const tool = res.result.tools.find((t: any) => t.name === "waypoint_research");
  assert("workspacePath" in (tool?.inputSchema?.properties ?? {}), "workspacePath param exists");
  assert("topic" in (tool?.inputSchema?.properties ?? {}), "topic param exists");
}

// ── Test 2: call with no goal.md → guidance output ───────────────────────────

section("waypoint_research — no goal.md present");
{
  await cleanArtifacts(workspace);
  const [res] = await sendToServer([
    callTool(1, "waypoint_research", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No goal found", "shows no-goal guidance");
  assertIncludes(text, "waypoint_goal", "suggests running waypoint_goal first");
}

// ── Restore goal.md for remaining tests ──────────────────────────────────────

await sendToServer([
  callTool(1, "waypoint_goal", {
    workspacePath: workspace,
    goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools",
  }),
]);

// ── Test 3: call without topic → full goal research ───────────────────────────

section("waypoint_research — no topic (full goal)");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_research", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Research brief generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed in output");
  assertIncludes(text, "research.md", "mentions artifact");
  assertIncludes(text, "waypoint_compare", "suggests next step");
}

// ── Test 4: call with topic → scoped research ────────────────────────────────

section("waypoint_research — with topic");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_research", {
      workspacePath: workspace,
      topic: "MCP SDK transport layer design",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "MCP SDK transport layer design", "topic echoed in output");
}

// ── Test 5: artifact written to disk ─────────────────────────────────────────

section("waypoint_research — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "research.md"), "utf8");
  assertIncludes(artifact, "# Research", "has # Research heading");
  assertIncludes(artifact, "Ship waypoint-mcp", "goal text in artifact");
  assertIncludes(artifact, "Key questions to answer", "has key questions section");
  assertIncludes(artifact, "Areas to investigate", "has areas section");
  assertIncludes(artifact, "Open decisions", "has open decisions section");
}

// ── Done ──────────────────────────────────────────────────────────────────────

summary();
