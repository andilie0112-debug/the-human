import type { SaveData } from '../sim/session';

// Text export code for a save: "TH1:" + base64 of the UTF-8 JSON. Players can copy it to
// another device or keep it as a backup.

const PREFIX = 'TH1:';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSave(save: SaveData): string {
  return PREFIX + toBase64(JSON.stringify(save));
}

/** Decodes an export code; throws with a readable reason when it is not a valid code. */
export function decodeSave(code: string): SaveData {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('not-a-save-code');
  let data: unknown;
  try {
    data = JSON.parse(fromBase64(trimmed.slice(PREFIX.length)));
  } catch {
    throw new Error('corrupt-save-code');
  }
  const d = data as Partial<SaveData>;
  if (typeof d.version !== 'number' || !d.character || !d.clock) throw new Error('corrupt-save-code');
  return d as SaveData;
}
