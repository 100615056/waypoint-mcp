# Waypoint

Building with AI is fast. But fast without direction means rework, missed requirements, and products that don't land. Waypoint gives you the questions a senior engineer would ask — at every step, automatically.

14 guided tools take you from first idea to shipped product. Each one reads your workspace, asks the right questions, and writes a plain-language record of what was decided and why. For engineers and non-technical teams alike.

No setup or briefing required. Tools write structured artifacts to a `.waypoint/` folder, building a shared record of decisions, designs, plans, and reviews as you work.

---

## Install

```sh
npx @waycraft/waypoint-mcp
```

Or add permanently via Claude Code:

```sh
claude mcp add waypoint npx @waycraft/waypoint-mcp
```

---

## Connect manually

Add to `~/.claude/mcp.json` (global) or `.claude/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "waypoint": {
      "command": "npx",
      "args": ["@waycraft/waypoint-mcp"]
    }
  }
}
```

Restart Claude Code after editing `mcp.json`.

---

## The 14 tools

Waypoint covers four phases. Each tool reads your workspace, asks the right questions, and writes a plain-language record of what was decided and why.

Every tool accepts `workspacePath` (required) — the absolute path to the project you're working on.

---

### Define

**`waypoint_goal`** — Start here. Clarifies what you're building, who it's for, and what success looks like. Prevents scope drift before a line of code is written.

**`waypoint_research`** — Surfaces what you need to know before committing to an approach: prior art, constraints, risks, and open questions.

**`waypoint_compare`** — Lays out your options side by side with honest tradeoffs, so the choice you make is documented and defensible.

---

### Plan

**`waypoint_plan`** — Turns your goal into a sequenced build plan: what gets built, in what order, and why.

**`waypoint_design`** — Sets the structural contract before you write code — interfaces, data shapes, component boundaries. The thing you wish existed when you're debugging at 2am.

---

### Build

**`waypoint_build`** — Scaffolds the implementation against the design. Works best when `waypoint_design` has already run.

**`waypoint_test`** — Verifies the build does what it was supposed to. Surfaces gaps between spec and reality.

**`waypoint_fix`** — Takes a known bug or failure and walks through the fix systematically.

**`waypoint_debug`** — For when something is broken and you don't know why yet. Narrows root cause before touching code.

**`waypoint_audit`** — Reviews design health across the codebase. Produces tiered findings: Must Fix, Should Fix, Consider.

---

### Ship

**`waypoint_measure`** — Compares what you built against the original goal. Did you hit it? Where did you fall short?

**`waypoint_improve`** — Identifies what to make better — performance, reliability, experience — based on what's actually in the project.

**`waypoint_document`** — Writes documentation for the people who'll use or maintain this. Pulls from existing artifacts so it stays accurate.

**`waypoint_review`** — Final check before shipping. Catches the things you stopped noticing because you've been too close to the code.

---

## The flow

```
Define:  waypoint_goal → waypoint_research → waypoint_compare
Plan:    waypoint_plan → waypoint_design
Build:   waypoint_build → waypoint_test → waypoint_fix → waypoint_debug → waypoint_audit
Ship:    waypoint_measure → waypoint_improve → waypoint_document → waypoint_review
```

Tools are independent — call any one at any time. The order above is the natural progression, not a requirement.

---

## How artifacts work

Each tool writes a markdown file to `.waypoint/` in your workspace:

```
your-project/
└── .waypoint/
    ├── goal.md
    ├── research.md
    ├── compare.md
    ├── plan.md
    ├── design.md
    ├── build.md
    ├── test.md
    ├── fix.md
    ├── debug.md
    ├── audit.md
    ├── measure.md
    ├── improve.md
    ├── docs.md
    └── review.md
```

Artifacts are plain markdown — edit them directly. Later tools read earlier ones to stay in context. Commit `.waypoint/` to version control to preserve the record.

---

## Feedback & Discussion

If something didn't click, felt missing, or you found a better way to use it — I'd love to hear it.

→ [GitHub Discussions](https://github.com/explorenav-dev/waypoint-mcp/discussions)

---

## Running tests

```sh
npm test
```

Each tool has its own test file in `tests/`. Tests spin up the MCP server over stdio, send real JSON-RPC calls, and assert on output and artifacts written to disk.
