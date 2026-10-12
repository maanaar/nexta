// Shared setup for every mockup page: the Nexta palette as Tailwind tokens,
// the top navbar, and the "design notes" panel.

tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Montserrat Alternates"', "Inter", "sans-serif"],
      },
      colors: {
        ink: { 950: "#07182A", 900: "#0B2540", 800: "#12355A", 700: "#1B4A78" },
        brand: {
          50: "#EEF6FF", 100: "#D9EBFF", 200: "#B5D8FF", 300: "#82BDFF", 400: "#4A9BF5",
          500: "#1F7AE0", 600: "#1463C4", 700: "#134F9E",
        },
        teal: { 50: "#EAFBF8", 100: "#C9F5EE", 300: "#5CDAC9", 400: "#2EC4B3", 500: "#16A99A", 600: "#0F877D" },
        canvas: "#F2F6FB",
      },
    },
  },
};

const NAV_TABS = [
  { id: "dashboard", href: "01-dashboard.html", label: "Dashboard", icon: "layout-dashboard" },
  { id: "board", href: "02-board.html", label: "Board", icon: "kanban-square" },
  { id: "triage", href: "04-triage.html", label: "Triage", icon: "inbox", badge: 9 },
  { id: "health", href: "05-health.html", label: "System", icon: "activity" },
];

function renderNav() {
  const el = document.getElementById("nav");
  if (!el) return;
  const active = el.dataset.active;
  el.outerHTML = `
  <header class="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-lg">
    <div class="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 sm:px-6 lg:px-10">
      <a href="index.html" class="flex shrink-0 items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-teal-400 font-display text-sm font-bold text-white">N</span>
        <span class="font-display text-lg font-bold text-ink-900">nexta</span>
      </a>
      <nav class="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 md:flex">
        ${NAV_TABS.map((t) => `
          <a href="${t.href}" class="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
            t.id === active ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-ink-900"
          }">
            <i data-lucide="${t.icon}" class="h-4 w-4"></i>${t.label}
            ${t.badge ? `<span class="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-4 text-white">${t.badge}</span>` : ""}
          </a>`).join("")}
      </nav>
      <button type="button" onclick="document.getElementById('cmdk')?.classList.remove('hidden')"
        class="relative ml-auto flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2 text-left text-sm text-slate-400 transition hover:border-brand-300">
        <i data-lucide="search" class="h-4 w-4"></i>
        <span class="flex-1 truncate">Search patients, accession, phone…</span>
        <kbd class="rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-400">Ctrl K</kbd>
      </button>
      <span class="hidden shrink-0 items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/25 lg:flex" title="All watchers running">
        <span class="relative flex h-2 w-2"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span></span>
        Live · synced 4s ago
      </span>
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink-700 to-brand-500 text-sm font-semibold text-white">H</span>
    </div>
  </header>
  ${renderCommandPalette()}`;
}

function renderCommandPalette() {
  const rows = [
    ["user", "Mohamed Abdelrahman", "CT Abdomen · 330930 · Ready to send"],
    ["user", "Mona Hassan Ibrahim", "MR Brain · 330914 · No number"],
    ["file-text", "Open PDF for 330930", "E:\\pdf\\330930.pdf"],
    ["kanban-square", "Go to board", "G then B"],
    ["inbox", "Go to triage", "G then T"],
  ];
  return `
  <div id="cmdk" class="fixed inset-0 z-50 hidden bg-ink-950/40 p-4 pt-[12vh] backdrop-blur-sm" onclick="if(event.target===this)this.classList.add('hidden')">
    <div class="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
      <div class="flex items-center gap-3 border-b border-slate-100 px-4">
        <i data-lucide="search" class="h-5 w-5 text-slate-400"></i>
        <input autofocus value="moh" class="h-14 flex-1 bg-transparent text-base text-ink-900 outline-none" />
        <kbd class="rounded border border-slate-200 px-1.5 text-[11px] text-slate-400">Esc</kbd>
      </div>
      <ul class="p-2">
        ${rows.map(([icon, title, sub], i) => `
          <li class="flex items-center gap-3 rounded-xl px-3 py-2.5 ${i === 0 ? "bg-brand-50" : "hover:bg-slate-50"}">
            <i data-lucide="${icon}" class="h-4 w-4 ${i === 0 ? "text-brand-600" : "text-slate-400"}"></i>
            <span class="flex-1"><span class="block text-sm font-semibold text-ink-900">${title}</span><span class="block text-xs text-slate-500">${sub}</span></span>
            ${i === 0 ? '<i data-lucide="corner-down-left" class="h-4 w-4 text-brand-500"></i>' : ""}
          </li>`).join("")}
      </ul>
      <p class="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">Search across all dates, not just the current filter · ↑↓ to move · Enter to open</p>
    </div>
  </div>`;
}

/** Floating "What's new in this mockup" panel. Pass an array of [title, text]. */
function renderNotes(notes) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div id="notes" class="fixed bottom-5 right-5 z-40 w-[340px] max-w-[calc(100vw-2.5rem)]">
    <div id="notes-body" class="mb-3 max-h-[60vh] overflow-y-auto rounded-2xl bg-ink-900 p-5 text-white shadow-2xl ring-1 ring-white/10">
      <p class="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-300"><i data-lucide="lightbulb" class="h-4 w-4"></i>Ideas in this mockup</p>
      <ol class="space-y-3 text-sm">
        ${notes.map(([t, d], i) => `<li class="flex gap-3"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">${i + 1}</span><span><b class="font-semibold">${t}.</b> <span class="text-white/70">${d}</span></span></li>`).join("")}
      </ol>
    </div>
    <button onclick="document.getElementById('notes-body').classList.toggle('hidden')" class="ml-auto flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xl">
      <i data-lucide="sparkles" class="h-4 w-4 text-teal-300"></i>Design notes
    </button>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    document.getElementById("cmdk")?.classList.remove("hidden");
  }
  if (e.key === "Escape") document.getElementById("cmdk")?.classList.add("hidden");
});

document.addEventListener("DOMContentLoaded", () => {
  renderNav();
  if (window.NOTES) renderNotes(window.NOTES);
  window.lucide?.createIcons();
});

// Shared sample data
const STATE = {
  waiting: { label: "Waiting for PDF", badge: "bg-slate-100 text-slate-600 ring-slate-500/20", dot: "bg-slate-400" },
  no_number: { label: "No number", badge: "bg-amber-50 text-amber-700 ring-amber-500/30", dot: "bg-amber-500" },
  pending: { label: "Ready to send", badge: "bg-brand-50 text-brand-700 ring-brand-500/25", dot: "bg-brand-500" },
  sent: { label: "Sent", badge: "bg-emerald-50 text-emerald-700 ring-emerald-500/25", dot: "bg-emerald-500" },
  failed: { label: "Failed", badge: "bg-rose-50 text-rose-700 ring-rose-500/25", dot: "bg-rose-500" },
  no_whatsapp: { label: "No WhatsApp", badge: "bg-orange-50 text-orange-700 ring-orange-500/25", dot: "bg-orange-500" },
  signed_out: { label: "WhatsApp signed out", badge: "bg-violet-50 text-violet-700 ring-violet-500/25", dot: "bg-violet-500" },
};

const PATIENTS = [
  { id: 1, name: "Mohamed Abdelrahman", pid: "P-104233", acc: "330930", mod: "CT", study: "CT Abdomen & Pelvis with contrast", phone: "01001234567", src: "hl7", state: "pending", age: 6, pdfs: 2 },
  { id: 2, name: "Mona Hassan Ibrahim", pid: "P-104219", acc: "330914", mod: "MR", study: "MRI Brain without contrast", phone: null, src: null, state: "no_number", age: 48, pdfs: 1 },
  { id: 3, name: "Youssef Kamal", pid: "P-104240", acc: "330941", mod: "CR", study: "Chest X-ray PA view", phone: null, src: null, state: "waiting", age: 3, pdfs: 0 },
  { id: 4, name: "Salma Adel Fathy", pid: "P-104198", acc: "330892", mod: "US", study: "Ultrasound Abdomen", phone: "01223456789", src: "manual", state: "sent", age: 22, pdfs: 1 },
  { id: 5, name: "Ahmed Samir Nour", pid: "P-104201", acc: "330899", mod: "CT", study: "CT Chest HRCT", phone: "01114567890", src: "hl7", state: "failed", age: 95, pdfs: 1 },
  { id: 6, name: "Nourhan El-Sayed", pid: "P-104227", acc: "330925", mod: "MG", study: "Bilateral Mammography", phone: "01556789012", src: "hl7", state: "sent", age: 14, pdfs: 1 },
  { id: 7, name: "Khaled Mostafa", pid: "P-104236", acc: "330935", mod: "MR", study: "MRI Lumbar Spine", phone: "01067890123", src: "hl7", state: "pending", age: 11, pdfs: 1 },
  { id: 8, name: "Hana Tarek", pid: "P-104212", acc: "330908", mod: "CT", study: "CT Brain without contrast", phone: "01278901234", src: "hl7", state: "no_whatsapp", age: 130, pdfs: 1 },
  { id: 9, name: "Omar Fawzy", pid: "P-104238", acc: "330938", mod: "CR", study: "Knee X-ray AP/Lat", phone: null, src: null, state: "no_number", age: 31, pdfs: 1 },
  { id: 10, name: "Aya Mahmoud", pid: "P-104205", acc: "330902", mod: "US", study: "Pelvic Ultrasound", phone: "01189012345", src: "hl7", state: "sent", age: 40, pdfs: 1 },
  { id: 11, name: "Mostafa Reda", pid: "P-104241", acc: "330942", mod: "MR", study: "MRI Knee Right", phone: "01090123456", src: "hl7", state: "waiting", age: 1, pdfs: 0 },
  { id: 12, name: "Rana Sherif", pid: "P-104230", acc: "330928", mod: "CT", study: "CT Sinuses", phone: "01501234987", src: "hl7", state: "signed_out", age: 58, pdfs: 1 },
];

function badge(state) {
  const s = STATE[state];
  return `<span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${s.badge}"><span class="h-1.5 w-1.5 rounded-full ${s.dot}"></span>${s.label}</span>`;
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function avatar(name, size = "h-8 w-8 text-xs") {
  return `<span class="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-teal-400 font-semibold text-white ${size}">${initials(name)}</span>`;
}

/** Waiting-time chip that changes color as a job ages (minutes). */
function ageChip(min, final) {
  if (final) return `<span class="font-mono text-xs text-slate-400">${fmtAge(min)}</span>`;
  const tone = min < 15 ? "text-emerald-700 bg-emerald-50" : min < 60 ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50";
  return `<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold ${tone}"><i data-lucide="timer" class="h-3 w-3"></i>${fmtAge(min)}</span>`;
}

function fmtAge(min) {
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
}
