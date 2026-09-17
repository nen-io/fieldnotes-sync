import { displayedNotes, type Client } from '../domain/model';

/** A read-only index over durable drafts and outbox state; navigation cannot acknowledge work. */
export function LocalWork({
  client,
  name,
  onSelect,
}: {
  client: Client;
  name: string;
  onSelect: (noteId: string) => void;
}) {
  const notes = displayedNotes(client).filter(
    (note) =>
      client.drafts.some((draft) => draft.noteId === note.id) ||
      client.outbox.some((op) => op.noteId === note.id),
  );
  if (!notes.length) return null;
  return (
    <section className="local-work" aria-label={`${name} local work`}>
      <div className="local-work-heading">
        <strong>Local work</strong>
        <span>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'} to follow
        </span>
      </div>
      <div className="work-list" tabIndex={0} role="region" aria-label={`${name} pending notes`}>
        {notes.map((note) => {
          const operations = client.outbox.filter((op) => op.noteId === note.id);
          const hasDraft = client.drafts.some((draft) => draft.noteId === note.id);
          const status = operations.some((op) => op.status === 'conflict')
            ? 'conflict'
            : operations.some((op) => op.status === 'uncertain')
              ? 'uncertain'
              : operations.length
                ? 'queued'
                : 'draft';
          const label = {
            conflict: 'Needs a decision',
            uncertain: 'ACK unknown · retry Sync',
            queued: 'Queued · not yet sent',
            draft: 'Draft · not yet queued',
          }[status];
          return (
            <button
              key={note.id}
              className={`work-note ${status}`}
              aria-pressed={client.selected === note.id}
              onClick={() => onSelect(note.id)}
            >
              <span>
                <strong>{note.title || 'Untitled draft'}</strong>
                <span className="work-state">
                  {label}
                  {hasDraft && operations.length ? ' · newer draft' : ''}
                </span>
              </span>
              <span className="work-operation">
                {operations.length
                  ? `${operations.length} ${operations.length === 1 ? 'operation' : 'operations'}`
                  : 'Save to queue'}
                <span aria-hidden="true"> ↗</span>
              </span>
            </button>
          );
        })}
      </div>
      <p>
        {client.outbox.some((op) => op.status === 'uncertain')
          ? 'A commit may already exist. Retry Sync to receive its original acknowledgement.'
          : 'Choose a note to inspect it. A pull keeps all local work.'}
      </p>
    </section>
  );
}
