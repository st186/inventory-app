// Dev-only entry for recipes-preview.html (npm run dev, then open /recipes-preview.html).
import { createRoot } from 'react-dom/client';
import { Toaster } from '../../ui/sonner';
import { PreviewApp } from './PreviewApp';
import '../../../styles/fonts.css';
import '../../../index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <PreviewApp />
    <Toaster position="top-center" />
  </>,
);
