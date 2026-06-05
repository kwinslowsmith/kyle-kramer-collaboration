# LHUM400 Student Metadata Methodology
## KRAMOS Student Intelligence System
*Prof. Kramer Gibson, Berklee College of Music — LHUM400 Professional Development Seminar*
*Shared with Viridian, June 2026 — student personal data redacted*

---

## Purpose

This document describes how KRAMOS generates structured intelligence about each student in LHUM400. The goal is not grading or ranking. It is knowing students deeply enough to route them into productive peer groups, anticipate where they will struggle, and (with Project X) generate reading material tuned to each person's interests and career trajectory.

Three data sources, one YAML schema, one typed Obsidian entity per student. The profiles live in the vault and are Dataview-queryable across the whole cohort.

---

## Data Sources

Each student provides three inputs during the first two weeks of the semester:

| Source | What it captures |
|---|---|
| Real-World Readiness Audit | Scored self-assessment across 5 professional domains (100 points total), plus a list of priority action items the student has not completed, rated urgent or important |
| Discussion Post 1: Introduction | Background, major/minor, instruments, career goals, post-grad plans, current projects, motivations in the student's own words |
| Discussion Post 2: Professional Habits | 3 habits the student wants to build, each structured across 6 sub-questions (goal, current state, strategy, obstacle, approach, timeline) plus a full implementation plan |

---

## The Readiness Audit Schema

Five domains, each scored out of 20, with a label based on score range:

| Score | Label |
|---|---|
| 0-5 | Bare |
| 6-10 | Patchy |
| 11-15 | Solid |
| 16-20 | Strong |

Domains:
- Digital Presence and Portfolio
- Financial Foundation
- Career Network and Communication
- Graduation and Life Logistics
- Professional Habits and Resilience

Overall tiers (sum of all five domains):

| Total | Tier |
|---|---|
| 0-25 | Foundational gaps |
| 26-50 | Building blocks |
| 51-75 | Getting traction |
| 76-90 | Nearly ready |
| 91-100 | Real-world ready |

The Priority Action Items list (urgent-flagged subset only) is the most instructionally useful output. These are the concrete tasks the student should tackle first, and they drive which students most need the packet engine's targeted materials.

---

## Full Frontmatter Schema

Every student gets one Obsidian person entity with this schema. Field names are identical across all students for Dataview compatibility.

```yaml
---
# IDENTITY
name:
goes_by:
hometown:
cultural_background:

# ACADEMIC PROFILE
majors: []
minors: []
instruments: []
year_at_berklee:

# CAREER PROFILE
career_goal:
career_goal_short:          # 3-5 word label, e.g. "game music composer"
career_domain_raw:          # plain language, Pass 1
career_domain:              # controlled tag, Pass 2
secondary_domain_raw:
secondary_domain:
target_market:
post_grad_plan: []
professional_status:        # student_only / working_with_clients / freelancing / released_work
current_projects: []

# SKILLS AND INTERESTS
skills: []
interests: []
lhum400_goals: []

# CAREER READINESS AUDIT
career_readiness_score:
readiness_tier:
domain_scores:
  digital_presence_portfolio:
    score:
    label:
  financial_foundation:
    score:
    label:
  career_network_communication:
    score:
    label:
  graduation_life_logistics:
    score:
    label:
  professional_habits_resilience:
    score:
    label:
priority_action_items:
  - item:
    rating:           # 1 = urgent, 2 = important

# PROFESSIONAL HABITS
professionalism_habits:
  habit_1:
    name:
    goal:
    current_state:
    strategy:
    obstacle:
    approach:
    timeline:
  habit_2:
    name:
    goal:
    current_state:
    strategy:
    obstacle:
    approach:
    timeline:
  habit_3:
    name:
    goal:
    current_state:
    strategy:
    obstacle:
    approach:
    timeline:
implementation_plan:
  daily_weekly_actions:
  accountability_method:
  environmental_support:
  recovery_plan:

# GROWTH AND PERSONALITY
growth_areas_raw: []
growth_areas: []            # controlled tags, Pass 2
personality_cues_raw: []
personality_cues: []        # controlled tags, Pass 2
accountability_style:
intro_themes: []

# TRIO MATCHING
trio_tags_raw: []
trio_tags: []               # controlled tags, Pass 2
trio_assigned:
trio_rationale:

# INSTRUCTOR NOTES (filled manually, never generated)
instructor_observations:
watch_for:
---
```

---

## The Three-Pass Workflow

### Pass 1: Per-Student Extraction (run once per student)

Input: one student's raw data from the three sources above.

Task: populate the schema using plain language in all `_raw` fields. Do not apply controlled vocabulary. Do not invent. If a field has no evidence, leave it blank.

### Pass 2: Taxonomy Generation (run once across the full cohort)

Task part A: read all `_raw` fields across all students, collapse synonyms, build a canonical tag dictionary (career domains, growth areas, personality cues, trio tags).

Task part B: re-run all profiles using the approved taxonomy, filling the controlled-vocabulary fields. Only tags from the approved dictionary may be used.

### Pass 3: Group Formation (run once)

Input: all re-tagged profiles.

Task: propose student trios (or pairs/quads as class size dictates) using six principles in priority order:

1. Complementary readiness levels across each group
2. Overlapping career interests (genuine common ground to discuss)
3. Shared growth areas (natural accountability within the group)
4. Personality balance (pragmatic/creative, introvert/extrovert)
5. Diversity of background (major, domain, cultural context)
6. At least one higher-readiness student per group who can model behaviors

Each trio proposal comes with a structured rationale: career overlap, complementary strengths, shared growth area, personality balance, readiness spread, instructor note, and an honest tradeoffs field. Kramer retains final authority.

---

## Project X: How the Profiles Feed the Packet Engine

This is where the metadata connects to differentiated content generation.

The packet engine takes two inputs:

1. A standard or learning objective (e.g. LHUM400 Week 4: negotiating freelance contracts)
2. A student profile (specifically: `career_goal_short`, `interests`, `readiness_tier`, `growth_areas`, `lhum400_goals`)

Output: a personalized two-page reader at the appropriate reading level, organized around that standard, with vocabulary and discussion questions tuned to the student's career domain and stated interests.

For LHUM400, this means a film scoring student and a jazz composition student both read materials on the same professional skill but encounter examples, vocabulary, and scenarios drawn from their own world.

The `priority_action_items` from the audit drive which standards to prioritize for each student. A student with urgent gaps in Financial Foundation gets that packet first; a student with urgent gaps in Career Network gets the networking reader first.

The feedback loop: once Viridian has mastery state for each student, that state informs which packets KRAMOS generates next. The profile is a living document across the semester, not a snapshot from week one.

---

## Obsidian Integration

- Entity type: `person`
- Folder: `people/lhum-400-summer-2026/` (one `.md` file per student)
- Wikilinks: `career_domain`, `growth_areas`, and `trio_tags` values link to topic nodes for graph connectivity
- Dataview views in use: Priority Actions table (surface all urgent audit items across the cohort), Readiness Overview (sort by domain weakness), Trio View (group by `trio_assigned`), Growth Areas count (how many students share each growth area, informing class-wide lesson design)

---

## Ethics Note

These profiles are for the instructor only. They are never shared with students, never used in evaluation, and never used for any purpose outside pedagogical planning. Growth areas are framed constructively. `watch_for` flags use professional language. All inferences are grounded in the student's own writing, not projected.

---

*Shared as reference architecture for Project X collaboration with Viridian.*
*KRAMOS system, June 2026.*
