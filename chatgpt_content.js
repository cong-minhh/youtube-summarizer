// chatgpt_content.js

async function checkAndPastePrompt() {
  try {
    const data = await chrome.storage.local.get('pending_prompt');
    const prompt = data.pending_prompt;

    if (prompt) {
      console.log('Found pending prompt. Attempting to locate input area...');
      
      // Clear it so it doesn't run again on reload
      chrome.storage.local.remove('pending_prompt');

      // Try primary ID first, then fallback to generic contenteditable
      const inputElement = await waitForElement('#prompt-textarea', 10000) 
          || await waitForElement('div[contenteditable="true"]', 5000);

      if (inputElement) {
        console.log('Input element found:', inputElement);
        
        // Focus and set value
        inputElement.focus();
        
        if (inputElement.tagName === 'TEXTAREA') {
            inputElement.value = prompt;
        } else {
            inputElement.innerText = prompt;
        }
        
        // Dispatch events to satisfy frameworks (React usually needs input/change events)
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));

        console.log('Prompt pasted. Waiting for send button...');

        // Optional: Click send
        setTimeout(() => {
          const sendBtn = document.querySelector('[data-testid="send-button"]') 
                       || document.querySelector('button[aria-label="Send prompt"]');
          if (sendBtn) {
              console.log('Clicking send button...');
              sendBtn.click();
          } else {
              console.log('Send button not found. Please click send manually.');
          }
        }, 1000);
      } else {
        console.error('Could not find ChatGPT input area after waiting.');
        alert('YouTube Summarizer: Could not find ChatGPT input area. Please paste the prompt manually.');
      }
    }
  } catch (err) {
    console.error('Error in checkAndPastePrompt:', err);
  }
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver((mutations) => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout fallback
    setTimeout(() => {
        observer.disconnect();
        resolve(null);
    }, timeout);
  });
}

// Run on load
// A small delay helps ensure page hydrology is starting
setTimeout(checkAndPastePrompt, 1000);

