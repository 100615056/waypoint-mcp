import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { checkCompleteness } from '../hooks/completeness.mjs';

const PLUGIN = join(import.meta.dirname, '..');
const GATE = join(PLUGIN, 'hooks', 'gate.mjs');
const TEMPLATES = join(PLUGIN, 'skills', 'waypoint', 'templates');

function runGate(cwd, filePath) {
  const out = execFileSync('node', [GATE], {
    input: JSON.stringify({ cwd, tool_name: 'Edit', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  return out ? JSON.parse(out).hookSpecificOutput : null;
}

const template = (name) => readFileSync(join(TEMPLATES, name), 'utf8');

const filled = (name) =>
  template(name).replace(/<!--\s*fill:[\s\S]*?-->/g, 'Specific, project-relevant content written by Claude.');

describe('gate', () => {
  let root;
  const wp = () => join(root, '.waypoint');

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'waypoint-gate-'));
    mkdirSync(join(root, 'src'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('allows edits when no cycle is active', () => {
    mkdirSync(wp());
    writeFileSync(join(wp(), 'plan.md'), template('plan.md')); // old, hollow artifact
    assert.equal(runGate(root, 'src/app.js'), null);
  });

  it('blocks code edits while the plan is still a template', () => {
    mkdirSync(wp());
    writeFileSync(join(wp(), 'active'), 'build');
    writeFileSync(join(wp(), 'goal.md'), filled('goal.md'));
    writeFileSync(join(wp(), 'plan.md'), template('plan.md'));
    const res = runGate(root, 'src/app.js');
    assert.equal(res.permissionDecision, 'deny');
    assert.match(res.permissionDecisionReason, /plan\.md: "Milestones" still has its fill-in instructions/);
    assert.doesNotMatch(res.permissionDecisionReason, /goal\.md/);
  });

  it('always allows editing the artifacts themselves', () => {
    mkdirSync(wp());
    writeFileSync(join(wp(), 'active'), 'build');
    assert.equal(runGate(root, join(root, '.waypoint', 'goal.md')), null);
  });

  it('allows code edits once goal and plan are filled in', () => {
    mkdirSync(wp());
    writeFileSync(join(wp(), 'active'), 'build');
    writeFileSync(join(wp(), 'goal.md'), filled('goal.md'));
    writeFileSync(join(wp(), 'plan.md'), filled('plan.md'));
    assert.equal(runGate(root, 'src/app.js'), null);
  });

  it('holds a started-but-unfinished research stage to the same bar', () => {
    mkdirSync(wp());
    writeFileSync(join(wp(), 'active'), 'build');
    writeFileSync(join(wp(), 'goal.md'), filled('goal.md'));
    writeFileSync(join(wp(), 'plan.md'), filled('plan.md'));
    writeFileSync(join(wp(), 'research.md'), template('research.md'));
    assert.equal(runGate(root, 'src/app.js').permissionDecision, 'deny');
  });

  it('gates fix cycles on fix.md, not the build stages', () => {
    mkdirSync(wp());
    writeFileSync(join(wp(), 'active'), 'fix');
    writeFileSync(join(wp(), 'fix.md'), template('fix.md'));
    assert.match(runGate(root, 'src/app.js').permissionDecisionReason, /fix\.md: "Root cause"/);
    writeFileSync(join(wp(), 'fix.md'), filled('fix.md'));
    assert.equal(runGate(root, 'src/app.js'), null);
  });

  it('fails open on malformed input', () => {
    const out = execFileSync('node', [GATE], { input: 'not json', encoding: 'utf8' });
    assert.equal(out, '');
  });
});

describe('checkCompleteness', () => {
  it('treats empty bullets and stray comments as empty', () => {
    const issues = checkCompleteness('# Plan\n\n## Milestones\n\n- [ ] \n- \n<!-- note -->\n');
    assert.deepEqual(issues, ['"Milestones" is empty']);
  });

  it('checks the text above the first section', () => {
    const issues = checkCompleteness(readFileSync(join(TEMPLATES, 'goal.md'), 'utf8'));
    assert.equal(issues[0], '"Goal" still has its fill-in instructions');
  });

  it('skips sections marked for later', () => {
    assert.deepEqual(checkCompleteness('## Build log\n\n<!-- waypoint:later -->\n'), []);
  });
});
