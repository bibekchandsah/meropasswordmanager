'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import ThemeToggle from '@/components/ThemeToggle';
import {
  ArrowRight,
  BarChart3,
  Database,
  FileDown,
  FileUp,
  KeyRound,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Star,
  SunMoon,
} from 'lucide-react';

export default function Page() {
  const router = useRouter();
  const { isAuthenticated, masterKey } = useStore();

  useEffect(() => {
    if (isAuthenticated && masterKey) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, masterKey, router]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-200">
      {/* Theme toggle — top right */}
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--surface-2)] p-6 shadow-2xl shadow-black/20 sm:p-10 transition-colors duration-200">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-center xl:grid-cols-[0.9fr_1.1fr] xl:gap-12 2xl:gap-16">
            <div>
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                Zero-Knowledge Security
              </span>

              <h1 className="mt-4 text-4xl font-bold leading-tight bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent sm:text-5xl xl:whitespace-nowrap">
                Mero Password Manager
              </h1>
              <h5 className="font-bold leading-tight sm:text-3xl text-[var(--foreground)]">Your Passwords, Your Keys</h5>

              <p className="mt-4 max-w-xl text-[var(--muted)]">
                A modern zero-knowledge password manager with client-side encryption, detailed security insights, and powerful import/export tools.
                Your credentials are encrypted before they leave your device.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/auth?mode=signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/auth?mode=signin"
                  className="inline-flex items-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] px-5 py-3 font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-3)]"
                >
                  Sign In
                </Link>
              </div>

              <p className="mt-4 text-xs text-[var(--muted)]">
                Tip: Keep your vault master password stored offline. It is required for decryption and key rotation.
              </p>
            </div>

            <div className="grid h-full gap-4 sm:grid-cols-2 lg:pt-0 xl:pt-0">
              {[
                { icon: <ShieldCheck className="h-5 w-5 text-emerald-400" />, title: 'Zero-Knowledge Encryption', desc: 'Vault data is encrypted client-side before syncing.' },
                { icon: <KeyRound className="h-5 w-5 text-indigo-400" />, title: 'Master Key Control', desc: 'Independent vault key with in-app re-encryption support.' },
                { icon: <BarChart3 className="h-5 w-5 text-cyan-400" />, title: 'Security Analytics', desc: 'Strength distribution, weak-password tracking, and recents.' },
                { icon: <SunMoon className="h-5 w-5 text-amber-400" />, title: 'Theme + Responsive UI', desc: 'Consistent light/dark experience on desktop and mobile.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex min-h-[160px] flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] p-5 xl:min-h-[176px] xl:p-6 transition-colors duration-200">
                  {icon}
                  <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Three pillars */}
        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { label: 'Authentication', title: 'Email + Google', desc: 'Use account password for login and a separate vault master password for encryption.' },
            { label: 'Vault Operations', title: 'Add, Edit, Favorite, Search', desc: 'Fast vault actions with sort modes, strength indicators, and secure clipboard handling.' },
            { label: 'Data Portability', title: 'Smart CSV Import/Export', desc: 'Import wizard with automatic column mapping and preview before encrypted write.' },
          ].map(({ label, title, desc }) => (
            <div key={label} className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-2)] p-5 transition-colors duration-200">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
              <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{title}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{desc}</p>
            </div>
          ))}
        </section>

        {/* Feature grid */}
        <section className="mt-10 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-2)] p-6 sm:p-8 transition-colors duration-200">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Everything you need in one secure dashboard</h2>
          <p className="mt-2 text-[var(--muted)]">
            Designed for practical daily usage, with stronger security controls built into every flow.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { icon: <Search className="h-5 w-5 text-emerald-400" />, title: 'Search + Sort', desc: 'Quickly find credentials by site, username, URL, favorite, or strength category.' },
              { icon: <FileUp className="h-5 w-5 text-cyan-400" />, title: 'Intelligent CSV Import', desc: 'Map columns automatically, adjust fields manually, then import securely.' },
              { icon: <FileDown className="h-5 w-5 text-indigo-400" />, title: 'CSV Export', desc: 'Download your decrypted vault copy for backups and migration workflows.' },
              { icon: <Star className="h-5 w-5 text-amber-400" />, title: 'Favorites + Recents', desc: 'Prioritize frequently used entries and review recently updated accounts.' },
              { icon: <Database className="h-5 w-5 text-emerald-400" />, title: 'Encrypted Cloud Sync', desc: 'Firestore stores encrypted payloads so server-side systems cannot read plaintext.' },
              { icon: <Sparkles className="h-5 w-5 text-pink-400" />, title: 'Top‑notch UX', desc: 'Animated transitions, polished forms, and responsive interactions across devices.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] p-4 transition-colors duration-200">
                {icon}
                <p className="mt-2 font-semibold text-[var(--foreground)]">{title}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-10 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-2)] p-6 sm:p-8 transition-colors duration-200">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">How it works</h2>
          <p className="mt-2 text-[var(--muted)]">Get started in three quick steps with a security-first workflow.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { num: '1', color: 'bg-emerald-500/20 text-emerald-300', title: 'Create your account', desc: 'Sign up using email/password or continue with Google.' },
              { num: '2', color: 'bg-cyan-500/20 text-cyan-300', title: 'Set your vault master password', desc: 'This key encrypts and decrypts your vault data locally.' },
              { num: '3', color: 'bg-indigo-500/20 text-indigo-300', title: 'Manage passwords securely', desc: 'Add entries, analyze strength, and import/export with confidence.' },
            ].map(({ num, color, title, desc }) => (
              <div key={num} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] p-4 transition-colors duration-200">
                <div className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${color}`}>{num}</div>
                <p className="mt-3 font-semibold text-[var(--foreground)]">{title}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-10 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-2)] p-6 sm:p-8 transition-colors duration-200">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Frequently asked questions</h2>
          <p className="mt-2 text-[var(--muted)]">Clear answers to important security and recovery questions.</p>

          <div className="mt-6 space-y-3">
            {[
              { q: 'Is my vault data encrypted before sync?', a: 'Yes. Data is encrypted on your device using your vault master password-derived key before syncing to Firestore.', open: true },
              { q: 'What happens if I reset account login password?', a: 'Resetting account login password changes authentication only. Keep your vault master password unchanged to decrypt existing entries.' },
              { q: 'Can I change my vault master password later?', a: 'Yes. Use the in-app Change Master Password flow to re-encrypt all vault items while your session is unlocked.' },
              { q: 'Does import support different CSV formats?', a: 'Yes. Import includes smart column mapping, preview, and field-by-field control before writing encrypted entries.' },
              { q: 'I forgot my vault master password — how do I recover it?', a: 'On the sign-in page, enter your email and account password, then click "Forgot master password?" under the vault master password field. A recovery email will be sent to your registered address containing your master password. Important: this only works if you have logged in at least once after the recovery feature was set up. The recovery data is stored encrypted in the cloud and requires your account password to decrypt — no prior device is needed.' },
              { q: 'I lost access to my 2FA authenticator app — how do I get in?', a: 'On the login screen, after entering your credentials, the 2FA challenge will appear. Switch to the "Email Recovery" tab and click "Send Code". A one-time 6-digit code will be sent to your registered email. Enter it to bypass the authenticator. This also automatically unlinks your old authenticator, so you will need to set up a new one in Settings after signing in.' },
              { q: 'What happens to my 2FA after email recovery?', a: 'After a successful email OTP recovery, your old TOTP authenticator is permanently unlinked for security. Your account is no longer protected by 2FA until you set it up again. Go to Settings → Two-Factor Authentication and scan a new QR code with your authenticator app.' },
              { q: 'Can I use passkey login on a new device?', a: 'No. Passkeys are device-bound — they are stored in your browser\'s local storage on the device where you registered them. On a new device, sign in normally with your email, account password, and master password, then go to Settings → Passkey & Recovery to register a new passkey on that device.' },
              { q: 'What if I lose the device with my passkey?', a: 'Sign in on any device using your email, account password, and master password. The passkey on the lost device cannot be used without physical access to that device and passing its biometric check, so your account remains secure. You can register a new passkey on your new device from Settings.' },
            ].map(({ q, a, open }) => (
              <details key={q} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] p-4 transition-colors duration-200" open={open}>
                <summary className="cursor-pointer list-none font-semibold text-[var(--foreground)]">{q}</summary>
                <p className="mt-2 text-sm text-[var(--muted)]">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-10 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center sm:p-8">
          <h3 className="text-2xl font-bold text-[var(--foreground)]">Ready to secure your credentials?</h3>
          <p className="mt-2 text-[var(--muted)]">
            Start with a new vault or sign in to continue managing your encrypted password workspace.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/auth?mode=signup"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth?mode=signin"
              className="inline-flex items-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] px-5 py-3 font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-3)]"
            >
              I already have an account
            </Link>
          </div>
        </section>

        {/* Footer note */}
        <section className="mt-8 pb-4 text-center text-xs text-[var(--muted)]">
          <p>meropasswordmanager uses client-side encryption. Store your vault master password offline.</p>
        </section>

      </div>
    </div>
  );
}
