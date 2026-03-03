// content.js
let isInspecting = false;
let highlight;

function createHighlighter() {
  if (document.getElementById('pw-grabber-host')) return;

  const host = document.createElement('div');
  host.id = 'pw-grabber-host';
  const shadow = host.attachShadow({mode: 'closed'});
  highlight = document.createElement('div');

  highlight.style.cssText = `
    position: fixed !important;
    pointer-events: none !important;
    border: 3px solid #00ff00 !important;
    background: rgba(0, 255, 0, 0.15) !important;
    z-index: 2147483647 !important;
    display: none !important;
    box-sizing: border-box !important;
    transition: all 0.05s ease-out !important;
  `;

  shadow.appendChild(highlight);
  (document.body || document.documentElement).appendChild(host);
}

// Initial setup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createHighlighter);
} else {
  createHighlighter();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_INSPECT') {
    isInspecting = msg.value;
    if (highlight) {
      highlight.style.display = isInspecting ? 'block' : 'none';
    }
    console.log("PW Grabber: Inspecting is", isInspecting);
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isInspecting || !highlight) return;
  
  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  if (el && el.id !== 'pw-grabber-host') {
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }
}, { passive: true });

document.addEventListener('mousedown', (e) => {
  if (!isInspecting) return;
  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  if (el) {
    const locator = DomUtils.generateLocator(el);
    chrome.runtime.sendMessage({ type: 'LOCATOR_CAPTURED', locator });
  }
}, true);