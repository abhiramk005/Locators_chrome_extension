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

  // ── Noise containers — elements inside these are not worth capturing ──
  // Virtual keyboards, emoji pickers, per-message actions, tooltips etc.
  // are all UI chrome that produces deep, fragile, useless locators.
  _noiseContainerSelector: [
    '[class*="keyboard-layout"]', '[class*="keyboard-row"]', '[class*="keyboard-buttons"]',
    '[class*="emoji-picker"]', '[class*="emoji-grid"]', '[class*="emoji-mart"]',
    '[class*="context-menu"]', '[class*="dropdown-menu"]',
    '[class*="tooltip"]', '[class*="popover"]',
    '[class*="color-picker"]', '[class*="date-picker"]', '[class*="time-picker"]',
    '[class*="pagination"]',
    '[aria-hidden="true"]'
  ].join(','),

  // ── Quality gate for generated locators ──
  // Returns false for locators that are too fragile to be useful:
  // - Deep structural paths (>6 levels) where the element itself has no identity
  // - Pure nth-of-type chains with no semantic anchors
  _isUsableLocator: (locator, el) => {
    if (!locator) return false;

    // Reject WARNING locators — not unique, useless for automation
    if (locator.includes('WARNING')) return false;

    // Only apply structural checks to css= paths that use nth-of-type (Tier 10 fallback)
    if (locator.startsWith('css=') && locator.includes(':nth-of-type')) {
      const depth = (locator.match(/>/g) || []).length;

      // Reject anything deeper than 5 levels — too fragile regardless of element identity.
      // A 6-level path breaks if any ancestor is reordered, added, or removed.
      if (depth > 5) return false;

      // Reject paths whose ROOT segment is a generic container with nth-of-type.
      // e.g. "div.container-fluid.available:nth-of-type(13)" as the first segment
      // means the path is anchored to a positional index that shifts constantly.
      const rootSegment = locator.slice(4).split('>')[0].trim();
      // Reject paths rooted on a generic positional container (depth must also be > 2
      // so shallow paths like "div.wrapper:nth-of-type(2) > button.save" still pass)
      const rootIsPositional = depth > 2 &&
        rootSegment.includes(':nth-of-type') &&
        /^div\.(container|wrapper|row|col|layout|panel|page|app|main|content)/.test(rootSegment);
      if (rootIsPositional) return false;
    }

    return true;
  },

  crawlPage: () => {
    const interactiveSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="checkbox"]'
    ];
    const elements = document.querySelectorAll(interactiveSelectors.join(','));
    const results = [];

    elements.forEach(el => {
      // ── Visibility check ──
      const style = window.getComputedStyle(el);
      if (el.offsetWidth === 0 || el.offsetHeight === 0 ||
          style.visibility === 'hidden' || style.display === 'none') return;

      // ── Noise filter — skip elements inside noisy UI containers ──
      if (el.closest(DomUtils._noiseContainerSelector)) return;

      const locator = DomUtils.generateLocator(el);

      // ── Quality gate — skip elements that produce unusable locators ──
      if (!DomUtils._isUsableLocator(locator, el)) return;

      results.push({
        locator,
        metadata: DomUtils.getElementMetadata(el)
      });
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

  // ── Finds an element on the page by its locator string ──
  // Used by the highlight-on-hover feature in the panel.
  findByLocator: (locator) => {
    try {
      if (locator.startsWith('id=')) {
        return document.getElementById(locator.slice(3));
      }
      if (locator.startsWith('css=')) {
        return document.querySelector(locator.slice(4));
      }
      if (locator.startsWith('xpath=')) {
        const result = document.evaluate(
          locator.slice(6), document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        );
        return result.singleNodeValue;
      }
      if (locator.startsWith('name=')) {
        return document.querySelector(`[name="${locator.slice(5)}"]`);
      }
    } catch { return null; }
    return null;
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

    // Attempt 1: all stable classes on element alone
    const allClassSel = `${tag}.${stableClasses.map(c => CSS.escape(c)).join('.')}`;
    if (DomUtils._isUnique(allClassSel)) return `css=${allClassSel}`;

    // Attempt 2: each individual class alone
    for (const c of stableClasses) {
      const single = `${tag}.${CSS.escape(c)}`;
      if (DomUtils._isUnique(single)) return `css=${single}`;
    }

    // Attempt 3 & 4: walk ancestors, try scoping with BOTH stable IDs and stable classes
    // This is the key fix — pages without stable IDs (like chat apps) still have
    // stable semantic classes on ancestor containers we can scope against
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body) {
      // Scope with stable ancestor ID (original behaviour)
      if (ancestor.id && DomUtils._isStableId(ancestor.id)) {
        const scoped = `#${CSS.escape(ancestor.id)} ${allClassSel}`;
        if (DomUtils._isUnique(scoped)) return `css=${scoped}`;
        for (const c of stableClasses) {
          const scoped2 = `#${CSS.escape(ancestor.id)} ${tag}.${CSS.escape(c)}`;
          if (DomUtils._isUnique(scoped2)) return `css=${scoped2}`;
        }
        break; // found a stable ID ancestor — don't walk further
      }

      // Scope with stable ancestor CLASSES (new — handles ID-less pages like chat apps)
      const ancestorStableClasses = [...ancestor.classList].filter(DomUtils._isStableClass);
      if (ancestorStableClasses.length > 0) {
        const ancestorTag = ancestor.tagName.toLowerCase();
        const ancestorSel = `${ancestorTag}.${ancestorStableClasses.map(c => CSS.escape(c)).join('.')}`;
        // Only use this ancestor as scope if IT is unique on the page
        if (DomUtils._isUnique(ancestorSel)) {
          const scoped = `${ancestorSel} ${allClassSel}`;
          if (DomUtils._isUnique(scoped)) return `css=${scoped}`;
          for (const c of stableClasses) {
            const scoped2 = `${ancestorSel} ${tag}.${CSS.escape(c)}`;
            if (DomUtils._isUnique(scoped2)) return `css=${scoped2}`;
          }
        }
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

    // TIER 3: Aria label — try alone, then scoped under nearest meaningful ancestor
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const css = `${tag}[aria-label="${ariaLabel}"]`;
      if (DomUtils._isUnique(css)) return `css=${css}`;

      // Not unique alone — scope with nearest ancestor that has a stable id or unique class
      let ancestor = el.parentElement;
      while (ancestor && ancestor !== document.body) {
        // Try scoping under stable ancestor ID
        if (ancestor.id && DomUtils._isStableId(ancestor.id)) {
          const scoped = `#${CSS.escape(ancestor.id)} ${css}`;
          if (DomUtils._isUnique(scoped)) return `css=${scoped}`;
          break;
        }
        // Try scoping under ancestor with a stable unique class
        const ancestorClasses = [...ancestor.classList].filter(DomUtils._isStableClass);
        for (const c of ancestorClasses) {
          const scoped = `${ancestor.tagName.toLowerCase()}.${CSS.escape(c)} ${css}`;
          if (DomUtils._isUnique(scoped)) return `css=${scoped}`;
        }
        ancestor = ancestor.parentElement;
      }
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

    // TIER 7: Exact visible text — try alone, then scoped under nearest ancestor
    const fullText = el.innerText?.trim();
    if (fullText && fullText.length > 0 && fullText.length <= 50 && !/\d{2,}/.test(fullText)) {
      const escaped = fullText.replace(/'/g, "\\'");
      const xpath = `//${tag}[normalize-space(.)='${escaped}']`;
      if (DomUtils._isUniqueXPath(xpath)) return `xpath=${xpath}`;

      // Not unique alone — scope under nearest stable ancestor
      let ancestor = el.parentElement;
      while (ancestor && ancestor !== document.body) {
        if (ancestor.id && DomUtils._isStableId(ancestor.id)) {
          const scoped = `//*[@id='${ancestor.id}']//${tag}[normalize-space(.)='${escaped}']`;
          if (DomUtils._isUniqueXPath(scoped)) return `xpath=${scoped}`;
          break;
        }
        const ancestorClasses = [...ancestor.classList].filter(DomUtils._isStableClass);
        for (const c of ancestorClasses) {
          const scoped = `css=${ancestor.tagName.toLowerCase()}.${CSS.escape(c)} ${tag}`;
          const scopedXpath = `//${ancestor.tagName.toLowerCase()}[contains(@class,'${c}')]//${tag}[normalize-space(.)='${escaped}']`;
          if (DomUtils._isUniqueXPath(scopedXpath)) return `xpath=${scopedXpath}`;
        }
        ancestor = ancestor.parentElement;
      }
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