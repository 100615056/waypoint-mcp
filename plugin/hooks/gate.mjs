#!/usr/bin/env node
// PreToolUse hook: while a Waypoint cycle is active, block code edits until the
// stages that must come first are actually filled in. A cycle is active when
// .waypoint/active exists; its content is the mode ("build" or "fix").
// Fails open: any unexpected error lets the edit through rather than blocking work.

import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { checkCompleteness } from './completeness.mjs';

const REQUIRED = { build: ['goal.md', 'plan.md'], fix: ['fix.md'] };
// Checked only if the stage was started, so a half-done research.md can't slip through.
const IF_PRESENT = { build: ['research.md'], fix: [] };

function findCycleRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, '.waypoint', 'active'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!target) return;

  const file = resolve(input.cwd ?? process.cwd(), target);
  const root = findCycleRoot(dirname(file));
  if (!root) return;

  const waypointDir = join(root, '.waypoint');
  // Filling in the artifacts themselves is always allowed.
  if (file.startsWith(waypointDir + sep)) return;

  const mode = readFileSync(join(waypointDir, 'active'), 'utf8').trim() || 'build';
  const required = REQUIRED[mode] ?? REQUIRED.build;
  const optional = (IF_PRESENT[mode] ?? []).filter((f) => existsSync(join(waypointDir, f)));

  const problems = [];
  for (const name of [...required, ...optional]) {
    const path = join(waypointDir, name);
    if (!existsSync(path)) {
      problems.push(`${name} doesn't exist yet`);
      continue;
    }
    for (const issue of checkCompleteness(readFileSync(path, 'utf8'))) {
      problems.push(`${name}: ${issue}`);
    }
  }
  if (problems.length === 0) return;

  const reason = [
    `Waypoint: finish thinking this through before editing code (${mode} cycle in ${root}).`,
    ...problems.map((p) => `- ${p}`),
    'Fill these in under .waypoint/ (edits there are allowed). To stop using Waypoint for this work, delete .waypoint/active.',
  ].join('\n');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

try {
  main();
} catch {
  // Fail open.
}
