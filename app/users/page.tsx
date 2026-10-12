"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, KeyRound, Loader2, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { Avatar, Card, ErrorBanner, PageBody, PageHero } from "@/components/ui";

type Role = "admin" | "staff";
type User = { id: number; email: string; name: string; role: Role; created_at: string };

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-ink-900 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: `Server error ${res.status}` };
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Role)}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" as Role });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Inline "set password" for one user at a time
  const [passwordFor, setPasswordFor] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, current] = await Promise.all([api("/api/admin/users"), api("/api/auth/me")]);
      setUsers(list.users);
      setMe(current.user);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const { user } = await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", email: "", password: "", role: "staff" });
      setNotice(`${user.name} can now log in as ${user.email}`);
      await load();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (user: User, role: Role) => {
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      setNotice(`${user.name} is now ${role === "admin" ? "an admin" : "staff"}`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const savePassword = async (user: User) => {
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ password: newPassword }) });
      setPasswordFor(null);
      setNewPassword("");
      setNotice(`New password set for ${user.name}. They've been logged out everywhere.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (user: User) => {
    if (!window.confirm(`Delete ${user.name} (${user.email})? They won't be able to log in anymore.`)) return;
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
      setNotice(`${user.name} was deleted`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const adminCount = users?.filter((u) => u.role === "admin").length ?? 0;

  return (
    <>
      <PageHero title="Users" subtitle="Who can log in to Nexta. Admins can also manage users and server settings." />

      <PageBody>
        {error && <ErrorBanner message={error} />}

        <Card className="mb-6 p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-ink-900">
            <UserPlus className="h-5 w-5 text-brand-600" />
            Add a user
          </h2>
          <form onSubmit={addUser} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-start">
            <input
              className={inputClass}
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              className={inputClass}
              type="email"
              placeholder="Email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              className={inputClass}
              type="password"
              placeholder="Password (8+ characters)"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <div className="pt-1">
              <RoleSelect value={form.role} onChange={(role) => setForm({ ...form, role })} />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-brand-600 to-teal-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Add
            </button>
          </form>
          {addError && <p className="mt-2 text-sm text-rose-600">{addError}</p>}
        </Card>

        <Card className="overflow-hidden">
          {!users ? (
            <div className="p-10">
              {!error && (
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {users.map((user) => {
                const isMe = user.id === me?.id;
                const lastAdmin = user.role === "admin" && adminCount <= 1;
                return (
                  <li key={user.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <Avatar name={user.name || user.email} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold text-ink-900">
                        {user.name}
                        {isMe && (
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">You</span>
                        )}
                        {user.role === "admin" && <ShieldCheck className="h-4 w-4 text-teal-500" aria-label="Admin" />}
                      </p>
                      <p className="truncate text-sm text-slate-500">{user.email}</p>
                    </div>

                    {passwordFor === user.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15"
                          type="password"
                          placeholder="New password (8+ characters)"
                          autoComplete="new-password"
                          autoFocus
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && savePassword(user)}
                        />
                        <button
                          type="button"
                          onClick={() => savePassword(user)}
                          disabled={busyId === user.id || newPassword.length < 8}
                          aria-label="Save password"
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-500 disabled:opacity-40"
                        >
                          {busyId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordFor(null);
                            setNewPassword("");
                          }}
                          aria-label="Cancel"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <RoleSelect
                          value={user.role}
                          disabled={busyId === user.id || isMe || lastAdmin}
                          onChange={(role) => changeRole(user, role)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordFor(user.id);
                            setNewPassword("");
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          <KeyRound className="h-4 w-4" />
                          Set password
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(user)}
                          disabled={busyId === user.id || isMe || lastAdmin}
                          title={isMe ? "You can't delete your own account" : lastAdmin ? "You can't delete the last admin" : "Delete"}
                          aria-label={`Delete ${user.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </PageBody>

      {notice && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-ink-900 px-4 py-3 text-sm font-medium text-white shadow-xl"
        >
          <Check className="h-4 w-4 text-teal-300" />
          {notice}
        </div>
      )}
    </>
  );
}
