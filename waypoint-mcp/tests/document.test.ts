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
  assert(names.includes("waypoint_document"), "waypoint_document is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_document");
  assert("workspacePath" in (tool?.inputSchema?.properties ?? {}), "workspacePath param exists");
  assert("audience" in (tool?.inputSchema?.properties ?? {}), "audience param exists");
}

// ── Test 2: works with no prior artifacts (explain is standalone) ─────────────

section("waypoint_document — no prior artifacts");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_document", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Documentation generated", "shows generated heading");
  assertIncludes(text, "waypoint-mcp", "project name from package.json");
  assertIncludes(text, "docs.md", "mentions artifact");
  assertIncludes(text, "waypoint_review", "suggests next step");
}

// ── Setup: add goal.md ────────────────────────────────────────────────────────

await cleanArtifacts(workspace);
await sendToServer([callTool(1, "waypoint_goal", { workspacePath: workspace, goal: "Ship waypoint-mcp as a fully working MCP server with 12 tools" })]);

// ── Test 3: with goal.md — pulls goal into docs ───────────────────────────────

section("waypoint_document — with goal.md");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_document", { workspacePath: workspace }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Documentation generated", "shows generated heading");
}

// ── Test 4: with audience param ───────────────────────────────────────────────

section("waypoint_document — with audience param");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_document", {
      workspacePath: workspace,
      audience: "Claude Code users connecting via MCP",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Claude Code users connecting via MCP", "audience echoed");
}

// ── Test 5: artifact on disk ──────────────────────────────────────────────────

section("waypoint_document — artifact on disk");
{
  const artifact = await readFile(join(workspace, ".waypoint", "docs.md"), "utf8");
  assertIncludes(artifact, "# Documentation", "has # Documentation heading");
  assertIncludes(artifact, "What this is", "has what section");
  assertIncludes(artifact, "How it works", "has how section");
  assertIncludes(artifact, "Getting started", "has getting started section");
  assertIncludes(artifact, "Key concepts", "has key concepts section");
  assertIncludes(artifact, "Reference", "has reference section");
  assertIncludes(artifact, "Known limitations", "has limitations section");
}

// ── Test 6: artifact is saved as docs.md not explain.md ──────────────────────

section("waypoint_document — artifact filename is docs.md");
{
  const artifacts = Object.keys((await sendToServer([
    callTool(1, "waypoint_document", { workspacePath: workspace }),
  ]) as any[])[0].result?.content?.[0]?.text ?? "");
  // confirm by reading disk
  let found = false;
  try {
    await readFile(join(workspace, ".waypoint", "docs.md"), "utf8");
    found = true;
  } catch { /* */ }
  assert(found, "docs.md exists on disk (not explain.md)");
}

summary();
