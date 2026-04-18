'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useStore } from '@/store/useStore';
import { Loader2 } from 'lucide-react';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, user, masterKey } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  const isProtectedRoute = pathname.startsWith('/dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email!,
          photoURL: firebaseUser.photoURL,
        });

        if (masterKey && pathname === '/auth') {
          router.push('/dashboard');
        }
      } else {
        setUser(null);
        if (isProtectedRoute) {
          router.push('/auth');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, masterKey, pathname, router, isProtectedRoute]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-emerald-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
