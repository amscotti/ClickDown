// ClickDown App - Alpine.js Components
window.isDragging = false;

// Toast notifications. Rendered with plain DOM (not Alpine) so they can be
// placed inside an open <dialog> — modal dialogs live in the browser "top
// layer", which paints above any z-index, so a body-level toast container is
// invisible while a dialog is open.
function dismissToast(toast) {
  if (!toast || toast.dataset.dismissed) return;
  toast.dataset.dismissed = '1';
  toast.classList.add('toast-hide');
  setTimeout(() => toast.remove(), 250);
}

window.showToast = ({ message, type = 'info', duration = 5000 } = {}) => {
  if (!message) return;
  const dialog = document.querySelector('dialog[open]');
  const host = dialog || document.querySelector('.toast-container');
  if (!host) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const text = document.createElement('span');
  text.textContent = message;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-dismiss';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';
  close.addEventListener('click', () => dismissToast(toast));

  toast.append(text, close);
  host.appendChild(toast);
  setTimeout(() => dismissToast(toast), duration);
};

window.addEventListener('show-toast', (event) => {
  window.showToast(event.detail || {});
});

// Close a task modal, flushing any pending inline-edit saves first.
// Closing via X / Close / Esc can happen while a field still has unsaved edits
// (e.g. the user never tabbed away). Detect dirty fields, PATCH them, wait for
// those requests to finish, then remove the dialog — removing early aborts HTMX.
window.closeTaskModal = (dialog) => {
  if (!dialog || dialog.dataset.closing === '1') return;
  dialog.dataset.closing = '1';

  function isDirty(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value !== el.defaultValue;
    }
    if (el instanceof HTMLSelectElement) {
      const initial = [...el.options].findIndex((o) => o.defaultSelected);
      return el.selectedIndex !== (initial < 0 ? 0 : initial);
    }
    return false;
  }

  // Only flush fields that actually changed — avoids N redundant PATCHes on close
  // that race with column reloads and can blank the board.
  const targets =
    typeof htmx !== 'undefined' ? [...dialog.querySelectorAll('[hx-patch]')].filter(isDirty) : [];

  if (targets.length === 0) {
    dialog.remove();
    return;
  }

  const targetSet = new Set(targets);
  let pending = 0;
  let started = false;
  let finished = false;
  let hardTimeout = 0;
  let idleTimeout = 0;

  const finish = (close = true) => {
    if (finished) return;
    finished = true;
    document.removeEventListener('htmx:beforeRequest', onBefore);
    document.removeEventListener('htmx:afterRequest', onAfter);
    document.removeEventListener('htmx:sendError', onAfter);
    clearTimeout(hardTimeout);
    clearTimeout(idleTimeout);
    if (close && dialog.isConnected) dialog.remove();
    if (!close) delete dialog.dataset.closing;
  };

  const onBefore = (event) => {
    if (!targetSet.has(event.detail?.elt)) return;
    pending += 1;
    started = true;
  };
  const onAfter = (event) => {
    if (!targetSet.has(event.detail?.elt)) return;
    pending = Math.max(0, pending - 1);
    if (event.type === 'htmx:sendError' || event.detail?.successful === false) {
      finish(false);
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { type: 'error', message: 'Could not save changes. The dialog was kept open.' },
        })
      );
      return;
    }
    if (started && pending === 0) finish(true);
  };

  document.addEventListener('htmx:beforeRequest', onBefore);
  document.addEventListener('htmx:afterRequest', onAfter);
  document.addEventListener('htmx:sendError', onAfter);

  for (const el of targets) {
    htmx.trigger(el, 'change');
  }

  // If HTMX decided not to issue a request, close shortly after.
  idleTimeout = setTimeout(() => {
    if (!started) finish();
  }, 150);

  // Absolute safety net so the modal never sticks open.
  hardTimeout = setTimeout(() => finish(false), 4000);
};

// Listen for toast events from HTMX
document.addEventListener('htmx:afterRequest', (event) => {
  // Check for HX-Trigger header (JSON format)
  const triggerHeader = event.detail.xhr.getResponseHeader('HX-Trigger');
  if (triggerHeader) {
    try {
      const data = JSON.parse(triggerHeader);
      if (data.toast) {
        // Dispatch toast event for Alpine to handle
        window.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: {
              message: data.toast.message || 'Operation completed',
              type: data.toast.type || 'info',
            },
          })
        );
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Also check for HX-Trigger header with simple format
  const simpleTrigger = event.detail.xhr.getResponseHeader('HX-Trigger');
  if (simpleTrigger && !simpleTrigger.includes('{')) {
    // Simple string format: "success:Task created" or "error:Something went wrong"
    const [type, message] = simpleTrigger.split(':');
    if (type && message && ['success', 'error', 'info'].includes(type)) {
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { type, message },
        })
      );
    }
  }
});

// Enable HTMX to swap elements on 400 Bad Request error responses (used for validation error returns)
document.addEventListener('htmx:beforeOnLoad', (event) => {
  if (event.detail.xhr.status === 400) {
    event.detail.shouldSwap = true;
    event.detail.isError = false;
  }
});

// Surface network/server failures (offline, restart, 5xx) — otherwise every
// HTMX action appears to silently do nothing and columns hang on "Loading…".
document.addEventListener('htmx:sendError', () => {
  window.showToast({
    type: 'error',
    message: 'Connection lost — check that the ClickDown server is running and try again.',
  });
});
document.addEventListener('htmx:timeout', () => {
  window.showToast({ type: 'error', message: 'The request timed out. Please try again.' });
});
document.addEventListener('htmx:responseError', (event) => {
  const status = event.detail?.xhr?.status;
  window.showToast({
    type: 'error',
    message:
      status === 429
        ? 'Too many requests — slow down and try again.'
        : 'The request failed. Please try again.',
  });
});

// Focus management for modals.
// Tracks the element that had focus before a modal opened, auto-focuses the
// first input inside new modals, traps Tab within the dialog, and restores
// focus when the modal closes.
let previouslyFocused = null;

// Reinitialize Alpine on any HTMX-swapped content (modals, WS OOB swaps, column refreshes).
document.addEventListener('htmx:afterSettle', (event) => {
  if (window.Alpine && typeof window.Alpine.initTree === 'function') {
    window.Alpine.initTree(event.detail.target);
  } else if (window.Alpine && typeof window.Alpine.process === 'function') {
    window.Alpine.process(event.detail.target);
  }
});

// Auto-focus first input when a modal is swapped in.
document.addEventListener('htmx:afterSwap', (event) => {
  const dialog =
    event.detail.target.querySelector?.('dialog') || event.detail.target.closest?.('dialog');
  if (dialog) {
    if (!previouslyFocused) previouslyFocused = document.activeElement;
    if (typeof htmx !== 'undefined') htmx.process(dialog);
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    // Only focus if nothing in the dialog is focused yet (browser's native
    // autofocus attribute may have already handled it).
    if (!dialog.contains(document.activeElement)) {
      const auto =
        dialog.querySelector('[autofocus]') ||
        dialog.querySelector('input, select, textarea, button:not([aria-label="Close"])');
      if (auto) auto.focus();
    }
  }
});

// Single observer for dialog removals. Handles both:
// 1. Restoring focus to the element focused before a modal opened.
// 2. Flushing a remote board refresh that was queued while a dialog was open
//    (board pages set body.dataset.boardRefreshPending; see board-refresh).
const dialogObserver = new MutationObserver(() => {
  if (document.querySelector('dialog[open]')) return;
  if (previouslyFocused) {
    previouslyFocused.focus();
    previouslyFocused = null;
  }
  if (document.body.dataset.boardRefreshPending) {
    delete document.body.dataset.boardRefreshPending;
    if (typeof window.reloadBoardPreservingFilters === 'function') {
      window.reloadBoardPreservingFilters();
    }
  }
});
dialogObserver.observe(document.body, { childList: true, subtree: true });

// Tab trap inside open dialogs.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const dialog = document.querySelector('dialog[open]');
  if (!dialog) return;
  const focusable = dialog.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Flash toast: read a toast stashed in a cookie by a redirecting action
// (HX-Redirect unloads the page before an HX-Trigger toast could show), then
// fire it once Alpine has wired up the toast listener, and clear the cookie.
(() => {
  let handled = false;
  function fireFlashToast() {
    if (handled) return;
    const match = document.cookie.match(/(?:^|;\s*)flashtoast=([^;]+)/);
    if (!match) return;
    handled = true;
    // Clear the cookie so the toast doesn't replay on refresh.
    // biome-ignore lint/suspicious/noDocumentCookie: intentional one-shot flash cookie clear
    document.cookie = 'flashtoast=; Path=/; SameSite=Lax; Max-Age=0';
    try {
      const data = JSON.parse(decodeURIComponent(match[1]));
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { message: data.message || 'Done', type: data.type || 'info' },
        })
      );
    } catch {
      // ignore malformed flash payload
    }
  }
  document.addEventListener('alpine:initialized', fireFlashToast);
  // Fallback in case the event already fired before the listener attached.
  window.addEventListener('load', () => setTimeout(fireFlashToast, 0));
})();

// Keyboard shortcuts (board pages): / focuses search, n opens "add task",
// Esc closes any open modal. Ignored while typing in form fields.
document.addEventListener('keydown', (event) => {
  const target = event.target;
  const tag = (target?.tagName ?? '').toLowerCase();
  const typing =
    tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
  const hasModifier = event.metaKey || event.ctrlKey || event.altKey;

  // Esc closes any open dialog, regardless of focus
  if (event.key === 'Escape') {
    const openDialog = document.querySelector('dialog[open]');
    if (openDialog) {
      closeTaskModal(openDialog);
      event.preventDefault();
    }
    return;
  }

  if (typing || hasModifier) return;

  if (event.key === '/') {
    const search = document.querySelector('.board-search');
    if (search) {
      event.preventDefault();
      search.focus();
    }
  } else if (event.key === 'n' || event.key === 'N') {
    const addTaskBtn = document.querySelector('.kanban-column .column-footer button');
    if (addTaskBtn) {
      event.preventDefault();
      addTaskBtn.click();
    }
  }
});
