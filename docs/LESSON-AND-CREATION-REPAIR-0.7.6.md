# Lesson and creation repair: 0.7.6

## Findings

The audit covered all 77 saved activities and their preparation, including 70 AI-written lessons. Private source content and 172 request receipts are excluded from this repository and release assets.

1. Creation paused automatically after 60 requests. The history contains groups of 60, 60 and 52, with long gaps at the boundaries. This explains repeated “Continue creation” actions. Start timestamps span about six hours; the old receipts lack completion times, so they cannot establish actual provider processing time or explain the user's entire elapsed day.
2. All 77 preparation flows included a generic source walkthrough after teaching. In 75, it included unfinished PDF lines; 46 default reference choices included a running header. A multiple-choice distractor could appear without its question. The coherent AI explanation was being followed by a worse extraction-based detour.
3. Seven legacy relationship models treated cover slogans, reading maps or flattened arrows as factual relationship labels.
4. Hundreds of reference sections obscured the prepared lessons in the main journey. Some future quest instructions appeared beside the current writing task without being identified as a preview.
5. Some AI-generated game instructions called feedback “reviewed” without author approval.
6. Claude's browser sign-in could require a return code, but the app had no continuation input.

## Repair plan and implementation

- Finish the finite source inventory in one creation action, retaining checkpoint saves, cancellation, bounded repair attempts and explicit caller budgets. Provider or storage errors stop clearly without repeating completed stages.
- Pool repeated exact evidence in checking requests while retaining every citation and claim-to-source link. This reduces duplicate text; token and latency savings require provider measurements. Record future request duration separately from pauses and checkpoint saving. Historical timing remains unknown.
- Make prepared AI lessons the main journey; keep complete original material and notes in a source library. Unsupported sections remain available for reading.
- After AI teaching, enter guided practice unless a real worked example or explicit procedure requires a walkthrough. Use generated explanations with exact citations as note references. Keep wrapped source sentences and multiple-choice groups intact.
- Preserve older written notes when preparation changes. Require explicit source selection and comparison before reuse; retain XP and activity history.
- Exclude recognizable, unchanged malformed legacy arrows from play without deleting their source or activity records. Require explicit predicates or bracketed relationship labels. Preserve authored edits and review boundaries.
- Distinguish current preparation from the collapsed preview of future quest controls. Correct narrowly recognized legacy approval claims while preserving quotations and factual subject prose. New AI prompts forbid unsupported human-approval claims.
- Add a masked Claude browser-code field bound to the active, expiring login process. Clear submitted codes and omit them from status output and logs. Support automatic browser return, cancellation and fresh attempts.

## Verification and limits

The private saved-game browser audit traverses every AI lesson using visible controls, checks its teaching and practice references, and enters all 70 quests. It checks zero provider requests and unchanged notebook, source and receipt hashes. This traversal does not claim to solve every quest or establish external factual correctness.

Public regressions cover creation beyond 60 requests, checkpoint resume, timing and unknown usage, lossless evidence pooling, source and note preservation, ambiguous relationships, lesson navigation, real worked-example gates, and session-bound Claude continuation. Broader suites cover evaluators, persisted scores, sound, source downloads, archives and native exported play. Release results must be bound to the exact published source and signed application.

Live account eligibility remains provider-specific; mocked sign-in tests do not establish a live subscription login. Large courses still require time and multiple requests. Exact citations establish provenance, not expert approval or measured learning outcomes.
