/**
 * Periodic social media feed scroll and upload.
 * Checks with backend every 20 minutes to see if scrolling is needed.
 * Client is a "dumb follower" - backend decides when to scroll.
 */
import { getJwt } from "./store.js";
import { scrollSocialFeed } from "./scroller.js";
import { uploadPosts, canStartScroll } from "./api-client.js";

let intervalId = null;
let scrollInProgress = false;

/**
 * Execute the actual scroll and upload work.
 * Single guard: only one scroll (scheduled or manual) at a time.
 * @param {{ onProgress?: (collected: number, max: number) => void }} [opts] - optional progress callback
 * @returns {Promise<{ saved?: number, total?: number, error?: string }>}
 */
async function executeScroll(opts = {}) {
	if (scrollInProgress) {
		throw new Error("Scroll already in progress");
	}
	const token = getJwt();
	if (!token) {
		throw new Error("Not logged in");
	}
	scrollInProgress = true;
	try {
		console.log("[scheduler] Starting scroll...");
		const posts = await scrollSocialFeed({
			maxPosts: 100,
			onProgress: opts.onProgress,
		});
		console.log(
			"[scheduler] Scroll finished, posts.length =",
			posts?.length ?? 0,
		);
		if (posts.length > 0) {
			const result = await uploadPosts(posts);
			return { saved: result.saved, total: result.total, error: result.error };
		}
		console.warn(
			"[scheduler] No posts to upload – check [scroller] logs for page diagnostic",
		);
		return { saved: 0, total: 0 };
	} catch (err) {
		console.error("[scheduler] Scroll/upload failed:", err?.message);
		return { error: err?.message ?? "Scroll failed" };
	} finally {
		scrollInProgress = false;
	}
}

/**
 * Attempt to scroll, but check with backend first. If backend says wait, return skipped.
 * Used by manual "Scroll now" button - respects backend rate limits.
 * @param {{ onProgress?: (collected: number, max: number) => void }} [opts] - optional progress callback
 * @returns {Promise<{ skipped?: boolean, reason?: string, saved?: number, total?: number, error?: string }>}
 */
export async function attemptScrollWithBackendCheck(opts = {}) {
	if (scrollInProgress) {
		console.log("[scheduler] Skipping: scroll already in progress");
		return { skipped: true, reason: "Scroll already in progress" };
	}
	const token = getJwt();
	if (!token) {
		console.log("[scheduler] Skipping: not logged in");
		return { skipped: true, reason: "Not logged in" };
	}
	try {
		const { allowed, nextAllowedAt, error } = await canStartScroll();
		if (error) {
			console.log("[scheduler] Error checking with backend:", error);
			return { skipped: true, reason: error };
		}
		if (!allowed) {
			const reason = nextAllowedAt
				? `Too soon to scroll. Try again after ${new Date(nextAllowedAt).toLocaleString()}`
				: "Scrolling not allowed";
			console.log("[scheduler] Backend says wait:", reason);
			return { skipped: true, reason };
		}
		console.log("[scheduler] Backend allows scrolling");
		const result = await executeScroll(opts);
		return result;
	} catch (err) {
		console.error("[scheduler] Error in attemptScrollWithBackendCheck:", err?.message);
		return { error: err?.message ?? "Scroll failed" };
	}
}

/**
 * Check with backend if scrolling is needed, and scroll if so.
 * Used by the periodic scheduler - client is a "dumb follower" that checks periodically.
 */
async function checkAndScrollIfNeeded() {
	const token = getJwt();
	if (!token) {
		console.log("[scheduler] Skipping check: not logged in");
		return;
	}
	if (scrollInProgress) {
		console.log("[scheduler] Skipping check: scroll already in progress");
		return;
	}
	try {
		const { allowed, nextAllowedAt, error } = await canStartScroll();
		if (error) {
			console.log("[scheduler] Error checking with backend:", error);
			return;
		}
		if (!allowed) {
			const reason = nextAllowedAt
				? `Try again after ${new Date(nextAllowedAt).toLocaleString()}`
				: "Scrolling not allowed";
			console.log("[scheduler] Backend says wait:", reason);
			return;
		}
		console.log("[scheduler] Backend says scroll now");
		await executeScroll();
	} catch (err) {
		console.error("[scheduler] Error in checkAndScrollIfNeeded:", err?.message);
	}
}

/**
 * Start the periodic scheduler. Checks with backend every 20 minutes.
 * Call from app when ready.
 */
export function startScheduler() {
	stopScheduler();
	// Check every 20 minutes (20 * 60 * 1000 ms)
	const CHECK_INTERVAL_MS = 20 * 60 * 1000;
	intervalId = setInterval(checkAndScrollIfNeeded, CHECK_INTERVAL_MS);
	// Run first check after a short delay
	setTimeout(checkAndScrollIfNeeded, 30 * 1000);
}

export function stopScheduler() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
}
