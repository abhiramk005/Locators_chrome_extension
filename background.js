// background.js
let isInspectingGlobal = false;
let isAutoCrawlGlobal = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_INSPECT_STATE') {
    sendResponse({ isInspecting: isInspectingGlobal });
    return true;
  }

  if (message.type === 'GET_AUTO_CRAWL_STATE') {
    sendResponse({ isAutoCrawl: isAutoCrawlGlobal });
    return true;
  }

  if (message.type === 'STATE_SYNC') {
    isInspectingGlobal = message.value;
  }

  if (message.type === 'AUTO_CRAWL_SYNC') {
    isAutoCrawlGlobal = message.value;
  }

  if (message.type === 'LOCATOR_CAPTURED') {
    chrome.runtime.sendMessage({ ...message, type: 'DISPLAY_LOCATOR' }).catch(() => {});
  }

  if (message.type === 'CRAWL_RESULTS') {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});

// Only needed to re-activate the inspect highlighter on hard page loads.
// Auto crawl is fully driven by MutationObserver in content.js —
// it self-restores by checking GET_AUTO_CRAWL_STATE on script load.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (isInspectingGlobal) {
    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECT', value: true }).catch(() => {});
  }
});