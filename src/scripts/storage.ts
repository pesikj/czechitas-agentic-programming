// Per-viewer conveniences only; storage may be unavailable (private mode, blocked site data).
export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignored: the setting simply is not remembered.
  }
}
