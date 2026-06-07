# Waypoint

A structured development protocol as an MCP server. 14 tools that guide any project from goal to ship — for engineers and non-technical stakeholders alike.

Each tool reads your workspace automatically. No setup or briefing required. Tools write structured artifacts to a `.waypoint/` folder, building a shared record of decisions, designs, plans, and reviews as you work.

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

| Tool | What it does |
|------|-------------|
| `waypoint_goal` | Define what you're building and why |
| `waypoint_research` | Surface what you need to know first |
| `waypoint_compare` | Weigh your options and tradeoffs |
| `waypoint_plan` | Map out how and when you'll build it |
| `waypoint_design` | Set the structural contract before building |
| `waypoint_build` | Scaffold the implementation |
| `waypoint_test` | Verify it works |
| `waypoint_fix` | Fix what's broken |
| `waypoint_debug` | Find out why it's broken |
| `waypoint_audit` | Check design health — tiered Must Fix / Should Fix findings |
| `waypoint_measure` | Evaluate whether you hit the goal |
| `waypoint_improve` | Identify what to make better |
| `waypoint_document` | Write it up for others |
| `waypoint_review` | Final check before you ship |

Every tool accepts `workspacePath` (required) — the absolute path to the project you're working on.

---

## The journey

```
waypoint_goal → waypoint_research → waypoint_compare → waypoint_plan → waypoint_design
             → waypoint_build → waypoint_test → waypoint_fix → waypoint_debug → waypoint_audit
             → waypoint_measure → waypoint_improve → waypoint_document → waypoint_review
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

## Running tests

```sh
npm test
```

Each tool has its own test file in `tests/`. Tests spin up the MCP server over stdio, send real JSON-RPC calls, and assert on output and artifacts written to disk.
