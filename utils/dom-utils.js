// utils/dom-utils.js
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

  getElementMetadata: (el) => {
    const parent = el.closest('header, footer, form, nav, section');
    const context = parent ? (parent.id || parent.tagName.toLowerCase()) : "body";
    
    return {
      tagName: el.tagName.toLowerCase(),
      type: el.type || null,
      text: el.innerText?.trim().substring(0, 50) || null,
      placeholder: el.placeholder || null,
      ariaLabel: el.getAttribute('aria-label') || null, //
      nameAttr: el.getAttribute('name') || null,
      role: el.getAttribute('role') || DomUtils.getImplicitRole(el),
      location_context: `in ${context}`
    };
  },

  generateLocator: (el) => {
    if (el.id) return `id=${el.id}`;
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
    if (testId) return `css=[data-testid='${testId}']`;
    const name = el.getAttribute('name');
    if (name) return `name=${name}`;
    const text = el.innerText?.trim().split('\n')[0].substring(0, 30);
    if (text) return `xpath=//${el.tagName.toLowerCase()}[contains(text(), '${text.replace(/'/g, "\\'")}')]`;
    return `xpath=//${el.tagName.toLowerCase()}`;
  },

  getImplicitRole: (el) => {
    const map = { 'BUTTON': 'button', 'A': 'link', 'INPUT': 'textbox', 'SELECT': 'combobox' };
    return map[el.tagName] || null;
  }
};