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

  crawlPage: () => {
    const interactiveSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="checkbox"]'
    ];
    const elements = document.querySelectorAll(interactiveSelectors.join(','));
    const results = [];
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (el.offsetWidth > 0 && el.offsetHeight > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
        results.push({
          locator: DomUtils.generateLocator(el),
          metadata: DomUtils.getElementMetadata(el)
        });
      }
    });
    return results;
  },

  getElementMetadata: (el) => {
    const parent = el.closest('header, footer, form, nav, section');
    const context = parent ? (parent.id || parent.tagName.toLowerCase()) : 'body';
    return {
      tagName: el.tagName.toLowerCase(),
      type: el.type || null,
      text: el.innerText?.trim().substring(0, 50) || null,
      placeholder: el.placeholder || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      nameAttr: el.getAttribute('name') || null,
      role: el.getAttribute('role') || DomUtils.getImplicitRole(el),
      location_context: `in ${context}`
    };
  },

  _isUnique: (css) => {
    try { return document.querySelectorAll(css).length === 1; } catch { return false; }
  },

  _isUniqueXPath: (xpath) => {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotLength === 1;
    } catch { return false; }
  },

  _isStableId: (id) => {
    if (!id) return false;
    if (/^[:$]/.test(id)) return false;
    if (/[-_]\d+$/.test(id)) return false;
    if (/^(ember|mui|mantine|chakra)\d+/i.test(id)) return false;
    if (/^\d/.test(id)) return false;
    return true;
  },

  _isStableClass: (c) => {
    if (c.length <= 1) return false;
    if (/^\d/.test(c)) return false;
    return !/^(active|disabled|selected|hover|focus|open|visible|hidden|show|hide|fade|collapsed|expanded|loading|pending|error|success|warning|is-|has-|js-|no-|not-|d-|p-[0-9]|m-[0-9]|mt-|mb-|ml-|mr-|mx-|my-|pt-|pb-|pl-|pr-|px-|py-|text-|bg-|border-|flex$|grid$|block$|inline|float-|col-|row-|container$|wrapper$|clearfix|pull-|push-)/.test(c);
  },

  _tryClassLocator: (el) => {
    const tag = el.tagName.toLowerCase();
    const stableClasses = [...el.classList].filter(DomUtils._isStableClass);
    if (stableClasses.length === 0) return null;

    const allClassSel = `${tag}.${stableClasses.map(c => CSS.escape(c)).join('.')}`;
    if (DomUtils._isUnique(allClassSel)) return `css=${allClassSel}`;

    for (const c of stableClasses) {
      const single = `${tag}.${CSS.escape(c)}`;
      if (DomUtils._isUnique(single)) return `css=${single}`;
    }

    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (ancestor.id && DomUtils._isStableId(ancestor.id)) {
        const scoped = `#${CSS.escape(ancestor.id)} ${allClassSel}`;
        if (DomUtils._isUnique(scoped)) return `css=${scoped}`;
        for (const c of stableClasses) {
          const scoped2 = `#${CSS.escape(ancestor.id)} ${tag}.${CSS.escape(c)}`;
          if (DomUtils._isUnique(scoped2)) return `css=${scoped2}`;
        }
        break;
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  },

  _buildCSSPath: (el) => {
    const parts = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id && DomUtils._isStableId(current.id)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const classes = [...current.classList].filter(c =>
        c.length > 1 &&
        !/^(active|disabled|selected|hover|focus|open|visible|hidden|show|fade|is-|has-)/.test(c) &&
        !/^\d/.test(c)
      );
      if (classes.length > 0 && classes.length <= 3) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter(s => s.tagName === current.tagName)
        : [];
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  },

  generateLocator: (el) => {
    const tag = el.tagName.toLowerCase();

    // TIER 1: Test attributes
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') ||
                   el.getAttribute('data-cy') || el.getAttribute('data-qa') ||
                   el.getAttribute('data-automation');
    if (testId) {
      const attr = ['data-testid','data-test','data-cy','data-qa','data-automation'].find(a => el.getAttribute(a));
      return `css=[${attr}="${testId}"]`;
    }

    // TIER 2: Stable ID
    if (el.id && DomUtils._isStableId(el.id)) return `id=${el.id}`;

    // TIER 3: Aria label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const css = `${tag}[aria-label="${ariaLabel}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
    }

    // TIER 4: name attribute
    const name = el.getAttribute('name');
    if (name) {
      const css = `${tag}[name="${name}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
      if (el.type) {
        const scoped = `${tag}[name="${name}"][type="${el.type}"]`;
        if (DomUtils._isUnique(scoped)) return `css=${scoped}`;
      }
    }

    // TIER 5: placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) {
      const css = `${tag}[placeholder="${placeholder}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
    }

    // TIER 6: role + aria-label
    const role = el.getAttribute('role');
    if (role && ariaLabel) {
      const css = `[role="${role}"][aria-label="${ariaLabel}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
    }

    // TIER 7: Exact visible text
    const fullText = el.innerText?.trim();
    if (fullText && fullText.length > 0 && fullText.length <= 50 && !/\d{2,}/.test(fullText)) {
      const escaped = fullText.replace(/'/g, "\\'");
      const xpath = `//${tag}[normalize-space(.)='${escaped}']`;
      if (DomUtils._isUniqueXPath(xpath)) return `xpath=${xpath}`;
    }

    // TIER 8: href for anchors
    if (tag === 'a' && el.getAttribute('href')) {
      const href = el.getAttribute('href');
      if (!href.includes('?') && !href.includes('#') && href.length < 60) {
        const css = `a[href="${href}"]`;
        if (DomUtils._isUnique(css)) return `css=${css}`;
      }
    }

    // TIER 9: type + value
    if ((tag === 'button' || tag === 'input') && el.type) {
      const val = el.value || el.getAttribute('value');
      if (val) {
        const css = `${tag}[type="${el.type}"][value="${val}"]`;
        if (DomUtils._isUnique(css)) return `css=${css}`;
      }
      const cssType = `${tag}[type="${el.type}"]`;
      if (DomUtils._isUnique(cssType)) return `css=${cssType}`;
    }

    // TIER 9.5: Class-only locator
    const classLocator = DomUtils._tryClassLocator(el);
    if (classLocator) return classLocator;

    // TIER 10: Full structural CSS path
    const cssPath = DomUtils._buildCSSPath(el);
    if (cssPath && DomUtils._isUnique(cssPath)) return `css=${cssPath}`;

    return `css=${cssPath || tag} /* WARNING: may not be unique */`;
  },

  getImplicitRole: (el) => {
    const map = { 'BUTTON': 'button', 'A': 'link', 'INPUT': 'textbox', 'SELECT': 'combobox' };
    return map[el.tagName] || null;
  }
};