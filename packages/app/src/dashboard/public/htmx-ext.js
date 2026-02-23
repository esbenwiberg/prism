/**
 * HTMX extensions for the Prism dashboard.
 *
 * This file is served as a static asset. It provides custom HTMX
 * event handlers, a toast notification system, and other UI helpers.
 */

(function () {
  "use strict";

  // ── Toast System ────────────────────────────────────────────────────────────

  var TOAST_DURATION = 4000;
  var TOAST_FADE_DURATION = 300;

  var toastColors = {
    success: {
      border: "border-l-4 border-emerald-400",
      icon: '<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>',
    },
    error: {
      border: "border-l-4 border-red-400",
      icon: '<svg class="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>',
    },
    info: {
      border: "border-l-4 border-blue-400",
      icon: '<svg class="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>',
    },
  };

  function escapeText(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add("opacity-0", "translate-y-4");
    toast.classList.remove("opacity-100", "translate-y-0");
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, TOAST_FADE_DURATION);
  }

  function showToast(message, type) {
    var container = document.getElementById("toast-container");
    if (!container) return;

    type = type || "info";
    var colors = toastColors[type] || toastColors.info;

    var toast = document.createElement("div");
    toast.className =
      "pointer-events-auto flex items-center gap-3 rounded-lg bg-slate-800 px-4 py-3 shadow-lg ring-1 ring-slate-700 " +
      colors.border +
      " transform translate-y-4 opacity-0 transition-all duration-300 ease-out max-w-sm";

    toast.innerHTML =
      colors.icon +
      '<p class="text-sm text-slate-200">' +
      escapeText(message) +
      "</p>" +
      '<button class="ml-auto shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-200" aria-label="Dismiss">' +
      '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>' +
      "</button>";

    container.appendChild(toast);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.remove("translate-y-4", "opacity-0");
        toast.classList.add("translate-y-0", "opacity-100");
      });
    });

    var closeBtn = toast.querySelector("button");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        dismissToast(toast);
      });
    }

    setTimeout(function () {
      dismissToast(toast);
    }, TOAST_DURATION);
  }

  window.showToast = showToast;

  // ── HTMX Event Handlers ─────────────────────────────────────────────────────

  // Loading indicator
  document.addEventListener("htmx:beforeRequest", function () {
    document.body.classList.add("htmx-loading");
  });

  document.addEventListener("htmx:afterRequest", function () {
    document.body.classList.remove("htmx-loading");
  });

  // Update page title after HTMX swaps
  document.addEventListener("htmx:afterSwap", function (event) {
    var title = event.detail.target.querySelector("[data-page-title]");
    if (title) {
      document.title = title.getAttribute("data-page-title") + " — Prism";
    }
  });

  // Listen for showToast trigger from HX-Trigger response header
  document.addEventListener("showToast", function (evt) {
    var detail = evt.detail || {};
    var message = detail.message || (detail.value && detail.value.message) || "Action completed";
    var type = detail.type || (detail.value && detail.value.type) || "info";
    showToast(message, type);
  });

  // HTMX response error handler
  document.addEventListener("htmx:responseError", function (evt) {
    var detail = evt.detail || {};
    var xhr = detail.xhr;
    var status = xhr ? xhr.status : "Unknown";
    var statusText = xhr ? xhr.statusText : "Error";
    showToast("Error " + status + ": " + statusText, "error");
  });
})();
