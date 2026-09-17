import { displayedNotes, LIMITS, type ClientId, type Simulation } from '../domain/model';
import type { Action } from '../domain/actions';
export function ClientPane({
  id,
  simulation,
  act,
}: {
  id: ClientId;
  simulation: Simulation;
  act: (action: Action) => void;
}) {
  const client = simulation.clients[id];
  const notes = displayedNotes(client);
  const note = notes.find((item) => item.id === client.selected);
  const draft = client.drafts.find((item) => item.noteId === note?.id);
  const pending = client.outbox.filter((op) => op.noteId === note?.id);
  const conflict = pending.find((op) => op.status === 'conflict');
  const server = simulation.authority.find((item) => item.id === note?.id);
  const name = id === 'laptop' ? 'Laptop' : 'Pocket';
  const latest = client.drafts.find((item) => item.noteId === note?.id) ?? pending.at(-1)?.change;
  return (
    <section
      className={`client-pane ${id}`}
      aria-labelledby={`${id}-heading`}
      data-testid={`client-${id}`}
    >
      <header className="device-header">
        <div className="device-identity">
          <span className={`device-icon ${id}`} aria-hidden="true" />
          <div>
            <span className="eyebrow">SIMULATED DEVICE {id === 'laptop' ? '01' : '02'}</span>
            <h2 id={`${id}-heading`}>{name} notebook</h2>
          </div>
        </div>
        <button
          className={`network-switch ${client.online ? 'online' : 'offline'}`}
          role="switch"
          aria-checked={client.online}
          aria-label={`${name} connection`}
          onClick={() => act({ type: 'toggle', client: id })}
        >
          <span />
          {client.online ? 'Online' : 'Offline'}
        </button>
      </header>
      <div className="device-controls">
        <span className="queue-badge">{client.outbox.length} pending</span>
        <div>
          <button onClick={() => act({ type: 'pull', client: id })} disabled={!client.online}>
            Pull only <span aria-hidden="true">↓</span>
          </button>
          <button
            className="sync-button"
            onClick={() => act({ type: 'sync', client: id })}
            disabled={!client.online}
          >
            Sync device <span aria-hidden="true">↻</span>
          </button>
        </div>
      </div>
      <div className="note-picker">
        <label htmlFor={`${id}-note`}>IN THIS NOTEBOOK</label>
        <div>
          <select
            id={`${id}-note`}
            value={client.selected ?? ''}
            onChange={(event) => act({ type: 'select', client: id, noteId: event.target.value })}
          >
            {!notes.length ? (
              <option value="">No notes yet</option>
            ) : (
              notes.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.deleted ? '[Deleted] ' : ''}
                  {item.title || 'Untitled draft'}
                </option>
              ))
            )}
          </select>
          <button
            onClick={() => act({ type: 'new', client: id })}
            aria-label={`New note on ${name}`}
            title="Create a local draft"
          >
            +
          </button>
        </div>
      </div>
      {note ? (
        <>
          <div className="paper">
            <div className="paper-meta">
              <span>FIELD JOURNAL / {note.id}</span>
              <span>
                base r
                {draft ? (draft.base?.revision ?? 0) : (pending[0]?.baseRevision ?? note.revision)}
              </span>
            </div>
            {conflict ? (
              <div className="conflict-summary">
                <strong>A different version arrived.</strong>
                <p>Your version is safe. Compare the changes below before deciding.</p>
              </div>
            ) : null}
            <label className="note-title-label" htmlFor={`${id}-title`}>
              Note title
            </label>
            <input
              id={`${id}-title`}
              className="note-title"
              value={note.title}
              maxLength={LIMITS.title}
              disabled={note.deleted || Boolean(conflict)}
              onChange={(event) =>
                act({
                  type: 'draft',
                  client: id,
                  noteId: note.id,
                  title: event.target.value,
                  body: note.body,
                })
              }
            />
            <label className="body-label" htmlFor={`${id}-body`}>
              Your note
            </label>
            <textarea
              id={`${id}-body`}
              value={note.body}
              maxLength={LIMITS.body}
              disabled={note.deleted || Boolean(conflict)}
              onChange={(event) =>
                act({
                  type: 'draft',
                  client: id,
                  noteId: note.id,
                  title: note.title,
                  body: event.target.value,
                })
              }
            />
            {note.deleted ? (
              <div className="tombstone-notice">
                This note is deleted locally or in the authority. Its identity remains as a
                tombstone.
              </div>
            ) : null}
            <div className="paper-footer">
              <span
                className={`note-state ${conflict ? 'conflicted' : draft ? 'draft' : pending.length ? 'pending' : 'clean'}`}
              >
                <i />
                {conflict
                  ? 'Conflict needs a decision'
                  : draft
                    ? 'Unsaved draft'
                    : pending.length
                      ? 'Saved locally · awaiting ACK'
                      : 'Matches this device’s baseline'}
              </span>
              <span>{note.body.length.toLocaleString()} / 5,000</span>
            </div>
          </div>
          <div className="note-actions">
            <div>
              <button
                className="save-button"
                disabled={!draft || Boolean(conflict) || note.deleted}
                onClick={() => act({ type: 'save', client: id, noteId: note.id })}
              >
                Save locally <span aria-hidden="true">↗</span>
              </button>
              {draft ? (
                <button onClick={() => act({ type: 'discard', client: id, noteId: note.id })}>
                  Discard draft
                </button>
              ) : null}
            </div>
            <button
              className="delete-button"
              disabled={
                note.deleted ||
                Boolean(conflict) ||
                Boolean(draft) ||
                (note.revision === 0 && !pending.length)
              }
              onClick={() => act({ type: 'delete', client: id, noteId: note.id })}
            >
              Delete note
            </button>
          </div>
          {conflict ? (
            <div className="conflict-panel" role="group" aria-label={`${name} conflict resolution`}>
              <div className="conflict-panel-header">
                <span>REVISION CONFLICT</span>
                <strong>Choose what happens next.</strong>
              </div>
              <div className="version-grid">
                {[
                  { label: 'Original base', value: conflict.base },
                  { label: `Authority now · r${server?.revision ?? 0}`, value: server },
                  { label: 'Your latest version', value: latest },
                ].map((version) => (
                  <div key={version.label}>
                    <h3>{version.label}</h3>
                    <div
                      className="version-content"
                      role="region"
                      aria-label={`${name} ${version.label}`}
                      tabIndex={0}
                    >
                      <strong>{version.value?.title ?? 'No note existed'}</strong>
                      {version.value && 'deleted' in version.value && version.value.deleted ? (
                        <span className="deleted-label">DELETED</span>
                      ) : null}
                      <p>{version.value?.body ?? 'Creation starts from revision zero.'}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="resolution-actions">
                <button
                  onClick={() =>
                    act({ type: 'resolve', client: id, noteId: note.id, choice: 'server' })
                  }
                >
                  Use server version
                </button>
                <button
                  className="save-button"
                  onClick={() =>
                    act({ type: 'resolve', client: id, noteId: note.id, choice: 'mine' })
                  }
                >
                  {server?.deleted && !pending.at(-1)?.change.deleted
                    ? 'Keep as new copy'
                    : 'Keep my version'}
                </button>
              </div>
              <p className="resolution-help">
                Use server drops only this note’s pending operations and draft. Keep mine queues a
                new operation; Sync sends it. A tombstone is never revived.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-notes">
          <h3>A blank page is a good start.</h3>
          <p>Create a note to begin. It stays a local draft until you save.</p>
          <button onClick={() => act({ type: 'new', client: id })}>Create your first note</button>
        </div>
      )}
      <footer className="fault-control">
        <div>
          <strong>Try an uncertain delivery</strong>
          <p>Commit at the authority, then drop one ACK.</p>
        </div>
        <button
          className={client.loseNextAck ? 'armed' : ''}
          aria-pressed={client.loseNextAck}
          onClick={() => act({ type: 'loseAck', client: id })}
        >
          {client.loseNextAck ? 'ACK drop armed' : 'Lose next ACK'}
        </button>
      </footer>
    </section>
  );
}
