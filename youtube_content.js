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

const LANGUAGES = ['English', 'Vietnamese', 'Spanish', 'French', 'German', 'Japanese', 'Korean'];

function createSummarizerUI() {
    const container = document.createElement('div');
    container.className = 'yt-summarizer-overlay';

    // --- Bubble ---
    const bubble = document.createElement('div');
    bubble.className = 'yt-summarizer-bubble';
    bubble.title = 'Open Summarizer Menu';
    bubble.innerHTML = `
        <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
            <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"></path>
        </svg>
    `;
    bubble.onclick = (e) => {
        e.stopPropagation();
        toggleMenu();
    };

    // --- Menu ---
    const menu = document.createElement('div');
    menu.className = 'yt-summarizer-menu';
    // Prevent clicks inside menu from closing it
    menu.onclick = (e) => e.stopPropagation();

    // 1. Language Selector
    const langGroup = document.createElement('div');
    langGroup.className = 'yt-menu-group';
    const langLabel = document.createElement('label');
    langLabel.innerText = 'Target Language';
    const langSelect = document.createElement('select');
    langSelect.id = 'yt-summary-language';
    
    LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.innerText = lang;
        langSelect.appendChild(option);
    });

    // Load saved language preference for the overlay specifically, or fall back to sync storage if we could access it synchronously (we can't easily, so we might need to init it async or just rely on the last selected). 
    // For simplicity, let's store a local override.
    const savedLang = localStorage.getItem('yt_summary_target_lang') || 'Vietnamese';
    langSelect.value = savedLang;
    langSelect.onchange = (e) => localStorage.setItem('yt_summary_target_lang', e.target.value);

    langGroup.appendChild(langLabel);
    langGroup.appendChild(langSelect);

    // 2. Temp Chat Toggle
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'yt-menu-group-row';
    
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'yt-summarizer-toggle';
    toggleLabel.title = "Use temporary chat";
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    const savedTempState = localStorage.getItem('yt_summarizer_temp_chat');
    toggleInput.checked = savedTempState === 'true';
    toggleInput.onchange = (e) => localStorage.setItem('yt_summarizer_temp_chat', e.target.checked);
    
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(document.createTextNode('Temporary Chat'));
    toggleGroup.appendChild(toggleLabel);

    // 3. Summarize Button
    const summarizeBtn = document.createElement('button');
    summarizeBtn.className = 'yt-menu-btn primary';
    summarizeBtn.innerText = 'Summarize Video';
    summarizeBtn.onclick = () => {
        handleSummarizeClick();
        // toggleMenu(); // Optional: close menu after clicking? Maybe keep open to show loading?
    };

    // 4. Settings Link
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'yt-menu-btn secondary';
    settingsBtn.innerText = 'Extension Settings';
    settingsBtn.onclick = () => {
        alert("Please click the extension icon in your browser toolbar for full settings.");
    };

    menu.appendChild(langGroup);
    menu.appendChild(toggleGroup);
    menu.appendChild(document.createElement('hr'));
    menu.appendChild(summarizeBtn);
    menu.appendChild(settingsBtn);

    container.appendChild(bubble);
    container.appendChild(menu);

    // Global click listener to close menu
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            menu.classList.remove('visible');
        }
    });

    return container;
}

function toggleMenu() {
    const menu = document.querySelector('.yt-summarizer-menu');
    if (menu) {
        menu.classList.toggle('visible');
    }
}

function injectButton() {
    // Check if already injected
    if (document.querySelector('.yt-summarizer-overlay')) return;

    // Target location: Video Player
    const target = document.querySelector('.html5-video-player') || document.querySelector('#movie_player');
    
    if (target) {
        const ui = createSummarizerUI();
        target.appendChild(ui);
        console.log('Summarize Overlay injected');
    }
}

// --- Logic ---

async function handleSummarizeClick() {
    const btn = document.querySelector('.yt-menu-btn.primary');
    if (!btn) return; // Safety check
    
    const originalText = btn.innerText;
    btn.innerText = 'Loading...';
    btn.disabled = true;

    try {
        const transcript = await fetchTranscript();
        const videoTitle = document.title.replace(' - YouTube', '');
        const videoUrl = window.location.href;

        // Fetch settings from sync storage (template)
        const settings = await chrome.storage.sync.get(['promptTemplate']);
        let template = settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
        
        // Get language from our local overlay selection
        const language = document.getElementById('yt-summary-language')?.value || 'Vietnamese';

        const prompt = template
            .replace('Target Language Translation', `${language} Translation`) 
            .replace('{{Language}}', language)
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
