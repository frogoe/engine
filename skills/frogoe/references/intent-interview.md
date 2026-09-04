# The intent layer — one conversation, before any game is built

Fresh creation only — the SKILL.md state table already decides whether this layer runs at all (edits, game operations, briefed and resumable projects never enter it). One conversation at the front door turns "make me a game" into a confirmed brief — the verb, mood, palette, and everything else in the user's head — handed to the build and made durable as `BRIEF.md`. Later steps own execution; this layer owns understanding.

## The four steps

**1 — Memory before questions.** Before asking anything, check if a `BRIEF.md` or `frogoe.json` already exists in the working directory by reading the folder. If `frogoe.json` exists without `BRIEF.md`, that is a pre-BRIEF project — backfill the brief from `brief-format.md` before any code change, do not re-interrogate.

**2 — Triage the input.** What is the game about — a genre, a reference game, a verb, a mood, a palette? And is the request **formed** — the verb, mood, and palette are readable from what the user gave — or **unformed**, a subject with no take on it? A request whose only shape comes from its genre ("make a fun game") is formed about the subject and unformed about the telling, and enters the pitch round. A formed request runs the layer exactly as it always has; nothing below is added for it. An unformed one goes through the pitch round after step 3 and earns one question here before any concept work: what is the user already picturing? Their answer seeds the round. For a genuinely exploratory request ("we need a game but I'm not sure what kind"), establish the verb and mood one question at a time, then close by recommending a palette plus how the run will loop: build → check → eyeball.

**3 — Confirm the must-haves.** One question per field, recommended option first with its receipt (rules: `frogoe-core` → `references/brief-contract.md` §3). Skip a question only when the request already answered it — inference is not an answer, but a chosen pitch is: fields the pitch round settled are locked with the pitch as their receipt. Required fields: `title` (2-40 chars), `verb` (tap|hold|steer|aim), `mood` (one phrase), `palette` (bg/fg/accent hex + optional outline). Then announce any deferred asks in one line ("after I scaffold, I'll offer HUD blocks and audio options") so the user hears the run's full shape before it starts.

**4 — Hand off.** Two disciplines close the conversation (invariants: `frogoe-core` → `references/brief-contract.md` §3):

- **Stated and inferred, apart.** Present the locked brief as one summary — deferred asks included — with what the user answered and what was inferred or defaulted as two visibly separate groups, receipts on both. The inferred group is where corrections live.
- **Revision is not confirmation.** When the user corrects the summary, fold the change in and present it again; never execute an edited-but-unconfirmed brief.

Then scaffold the game (`frogoe init` or manual folder), write `BRIEF.md` as the **first file after init** (never before — `init` refuses a non-empty directory), using the canonical frontmatter from `brief-format.md` and preserving the user's wording in the body when it matters. The build then reads `BRIEF.md` and asks no brief question again.

## BRIEF.md frontmatter — the carry-away artifact

The interview's deliverable. Every later "what did the brief require?" re-reads this file, never this document. One key per confirmed field, canonical normalized values (full shape and body: `frogoe-core` → `references/brief-format.md`):

| Key      | Meaning                                      | Example          |
| -------- | -------------------------------------------- | ---------------- |
| `title`  | the game's name (2-40 chars)                 | `Ember Climb`    |
| `verb`   | the ONE core action: tap, hold, steer, aim   | `hold`           |
| `mood`   | one phrase that drives palette and feel       | `urgent warmth`  |
| `palette`| bg/fg/accent hex (+ optional outline)        | `#1a0f0d`        |
| `fonts`  | optional display font name                   | `Fredoka`        |
