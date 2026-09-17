# Security design

Fieldnotes is a static, single-tab simulation with no account, remote API, credentials, analytics, or third-party assets. Those choices remove server-side authorization and request-processing surfaces from this example. They do not make browser input, localStorage, dependencies, or exported text trustworthy.

## Assets and trust boundaries

The important assets are the user's in-tab draft text, saved envelope, pending operations, authoritative revisions, and retained deduplication receipts. Availability matters too: a malformed envelope must not crash the interface or allocate unbounded collections.

The DOM controls and localStorage are separate boundaries. TypeScript constrains developer calls but cannot validate stored JSON. Storage is treated as untrusted on load. A candidate model also crosses a contract boundary before every committed action, preventing arithmetic or cross-reference errors from creating a state that cannot subsequently reload.

An attacker may supply hostile-looking note strings through paste, modify storage through developer tools or another same-origin script, or provide malformed and oversized persisted JSON. A browser extension, compromised origin, or someone with profile access can read and replace the full plaintext notebook. This client-only example cannot authenticate data against such an attacker.

## Threats, implemented mitigations, and evidence

| Threat                                                       | Implemented control                                                                                                                                                        | Matching evidence                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| HTML/script injection through title or body                  | React renders strings as text; no HTML parser, `dangerouslySetInnerHTML`, markdown execution, or dynamic evaluation                                                        | Browser journey commits, reloads, and exports HTML-like strings; no injected image or marker execution                            |
| Storage schema confusion or prototype-shaped data            | Exact plain-object keys, strict primitive enum types, bounded arrays, safe integer ranges, unique IDs, and explicit version                                                | Unit rejection tests for malformed JSON, unknown fields/version, array/object enum values, and identity counter mismatch          |
| Fabricated cross-reference causing state loss on next reload | Baseline/authority revision checks, equal-revision content equality, receipt identity checks, per-note chain rules, selected-note existence, predecessor-aware draft bases | Ghost-note regression, mixed-action round-trip probe, successor and draft tests                                                   |
| Unbounded memory, receipts, or text                          | 50 note identities, 100 outbox entries per client, 256 receipts, 80 visible events, bounded strings, 2 MiB serialized envelope                                             | Note/text, receipt saturation, oversized input, and byte-overflow atomicity tests                                                 |
| Duplicate commit after uncertain delivery                    | Immutable fingerprint after transmission; existing receipt checked before CAS/capacity; changed-payload replay rejected                                                    | Lost-ACK/reload/retry tests and changed-operation replay rejection                                                                |
| Silent lost update or deleted-note resurrection              | Revision CAS, explicit conflict choices, tombstones, new identity for recovered content                                                                                    | Concurrent edit, intervening-write, and deletion recovery tests                                                                   |
| Counter overflow produces unreloadable state                 | Exhaustion guards plus the same complete validator at transition and restore boundaries                                                                                    | Restored near-boundary ID/log/revision and derived-draft tests                                                                    |
| Quota, private browsing policy, or denied storage            | Guarded reads/writes, visible safe-sample recovery or unsaved warning, plain JSON export                                                                                   | Denied/corrupt storage unit and browser journeys                                                                                  |
| Unexpected executable or outbound resources in production    | Build-only restrictive CSP; no runtime network code, remote fonts, or analytics                                                                                            | All nine browser journeys repeated against the built app; CSP presence, no external requests, and no console/page errors verified |

## Production browser policy

`vite.config.ts` inserts a CSP meta element at the start of the production document head:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'
```

Only same-origin built scripts and styles are needed. No inline script, `eval`, data HTML, remote connections, or form submission is required. The JSON download is a locally created Blob with a fixed filename, not a request to a receiver. Development omits this policy because Vite's module loading, injected styles, and HMR WebSocket need additional capabilities; development behavior is not evidence for the production policy.

A meta policy cannot provide every response-header protection. In particular, `frame-ancestors` requires an HTTP header; this app does not claim clickjacking protection from its meta CSP. A deployment with configurable headers should set an equivalent response-header CSP and appropriate framing policy. GitHub Pages hosting is a static delivery choice, not a security isolation boundary between repositories sharing an origin.

## Remaining risks

- localStorage is plaintext, origin-scoped, and accessible to other same-origin JavaScript. A repository URL path does not provide storage isolation. Never use this public demo as a private or sensitive notebook.
- Structural validation rejects inconsistent snapshots but cannot prove authenticity or historical truth. An origin owner can fabricate a consistent authority, receipt, and history together.
- Only one active tab is supported. Two tabs have independent in-memory models and can overwrite the same persisted key. There is no lock, fencing token, or storage-event reconciliation.
- A React state update precedes the persistence effect. Closing/crashing before a successful write can lose recent in-memory work; a single `setItem` is not a disk flush guarantee.
- Invalid saved data is replaced with the visible safe sample after startup persistence. The app does not repair or preserve an arbitrary corrupt raw envelope.
- The lost-ACK control models a specific logical boundary inside one local action. It is not proof of crash-safe distributed transactions, reliable transport, production idempotency storage, or exactly-once effects outside this simulation.
- The application has no import UI, arbitrary URL input, server endpoint, or remote execution. Adding any of them changes the threat model and requires new validation and tests.
- A dependency or hosting compromise can serve a malicious application. Exact versions and a lockfile aid reproducibility; they do not certify dependencies as vulnerability-free.

## Reporting

For sensitive findings, use the repository's private vulnerability reporting if enabled. Otherwise contact the repository owner through their public GitHub profile to arrange a private channel. Do not publish credentials, private notebook exports, or live exploit data in a public issue. Include a minimal synthetic reproduction, affected version, expected invariant, and observed behavior.
