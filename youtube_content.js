// youtube_content.js

// --- Configuration ---
const CHATGPT_PROMPT_TEMPLATE = `Summarize the content into 5–10 concise bullet points capturing the main ideas and reasoning.

If the input is a transcript, include accurate timestamps.

Present the output in two sections:

### English version

### Vietnamese version
(Clear, natural Vietnamese, not word-for-word).
- Preserve key terminology and avoid filler.
- *Write the entire Vietnamese translation in italics.*

Title: "{{Title}}"

URL: "{{URL}}"

Transcript: "{{Transcript}}"`;

// --- Components ---

function createSummarizeButton() {
    const btn = document.createElement('button');
    btn.className = 'yt-summarizer-btn';
    btn.innerText = 'Summarize';
    btn.onclick = handleSummarizeClick;
    return btn;
}

function injectButton() {
    // Check if already injected
    if (document.querySelector('.yt-summarizer-btn')) return;

    // Target location: usually near the subscribe button or the owner container
    // This selector might need adjustment based on YouTube's layout updates
    const target = document.querySelector('#owner #subscribe-button') || document.querySelector('#owner');
    
    if (target) {
        const btn = createSummarizeButton();
        // Insert before the subscribe button container, or append if just owner
        target.parentNode.insertBefore(btn, target);
        console.log('Summarize button injected');
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

        // Send to background
        chrome.runtime.sendMessage({
            action: 'open_chatgpt',
            prompt: prompt
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

    // 1. Get Caption Tracks from Page Source
    const response = await fetch(window.location.href);
    const html = await response.text();

    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) {
        throw new Error('No captions found in page source.');
    }

    const captionTracks = JSON.parse(match[1]);
    if (!captionTracks.length) {
        throw new Error('No caption tracks available.');
    }

    // Prefer English
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    const trackUrl = track.baseUrl;

    // 2. Fetch Transcript Content
    // Try default (likely XML)
    let transcriptResponse = await fetch(trackUrl);
    let transcriptText = await transcriptResponse.text();

    if (!transcriptText || transcriptText.trim().length === 0) {
         // Retry with expected JSON format if default fails/returns empty
         const jsonUrl = trackUrl + '&fmt=json3';
         transcriptResponse = await fetch(jsonUrl);
         transcriptText = await transcriptResponse.text();
    }
    
    if (!transcriptText || transcriptText.trim().length === 0) {
        throw new Error('Empty transcript response from API.');
    }

    // 3. Parse based on format
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

function scrapeTranscriptFromDom() {
    const container = document.querySelector('ytd-transcript-segment-list-renderer');
    if (!container) {
        // Try to find and click the button if not open? 
        // For now, just throwing to prompt user action is safer than auto-clicking which might fail.
        throw new Error('Transcript panel not open.');
    }

    const segments = container.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments || segments.length === 0) {
        throw new Error('No segments found in DOM.');
    }

    let result = '';
    segments.forEach(segment => {
        const timeEl = segment.querySelector('.segment-start-offset');
        const textEl = segment.querySelector('.segment-text');
        
        if (timeEl && textEl) {
            const time = timeEl.innerText.trim();
            const text = textEl.innerText.trim();
            result += `(${time}) ${text} `;
        }
    });

    return result.trim();
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
