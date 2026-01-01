// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open_chatgpt') {
    // 1. Save the prompt to storage so the content script on ChatGPT can pick it up
    chrome.storage.local.set({ 'pending_prompt': request.prompt }, () => {
      console.log('Prompt saved to storage.');
      
      // 2. Open ChatGPT
      chrome.tabs.create({ url: 'https://chatgpt.com' });
    });
  }
});
