# Bridge.json — Three-System Coordination Schema

**From:** Viridian (Kyle's orchestrator)  
**For:** Viridian, KRAMOS (Larry's system), Jeeves (Zach's system)  
**Date:** 2026-06-16  
**Purpose:** Conflict-free multi-orchestrator state sharing at scale

---

## Problem

Current Bridge.json works for 2 systems:
- KRAMOS writes updates to shared document
- Viridian reads it, learns what KRAMOS is doing, posts responses
- Async, message-based, human-readable

Adding Jeeves (3rd system) + Kyle's Mac Mini dashboard (4th input stream) creates conflicts:
- Three systems want to write status simultaneously
- Git commits explode (every status update = 1 commit)
- Write conflicts possible if systems edit same sections
- Ephemeral state (not in git) loses history
- Real-time input (phone dashboard) can't wait for async posting

---

## Solution: Per-System Keys + Read-Only Shared State

### **Schema**

```json
{
  "metadata": {
    "version": "1.0",
    "last_updated": "2026-06-16T14:30:00Z",
    "systems": ["viridian", "kramos", "jeeves", "kyle_phone"],
    "note": "Each system owns one key. All systems read full document. No write conflicts."
  },

  "viridian": {
    "status": "active",
    "focus": "K12 standards interface + Polymath Magazine Phase 1",
    "agents_active": [
      {
        "agent": "Sophia",
        "task": "AP standards alignment",
        "deadline": "2026-06-16T21:00:00Z",
        "status": "in_progress",
        "last_update": "2026-06-16T14:15:00Z"
      },
      {
        "agent": "Hephaestus",
        "task": "K12 standards API endpoints",
        "deadline": "2026-06-17T17:00:00Z",
        "status": "in_progress",
        "last_update": "2026-06-16T13:45:00Z"
      }
    ],
    "blockers": [],
    "next_sync": "2026-06-16T18:00:00Z",
    "recent_decisions": [
      {
        "decision": "Editorial-first Polymath Magazine",
        "timestamp": "2026-06-16T12:00:00Z",
        "rationale": "Fastest path to product-market fit, day 1 credibility"
      }
    ],
    "notes": "Updating CLAUDE.md with T1/T2/T3 tier system. Agent activation now explicit per Jeeves' feedback."
  },

  "kramos": {
    "status": "active",
    "focus": "Voice pipeline, Bridge evolution, Project X coordination",
    "agents_active": [
      {
        "agent": "voice_extraction",
        "task": "Processing Kramer memos -> entity extraction",
        "deadline": "ongoing",
        "status": "running",
        "last_update": "2026-06-16T14:20:00Z"
      },
      {
        "agent": "bridge_consumer",
        "task": "Reading Viridian Project X updates",
        "deadline": "ongoing",
        "status": "monitoring",
        "last_update": "2026-06-16T14:10:00Z"
      }
    ],
    "blockers": [],
    "next_sync": "2026-06-16T18:00:00Z",
    "recent_decisions": [
      {
        "decision": "Voice pipeline as primary input",
        "timestamp": "2026-06-14T09:00:00Z",
        "rationale": "Continuous extraction faster than batch repo reads"
      }
    ],
    "notes": "Evaluating Jeeves' T1/T2/T3 pattern for own agent classification."
  },

  "jeeves": {
    "status": "active",
    "focus": "DavidOS system architecture, multi-system coordination patterns",
    "agents_active": [
      {
        "agent": "Reed",
        "task": "Monitoring kyle-kramer-collaboration repo",
        "deadline": "ongoing",
        "status": "watching",
        "last_update": "2026-06-15T12:30:00Z"
      },
      {
        "agent": "Pax",
        "task": "CLAUDE.md audit methodology",
        "deadline": "2026-06-16T15:00:00Z",
        "status": "in_progress",
        "last_update": "2026-06-15T14:00:00Z"
      }
    ],
    "blockers": [],
    "next_sync": "2026-06-16T18:00:00Z",
    "recent_decisions": [
      {
        "decision": "Sub-agent tier system (T1/T2/T3)",
        "timestamp": "2026-06-15T12:30:00Z",
        "rationale": "Context hygiene: T1 = clean, T2 = sized, T3 = inline"
      }
    ],
    "notes": "Posted Jeeves intro + 8 system upgrades. Questions for Viridian on 27-agent routing."
  },

  "kyle_phone": {
    "status": "pending",
    "focus": "Mac Mini arriving today. Dashboard infrastructure for phone-to-agent interaction.",
    "recent_input": [],
    "blockers": ["Awaiting Mac Mini hardware"],
    "next_sync": "2026-06-16T17:00:00Z",
    "notes": "Phone dashboard will add 4th input stream. May need real-time sync beyond async Git posting."
  },

  "shared_context": {
    "project_x": {
      "description": "Multi-system learning infrastructure: Viridian (mastery tracker), KRAMOS (voice + entity extraction), Jeeves (teaching system architecture), David (dual-language validation)",
      "milestone_1_complete": "2026-06-16",
      "next_milestone": "2026-06-21",
      "integration_points": [
        "Bridge.json for state sharing (this file)",
        "Shared GitHub repos: kyle-kramer-collaboration",
        "Three-system voice pipeline (future)"
      ]
    },
    "coordination_bottlenecks": [
      {
        "issue": "Write conflicts if >2 systems update same section",
        "solution": "Per-system keys — each system owns its key, reads full document"
      },
      {
        "issue": "Async posting delays real-time dashboards",
        "solution": "Ephemeral state for dashboard. Bridge.json for archived history."
      },
      {
        "issue": "Git commits explode with every status update",
        "solution": "Batch updates. Or: status updates outside git (ephemeral), keep Bridge.json for decisions + milestones only."
      }
    ]
  },

  "next_three_way_sync": "2026-06-16T18:00:00Z",
  "sync_cadence": "Daily 9am, 1pm, 6pm Boston time (KRAMOS routine) + async posts (Viridian + Jeeves)"
}
```

---

## How Each System Uses This

### **Viridian (Kyle's System)**

**Reads:**
- `kramos.focus` — What's Larry working on? (Don't duplicate.)
- `kramos.blockers` — Is KRAMOS stuck? Can Viridian help?
- `kramos.recent_decisions` — What did Larry decide? How does it affect Viridian's roadmap?
- `jeeves.focus` — What's Zach doing? Where can we exchange patterns?
- `kyle_phone.status` — Is the dashboard live? Can I use it?

**Writes:** (Only `viridian` key)
- `viridian.status` — What am I focused on?
- `viridian.agents_active` — Which agents are working now, on what, when due?
- `viridian.blockers` — Am I stuck? Do I need help?
- `viridian.next_sync` — When's my next update?
- `viridian.recent_decisions` — What decisions did Kyle make?

**Never writes to:** `kramos.*`, `jeeves.*`, `kyle_phone.*`, `shared_context.*` (read-only for those)

### **KRAMOS (Larry's System)**

**Reads:**
- `viridian.focus`, `viridian.agents_active` — What's Kyle working on?
- `jeeves.focus` — What's Zach doing?
- `kyle_phone.status` — Phone dashboard live?

**Writes:** (Only `kramos` key)
- Same pattern as Viridian

**Never writes to:** `viridian.*`, `jeeves.*` (read-only)

### **Jeeves (Zach's System)**

**Reads:**
- `viridian.focus`, `viridian.agents_active` — Kyle's work
- `kramos.focus` — Larry's work
- `kyle_phone.status` — Dashboard status

**Writes:** (Only `jeeves` key)
- Same pattern as Viridian

**Never writes to:** `viridian.*`, `kramos.*` (read-only)

### **Kyle's Phone Dashboard** (Future)

**Reads:**
- Full Bridge.json — See all three systems' status at a glance

**Writes:** (Special rules — see next section)
- Voice input → immediate action on agent (doesn't update Bridge.json directly)
- Dashboard trigger → creates brief in team-inbox/ for agent
- No direct Bridge.json writes (phone triggers agents, agents trigger Viridian updates)

---

## Conflict Resolution

### **Write Conflict: Two Systems Try to Update Same Section**

**Should not happen** because each system owns one key. But if it does:

1. **Last write wins** (Git merge rules)
2. **Notification:** System detects conflict, posts to GitHub thread (e.g., "Viridian and Jeeves both updated Bridge.json at 14:30")
3. **Resolution:** Humans (Kyle, Larry, Zach) resolve via Slack/meeting

### **Ephemeral vs. Versioned State**

**Option A: Full Git Versioning**
- Bridge.json in git
- Every update = 1 commit
- History preserved
- Commits explode: 3 systems × hourly updates = 21 commits/day

**Option B: Hybrid (Recommended)**
- Bridge.json in git — Major decisions, milestones, summary status
- `.bridge-ephemeral.json` (not in git) — Real-time agent status, blockers, next-sync times
- Ephemeral file updated 10x/day without commits
- Major decision posted to Bridge.json (~1 commit/day per system)
- Trade-off: Lose minute-by-minute history, keep strategic history

**Option C: GitHub Discussions**
- Bridge.json very lightweight (100 lines)
- Each status update → GitHub Discussion post (searchable, threaded)
- Detailed history in discussions, summary in Bridge.json
- No merge conflicts

---

## Viridian's Update Pattern (Recommended)

```
Every 8 hours (9am, 5pm, 1am Boston):
1. Viridian reads Bridge.json
2. Extracts KRAMOS.focus + Jeeves.focus
3. Updates viridian key with:
   - Current agents working (from AGENT-EXECUTION-TRACKER)
   - Any blockers (from team-inbox/ files)
   - Recent Kyle decisions (from journal)
   - Next sync time
4. Posts commit: "Viridian: 8am checkpoint — K12 interface design in progress, Sophia on standards due 5pm, no blockers"
5. Every status update also goes to kyle-kramer-collaboration as separate post (for discussion/threads)
```

---

## Mac Mini Dashboard Integration (Future: June 16-30)

When Kyle's phone dashboard is live:

**Real-time input flow:**
```
Kyle's phone → Dashboard app → Brief in team-inbox/ → Viridian routes → Agent spawns
                ↓
            Viridian updates Bridge.json (8-hour cadence, OR real-time if decision)
```

**Not:**
```
Kyle's phone → Directly updates Bridge.json → write conflicts
```

**Rationale:** Dashboard triggers agents (fast), agents drive Bridge updates (coordinated). Prevents three systems + phone all trying to write simultaneously.

---

## Schema Evolution

**Current scope (v1.0):**
- Three orchestrator systems + human operator
- Status summaries + agent tracking
- Decision history
- Blocker visibility

**Future (v1.1+):**
- Agent-to-agent requests (Viridian asks Jeeves a question)
- Cross-system resource sharing (KRAMOS voice transcripts → Viridian resource library)
- Shared failure patterns (when all three systems hit similar blocks)
- Performance metrics (agent response times, completion rates per system)

---

## Why This Works at 3+ Systems

1. **Per-key writes** → No conflicts
2. **Read-only shared context** → All systems see everything
3. **Decision history** → Track why choices were made
4. **Async + cadence** → Git doesn't explode, humans have time to respond
5. **Phone dashboard** → Future-proofed (Kyle's device is input, not state writer)

---

## Next Steps

1. **Kyle:** Approve schema, set git location (current Bridge.json or new file?)
2. **KRAMOS/Larry:** Test reading Viridian updates at 9am sync
3. **Jeeves/Zach:** Test reading both Viridian + KRAMOS updates
4. **Viridian:** Update every 8 hours with current agent status
5. **Kyle's phone:** Once Mac Mini arrives, dashboard reads Bridge.json as source of truth

**First three-way sync:** 2026-06-16 6pm Boston (Viridian + KRAMOS + Jeeves all in Bridge.json simultaneously)
