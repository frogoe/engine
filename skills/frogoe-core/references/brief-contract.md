# Brief contract

The intent layer (`frogoe` → `references/intent-interview.md`) asks creation questions once. The executing build writes the confirmed result to `BRIEF.md` and does not ask those questions again. This contract defines the canonical BRIEF fields, shared field semantics, and question rules.

## 1. BRIEF fields

| Field     | Meaning                                      | Policy                                                                 |
| --------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `title`   | game name (2-40 chars)                       | Ask once; confirm verbatim.                                            |
| `verb`    | ONE core action: tap, hold, steer, aim       | Ask if not derivable from genre; push back if input soup.              |
| `mood`    | one phrase that drives palette and feel       | Derive from genre/mood words, confirm in one line.                     |
| `palette` | bg/fg/accent hex (+ optional outline, fonts) | Declare from `frogoe-creative` → `palettes.md` or derive from mood.    |
| `fonts`   | display font name                            | Optional; bundler inlines at build.                                    |

`title`, `verb`, `mood`, `palette` are required. `fonts` and `palette.outline` are optional. The HUD layer inherits palette via `--block-*` custom properties. Contrast is measured fg vs outline when present, otherwise fg vs bg (see `packages/lint/src/check.ts:102`).

## 2. Lifecycle

- **Created once, by the build setup, as its first action after `frogoe init`** — never before (`init` scaffolds a living stub BRIEF with TODO markers; the intent layer confirms the real values, the build writes them). `init` refuses a non-empty directory.
- **It is the no-repeat token.** A build that finds `BRIEF.md` reads it and asks no brief question. Its `verb` names the core loop — a build that finds another verb there is a mismatch: surface it, do not re-route through intent.
- **It stays the run's truth.** A mid-run decision updates it as it happens: an explicit change to a frontmatter field ("make the palette darker") rewrites the field. Resume reads this file, so write-back is what makes a dead session resumable.
- **Body prose is project-local.** One paragraph under the frontmatter describes the loop in the user's words — never entered into cross-project memory.

## 3. Question protocol

Follow these invariants (ported from hyperframes `brief-contract.md:92`):

1. Ask only unanswered fields that materially affect the output.
2. Ask one field per message and wait for its answer before asking the next field.
3. Put the recommended option first and attach a short reason. A choice list must answer the same field; creative fields (mood, palette) take an open question with a recommendation.
4. Skip a question when the current request already answers it. Inference alone is not an answer; a chosen pitch is.
5. Announce deferred questions before hand-off; do not surprise the user later.
6. When an autonomous signal ("just build it", "surprise me") appears, ask no remaining preference questions. State the completed brief and the reasons, then build.
7. Before the hand-off summary, run one integration check: look for a consequence the combined answers create that no single answer showed, and surface it with a proposed adjustment.
8. The hand-off summary separates fields the user stated from fields that were inferred or defaulted, with receipts on both.
9. Revision is not confirmation: after any correction to the summary, present the updated summary and confirm before executing.
