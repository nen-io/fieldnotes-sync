import { describe, expect, it } from 'vitest';
import { reducer, transition } from '../src/domain/actions';
import {
  displayedNotes,
  fingerprint,
  LIMITS,
  projection,
  sample,
  type ClientId,
  type Operation,
  type Simulation,
} from '../src/domain/model';
import { parseSimulation, persist, restore, type StoragePort } from '../src/domain/persistence';
import { applyOperation } from '../src/domain/protocol';
const noteId = 'note-walk';
function edit(state: Simulation, client: ClientId, body: string, id = noteId) {
  const note = displayedNotes(state.clients[client]).find((n) => n.id === id)!;
  return transition(state, { type: 'draft', client, noteId: id, title: note.title, body });
}
function save(state: Simulation, client: ClientId, body: string, id = noteId) {
  return transition(edit(state, client, body, id), { type: 'save', client, noteId: id });
}
const sync = (state: Simulation, client: ClientId) => transition(state, { type: 'sync', client });
const reload = (state: Simulation) => parseSimulation(JSON.stringify(state));
describe('local outbox and revision protocol', () => {
  it('retains offline saves and drafts on reload; a pull never acknowledges pending work', () => {
    let state = transition(sample(), { type: 'toggle', client: 'laptop' });
    state = save(state, 'laptop', 'Offline version');
    state = edit(state, 'laptop', 'Still typing');
    state = reload(state);
    expect(state.clients.laptop.outbox).toHaveLength(1);
    expect(state.clients.laptop.drafts[0].body).toBe('Still typing');
    state = transition(state, { type: 'toggle', client: 'laptop' });
    state = transition(state, { type: 'pull', client: 'laptop' });
    expect(state.clients.laptop.outbox).toHaveLength(1);
    expect(displayedNotes(state.clients.laptop).find((n) => n.id === noteId)?.body).toBe(
      'Still typing',
    );
    expect(state.authority[0].revision).toBe(1);
  });
  it('coalesces only unsent saves and converges multiple notes', () => {
    let state = save(sample(), 'laptop', 'First');
    const op = state.clients.laptop.outbox[0].opId;
    state = save(state, 'laptop', 'Second');
    state = save(state, 'laptop', 'Third', 'note-ideas');
    expect(state.clients.laptop.outbox).toHaveLength(2);
    expect(state.clients.laptop.outbox[0].opId).toBe(op);
    state = sync(state, 'laptop');
    expect(state.clients.laptop.outbox).toHaveLength(0);
    expect(state.authority.find((n) => n.id === noteId)).toMatchObject({
      body: 'Second',
      revision: 2,
    });
    expect(state.authority.find((n) => n.id === 'note-ideas')?.revision).toBe(2);
    expect(reload(state)).toEqual(state);
  });
  it('requires an explicit conflict choice and uses a new ID for keep-mine', () => {
    let state = save(sample(), 'laptop', 'Laptop version');
    state = save(state, 'pocket', 'Pocket version');
    state = sync(state, 'laptop');
    state = sync(state, 'pocket');
    const old = state.clients.pocket.outbox[0];
    expect(old.status).toBe('conflict');
    expect(old.base?.body).toContain('Take the long way');
    state = transition(state, { type: 'resolve', client: 'pocket', noteId, choice: 'mine' });
    expect(state.clients.pocket.outbox[0].opId).not.toBe(old.opId);
    expect(state.clients.pocket.outbox[0].baseRevision).toBe(2);
    state = sync(state, 'pocket');
    state = transition(state, { type: 'pull', client: 'laptop' });
    expect(state.authority.find((n) => n.id === noteId)).toMatchObject({
      body: 'Pocket version',
      revision: 3,
    });
    expect(projection(state.clients.laptop)).toEqual(projection(state.clients.pocket));
  });
  it('choosing server drops only the conflicted note, preserving other pending notes', () => {
    let state = save(sample(), 'laptop', 'A');
    state = sync(state, 'laptop');
    state = save(state, 'pocket', 'B');
    state = sync(state, 'pocket');
    state = save(state, 'pocket', 'Other pending', 'note-ideas');
    state = transition(state, { type: 'resolve', client: 'pocket', noteId, choice: 'server' });
    expect(state.clients.pocket.outbox).toHaveLength(1);
    expect(state.clients.pocket.outbox[0].noteId).toBe('note-ideas');
    expect(projection(state.clients.pocket).find((n) => n.id === noteId)?.body).toBe('A');
  });
  it('deduplicates a lost acknowledgement after reload and safely rebases its successor', () => {
    let state = save(sample(), 'laptop', 'Committed once');
    state = transition(state, { type: 'loseAck', client: 'laptop' });
    state = sync(state, 'laptop');
    const before = fingerprint(state.clients.laptop.outbox[0]);
    expect(state.authority.find((n) => n.id === noteId)?.revision).toBe(2);
    expect(state.clients.laptop.outbox[0].status).toBe('uncertain');
    state = save(reload(state), 'laptop', 'Successor');
    state = save(state, 'laptop', 'Coalesced successor');
    expect(state.clients.laptop.outbox).toHaveLength(2);
    expect(fingerprint(state.clients.laptop.outbox[0])).toBe(before);
    state = sync(state, 'laptop');
    expect(state.receipts).toHaveLength(2);
    expect(state.authority.find((n) => n.id === noteId)).toMatchObject({
      body: 'Coalesced successor',
      revision: 3,
    });
    expect(state.ledger.some((e) => e.kind === 'deduplicated')).toBe(true);
    expect(reload(state)).toEqual(state);
  });
  it('does not rebase a successor over an unrelated edit after a lost ACK', () => {
    let state = save(sample(), 'laptop', 'First');
    state = transition(state, { type: 'loseAck', client: 'laptop' });
    state = sync(state, 'laptop');
    state = save(state, 'laptop', 'Later local');
    state = transition(state, { type: 'pull', client: 'pocket' });
    state = save(state, 'pocket', 'Intervening edit');
    state = sync(state, 'pocket');
    state = sync(state, 'laptop');
    expect(state.clients.laptop.outbox[0]).toMatchObject({ baseRevision: 2, status: 'conflict' });
    expect(state.authority.find((n) => n.id === noteId)?.body).toBe('Intervening edit');
  });
  it('keeps an unsaved draft’s original base across pulls, but recognizes its own accepted predecessor', () => {
    let state = edit(sample(), 'laptop', 'Draft based on revision one');
    state = save(state, 'pocket', 'New authority');
    state = sync(state, 'pocket');
    state = transition(state, { type: 'pull', client: 'laptop' });
    state = transition(state, { type: 'save', client: 'laptop', noteId });
    state = sync(state, 'laptop');
    expect(state.clients.laptop.outbox[0].status).toBe('conflict');
    state = save(sample(), 'laptop', 'Saved first');
    state = edit(state, 'laptop', 'Unsent second draft');
    state = sync(state, 'laptop');
    state = transition(state, { type: 'save', client: 'laptop', noteId });
    expect(state.clients.laptop.outbox[0].baseRevision).toBe(2);
    state = sync(state, 'laptop');
    expect(state.clients.laptop.outbox).toHaveLength(0);
    expect(state.authority.find((n) => n.id === noteId)?.body).toBe('Unsent second draft');
  });
  it('keeps newest unsaved text during explicit conflict resolution', () => {
    let state = save(sample(), 'laptop', 'First local');
    state = edit(state, 'laptop', 'Newest unsaved');
    state = save(state, 'pocket', 'Remote');
    state = sync(state, 'pocket');
    state = sync(state, 'laptop');
    state = transition(state, { type: 'resolve', client: 'laptop', noteId, choice: 'mine' });
    expect(state.clients.laptop.outbox[0].change.body).toBe('Newest unsaved');
  });
  it('never resurrects a tombstone; keeping stale content creates a new identity', () => {
    let state = save(sample(), 'pocket', 'Keep this content');
    state = transition(state, { type: 'delete', client: 'laptop', noteId });
    state = sync(state, 'laptop');
    state = sync(state, 'pocket');
    expect(state.clients.pocket.outbox[0].status).toBe('conflict');
    state = transition(state, { type: 'resolve', client: 'pocket', noteId, choice: 'mine' });
    const newId = state.clients.pocket.selected;
    expect(newId).not.toBe(noteId);
    state = sync(state, 'pocket');
    expect(state.authority.find((n) => n.id === noteId)).toMatchObject({
      deleted: true,
      revision: 2,
    });
    expect(state.authority.find((n) => n.id === newId)).toMatchObject({
      deleted: false,
      body: 'Keep this content',
      revision: 1,
    });
    expect(reload(state)).toEqual(state);
  });
  it('rejects concurrent create collision and cancels only never-transmitted local creations', () => {
    let state = sample();
    const op: Operation = {
      opId: 'op-1',
      noteId,
      baseRevision: 0,
      base: null,
      change: { title: 'Collision', body: 'No', deleted: false },
      status: 'queued',
    };
    expect(applyOperation(state, op).kind).toBe('conflict');
    state = transition(state, { type: 'new', client: 'laptop' });
    const created = state.clients.laptop.selected!;
    state = transition(state, { type: 'save', client: 'laptop', noteId: created });
    state = edit(state, 'laptop', 'New unsaved after queued create', created);
    expect(reload(state)).toEqual(state);
    state = transition(state, { type: 'discard', client: 'laptop', noteId: created });
    state = transition(state, { type: 'delete', client: 'laptop', noteId: created });
    expect(state.clients.laptop.outbox).toHaveLength(0);
    expect(state.authority).toHaveLength(3);
    expect(reload(state)).toEqual(state);
  });
  it('views are pure and selecting a note does not commit it', () => {
    const state = sample();
    const before = JSON.stringify(state);
    projection(state.clients.laptop);
    displayedNotes(state.clients.laptop);
    expect(JSON.stringify(state)).toBe(before);
    const selected = transition(state, { type: 'select', client: 'laptop', noteId: 'note-ideas' });
    expect(selected.authority).toEqual(state.authority);
    expect(selected.receipts).toEqual([]);
  });
  it('retains receipt authority at capacity and rejects changed-operation replay', () => {
    let state = sample();
    let first: Operation | null = null;
    for (let n = 0; n < LIMITS.receipts; n++) {
      state = save(state, 'laptop', `Update ${n}`);
      first ??= structuredClone(state.clients.laptop.outbox[0]);
      state = sync(state, 'laptop');
    }
    expect(state.receipts).toHaveLength(256);
    expect(state.ledger).toHaveLength(80);
    const revision = state.authority.find((n) => n.id === noteId)!.revision;
    state = save(state, 'laptop', 'Over capacity');
    state = sync(state, 'laptop');
    expect(state.clients.laptop.outbox).toHaveLength(1);
    expect(state.authority.find((n) => n.id === noteId)!.revision).toBe(revision);
    expect(state.ledger.some((e) => e.kind === 'blocked')).toBe(true);
    expect(applyOperation(state, first!).kind).toBe('duplicate');
    expect(() =>
      applyOperation(state, { ...first!, change: { ...first!.change, body: 'Changed' } }),
    ).toThrow('reused');
    expect(reload(state)).toEqual(state);
  });
});
describe('persisted-state boundary', () => {
  it('rejects malformed, oversized, unknown schema and inconsistent identities', () => {
    for (const raw of [
      '{bad',
      ' '.repeat(LIMITS.bytes + 1),
      JSON.stringify({ ...sample(), version: 2 }),
      JSON.stringify({ ...sample(), extra: true }),
    ])
      expect(() => parseSimulation(raw)).toThrow();
    let bad = sample();
    bad.clients.laptop.baseline[0].body = 'Forged same revision';
    expect(() => reload(bad)).toThrow('Equal revisions');
    bad = save(sample(), 'laptop', 'Valid');
    bad.nextId = 1;
    expect(() => reload(bad)).toThrow('counter');
    bad = sample();
    bad.clients.laptop.outbox.push({
      opId: 'op-1',
      noteId: 'ghost-note',
      baseRevision: 1,
      base: { id: 'ghost-note', title: 'Ghost', body: '', revision: 1, deleted: false },
      change: { title: 'Ghost', body: '', deleted: false },
      status: 'queued',
    });
    bad.nextId = 2;
    bad.clients.laptop.selected = 'ghost-note';
    expect(() => reload(bad)).toThrow('no authority');
  });
  it('falls back visibly for corrupt/denied storage and warns on failed atomic writes', () => {
    const broken: StoragePort = {
      getItem: () => '{bad',
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(restore(broken).simulation).toEqual(sample());
    expect(restore(broken).warning).toContain('restored');
    expect(persist(broken, sample())).toContain('unavailable');
    const denied: StoragePort = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(restore(denied).warning).toContain('restored');
  });
  it('enforces note and text budgets without corrupting pending work', () => {
    let state = sample();
    for (let n = 3; n < LIMITS.notes; n++)
      state = transition(state, { type: 'new', client: 'laptop' });
    expect(() => transition(state, { type: 'new', client: 'pocket' })).toThrow('limit');
    expect(() =>
      transition(sample(), {
        type: 'draft',
        client: 'laptop',
        noteId,
        title: 'x'.repeat(81),
        body: '',
      }),
    ).toThrow('limit');
    expect(() =>
      transition(sample(), {
        type: 'draft',
        client: 'laptop',
        noteId,
        title: 'x',
        body: 'x'.repeat(5001),
      }),
    ).toThrow('limit');
  });
});

describe('strict enum and numeric boundaries', () => {
  it('rejects coercible arrays and objects in every persisted enum', () => {
    for (const bad of [['queued'], {}, 1]) {
      const state = save(sample(), 'laptop', 'Pending');
      (state.clients.laptop.outbox[0] as unknown as { status: unknown }).status = bad;
      expect(() => reload(state)).toThrow('status');
    }
    for (const field of ['client', 'kind'] as const) {
      for (const bad of [[field === 'client' ? 'laptop' : 'saved'], {}, 1]) {
        const state = save(sample(), 'laptop', 'Pending');
        (state.ledger[0] as unknown as Record<string, unknown>)[field] = bad;
        expect(() => reload(state)).toThrow('ledger');
      }
    }
  });
  it('refuses ID, event and revision exhaustion without committing an invalid envelope', () => {
    const cases = [
      {
        state: { ...sample(), nextId: 999999999 },
        action: { type: 'new', client: 'laptop' } as const,
      },
      {
        state: { ...sample(), nextLog: 999999999 },
        action: { type: 'toggle', client: 'laptop' } as const,
      },
    ];
    for (const { state, action } of cases) {
      const restored = reload(state);
      const result = reducer({ simulation: restored, message: '', error: '' }, action);
      expect(result.simulation).toBe(restored);
      expect(result.error).toContain('exhausted');
      expect(reload(result.simulation)).toEqual(restored);
    }
    let state = sample();
    for (const note of [
      state.authority[0],
      state.clients.laptop.baseline[0],
      state.clients.pocket.baseline[0],
    ])
      note.revision = 999999999;
    state = reload(save(reload(state), 'laptop', 'Pending at revision limit'));
    const result = reducer(
      { simulation: state, message: '', error: '' },
      { type: 'sync', client: 'laptop' },
    );
    expect(result.simulation).toBe(state);
    expect(result.error).toContain('Revision budget exhausted');
    expect(reload(result.simulation)).toEqual(state);
    const derived = reducer(
      { simulation: state, message: '', error: '' },
      {
        type: 'draft',
        client: 'laptop',
        noteId,
        title: 'A new draft',
        body: 'Derived successor at the boundary',
      },
    );
    expect(derived.simulation).toBe(state);
    expect(derived.error).toContain('supported range');
    expect(reload(derived.simulation)).toEqual(state);
  });
});

describe('transaction and restore closure', () => {
  it('round-trips every successful action in a deterministic mixed-action probe', () => {
    let state = sample();
    let seed = 719;
    let accepted = 0;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    for (let step = 0; step < 1000; step++) {
      const client: ClientId = random(2) ? 'laptop' : 'pocket';
      const notes = displayedNotes(state.clients[client]);
      const selected = notes[random(notes.length || 1)];
      const action = !selected
        ? ({ type: 'new', client } as const)
        : ([
            { type: 'new', client },
            { type: 'select', client, noteId: selected.id },
            {
              type: 'draft',
              client,
              noteId: selected.id,
              title: `Thought ${step}`,
              body: `A deterministic edit ${step}.`,
            },
            { type: 'save', client, noteId: selected.id },
            { type: 'sync', client },
            { type: 'toggle', client },
            { type: 'pull', client },
            { type: 'loseAck', client },
            { type: 'delete', client, noteId: selected.id },
            { type: 'resolve', client, noteId: selected.id, choice: random(2) ? 'mine' : 'server' },
            { type: 'discard', client, noteId: selected.id },
          ][random(11)] as Parameters<typeof transition>[1]);
      const before = JSON.stringify(state);
      const next = reducer({ simulation: state, message: '', error: '' }, action);
      if (next.error) expect(JSON.stringify(next.simulation)).toBe(before);
      else {
        state = next.simulation;
        accepted++;
      }
      expect(reload(state)).toEqual(state);
    }
    expect(accepted).toBeGreaterThan(300);
  });
  it('fails a byte-overflow transaction atomically while preserving unrelated pending work', () => {
    let state = save(sample(), 'pocket', 'Never-transmitted reminder', 'note-ideas');
    let failure = '';
    outer: for (let index = 0; index < LIMITS.receipts; index++) {
      const actions: Parameters<typeof transition>[1][] = [
        {
          type: 'draft',
          client: 'laptop',
          noteId,
          title: 'Long note',
          body: `${index}${'\0'.repeat(4900)}`,
        },
        { type: 'save', client: 'laptop', noteId },
        { type: 'sync', client: 'laptop' },
      ];
      for (const action of actions) {
        const result = reducer({ simulation: state, message: '', error: '' }, action);
        if (result.error) {
          failure = result.error;
          expect(result.simulation).toBe(state);
          expect(state.clients.pocket.outbox[0].change.body).toBe('Never-transmitted reminder');
          break outer;
        }
        state = result.simulation;
      }
    }
    expect(failure).toContain('2 MiB');
    expect(reload(state)).toEqual(state);
  });
});
