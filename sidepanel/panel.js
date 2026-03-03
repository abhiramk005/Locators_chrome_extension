// sidepanel/panel.js
const list = document.getElementById('list');
const btn = document.getElementById('inspect-btn');
const downloadBtn = document.getElementById('download-btn');

let active = false;
let sessionData = []; // Stores objects with {name, locator}

btn.onclick = async () => {
  active = !active;
  btn.textContent = active ? 'STOP' : 'Start Inspecting';
  btn.classList.toggle('active', active);
  
  chrome.runtime.sendMessage({ type: 'STATE_SYNC', value: active });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECT', value: active });
  }
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DISPLAY_LOCATOR') {
    sessionData.push({ name: msg.varName, locator: msg.locator });
    
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div style="color: #ff9d00; font-weight: bold; margin-bottom: 4px;">${msg.varName}</div>
      <code>${msg.locator}</code>
    `;
    list.prepend(div);
  }
});

downloadBtn.onclick = () => {
  if (sessionData.length === 0) return;

  let content = "*** Variables ***\n";
  sessionData.forEach(item => {
    // Standard Robot Framework spacing (4 spaces)
    content += `${item.name}    ${item.locator}\n`;
  });

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resources.robot';
  a.click();
};