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
  generateLocator: (el) => {
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
    if (testId) return `page.getByTestId('${testId}')`;
    const role = el.getAttribute('role') || DomUtils.getImplicitRole(el);
    const text = el.innerText?.trim().split('\n')[0].substring(0, 30);
    if (role && text) return `page.getByRole('${role}', { name: '${text}' })`;
    if (el.placeholder) return `page.getByPlaceholder('${el.placeholder}')`;
    if (el.id) return `page.locator('#${el.id}')`;
    return `page.locator('${el.tagName.toLowerCase()}')`;
  },
  getImplicitRole: (el) => {
    const map = { 'BUTTON': 'button', 'A': 'link', 'INPUT': 'textbox', 'H1': 'heading' };
    return map[el.tagName] || null;
  }
};