// The character's voice: the device's Indonesian text-to-speech (Web Speech API), when available.
// Free and offline on most phones; if there is no Indonesian voice the line is just shown as text.

let voices: SpeechSynthesisVoice[] = [];
function load(): void {
  try {
    voices = window.speechSynthesis?.getVoices() ?? [];
  } catch {
    voices = [];
  }
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  load();
  window.speechSynthesis.addEventListener?.('voiceschanged', load);
}

const FEMALE_HINT = /female|wanita|perempuan|damayanti|gadis|siti|ayu|zira/i;
const MALE_HINT = /male|pria|laki|ardi|andika|rizki/i;

function pick(gender: 'male' | 'female'): SpeechSynthesisVoice | null {
  const id = voices.filter((v) => v.lang.toLowerCase().startsWith('id'));
  if (id.length === 0) return null;
  const hint = gender === 'female' ? FEMALE_HINT : MALE_HINT;
  return id.find((v) => hint.test(v.name)) ?? id[0];
}

export interface SpeakOptions {
  gender: 'male' | 'female';
  muted?: boolean;
}

/** Says a line in Indonesian. Returns false when the device cannot speak. */
export function speak(text: string, o: SpeakOptions): boolean {
  if (o.muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const voice = pick(o.gender);
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'id-ID';
    if (voice) u.voice = voice;
    // Without a matching male voice, a lower pitch keeps male characters believable.
    u.pitch = o.gender === 'male' ? (voice && MALE_HINT.test(voice.name) ? 1 : 0.8) : 1.1;
    u.rate = 1.02;
    u.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
