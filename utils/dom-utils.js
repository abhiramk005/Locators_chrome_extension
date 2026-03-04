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

  // Scans the entire page for interactive elements currently in the DOM
  crawlPage: () => {
    const interactiveSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="checkbox"]'
    ];
    
    const elements = document.querySelectorAll(interactiveSelectors.join(','));
    const results = [];

    elements.forEach(el => {
      // Basic visibility check: ignore hidden elements (common in JS frameworks)
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
    const context = parent ? (parent.id || parent.tagName.toLowerCase()) : "body";
    
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

  // Returns true if a CSS selector matches exactly one element on the page
  _isUnique: (css) => {
    try { return document.querySelectorAll(css).length === 1; } catch { return false; }
  },

  // Returns true if an XPath matches exactly one element on the page
  _isUniqueXPath: (xpath) => {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotLength === 1;
    } catch { return false; }
  },

  // Checks if an id looks auto-generated (e.g. ":r3:", "input-47", "ember123")
  _isStableId: (id) => {
    if (!id) return false;
    if (/^[:$]/.test(id)) return false;               // React/Radix ":r3:"
    if (/[-_]\d+$/.test(id)) return false;            // "input-47", "field_2"
    if (/^(ember|mui|mantine|chakra)\d+/i.test(id)) return false; // framework IDs
    if (/^\d/.test(id)) return false;                  // starts with number
    return true;
  },

  // Filters out classes that are purely utility/state-based and carry no identity meaning
  _isStableClass: (c) => {
    if (c.length <= 1) return false;
    if (/^\d/.test(c)) return false;
    // Reject utility/state/layout classes from Tailwind, Bootstrap, and common JS frameworks
    return !/^(active|disabled|selected|hover|focus|open|visible|hidden|show|hide|fade|collapsed|expanded|loading|pending|error|success|warning|is-|has-|js-|no-|not-|d-|p-[0-9]|m-[0-9]|mt-|mb-|ml-|mr-|mx-|my-|pt-|pb-|pl-|pr-|px-|py-|text-|bg-|border-|flex$|grid$|block$|inline|float-|col-|row-|container$|wrapper$|clearfix|pull-|push-)/.test(c);
  },

  // Tries progressively more specific class combinations until one is unique
  _tryClassLocator: (el) => {
    const tag = el.tagName.toLowerCase();
    const stableClasses = [...el.classList].filter(DomUtils._isStableClass);
    if (stableClasses.length === 0) return null;

    // Try: just the element's own stable classes, from most-to-least specific
    // Attempt 1: all stable classes together
    const allClassSel = `${tag}.${stableClasses.map(c => CSS.escape(c)).join('.')}`;
    if (DomUtils._isUnique(allClassSel)) return `css=${allClassSel}`;

    // Attempt 2: each class individually (catches cases like `a.test_audio_video`)
    for (const c of stableClasses) {
      const single = `${tag}.${CSS.escape(c)}`;
      if (DomUtils._isUnique(single)) return `css=${single}`;
    }

    // Attempt 3: scope with nearest stable ancestor id + class combo
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (ancestor.id && DomUtils._isStableId(ancestor.id)) {
        const scoped = `#${CSS.escape(ancestor.id)} ${allClassSel}`;
        if (DomUtils._isUnique(scoped)) return `css=${scoped}`;

        // Also try each individual class scoped under the ancestor
        for (const c of stableClasses) {
          const scoped2 = `#${CSS.escape(ancestor.id)} ${tag}.${CSS.escape(c)}`;
          if (DomUtils._isUnique(scoped2)) return `css=${scoped2}`;
        }
        break; // Don't walk further up than the first stable ancestor
      }
      ancestor = ancestor.parentElement;
    }

    return null; // No unique class combo found
  },

  // Walks up the DOM to build a unique nth-child CSS path
  _buildCSSPath: (el) => {
    const parts = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Attach stable id if available — stops traversal early
      if (current.id && DomUtils._isStableId(current.id)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }

      // Attach useful classes (skip utility/state classes like "active", "disabled")
      const classes = [...current.classList].filter(c =>
        c.length > 1 &&
        !/^(active|disabled|selected|hover|focus|open|visible|hidden|show|fade|is-|has-)/.test(c) &&
        !/^\d/.test(c)
      );
      if (classes.length > 0 && classes.length <= 3) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }

      // Add nth-child only when needed for uniqueness at this level
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

    // ── TIER 1: Explicit test attributes (most stable, purpose-built for automation) ──
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') ||
                   el.getAttribute('data-cy') || el.getAttribute('data-qa') ||
                   el.getAttribute('data-automation');
    if (testId) {
      const attr = ['data-testid','data-test','data-cy','data-qa','data-automation']
        .find(a => el.getAttribute(a));
      return `css=[${attr}="${testId}"]`;
    }

    // ── TIER 2: Stable ID (skip auto-generated ones) ──
    if (el.id && DomUtils._isStableId(el.id)) {
      return `id=${el.id}`;
    }

    // ── TIER 3: Aria label (semantic, stable, great for accessibility-first apps) ──
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const css = `${tag}[aria-label="${ariaLabel}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
    }

    // ── TIER 4: name attribute (very reliable for form fields) ──
    const name = el.getAttribute('name');
    if (name) {
      const css = `${tag}[name="${name}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
      // If not unique, scope it with type too
      if (el.type) {
        const scoped = `${tag}[name="${name}"][type="${el.type}"]`;
        if (DomUtils._isUnique(scoped)) return `css=${scoped}`;
      }
    }

    // ── TIER 5: placeholder (good for inputs that lack name/label) ──
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) {
      const css = `${tag}[placeholder="${placeholder}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
    }

    // ── TIER 6: role + aria-label combo ──
    const role = el.getAttribute('role');
    if (role && ariaLabel) {
      const css = `[role="${role}"][aria-label="${ariaLabel}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;
    }

    // ── TIER 7: Exact full visible text (only for short, static-looking text) ──
    const fullText = el.innerText?.trim();
    if (fullText && fullText.length > 0 && fullText.length <= 50 && !/\d{2,}/.test(fullText)) {
      const escaped = fullText.replace(/'/g, "\\'");
      const xpath = `//${tag}[normalize-space(.)='${escaped}']`;
      if (DomUtils._isUniqueXPath(xpath)) return `xpath=${xpath}`;
    }

    // ── TIER 8: href for anchor tags ──
    if (tag === 'a' && el.getAttribute('href')) {
      const href = el.getAttribute('href');
      // Only use clean, non-dynamic hrefs
      if (!href.includes('?') && !href.includes('#') && href.length < 60) {
        const css = `a[href="${href}"]`;
        if (DomUtils._isUnique(css)) return `css=${css}`;
      }
    }

    // ── TIER 9: type + value for buttons/submits ──
    if ((tag === 'button' || tag === 'input') && el.type) {
      const val = el.value || el.getAttribute('value');
      if (val) {
        const css = `${tag}[type="${el.type}"][value="${val}"]`;
        if (DomUtils._isUnique(css)) return `css=${css}`;
      }
      // type alone (e.g. input[type="file"] — often unique enough)
      const cssType = `${tag}[type="${el.type}"]`;
      if (DomUtils._isUnique(cssType)) return `css=${cssType}`;
    }

    // ── TIER 9.5: Class-only locator (simpler than full structural path) ──
    // Tries stable semantic classes before resorting to full DOM traversal.
    // e.g. "a.test_audio_video" instead of "header.navbar > div:nth-of-type(1) > a.test_audio_video"
    const classLocator = DomUtils._tryClassLocator(el);
    if (classLocator) return classLocator;

    // ── TIER 10: Structural CSS path as last resort ──
    const cssPath = DomUtils._buildCSSPath(el);
    if (cssPath && DomUtils._isUnique(cssPath)) return `css=${cssPath}`;

    // ── FINAL FALLBACK: return best CSS path even if not verified unique ──
    return `css=${cssPath || tag} /* WARNING: may not be unique */`;
  },

  getImplicitRole: (el) => {
    const map = { 'BUTTON': 'button', 'A': 'link', 'INPUT': 'textbox', 'SELECT': 'combobox' };
    return map[el.tagName] || null;
  }
};