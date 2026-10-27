import { useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { loadPhotoUrl, photoPath } from './workplaceApi';

// A workplace photo loaded through the server with the sign-in token, fetched only once it
// scrolls into view so a month-long gallery doesn't pull hundreds of photos at once.
export function AuthedPhoto({ date, employeeId, itemId, thumb, version, className, alt = '', fit = 'cover' }: {
  date: string; employeeId: string; itemId: string; thumb: boolean; version?: string; className?: string; alt?: string; fit?: 'cover' | 'contain';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setUrl(null);
    setFailed(null);
    loadPhotoUrl(photoPath(date, employeeId, itemId, thumb), version || '')
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch((e) => { if (!cancelled) setFailed(e?.message || 'Could not load'); });
    return () => { cancelled = true; };
  }, [visible, date, employeeId, itemId, thumb, version]);

  return (
    <div ref={ref} className={`relative overflow-hidden bg-gray-100 ${className || ''}`}>
      {url ? (
        <img src={url} alt={alt} className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
      ) : failed ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-[11px] text-center p-1">
          <ImageOff className="w-5 h-5 mb-1" />{failed}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}
    </div>
  );
}
