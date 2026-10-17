'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, ChevronDown, KanbanSquare, LogOut, Search, Settings, Users } from 'lucide-react';
import nexta from '@/static/nexta.png';
import SearchPalette from '@/components/SearchPalette';

const tabs = [
  { href: '/board', label: 'Board', icon: KanbanSquare },
  { href: '/health', label: 'System health', icon: Activity },
];

function readUserEmail() {
  const cookie = document.cookie.split(';').find((c) => c.trim().startsWith('user_email='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

type Me = { email: string; name: string; role: 'admin' | 'staff' };

export default function AdminNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const email = readUserEmail();
    setUserEmail(email);
    if (!email) return;
    // Who's logged in, and whether they're an admin (the server verifies the signed session)
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (res.ok) {
          setMe((await res.json()).user);
        } else if (res.status === 401) {
          // Expired, deleted user, or a session from before signed logins: log in again
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
          router.push(`/login?redirect=${encodeURIComponent(pathname || '/board')}`);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" or Ctrl K opens the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setSearchOpen(true);
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
    pathname?.startsWith(href) || (href === '/board' && pathname?.startsWith('/patient'));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 sm:px-6 lg:px-10">
        <Link href="/board" className="flex shrink-0 items-center">
          <Image src={nexta} alt="Nexta" className="h-7 w-auto" priority />
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

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative ml-auto flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2 text-left text-sm text-slate-400 transition hover:border-brand-300"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 truncate">Search patients, accession, phone, or a report file…</span>
          <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-400 sm:block">Ctrl K</kbd>
        </button>

        {userEmail ? (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-slate-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-ink-700 to-brand-500 text-sm font-semibold text-white">
                {(me?.name || userEmail)[0].toUpperCase()}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-ink-900/10">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-xs text-slate-400">Signed in as{me?.role === 'admin' ? ' · Admin' : ''}</p>
                  <p className="truncate text-sm font-semibold text-ink-900">{me?.name || userEmail}</p>
                  {me?.name && <p className="truncate text-xs text-slate-500">{userEmail}</p>}
                </div>
                {me?.role === 'admin' && (
                  <>
                    <Link
                      href="/users"
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Users className="h-4 w-4" />
                      Users
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Settings className="h-4 w-4" />
                      Server settings
                    </Link>
                  </>
                )}
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

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

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
