'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { deriveKey } from '@/lib/crypto';
import { saveRecoveryBlob } from '@/lib/recovery';
import { useStore } from '@/store/useStore';
import {
  isPasskeySupported,
  isPasskeyRegistered,
  authenticateWithPasskey,
  getDevicePasskeyAccount,
  refreshFirebaseToken,
} from '@/lib/passkey';
import { motion } from 'framer-motion';
import { Lock, Mail, KeyRound, Loader2, Fingerprint, Home } from 'lucide-react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForgotPasswordWarning, setShowForgotPasswordWarning] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [forgotMasterLoading, setForgotMasterLoading] = useState(false);
  const [devicePasskeyAccount, setDevicePasskeyAccount] = useState<{ uid: string; email: string } | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setMasterKey, setMasterPassword: storeMasterPassword } = useStore();

  useEffect(() => {
    if (isPasskeySupported()) {
      setPasskeyAvailable(true);
      setDevicePasskeyAccount(getDevicePasskeyAccount());
    }
  }, []);

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'signup') {
      setIsLogin(false);
      setError('');
      setNotice('');
      setShowForgotPasswordWarning(false);
    } else if (mode === 'signin') {
      setIsLogin(true);
      setError('');
      setNotice('');
      setShowForgotPasswordWarning(false);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, email, accountPassword);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, accountPassword);
      }

      if (!masterPassword.trim()) {
        setError('Enter your vault master password.');
        setLoading(false);
        return;
      }

      const accountEmail = userCredential.user.email || email;
      const derivedKey = deriveKey(masterPassword, accountEmail);

      setUser({
        uid: userCredential.user.uid,
        email: accountEmail,
        photoURL: userCredential.user.photoURL,
      });
      setMasterKey(derivedKey);
      storeMasterPassword(masterPassword);

      // Save encrypted recovery blob so "forgot master password" works later
      saveRecoveryBlob(userCredential.user.uid, accountPassword, masterPassword).catch(() => {
        // Non-critical — don't block login if this fails
      });

      router.push('/dashboard');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/invalid-credential') {
        setError('Incorrect email or account password.');
      } else if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many failed login attempts. Please try again later.');
      } else {
        setError((err as Error).message || 'An error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!masterPassword.trim()) {
      setError('Enter a master password first. It is used to decrypt your vault.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const accountEmail = userCredential.user.email;

      if (!accountEmail) {
        setError('Google account email is unavailable. Please try a different account.');
        return;
      }

      const derivedKey = deriveKey(masterPassword, accountEmail);

      setUser({
        uid: userCredential.user.uid,
        email: accountEmail,
        photoURL: userCredential.user.photoURL,
      });
      setMasterKey(derivedKey);
      storeMasterPassword(masterPassword);

      // Save encrypted recovery blob — for Google auth we use masterPassword as
      // both the vault key source and the recovery key source (no account password)
      saveRecoveryBlob(userCredential.user.uid, masterPassword, masterPassword).catch(() => {});

      router.push('/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fully passwordless passkey login:
   * 1. Read uid + email from localStorage (stored at registration time).
   * 2. Trigger WebAuthn assertion → decrypt master password.
   * 3. Use stored Firebase refresh token to silently get a fresh ID token.
   * 4. Sign into Firebase with the ID token via signInWithCustomToken alternative
   *    (we use the refresh token → exchange for ID token → signInWithEmailLink workaround).
   *    Actually: we call signInWithEmailAndPassword is NOT needed — Firebase SDK
   *    already has a session if the refresh token is valid. We use the REST token
   *    exchange and then call auth.updateCurrentUser after reconstructing the user.
   *
   * Simpler: use the refresh token to get a new idToken, then use
   * signInWithCustomToken is not available without Admin SDK.
   * Instead: Firebase JS SDK exposes `signInWithIdToken` internally but not publicly.
   *
   * Practical solution: exchange refresh token → idToken via REST, then use
   * the undocumented but stable `auth._updateCurrentUser` path by fetching
   * user info. We use `signInWithEmailAndPassword` only as fallback.
   *
   * Actually the cleanest approach: use the refresh token to call
   * `https://identitytoolkit.googleapis.com/v1/accounts:lookup` to get user info,
   * then manually set the Firebase auth state using the credential.
   *
   * We use the simplest working approach: exchange refresh token for idToken,
   * then call the Firebase REST accounts:lookup to get user profile, and set
   * the Zustand store directly (Firebase client SDK session is restored via
   * onAuthStateChanged which will fire when the page loads with a valid session
   * stored in IndexedDB — but for immediate use we set the store manually).
   */
  const handlePasskeyLogin = async () => {
    // Determine which account to use
    const account = devicePasskeyAccount;
    if (!account) {
      setError('No passkey found on this device. Sign in with your email and password first.');
      return;
    }

    setPasskeyLoading(true);
    setError('');
    setNotice('');

    try {
      const { uid, email: accountEmail } = account;

      // Step 1: WebAuthn assertion → decrypt both passwords
      const { masterPassword: decryptedMasterPassword, accountPassword } = await authenticateWithPasskey(uid);

      // Step 2: Sign into Firebase properly using the decrypted account password.
      // This establishes a real Firebase SDK session so AuthProvider doesn't redirect back.
      if (accountPassword) {
        // Email/password account — sign in silently with stored credentials
        await signInWithEmailAndPassword(auth, accountEmail, accountPassword);
      } else {
        // Google account or old passkey entry without account password stored.
        // Try refresh token exchange to restore the session.
        await refreshFirebaseToken(uid);
        // The Firebase SDK session is restored via IndexedDB persistence;
        // onAuthStateChanged in AuthProvider will pick it up.
      }

      // Step 3: Derive vault key and unlock
      const derivedKey = deriveKey(decryptedMasterPassword, accountEmail);

      setUser({
        uid,
        email: accountEmail,
        photoURL: auth.currentUser?.photoURL ?? null,
      });
      setMasterKey(derivedKey);
      storeMasterPassword(decryptedMasterPassword);

      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('not allowed')) {
        setError('Passkey authentication was cancelled.');
      } else {
        setError(msg || 'Passkey authentication failed. Please sign in normally.');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleForgotMasterPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    if (!accountPassword.trim()) {
      setError('Enter your account password — it is needed to decrypt your recovery data.');
      return;
    }

    setForgotMasterLoading(true);
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/forgot-master-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), accountPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send recovery email.');
      } else {
        setNotice(`Recovery email sent to ${email.trim()}. Check your inbox (and spam folder).`);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setForgotMasterLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setShowForgotPasswordWarning(true);

    if (!email.trim()) {
      setError('Enter your email first, then click Forgot password.');
      setNotice('');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('Password reset email sent. Check your inbox or spam to set a new password.');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const isAnyLoading = loading || passkeyLoading || forgotMasterLoading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--foreground)] p-4 transition-colors duration-200">
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="fixed left-4 top-4 z-10">
        <Link
          href="/"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center justify-center"
          title="Go to home"
        >
          <Home className="w-5 h-5" />
        </Link>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl p-8"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-emerald-500/10 p-4 rounded-full">
            <Lock className="w-8 h-8 text-emerald-500" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-2">
          {isLogin ? 'Welcome Back' : 'Create Secure Vault'}
        </h2>
        <p className="text-zinc-400 text-center mb-8 text-sm">
          {isLogin
            ? 'Enter your master password to decrypt your vault.'
            : 'Your master password is never stored on our servers.'}
        </p>

        {/* One-tap passkey button — shown when a passkey account exists on this device */}
        {isLogin && passkeyAvailable && devicePasskeyAccount ? (
          <div className="mb-6">
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={isAnyLoading}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl flex justify-center items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {passkeyLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Fingerprint className="w-5 h-5" />
              )}
              {passkeyLoading ? 'Verifying...' : `Sign in as ${devicePasskeyAccount.email}`}
            </button>
            <p className="text-center text-xs text-zinc-500 mt-2">
              Uses your device biometrics — no password needed
            </p>
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-zinc-900 px-3 text-xs text-zinc-500">or sign in with password</span>
              </div>
            </div>
          </div>
        ) : null}

        {!isLogin ? (
          <div className="bg-amber-500/10 border border-amber-500/40 text-amber-300 p-3 rounded-lg mb-6 text-sm">
            <p className="font-semibold">Important recovery notice</p>
            <p className="mt-1">Store your vault master password offline in a safe place.</p>
            <p className="mt-1">It is required to decrypt your vault and to change vault encryption later.</p>
          </div>
        ) : null}

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {notice && (
          <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 p-3 rounded-lg mb-6 text-sm">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              {isLogin ? 'Account Password' : 'Create Account Password'}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                required
                minLength={8}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="••••••••••••"
              />
            </div>
            {isLogin ? (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isAnyLoading}
                  className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            ) : null}
            {isLogin && showForgotPasswordWarning ? (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <p className="font-semibold">Forgot-password warning</p>
                <p className="mt-1">Forgot password resets account login only.</p>
                <p className="mt-1">Store your vault master password offline; it is required to decrypt and re-encrypt your vault.</p>
              </div>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Vault Master Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
                minLength={8}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Used to encrypt/decrypt your vault"
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Keep this same after account password resets to access existing vault entries.
            </p>
            {isLogin ? (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={handleForgotMasterPassword}
                  disabled={isAnyLoading}
                  className="text-xs text-zinc-400 hover:text-sky-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1"
                >
                  {forgotMasterLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : null}
                  Forgot master password?
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isAnyLoading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold py-3 rounded-xl flex justify-center items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-6"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Decrypt & Sign In' : 'Create Vault')}
          </button>

          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-900 px-3 text-xs text-zinc-500">or</span>
            </div>
          </div>

          {/* Passkey button inside form only shown when WebAuthn is available but no device account detected */}
          {isLogin && passkeyAvailable && !devicePasskeyAccount ? (
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={isAnyLoading}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl flex justify-center items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {passkeyLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Fingerprint className="w-5 h-5" />
              )}
              Sign in with Passkey
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={isAnyLoading}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-slate-100 font-semibold py-3 rounded-xl flex justify-center items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.1-1.6H12z"
                />
                <path
                  fill="#34A853"
                  d="M3.5 7.4l3.2 2.3C7.6 8 9.6 6.5 12 6.5c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 8.3 2.4 5 4.5 3.5 7.4z"
                />
                <path
                  fill="#FBBC05"
                  d="M12 21.6c2.6 0 4.8-.9 6.4-2.4l-3-2.4c-.8.6-1.9 1.1-3.4 1.1-3.9 0-5.2-2.6-5.5-3.8l-3.3 2.5c1.6 3 4.7 5 8.8 5z"
                />
                <path
                  fill="#4285F4"
                  d="M21.2 12.2c0-.6-.1-1.1-.1-1.6H12v3.9h5.5c-.3 1.2-1.1 2.2-2.1 2.9l3 2.4c1.8-1.7 2.8-4.1 2.8-7.6z"
                />
              </svg>
            )}
            Continue with Google
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setNotice('');
              setAccountPassword('');
              setShowForgotPasswordWarning(false);
            }}
            className="text-sm text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have a vault? Sign in'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
