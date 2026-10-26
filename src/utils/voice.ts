// Speech to text and read-aloud for the voice buttons and Bunny's answers. In the Android app it
// uses the phone's own speech screen and text-to-speech (VoicePlugin.java); in a browser, the
// browser's speech recognition (Chrome has it) and speech synthesis. All free. The language
// follows the person's Bunny language (utils/bunnyLanguage.ts): Bengali, English or Hindi.
// Turning what was said into form fields is done by the server (api.voiceFill).
import { Capacitor, registerPlugin } from '@capacitor/core';

export type VoiceLanguage = 'bn-IN' | 'en-IN' | 'hi-IN';

interface VoicePluginApi {
  available(): Promise<{ available: boolean }>;
  listen(options: { language: VoiceLanguage; prompt?: string }): Promise<{ text: string; alternatives: string[] }>;
  speak(options: { text: string; language: VoiceLanguage }): Promise<{ done: boolean }>;
  stopSpeaking(): Promise<void>;
}

const Voice = registerPlugin<VoicePluginApi>('Voice');
const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const BrowserRecognition = (): any =>
  typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

export const voiceSupported = () => isAndroidApp() || !!BrowserRecognition();
export const speechSupported = () => isAndroidApp() || (typeof window !== 'undefined' && 'speechSynthesis' in window);

// What was said, or '' if nothing was heard or it was cancelled.
export async function listen(language: VoiceLanguage, prompt?: string): Promise<string> {
  if (isAndroidApp()) {
    const r = await Voice.listen({ language, prompt });
    return (r.text || '').trim();
  }
  const Recognition = BrowserRecognition();
  if (!Recognition) throw new Error('Voice input needs the Android app or Chrome.');
  return new Promise((resolve, reject) => {
    const rec = new Recognition();
    rec.lang = language;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let text = '';
    rec.onresult = (e: any) => { text = Array.from(e.results).map((r: any) => r[0]?.transcript || '').join(' '); };
    rec.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') resolve('');
      else reject(new Error(e.error === 'not-allowed' ? 'Allow the microphone for this site to use voice.' : `Voice input failed (${e.error}).`));
    };
    rec.onend = () => resolve(text.trim());
    rec.start();
  });
}

// Plain words for reading aloud: no markdown marks, "Rs" said as rupees.
const forSpeech = (text: string) => text
  .replace(/[*_#`>|]/g, ' ')
  .replace(/^\s*[-•]\s+/gm, '')
  .replace(/\bRs\.?\s?/g, '₹')
  .replace(/\s+/g, ' ')
  .trim();

// Read text aloud; resolves when it has finished (or was stopped).
export async function speak(text: string, language: VoiceLanguage): Promise<void> {
  const words = forSpeech(text);
  if (!words) return;
  if (isAndroidApp()) {
    await Voice.speak({ text: words, language });
    return;
  }
  if (!('speechSynthesis' in window)) throw new Error('Read-aloud needs the Android app or a recent browser.');
  window.speechSynthesis.cancel();
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(words);
    u.lang = language;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith(language.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export async function stopSpeaking() {
  if (isAndroidApp()) await Voice.stopSpeaking().catch(() => {});
  else if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
