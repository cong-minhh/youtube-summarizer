// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open_chatgpt') {
    // 1. Save the prompt to storage so the content script on ChatGPT can pick it up
    chrome.storage.local.set({ 'pending_prompt': request.prompt }, () => {
      console.log('Prompt saved to storage.');
      
      // 2. Open ChatGPT
      // Check if temporary chat was requested
      const baseUrl = 'https://chatgpt.com';
      const targetUrl = request.temporaryChat 
        ? `${baseUrl}/?temporary-chat=true` 
        : baseUrl;

      chrome.tabs.create({ url: targetUrl });
    });
  }
});
