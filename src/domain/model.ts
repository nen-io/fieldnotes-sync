export const LIMITS = {
  notes: 50,
  outbox: 100,
  receipts: 256,
  ledger: 80,
  title: 80,
  body: 5000,
  bytes: 2 * 1024 * 1024,
} as const;
export type ClientId = 'laptop' | 'pocket';
export interface Note {
  id: string;
  title: string;
  body: string;
  revision: number;
  deleted: boolean;
}
export interface Change {
  title: string;
  body: string;
  deleted: boolean;
}
export interface Draft {
  noteId: string;
  title: string;
  body: string;
  base: Note | null;
}
export interface Operation {
  opId: string;
  noteId: string;
  baseRevision: number;
  base: Note | null;
  change: Change;
  status: 'queued' | 'uncertain' | 'conflict';
}
export interface Receipt {
  opId: string;
  fingerprint: string;
  noteId: string;
  revision: number;
}
export interface Client {
  online: boolean;
  baseline: Note[];
  outbox: Operation[];
  drafts: Draft[];
  selected: string | null;
  loseNextAck: boolean;
}
export interface LedgerEntry {
  sequence: number;
  client: ClientId | 'authority';
  kind:
    | 'saved'
    | 'accepted'
    | 'deduplicated'
    | 'conflict'
    | 'pulled'
    | 'resolved'
    | 'lost'
    | 'connection'
    | 'blocked';
  detail: string;
}
export interface Simulation {
  version: 1;
  authority: Note[];
  receipts: Receipt[];
  clients: Record<ClientId, Client>;
  ledger: LedgerEntry[];
  nextId: number;
  nextLog: number;
}
export class ProtocolError extends Error {}
export function fingerprint(op: Operation): string {
  return JSON.stringify([
    op.opId,
    op.noteId,
    op.baseRevision,
    op.change.title,
    op.change.body,
    op.change.deleted,
  ]);
}
export function validateText(title: string, body: string) {
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > LIMITS.title)
    throw new ProtocolError('Use a title of 1–80 characters.');
  if (typeof body !== 'string' || body.length > LIMITS.body)
    throw new ProtocolError('Note body must be at most 5,000 characters.');
}
export function projection(client: Client): Note[] {
  const notes = new Map(client.baseline.map((note) => [note.id, note]));
  for (const op of client.outbox)
    notes.set(op.noteId, { id: op.noteId, ...op.change, revision: op.baseRevision });
  return [...notes.values()];
}
export function displayedNotes(client: Client): Note[] {
  const notes = new Map(projection(client).map((note) => [note.id, note]));
  for (const draft of client.drafts) {
    const old = notes.get(draft.noteId);
    notes.set(draft.noteId, {
      id: draft.noteId,
      title: draft.title,
      body: draft.body,
      deleted: false,
      revision: old?.revision ?? 0,
    });
  }
  return [...notes.values()];
}
export function sample(): Simulation {
  const notes: Note[] = [
    {
      id: 'note-walk',
      title: 'A slower kind of morning',
      body: 'Take the long way to the coffee shop.\n\nNotice the light in the windows, the small gardens, the city before it gets busy.\n\nBring a notebook. Leave a little room for something unexpected.',
      revision: 1,
      deleted: false,
    },
    {
      id: 'note-ideas',
      title: 'Things worth making',
      body: 'A place to gather small, useful ideas.\n\n• A reading corner by the window\n• A map of favourite walking routes\n• More time for unhurried conversations',
      revision: 1,
      deleted: false,
    },
    {
      id: 'note-packing',
      title: 'For the next little trip',
      body: 'Notebook, pencil, camera.\nA good book and a light jacket.\n\nLeave the schedule a little open.',
      revision: 1,
      deleted: false,
    },
  ];
  const client = (): Client => ({
    online: true,
    baseline: notes.map((note) => ({ ...note })),
    outbox: [],
    drafts: [],
    selected: notes[0].id,
    loseNextAck: false,
  });
  return {
    version: 1,
    authority: notes,
    receipts: [],
    clients: { laptop: client(), pocket: client() },
    ledger: [],
    nextId: 1,
    nextLog: 1,
  };
}
