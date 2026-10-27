// Dev-only entry for setup-preview.html. The mock goes first: it puts the made-up session in
// place and answers the server calls before any screen code runs.
import './mock';
import { createRoot } from 'react-dom/client';
import { Toaster } from '../../components/ui/sonner';
import { ConfirmProvider } from '../../components/ui/confirm';
import { SetupPreview } from './SetupPreview';
import '../../styles/fonts.css';
import '../../index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <SetupPreview />
    <Toaster />
    <ConfirmProvider />
  </>,
);
