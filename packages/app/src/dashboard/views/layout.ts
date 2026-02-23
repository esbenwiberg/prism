/**
 * Page shell (layout) for the Prism dashboard.
 *
 * Dark-mode design using Tailwind CSS (CDN). Purple accent colour throughout.
 * Sidebar is 64 px on mobile (icon-only) and 256 px on desktop.
 */

import { escapeHtml } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayoutOptions {
  title: string;
  /** The main content HTML. */
  content: string;
  /** Currently authenticated user name (shown in sidebar footer). */
  userName?: string;
  /** Active navigation item key. */
  activeNav?: string;
  /** Navigation items for the sidebar. */
  navItems?: Array<{ label: string; href: string; key: string }>;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const NAV_ICONS: Record<string, string> = {
  overview: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>`,
  credentials: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" /></svg>`,
  settings: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`,
  logs: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>`,
  health: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>`,
  prompts: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>`,
};

/** Fallback icon for unknown nav keys. */
const DEFAULT_NAV_ICON = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`;

/** Prism triangle brand icon (optical prism silhouette). */
const BRAND_ICON = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3L21.5 20H2.5L12 3Z" />
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3L15.5 20" stroke-width="1" opacity="0.6" />
</svg>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Render the full page HTML shell.
 */
export function layout(options: LayoutOptions): string {
  const {
    title,
    content,
    userName = "User",
    activeNav = "",
    navItems = [
      { label: "Overview", href: "/", key: "overview" },
      { label: "Credentials", href: "/credentials", key: "credentials" },
      { label: "Settings", href: "/settings", key: "settings" },
      { label: "Logs", href: "/logs", key: "logs" },
      { label: "Health", href: "/health", key: "health" },
      { label: "Prompts", href: "/prompts", key: "prompts" },
    ],
  } = options;

  const initials = getInitials(userName);

  const navLinksHtml = navItems
    .map((item) => {
      const isActive = item.key === activeNav;
      const icon = NAV_ICONS[item.key] ?? DEFAULT_NAV_ICON;
      const activeClasses = isActive
        ? "bg-purple-500/10 text-purple-400"
        : "text-slate-400 hover:bg-slate-800 hover:text-slate-50";
      return `<a href="${escapeHtml(item.href)}"
         class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${activeClasses} lg:justify-start justify-center"
         title="${escapeHtml(item.label)}">
        ${icon}
        <span class="hidden lg:block">${escapeHtml(item.label)}</span>
      </a>`;
    })
    .join("\n");

  // SVG favicon — purple square with prism triangle
  const favicon = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23a855f7'/><polygon points='16,5 28,27 4,27' fill='none' stroke='%230f172a' stroke-width='2.5' stroke-linejoin='round'/><line x1='16' y1='5' x2='21' y2='27' stroke='%230f172a' stroke-width='1.5'/></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Prism</title>
  <link rel="icon" type="image/svg+xml" href="${favicon}" />

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
          },
        },
      },
    }
  </script>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

  <!-- htmx -->
  <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+" crossorigin="anonymous"></script>
  <script src="/public/htmx-ext.js" defer></script>

  <!-- D3 (used by the dependency graph page) -->
  <script src="https://d3js.org/d3.v7.min.js"></script>
</head>
<body class="bg-slate-900 text-slate-50 font-sans">

  <!-- Sidebar -->
  <aside class="fixed inset-y-0 left-0 z-30 flex w-16 lg:w-64 flex-col border-r border-slate-800 bg-slate-900 transition-all">

    <!-- Brand -->
    <div class="flex h-16 items-center gap-3 border-b border-slate-800 px-3 lg:px-6">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500 text-slate-900">
        ${BRAND_ICON}
      </div>
      <span class="hidden lg:block text-lg font-bold tracking-tight text-slate-50">Prism</span>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 space-y-1 overflow-y-auto px-2 lg:px-3 py-4">
      ${navLinksHtml}
    </nav>

    <!-- User footer -->
    <div class="border-t border-slate-800 p-2 lg:p-4">
      <div class="flex items-center gap-3 justify-center lg:justify-start">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-sm font-semibold text-purple-400">
          ${escapeHtml(initials)}
        </div>
        <div class="hidden lg:block min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-slate-50">${escapeHtml(userName)}</p>
        </div>
      </div>
      <a href="/logout"
         class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-50"
         title="Sign out">
        <svg class="w-4 h-4 lg:hidden" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
        <span class="hidden lg:inline">Sign out</span>
      </a>
    </div>
  </aside>

  <!-- Main content -->
  <div class="ml-16 lg:ml-64 min-h-screen">

    <!-- Topbar -->
    <header class="sticky top-0 z-20 flex h-16 items-center border-b border-slate-800 bg-slate-900/80 px-4 lg:px-8 backdrop-blur">
      <h1 class="text-lg font-semibold text-slate-50">${escapeHtml(title)}</h1>
    </header>

    <main class="p-8" id="main-content">
      ${content}
    </main>
  </div>

  <!-- Toast container -->
  <div id="toast-container" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
  </div>

</body>
</html>`;
}
