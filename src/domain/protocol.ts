import {
  fingerprint,
  LIMITS,
  ProtocolError,
  type Note,
  type Operation,
  type Receipt,
  type Simulation,
} from './model';
export type ApplyResult =
  | { kind: 'accepted' | 'duplicate'; note: Note; receipt: Receipt }
  | { kind: 'conflict'; server: Note | null; reason: string }
  | { kind: 'blocked'; reason: string };
/** Mutates only an isolated transaction candidate; no I/O or wall-clock dependence. */
export function applyOperation(state: Simulation, op: Operation): ApplyResult {
  const known = state.receipts.find((receipt) => receipt.opId === op.opId);
  if (known) {
    if (known.fingerprint !== fingerprint(op))
      throw new ProtocolError('Operation ID was reused with different content.');
    return {
      kind: 'duplicate',
      receipt: known,
      note: { id: op.noteId, ...op.change, revision: known.revision },
    };
  }
  const current = state.authority.find((note) => note.id === op.noteId) ?? null;
  if (current?.deleted)
    return { kind: 'conflict', server: current, reason: 'The authority has a deletion tombstone.' };
  if ((current?.revision ?? 0) !== op.baseRevision)
    return { kind: 'conflict', server: current, reason: 'The authoritative revision has changed.' };
  if (!current && op.change.deleted)
    return { kind: 'conflict', server: null, reason: 'Cannot delete a note that does not exist.' };
  // Receipts are correctness authority: never evict them to make room for new work.
  if (state.receipts.length >= LIMITS.receipts)
    return {
      kind: 'blocked',
      reason:
        'Receipt capacity reached (256). New operations remain pending. Export and reset to continue; existing receipts are never evicted.',
    };
  if (!current && state.authority.length >= LIMITS.notes)
    return { kind: 'blocked', reason: 'Authority note limit reached, including tombstones (50).' };
  if (op.baseRevision >= 999999999)
    throw new ProtocolError('Revision budget exhausted. Export and reset; pending work retained.');
  const note: Note = { id: op.noteId, ...op.change, revision: op.baseRevision + 1 };
  state.authority = [...state.authority.filter((item) => item.id !== note.id), note];
  const receipt: Receipt = {
    opId: op.opId,
    noteId: note.id,
    revision: note.revision,
    fingerprint: fingerprint(op),
  };
  state.receipts.push(receipt);
  return { kind: 'accepted', note, receipt };
}
