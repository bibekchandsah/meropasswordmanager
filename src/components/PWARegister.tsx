'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const isSecureOrigin =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isSecureOrigin) return;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('Service Worker registration successful with scope:', registration.scope);
      } catch (err) {
        console.log('Service Worker registration failed:', err);
      }
    };

    // In production hydration can happen after load fired, so register immediately when possible.
    if (document.readyState === 'complete') {
      void registerServiceWorker();
      return;
    }

    window.addEventListener('load', registerServiceWorker, { once: true });
    return () => window.removeEventListener('load', registerServiceWorker);
  }, []);

  return null;
}
