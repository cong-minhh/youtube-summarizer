(async function() {
    console.log('[YT-Summarizer] Injected script running');
    
    try {
        // 1. Find the player response (same logic as before)
        let playerResponse = window.ytInitialPlayerResponse;

        if (!playerResponse) {
            const playerEl = document.getElementById('movie_player');
            if (playerEl && playerEl.getPlayerResponse) {
                playerResponse = playerEl.getPlayerResponse();
            }
        }

        console.log('[YT-Summarizer] playerResponse found:', !!playerResponse);

        if (!playerResponse) {
            throw new Error('ytInitialPlayerResponse not found');
        }

        // 2. Extract caption tracks
        const captions = playerResponse.captions;
        let captionTracks = captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!captionTracks || !captionTracks.length) {
            throw new Error('No caption tracks found in playerResponse');
        }

        console.log('[YT-Summarizer] tracks found:', captionTracks.length);

        // 3. Select the best track (Prefer English)
        const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
        const trackUrl = track.baseUrl;

        console.log('[YT-Summarizer] Fetching transcript in main world from:', trackUrl);

        // Check for ytcfg
        console.log('[YT-Summarizer] ytcfg available:', !!window.ytcfg);

        // 4. Fetch the transcript text
        // Attempt default fetch with credentials
        let response = await fetch(trackUrl, { credentials: 'include' });
        console.log('[YT-Summarizer] Fetch status:', response.status, response.statusText);
        
        let text = await response.text();
        console.log('[YT-Summarizer] Fetch text length:', text.length);

        // Retry with json3 if empty
        if (!text || text.trim().length === 0) {
            console.warn('[YT-Summarizer] Default fetch empty, retrying with json3...');
            response = await fetch(trackUrl + '&fmt=json3', { credentials: 'include' });
            console.log('[YT-Summarizer] Retry fetch status:', response.status);
            text = await response.text();
        }

        if (!text || text.trim().length === 0) {
            throw new Error('Empty transcript response from API (injected)');
        }

        console.log('[YT-Summarizer] Fetch successful, length:', text.length);

        // 5. Send result back to content script
        window.postMessage({
            type: 'YT_SUMMARIZER_TRANSCRIPT',
            text: text
        }, '*');

    } catch (error) {
        console.error('[YT-Summarizer] Injected script error:', error);
        window.postMessage({
            type: 'YT_SUMMARIZER_ERROR',
            error: error.message
        }, '*');
    }
})();
