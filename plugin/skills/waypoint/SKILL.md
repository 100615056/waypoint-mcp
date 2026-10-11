---
name: waypoint
description: Think a piece of work through before building it — goal, research and plan written to .waypoint/, enforced by a hook that blocks code edits until the plan is really filled in. Use when the user says "waypoint", "plan this properly", "let's think this through first", "don't just start coding", or starts a feature, rewrite or non-trivial bug fix where getting the approach wrong would be costly. Not for one-line changes or quick questions.
---

# Waypoint

Waypoint makes sure the thinking happens before the building. Each stage is a short Markdown file in `.waypoint/` at the project root. While a cycle is active, a hook blocks code edits until the required stages are filled in for real: every `<!-- fill: ... -->` instruction replaced with actual content.

The point is the thinking, not the documents. Short and specific beats long and generic.

## Paths

- **Build** (features, changes): goal → research → plan → build → review
- **Fix** (bugs): fix → build → verify

## Starting a cycle

1. If `.waypoint/active` already exists, read it and the existing artifacts, tell the user where things stand, and continue from there instead of starting over.
2. Otherwise, if `.waypoint/` has artifacts from an earlier cycle, move them to `.waypoint/archive/<date>/` first.
3. Create `.waypoint/active` containing `build` or `fix`.
4. Make sure `.waypoint/` is in `.gitignore`, unless the user wants the record committed.
5. Copy the first stage's template from this skill's `templates/` folder into `.waypoint/`.

## Stages

Do one stage at a time. For each:

1. Copy the template into `.waypoint/` (if it isn't there yet).
2. Read what you need: the earlier stages, and only the code that's relevant. Don't dump whole files into the artifact; reference paths.
3. Replace every `<!-- fill: ... -->` with specific content for this project. Delete the instruction comment as you fill it.
4. Give the user a 2-4 line summary of the stage. If it raised a real decision, ask it now and record the answer. Don't silently pick.
5. Move to the next stage only once the current one is genuinely done.

| Stage | Template | Notes |
|---|---|---|
| goal | `goal.md` | If the request is vague, ask what "done" looks like before filling success criteria. |
| research | `research.md` | Optional for small, well-understood work, but once started it must be finished. Check the codebase and current docs; don't rely on memory for library APIs. |
| plan | `plan.md` | Milestones need concrete "done when" checks. |
| build | (none) | The hook now allows edits. Work milestone by milestone and keep the plan's Build log current. |
| review | `review.md` | Check every success criterion with evidence, then end the cycle. |
| fix | `fix.md` | Confirm the root cause with evidence before changing code. |

## Ending a cycle

After review (or after a fix is verified), delete `.waypoint/active`. The artifacts stay as a record, and the hook stops gating that project.

If the user wants to drop Waypoint mid-cycle, deleting `.waypoint/active` is the off switch. Do that only when they ask.

## If an edit is blocked

The hook's message lists exactly which sections are unfinished. Go fill them in, and talk to the user if a section needs their input. Don't work around the gate by editing through the shell; the gate exists because skipping straight to code is the failure Waypoint prevents.
