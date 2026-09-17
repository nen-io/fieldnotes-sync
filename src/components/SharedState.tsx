import type { Simulation } from '../domain/model';
export function SharedState({ simulation }: { simulation: Simulation }) {
  return (
    <div className="shared-grid">
      <section className="authority-panel" aria-labelledby="authority-heading">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">THE COMMITTED RECORD</span>
            <h2 id="authority-heading">Shared authority</h2>
          </div>
          <span className="local-tag">LOCAL SIMULATION</span>
        </div>
        <p className="section-description">Only an accepted operation changes these revisions.</p>
        <div className="authority-list">
          {simulation.authority.map((note) => (
            <details key={note.id} data-testid={`authority-${note.id}`}>
              <summary>
                <span className="authority-note-icon" aria-hidden="true">
                  ≡
                </span>
                <span>
                  <strong>{note.title}</strong>
                  <small>{note.id}</small>
                </span>
                <span className={`authority-state ${note.deleted ? 'deleted' : ''}`}>
                  {note.deleted ? 'Tombstone' : 'Active'}
                  <b>r{note.revision}</b>
                </span>
              </summary>
              <div
                className="authority-body"
                role="region"
                tabIndex={0}
                aria-label={`${note.title} authoritative body`}
              >
                {note.body}
              </div>
            </details>
          ))}
        </div>
        <div className="authority-footer">
          <strong>{simulation.receipts.length} / 256</strong>
          <span>
            acknowledgement receipts retained
            <br />
            No silent eviction. No duplicate revision.
          </span>
        </div>
      </section>
      <section className="ledger-panel" aria-labelledby="ledger-heading">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">FOLLOW THE PROTOCOL</span>
            <h2 id="ledger-heading">Synchronization ledger</h2>
          </div>
          <span className="entry-count">
            {simulation.ledger.length} {simulation.ledger.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div
          className="ledger-list"
          role="region"
          tabIndex={0}
          aria-label="Synchronization event history"
        >
          {simulation.ledger.length ? (
            [...simulation.ledger].reverse().map((entry) => (
              <article className={`ledger-entry ${entry.kind}`} key={entry.sequence}>
                <span className="ledger-sequence">{String(entry.sequence).padStart(3, '0')}</span>
                <div>
                  <div className="ledger-meta">
                    <strong>
                      {entry.client === 'laptop'
                        ? 'Laptop'
                        : entry.client === 'pocket'
                          ? 'Pocket'
                          : 'Authority'}
                    </strong>
                    <span>{entry.kind}</span>
                  </div>
                  <p>{entry.detail}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="ledger-empty">
              <span aria-hidden="true">↳</span>
              <strong>Every change has a story.</strong>
              <p>
                Save a note or change a connection.
                <br />
                The protocol leaves a trail here.
              </p>
            </div>
          )}
        </div>
        <div className="ledger-footer">
          Last 80 events shown. Receipt authority is retained separately.
        </div>
      </section>
    </div>
  );
}
