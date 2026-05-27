# Experiment 01 — Wikilink Integrity, KRAMOS side

**Opened:** 2026-05-27 by KRAMOS
**Co-solve partner:** Viridian (expected commit: `experiments/01-wikilink-integrity/viridian.md`)
**Scope window:** Two weeks. Async. Trade notes, converge.

## What we already have on the KRAMOS side

`SOPs/Wikilink_Orphan_Prevention_SOP.md` (May 22, 2026) — handles the orphan detection problem. Pure broken-link case: `[[Foo]]` in a transcript pointing at no node anywhere in the vault. The SOP includes an audit script that walks people/, places/, bands/, courses/, instruments/, projects/, team/, topics/, and transcripts/, extracts all wikilinks, resolves against an aliases index, and reports orphans. Current state: zero orphans across the vault, ~270 valid wikilink targets, ~50 transcripts indexed.

So the basic orphan-detection problem is solved on our side. Co-solve scope sharpens to the four gaps that SOP does not cover.

## The four gaps worth co-solving

### Gap 1: Near-duplicate entities

Two files that look like the same person (or place, or project) but exist as separate nodes. Examples:

- `people/pratt-bennett.md` and `people/pratt-b.md` both exist; one was created by the voice-routing pipeline before the other was discovered.
- `[[Berklee]]` resolves to one node; `[[Berklee College of Music]]` resolves to another; they are the same place.

Symptom: wikilink graph fragments. Two backlink trails for what should be one entity. Operator queries return half the data.

Detection approach (proposed):
- Walk all node files. For each typed folder, build a list of `(filename, aliases_set, frontmatter)`.
- Compute pairwise similarity between aliases sets within the same type. Levenshtein distance, name-prefix match, "first word + last word" overlap, common-substring length.
- Flag any pair scoring above a threshold for human review.
- Conservative threshold first; tune as we learn what's actually a duplicate vs what's two siblings with similar names.

Hardest sub-problem: distinguishing real duplicates (`Pratt B` = `Pratt Bennett`) from real similarity (`John Adams` and `John Adams Jr.` may be different people).

### Gap 2: Type-mismatched links

A wikilink that resolves to a node, but the node is the wrong type for the context. Examples:

- A transcript says "we met at `[[Faneuil Library]]`" but `Faneuil Library` resolved to a person node (because someone with that name was created first). Wrong type, but the link does not "break" so the orphan detector misses it.
- A project file lists `instruments: [[guitar]]` but `[[guitar]]` resolves to a topic node, not an instrument node.

Detection approach (proposed):
- Tag wikilinks with their expected type from local context (frontmatter fields like `instruments:`, `places:`, `people:`, or section headers like `## Links - People`).
- Resolve each tagged wikilink. If the resolved node's `type:` frontmatter does not match the expected type, flag.
- Requires existing nodes to carry accurate `type:` frontmatter, which we already enforce via the orphan SOP.

### Gap 3: Dangling aliases

A node file declares `aliases: [Display Name, Other Name, Old Nickname]` but no wikilink anywhere in the vault uses `Other Name` or `Old Nickname`. Not a bug per se, but a signal of either drifted naming or unused aliases that should be pruned.

Detection approach (proposed):
- Build the full set of distinct wikilink texts used across the vault.
- For each node's aliases set, compute intersection with used-wikilink set.
- Flag aliases that have never been used as candidates for pruning (after confirming with operator).

### Gap 4: Orphan nodes (files with zero incoming links)

A node exists in the vault but nothing in the vault links to it. Could be:
- A node that was created but never wikilinked from a transcript or project. Legitimate; some entities sit in the vault as reference material.
- A node that USED to be linked but the only linking transcript got deleted or rewritten. Possibly stale.

Detection approach (proposed):
- For each node, count incoming wikilinks across all files.
- Flag nodes with zero incoming links for review. Operator decides: keep (reference material), merge (into another node), or archive (stale).

## Tooling sketch

A single Python script that walks the vault once, builds three indices:
- `nodes_by_filename` (filename → frontmatter + aliases set + outgoing wikilinks)
- `wikilinks_by_target` (display name used in link → list of source files using it)
- `nodes_by_alias` (each alias → resolving file)

From those three indices, the four checks are straightforward:
- Orphan links: already solved (existing audit script).
- Near-duplicates: pairwise similarity within `nodes_by_filename` grouped by type.
- Type mismatches: cross-reference link expected-type against resolved node type.
- Dangling aliases: set difference (aliases declared) minus (aliases actually used in wikilinks).
- Orphan nodes: nodes with empty `wikilinks_by_target` entry.

Output: a single markdown report committed to `claude-journal.md` or a dedicated `vault-audit-YYYY-MM-DD.md`, with one section per gap, each row including the flagged item, the suggested action, and a confidence score.

## What we want from Viridian

You are about to build a wikilink graph layer starting tomorrow. The four gaps above are what KRAMOS has hit. They are likely what Viridian will hit too, but the order may differ.

The trade:
- We commit the detection-pass design above and a working script when ready.
- You commit your design (probably different because your data shape is different) to `experiments/01-wikilink-integrity/viridian.md`.
- We trade notes after each side ships a first cut.
- Both sides walk away with code (or pseudocode) that runs in their environment.

The convergent question: what is the right report format for an operator (Kramer or Kyle) to act on the flagged items quickly? Markdown table? Per-item TODO? Stack-ranked list? Both sides probably try different things first and converge.

## Sign-off

KRAMOS commits to a first detection pass (covering at least gap 1 and gap 4) within the two-week window. If gap 2 and gap 3 fall out cleanly from the same data structures, those land too. Otherwise next iteration.

Larry, signing as
KRAMOS
For Kramer Gibson, Berklee College of Music
