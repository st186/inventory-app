import { useEffect, useRef, useState } from 'react';
import { History, Loader2, RotateCcw, Send, Sparkles, Square, Trash2, Volume2, X } from 'lucide-react';
import * as api from '../utils/api';
import { VoiceButton } from './VoiceButton';
import { BUNNY_LANGUAGES, languageOwner, speechLocale, useBunnyLanguage, type BunnyLanguage } from '../utils/bunnyLanguage';
import { speak, speechSupported, stopSpeaking } from '../utils/voice';
import { PAGE_LABELS, TAB_LABELS, captureScreenText, screenIsPrivate, useScreenContext } from '../utils/screenContext';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { IconButton } from './ui/icon-button';
import { SegmentedControl } from './ui/segmented-control';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { useIsDesktop } from './ui/use-media-query';
import { cn } from './ui/utils';

// The Ask Bunny chat: opened from the bunny button in the top bar (owner and managers), a tall
// bottom sheet on phones and a right-side panel from 768 px. Bunny explains the
// screen the person is on - its visible text goes with each question, private pages and
// data-ai-private parts left out - answers in their language (Bunny's language, set in the
// Account sheet), can read answers
// aloud, and suggests questions to start with and follow-ups after each answer. Look-ups only:
// Claude never changes anything here.
//
// History: each person's chats are kept on their phone (last 20) and can be reopened. When a
// chat grows long, its older part is summarised once (server /ai/summarize-chat) and Bunny gets
// the summary plus the recent messages - the full chat still shows on screen.

type Msg = { role: 'user' | 'assistant'; content: string; followUps?: string[]; failed?: boolean };
type Chat = { id: string; title: string; updatedAt: string; messages: Msg[]; summary?: string; summarizedCount?: number };

const MAX_CHATS = 20;
const KEEP_RECENT = 6; // messages always sent as they are
const SUMMARISE_AT_CHARS = 8000; // unsummarised text beyond this gets summarised
const SUMMARISE_AT_COUNT = 14;
const chatsKey = () => `bunnyChats:${languageOwner()}`;
const loadChats = (): Chat[] => {
  try { return JSON.parse(localStorage.getItem(chatsKey()) || '[]'); } catch { return []; }
};
const saveChats = (chats: Chat[]) => {
  try { localStorage.setItem(chatsKey(), JSON.stringify(chats.slice(0, MAX_CHATS))); } catch { /* storage full or blocked */ }
};
const newChatId = () => `chat-${Date.now().toString(36)}`;
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
  history: { en: 'Past chats', bn: 'আগের চ্যাট', hi: 'पिछली चैट' },
  noHistory: { en: 'No past chats yet.', bn: 'এখনও কোনো আগের চ্যাট নেই।', hi: 'अभी कोई पिछली चैट नहीं।' },
  summarised: { en: 'Earlier messages are summarised for Bunny to keep answers quick.', bn: 'আগের কথাগুলো সংক্ষেপে বানিকে দেওয়া হয়েছে।', hi: 'पहले के संदेश बनी के लिए संक्षेप में रखे गए हैं।' },
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

export function BunnyChat({ accessToken, storeId, open, onOpenChange }: { accessToken: string; storeId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const setOpen = onOpenChange;
  const isDesktop = useIsDesktop();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatId, setChatId] = useState(newChatId);
  const [summary, setSummary] = useState('');
  const [summarizedCount, setSummarizedCount] = useState(0);
  const [chats, setChats] = useState<Chat[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [lang, setLang] = useBunnyLanguage();
  const screen = useScreenContext();
  const endRef = useRef<HTMLDivElement>(null);
  const isPrivate = screenIsPrivate(screen.page);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy, open]);
  // Past chats for whoever is signed in; reopen the latest one if it was used in the last 12 hours.
  useEffect(() => {
    if (!open) return;
    const saved = loadChats();
    setChats(saved);
    if (!messages.length && saved[0] && Date.now() - Date.parse(saved[0].updatedAt) < 12 * 3600000) openChat(saved[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Save the open chat whenever it changes.
  useEffect(() => {
    if (!messages.length) return;
    const first = messages.find((m) => m.role === 'user')?.content || '';
    const chat: Chat = { id: chatId, title: first.slice(0, 60), updatedAt: new Date().toISOString(), messages: messages.slice(-80), summary, summarizedCount };
    const nextChats = [chat, ...loadChats().filter((c) => c.id !== chatId)];
    saveChats(nextChats);
    setChats(nextChats.slice(0, MAX_CHATS));
  }, [messages, summary, summarizedCount, chatId]);

  const openChat = (chat: Chat) => {
    stopSpeaking();
    setChatId(chat.id);
    setMessages(chat.messages || []);
    setSummary(chat.summary || '');
    setSummarizedCount(chat.summarizedCount || 0);
    setShowHistory(false);
  };
  const startNewChat = () => {
    stopSpeaking();
    setChatId(newChatId());
    setMessages([]);
    setSummary('');
    setSummarizedCount(0);
    setShowHistory(false);
  };
  const deleteChat = (id: string) => {
    const nextChats = loadChats().filter((c) => c.id !== id);
    saveChats(nextChats);
    setChats(nextChats);
    if (id === chatId) startNewChat();
  };
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
      // Long chat: summarise everything but the recent messages once, then send summary + recent.
      let sumText = summary;
      let sumCount = summarizedCount;
      const unsent = next.slice(sumCount).filter((m) => !m.failed);
      const unsentChars = unsent.reduce((t, m) => t + m.content.length, 0);
      if (unsent.length > SUMMARISE_AT_COUNT || unsentChars > SUMMARISE_AT_CHARS) {
        let cut = next.length - KEEP_RECENT;
        while (cut > sumCount && next[cut]?.role !== 'user') cut--; // the recent part starts with a question
        if (cut > sumCount) {
          const older = next.slice(sumCount, cut).filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.content }));
          try {
            sumText = await api.summarizeChat(accessToken, sumText, older);
            sumCount = cut;
            setSummary(sumText);
            setSummarizedCount(cut);
          } catch { /* fall back to sending the recent messages only */ }
        }
      }
      let history = next.slice(sumCount).filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.content }));
      while (history.length && history[0].role !== 'user') history = history.slice(1);
      const res = await api.askBunny(accessToken, storeId, history, {
        summary: sumText || undefined,
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        hideClose
        data-ai-private
        className={cn('gap-0 p-0', isDesktop ? 'w-full sm:max-w-[420px]' : 'h-[88dvh]')}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface py-2 pr-2 pl-4">
          <img src="/bunny-logo.png" alt="" className="size-9 shrink-0 object-contain" draggable={false} />
          <div className="flex min-w-0 flex-1 flex-col">
            <SheetTitle className="text-subtitle">{say(T.title, lang)}</SheetTitle>
            <SheetDescription className="truncate text-caption text-text-3">{say(T.about, lang)}: {screenName}</SheetDescription>
          </div>
          <IconButton
            label={say(T.history, lang)}
            icon={<History />}
            onClick={() => setShowHistory(!showHistory)}
            className={showHistory ? 'text-primary' : undefined}
            aria-pressed={showHistory}
          />
          {messages.length > 0 && <IconButton label={say(T.newChat, lang)} icon={<RotateCcw />} onClick={startNewChat} />}
          <IconButton label="Close" icon={<X />} onClick={() => setOpen(false)} />
        </div>

        <div className="shrink-0 border-b border-border bg-surface px-4 py-2">
          <SegmentedControl<BunnyLanguage>
            aria-label="Bunny's language"
            size="sm"
            selectedTone="primary"
            value={lang}
            onValueChange={setLang}
            options={BUNNY_LANGUAGES.map((l) => ({ value: l.id, label: l.label, lang: l.id }))}
          />
        </div>

        {showHistory && (
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-border bg-surface">
            <p className="overline-label px-4 pt-3 pb-1">{say(T.history, lang)}</p>
            {chats.length === 0 ? (
              <p className="px-4 py-3 text-body-sm text-text-2">{say(T.noHistory, lang)}</p>
            ) : (
              <ul className="py-1">
                {chats.map((c) => (
                  <li key={c.id} className={cn('flex items-center gap-1 pr-2 pl-4', c.id === chatId && 'bg-primary-soft')}>
                    <button type="button" onClick={() => openChat(c)} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center text-left">
                      <span className="truncate text-body-sm text-text">{c.title || '…'}</span>
                      <span className="num text-caption text-text-3">
                        {new Date(c.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {c.messages.length}
                      </span>
                    </button>
                    <IconButton label="Delete chat" variant="danger-ghost" size="sm" icon={<Trash2 />} onClick={() => deleteChat(c.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-bg p-4">
          {summarizedCount > 0 && <p className="text-center text-caption text-text-3">{say(T.summarised, lang)}</p>}
          {messages.length === 0 && (
            <>
              <p className="text-body-sm text-text-2" lang={lang}>{say(T.hello, lang)}</p>
              {isPrivate && <Callout tone="warning">{say(T.privateScreen, lang)}</Callout>}
              <div className="space-y-2">
                {starters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    lang={lang}
                    className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2.5 text-left text-body-sm text-text outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Sparkles className="size-4 shrink-0 text-text-3" aria-hidden="true" />
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                lang={lang}
                className={cn(
                  'max-w-[88%] rounded-xl px-3.5 py-2.5 text-body-sm whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'rounded-br-sm bg-primary text-on-primary'
                    : m.failed
                      ? 'rounded-bl-sm border border-danger-border bg-danger-soft text-danger'
                      : 'rounded-bl-sm border border-border bg-surface text-text',
                )}
              >
                {m.content.replace(/\*\*/g, '')}
                {m.role === 'assistant' && !m.failed && speechSupported() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 -ml-2 text-primary"
                    leadingIcon={speakingIndex === i ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                    onClick={() => readAloud(i, m.content)}
                  >
                    {speakingIndex === i ? say(T.stop, lang) : say(T.listen, lang)}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-xl rounded-bl-sm border border-border bg-surface px-3.5 py-2.5 text-body-sm text-text-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {say(T.thinking, lang)}
              </div>
            </div>
          )}
          {!busy && lastAnswer?.followUps && lastAnswer.followUps.length > 0 && messages[messages.length - 1] === lastAnswer && (
            <div className="flex flex-wrap gap-2">
              {lastAnswer.followUps.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  lang={lang}
                  className="min-h-9 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-left text-label text-text outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex shrink-0 items-end gap-2 border-t border-border bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={say(T.placeholder, lang)}
            rows={1}
            className="min-h-11 flex-1 resize-none rounded-md border border-border-strong bg-surface px-3 py-2.5 text-body text-text outline-none placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label={say(T.placeholder, lang)}
          />
          <VoiceButton onText={(text) => send(text, true)} busy={busy} />
          <IconButton type="submit" label="Send" variant="primary" icon={<Send />} disabled={busy || !input.trim()} className="rounded-md" />
        </form>
      </SheetContent>
    </Sheet>
  );
}
