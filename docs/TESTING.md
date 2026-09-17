# Verification

Run with Node.js 24.19.0 and the exact dependency lockfile:

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:e2e
npm run test:e2e:production
```

`check` performs strict TypeScript validation, Vitest domain tests, and a production build. `test:e2e` uses the loopback development server on port 4307. `test:e2e:production` first builds, then starts a fresh Vite preview on port 5307 and exercises the same browser journeys with the production CSP. Browser tests run in isolated Chromium contexts with one worker. The last screenshot run overwrites the committed example captures.

## Invariant tests

`tests/protocol.test.ts` contains 19 tests mapped to the acceptance contract:

| Contract                                       | Evidence                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1: offline durability, pull preserves pending | Save/draft reload, pull without acknowledgement, original draft base retained across a newer baseline                                                                                      |
| F2: explicit conflicts and convergence         | Keep mine creates a new operation; use server affects only that note; latest unsaved text survives a conflict decision                                                                     |
| F3: coalescing, replay, and queue ordering     | Never-transmitted save coalescing, multiple notes, lost ACK followed by reload/successor, changed-payload replay rejection, intervening remote edit remains a conflict                     |
| F4: deletion and creation                      | Tombstone recovery under a new identity; create collision; cancellation of an unsent creation; queued-creation draft restore                                                               |
| F5: read-only view and validated persistence   | Projection purity, selection does not commit, corrupt/denied storage, unknown fields/version, oversized data, forged equal revisions, dangling operation, unsafe ID counter                |
| Bounds and atomicity                           | 50-note and text limits, 256-receipt saturation without eviction, retained pending work at capacity, UTF-8 byte ceiling rollback, near-boundary counters/revisions and derived draft bases |
| Schema exactness                               | Array/object enum values rejected; no implicit string coercion                                                                                                                             |
| Transition/restore closure                     | A deterministic 1,000-action mixed-client sequence round-trips every retained model through JSON and the strict restore parser; rejected actions keep the prior model                      |

The protocol suite exercises the receiver directly and through actual action orchestration. No HTTP integration test is claimed: there is no HTTP synchronization service in this application.

## Browser journeys

`tests/e2e/notebook.spec.ts` contains nine journeys:

1. Both clients offline, different saved text, reload, sequential reconnect, pull with pending text retained, conflict comparison, keep mine, convergence, and reload.
2. Authority commit with lost ACK, reload, multiple successor saves, exact replay, correct final revision, and empty outbox.
3. Deletion tombstone, stale edit conflict, keep as new copy, and persisted distinct identity.
4. Unsaved draft across pull/reload, original base visible, subsequent conflict, and explicit server choice.
5. Invalid empty title retains draft; HTML-like title/body commit, reload, render as inert text, and export as plain JSON.
6. Corrupt saved JSON and blocked browser storage show recovery/warnings while editing remains available.
7. Keyboard skip navigation, focusable ledger, and 200% text at widths 1440, 720, 390, and 320 without document overflow or missing actions.
8. Actual populated conflict screenshots at desktop and mobile sizes with no uncaught page errors.
9. Production policy presence, local save/sync behavior, no external resource requests, and no console/page errors; development explicitly omits the production-only policy.

## Recorded results

Executed on 17 September 2026 after the final source formatting pass:

| Check                                                        | Actual result                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `npm run check`                                              | Passed: strict TypeScript, 19 Vitest tests, and production build                  |
| `npm run test:e2e`                                           | Passed: 9 Chromium journeys against the development server                        |
| `npm run test:e2e:production`                                | Passed: a fresh production build plus all 9 Chromium journeys with CSP active     |
| Prettier check over source/tests/configuration/docs/fixtures | Passed                                                                            |
| Desktop and mobile screenshots                               | Captured from the production build's real conflict state, then visually inspected |

The implementation review additionally exercised browser conflict, lost-ACK, deletion, and reload paths and sampled thousands of deterministic transitions through the restore parser. These were independent spot checks; the committed 1,000-action test provides a reproducible transition/restore probe. Screenshots are generated by the browser suite, not mocked or composited.

An independent automated axe check of the initial and populated views is a release review input. It does not constitute accessibility certification or replace screen-reader, keyboard, device, or visual review. Supporting text is at least 11 CSS pixels at the default root size, controls have visible focus, and reduced-motion styling disables transitions.

## Independent release review

The final independent release review found zero axe WCAG 2/2.1 AA violations in both the initial notebook and a populated conflict view after contrast corrections. A separate repository-subpath production check exercised lost-acknowledgement retry, unchanged revision on replay, convergence after pull, reload, and the actual JSON download with CSP active. CI runs both development and production browser suites.

## What is not established

- Chromium automation does not establish Safari/Firefox behavior, iOS text scaling, VoiceOver/NVDA usability, or real mobile keyboard ergonomics.
- Simulated offline flags do not test an actual unreliable network, reconnection transport, server crash, multi-process database, or browser disk-flush behavior.
- The tests do not claim production multi-tab synchronization, authenticated storage, secure deletion, automatic merge, or exactly-once remote side effects.
- Unit execution times and production bundle sizes are not load tests or throughput benchmarks.
- The production CSP test verifies actual behavior in the built app; framing headers and public-host delivery still require deployment review.
