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

</body>
</html>`;
}
