// sidepanel/panel.js
const list = document.getElementById('list');
const btn = document.getElementById('inspect-btn');
const downloadBtn = document.getElementById('download-btn');
const copyAllBtn = document.getElementById('copy-all-btn');
let sessionElements = [];

btn.onclick = async () => {
  const active = btn.classList.toggle('active');
  btn.textContent = active ? 'STOP' : 'START INSPECTING';
  
  chrome.runtime.sendMessage({ type: 'STATE_SYNC', value: active });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECT', value: active });
  }
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DISPLAY_LOCATOR') {
    const isDuplicate = sessionElements.some(el => el.locator === msg.locator);
    if (isDuplicate) return;

    const metadata = msg.metadata || {};
    const elementData = { 
      id: Date.now(), 
      ai_purpose: `A ${metadata.role} with text "${metadata.text || metadata.placeholder || 'N/A'}" (${metadata.location_context})`,
      locator: msg.locator,
      technical_details: metadata 
    };

    sessionElements.push(elementData);
    renderItem(elementData);
  }
});

// chrome.runtime.onMessage.addListener((msg) => {
//   // Ensure the message has metadata before processing
//   if (msg.type === 'DISPLAY_LOCATOR' || msg.type === 'LOCATOR_CAPTURED') {
//     const metadata = msg.metadata || {}; // Safety fallback
//     const elementData = { 
//       id: Date.now(), 
//       ai_purpose: `A ${metadata.role || 'element'} with text "${metadata.text || 'N/A'}" (${metadata.location_context || 'Unknown context'})`,
//       locator: msg.locator,
//       technical_details: metadata
//     };
//     sessionElements.push(elementData);
//     renderItem(elementData);
//   }
// });

function renderItem(data) {
  const div = document.createElement('div');
  div.className = 'item';
  div.id = `item-${data.id}`;
  div.innerHTML = `
    <button class="remove-btn" title="Remove">&times;</button>
    <div class="purpose" style="color: #4CAF50; font-size: 11px; margin-bottom: 4px;">${data.ai_purpose}</div>
    <code style="font-size: 10px;">${data.locator}</code>
  `;

  div.querySelector('.remove-btn').onclick = () => {
    sessionElements = sessionElements.filter(el => el.id !== data.id);
    div.remove();
  };

  list.prepend(div);
}

// Global Copy for Claude API Bridge
// copyAllBtn.onclick = () => {
//   if (sessionElements.length === 0) return;
//   // Clean output: Remove internal IDs used for UI management
//   const aiReadyData = sessionElements.map(({ai_purpose, locator, technical_details}) => ({
//     ai_purpose, 
//     locator, 
//     technical_details
//   }));
  
//   const textToCopy = JSON.stringify(aiReadyData, null, 2);
  
//   navigator.clipboard.writeText(textToCopy).then(() => {
//     const originalText = copyAllBtn.textContent;
//     copyAllBtn.textContent = 'COPIED FOR AI!';
//     setTimeout(() => { copyAllBtn.textContent = originalText; }, 1500);
//   });
// };
copyAllBtn.onclick = () => {
  if (sessionElements.length === 0) return;

  const slimData = sessionElements.map(el => {
    const tech = el.technical_details;
    
    // Build context object dynamically to exclude nulls
    const context = {
      tag: tech.tagName,
      type: tech.type,
      name: tech.nameAttr
    };

    if (tech.placeholder) context.placeholder = tech.placeholder;
    if (tech.ariaLabel) context.ariaLabel = tech.ariaLabel; // Only add if it exists

    return {
      purpose: el.ai_purpose,
      locator: el.locator,
      context: context
    };
  });
  
  const textToCopy = JSON.stringify(slimData, null, 2);
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    const originalText = copyAllBtn.textContent;
    copyAllBtn.textContent = 'SLIM JSON COPIED!';
    setTimeout(() => { copyAllBtn.textContent = originalText; }, 1500);
  });
};

downloadBtn.onclick = () => {
  if (sessionElements.length === 0) return;
  const output = {
    project: "HomeWav AI Testing Map",
    url: window.location.href,
    elements: sessionElements.map(({ai_purpose, locator, technical_details}) => ({
      ai_purpose, locator, technical_details
    }))
  };
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'homewav_ai_context.json';
  a.click();
};