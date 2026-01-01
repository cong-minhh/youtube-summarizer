// youtube_content.js

// --- Configuration ---
const CHATGPT_PROMPT_TEMPLATE = `
You are an expert content strategist and translator. Your goal is to synthesize the provided YouTube transcript into a high-value, professional summary that is both insightful and easy to digest.

### Executive Summary
Provide a compelling 2-3 sentence overview of the video's core thesis. What is the main argument, and why does it matter?

### Key Insights & Takeaways
Extract 5-10 distinct, actionable points. Focus on unique perspectives, specific data, or step-by-step instructions rather than generic fluff.

**Format for each point:**
(Start-End) **[Topic/Heading]**: [Deep-dive summary of the point in English]
> *[Vietnamese translation: Natural, professional, and context-aware]*
[Link to video at start time]

**Example:**
(0:04-0:40) **The Value of Simplicity**: Bubble sort is often dismissed for poor performance, yet its simplicity makes it the perfect teaching tool.
> *Giá trị của sự đơn giản: Bubble sort thường bị bỏ qua vì hiệu suất kém, nhưng sự đơn giản lại khiến nó trở thành công cụ giảng dạy tuyệt vời.*
https://youtu.be/qGH8gKdpZMQ?t=4

### Notable Quotes / "Aha!" Moments
Briefly list 1-2 standout quotes or surprising facts from the video.

---
**Technical Instructions:**
- **Links**: Use {{URL}} as base. Convert timestamp (e.g., 1:05) to seconds (e.g. 65) -> {{URL}}?t=65
- **Tone**: Professional, objective, yet engaging.

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

    // 1. Create Checkbox for "Temporary Chat"
    const label = document.createElement('label');
    label.className = 'yt-summarizer-label';
    label.title = "Use temporary chat (history won't be saved)";

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'yt-summarizer-checkbox';
    
    // Load saved state
    const savedState = localStorage.getItem('yt_summarizer_temp_chat');
    checkbox.checked = savedState === 'true';

    // Save state on change
    checkbox.onchange = (e) => {
        localStorage.setItem('yt_summarizer_temp_chat', e.target.checked);
    };

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode('Temp Chat'));

    // 2. Create Summarize Button
    const btn = document.createElement('button');
    btn.className = 'yt-summarizer-btn';
    btn.innerText = 'Summarize';
    btn.onclick = handleSummarizeClick;

    container.appendChild(label);
    container.appendChild(btn);

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

        const prompt = CHATGPT_PROMPT_TEMPLATE
            .replace('{{Title}}', videoTitle)
            .replace('{{URL}}', videoUrl)
            .replace('{{Transcript}}', transcript);

        // Check if temporary chat is requested
        const useTempChat = document.querySelector('.yt-summarizer-checkbox')?.checked || false;

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
