# Fieldnotes design study

## Direction

A warm sage notebook with ink-green text, cream paper, subtle rules and restrained rust conflict markers. The product metaphor is a shared field journal, with two explicitly simulated devices side by side. Both clients and the authority live in this browser; the interface says so near the title and in the protocol panel. No cloud/server connectivity claim.

## Layout

A compact brand bar with reset/export sits above an editorial heading, “Good ideas travel. Your edits should too.” A simulation strip explains local-only execution; derived pending and conflict counts sit above the notebooks, and retained receipts appear with the authority. The main stage contains Laptop and Pocket device panes. Each has an online switch, Sync and Pull actions, a small note picker, a paper-like editor, save/delete controls and clear revision/pending/draft state. Laptop has a forest accent; Pocket has an ochre accent. The shared authority and a chronological bounded sync ledger sit below.

Each notebook is useful: choose a note, draft title/body, save deliberately, add a note, and delete with explicit tombstone semantics. A sample instruction card explains a three-step concurrent edit journey. A “Lose next acknowledgement” control is labelled as a simulation fault, not a normal product feature.

## Primary flow and states

Both panes begin with the same synthetic notes. Toggle both offline, edit/save the same note differently, then reconnect one at a time. The second pane shows base/server/local versions with explicit “Use server” and “Keep my version” choices. Pending work remains visible across pulls and reloads. Tombstones can be inspected; a deleted note can never be silently revived by an old update. Conflict resolution against a tombstone offers keeping the content as a new note with a new ID.

Typing is a separate durable draft. Save queues an operation; offline save coalesces only before transmission. Once sent, its identity/content is immutable and subsequent local edits become a successor. Lost acknowledgements remain pending and retry visibly deduplicates. Invalid/capacity/storage failures preserve the last valid model and provide clear feedback. Empty notebook has a create action. Reset sample explicitly replaces the entire simulation.

## Readability and accessibility

Supporting copy is at least 11px at the default root size; body editor is comfortable 16px. Fixed shell colors maintain contrast. All controls are native and labelled, focus is visible, statuses include words, and conflict versions are plain text in focusable scroll regions. At narrow widths the panes and authority sections stack; controls wrap at 320px and 200% text scaling. Reduced-motion disables transitions; no meaning relies on animation. No external fonts, photos or icons are required.
