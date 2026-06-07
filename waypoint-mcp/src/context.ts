import { readFile, writeFile, readdir, mkdir, stat } from "fs/promises";
import { join, relative } from "path";

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

export async function saveArtifact(
  workspacePath: string,
  filename: string,
  content: string
): Promise<void> {
  const waypointDir = join(workspacePath, ".waypoint");
  await mkdir(waypointDir, { recursive: true });
  await writeFile(join(waypointDir, filename), content, "utf8");
}
