// content.js
let isInspecting = false;
let highlight;
let mutationObserver = null;

// Waits for DOM changes to settle before crawling.
// Prevents hammering on pages with rapid re-renders (React, animations etc.)
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Highlighter (Shadow DOM — never conflicts with page styles) ──
function createHighlighter() {
  if (document.getElementById('pw-grabber-host')) return;
  const host = document.createElement('div');
  host.id = 'pw-grabber-host';
  const shadow = host.attachShadow({ mode: 'closed' });
  highlight = document.createElement('div');
  highlight.style.cssText = `
    position: fixed !important;
    pointer-events: none !important;
    border: 3px solid #00ff00 !important;
    background: rgba(0, 255, 0, 0.15) !important;
    z-index: 2147483647 !important;
    display: none !important;
    box-sizing: border-box !important;
  `;
  shadow.appendChild(highlight);
  (document.body || document.documentElement).appendChild(host);
}

createHighlighter();

// ── Core crawl function ──
// Shared by: manual EXTRACT DOM button, AUTO CRAWL on load, MutationObserver trigger.
function runCrawl() {
  const results = DomUtils.crawlPage();
  chrome.runtime.sendMessage({
    type: 'CRAWL_RESULTS',
    results,
    url: window.location.href,
    source: 'crawl'
  });
}

// Debounced crawl — used by MutationObserver.
// Waits 600ms after the last DOM change so React/Vue/Angular finishes
// all its re-renders before we scan. One clean snapshot instead of many partial ones.
const debouncedCrawl = debounce(runCrawl, 600);

// ── MutationObserver ──
// When AUTO CRAWL is ON, this watches the entire DOM continuously.
// Any new nodes added (modal open, SPA route change, dropdown expand,
// lazy load, anything) → triggers a full re-crawl after 600ms settle time.
// The panel's deduplication ensures only genuinely new elements are added.
function startMutationObserver() {
  if (mutationObserver) return;
  mutationObserver = new MutationObserver((mutations) => {
    const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
    if (hasNewNodes) debouncedCrawl();
  });
  mutationObserver.observe(document.body || document.documentElement, {
    childList: true, // watch for added/removed nodes
    subtree: true    // watch entire DOM tree, not just top level
  });
}

function stopMutationObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Heartbeat — lets panel know this content script is alive after extension reload
  if (msg.type === 'PING') {
    sendResponse({ alive: true });
    return true;
  }

  if (msg.type === 'TOGGLE_INSPECT') {
    isInspecting = msg.value;
    if (isInspecting) {
      createHighlighter();
      if (highlight) highlight.style.display = 'block';
    } else {
      if (highlight) highlight.style.display = 'none';
    }
  }

  // Manual one-shot crawl (EXTRACT DOM button)
  if (msg.type === 'CRAWL_PAGE') {
    runCrawl();
  }

  // AUTO CRAWL ON — immediate crawl + start watching DOM for changes
  if (msg.type === 'START_AUTO_CRAWL') {
    runCrawl();
    startMutationObserver();
  }

  // AUTO CRAWL OFF — stop watching
  if (msg.type === 'STOP_AUTO_CRAWL') {
    stopMutationObserver();
  }
});

// ── Mouse hover highlighter ──
document.addEventListener('mousemove', (e) => {
  if (!isInspecting || !highlight) return;
  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  if (el && el.id !== 'pw-grabber-host') {
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.top = rect.top + 'px';
    highlight.style.left = rect.left + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
  } else {
    highlight.style.display = 'none';
  }
}, { passive: true });

// ── Click to capture ──
document.addEventListener('mousedown', (e) => {
  if (!isInspecting) return;
  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  if (el) {
    chrome.runtime.sendMessage({
      type: 'LOCATOR_CAPTURED',
      locator: DomUtils.generateLocator(el),
      metadata: DomUtils.getElementMetadata(el)
    });
  }
}, true);

// ── Restore state after extension reload or hard page navigation ──
chrome.runtime.sendMessage({ type: 'GET_INSPECT_STATE' }, (response) => {
  if (response && response.isInspecting) {
    isInspecting = true;
    createHighlighter();
    if (highlight) highlight.style.display = 'block';
  }
});

chrome.runtime.sendMessage({ type: 'GET_AUTO_CRAWL_STATE' }, (response) => {
  if (response && response.isAutoCrawl) {
    runCrawl();
    startMutationObserver();
  }
});