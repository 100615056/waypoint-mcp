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
  assert(names.includes("waypoint_debug"), "waypoint_debug is listed");
  const tool = res.result.tools.find((t: any) => t.name === "waypoint_debug");
  assert(tool?.inputSchema?.required?.includes("workspacePath"), "workspacePath is required");
  assert(tool?.inputSchema?.required?.includes("mode"), "mode is required");
  assert("symptom" in (tool?.inputSchema?.properties ?? {}), "symptom param exists");
  const modeEnum: string[] = tool?.inputSchema?.properties?.mode?.enum ?? [];
  assert(modeEnum.includes("troubleshoot"), "mode enum includes troubleshoot");
  assert(modeEnum.includes("trace"), "mode enum includes trace");
}

// ── Test 2: troubleshoot mode, no symptom ────────────────────────────────────

section("waypoint_debug — troubleshoot mode, no symptom");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_debug", { workspacePath: workspace, mode: "troubleshoot" }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Troubleshoot", "shows troubleshoot heading");
  assertIncludes(text, "debug.md", "mentions artifact");
  assertIncludes(text, "waypoint_fix", "suggests waypoint_fix as next step");
}

// ── Test 3: troubleshoot mode, with symptom ───────────────────────────────────

section("waypoint_debug — troubleshoot mode, with symptom");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_debug", {
      workspacePath: workspace,
      mode: "troubleshoot",
      symptom: "Server hangs on second JSON-RPC call",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Server hangs on second JSON-RPC call", "symptom echoed");
  assertIncludes(text, "Is/Is-not", "mentions Is/Is-not framework");
}

// ── Test 4: trace mode, with symptom ─────────────────────────────────────────

section("waypoint_debug — trace mode, with symptom");
{
  const [res] = await sendToServer([
    callTool(1, "waypoint_debug", {
      workspacePath: workspace,
      mode: "trace",
      symptom: "waypoint_goal returns empty fileTree even when files exist",
    }),
  ]) as any[];
  const text: string = res.result.content[0].text;
  assert(!res.result.isError, "no error flag");
  assertIncludes(text, "Trace", "shows trace heading");
  assertIncludes(text, "waypoint_goal returns empty fileTree", "symptom echoed");
  assertIncludes(text, "Execution path", "mentions execution path framework");
}

// ── Test 5: artifact on disk has mode-specific content ────────────────────────

section("waypoint_debug — artifact on disk (trace mode)");
{
  const artifact = await readFile(join(workspace, ".waypoint", "debug.md"), "utf8");
  assertIncludes(artifact, "# Diagnose", "has # Diagnose heading");
  assertIncludes(artifact, "**Mode:** trace", "mode recorded in artifact");
  assertIncludes(artifact, "Execution path", "has execution path section");
  assertIncludes(artifact, "Divergence point", "has divergence point section");
}

summary();
