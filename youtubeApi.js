// youtubeApi.js
import { getAuthToken } from './auth.js';
// Import new constants
import { CREATOR_VIDEOS_TO_CHECK, MIN_VIDEO_DURATION_SECONDS, MAX_VIDEO_DURATION_SECONDS, CURATED_CREATORS } from './constants.js';

const API_BASE = "https://www.googleapis.com/youtube/v3";


/**
 * Parses ISO 8601 duration string (e.g., PT10M30S) into seconds.
 * @param {string} durationString - ISO 8601 duration.
 * @returns {number} Duration in seconds, or 0 if invalid.
 */
function parseISO8601Duration(durationString) {
    const regex = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;
    const matches = durationString.match(regex);

    if (!matches) {
        console.warn("Could not parse duration:", durationString);
        return 0;
    }

    const hours = parseInt(matches[1] || '0', 10);
    const minutes = parseInt(matches[2] || '0', 10);
    const seconds = parseFloat(matches[3] || '0'); // Use parseFloat for potential fractions

    return (hours * 3600) + (minutes * 60) + seconds;
}


/**
 * Fetches the most recent video from curated creators that meets duration criteria (5-25 min).
 * Checks up to CREATOR_VIDEOS_TO_CHECK per creator.
 * Requires OAuth token with youtube.readonly scope.
 * @returns {Promise<Array<{id: string, name: string}>>} Array of valid video objects.
 * @throws {Error} If authentication fails or API errors occur.
 */
export async function fetchValidVideosFromCreators() {
    console.log(`Fetching latest videos (duration ${MIN_VIDEO_DURATION_SECONDS/60}-${MAX_VIDEO_DURATION_SECONDS/60} min) from curated creators...`);
    if (!CURATED_CREATORS || CURATED_CREATORS.length === 0) return [];

    const token = await getAuthToken(true);
    if (!token) throw new Error("Authorization required (YouTube).");

    const creatorChannelIds = CURATED_CREATORS.map(c => c.channelId);

    try {
        // 1. Get Upload Playlist IDs (as before)
        console.log("Fetching channel details for upload playlists...");
        const channelUrl = `${API_BASE}/channels?part=contentDetails&id=${creatorChannelIds.join(',')}`;
        // ... (fetch channel data, create uploadsPlaylistMap) ...
        const channelResponse = await fetch(channelUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!channelResponse.ok) throw new Error(`YouTube API Error (Channels): ${channelResponse.status} ${channelResponse.statusText}`);
        const channelData = await channelResponse.json();
        const uploadsPlaylistMap = new Map();
        channelData.items?.forEach(item => {
            if (item.id && item.contentDetails?.relatedPlaylists?.uploads) {
                uploadsPlaylistMap.set(item.id, item.contentDetails.relatedPlaylists.uploads);
            }
        });
        if (uploadsPlaylistMap.size === 0) return [];

        // 2. Fetch recent playlist items for each creator
        console.log(`Fetching up to ${CREATOR_VIDEOS_TO_CHECK} recent items per playlist...`);
        const playlistItemsPromises = Array.from(uploadsPlaylistMap.entries()).map(([channelId, playlistId]) =>
            fetch(`${API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${CREATOR_VIDEOS_TO_CHECK}`, { headers: { 'Authorization': `Bearer ${token}` } })
                .then(res => res.ok ? res.json() : Promise.reject(`Playlist ${playlistId}: ${res.status}`))
                .then(playlistData => ({ channelId, items: playlistData.items || [] })) // Keep channelId association
                .catch(error => {
                     console.warn(`Failed fetching items for channel ${channelId}: ${error}`);
                     return { channelId, items: [] }; // Return empty on error
                })
        );
        const playlistResults = await Promise.all(playlistItemsPromises);

        // 3. Extract all unique video IDs from the fetched items
        const allVideoIds = new Set();
        const channelVideoMap = new Map(); // Store items per channel: Map<channelId, PlaylistItem[]>
        playlistResults.forEach(({ channelId, items }) => {
            channelVideoMap.set(channelId, items); // Store for later iteration
            items.forEach(item => {
                const videoId = item.snippet?.resourceId?.videoId;
                if (videoId) allVideoIds.add(videoId);
            });
        });

        if (allVideoIds.size === 0) {
            console.log("No video IDs found in recent playlist items.");
            return [];
        }
        console.log(`Found ${allVideoIds.size} unique video IDs to check duration.`);

        // 4. Fetch video durations in batches (max 50 IDs per request)
        const videoIdsArray = Array.from(allVideoIds);
        const durationMap = new Map(); // Map<videoId, durationInSeconds>
        const batchSize = 50;

        console.log("Fetching video durations...");
        for (let i = 0; i < videoIdsArray.length; i += batchSize) {
            const batchIds = videoIdsArray.slice(i, i + batchSize);
            const videoDetailsUrl = `${API_BASE}/videos?part=contentDetails&id=${batchIds.join(',')}`;
            try {
                const videoResponse = await fetch(videoDetailsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!videoResponse.ok) {
                    console.warn(`YouTube API Error (Videos Batch ${i/batchSize + 1}): ${videoResponse.status} ${videoResponse.statusText}. Skipping batch.`);
                    continue; // Skip this batch on error
                }
                const videoData = await videoResponse.json();
                videoData.items?.forEach(video => {
                    if (video.id && video.contentDetails?.duration) {
                        const durationSec = parseISO8601Duration(video.contentDetails.duration);
                        durationMap.set(video.id, durationSec);
                    }
                });
            } catch(batchError) {
                 console.warn(`Error fetching video details batch: ${batchError}. Skipping batch.`);
            }
        }
        console.log(`Fetched durations for ${durationMap.size} videos.`);

        // 5. Find the first valid video for each creator
        const finalValidVideos = [];
        for (const [channelId, items] of channelVideoMap.entries()) {
            let foundValidVideoForChannel = false;
            for (const item of items) { // Iterate through items (most recent first)
                const videoId = item.snippet?.resourceId?.videoId;
                const title = item.snippet?.title;
                if (!videoId || !title) continue;

                const durationSec = durationMap.get(videoId);
                if (durationSec === undefined) continue; // Duration not found/fetched

                // Check duration criteria
                if (durationSec >= MIN_VIDEO_DURATION_SECONDS && durationSec <= MAX_VIDEO_DURATION_SECONDS) {
                    console.log(`Found valid video for channel ${channelId}: "${title}" (ID: ${videoId}, Duration: ${Math.round(durationSec)}s)`);
                    finalValidVideos.push({ id: videoId, name: title });
                    foundValidVideoForChannel = true;
                    break; // Found the first valid one for this channel, move to next channel
                }
            }
            if (!foundValidVideoForChannel) {
                 console.log(`No recent video found within duration limits for channel ${channelId}.`);
            }
        }

        console.log(`Found ${finalValidVideos.length} videos matching criteria from curated creators.`);
        return finalValidVideos;

    } catch (error) {
        // ... (Error handling as before, maybe update messages) ...
        console.error("Error during YouTube API fetch:", error);
        if (error.message.includes("401")) throw new Error("Authorization failed or insufficient (YouTube). Please re-authorize.");
        if (error.message.includes("403")) throw new Error("YouTube API Error (403). Check API Console, Quotas, or Channel IDs.");
        throw error;
    }
}