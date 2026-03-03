// content.js
let isInspecting = false;
let highlight;

function createHighlighter() {
  // If it already exists, don't create it again
  if (document.getElementById('pw-grabber-host')) return;

  const host = document.createElement('div');
  host.id = 'pw-grabber-host';
  const shadow = host.attachShadow({mode: 'closed'});
  highlight = document.createElement('div');

  // Ensure high z-index and fixed position so it stays on top
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

// Initialize on first load
createHighlighter();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_INSPECT') {
    isInspecting = msg.value;
    if (isInspecting) {
      createHighlighter(); // Ensure it exists when turned on
      if (highlight) highlight.style.display = 'block';
    } else {
      if (highlight) highlight.style.display = 'none';
    }
  }
  
  if (msg.type === 'CRAWL_PAGE') {
    const results = DomUtils.crawlPage();
    chrome.runtime.sendMessage({ type: 'CRAWL_RESULTS', results });
  }
});

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

// THE CRITICAL FIX: Re-create and show highlighter if page loads while inspecting is active
chrome.runtime.sendMessage({ type: 'GET_INSPECT_STATE' }, (response) => {
  if (response && response.isInspecting) {
    isInspecting = true;
    createHighlighter(); // Rebuild the visual box for the new page
    if (highlight) highlight.style.display = 'block';
    console.log("Highlighter re-created for new page context.");
  }
});