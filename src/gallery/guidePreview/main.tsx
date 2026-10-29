// Dev-only entry for guide-preview.html: the real app shell and screens for one persona on
// made-up data (mock.ts, PreviewShell.tsx), so the how-to guides can show real screens. Not in the
// production build.
//
//   /guide-preview.html?persona=store-incharge#/stock/requests
//     &lang=bn          App language                  &shift=on   the shift already started
//     &click=a|b        tap buttons / rows whose text contains a, then b
//     &state=submitted  today's day close (notStarted | submitted | approved | rejected)
import { installGuideMock } from './mock';
import { createRoot } from 'react-dom/client';
import { setAppLanguage, type AppLanguage } from '../../utils/appLanguage';
import { Toaster } from '../../components/ui/sonner';
import { ConfirmProvider } from '../../components/ui/confirm';
import { PreviewShell } from './PreviewShell';
import type { salesFor } from '../moneyPreviewData';
import '../../styles/fonts.css';
import '../../index.css';

installGuideMock();
// The guide's screenshot script switches the app language in place, so each screen can be taken in
// English and Bengali without redoing the taps that opened it.
(window as unknown as { __guideLang: (l: AppLanguage) => void }).__guideLang = (l) => setAppLanguage(l);

const params = new URLSearchParams(window.location.search);
const lang = (['bn', 'hi'].includes(params.get('lang') || '') ? params.get('lang') : 'en') as AppLanguage;

createRoot(document.getElementById('root')!).render(
  <>
    <PreviewShell
      personaId={params.get('persona') || 'store-incharge'}
      lang={lang}
      dayClose={(params.get('state') || 'notStarted') as Parameters<typeof salesFor>[0]}
      shiftOn={params.get('shift') === 'on'}
      trip={params.get('trip') || undefined}
      click={(params.get('click') || '').split('|').filter(Boolean)}
    />
    <Toaster />
    <ConfirmProvider />
  </>,
);
