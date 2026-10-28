// Dev-only entry for ui-gallery.html: every ui/* component and state, in English and Bengali,
// plus two sample screens built only from those components.
import { createRoot } from 'react-dom/client';
import { Gallery } from './Gallery';
import { Toaster } from '../components/ui/sonner';
import '../styles/fonts.css';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <Gallery />
    <Toaster />
  </>,
);
