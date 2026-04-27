import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

// 2px forest green progress bar pinned to the top of the viewport.
// Animates while a Next.js route change is in flight.
export function RouteProgressBar() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let value = 0;

    function start() {
      value = 0;
      setVisible(true);
      setProgress(0);
      const tick = () => {
        // Asymptote at 90% so we reserve the last 10% for "done".
        value = value + Math.max(0.5, (90 - value) * 0.05);
        if (value > 90) value = 90;
        setProgress(value);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    function done() {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      setProgress(100);
      timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    }

    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] pointer-events-none" aria-hidden="true">
      <div
        className="h-[2px] bg-forest transition-[width,opacity] duration-150 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          boxShadow: '0 0 8px rgba(31, 58, 46, 0.45)',
        }}
      />
    </div>
  );
}

export default RouteProgressBar;
