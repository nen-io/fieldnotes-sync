# Architecture decisions

## ADR 001 — Pure domain transitions behind React

**Context.** Synchronization rules need to remain inspectable and testable independently of rendering. Multiple UI controls can affect the same client outbox and authority, so scattered component state would make invariants hard to enforce.

**Alternatives.** Keep all state in editor components; use a general-purpose global state library; or use a typed domain reducer with a small browser adapter.

**Decision.** Use React for the interface and a pure transaction function for the model. Clone the prior model, apply an action, validate the candidate against the exact restore contract and byte budget, and commit only on success. The receiver policy is a separate module from client orchestration.

**Consequences.** The original state survives any rejected action, tests can reproduce a transition without a browser, and derived revisions cannot accidentally escape the stored schema. Cloning and validating on every keystroke costs more than fine-grained mutation; fixed bounds make that tradeoff acceptable for this demo.

**Revisit when.** Measured maximum-size edit latency becomes noticeable or a transactional data store replaces whole-model persistence. Preserve atomic domain invariants while changing the implementation.

## ADR 002 — One envelope for a single-tab simulation

**Context.** A portfolio visitor should immediately demonstrate conflicts and lost acknowledgements without registering, running a service, or owning two devices. Authority and receipt updates must not be persisted independently from client state in this example.

**Alternatives.** A backend and multiple browser clients; IndexedDB stores; separate localStorage keys per device; or one versioned JSON envelope.

**Decision.** Host both clients and authority in the same tab and write one bounded localStorage value. Persist unsaved drafts as well as saved operations. Label the simulation at the top of the page and in the authority panel.

**Consequences.** Reload journeys are easy to demonstrate, and no multi-key partially saved state exists. This does not provide real distributed atomicity, multi-tab coordination, filesystem durability, background delivery, or a guarantee that a write effect ran before a crash. Whole-envelope work remains synchronous.

**Revisit when.** Real devices, significant storage volume, or concurrent tabs become requirements. Introduce a real authority and transactional client persistence with explicit migration and failure tests.

## ADR 003 — Revision CAS and explicit conflict decisions

**Context.** The educational value is seeing how unseen edits are protected. Whole-note automatic merging would obscure which version the user accepted; last-write-wins would hide data loss.

**Alternatives.** Timestamp ordering, last-write-wins replacement, automatic text merging, CRDTs, or revision compare-and-swap with explicit choices.

**Decision.** An operation carries the revision and snapshot it was based on. Only an exact revision match accepts a new change. A conflict shows base, authority, and latest local text. Keep mine allocates a new operation against the authority revision currently visible at the decision. Use server drops only that note's pending work and draft.

**Consequences.** Conflicts interrupt editing intentionally and can recur if the other client changes again before the new operation syncs. No text is silently merged. Drafts preserve their old base through pulls so a user cannot accidentally authorize unseen content merely by refreshing.

**Revisit when.** Product requirements call for simultaneous text collaboration. Evaluate merge semantics and metadata growth as a product decision, not a cosmetic queue change.

## ADR 004 — Immutable uncertain operations and bounded durable receipts

**Context.** A receiver can commit before its acknowledgement reaches the client. The client cannot safely modify that operation's payload or infer acknowledgement from a later read.

**Alternatives.** Always allocate a new operation when retrying; clear an outbox if pulled text matches; overwrite pending payloads after every save; or retain immutable transmitted identities and receipts.

**Decision.** Never-transmitted saves coalesce. Once an operation is uncertain, it stays immutable and later saves form a queued successor. The receiver checks the receipt before CAS or capacity, verifies the full fingerprint, and returns the original accepted revision. Keep all receipts up to 256; fail closed for new commits at capacity.

**Consequences.** Exact retry does not add a revision. Successors cannot skip an uncertain predecessor and cannot rebase over a different device's intervening write. Payload fingerprints duplicate some text and consume the envelope budget. The demo eventually needs an explicit export/reset; it never silently deletes correctness authority.

**Revisit when.** A real retention policy with replay windows, client sequence checkpoints, and recovery guarantees is specified and tested. An LRU cache is not a substitute for idempotency authority.

## ADR 005 — Tombstones preserve deleted identity

**Context.** An offline client can hold an edit to a note another device deleted. Physically removing that identity makes a stale create/update ambiguous.

**Alternatives.** Hard delete; revive the same identity on keep-mine; automatically prefer deletion; or keep a tombstone and recover content as a distinct note.

**Decision.** Accepted deletion increments the revision and leaves a tombstone. Future updates to that identity conflict. Keeping active local content creates a new note ID. A never-transmitted local creation may be cancelled without contacting authority.

**Consequences.** A recovered note is clearly a new object. Tombstones count toward the 50-note budget and do not disappear automatically. Deleted content remains in plaintext within the simulation and is not a secure-erasure feature.

**Revisit when.** A real service defines replica expiry and acknowledged tombstone garbage collection, or privacy requirements require separately designed retention and deletion semantics.

## ADR 006 — Small static attack surface with explicit trust limits

**Context.** A public example should run without sending visitor text to third parties. Stored JSON and pasted text still cross untrusted boundaries even without a backend.

**Alternatives.** Rich HTML/markdown, arbitrary remote imports, external fonts/assets, a hosted synchronization API, or a plain-text static app with no runtime connections.

**Decision.** Render user strings only through React text/controlled fields. Validate exact envelope shapes and cross-references; enforce string, collection, and byte bounds. Export plain JSON with a fixed filename. A build-only CSP permits required same-origin scripts/styles and denies connections, objects, base changes, and forms.

**Consequences.** The demo has no server auth or remote API to secure, but origin scripts can still read plaintext storage and fabricate consistent state. Development HMR has a different browser policy. Meta CSP cannot supply header-only framing controls. Dependency pinning and tests are evidence, not a complete security audit.

**Revisit when.** Adding imports, rich content, telemetry, a service worker, cross-origin assets, or an API. Update the threat model and test the actual production delivery policy before release.

## ADR 007 — An index of local work and explicit editor focus

**Context.** A pending counter did not identify which note needed attention, and the select menu did not distinguish queued, uncertain, and conflicted work. Creating a page left focus on the New button, preventing immediate typing into the new page.

**Alternatives.** Add status text to long native select options; automatically switch to any conflicted note; or provide a separate derived work index and deliberate focus handoffs.

**Decision.** Render a bounded Local work tray from each client's existing outbox and drafts. Rows navigate through the existing `select` action. The model and persistence schema remain unchanged. New-page creation selects/focuses its title, explicit conflict choices return focus to a usable field, and a scoped Ctrl/Command+S handler dispatches the existing save action.

**Consequences.** Hidden drafts and conflicts become directly inspectable without mutating authority. Unknown acknowledgements are labelled separately from never-transmitted operations. Focus requests are one-shot UI effects and do not remount inputs. A tall queue scrolls within a labelled, focusable region. Shortcuts are scoped to the device pane and still use all domain validation and transaction bounds.

**Revisit when.** More client panes, hundreds of notes, or a real navigation router justify a dedicated task list. Preserve the distinction between navigation, save, transmission, and acknowledgement.
