# Polymath Magazine — Full Vision + Phase 1 + Where We Need Help

**From:** Kyle (via Viridian)  
**To:** Team + Collaborators (Jeeves, KRAMOS, whoever wants to help)  
**Date:** 2026-06-16  
**Type:** Project vision + Phase 1 brief + ask for help

---

## The Vision: Polymath Magazine as Viridian's Discovery Layer

Viridian (the mastery tracker) is powerful but internal. **Polymath Magazine is the public front door.**

It's not just a magazine. It's an **ecosystem entry point** that shows people:
- What it means to develop expertise
- How to get started learning anything
- Tools that make learning faster/better
- Resources organized by skill level
- Communities of practice (from Viridian)

**Three layers:**

1. **Editorial Content** — Long-form articles on expertise development. "How to Get Into Woodworking," "Building a Jazz Practice," "Teaching Dual-Language Classrooms."
2. **Interactive Tools** — Open-access utilities (el-lector-diario, future tools) that people can play with immediately
3. **Resource Directory** — Curated materials from Match HS, Improv Asylum, friendly schools, organized by skill/domain

**Strategic positioning:** By August 2026, Polymath becomes a defensible moat:
- **Content moat** — 50+ original articles + 200+ resources (competitors can't copy overnight)
- **Community moat** — Teachers invested in Polymath → invested in Viridian
- **Integration moat** — Polymath content lives in Viridian app (seamless discovery)
- **SEO moat** — Long-form articles drive organic traffic for years

---

## Why Editorial-First (Not Community-Driven, Not Tool-First)

**Three strategic options were considered. Editorial-First won because:**

| Dimension | Editorial-First | Community-Driven | Tool-First |
|-----------|-----------------|------------------|-----------|
| **Time to launch** | 2 weeks | 6 weeks | 4 weeks |
| **Quality** | High (curated voice) | Medium (early contributions) | High (technical) |
| **Conversion** | Best (deep editorial) | Good (authentic) | Medium (tool-focused) |
| **Optionality** | Opens community Phase 2 | Locked in community model | Locked in tool model |
| **Credibility** | Strong (Kyle's voice) | Growing (crowdsourced) | Technical (tool demos) |

**Winner: Editorial-First** because it's the fastest path to product-market fit AND doesn't lock us out of adding community/tools later.

---

## Phase 1: Magazine Launch (June 16 – June 30)

### Scope

**Landing page + 3 expertise pathways + 50-75 resources + 2 tool showcases**

**3 Expertise Pathways** (each ~3000 words, multi-article)
1. **"Mastery 101: How Expertise Really Works"** — The philosophy + how to structure a learning journey
2. **[Kyle picks domain 2]** — Example: "Building a Teaching Community," "How to Learn Languages Faster," etc.
3. **[Kyle picks domain 3]** — A third pathway showing different skill level

Each pathway:
- 3-5 articles (written by Kyle + 1-2 guest contributors per pathway)
- CTA at end: "Start learning this skill in Viridian" (link to app signup)
- Resources tagged to each pathway

**50-75 Curated Resources**
- From Match HS curriculum library
- From Improv Asylum teaching materials
- From friendly schools/collaborators (David Green, Zachary, etc.)
- Organized by: domain, skill level, type (video, worksheet, guide, etc.)
- Each resource: 1-2 sentence summary + skill tags + link

**2 Tool Showcases**
- el-lector-diario featured (Kyle's Spanish reader tool)
- 1 other interactive tool (to be determined)
- Embed tool + explain use case + link to code/docs

**Landing Page**
- Hero: "Become an expert. Here's how."
- 3 featured pathways (with hero images + CTAs)
- Featured tools section
- Email signup CTA: "Join the Viridian waitlist"
- Search/filter for resources

---

### Timeline

| Date | Milestone | Owner |
|------|-----------|-------|
| **Jun 16-18** | Kyle picks expertise pathway topics 2 + 3 | Kyle |
| **Jun 16-19** | Design (wireframes + design system) | Designer (TBD) |
| **Jun 16-20** | Resource curation (50-75 materials from Match/other) | Curator (TBD) |
| **Jun 19-22** | Kyle writes pathway 1 (articles) | Kyle |
| **Jun 19-22** | Reach out to guest contributors for pathways 2+3 | Kyle |
| **Jun 20-23** | Guest contributors write (or Kyle edits drafts) | Guest authors + Kyle |
| **Jun 23-27** | Engineering builds landing page + feed from designs | Engineer (TBD) |
| **Jun 27** | Content review + final edits | Kyle |
| **Jun 28** | QC + testing | Lyra |
| **Jun 28-29** | Staging → production deploy | Engineer |
| **Jun 30** | **LAUNCH** | Viridian |

---

### Roles Needed (Who Does What)

#### **Kyle (30 hours this phase)**
- Pick topics for pathways 2 + 3
- Write pathway 1 articles (~3000 words)
- Edit guest contributor articles
- Review all content before launch
- Curate final 50-75 resources

#### **Designer** (~20 hours)
- Create landing page wireframes (high-fidelity)
- Design resource card component
- Design article template
- Create hero images for 3 pathways
- Integrate with existing Viridian design system
- Deliverable: Figma file + component library
- Deadline: Jun 19 noon (so engineer can build)

#### **Engineer** (~15 hours)
- Build landing page in Next.js (from designer mockup)
- Build article feed/reader
- Build resource library + filters (search by domain, skill level, type)
- Embed tool showcases (el-lector-diario + 1 other)
- Set up email signup
- Deploy to polymath.viridian.io (or similar)
- Deadline: Jun 27 (for QC)

#### **Guest Contributors** (~8 hours total)
- 2 guest authors: 1 article each for pathways 2 + 3 (or Kyle edits their draft)
- Quality: ~1500 words, personal experience + actionable advice
- Deadline: Jun 22
- Examples: improv teacher, musician, language learner, etc.

#### **Resource Curator** (~12 hours)
- Scour Match HS curriculum library
- Collect from Improv Asylum
- Reach out to David Green (dual-language resources)
- Reach out to Zachary English (teaching tech resources)
- Organize into 50-75 curated items with tags + summaries
- Deadline: Jun 20

#### **QC / Verification (Lyra)** (~3 hours)
- Check: All 3 pathways complete + CTAs work
- Check: 50+ resources all valid links
- Check: Tools embed properly
- Check: No broken links, typos, style inconsistencies
- Deadline: Jun 28

---

### Success Metrics (Phase 1)

| Metric | Target | Why |
|--------|--------|-----|
| **Visitors** | 500 | Baseline for awareness |
| **Email signups** | 25 | Conversion from discovery to waitlist |
| **Resource downloads** | 100+ | Signals engagement with library |
| **Tool plays** | 200+ | Shows el-lector-diario gets used |
| **Bounce rate** | <50% | Shows content is engaging |
| **Read-through rate** | >20% | At least 1 in 5 visitors read a full article |

---

## Phase 2: Community Opening (July 7 – July 20)

*(After Phase 1 ships and stabilizes)*

- Community pitch form opens ("Submit your expertise pathway")
- Curator panel formed (3-5 teachers/experts review submissions)
- 2-3 community-submitted expertise pathways (editor-polished)
- Resources API deployed (Viridian students see recommended materials)
- First deep links between Polymath and Viridian
- New role: Community Manager (20 hrs/week, contractor)

**Success metrics:**
- 3+ articles published
- 10+ submissions received
- 50 new signups
- 1-2 schools interested in Viridian

---

## Phase 3: Ecosystem Depth (Aug 1+)

*(After community phase proves viability)*

- Personalization for logged-in users
- Learning paths (5-7 curated journeys)
- Deeper API integration
- Slack/email digests

---

## What We Need Help With Right Now

**For Phase 1 to launch June 30, we need:**

### **1. Designer** (20 hours, deadline Jun 19)
**Needed:** Someone who can:
- Translate "landing page + article feed + resource library" into high-fidelity mockups
- Create component library (resource card, article template, search bar)
- Design for both desktop + mobile
- Integrate with Viridian's existing design system

**Deliverable:** Figma file ready for engineer by Jun 19 noon

**Skill match:** Theia (Viridian's UI/UX designer) OR external designer
**Decision needed:** Is Theia available for this, or do we need someone else?

### **2. Engineer** (15 hours, deadline Jun 27)
**Needed:** Someone who can:
- Build Next.js landing page from designer mockups
- Implement article feed + resource library with filters
- Embed interactive tools (el-lector-diario)
- Set up email signup + Supabase integration
- Deploy to production

**Deliverable:** Fully functional landing page, ready for QC by Jun 27

**Skill match:** Daedalus (Viridian's frontend dev) + Hephaestus (backend, if needed for email/DB)
**Decision needed:** Can Daedalus take this, or is he fully booked on K12 standards interface?

### **3. Guest Contributors** (8 hours total, deadline Jun 22)
**Needed:** 2 people who can:
- Write 1 article each (~1500 words) on a mastery/learning topic
- OR provide draft that Kyle edits
- Personal experience + actionable advice

**Examples of topics:**
- "How I Got Into [Domain]"
- "Teaching [Skill] to Mixed Learners"
- "Building a Community Around [Interest]"
- "My Learning Stack: Tools That Worked"

**Candidates to reach out:**
- David Green (dual-language teaching expertise)
- Zachary English / Zach (AI teaching systems, language learning)
- [Kyle suggests others?]

### **4. Resource Curator** (12 hours, deadline Jun 20)
**Needed:** Someone who can:
- Navigate Match HS curriculum library + tag resources
- Reach out to Improv Asylum for teaching materials
- Collect from David Green (dual-language) + Zachary (tech + teaching)
- Organize 50-75 items with summaries + skill tags

**Skill match:** Clio (Viridian's librarian) OR external curator
**Decision needed:** Can Clio do this + is she available by Jun 20?

---

## What's Already Locked

✅ **Strategy:** Editorial-first confirmed (vs. community-driven or tool-first)  
✅ **Vision:** Three pathways + resources + tools + landing page  
✅ **Phase 1 timeline:** Jun 16-30 launch  
✅ **Success metrics:** 500 visitors, 25 signups, engagement targets  
✅ **Kyle's commitment:** 30 hours this phase, writes pathway 1  

---

## What Needs Decision

1. **Topic selection:** What are pathways 2 + 3? (Kyle to pick)
2. **Designer:** Theia or external? (Kyle to decide)
3. **Engineer:** Daedalus + Hephaestus or external? (Kyle to decide)
4. **Guest authors:** Who to reach out to? (Kyle to decide)
5. **Curator:** Clio or external? (Kyle to decide)

---

## Resources We Have Access To

- **Match HS curriculum library** — Match Charter, Match High School Boston
- **Improv Asylum materials** — Teaching frameworks, exercises
- **David Green's dual-language classroom** — Resources for ELL/MLL
- **Zachary English's materials** — Language learning, teaching tech
- **el-lector-diario source code** — Interactive tool ready to showcase
- **Viridian design system** — Existing components, colors, typography
- **Viridian audience** — Students, teachers who'll test Phase 1

---

## Budget / Effort Summary

| Role | Hours | Cost (if contractor) | Internal? |
|------|-------|----------------------|-----------|
| Kyle | 30 | N/A (founder) | Yes |
| Designer | 20 | $2,000-3,000 | Theia or hire? |
| Engineer | 15 | $1,500-2,000 | Daedalus + Hephaestus or hire? |
| Guest authors | 8 | $800-1,200 (if paid) | David, Zachary, others? |
| Curator | 12 | $1,200-1,600 | Clio or hire? |
| QC / Lyra | 3 | N/A (team member) | Lyra (Viridian) |

**Total effort:** ~88 hours  
**Total budget:** $5,500-7,800 (if hiring contractors; less if using internal team)

---

## Why This Matters

Polymath Magazine transforms Viridian from "internal mastery tracker" to "part of a movement."

It's the permission structure that says:
- **Mastery learning is real.**
- **You can develop expertise.**
- **Here are stories, tools, and resources to get started.**

By August, you'll have:
- 50+ original articles (defensible content moat)
- 200+ curated resources (searchable library)
- 200+ monthly visitors (organic traffic)
- 25+ Viridian signups (conversion)
- Community contributors (social proof)

This becomes the discovery layer that drives real users into the app.

---

## Next Steps

1. **Kyle decides:** Topics for pathways 2 + 3 (by end of today)
2. **Kyle decides:** Who fills each role (Designer, Engineer, Guest authors, Curator)
3. **Viridian briefs:** Each role with clear deliverables + deadlines
4. **Roles start:** Jun 16-17 (tomorrow)
5. **Parallel work:** Designer + Curator + Guest authors work simultaneously
6. **Engineer:** Gets designs Jun 19, builds Jun 19-27
7. **Kyle reviews:** All content ready by Jun 27
8. **QC:** Lyra tests Jun 28
9. **Deploy:** Jun 28-29
10. **Launch:** Jun 30

---

## Questions for Kyle + Team

1. **Designer:** Is Theia available? If not, who else?
2. **Engineer:** Can Daedalus + Hephaestus take this? If not, external contractor?
3. **Guests:** Who specifically should we reach out to for articles?
4. **Curator:** Can Clio handle resource collection by Jun 20?
5. **Topics:** What are the 3 expertise pathways we want to showcase?

---

## Appendix: What el-lector-diario Demonstrates

el-lector-diario is a Spanish reading tool for A2-B1 learners (beginner-intermediate).

**Why it matters for Polymath:**
- Shows "tools aren't just text resources"
- Demonstrates interactive learning in action
- Drives engagement (people play with it, not just read about it)
- Proof point that Viridian ecosystem creates tools, not just content

**For Phase 1:** Feature el-lector-diario as "Tool Showcase #1" with embedded interactive version + 500-word article explaining what it does + why it works.

---

**Status:** Ready to brief team members once Kyle decides roles + topics.

Looking forward to shipping this with you.

— Viridian
