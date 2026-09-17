import {
  fingerprint,
  LIMITS,
  ProtocolError,
  validateText,
  type Client,
  type Draft,
  type Note,
  type Operation,
  type Simulation,
} from './model';
type RecordValue = Record<string, unknown>;
function exact(value: unknown, keys: string[], label: string): asserts value is RecordValue {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new ProtocolError(`${label} must be an object.`);
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new ProtocolError(`${label} has invalid fields.`);
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value))
    throw new ProtocolError('Invalid identifier.');
}
function integer(value: unknown, minimum = 0): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value >= 1000000000
  )
    throw new ProtocolError(
      'Sequence or revision exceeds the supported range; export and reset before continuing.',
    );
}
function list(value: unknown, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new ProtocolError('Collection exceeds its bound.');
}
function unique(items: string[]) {
  if (new Set(items).size !== items.length)
    throw new ProtocolError('Duplicate identity in persisted state.');
}
function note(value: unknown): asserts value is Note {
  exact(value, ['id', 'title', 'body', 'revision', 'deleted'], 'Note');
  identifier(value.id);
  integer(value.revision, 1);
  if (typeof value.deleted !== 'boolean') throw new ProtocolError('Invalid tombstone.');
  validateText(value.title as string, value.body as string);
}
function operation(value: unknown): asserts value is Operation {
  exact(value, ['opId', 'noteId', 'baseRevision', 'base', 'change', 'status'], 'Operation');
  identifier(value.opId);
  identifier(value.noteId);
  integer(value.baseRevision);
  if (
    typeof value.status !== 'string' ||
    !['queued', 'uncertain', 'conflict'].includes(value.status)
  )
    throw new ProtocolError('Invalid operation status.');
  exact(value.change, ['title', 'body', 'deleted'], 'Change');
  validateText(value.change.title as string, value.change.body as string);
  if (typeof value.change.deleted !== 'boolean') throw new ProtocolError('Invalid change.');
  if (value.base !== null) {
    note(value.base);
    if (value.base.id !== value.noteId || value.base.revision !== value.baseRevision)
      throw new ProtocolError('Operation base mismatch.');
  } else if (value.baseRevision !== 0) throw new ProtocolError('Missing operation base.');
}
function client(value: unknown): asserts value is Client {
  exact(value, ['online', 'baseline', 'outbox', 'drafts', 'selected', 'loseNextAck'], 'Client');
  if (typeof value.online !== 'boolean' || typeof value.loseNextAck !== 'boolean')
    throw new ProtocolError('Invalid client flags.');
  list(value.baseline, LIMITS.notes);
  value.baseline.forEach(note);
  unique((value.baseline as Note[]).map((n) => n.id));
  list(value.outbox, LIMITS.outbox);
  value.outbox.forEach(operation);
  unique((value.outbox as Operation[]).map((o) => o.opId));
  list(value.drafts, LIMITS.notes);
  value.drafts.forEach((draft) => {
    exact(draft, ['noteId', 'title', 'body', 'base'], 'Draft');
    identifier(draft.noteId);
    if (
      typeof draft.title !== 'string' ||
      draft.title.length > LIMITS.title ||
      typeof draft.body !== 'string' ||
      draft.body.length > LIMITS.body
    )
      throw new ProtocolError('Invalid draft.');
    if (draft.base !== null) {
      note(draft.base);
      if (draft.base.id !== draft.noteId) throw new ProtocolError('Draft base mismatch.');
    }
  });
  unique((value.drafts as Draft[]).map((d) => d.noteId));
  if (value.selected !== null) identifier(value.selected);
}
function sameNote(a: Note | null, b: Note | null): boolean {
  return a === null || b === null
    ? a === b
    : a.id === b.id &&
        a.revision === b.revision &&
        a.title === b.title &&
        a.body === b.body &&
        a.deleted === b.deleted;
}
export function validateSimulation(value: unknown): Simulation {
  exact(
    value,
    ['version', 'authority', 'receipts', 'clients', 'ledger', 'nextId', 'nextLog'],
    'Simulation',
  );
  if (value.version !== 1) throw new ProtocolError('Unsupported simulation version.');
  integer(value.nextId, 1);
  integer(value.nextLog, 1);
  list(value.authority, LIMITS.notes);
  value.authority.forEach(note);
  unique((value.authority as Note[]).map((n) => n.id));
  exact(value.clients, ['laptop', 'pocket'], 'Clients');
  client(value.clients.laptop);
  client(value.clients.pocket);
  list(value.receipts, LIMITS.receipts);
  value.receipts.forEach((receipt) => {
    exact(receipt, ['opId', 'fingerprint', 'noteId', 'revision'], 'Receipt');
    identifier(receipt.opId);
    identifier(receipt.noteId);
    integer(receipt.revision, 1);
    if (typeof receipt.fingerprint !== 'string' || receipt.fingerprint.length > 40000)
      throw new ProtocolError('Invalid receipt identity.');
  });
  list(value.ledger, LIMITS.ledger);
  let previous = 0;
  value.ledger.forEach((entry) => {
    exact(entry, ['sequence', 'client', 'kind', 'detail'], 'Ledger entry');
    integer(entry.sequence, 1);
    if (entry.sequence <= previous || entry.sequence >= (value.nextLog as number))
      throw new ProtocolError('Invalid ledger order.');
    previous = entry.sequence;
    if (
      typeof entry.client !== 'string' ||
      !['laptop', 'pocket', 'authority'].includes(entry.client) ||
      typeof entry.kind !== 'string' ||
      ![
        'saved',
        'accepted',
        'deduplicated',
        'conflict',
        'pulled',
        'resolved',
        'lost',
        'connection',
        'blocked',
      ].includes(entry.kind) ||
      typeof entry.detail !== 'string' ||
      entry.detail.length > 500
    )
      throw new ProtocolError('Invalid ledger entry.');
  });
  const state = value as unknown as Simulation;
  unique(state.receipts.map((r) => r.opId));
  unique(Object.values(state.clients).flatMap((c) => c.outbox.map((o) => o.opId)));
  const known = new Set(state.authority.map((n) => n.id));
  for (const current of Object.values(state.clients)) {
    for (const base of current.baseline) {
      const authoritative = state.authority.find((n) => n.id === base.id);
      if (!authoritative || base.revision > authoritative.revision)
        throw new ProtocolError('Client baseline is not authoritative history.');
      known.add(base.id);
    }
    for (const op of current.outbox) {
      known.add(op.noteId);
      const receipt = state.receipts.find((r) => r.opId === op.opId);
      if (receipt && (receipt.fingerprint !== fingerprint(op) || op.status !== 'uncertain'))
        throw new ProtocolError('Pending receipt identity mismatch.');
      if (op.status === 'uncertain' && !receipt)
        throw new ProtocolError('Uncertain operation needs its durable receipt.');
    }
    current.drafts.forEach((d) => known.add(d.noteId));
    if (
      current.selected !== null &&
      !current.baseline.some((n) => n.id === current.selected) &&
      !current.outbox.some((o) => o.noteId === current.selected) &&
      !current.drafts.some((d) => d.noteId === current.selected)
    )
      throw new ProtocolError('Selected note is missing.');
  }
  for (const current of Object.values(state.clients)) {
    for (const baseline of current.baseline) {
      const authoritative = state.authority.find((item) => item.id === baseline.id)!;
      if (baseline.revision === authoritative.revision && !sameNote(baseline, authoritative))
        throw new ProtocolError('Equal revisions must contain equal note data.');
    }
    for (const noteId of new Set(current.outbox.map((op) => op.noteId))) {
      const chain = current.outbox.filter((op) => op.noteId === noteId);
      const authoritative = state.authority.find((item) => item.id === noteId);
      if (
        chain.length > 2 ||
        (chain.length === 2 && (chain[0].status !== 'uncertain' || chain[1].status !== 'queued'))
      )
        throw new ProtocolError('Invalid per-note transmission chain.');
      for (let index = 0; index < chain.length; index++) {
        const op = chain[index];
        if (op.baseRevision > 0 && !authoritative)
          throw new ProtocolError('Operation base has no authority note.');
        if (op.base && authoritative && op.baseRevision > authoritative.revision)
          throw new ProtocolError('Operation base is ahead of authority.');
        if (index > 0) {
          const previous = chain[index - 1];
          const expected = { id: noteId, ...previous.change, revision: previous.baseRevision + 1 };
          if (!sameNote(op.base, expected))
            throw new ProtocolError('Successor base does not match its predecessor.');
        }
      }
    }
    for (const draft of current.drafts) {
      if (!draft.base) continue;
      const authoritative = state.authority.find((item) => item.id === draft.noteId);
      const predecessor = current.outbox.filter((op) => op.noteId === draft.noteId).at(-1);
      const predicted = predecessor
        ? { id: predecessor.noteId, ...predecessor.change, revision: predecessor.baseRevision + 1 }
        : null;
      if (
        (!authoritative || draft.base.revision > authoritative.revision) &&
        !sameNote(draft.base, predicted)
      )
        throw new ProtocolError('Draft base has no authority or pending predecessor.');
    }
  }
  if (known.size > LIMITS.notes) throw new ProtocolError('Too many distinct notes.');
  for (const receipt of state.receipts) {
    const authoritative = state.authority.find((n) => n.id === receipt.noteId);
    if (!authoritative || receipt.revision > authoritative.revision)
      throw new ProtocolError('Receipt has no authority record.');
    let fields: unknown;
    try {
      fields = JSON.parse(receipt.fingerprint);
    } catch {
      throw new ProtocolError('Corrupt receipt fingerprint.');
    }
    if (
      !Array.isArray(fields) ||
      fields.length !== 6 ||
      fields[0] !== receipt.opId ||
      fields[1] !== receipt.noteId ||
      fields[2] !== receipt.revision - 1 ||
      typeof fields[5] !== 'boolean'
    )
      throw new ProtocolError('Receipt fingerprint mismatch.');
    validateText(fields[3], fields[4]);
  }
  const generated = [
    ...known,
    ...state.receipts.map((r) => r.opId),
    ...Object.values(state.clients).flatMap((c) => c.outbox.map((o) => o.opId)),
  ];
  for (const generatedId of generated) {
    const match = /^(?:note|op)-(\d+)$/.exec(generatedId);
    if (match && Number(match[1]) >= state.nextId)
      throw new ProtocolError('Unsafe next-ID counter.');
  }
  return state;
}
