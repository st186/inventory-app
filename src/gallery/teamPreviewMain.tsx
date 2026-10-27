// Dev-only entry for team-preview.html: the Team screens with made-up data (WP5).
import './teamPreviewMocks';
import { createRoot } from 'react-dom/client';
import { TeamPreview } from './TeamPreview';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import '../styles/fonts.css';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <TeamPreview />
    <Toaster />
    <ConfirmProvider />
  </>,
);
