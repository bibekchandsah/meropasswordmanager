'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').then(
          (registration) => {
            console.log('Service Worker registration successful with scope: ', registration.scope);
          },
          (err) => {
            console.log('Service Worker registration failed: ', err);
          }
        );
      });
    }
  }, []);

  return null;
}
