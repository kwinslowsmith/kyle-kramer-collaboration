# KRAMOS Local LLM: Qwen via Ollama

Last updated: 2026-06-15

## What it is

A full language model running entirely on Kramer's Mac. Nothing leaves the machine. The service is Ollama; the model is `qwen2.5:7b-instruct`, a 7.6B-parameter instruction-tuned model at Q4_K_M quantization, 4.7 GB on disk, 32k context window.

Install path: `/opt/homebrew/bin/ollama`
Model: `qwen2.5:7b-instruct`
Verify service is live: `curl -s http://localhost:11434/api/tags`

The service auto-starts. If it ever isn't running: `brew services start ollama`.

## Why it exists

The trigger was student privacy. Real student profiles in the vault carry full names, hometowns, and verbatim personal writing. Sending those to Claude (or any cloud API) is a data-handling problem. The local model runs those jobs offline so that nothing sensitive ever hits a remote server.

But once it was installed, the use cases expanded. Any time a task is bulk extraction, messy-text-to-structured-fields, summarization, or classification, and privacy doesn't matter, the local model is still a reasonable option. It's free, it's fast on Apple Silicon, and it doesn't consume API tokens.

## The student privacy pipeline

The full sequence:

1. Kramer pastes raw student writing (intro posts, readiness audits, habits essays) into `scripts/utilities/intake_profiles.py`.
2. That script sends the text to qwen locally and gets back structured YAML fields (career goals, interests, readiness tier, growth areas, communication style).
3. `scripts/utilities/anonymize_profiles.py` runs a local NER pass and substitutes real names/places with pseudonyms (Student 14, etc.), writing a de-identified mirror at `people/<course-slug>-anon/`.
4. Cloud-touching agents (Claude, the dashboard, any specialist) work only from the anonymized mirror. The real-to-pseudonym key map lives at `~/.kramos-anon-keys/`, local-only, never loaded into context.

Qwen handles step 2. It is good at this: give it a messy paragraph of student writing and ask it to fill out a schema, and it will fill the schema correctly. It does not need to understand the student; it needs to recognize patterns and populate fields.

## Invocation patterns

Interactive:

```bash
ollama run qwen2.5:7b-instruct
```

Programmatic (one-shot, parse `.response`):

```bash
curl -s http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5:7b-instruct","prompt":"your prompt here","stream":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['response'])"
```

Python (used inside the pipeline scripts):

```python
import requests, json

def run_qwen(prompt: str) -> str:
    r = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": "qwen2.5:7b-instruct", "prompt": prompt, "stream": False}
    )
    return r.json()["response"]
```

## Honest capability assessment

Strong at:
- Extraction and structuring (raw text to fields, messy input to schema)
- Summarization and classification
- Anything where the answer is findable in the input, not generated from scratch
- Privacy-sensitive tasks that must stay offline

Weak at:
- Stylistic and voice-aware generation: it knows facts but defaults to bullet lists, outline structure, and corporate register. It does not hold length limits well. It is not a substitute for a frontier model on anything where the writing itself is the product.
- Named entity recognition is handled by a separate local NER tool inside `anonymize_profiles.py`, not by qwen directly. Do not confuse the two.

Rough capability frame: somewhere in the GPT-3 class. Powerful for the right tasks. Not a drop-in replacement for Claude on open-ended generation.

## When Larry routes to it

Larry surfaces the local model proactively when:
- A task touches student data that should not leave the machine
- A task is bulk extraction over many items (schema-filling, summarization at scale)
- Kramer explicitly wants something offline for privacy reasons unrelated to students

Larry does not route to it for:
- Any task where the quality of the writing matters (Cosmo, Claude)
- Anything requiring up-to-date knowledge beyond the model's training
- Complex multi-step reasoning where a frontier model is the right tool

## Context for cross-system sharing

If Viridian or any peer system runs a similar local model, the privacy pipeline pattern above is fully transferable. The core insight is simple: use the local model as a structured extraction layer, not a generation layer. It turns messy human text into clean machine-readable fields. Everything downstream gets cleaner input and no private data ever touches a cloud API.

The model is free to run. The only cost is disk (4.7 GB) and the one-time setup.
