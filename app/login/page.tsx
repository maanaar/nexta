'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import nexta from '@/static/nexta.png';

const highlights = [
  'Reports pulled straight from the print server',
  'Live WhatsApp delivery status for every study',
  'Spot failed or missing numbers at a glance',
];

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed. Please try again.');
        setIsLoading(false);
        return;
      }

      if (data.success) {
        router.push(searchParams.get('redirect') || '/admin');
        router.refresh();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const inputClass =
    'h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 text-sm text-ink-900 placeholder:text-slate-400 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15';

  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel */}
      <aside className="page-hero relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-400/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/30 blur-3xl" />

        <span className="relative text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
          Radiology report delivery
        </span>

        <div className="relative max-w-md">
          <h2 className="font-display text-5xl font-bold leading-tight">
            Every report,
            <br />
            <span className="bg-linear-to-r from-teal-300 to-brand-300 bg-clip-text text-transparent">
              delivered.
            </span>
          </h2>
          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3 text-white/85">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/50">© {new Date().getFullYear()} Nexta</p>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center bg-canvas px-6 py-12 lg:bg-white">
        <div className="w-full max-w-sm">
          <Image src={nexta} alt="Nexta" width={160} height={48} priority />

          <h1 className="mt-10 font-display text-3xl font-bold text-ink-900">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to your dashboard to continue.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink-900">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  id="email"
                  autoComplete="email"
                  placeholder="you@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputClass} pr-4`}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink-900">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              Remember me
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-brand-600 to-teal-500 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary for static rendering
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
