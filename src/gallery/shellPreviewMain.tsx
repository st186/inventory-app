// Dev-only entry for shell-preview.html: the app shell for each role with made-up data.
import { createRoot } from 'react-dom/client';
import { ShellPreview } from './ShellPreview';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import '../styles/fonts.css';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <ShellPreview />
    <Toaster />
    <ConfirmProvider />
  </>,
);
