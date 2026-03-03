// content.js
let isInspecting = false;
let highlight;

/**
 * 1. INITIALIZE HIGHLIGHTER
 * Uses a Shadow DOM to prevent website CSS from hiding or styling the green box.
 */
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
  // Attach to body if ready, otherwise wait for DOMContentLoaded
  if (document.body) {
    document.body.appendChild(host);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(host));
  }
}

createHighlighter();

/**
 * 2. LISTEN FOR TOGGLE COMMANDS
 * Toggles the 'isInspecting' state based on the Side Panel button.
 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_INSPECT') {
    isInspecting = msg.value;
    if (highlight) {
      highlight.style.display = isInspecting ? 'block' : 'none';
    }
    console.log("Robot Grabber: Inspecting is", isInspecting);
  }
});

/**
 * 3. MOUSE MOVE: UPDATE HIGHLIGHTER POSITION
 * Tracks the cursor and places the highlighter over the element found by DomUtils.
 */
document.addEventListener('mousemove', (e) => {
  if (!isInspecting || !highlight) return;
  
  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  
  // Ensure we aren't highlighting our own host element
  if (el && el.id !== 'pw-grabber-host') {
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  } else {
    highlight.style.display = 'none';
  }
}, { passive: true });

/**
 * 4. MOUSE DOWN: CAPTURE LOCATOR & VARIABLE NAME
 * When an element is clicked, it generates a Robot Framework locator 
 * and a variable name based on the element's text.
 */
document.addEventListener('mousedown', (e) => {
  if (!isInspecting) return;

  const el = DomUtils.getElementAtPoint(e.clientX, e.clientY);
  
  if (el) {
    // Generate data using DomUtils from utils/dom-utils.js
    const locator = DomUtils.generateLocator(el);
    const varName = DomUtils.generateVariableName(el);
    
    // Send captured data to background.js -> sidepanel/panel.js
    chrome.runtime.sendMessage({ 
      type: 'LOCATOR_CAPTURED', 
      locator: locator,
      varName: varName 
    });
    
    console.log(`Captured: ${varName} -> ${locator}`);
  }
  
  // We do NOT call preventDefault() here. 
  // This allows the website to function normally (navigation, login, etc.)
}, true); // 'true' uses the Capture phase to get the click before the site reacts.