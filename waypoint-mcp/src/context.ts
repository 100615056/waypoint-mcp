import { readFile, writeFile, readdir, mkdir, stat, unlink } from "fs/promises";
import { join, relative, extname } from "path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  "coverage", ".cache", ".turbo", "out",
]);

export interface BaseContext {
  workspacePath: string;
  fileTree: string;
  packageJson: string | null;
  waypointArtifacts: Record<string, string>;
}

async function listTree(dir: string, depth: number, root: string): Promise<string[]> {
  if (depth === 0) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const lines: string[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".") && entry !== ".waypoint") continue;
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const rel = relative(root, full);
    let isDir = false;
    try {
      isDir = (await stat(full)).isDirectory();
    } catch {
      continue;
    }
    lines.push(isDir ? `${rel}/` : rel);
    if (isDir) {
      lines.push(...await listTree(full, depth - 1, root));
    }
  }
  return lines;
}

export async function getBaseContext(workspacePath: string): Promise<BaseContext> {
  const treeLines = await listTree(workspacePath, 2, workspacePath);
  const fileTree = treeLines.length > 0 ? treeLines.join("\n") : "(empty workspace)";

  let packageJson: string | null = null;
  try {
    packageJson = await readFile(join(workspacePath, "package.json"), "utf8");
  } catch {
    // not a Node project — fine
  }

  const waypointArtifacts: Record<string, string> = {};
  const waypointDir = join(workspacePath, ".waypoint");
  try {
    const files = await readdir(waypointDir);
    for (const file of files.sort()) {
      try {
        waypointArtifacts[file] = await readFile(join(waypointDir, file), "utf8");
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // no .waypoint directory yet — fine
  }

  return { workspacePath, fileTree, packageJson, waypointArtifacts };
}

export async function getArtifact(
  workspacePath: string,
  filename: string
): Promise<string | null> {
  try {
    return await readFile(join(workspacePath, ".waypoint", filename), "utf8");
  } catch {
    return null;
  }
}

// ─── Source context ────────────────────────────────────────────────────────────

export interface SourceContext {
  files: Record<string, string>;   // relative path → truncated content
  fileCount: number;
  totalLines: number;
  truncated: boolean;              // true if we hit the line cap
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb", ".java", ".cs"]);
const SKIP_PATTERNS = ["test", "spec", ".test.", ".spec.", "__test__", "__mock__", "mock", "fixture", "generated", "vendor", ".d.ts"];
const ENTRY_NAMES = new Set(["index", "main", "app", "server", "cli"]);
const HIGH_PRIORITY_DIRS = new Set(["src", "app", "lib", "routes", "controllers", "handlers", "tools", "api", "services", "core"]);
const MAX_SOURCE_FILES = 12;
const MAX_LINES_PER_FILE = 250;
const MAX_TOTAL_LINES = 2500;

function scoreFile(relPath: string): number {
  const lower = relPath.toLowerCase();
  if (SKIP_PATTERNS.some(p => lower.includes(p))) return -1;

  const ext = extname(lower);
  if (!SOURCE_EXTENSIONS.has(ext)) return -1;

  const parts = lower.replace(/\\/g, "/").split("/");
  const basename = parts[parts.length - 1].replace(/\.[^.]+$/, "");
  const depth = parts.length;

  let score = 0;
  if (ENTRY_NAMES.has(basename)) score += 60;
  if (depth === 1) score += 40;                            // root-level source file
  if (depth === 2 && HIGH_PRIORITY_DIRS.has(parts[0])) score += 50;
  if (depth >= 2 && HIGH_PRIORITY_DIRS.has(parts[0])) score += 20;
  score -= (depth - 1) * 5;                               // penalise deep nesting
  return score;
}

export async function getSourceContext(workspacePath: string, fileTree: string): Promise<SourceContext> {
  const candidates = fileTree
    .split("\n")
    .map(p => p.trim())
    .filter(p => p && !p.endsWith("/"))
    .map(p => ({ path: p, score: scoreFile(p) }))
    .filter(c => c.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SOURCE_FILES * 2)                        // read more candidates than needed
    .map(c => c.path);

  const files: Record<string, string> = {};
  let totalLines = 0;
  let truncated = false;

  for (const relPath of candidates) {
    if (Object.keys(files).length >= MAX_SOURCE_FILES) break;
    if (totalLines >= MAX_TOTAL_LINES) { truncated = true; break; }

    try {
      const raw = await readFile(join(workspacePath, relPath), "utf8");
      const lines = raw.split("\n");
      const take = Math.min(lines.length, MAX_LINES_PER_FILE, MAX_TOTAL_LINES - totalLines);
      files[relPath] = lines.slice(0, take).join("\n") + (take < lines.length ? "\n// ... (truncated)" : "");
      totalLines += take;
      if (take < lines.length) truncated = true;
    } catch {
      // unreadable — skip
    }
  }

  return { files, fileCount: Object.keys(files).length, totalLines, truncated };
}

export async function clearArtifacts(
  workspacePath: string,
  filenames: string[]
): Promise<void> {
  const waypointDir = join(workspacePath, ".waypoint");
  await Promise.allSettled(
    filenames.map(f => unlink(join(waypointDir, f)))
  );
}

export async function saveArtifact(
  workspacePath: string,
  filename: string,
  content: string
): Promise<void> {
  const waypointDir = join(workspacePath, ".waypoint");
  await mkdir(waypointDir, { recursive: true });
  await writeFile(join(waypointDir, filename), content, "utf8");
}
