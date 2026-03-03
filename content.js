// content.js
let isInspecting = false;
let highlight;

function createHighlighter() {
  if (document.getElementById('pw-grabber-host')) return;
  const host = document.createElement('div');
  host.id = 'pw-grabber-host';
  const shadow = host.attachShadow({mode: 'closed'});
  highlight = document.createElement('div');
  highlight.style.cssText = 'position:fixed;pointer-events:none;border:3px solid #00ff00;background:rgba(0,255,0,0.15);z-index:2147483647;display:none;';
  shadow.appendChild(highlight);
  (document.body || document.documentElement).appendChild(host);
}

createHighlighter();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_INSPECT') {
    isInspecting = msg.value;
    if (highlight) highlight.style.display = isInspecting ? 'block' : 'none';
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isInspecting || !highlight) return;
  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  if (el && el.id !== 'pw-grabber-host') {
    const rect = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: 'block', top: rect.top + 'px', left: rect.left + 'px',
      width: rect.width + 'px', height: rect.height + 'px'
    });
  }
}, { passive: true });

document.addEventListener('mousedown', (e) => {
  if (!isInspecting) return;
  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  if (el) {
    chrome.runtime.sendMessage({ 
      type: 'LOCATOR_CAPTURED', 
      locator: DomUtils.generateLocator(el),
      metadata: DomUtils.getElementMetadata(el) // New: Full detail object
    });
  }
}, true);