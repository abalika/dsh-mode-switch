import autoSession from '../desktop/auto-session.cjs';

export const name = 'mode-switch';
export function apply() {
  // Works even when the package manager intentionally skips lifecycle scripts.
  autoSession.schedule();
}
