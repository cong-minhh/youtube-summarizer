// youtube_content.js

// --- Configuration ---
const CHATGPT_PROMPT_TEMPLATE = `Summarize the content into 5–10 concise bullet points capturing the main ideas and reasoning.

If the input is a transcript, include accurate timestamps.

Format the output as follows for each point:
(Time) English summary point
> *Vietnamese translation (Clear, natural Vietnamese, not word-for-word).*

Example:
(0:00-0:30) AJ, a 38-year-old man, presents to the ER...
> *AJ, 38 tuổi, nhập khoa cấp cứu...*

Title: "{{Title}}"

URL: "{{URL}}"

Transcript: "{{Transcript}}"`;

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
    // Strategy 1: API Fetch (Primary)
    try {
        const transcript = await fetchTranscriptViaApi();
        return transcript;
    } catch (apiError) {
        console.warn('API transcript fetch failed, trying DOM fallback:', apiError);
    }

    // Strategy 2: DOM Scrape (Fallback)
    try {
        return scrapeTranscriptFromDom();
    } catch (domError) {
        throw new Error('Could not fetch transcript. Please open the "Show transcript" panel manually and try again.');
    }
}

async function fetchTranscriptViaApi() {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) throw new Error('Could not find video ID');

    let transcriptText;

    // 1. Primary Strategy: Injected Script (Main World Fetch)
    try {
        transcriptText = await fetchTranscriptFromGlobal();
    } catch (e) {
        console.warn('[YT-Summarizer] Injection strategy failed:', e);
    }

    // 2. Fallback Strategy: Legacy Page Source Regex
    if (!transcriptText) {
        console.warn('[YT-Summarizer] Falling back to legacy page source method...');
        try {
            transcriptText = await fetchTranscriptLegacyFallback();
        } catch (legacyError) {
            console.error('[YT-Summarizer] Legacy fallback failed:', legacyError);
            throw new Error('All transcript fetch strategies failed.');
        }
    }

    if (!transcriptText || transcriptText.trim().length === 0) {
        throw new Error('Empty transcript response.');
    }

    return parseTranscript(transcriptText);
}

async function fetchTranscriptLegacyFallback() {
    const response = await fetch(window.location.href);
    const html = await response.text();
    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    
    if (!match) throw new Error('No captions found in page source.');
    const captionTracks = JSON.parse(match[1]);

    if (!captionTracks || !captionTracks.length) throw new Error('No caption tracks available.');

    const track = captionTracks.find(t => t.languageCode === 'en' && !t.kind) || 
                  captionTracks.find(t => t.languageCode === 'en') || 
                  captionTracks[0];
                  
    const trackUrl = track.baseUrl;
    
    let res = await fetch(trackUrl);
    let text = await res.text();
    
    if (!text || text.trim().length === 0) {
         res = await fetch(trackUrl + '&fmt=json3');
         text = await res.text();
    }
    return text;
}

function fetchTranscriptFromGlobal() {
    return new Promise((resolve, reject) => {
        const scriptId = 'yt-summarizer-temp-script';
        if (document.getElementById(scriptId)) document.getElementById(scriptId).remove();

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = chrome.runtime.getURL('injected_script.js');
        
        const listener = (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === 'YT_SUMMARIZER_TRANSCRIPT') {
                cleanup();
                resolve(event.data.text);
            } else if (event.data.type === 'YT_SUMMARIZER_ERROR') {
                cleanup();
                reject(new Error(event.data.error || 'Unknown injection error'));
            }
        };

        const cleanup = () => {
            window.removeEventListener('message', listener);
            if (document.getElementById(scriptId)) document.getElementById(scriptId).remove();
        };

        window.addEventListener('message', listener);
        (document.head || document.documentElement).appendChild(script);

        // Timeout fallback
        setTimeout(() => {
            cleanup();
            reject(new Error('Timeout waiting for injected script'));
        }, 5000); // Increased timeout for fetch
    });
}

function parseTranscript(transcriptText) {
    if (transcriptText.trim().startsWith('{')) {
        return parseTranscriptJson(transcriptText);
    } else if (transcriptText.trim().startsWith('<')) {
        return parseTranscriptXmlRegex(transcriptText);
    } else {
        throw new Error('Unknown transcript format.');
    }
}

function parseTranscriptJson(jsonString) {
    try {
        const json = JSON.parse(jsonString);
        const events = json.events;
        if (!events) return '';

        let result = '';
        for (const event of events) {
            if (event.segs) {
                const text = event.segs.map(s => s.utf8).join('');
                const start = event.tStartMs / 1000;
                result += `(${formatTime(start)}) ${text} `;
            }
        }
        return result.trim();
    } catch (e) {
        throw new Error('Failed to parse JSON transcript: ' + e.message);
    }
}

function parseTranscriptXmlRegex(xml) {
    // Simple regex parser to avoid Trusted Types issues
    const regex = /<text start="([\d.]+)"[^>]*>([^<]*)<\/text>/g;
    let match;
    let result = "";
    
    while ((match = regex.exec(xml)) !== null) {
        const start = parseFloat(match[1]);
        const text = match[2]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
            
        result += `(${formatTime(start)}) ${text} `;
    }
    
    return result.trim();
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
