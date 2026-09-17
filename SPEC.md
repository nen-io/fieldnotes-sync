# Fieldnotes — Offline synchronization notebook

This document defines the behavior and acceptance criteria. All demonstration data is synthetic. The demo runs without a login or API key.

## Product and visual design
A warm sage notebook with two clearly labelled simulated device panes and a shared synchronization ledger. One local browser hosts both simulated clients and authority. No claim of real multi-device networking. The notebook itself feels useful; visible revisions/pending/conflicts help explain correctness.

## Model and rules
Authority notes {id,title,body,revision,deleted}. Each client has server baseline, local projection and outbox operations {opId,noteId,baseRevision,change}. Plain text only, title<=80/body<=5000 chars, <=50 notes, outbox<=100. Server deduplicates opId. Operation accepted only if baseRevision matches current authoritative note revision; otherwise explicit conflict. Creation base0; each accepted update increments revision. Deletion is a tombstone (not physical removal) so stale edits cannot resurrect notes.

## Required behavior
1. Two independently editable clients can go offline/online. Edit title/body, create/delete notes, see pending badge. Offline edits durable in validated localStorage. No source of truth on merely viewing a pane.
2. Save actions explicitly enqueue; typing is draft until save, with unsaved state. Consecutive pending saves on same note coalesce safely before transmission or correctly rebase queued revisions after acknowledgement.
3. Sync sends queued operations, processes dedup acknowledgements, then pulls authoritative changes and rebases projection without losing unacknowledged edits. Pull must not silently clear outbox. Online toggle can sync automatically; include explicit Sync.
4. Conflict shows base/server/local text and requires choose server or keep my version; keep mine becomes NEW op against current server revision. Choosing server drops only conflicted local operation/draft with clear action. Deletion conflicts handled explicitly.
5. Retry same operation after lost acknowledgement does not duplicate change or revision increment. Provide demonstrable lost-ack scenario control or integration test.
6. Entire simulation state persists atomically in versioned envelope. Corrupt/oversized storage fallback visible. Reset sample explicit. Export notebook JSON (plain data) optional.
7. Clear ledger of events derived from actual operations, bounded length. Do not claim CRDT/automatic merge.

## Acceptance tests
- F1: offline save/reload retains outbox; pull preserves unsent operation.
- F2: concurrent edit yields conflict, explicit choices converge correctly.
- F3: lost-ack retry deduplicates; multiple same-note saves and multi-note queue converge.
- F4: deletion tombstone blocks stale edit resurrection; concurrent create collision rejected.
- F5: no-op read never commits; invalid schema/storage doesn't crash.
- F6 browser: set both offline, edit same note differently, reconnect sequentially, resolve conflict, confirm convergence and reload persistence.
## Documentation
State diagram, authoritative baseline/outbox/projection definitions, revision/dedup protocol, conflict/deletion policy, simulation boundary and detailed demo walkthrough.

## Completion gate
Implement the behavior and acceptance tests above; document any deliberate limitation. `npm run check` and `npm run test:e2e` must pass. Independently review the code and exercise the production build before release. Verify the public demo at its GitHub repository subpath.
