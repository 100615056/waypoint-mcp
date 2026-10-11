# Waypoint (Claude Code plugin)

Think it through before you build. Waypoint walks Claude through a short goal → research → plan sequence (or a fix sequence for bugs), writing each stage to `.waypoint/`. A hook blocks code edits until those stages are filled in for real, not just scaffolded.

## Install

```sh
claude plugin marketplace add 100615056/waypoint-mcp
claude plugin install waypoint@waycraft
```

## Use

Just ask: "Let's plan this properly with Waypoint", or "Use Waypoint to fix the login bug." Claude starts a cycle, fills each stage with you, and asks when a real decision comes up.

- The gate only applies while `.waypoint/active` exists. Projects without an active cycle are never affected.
- Editing files inside `.waypoint/` is always allowed.
- To stop gating mid-cycle, delete `.waypoint/active`.
- The gate covers Claude's Edit and Write tools, not shell commands.

## Develop

```sh
cd plugin && npm test
```

Replaces the `@waycraft/waypoint-mcp` server, which is no longer maintained.
