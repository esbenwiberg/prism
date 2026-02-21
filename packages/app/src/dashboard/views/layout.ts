/**
 * Page shell (layout) for the Prism dashboard.
 *
 * Provides the surrounding HTML structure: sidebar, topbar, and main
 * content area. Includes the HTMX CDN script tag.
 */

import { escapeHtml } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayoutOptions {
  title: string;
  /** The main content HTML. */
  content: string;
  /** Currently authenticated user name (shown in topbar). */
  userName?: string;
  /** Active navigation item key. */
  activeNav?: string;
  /** Navigation items for the sidebar. */
  navItems?: Array<{ label: string; href: string; key: string }>;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f9fafb;
    color: #111827;
    display: flex;
    min-height: 100vh;
  }
  .sidebar {
    width: 240px;
    background: #1f2937;
    color: #f9fafb;
    padding: 16px 0;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }
  .sidebar-brand {
    padding: 0 16px 16px;
    font-size: 1.25rem;
    font-weight: 700;
    border-bottom: 1px solid #374151;
    margin-bottom: 8px;
  }
  .sidebar-nav a {
    display: block;
    padding: 8px 16px;
    color: #d1d5db;
    text-decoration: none;
    font-size: 0.875rem;
    transition: background 0.15s;
  }
  .sidebar-nav a:hover,
  .sidebar-nav a.active {
    background: #374151;
    color: #fff;
  }
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .topbar {
    height: 48px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    flex-shrink: 0;
  }
  .topbar-title {
    font-weight: 600;
    font-size: 0.875rem;
  }
  .topbar-user {
    font-size: 0.75rem;
    color: #6b7280;
  }
  .topbar-user a {
    color: #6b7280;
    text-decoration: none;
    margin-left: 12px;
  }
  .topbar-user a:hover {
    color: #111827;
  }
  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }
  .stat-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }
  .page-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 16px;
  }
  a { color: #2563eb; }
  a:hover { color: #1d4ed8; }
`;

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
    navItems = [{ label: "Overview", href: "/", key: "overview" }],
  } = options;

  const navHtml = navItems
    .map(
      (item) =>
        `<a href="${escapeHtml(item.href)}"${item.key === activeNav ? ' class="active"' : ""}>${escapeHtml(item.label)}</a>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Prism</title>
  <style>${CSS}</style>
  <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+" crossorigin="anonymous"></script>
</head>
<body>
  <nav class="sidebar">
    <div class="sidebar-brand">Prism</div>
    <div class="sidebar-nav">
      ${navHtml}
    </div>
  </nav>
  <div class="main-area">
    <header class="topbar">
      <span class="topbar-title">${escapeHtml(title)}</span>
      <span class="topbar-user">
        ${escapeHtml(userName)}
        <a href="/logout">Logout</a>
      </span>
    </header>
    <main class="content" id="main-content">
      ${content}
    </main>
  </div>
</body>
</html>`;
}
