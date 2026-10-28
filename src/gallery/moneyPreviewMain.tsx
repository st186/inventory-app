// Dev-only entry for money-preview.html: the Money screens on made-up data.
import { createRoot } from 'react-dom/client';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import { installMockFetch } from './moneyPreviewData';
import { MoneyPreview } from './MoneyPreview';
import '../styles/fonts.css';
import '../index.css';

installMockFetch();

createRoot(document.getElementById('root')!).render(
  <>
    <MoneyPreview />
    <Toaster />
    <ConfirmProvider />
  </>,
);
