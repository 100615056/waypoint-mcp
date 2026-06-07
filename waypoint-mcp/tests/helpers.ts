import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { rm } from "fs/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

export function makeRequest(id: number, method: string, params: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

export function listTools(id = 1) {
  return makeRequest(id, "tools/list", {});
}

export function callTool(id: number, name: string, args: Record<string, unknown>) {
  return makeRequest(id, "tools/call", { name, arguments: args });
}

// ── Server runner ─────────────────────────────────────────────────────────────

export function sendToServer(messages: string[]): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (stderr) process.stderr.write(`[server stderr] ${stderr}`);
      const lines = stdout.trim().split("\n").filter(Boolean);
      const results: unknown[] = [];
      for (const line of lines) {
        try { results.push(JSON.parse(line)); }
        catch { reject(new Error(`Non-JSON output: ${line}`)); return; }
      }
      resolve(results);
    });

    proc.on("error", reject);

    for (const msg of messages) proc.stdin.write(msg + "\n");
    proc.stdin.end();
  });
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

export function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

export function assertIncludes(text: string, substring: string, label: string) {
  assert(text.includes(substring), `${label} — contains "${substring}"`);
}

export function section(name: string) {
  console.log(`\n${name}`);
}

export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ── Workspace fixture ─────────────────────────────────────────────────────────

export async function cleanArtifacts(workspacePath: string) {
  try {
    await rm(join(workspacePath, ".waypoint"), { recursive: true, force: true });
  } catch { /* fine */ }
}
