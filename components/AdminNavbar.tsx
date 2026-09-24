'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, KanbanSquare, LayoutDashboard, LogOut, Search, X } from 'lucide-react';
import nexta from '@/static/fexta2.png';
import { useSearch } from '@/context/SearchContext';

const tabs = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/organizer', label: 'Organizer', icon: KanbanSquare },
];

function readUserEmail() {
  const cookie = document.cookie.split(';').find((c) => c.trim().startsWith('user_email='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

export default function AdminNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { searchQuery, setSearchQuery } = useSearch();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserEmail(readUserEmail());
  }, []);

  // "/" focuses search, Escape clears it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUserEmail(null);
    router.push('/login');
    router.refresh();
  };

  const isActive = (href: string) =>
    pathname?.startsWith(href) || (href === '/admin' && pathname?.startsWith('/patient'));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 sm:px-6 lg:px-10">
        <Link href="/admin" className="flex shrink-0 items-center">
          <Image src={nexta} alt="Nexta" className="h-11 w-auto" priority />
        </Link>

        <nav className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 md:flex">
          {tabs.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                isActive(href)
                  ? 'bg-white text-brand-600 shadow-sm'
                  : 'text-slate-500 hover:text-ink-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="relative ml-auto w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search name, patient ID, accession…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm text-ink-900 placeholder:text-slate-400 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-400 sm:block">
              /
            </kbd>
          )}
        </div>

        {userEmail ? (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-slate-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-ink-700 to-brand-500 text-sm font-semibold text-white">
                {userEmail[0].toUpperCase()}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-ink-900/10">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-xs text-slate-400">Signed in as</p>
                  <p className="truncate text-sm font-semibold text-ink-900">{userEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            Log in
          </Link>
        )}
      </div>

      {/* Mobile tabs */}
      <nav className="flex gap-1 border-t border-slate-100 px-4 py-2 md:hidden">
        {tabs.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold ${
              isActive(href) ? 'bg-brand-50 text-brand-600' : 'text-slate-500'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
