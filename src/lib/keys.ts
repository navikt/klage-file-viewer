export const CMD = '⌘';
export const CTRL = 'Ctrl';
export const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
export const MOD_KEY_TEXT = IS_MAC ? CMD : CTRL;

interface KeyEvent {
  metaKey: boolean;
  ctrlKey: boolean;
}

export const isMetaKey: (event: KeyEvent) => boolean = IS_MAC ? (event) => event.metaKey : (event) => event.ctrlKey;

export enum Keys {
  Enter = 'Enter',
  Escape = 'Escape',
  Dash = '-',
  Equals = '=',
  Plus = '+',
  Shift = 'Shift',
  F = 'f',
  G = 'g',
}
