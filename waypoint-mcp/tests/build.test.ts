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
  assert(names.includes("waypoint_build"), "waypoint_build is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_build");
  assert("workspacePath" in (tool?.inputSchema?.properties ?? {}), "workspacePath param exists");
  assert("task" in (tool?.inputSchema?.properties ?? {}), "task param exists");
}

// ── Test 2: no goal or plan → guidance ───────────────────────────────────────

section("waypoint_build — no goal or plan present");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_build", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "No plan or goal found", "shows no-plan guidance");
  assertIncludes(text, "waypoint_goal", "suggests waypoint_goal");
  assertIncludes(text, "waypoint_plan", "suggests waypoint_plan");
}

// ── Setup: goal only (no plan) ────────────────────────────────────────────────

await sendToServer([
  callTool(1, "waypoint_goal", {
    workspacePath: workspace,
    goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools",
  }),
]);

// ── Test 3: goal present but no plan → warns but succeeds ────────────────────

section("waypoint_build — goal only, no plan.md");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_build", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Build guide generated", "shows generated heading");
  assertIncludes(text, "waypoint_plan", "warns about missing plan");
}

// ── Setup: full chain ─────────────────────────────────────────────────────────

await sendToServer([callTool(1, "waypoint_research", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_compare", { workspacePath: workspace })]);
await sendToServer([callTool(1, "waypoint_plan", { workspacePath: workspace })]);

// ── Test 4: happy path, no task ───────────────────────────────────────────────

section("waypoint_build — full chain, no task");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_build", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Build guide generated", "shows generated heading");
  assertIncludes(text, "Ship waypoint-mcp", "goal echoed");
  assertIncludes(text, "build.md", "mentions artifact");
  assertIncludes(text, "waypoint_test", "suggests next step");
  assertIncludes(text, "AI coding prompts", "mentions prompts");
}

// ── Test 5: with task param ───────────────────────────────────────────────────

section("waypoint_build — with task param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_build", {
      workspacePath: workspace,
      task: "Implement src/context.ts with getBaseContext, getArtifact, saveArtifact",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "getBaseContext", "task echoed in output");
}

// ── Test 6: artifact on disk ──────────────────────────────────────────────────

section("waypoint_build — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "build.md"), "utf8");
  assertIncludes(artifact, "# Build", "has # Build heading");
  assertIncludes(artifact, "Implementation checklist", "has checklist section");
  assertIncludes(artifact, "AI coding prompts", "has prompts section");
  assertIncludes(artifact, "Implementation notes", "has notes section");
  assertIncludes(artifact, "Files changed", "has files changed section");
}

summary();
