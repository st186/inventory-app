// Dev-only entry for chat-preview.html: the team chat on made-up data (perfPreviewMock.ts answers the
// chat tables and group routes). A small stand-in router keeps the room as a step, like the app's.
// ?room=g1 opens a room; ?theme=dark for dark.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatScreen } from '../components/chat/ChatScreen';
import { ShellProvider, type ShellContextValue } from '../components/shell/ShellContext';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import '../styles/fonts.css';
import '../index.css';
import { installPerfPreviewMock } from './perfPreviewMock';

installPerfPreviewMock();
const query = new URLSearchParams(window.location.search);
if (query.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';

function ChatPreview() {
  const [stack, setStack] = useState<Record<string, string>[]>(() => (query.get('room') ? [{}, { room: query.get('room')! }] : [{}]));
  const params = stack[stack.length - 1];
  const value = useMemo(() => ({
    user: { accessToken: 'preview', name: 'Subham Tewari', role: 'cluster_head' },
    router: {
      route: { path: 'chat', params }, depth: stack.length - 1,
      go: (_p: string, ps: Record<string, string> = {}) => setStack([ps]),
      push: (_p: string, ps: Record<string, string> = {}) => setStack((s) => [...s, ps]),
      replace: (_p: string, ps: Record<string, string> = {}) => setStack((s) => [...s.slice(0, -1), ps]),
      back: () => { setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); return 'pop'; },
      openLegacyTarget: () => undefined,
    },
  }) as unknown as ShellContextValue, [params, stack.length]);
  return (
    <ShellProvider value={value}>
      <div className="min-h-dvh bg-bg">
        <div className="border-b border-border bg-surface px-4 py-3 text-body-md font-semibold text-text">App top bar (the chat should cover this)</div>
        <ChatScreen params={params} />
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-4 text-center text-body-sm text-text-2">Bottom menu (the chat should cover this)</div>
      </div>
    </ShellProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <>
    <ChatPreview />
    <Toaster />
    <ConfirmProvider />
  </>,
);
