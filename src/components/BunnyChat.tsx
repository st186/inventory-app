import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircleQuestion, RotateCcw, Send, Sparkles, Square, Volume2, X } from 'lucide-react';
import * as api from '../utils/api';
import { VoiceButton } from './VoiceButton';
import { BUNNY_LANGUAGES, speechLocale, useBunnyLanguage, type BunnyLanguage } from '../utils/bunnyLanguage';
import { speak, speechSupported, stopSpeaking } from '../utils/voice';
import { PAGE_LABELS, TAB_LABELS, captureScreenText, screenIsPrivate, useScreenContext } from '../utils/screenContext';

// The floating Bunny button (bottom right, every screen) and its chat window. Bunny explains the
// screen the person is on - its visible text goes with each question, private pages and
// data-ai-private parts left out - answers in their language (set on Home), can read answers
// aloud, and suggests questions to start with and follow-ups after each answer. Look-ups only:
// Claude never changes anything here.

type Msg = { role: 'user' | 'assistant'; content: string; followUps?: string[]; failed?: boolean };
type Texts = Record<BunnyLanguage, string>;

const T = {
  title: { en: 'Ask Bunny', bn: 'বানিকে জিজ্ঞেস করুন', hi: 'बनी से पूछें' },
  about: { en: 'About this screen', bn: 'এই স্ক্রিন নিয়ে', hi: 'इस स्क्रीन के बारे में' },
  privateScreen: { en: "This screen has personal details, so it isn't shared - ask about the business instead.", bn: 'এই স্ক্রিনে ব্যক্তিগত তথ্য আছে, তাই এটা পাঠানো হয় না - ব্যবসা নিয়ে জিজ্ঞেস করুন।', hi: 'इस स्क्रीन पर निजी जानकारी है, इसलिए यह नहीं भेजी जाती - व्यापार के बारे में पूछें।' },
  hello: { en: 'Ask me what any number on this screen means, why it changed, or what to do next.', bn: 'এই স্ক্রিনের যেকোনো সংখ্যা মানে কী, কেন বদলাল বা এরপর কী করবেন - জিজ্ঞেস করুন।', hi: 'इस स्क्रीन की किसी भी संख्या का मतलब, वह क्यों बदली या आगे क्या करें - पूछिए।' },
  placeholder: { en: 'Type or tap the mic...', bn: 'লিখুন বা মাইকে বলুন...', hi: 'लिखें या माइक दबाकर बोलें...' },
  thinking: { en: 'Looking at your numbers...', bn: 'আপনার সংখ্যাগুলো দেখছি...', hi: 'आपके आंकड़े देख रहा हूँ...' },
  listen: { en: 'Listen', bn: 'শুনুন', hi: 'सुनें' },
  stop: { en: 'Stop', bn: 'থামান', hi: 'रोकें' },
  newChat: { en: 'New chat', bn: 'নতুন চ্যাট', hi: 'नई चैट' },
  hourLimit: { en: "You've asked Bunny a lot this hour. Try again in {m} minutes.", bn: 'এই ঘণ্টায় অনেক প্রশ্ন হয়ে গেছে। {m} মিনিট পরে আবার চেষ্টা করুন।', hi: 'इस घंटे बहुत सवाल हो गए। {m} मिनट बाद फिर कोशिश करें।' },
  dayLimit: { en: "You've used today's share of Bunny. Try again tomorrow.", bn: 'আজকের জন্য বানির ভাগ শেষ। কাল আবার চেষ্টা করুন।', hi: 'आज के लिए बनी का हिस्सा ख़त्म हो गया। कल फिर कोशिश करें।' },
} satisfies Record<string, Texts>;

const GENERIC: Texts[] = [
  { en: 'Explain this screen in simple words', bn: 'এই স্ক্রিনটা সহজ করে বুঝিয়ে দাও', hi: 'इस स्क्रीन को आसान शब्दों में समझाओ' },
  { en: 'What should I look at first here?', bn: 'এখানে আগে কোনটা দেখব?', hi: 'यहाँ सबसे पहले क्या देखूँ?' },
  { en: 'Is anything unusual here?', bn: 'এখানে কিছু অস্বাভাবিক আছে কি?', hi: 'यहाँ कुछ असामान्य है क्या?' },
];

// One question that fits the screen (page, or "analytics:tab"), shown first.
const BY_SCREEN: Record<string, Texts> = {
  'analytics:overview': { en: 'Why did profit change this period?', bn: 'এই সময়ে লাভ কেন বাড়ল বা কমল?', hi: 'इस बार मुनाफ़ा क्यों बदला?' },
  'analytics:profit': { en: 'Which channel earns us the most after commission?', bn: 'কমিশন বাদ দিয়ে কোন চ্যানেলে সবচেয়ে বেশি আয়?', hi: 'कमीशन के बाद किस चैनल से सबसे ज़्यादा कमाई है?' },
  'analytics:expense': { en: 'Where is most of our money going?', bn: 'আমাদের বেশিরভাগ টাকা কোথায় খরচ হচ্ছে?', hi: 'हमारा ज़्यादातर पैसा कहाँ जा रहा है?' },
  'analytics:unit-economics': { en: 'Explain the cost of one plate step by step', bn: 'এক প্লেটের খরচ ধাপে ধাপে বুঝিয়ে দাও', hi: 'एक प्लेट की लागत कदम-दर-कदम समझाओ' },
  'analytics:sales': { en: 'Which momos sell best and which are slow?', bn: 'কোন মোমো সবচেয়ে বেশি বিক্রি হয়, কোনটা কম?', hi: 'कौन से मोमो सबसे ज़्यादा बिकते हैं और कौन से कम?' },
  'analytics:cash-reconciliation': { en: 'Why is the cash short or over?', bn: 'ক্যাশ কেন কম বা বেশি হল?', hi: 'कैश कम या ज़्यादा क्यों है?' },
  'analytics:production-requests': { en: 'Are stock requests being met on time?', bn: 'স্টক রিকোয়েস্ট কি সময়মতো পূরণ হচ্ছে?', hi: 'क्या स्टॉक रिक्वेस्ट समय पर पूरी हो रही हैं?' },
  'analytics:trends': { en: 'How good is the forecast and how can it get better?', bn: 'ফোরকাস্ট কতটা ঠিক হচ্ছে, কীভাবে আরও ভালো হবে?', hi: 'फ़ोरकास्ट कितना सही है और बेहतर कैसे होगा?' },
  sales: { en: 'How is expected cash worked out?', bn: 'এক্সপেক্টেড ক্যাশ কীভাবে হিসাব হয়?', hi: 'अपेक्षित कैश कैसे निकाला जाता है?' },
  inventory: { en: 'Is anything we bought priced unusually?', bn: 'কোনো জিনিসের দাম কি অস্বাভাবিক লাগছে?', hi: 'क्या किसी चीज़ की कीमत असामान्य है?' },
  production: { en: 'How much should we make tomorrow?', bn: 'কাল কতগুলো বানানো উচিত?', hi: 'कल कितने बनाने चाहिए?' },
  'stock-requests': { en: 'How much should the store ask for tomorrow?', bn: 'কাল দোকান কতটা চাইবে?', hi: 'कल स्टोर को कितना माँगना चाहिए?' },
  'stock-outs': { en: 'What runs out most often and why?', bn: 'কোনটা সবচেয়ে বেশি শেষ হয়ে যায়, আর কেন?', hi: 'सबसे ज़्यादा क्या ख़त्म होता है और क्यों?' },
};

const say = (t: Texts, lang: BunnyLanguage) => t[lang] || t.en;

// raised: the website's push-notification bell sits in the same corner, so Bunny goes above it.
export function BunnyChat({ accessToken, storeId, raised = false }: { accessToken: string; storeId: string | null; raised?: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [lang, setLang] = useBunnyLanguage();
  const screen = useScreenContext();
  const endRef = useRef<HTMLDivElement>(null);
  const isPrivate = screenIsPrivate(screen.page);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy, open]);
  useEffect(() => { if (!open) { stopSpeaking(); setSpeakingIndex(null); } }, [open]);

  const screenName = [PAGE_LABELS[screen.page] || screen.page, screen.tab ? TAB_LABELS[screen.tab] || screen.tab : '']
    .filter(Boolean).join(' › ');
  const starters = [BY_SCREEN[`${screen.page}:${screen.tab}`] || BY_SCREEN[screen.page], ...GENERIC]
    .filter((t): t is Texts => !!t).slice(0, 4).map((t) => say(t, lang));

  const readAloud = async (index: number, text: string) => {
    if (speakingIndex === index) {
      await stopSpeaking();
      setSpeakingIndex(null);
      return;
    }
    await stopSpeaking();
    setSpeakingIndex(index);
    try {
      await speak(text, speechLocale(lang));
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: e?.message || 'Read-aloud failed', failed: true }]);
    } finally {
      setSpeakingIndex((cur) => (cur === index ? null : cur));
    }
  };

  const send = async (text: string, spoken = false) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const history = next.filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.content }));
      const res = await api.askBunny(accessToken, storeId, history, {
        language: lang,
        screen: { page: PAGE_LABELS[screen.page] || screen.page, tab: screen.tab ? TAB_LABELS[screen.tab] || screen.tab : undefined, text: captureScreenText() },
      });
      const answered: Msg[] = [...next, { role: 'assistant', content: res.answer, followUps: res.followUps }];
      setMessages(answered);
      // Asked by voice: answer by voice too.
      if (spoken && speechSupported()) readAloud(answered.length - 1, res.answer);
    } catch (e: any) {
      const d = e?.details;
      const content = d?.limit === 'hour' ? say(T.hourLimit, lang).replace('{m}', String(d.retryAfterMinutes || 30))
        : d?.limit === 'day' ? say(T.dayLimit, lang)
        : e?.message || 'Something went wrong - try again.';
      setMessages([...next, { role: 'assistant', content, failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant' && !m.failed);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed ${raised ? 'bottom-20' : 'bottom-6'} right-5 z-40 w-14 h-14 rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-700 flex items-center justify-center`}
          aria-label={say(T.title, lang)}
          title={say(T.title, lang)}
        >
          <MessageCircleQuestion className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div
          className="fixed z-50 inset-x-0 bottom-0 h-[85dvh] sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:h-[620px] sm:max-h-[85dvh] bg-gray-50 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
          role="dialog"
          aria-label={say(T.title, lang)}
          data-ai-private
        >
          <div className="flex items-start gap-3 p-4 border-b border-gray-200 bg-white rounded-t-2xl">
            <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center flex-shrink-0"><MessageCircleQuestion className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">{say(T.title, lang)}</p>
              <p className="text-[11px] text-gray-500 truncate">{say(T.about, lang)}: {screenName}</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={() => { stopSpeaking(); setMessages([]); }} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label={say(T.newChat, lang)} title={say(T.newChat, lang)}>
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex gap-1 px-4 py-2 bg-white border-b border-gray-100" role="group" aria-label="Language">
            {BUNNY_LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${lang === l.id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                aria-pressed={lang === l.id}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <>
                <p className="text-sm text-gray-600">{say(T.hello, lang)}</p>
                {isPrivate && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">{say(T.privateScreen, lang)}</p>}
                <div className="space-y-2">
                  {starters.map((q) => (
                    <button key={q} type="button" onClick={() => send(q)} className="w-full text-left px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm text-gray-800 hover:bg-violet-50">
                      <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-violet-500" />{q}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-violet-600 text-white rounded-br-md'
                    : m.failed ? 'bg-rose-50 text-rose-800 rounded-bl-md'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                }`}>
                  {m.content.replace(/\*\*/g, '')}
                  {m.role === 'assistant' && !m.failed && speechSupported() && (
                    <button type="button" onClick={() => readAloud(i, m.content)} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-violet-700">
                      {speakingIndex === i ? <><Square className="w-3 h-3" /> {say(T.stop, lang)}</> : <><Volume2 className="w-3.5 h-3.5" /> {say(T.listen, lang)}</>}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-white border border-gray-200 px-3.5 py-2.5 text-sm text-gray-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {say(T.thinking, lang)}</div>
              </div>
            )}
            {!busy && lastAnswer?.followUps && lastAnswer.followUps.length > 0 && messages[messages.length - 1] === lastAnswer && (
              <div className="flex flex-wrap gap-2">
                {lastAnswer.followUps.map((q) => (
                  <button key={q} type="button" onClick={() => send(q)} className="px-3 py-1.5 rounded-full border border-violet-200 bg-white text-xs text-violet-800 hover:bg-violet-50 text-left">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-3 border-t border-gray-200 bg-white flex gap-2 items-end rounded-b-2xl">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={say(T.placeholder, lang)}
              rows={1}
              className="flex-1 resize-none px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white"
              aria-label={say(T.placeholder, lang)}
            />
            <VoiceButton onText={(text) => send(text, true)} busy={busy} />
            <button type="submit" disabled={busy || !input.trim()} className="px-3 py-2.5 rounded-xl bg-violet-600 text-white disabled:opacity-50" aria-label="Send"><Send className="w-5 h-5" /></button>
          </form>
        </div>
      )}
    </>
  );
}
