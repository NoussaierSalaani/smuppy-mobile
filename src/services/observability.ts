declare const __DEV__: boolean;

export function devLog(...args: unknown[]): void {
  if (__DEV__) console.log(...args);
}

export function nowMs(): number {
  return Date.now();
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
