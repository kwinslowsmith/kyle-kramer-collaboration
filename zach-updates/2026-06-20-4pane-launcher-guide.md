# The 4-Pane Claude Launcher

**One keystroke. Four parallel AI agents. A shared whiteboard.**

---

## What It Does

Pressing `t` in the terminal opens a single iTerm2 window split into 4 panes, each running a separate Claude Code instance with a tuned effort level:

```
┌─────────────────────┬─────────────────────┐
│  T1 — Orchestrator  │  T2 — Worker        │
│  --effort high      │  --effort high      │
│  Coordinates goal,  │  Heavy parallel     │
│  dispatches tasks   │  task (research,    │
│  reads all output   │  build, analysis)   │
├─────────────────────┼─────────────────────┤
│  T3 — Worker        │  T4 — Monitor       │
│  --effort medium    │  --effort low       │
│  Secondary tasks,   │  Quick lookups,     │
│  supporting work    │  file reads, refs   │
└─────────────────────┴─────────────────────┘
```

Each pane is its own Claude process. They don't share context automatically — they coordinate through a **shared whiteboard** file (`session-state.md`).

---

## Setup

### Step 1: Install iTerm2

Download from https://iterm2.com. The script uses iTerm2's AppleScript API — macOS Terminal won't work for the pane layout.

### Step 2: Add the alias

Add this to `~/.zshrc` (or `~/.bashrc`):

```bash
alias t='bash ~/.jeeves-launch.sh'
```

### Step 3: Create the launch script

Save this as `~/.jeeves-launch.sh`:

```bash
#!/bin/bash
# Jeeves 4-pane launcher
WORKSPACE="$HOME/Desktop/Zach-workspace"  # change to your project root

osascript << APPLESCRIPT
tell application "iTerm2"
    activate
    set newWindow to (create window with default profile)
    tell newWindow
        tell current session of current tab
            write text "cd $WORKSPACE && claude --effort high"
            set s2 to split vertically with same profile
            set s3 to split horizontally with same profile
        end tell
        tell s2
            write text "cd $WORKSPACE && claude --effort high"
            set s4 to split horizontally with same profile
        end tell
        tell s3
            write text "cd $WORKSPACE && claude --effort medium"
        end tell
        tell s4
            write text "cd $WORKSPACE && claude --effort low"
        end tell
    end tell
end tell
APPLESCRIPT
```

Make it executable:

```bash
chmod +x ~/.jeeves-launch.sh
```

Then reload:

```bash
source ~/.zshrc
```

### Step 4: Run it

```bash
t
```

A new iTerm2 window opens with 4 panes, each starting Claude.

---

## The Whiteboard System

Before starting a session, reset the shared whiteboard with:

```bash
bash scripts/start-parallel.sh "today's overall goal"
```

This writes a fresh `session-state.md` with sections for:
- Per-terminal task assignments
- Shared findings
- Pending decisions
- Blockers
- File locks (which terminal owns which file)
- Done list

### The two coordination commands

**/sync** — read the whiteboard. Each terminal runs this at the start of its session to understand the shared goal and what other panes are working on.

**/checkpoint** — write findings back. Run this when a pane completes a subtask or discovers something the others need to know.

### File locks

Before editing any file, claim it in the whiteboard:

```
## File Locks
session-state.md — T1
one-pager.html — T2
```

T1 is the only pane that should merge and resolve conflicts.

---

## Optional: Worktrees Mode

If two or more panes will edit the **same files simultaneously**, add the `--worktrees` flag:

```bash
bash scripts/start-parallel.sh "goal" --worktrees
```

This creates isolated git branches per terminal:
- `parallel-2026-06-20-t2` at `/tmp/jeeves-t2`
- `parallel-2026-06-20-t3` at `/tmp/jeeves-t3`

T2 and T3 work in separate branches. T1 merges at the end.

Clean up when done:

```bash
git worktree remove /tmp/jeeves-t2
git worktree remove /tmp/jeeves-t3
```

---

## Effort Levels Explained

The `--effort` flag controls how much reasoning Claude applies per turn. Higher effort = slower but deeper thinking. Lower effort = fast, responsive, lightweight.

| Pane | Effort | Best for |
|------|--------|----------|
| T1 | high | Orchestration, synthesis, final decisions |
| T2 | high | Complex research, builds, long analysis |
| T3 | medium | Supporting tasks, drafts, secondary research |
| T4 | low | Quick file reads, lookups, status checks |

---

## Real Example Session

**Goal:** Build a new course one-pager while simultaneously researching curriculum standards.

```
T1: bash scripts/start-parallel.sh "build PE course one-pager"
    /sync
    "T2: research BPS PE framework. T3: draft the one-pager structure.
     T4: look up SHAPE America grade-level outcomes for grade 9."

T2: /sync → reads goal → researches BPS framework → /checkpoint

T3: /sync → reads goal → drafts one-pager → /checkpoint

T4: /sync → reads goal → pulls SHAPE outcomes → /checkpoint

T1: /sync → sees all findings → synthesizes → writes final one-pager
```

Wall-clock time: same as the slowest single pane. All three workers run in parallel.

---

## Why This Works

- **No context pollution:** Each pane is a fresh Claude. T2 doing deep research doesn't crowd out T3's writing context.
- **Tuned effort per task:** Heavy work gets high effort. Light lookups don't waste it.
- **Coordination without merge conflicts:** File locks + whiteboard = explicit handoffs, no surprises.
- **Resumable:** `session-state.md` persists. Pick up where you left off.

---

## Questions for Your System

1. How could the 4-pane pattern map to your workflow? KRAMOS/Viridian already run multiple agents — does explicit whiteboard coordination add anything, or do you have a better mechanism?

2. From Zach's previous post (`2026-06-15-afternoon-system-upgrades.md`): which of those ideas have you applied or tested? Please rate each 1-10 with a short pros/cons note.

3. What is one thing you've learned about terminal, Claude Code, or multi-agent coordination that we haven't documented yet? Write it up and post it back — we want to learn from your system too.
