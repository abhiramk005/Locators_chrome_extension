// content.js
let isInspecting = false;
let highlight;
let mutationObserver = null;
let pinnedHighlight = null; // separate highlight element for panel hover

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

// ── Pinned highlight — shown when hovering a panel item ──
// Uses a separate element so it doesn't interfere with the inspect hover highlight
function createPinnedHighlight() {
  if (document.getElementById('pw-pinned-host')) return;
  const host = document.createElement('div');
  host.id = 'pw-pinned-host';
  const shadow = host.attachShadow({ mode: 'closed' });
  pinnedHighlight = document.createElement('div');
  pinnedHighlight.style.cssText = `
    position: fixed !important;
    pointer-events: none !important;
    border: 2px solid #f59e0b !important;
    background: rgba(245, 158, 11, 0.15) !important;
    z-index: 2147483646 !important;
    display: none !important;
    box-sizing: border-box !important;
    border-radius: 3px !important;
    transition: all 0.15s ease !important;
  `;

  // Label to show the locator string above the highlight box
  const label = document.createElement('div');
  label.id = 'pw-pinned-label';
  label.style.cssText = `
    position: absolute !important;
    bottom: 100% !important;
    left: 0 !important;
    background: #f59e0b !important;
    color: #000 !important;
    font-size: 11px !important;
    font-family: monospace !important;
    padding: 2px 6px !important;
    border-radius: 3px 3px 0 0 !important;
    white-space: nowrap !important;
    max-width: 400px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    pointer-events: none !important;
  `;
  pinnedHighlight.appendChild(label);
  shadow.appendChild(pinnedHighlight);
  (document.body || document.documentElement).appendChild(host);
}

createHighlighter();
createPinnedHighlight();

// ── Core crawl function ──
function runCrawl() {
  const results = DomUtils.crawlPage();
  chrome.runtime.sendMessage({
    type: 'CRAWL_RESULTS',
    results,
    url: window.location.href,
    source: 'crawl'
  });
}

const debouncedCrawl = debounce(runCrawl, 600);

// ── MutationObserver ──
function startMutationObserver() {
  if (mutationObserver) return;
  mutationObserver = new MutationObserver((mutations) => {
    const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
    if (hasNewNodes) debouncedCrawl();
  });
  mutationObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
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

  if (msg.type === 'CRAWL_PAGE') {
    runCrawl();
  }

  if (msg.type === 'START_AUTO_CRAWL') {
    runCrawl();
    startMutationObserver();
  }

  if (msg.type === 'STOP_AUTO_CRAWL') {
    stopMutationObserver();
  }

  // ── Highlight a specific element by its locator (panel item hover) ──
  if (msg.type === 'HIGHLIGHT_LOCATOR') {
    createPinnedHighlight();
    const el = DomUtils.findByLocator(msg.locator);
    if (el && pinnedHighlight) {
      const rect = el.getBoundingClientRect();
      // Only show if element is actually in viewport
      if (rect.width > 0 && rect.height > 0) {
        pinnedHighlight.style.display = 'block';
        pinnedHighlight.style.top = rect.top + 'px';
        pinnedHighlight.style.left = rect.left + 'px';
        pinnedHighlight.style.width = rect.width + 'px';
        pinnedHighlight.style.height = rect.height + 'px';
        // Show a short version of the locator as label
        const label = pinnedHighlight.querySelector('#pw-pinned-label');
        if (label) label.textContent = msg.locator.length > 60
          ? msg.locator.substring(0, 57) + '...'
          : msg.locator;
        // Scroll element into view smoothly if it's off screen
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // ── Clear the pinned highlight (panel item mouse leave) ──
  if (msg.type === 'CLEAR_HIGHLIGHT') {
    if (pinnedHighlight) pinnedHighlight.style.display = 'none';
  }
});

// ── Mouse hover highlight (inspect mode) ──
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