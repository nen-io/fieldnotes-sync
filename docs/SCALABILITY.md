# Scale and overload behavior

Fieldnotes is intentionally bounded so its complete state and protocol can be inspected in one tab. This document describes implemented limits first; later sections are proposals, not deployed capabilities.

## Implemented budgets

| Resource                       | Limit                        | Reason and overload behavior                                                                                       |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Simulated clients              | 2                            | A fixed, understandable concurrent-edit experiment                                                                 |
| Distinct note identities       | 50                           | Includes authority notes, tombstones, outbox-only creations, and drafts; further creation fails without committing |
| Title                          | 80 UTF-16 code units         | Required nonempty trimmed content when saving; draft may temporarily be empty                                      |
| Body                           | 5,000 UTF-16 code units      | Limits editor and comparison rendering; input and domain enforce it                                                |
| Pending outbox                 | 100 per client               | Same-note unsent saves coalesce; uncertain payloads remain immutable; excess enqueue rejects                       |
| Per-note outbox chain          | At most 2                    | One uncertain predecessor plus one queued successor; otherwise one queued or conflicted operation                  |
| Receipts                       | 256 total                    | Never evicted; at capacity new commits remain pending while exact retries still deduplicate                        |
| Ledger descriptions            | Latest 80                    | Display-only history can be truncated independently from receipt authority                                         |
| Serialized envelope            | 2 MiB UTF-8                  | Checked on load and before candidate commit; escaped content can fill it before item limits                        |
| IDs, revisions, event counters | Integers below 1,000,000,000 | Exhaustion and derived-state validation fail atomically with a visible error                                       |

The storage quota may be lower or unavailable. A successful in-memory transition can therefore be followed by a failed browser write; the UI says saving is unavailable and keeps export accessible. There is no automatic eviction to recover storage space.

## Costs at the current bound

Let `N` be notes, `Q` the combined pending operations, `R` receipts, and `S` serialized bytes. Deriving a projection builds a map in `O(N + Q)` plus text references. Each action clones the full model, validates it, and serializes it for the byte check. Browser persistence serializes again. That makes copying and synchronous storage a material cost proportional to `S` even for a keystroke.

Arrays keep the source straightforward at these bounds. Receipt and authority lookup are linear in `R` and `N`. Sync repeatedly locates eligible operations and predecessors; its current array scans can be quadratic in `Q`, in addition to receiver lookups for each operation. Cross-reference validation includes nested scans and same-note grouping and is also quadratic in the small queue bound. Neither path should be described as a high-throughput queue.

Transient memory exceeds 2 MiB: the original state, structured clone, serialized string, UTF-8 byte array, and React-rendered views can coexist. The envelope ceiling bounds input, not total heap usage. A very long body can expand substantially when escaped into a receipt fingerprint and then serialized inside the envelope.

No throughput, latency, heap benchmark, or load-test result is claimed. Unit and browser test durations are validation evidence, not capacity measurements. Measure realistic devices and maximum-size datasets before raising limits.

## What happens when capacity runs out

Receipt saturation is a visible protocol event. A sync may acknowledge earlier work, encounter a new operation it cannot retain a receipt for, log `blocked`, stop sending, and pull the baseline. The blocked operation remains pending. The receipt lookup happens first, so already accepted operations can still receive their original acknowledgement even at capacity.

The byte budget differs: it gates the complete candidate transaction. If any draft, save, sync, or pull would exceed it, none of that candidate commits. The previous model remains valid and reloadable. Export and reset are explicit recovery tools. Reset intentionally replaces all work and receipts; it is never automatic overload handling.

## At 10× the current notebook size

For a proposed 500-note single-device experiment, first move persistence to IndexedDB with explicit transactions and indexed stores. Persist edits/outbox updates incrementally instead of cloning and serializing the entire notebook on every keystroke. Keep draft durability semantics clear: debouncing improves responsiveness but introduces a loss window unless draft writes are separately durable.

Use maps/indexes for note and receipt lookup, maintain per-note queue order, and virtualize large note lists. Move expensive import/validation work to a worker only when measured main-thread latency justifies it. Preserve the full validation contract at the persistence boundary; faster rendering does not permit weaker CAS or receipt semantics.

A worker is a responsiveness tool, not an authority boundary. Browser data remains available to the origin. Multi-tab access needs a single writer or transactional ownership/fencing, and tests for stale writers after tab suspension and recovery.

## At 100× and with real devices

A proposed 5,000-note networked system needs a real authority service and transactional database. Authenticate each device/user, authorize every note operation, and validate bounded request payloads. Allocate collision-resistant operation IDs independently on devices. Commit a note change and its idempotency receipt in one database transaction; return the original receipt on replay, not a current note revision that happens to be newer.

Separate client durable outboxes from the server. Transport requires retry classification, backoff, cancellation, ordering rules, and observable ambiguous outcomes. Pulls should use a bounded change cursor or versioned snapshot rather than transferring all notes, while still layering unacknowledged work and drafts over the new baseline. A cursor must not imply acknowledgement.

Receipt and tombstone retention require an explicit protocol before garbage collection. Options include bounded client replay windows with enforced expiry, durable per-device sequence watermarks, or checkpoints acknowledged by all eligible replicas. Simply retaining the most recent receipts breaks deduplication; simply deleting old tombstones permits stale resurrection. Those mechanisms need failure and offline-duration assumptions that this two-client laboratory intentionally does not invent.

A collaborative text product might justify operational transformation or a CRDT, but those approaches change editing semantics, storage, conflict UX, and metadata growth. They are not a transparent replacement for the current whole-note CAS policy.
