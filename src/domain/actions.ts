import {
  displayedNotes,
  LIMITS,
  projection,
  ProtocolError,
  sample,
  validateText,
  type Change,
  type ClientId,
  type LedgerEntry,
  type Note,
  type Simulation,
} from './model';
import { applyOperation } from './protocol';
import { validateSimulation } from './validation';
export type Action =
  | { type: 'select'; client: ClientId; noteId: string }
  | { type: 'draft'; client: ClientId; noteId: string; title: string; body: string }
  | { type: 'save' | 'delete' | 'discard'; client: ClientId; noteId: string }
  | { type: 'new' | 'sync' | 'pull' | 'toggle' | 'loseAck'; client: ClientId }
  | { type: 'resolve'; client: ClientId; noteId: string; choice: 'server' | 'mine' }
  | { type: 'reset' };
export interface Editor {
  simulation: Simulation;
  message: string;
  error: string;
}
export function log(
  state: Simulation,
  client: ClientId | 'authority',
  kind: LedgerEntry['kind'],
  detail: string,
) {
  if (state.nextLog >= 999999999)
    throw new ProtocolError('Event sequence exhausted; export and reset.');
  state.ledger.push({ sequence: state.nextLog++, client, kind, detail });
  state.ledger = state.ledger.slice(-LIMITS.ledger);
}
function id(state: Simulation, prefix: string): string {
  if (state.nextId >= 999999999) throw new ProtocolError('ID budget exhausted; export and reset.');
  return `${prefix}-${state.nextId++}`;
}
function countKnown(state: Simulation): number {
  return new Set([
    ...state.authority.map((note) => note.id),
    ...Object.values(state.clients).flatMap((client) => [
      ...client.baseline.map((n) => n.id),
      ...client.outbox.map((o) => o.noteId),
      ...client.drafts.map((d) => d.noteId),
    ]),
  ]).size;
}
function enqueue(
  state: Simulation,
  clientId: ClientId,
  noteId: string,
  change: Change,
  draftBase?: Note | null,
) {
  const client = state.clients[clientId];
  if (client.outbox.some((op) => op.noteId === noteId && op.status === 'conflict'))
    throw new ProtocolError('Resolve this note’s conflict before saving another edit.');
  const pending = client.outbox.filter((op) => op.noteId === noteId);
  const tail = pending.at(-1);
  if (tail?.status === 'queued') {
    tail.change = change; // Safe only before this operation has ever crossed the simulated transport.
    log(state, clientId, 'saved', `${noteId}: coalesced unsent save into ${tail.opId}.`);
  } else {
    if (client.outbox.length >= LIMITS.outbox)
      throw new ProtocolError('Outbox limit reached (100); synchronize pending work first.');
    const base = tail
      ? { id: noteId, ...tail.change, revision: tail.baseRevision + 1 }
      : draftBase !== undefined
        ? draftBase
        : (client.baseline.find((note) => note.id === noteId) ?? null);
    client.outbox.push({
      opId: id(state, 'op'),
      noteId,
      baseRevision: base?.revision ?? 0,
      base,
      change,
      status: 'queued',
    });
    log(
      state,
      clientId,
      'saved',
      `${noteId}: queued ${client.outbox.at(-1)!.opId} against revision ${base?.revision ?? 0}.`,
    );
  }
  client.drafts = client.drafts.filter((draft) => draft.noteId !== noteId);
}
function sync(state: Simulation, clientId: ClientId) {
  const client = state.clients[clientId];
  if (!client.online) throw new ProtocolError('This device is offline. Reconnect before syncing.');
  const processed = new Set<string>();
  while (true) {
    const op = client.outbox.find(
      (item, index) =>
        !processed.has(item.opId) &&
        item.status !== 'conflict' &&
        !client.outbox.slice(0, index).some((previous) => previous.noteId === item.noteId),
    );
    if (!op) break;
    processed.add(op.opId);
    const result = applyOperation(state, op);
    if (result.kind === 'blocked') {
      log(state, clientId, 'blocked', result.reason);
      break;
    }
    if (result.kind === 'conflict') {
      op.status = 'conflict';
      log(state, clientId, 'conflict', `${op.noteId}: ${result.reason} Local content retained.`);
      continue;
    }
    if (client.loseNextAck) {
      client.loseNextAck = false;
      op.status = 'uncertain';
      log(
        state,
        clientId,
        'lost',
        `${op.opId}: authority committed revision ${result.receipt.revision}; acknowledgement dropped. Outbox retained.`,
      );
      break;
    }
    client.outbox = client.outbox.filter((item) => item.opId !== op.opId);
    // Successors depend on this exact accepted revision, not a newer unrelated server edit.
    let base: Note = result.note;
    for (const successor of client.outbox.filter((item) => item.noteId === op.noteId)) {
      if (successor.status !== 'queued')
        throw new ProtocolError('Invalid successor transmission order.');
      successor.base = base;
      successor.baseRevision = base.revision;
      base = { id: op.noteId, ...successor.change, revision: base.revision + 1 };
    }
    log(
      state,
      clientId,
      result.kind === 'duplicate' ? 'deduplicated' : 'accepted',
      `${op.opId}: ${result.kind === 'duplicate' ? 'original acknowledgement reused' : 'accepted'} at revision ${result.receipt.revision}.`,
    );
  }
  client.baseline = structuredClone(state.authority);
  log(
    state,
    clientId,
    'pulled',
    `Pulled ${state.authority.length} authority records; ${client.outbox.length} unacknowledged operations preserved.`,
  );
}
export function transition(original: Simulation, action: Action): Simulation {
  if (action.type === 'reset') return sample();
  const state = structuredClone(original);
  const client = state.clients[action.client];
  switch (action.type) {
    case 'select':
      if (!displayedNotes(client).some((note) => note.id === action.noteId))
        throw new ProtocolError('Unknown note.');
      client.selected = action.noteId;
      break;
    case 'draft': {
      if (action.title.length > LIMITS.title || action.body.length > LIMITS.body)
        throw new ProtocolError('Title or body exceeds its limit.');
      const note = displayedNotes(client).find((item) => item.id === action.noteId);
      if (
        !note ||
        note.deleted ||
        client.outbox.some((op) => op.noteId === note.id && op.status === 'conflict')
      )
        throw new ProtocolError(
          'This note cannot be edited until its conflict or deletion is resolved.',
        );
      const previousDraft = client.drafts.find((item) => item.noteId === action.noteId);
      const pending = client.outbox.filter((op) => op.noteId === action.noteId).at(-1);
      const origin = pending
        ? { id: pending.noteId, ...pending.change, revision: pending.baseRevision + 1 }
        : (client.baseline.find((item) => item.id === action.noteId) ?? null);
      const draft = {
        noteId: action.noteId,
        title: action.title,
        body: action.body,
        base: previousDraft ? previousDraft.base : origin,
      };
      const projected = projection(client).find((item) => item.id === action.noteId);
      client.drafts = client.drafts.filter((item) => item.noteId !== action.noteId);
      if (!projected || projected.title !== draft.title || projected.body !== draft.body)
        client.drafts.push(draft);
      break;
    }
    case 'new': {
      if (countKnown(state) >= LIMITS.notes)
        throw new ProtocolError('Note limit reached (50), including drafts and tombstones.');
      const noteId = id(state, 'note');
      client.drafts.push({ noteId, title: 'Untitled note', body: '', base: null });
      client.selected = noteId;
      break;
    }
    case 'discard':
      client.drafts = client.drafts.filter((draft) => draft.noteId !== action.noteId);
      if (!displayedNotes(client).some((note) => note.id === client.selected))
        client.selected = displayedNotes(client)[0]?.id ?? null;
      break;
    case 'save': {
      const draft = client.drafts.find((item) => item.noteId === action.noteId);
      if (!draft) break;
      validateText(draft.title, draft.body);
      enqueue(
        state,
        action.client,
        action.noteId,
        { title: draft.title, body: draft.body, deleted: false },
        draft.base,
      );
      break;
    }
    case 'delete': {
      const note = projection(client).find((item) => item.id === action.noteId);
      if (!note || note.deleted)
        throw new ProtocolError('Only a saved, active note can be deleted.');
      if (client.drafts.some((draft) => draft.noteId === note.id))
        throw new ProtocolError('Save or discard the unsaved draft before deleting.');
      const first = client.outbox.find((op) => op.noteId === note.id);
      if (first?.baseRevision === 0 && first.status === 'queued') {
        client.outbox = client.outbox.filter((op) => op.noteId !== note.id);
        client.selected = displayedNotes(client)[0]?.id ?? null;
        log(
          state,
          action.client,
          'resolved',
          `${note.id}: cancelled an unsent creation; authority was untouched.`,
        );
      } else
        enqueue(state, action.client, note.id, {
          title: note.title,
          body: note.body,
          deleted: true,
        });
      break;
    }
    case 'toggle':
      client.online = !client.online;
      log(
        state,
        action.client,
        'connection',
        `Device ${client.online ? 'reconnected; Sync sends pending work' : 'went offline; drafts and outbox stay local'}.`,
      );
      break;
    case 'loseAck':
      client.loseNextAck = !client.loseNextAck;
      break;
    case 'sync':
      sync(state, action.client);
      break;
    case 'pull':
      if (!client.online) throw new ProtocolError('Reconnect before pulling.');
      client.baseline = structuredClone(state.authority);
      log(
        state,
        action.client,
        'pulled',
        `Read authority; kept ${client.outbox.length} pending operations and ${client.drafts.length} drafts.`,
      );
      break;
    case 'resolve': {
      const conflicted = client.outbox.find(
        (op) => op.noteId === action.noteId && op.status === 'conflict',
      );
      if (!conflicted) throw new ProtocolError('No conflict to resolve.');
      const localDraft = client.drafts.find((draft) => draft.noteId === action.noteId);
      const local = localDraft
        ? { title: localDraft.title, body: localDraft.body, deleted: false }
        : client.outbox.filter((op) => op.noteId === action.noteId).at(-1)!.change;
      if (action.choice === 'mine') validateText(local.title, local.body);
      const server = state.authority.find((note) => note.id === action.noteId) ?? null;
      client.outbox = client.outbox.filter((op) => op.noteId !== action.noteId);
      client.drafts = client.drafts.filter((draft) => draft.noteId !== action.noteId);
      client.baseline = [
        ...client.baseline.filter((note) => note.id !== action.noteId),
        ...(server ? [structuredClone(server)] : []),
      ];
      if (action.choice === 'mine' && !(server?.deleted && local.deleted)) {
        let target = action.noteId;
        if (server?.deleted) {
          if (countKnown(state) >= LIMITS.notes)
            throw new ProtocolError('No room to keep a new copy (50-note limit).');
          target = id(state, 'note');
          client.selected = target;
        }
        enqueue(state, action.client, target, local);
      }
      if (!displayedNotes(client).some((note) => note.id === client.selected))
        client.selected = displayedNotes(client)[0]?.id ?? null;
      log(
        state,
        action.client,
        'resolved',
        `${action.noteId}: ${action.choice === 'server' ? 'accepted authority; only this note’s local work dropped' : server?.deleted ? (local.deleted ? 'deletion already preserved; local operation removed' : 'kept local content under a new note ID; tombstone retained') : 'queued a NEW operation against the current authority revision'}.`,
      );
      break;
    }
  }
  // The same contract gates loaded data and every committed transaction, including derived revisions.
  validateSimulation(state);
  if (new TextEncoder().encode(JSON.stringify(state)).length > LIMITS.bytes)
    throw new ProtocolError(
      'Simulation reached its 2 MiB safety limit. Export and reset; this action was not committed.',
    );
  return state;
}
export function reducer(editor: Editor, action: Action): Editor {
  try {
    const simulation = transition(editor.simulation, action);
    const recent = simulation.ledger.filter((entry) => entry.sequence >= editor.simulation.nextLog);
    const blocked = recent.find((entry) => entry.kind === 'blocked');
    const lost = recent.find((entry) => entry.kind === 'lost');
    let message = `${action.type.charAt(0).toUpperCase() + action.type.slice(1)} complete.`;
    if (action.type === 'draft')
      message = 'Draft kept locally. Save to queue it for synchronization.';
    else if (action.type === 'select') message = editor.message;
    else if (action.type === 'reset')
      message = 'Fresh sample restored in both devices and authority.';
    else if (action.type === 'loseAck') message = 'Acknowledgement fault updated.';
    else if (blocked) message = blocked.detail;
    else if (lost)
      message =
        'Authority committed, but the acknowledgement was dropped. Retry Sync to receive the original acknowledgement.';
    else if (
      action.type === 'sync' &&
      simulation.clients[action.client].outbox.some((op) => op.status === 'conflict')
    )
      message =
        'Sync found a revision conflict. Your local work is retained; compare the versions and choose what happens next.';
    return { simulation, message, error: '' };
  } catch (error) {
    return { ...editor, error: error instanceof Error ? error.message : 'Could not apply action.' };
  }
}
