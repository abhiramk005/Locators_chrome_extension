// sidepanel/panel.js
const list = document.getElementById('list');
const inspectBtn = document.getElementById('inspect-btn');
const extractBtn = document.getElementById('extract-dom-btn');
const copyAllBtn = document.getElementById('copy-all-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn'); // Added reference
let sessionElements = [];

inspectBtn.onclick = async () => {
  const active = inspectBtn.classList.toggle('active');
  inspectBtn.textContent = active ? 'STOP' : 'CLICK & EXTRACT';
  
  chrome.runtime.sendMessage({ type: 'STATE_SYNC', value: active });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECT', value: active });
};

extractBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'CRAWL_PAGE' });
};

// FIX: Added the Clear All function
clearBtn.onclick = () => {
  if (confirm("Clear all captured elements?")) {
    sessionElements = [];
    list.innerHTML = "";
  }
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DISPLAY_LOCATOR') {
    processNewElements([{ locator: msg.locator, metadata: msg.metadata }]);
  }
  if (msg.type === 'CRAWL_RESULTS') {
    processNewElements(msg.results);
  }
});

function processNewElements(newItems) {
  newItems.forEach(item => {
    if (sessionElements.some(el => el.locator === item.locator)) return;

    const data = {
      id: Date.now() + Math.random(),
      ai_purpose: `A ${item.metadata.role} with text "${item.metadata.text || item.metadata.placeholder || 'N/A'}" (${item.metadata.location_context})`,
      locator: item.locator,
      technical_details: item.metadata
    };
    sessionElements.push(data);
    renderItem(data);
  });
}

function renderItem(data) {
  const div = document.createElement('div');
  div.className = 'item';
  div.id = `item-${data.id}`;
  div.innerHTML = `
    <button class="remove-btn" title="Remove">&times;</button>
    <div class="purpose">${data.ai_purpose}</div>
    <code>${data.locator}</code>
  `;
  div.querySelector('.remove-btn').onclick = () => {
    sessionElements = sessionElements.filter(el => el.id !== data.id);
    div.remove();
  };
  list.prepend(div);
}

copyAllBtn.onclick = () => {
  if (sessionElements.length === 0) return;
  const slimData = sessionElements.map(el => ({
    purpose: el.ai_purpose,
    locator: el.locator,
    context: {
      tag: el.technical_details.tagName,
      type: el.technical_details.type,
      name: el.technical_details.nameAttr,
      ariaLabel: el.technical_details.ariaLabel || undefined
    }
  }));
  navigator.clipboard.writeText(JSON.stringify(slimData, null, 2)).then(() => {
    const old = copyAllBtn.textContent;
    copyAllBtn.textContent = 'JSON COPIED!';
    setTimeout(() => copyAllBtn.textContent = old, 1500);
  });
};