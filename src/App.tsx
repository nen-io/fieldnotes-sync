import { useEffect, useReducer, useState } from 'react';
import { reducer } from './domain/actions';
import { browserStorage, persist, restore } from './domain/persistence';
import { ClientPane } from './components/ClientPane';
import { SharedState } from './components/SharedState';
export default function App() {
  const [loaded] = useState(() => restore(browserStorage()));
  const [editor, act] = useReducer(reducer, {
    simulation: loaded.simulation,
    message: 'Both notebooks start from the same sample. Make a change and follow its journey.',
    error: '',
  });
  const [storageWarning, setStorageWarning] = useState(loaded.warning);
  const [saved, setSaved] = useState(true);
  const [exported, setExported] = useState(false);
  useEffect(() => {
    const warning = persist(browserStorage(), editor.simulation);
    setSaved(!warning);
    if (warning) setStorageWarning(warning);
    setExported(false);
  }, [editor.simulation]);
  const pending = Object.values(editor.simulation.clients).reduce(
    (sum, c) => sum + c.outbox.length,
    0,
  );
  const conflicts = Object.values(editor.simulation.clients).reduce(
    (sum, c) => sum + c.outbox.filter((op) => op.status === 'conflict').length,
    0,
  );
  function exportNotebook() {
    const blob = new Blob([JSON.stringify(editor.simulation, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fieldnotes-simulation.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  }
  return (
    <div className="app">
      <a className="skip-link" href="#notebooks">
        Skip to notebooks
      </a>
      <header className="site-header">
        <a href="#notebooks" className="brand">
          <span className="brand-book" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>
            fieldnotes<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-tag">A LITTLE LAB FOR LOCAL-FIRST IDEAS</span>
        <div className="header-actions">
          <button onClick={() => act({ type: 'reset' })}>Reset sample</button>
          <button className="dark-button" onClick={exportNotebook}>
            Export notebook <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">WRITE HERE. PICK UP THERE.</span>
            <h1>
              Good ideas travel.
              <br />
              <em>Your edits should too.</em>
            </h1>
            <p>
              Two notebooks, one shared story.
              <br />
              Explore what happens when connection comes and goes.
            </p>
          </div>
          <div className="hero-note">
            <span className="hero-note-pin" />
            <span className="eyebrow">A SMALL EXPERIMENT</span>
            <strong>
              Offline doesn’t
              <br />
              mean forgotten.
            </strong>
            <p>
              Save it. Sync it.
              <br />
              Keep every decision explicit.
            </p>
            <span className="hero-note-doodle" aria-hidden="true">
              ↗
            </span>
          </div>
        </section>
        <div className="simulation-strip">
          <span className="simulation-badge">
            <span />
            BROWSER SIMULATION
          </span>
          <p>Both devices and the authority live in this tab. No real network synchronization.</p>
          <span className={`save-indicator ${saved ? '' : 'unavailable'}`}>
            {saved ? 'Saved on this device' : 'Saving unavailable'}
          </span>
        </div>
        {storageWarning ? (
          <div className="warning" role="alert">
            <span>{storageWarning}</span>
            <button aria-label="Dismiss storage warning" onClick={() => setStorageWarning('')}>
              ×
            </button>
          </div>
        ) : null}
        <section className="journey-guide" aria-label="Suggested experiment">
          <div>
            <span className="step-number">01</span>
            <p>
              Take both devices offline.
              <br />
              <strong>Edit the same note differently.</strong>
            </p>
          </div>
          <div>
            <span className="step-number">02</span>
            <p>
              Save locally on each.
              <br />
              <strong>Reconnect and Sync one at a time.</strong>
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <p>
              A conflict keeps both versions.
              <br />
              <strong>Choose how the story continues.</strong>
            </p>
          </div>
        </section>
        <div className="notebooks-heading" id="notebooks">
          <h2>Your two perspectives</h2>
          <div>
            <span>
              {pending} pending {pending === 1 ? 'operation' : 'operations'}
            </span>
            <span className={conflicts ? 'conflict-count' : ''}>
              {conflicts} {conflicts === 1 ? 'conflict' : 'conflicts'}
            </span>
          </div>
        </div>
        <div className="notebooks">
          <ClientPane id="laptop" simulation={editor.simulation} act={act} />
          <ClientPane id="pocket" simulation={editor.simulation} act={act} />
        </div>
        <div
          className={`message ${editor.error ? 'error' : ''}`}
          role={editor.error ? 'alert' : 'status'}
        >
          {editor.error ||
            (exported ? 'Complete simulation exported as plain JSON.' : editor.message)}
        </div>
        <SharedState simulation={editor.simulation} />
        <section className="principles">
          <div>
            <span className="eyebrow">SMALL MODEL. VISIBLE GUARANTEES.</span>
            <h2>
              Nothing disappears
              <br />
              just because you reconnect.
            </h2>
          </div>
          <div>
            <h3>A pull is only a read.</h3>
            <p>
              New authority data becomes a baseline. Pending operations and unsaved drafts stay
              layered above it until an explicit acknowledgement or decision.
            </p>
          </div>
          <div>
            <h3>A conflict is a choice.</h3>
            <p>
              Revision checks protect newer work. No automatic merge, no last-write-wins shortcut. A
              deletion keeps its identity as a tombstone.
            </p>
          </div>
        </section>
        <footer className="site-footer">
          <span>FIELDNOTES / OFFLINE SYNCHRONIZATION LAB</span>
          <span>Plain text. Explicit revisions. No cloud required.</span>
        </footer>
      </main>
    </div>
  );
}
