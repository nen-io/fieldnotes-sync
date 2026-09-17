import { LIMITS, ProtocolError, sample, type Simulation } from './model';
import { validateSimulation } from './validation';
export const STORAGE_KEY = 'fieldnotes.simulation.v1';

export function parseSimulation(raw: string): Simulation {
  if (new TextEncoder().encode(raw).length > LIMITS.bytes)
    throw new ProtocolError('Saved simulation exceeds 2 MiB.');
  return validateSimulation(JSON.parse(raw));
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function restore(storage: StoragePort): { simulation: Simulation; warning: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return { simulation: raw === null ? sample() : parseSimulation(raw), warning: '' };
  } catch {
    return {
      simulation: sample(),
      warning:
        'Saved simulation could not be read. A safe sample was restored; no imported state was executed.',
    };
  }
}
export function persist(storage: StoragePort, state: Simulation): string {
  try {
    const raw = JSON.stringify(state);
    if (new TextEncoder().encode(raw).length > LIMITS.bytes) throw new Error('State limit');
    storage.setItem(STORAGE_KEY, raw);
    return '';
  } catch {
    return 'Local saving is unavailable. Work remains in this tab; export it before closing.';
  }
}
export function browserStorage(): StoragePort {
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  };
}
