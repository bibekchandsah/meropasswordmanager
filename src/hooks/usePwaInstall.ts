"use client";

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePwaInstall() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [isInstallFlowRunning, setIsInstallFlowRunning] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setInstallPromptEvent(null);
    };

    // Check initial state
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (installPromptEvent) {
      setIsInstallFlowRunning(true);
      try {
        await installPromptEvent.prompt();
        const { outcome } = await installPromptEvent.userChoice;
        if (outcome === 'accepted') {
          setIsPwaInstalled(true);
          setInstallPromptEvent(null);
        }
      } finally {
        setIsInstallFlowRunning(false);
      }
    } else {
      // Fallback for browsers that don't support the prompt
      alert(
        'Automatic install prompt not available. Please use your browser’s menu to "Install app" or "Add to Home screen".'
      );
    }
  };

  return {
    canInstall: !!installPromptEvent,
    isInstalled: isPwaInstalled,
    isInstallFlowRunning,
    handleInstallApp,
  };
}
