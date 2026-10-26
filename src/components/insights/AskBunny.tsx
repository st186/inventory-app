import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, Loader2, Sparkles } from 'lucide-react';
import * as api from '../../utils/api';

type Msg = { role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; failed?: boolean };

const EXAMPLES = [
  'How did veg and chicken do on festival days?',
  'What should we push this week?',
  'Which items ran out most this month, and why?',
  'Compare this month with last month',
];

const TOOL_LABEL: Record<string, string> = {
  get_daily_sales: 'daily sales', get_forecast: 'forecast', get_calendar: 'calendar', get_festival_effects: 'festival effects',
  get_stock_outs: 'stock-outs', get_wastage: 'wastage', get_store_requests: 'stock requests', get_production: 'production', get_expenses: 'expenses',
};

// "Ask Bunny": questions about the business in English, Bengali or Hindi, answered from the
// app's own data. Claude can only look data up here - it never changes anything.
export function AskBunny({ accessToken, storeId }: { accessToken: string; storeId: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const history = next.filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.content }));
      const res = await api.askBunny(accessToken, storeId, history);
      setMessages([...next, { role: 'assistant', content: res.answer, toolsUsed: res.toolsUsed }]);
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: e?.message || 'Something went wrong - try again.', failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col min-h-[calc(100dvh-8rem)]">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center flex-shrink-0"><MessageCircleQuestion className="w-5 h-5" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ask Bunny</h1>
          <p className="text-sm text-gray-500">Ask about sales, festivals, items, wastage or stock - in English, বাংলা or हिन्दी. Answers come from the app's own data.</p>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {messages.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => send(ex)} className="text-left px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:border-violet-300 hover:bg-violet-50/40">
                <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-violet-500" />{ex}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-violet-600 text-white rounded-br-md' : m.failed ? 'bg-rose-50 text-rose-800 rounded-bl-md' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
            }`}>
              {m.content.replace(/\*\*/g, '')}
              {m.toolsUsed && m.toolsUsed.length > 0 && (
                <p className="mt-2 text-[11px] text-gray-400">Looked at: {[...new Set(m.toolsUsed)].map((t) => TOOL_LABEL[t] || t).join(', ')}</p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white border border-gray-200 px-4 py-2.5 text-sm text-gray-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Looking at your numbers...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-0 mt-4 bg-gray-50 pt-2 pb-1 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask a question..."
          rows={1}
          className="flex-1 resize-none px-4 py-3 border border-gray-300 rounded-xl text-base bg-white"
          aria-label="Your question"
        />
        <button type="submit" disabled={busy || !input.trim()} className="px-4 rounded-xl bg-violet-600 text-white disabled:opacity-50" aria-label="Send"><Send className="w-5 h-5" /></button>
      </form>
    </div>
  );
}
