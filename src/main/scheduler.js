/**
 * Periodic social media feed scroll and upload.
 * Checks with the backend every 20 minutes; the server decides when scrolling is needed.
 */
import { getJwt } from "./store.js";
import { scrollSocialFeed } from "./scroller.js";
import { uploadPosts, canStartScroll } from "./api-client.js";
import { devLog } from "./log.js";

const CHECK_INTERVAL_MS = 20 * 60 * 1000;

let intervalId = null;
let scrollInProgress = false;

/**
 * Execute a scroll and upload cycle.
 * Only one scroll (scheduled or manual) runs at a time.
 * @param {{ onProgress?: (collected: number, max: number) => void }} [opts]
 * @returns {Promise<{ saved?: number, total?: number, error?: string }>}
 */
async function executeScroll(opts = {}) {
	if (scrollInProgress) throw new Error("Scroll already in progress");
	if (!getJwt()) throw new Error("Not logged in");

	scrollInProgress = true;
	try {
		devLog("[scheduler] Starting scroll…");
		const posts = await scrollSocialFeed({ maxPosts: 100, onProgress: opts.onProgress });
		devLog("[scheduler] Scroll finished, posts:", posts?.length ?? 0);

		if (posts.length === 0) {
			return { saved: 0, total: 0 };
		}
		const result = await uploadPosts(posts);
		return { saved: result.saved, total: result.total, error: result.error };
	} catch (err) {
		devLog("[scheduler] Scroll/upload failed:", err?.message);
		return { error: err?.message ?? "Scroll failed" };
	} finally {
		scrollInProgress = false;
	}
}

/**
 * Attempt a scroll after checking backend rate limits.
 * Used by the manual "Scroll now" button.
 * @param {{ onProgress?: (collected: number, max: number) => void }} [opts]
 * @returns {Promise<{ skipped?: boolean, reason?: string, saved?: number, total?: number, error?: string }>}
 */
export async function attemptScrollWithBackendCheck(opts = {}) {
	if (scrollInProgress) return { skipped: true, reason: "Scroll already in progress" };
	if (!getJwt()) return { skipped: true, reason: "Not logged in" };

	try {
		const { allowed, nextAllowedAt, error } = await canStartScroll();
		if (error) return { skipped: true, reason: error };
		if (!allowed) {
			const reason = nextAllowedAt
				? `Too soon to scroll. Try again after ${new Date(nextAllowedAt).toLocaleString()}`
				: "Scrolling not allowed";
			return { skipped: true, reason };
		}
		return executeScroll(opts);
	} catch (err) {
		return { error: err?.message ?? "Scroll failed" };
	}
}

/**
 * Periodic check: ask backend if scrolling is needed, and scroll if allowed.
 */
async function checkAndScrollIfNeeded() {
	if (!getJwt() || scrollInProgress) return;

	try {
		const { allowed, nextAllowedAt, error } = await canStartScroll();
		if (error || !allowed) return;
		devLog("[scheduler] Backend allows scrolling, starting…");
		await executeScroll();
	} catch (err) {
		devLog("[scheduler] Periodic check failed:", err?.message);
	}
}

/** Start the periodic scheduler (checks every 20 minutes). */
export function startScheduler() {
	stopScheduler();
	intervalId = setInterval(checkAndScrollIfNeeded, CHECK_INTERVAL_MS);
	setTimeout(checkAndScrollIfNeeded, 30_000);
}

export function stopScheduler() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
}
