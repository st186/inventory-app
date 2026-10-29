// Dev-only entry for home-preview.html: the Home screens for each role on made-up data.
import { createRoot } from 'react-dom/client';
import { HomePreview } from './HomePreview';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import '../styles/fonts.css';
import '../index.css';
import { installPerfPreviewMock } from './perfPreviewMock';

installPerfPreviewMock();

createRoot(document.getElementById('root')!).render(
  <>
    <HomePreview />
    <Toaster />
    <ConfirmProvider />
  </>,
);
