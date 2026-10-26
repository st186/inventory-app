// Speech to text for the voice buttons. In the Android app it opens the phone's own speech screen
// (VoicePlugin.java); in a browser it uses the browser's speech recognition (Chrome has it). Both
// are free and understand Bengali (bn-IN) mixed with English words like "cash" and "Paytm".
// Turning what was said into form fields is done by the server (api.voiceFill).
import { Capacitor, registerPlugin } from '@capacitor/core';

export type VoiceLanguage = 'bn-IN' | 'en-IN';

interface VoicePluginApi {
  available(): Promise<{ available: boolean }>;
  listen(options: { language: VoiceLanguage; prompt?: string }): Promise<{ text: string; alternatives: string[] }>;
}

const Voice = registerPlugin<VoicePluginApi>('Voice');
const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const BrowserRecognition = (): any =>
  typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

export const voiceSupported = () => isAndroidApp() || !!BrowserRecognition();

const LANGUAGE_KEY = 'voiceLanguage';
export const getVoiceLanguage = (): VoiceLanguage => {
  try { return localStorage.getItem(LANGUAGE_KEY) === 'en-IN' ? 'en-IN' : 'bn-IN'; } catch { return 'bn-IN'; }
};
export const setVoiceLanguage = (lang: VoiceLanguage) => {
  try { localStorage.setItem(LANGUAGE_KEY, lang); } catch { /* remembered for this session only */ }
};

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
