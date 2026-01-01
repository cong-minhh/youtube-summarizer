// youtube_content.js

// --- Configuration ---
// Default if storage is empty
const DEFAULT_PROMPT_TEMPLATE = `
You are an expert content strategist and translator. Your goal is to synthesize the provided YouTube transcript into a high-value, professional summary that is both insightful and easy to digest.

### Executive Summary
Provide a compelling 2-3 sentence overview of the video's core thesis. What is the main argument, and why does it matter?

### Key Insights & Takeaways
Extract 5-10 distinct, actionable points. Focus on unique perspectives, specific data, or step-by-step instructions rather than generic fluff.

### Summarize for 6 year old audience 

**Format for each point:**
(Start-End) **[Topic/Heading]**: [Deep-dive summary of the point in English]
> *[Target Language Translation: Natural, professional, and context-aware]*
[Link to video at start time]

### Notable Quotes
Briefly list 1-2 standout quotes or surprising facts from the video.

---
**Video Metadata:**
- **Title**: "{{Title}}"
- **URL**: "{{URL}}"

**Transcript:**
"{{Transcript}}"
`;

// --- Components ---

function createSummarizerUI() {
    const container = document.createElement('div');
    container.className = 'yt-summarizer-container';

    // 1. Create main wrapper for better isolation
    const wrapper = document.createElement('div');
    wrapper.className = 'yt-summarizer-wrapper';

    // 2. Button Group
    const btnGroup = document.createElement('div');
    btnGroup.className = 'yt-summarizer-group';

    // Summarize Button
    const btn = document.createElement('button');
    btn.className = 'yt-summarizer-btn';
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor" style="margin-right: 6px;">
            <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"></path>
        </svg>
        Summarize
    `;
    btn.title = "Summarize with ChatGPT";
    btn.onclick = handleSummarizeClick;

    // Settings Hint (small icon)
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'yt-summarizer-icon-btn';
    settingsBtn.innerHTML = `
        <svg viewBox="0 0 24 24" height="18" width="18" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"></path>
        </svg>
    `;
    settingsBtn.title = "Configure in Extension Settings";
    settingsBtn.onclick = () => {
        alert("Please click the extension icon in your browser toolbar to configure settings.");
    };

    btnGroup.appendChild(btn);
    btnGroup.appendChild(settingsBtn);
    container.appendChild(btnGroup);

    // Temp chat toggle (smaller)
    const label = document.createElement('label');
    label.className = 'yt-summarizer-toggle';
    label.title = "Use temporary chat";
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const savedState = localStorage.getItem('yt_summarizer_temp_chat');
    checkbox.checked = savedState === 'true';
    checkbox.onchange = (e) => localStorage.setItem('yt_summarizer_temp_chat', e.target.checked);

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode('Temp'));

    container.appendChild(label);

    return container;
}

function injectButton() {
    // Check if already injected
    if (document.querySelector('.yt-summarizer-container')) return;

    // Target location: usually near the subscribe button or the owner container
    // This selector might need adjustment based on YouTube's layout updates
    const target = document.querySelector('#owner #subscribe-button') || document.querySelector('#owner');
    
    if (target) {
        const ui = createSummarizerUI();
        // Insert before the subscribe button container, or append if just owner
        target.parentNode.insertBefore(ui, target);
        console.log('Summarize UI injected');
    } else {
        // Retry if not found (lazy loading)
        // console.log('Target for summarize button not found yet...');
    }
}

// --- Logic ---

async function handleSummarizeClick() {
    const btn = document.querySelector('.yt-summarizer-btn');
    const originalText = btn.innerText;
    btn.innerText = 'Loading...';
    btn.disabled = true;

    try {
        const transcript = await fetchTranscript();
        const videoTitle = document.title.replace(' - YouTube', '');
        const videoUrl = window.location.href;

        // Fetch settings
        const settings = await chrome.storage.sync.get(['promptTemplate', 'language']);
        let template = settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
        let language = settings.language || 'Vietnamese'; // Default to Vietnamese as per original request history or English

        // 1. naive replacement of the generic placeholder if it exists
        // 2. forceful replacement of {{Language}} if we add it
        // 3. standard metadata replacements
        
        const prompt = template
            .replace('Target Language Translation', `${language} Translation`) // Fix for the specific line in default template
            .replace('{{Language}}', language) // Future proofing
            .replace('{{Title}}', videoTitle)
            .replace('{{URL}}', videoUrl)
            .replace('{{Transcript}}', transcript);

        // Check if temporary chat is requested
        const useTempChat = document.querySelector('.yt-summarizer-toggle input')?.checked || false;

        // Send to background
        chrome.runtime.sendMessage({
            action: 'open_chatgpt',
            prompt: prompt,
            temporaryChat: useTempChat
        });

    } catch (error) {
        console.error('Summarize error:', error);
        alert('Failed to fetch transcript: ' + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function fetchTranscript() {
    // Strategy: DOM Scrape (Sole Strategy)
    // The previous API strategies (injected script, page source regex) proved unreliable due to
    // empty responses and CSP issues. The most robust method is to automate the UI interaction.
    try {
        const transcript = await scrapeTranscriptFromDom();
        return transcript;
    } catch (domError) {
        console.error('DOM scrape failed:', domError);
        throw new Error('Could not fetch transcript. Please ensure the "Show transcript" panel is available for this video.');
    }
}

async function scrapeTranscriptFromDom() {
    // 1. Check if already open
    let container = document.querySelector('ytd-transcript-segment-list-renderer');
    
    // 2. If not open, try to open it
    if (!container) {
        console.log('[YT-Summarizer] Transcript panel not found, attempting to open...');
        const expandButton = await findExpandButton();
        if (expandButton) {
            expandButton.click();
            // Wait for container
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simple wait
            container = document.querySelector('ytd-transcript-segment-list-renderer');
        } else {
             // Try the menu "Show transcript" item approach if needed (often hidden in description "more" or overflow menu)
             // For now, assume description is expanded or button is visible
             console.warn('[YT-Summarizer] Could not find "Show transcript" button.');
        }
    }

    if (!container) {
         // Final retry: Is it in the description?
         // This is complex as it requires expanding the description.
         // Let's just throw for now if we can't simple-click it.
         throw new Error('Transcript panel not open and could not auto-open.');
    }

    const segments = container.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments.length) {
        throw new Error('No transcript segments found in DOM.');
    }

    let result = '';
    segments.forEach(seg => {
        const timeEl = seg.querySelector('.segment-timestamp');
        const textEl = seg.querySelector('.segment-text');
        if (timeEl && textEl) {
            result += `(${timeEl.innerText.trim()}) ${textEl.innerText.trim()} `;
        }
    });

    return result.trim();
}

async function findExpandButton() {
    // Strategy 1: The designated button in the description (newer UI)
    // Often listed as "Show transcript" in the description block actions
    const buttons = Array.from(document.querySelectorAll('button'));
    const showTranscriptBtn = buttons.find(b => b.ariaLabel === 'Show transcript' || b.innerText.includes('Show transcript'));
    if (showTranscriptBtn) return showTranscriptBtn;

    // Strategy 2: Look in the overflow menu (older UI or mobile-ish views?)
    // This is hard to automate reliably without disrupting user.
    return null;
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min < 10 ? '0' : ''}${min}:${sec < 10 ? '0' : ''}${sec}`;
}


// --- Observer ---
// Handle SPA navigation
const observer = new MutationObserver((mutations) => {
    injectButton();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial run
injectButton();
