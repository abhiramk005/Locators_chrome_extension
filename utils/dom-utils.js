// dom-utils.js
const DomUtils = {
  getElementAtPoint: (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  },

  // Cleans element text to create a valid Robot Framework variable name
  generateVariableName: (el) => {
    let baseName = el.innerText?.trim() || el.getAttribute('aria-label') || el.id || el.tagName;
    
    // Remove special characters, replace spaces with underscores, and uppercase
    let cleanName = baseName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();

    // Append type suffix for clarity
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') cleanName += '_BTN';
    else if (tag === 'a') cleanName += '_LINK';
    else if (tag === 'input') cleanName += '_FIELD';

    return `\${${cleanName || 'ELEMENT'}}`;
  },

  generateLocator: (el) => {
    if (el.id) return `id=${el.id}`;

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
    if (testId) return `css=[data-testid='${testId}']`;

    const name = el.getAttribute('name');
    if (name) return `name=${name}`;

    const role = el.getAttribute('role') || DomUtils.getImplicitRole(el);
    const text = el.innerText?.trim().split('\n')[0].substring(0, 30);
    
    if (role && text) {
      return `xpath=//${el.tagName.toLowerCase()}[contains(text(), '${text.replace(/'/g, "\\'")}')]`;
    }

    if (el.placeholder) return `css=[placeholder='${el.placeholder}']`;

    return `xpath=//${el.tagName.toLowerCase()}`;
  },

  getImplicitRole: (el) => {
    const map = { 'BUTTON': 'button', 'A': 'link', 'INPUT': 'textbox' };
    return map[el.tagName] || null;
  }
};