'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
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
    <div className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-6 shadow-2xl shadow-black/30 sm:p-10">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-center xl:grid-cols-[0.9fr_1.1fr] xl:gap-12 2xl:gap-16">
            <div>
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                Zero-Knowledge Security
              </span>

              <h1 className="mt-4 text-4xl font-bold leading-tight bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent sm:text-5xl xl:whitespace-nowrap">
                Mero Password Manager
              </h1>
              <h5 className="font-bold leading-tight sm:text-3xl">Your Passwords, Your Keys</h5>

              <p className="mt-4 max-w-xl text-zinc-300">
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
                  className="inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 font-semibold text-slate-100 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  Sign In
                </Link>
              </div>

              <p className="mt-4 text-xs text-zinc-500">
                Tip: Keep your vault master password stored offline. It is required for decryption and key rotation.
              </p>
            </div>

            <div className="grid h-full gap-4 sm:grid-cols-2 lg:pt-0 xl:pt-0">
              <div className="flex min-h-[160px] flex-col rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 xl:min-h-[176px] xl:p-6">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <p className="mt-2 text-sm font-semibold">Zero-Knowledge Encryption</p>
                <p className="mt-1 text-xs text-zinc-400">Vault data is encrypted client-side before syncing.</p>
              </div>

              <div className="flex min-h-[160px] flex-col rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 xl:min-h-[176px] xl:p-6">
                <KeyRound className="h-5 w-5 text-indigo-400" />
                <p className="mt-2 text-sm font-semibold">Master Key Control</p>
                <p className="mt-1 text-xs text-zinc-400">Independent vault key with in-app re-encryption support.</p>
              </div>

              <div className="flex min-h-[160px] flex-col rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 xl:min-h-[176px] xl:p-6">
                <BarChart3 className="h-5 w-5 text-cyan-400" />
                <p className="mt-2 text-sm font-semibold">Security Analytics</p>
                <p className="mt-1 text-xs text-zinc-400">Strength distribution, weak-password tracking, and recents.</p>
              </div>

              <div className="flex min-h-[160px] flex-col rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 xl:min-h-[176px] xl:p-6">
                <SunMoon className="h-5 w-5 text-amber-400" />
                <p className="mt-2 text-sm font-semibold">Theme + Responsive UI</p>
                <p className="mt-1 text-xs text-zinc-400">Consistent light/dark experience on desktop and mobile.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Authentication</p>
            <p className="mt-2 text-lg font-semibold">Email + Google</p>
            <p className="mt-2 text-sm text-zinc-400">Use account password for login and a separate vault master password for encryption.</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Vault Operations</p>
            <p className="mt-2 text-lg font-semibold">Add, Edit, Favorite, Search</p>
            <p className="mt-2 text-sm text-zinc-400">Fast vault actions with sort modes, strength indicators, and secure clipboard handling.</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Data Portability</p>
            <p className="mt-2 text-lg font-semibold">Smart CSV Import/Export</p>
            <p className="mt-2 text-sm text-zinc-400">Import wizard with automatic column mapping and preview before encrypted write.</p>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8">
          <h2 className="text-2xl font-bold">Everything you need in one secure dashboard</h2>
          <p className="mt-2 text-zinc-400">
            Designed for practical daily usage, with stronger security controls built into every flow.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <Search className="h-5 w-5 text-emerald-400" />
              <p className="mt-2 font-semibold">Search + Sort</p>
              <p className="mt-1 text-sm text-zinc-400">Quickly find credentials by site, username, URL, favorite, or strength category.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <FileUp className="h-5 w-5 text-cyan-400" />
              <p className="mt-2 font-semibold">Intelligent CSV Import</p>
              <p className="mt-1 text-sm text-zinc-400">Map columns automatically, adjust fields manually, then import securely.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <FileDown className="h-5 w-5 text-indigo-400" />
              <p className="mt-2 font-semibold">CSV Export</p>
              <p className="mt-1 text-sm text-zinc-400">Download your decrypted vault copy for backups and migration workflows.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <Star className="h-5 w-5 text-amber-400" />
              <p className="mt-2 font-semibold">Favorites + Recents</p>
              <p className="mt-1 text-sm text-zinc-400">Prioritize frequently used entries and review recently updated accounts.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <Database className="h-5 w-5 text-emerald-400" />
              <p className="mt-2 font-semibold">Encrypted Cloud Sync</p>
              <p className="mt-1 text-sm text-zinc-400">Firestore stores encrypted payloads so server-side systems cannot read plaintext.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <Sparkles className="h-5 w-5 text-pink-400" />
              <p className="mt-2 font-semibold">Premium UX</p>
              <p className="mt-1 text-sm text-zinc-400">Animated transitions, polished forms, and responsive interactions across devices.</p>
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8">
          <h2 className="text-2xl font-bold">How it works</h2>
          <p className="mt-2 text-zinc-400">Get started in three quick steps with a security-first workflow.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-300">1</div>
              <p className="mt-3 font-semibold">Create your account</p>
              <p className="mt-1 text-sm text-zinc-400">Sign up using email/password or continue with Google.</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-bold text-cyan-300">2</div>
              <p className="mt-3 font-semibold">Set your vault master password</p>
              <p className="mt-1 text-sm text-zinc-400">This key encrypts and decrypts your vault data locally.</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-300">3</div>
              <p className="mt-3 font-semibold">Manage passwords securely</p>
              <p className="mt-1 text-sm text-zinc-400">Add entries, analyze strength, and import/export with confidence.</p>
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8">
          <h2 className="text-2xl font-bold">Frequently asked questions</h2>
          <p className="mt-2 text-zinc-400">Clear answers to important security and recovery questions.</p>

          <div className="mt-6 space-y-3">
            <details className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-4" open>
              <summary className="cursor-pointer list-none font-semibold text-slate-100">Is my vault data encrypted before sync?</summary>
              <p className="mt-2 text-sm text-zinc-400">Yes. Data is encrypted on your device using your vault master password-derived key before syncing to Firestore.</p>
            </details>

            <details className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <summary className="cursor-pointer list-none font-semibold text-slate-100">What happens if I reset account login password?</summary>
              <p className="mt-2 text-sm text-zinc-400">Resetting account login password changes authentication only. Keep your vault master password unchanged to decrypt existing entries.</p>
            </details>

            <details className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <summary className="cursor-pointer list-none font-semibold text-slate-100">Can I change my vault master password later?</summary>
              <p className="mt-2 text-sm text-zinc-400">Yes. Use the in-app Change Master Password flow to re-encrypt all vault items while your session is unlocked.</p>
            </details>

            <details className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <summary className="cursor-pointer list-none font-semibold text-slate-100">Does import support different CSV formats?</summary>
              <p className="mt-2 text-sm text-zinc-400">Yes. Import includes smart column mapping, preview, and field-by-field control before writing encrypted entries.</p>
            </details>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center sm:p-8">
          <h3 className="text-2xl font-bold">Ready to secure your credentials?</h3>
          <p className="mt-2 text-zinc-300">
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
              className="inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 font-semibold text-slate-100 transition hover:border-zinc-600 hover:bg-zinc-800"
            >
              I already have an account
            </Link>
          </div>
        </section>

        <section className="mt-8 pb-4 text-center text-xs text-zinc-500">
          <p>meropasswordmanager uses client-side encryption. Store your vault master password offline.</p>
        </section>
      </div>
    </div>
  );
}
