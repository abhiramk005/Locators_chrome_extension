// sidepanel/panel.js
const list = document.getElementById('list');
const btn = document.getElementById('inspect-btn');
let active = false;

btn.onclick = async () => {
  active = !active;
  btn.textContent = active ? 'STOP' : 'START INSPECTING';
  btn.style.background = active ? '#ff4444' : '#333';
  
  // Update Background Script state
  chrome.runtime.sendMessage({ type: 'STATE_SYNC', value: active });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECT', value: active }).catch(err => {
        console.error("Content script not ready yet. Please refresh the page.");
    });
  }
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DISPLAY_LOCATOR') {
    const div = document.createElement('div');
    div.className = 'item'; // Using your CSS class
    div.innerHTML = `<code>${msg.locator}</code>`;
    list.prepend(div);
  }
});