/**
 * HTMX extensions for the Prism dashboard.
 *
 * This file is served as a static asset. It provides custom HTMX
 * event handlers and extensions for enhanced interactivity.
 */

// Add a loading indicator class to body during HTMX requests
document.addEventListener("htmx:beforeRequest", function () {
  document.body.classList.add("htmx-loading");
});

document.addEventListener("htmx:afterRequest", function () {
  document.body.classList.remove("htmx-loading");
});

// Update page title after HTMX swaps (reads data-page-title from response)
document.addEventListener("htmx:afterSwap", function (event) {
  var title = event.detail.target.querySelector("[data-page-title]");
  if (title) {
    document.title = title.getAttribute("data-page-title") + " — Prism";
  }
});
