# Changelog

All notable changes to `@waycraft/waypoint-mcp` are documented here.

---

## [0.3.0] — 2026-06-21

### Added
- **`waypoint_start`** — meta-tool that reads project state and recommends the right first tool to call. Supports `waypoint.config.json` for team-level defaults.
- **`waypoint_status`** — shows which artifacts exist and suggests the natural next step. Quick orientation without running a full review.
- **Completion gates** — tools now instruct the AI to fill in the current artifact before moving on, replacing forward nudges that pulled the AI to the next tool prematurely.
- Auto `.gitignore` — `.waypoint/` is automatically added to `.gitignore` on first use.

### Changed
- **`waypoint_design`** — bullet filtering by detected concerns. Database/API/queue/cache bullets only appear when the project actually uses those patterns, reducing noise on simpler projects.
- **`waypoint_review`** — includes stakeholder summary section.
- **`waypoint_audit`** / **`waypoint_review`** — compact summary output.
- **`waypoint_goal`** — improved parameter description with inline example.
- **`waypoint_debug`** — `mode` parameter is now optional (defaults to `troubleshoot`).
- Tool count: 14 → 16.
- Removed unused devDependencies.

### Fixed
- Test assertions updated to match completion-gate output (removed stale forward-nudge expectations).

---

## [0.2.0] — 2026-06-08

### Changed

**`waypoint_goal` — previous cycle detection**
When a new goal is set and a prior `goal.md` already exists, the tool now snapshots the old cycle to `.waypoint/previous.md` before starting fresh. The snapshot records the previous goal statement, which artifacts were present, and when the cycle closed. One file, always overwritten — no accumulating archive folders.

**`waypoint_design` — plan-aware design notes**
The tool now reads `plan.md` content and installed dependencies to detect which concern areas are actually in scope for the build: auth, database, API, UI, AI, queue, cache. A new **Plan-specific design notes** section is written with targeted guidance per detected concern, before the generic tier patterns. A project building auth + a database now gets different design output than one building a CLI tool — even at the same tier.

**`waypoint_audit` — concern-aware finding filtering**
Findings are now filtered against what the project actually uses before being rendered. Auth findings (e.g. auth-inline) only appear when auth dependencies are present. Database findings only when a DB layer is detected. AI-native findings (prompt handling, LLM resilience, observability) only when an AI SDK is in `package.json`. This eliminates the noise of irrelevant findings on projects where they can't apply.

---

## [0.1.4] — 2026-05-XX

- Improved npm discoverability — better description, keywords, and README hook
- Tools section rewritten with phase groupings and plain-language descriptions

## [0.1.3] — 2026-05-XX

- Switched to PolyForm Noncommercial 1.0.0 license

## [0.1.2] — 2026-05-XX

- Initial public release
