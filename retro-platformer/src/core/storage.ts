/**
 * Small localStorage wrapper. Storage can be unavailable (private browsing,
 * file:// in some browsers), so every access is guarded; a failure just means
 * the value doesn't persist this session.
 */
export function readStored(key: string, legacyKey?: string): string | null {
  try {
    const value = localStorage.getItem(key);
    if (value !== null || !legacyKey) return value;
    // Carry settings over from the game's previous name.
    return localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted this session; nothing else to do.
  }
}
