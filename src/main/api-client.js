/**
 * HTTP client for unfeed.ai API: upload posts, get status.
 * Uses JWT from store; retries on transient failures.
 */
import { getJwt, getApiBase } from "./store.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
/** Send all posts in one request so one scroll = one rate-limited upload (server allows 1 upload per 2h, max 200 per request). */
const UPLOAD_CHUNK_SIZE = 200;

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
	let lastErr;
	for (let i = 0; i <= retries; i++) {
		try {
			const res = await fetch(url, options);
			if (res.status === 429 || res.status >= 500) {
				if (i < retries) {
					await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
					continue;
				}
			}
			return res;
		} catch (err) {
			lastErr = err;
			if (i < retries) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
		}
	}
	throw lastErr;
}

/**
 * Upload scrolled social media posts to unfeed.ai.
 * @param {Array<{ url: string, author: string, fullText: string, images: string[] }>} posts
 * @param {string} [platformId] - Platform identifier (defaults to default platform)
 * @returns {Promise<{ saved: number, total: number, error?: string }>}
 */
export async function uploadPosts(posts, platformId) {
	if (!platformId) {
		const { getDefaultPlatform } = await import("./platforms/index.js");
		platformId = getDefaultPlatform().getPlatformId();
	}
	const count = (posts && posts.length) || 0;
	console.log("[api-client] uploadPosts called with", count, "posts");
	if (count > 0 && posts[0]) {
		console.log(
			"[api-client] First post url:",
			(posts[0].url || "").slice(0, 80),
			"author:",
			(posts[0].author || "").slice(0, 40),
		);
	}
	const token = getJwt();
	if (!token) {
		console.warn("[api-client] uploadPosts: not logged in, skipping upload");
		return { saved: 0, total: count, error: "Not logged in" };
	}
	const base = getApiBase().replace(/\/$/, "");
	const url = `${base}/api/me/social-feed/posts`;
	const list = posts || [];
	const normalize = (p) => ({
		url: p.url || "",
		author: p.author || "",
		text: p.fullText || p.text || "",
		imageUrls: Array.isArray(p.images) ? p.images : [],
	});
	try {
		let totalSaved = 0;
		for (let i = 0; i < list.length; i += UPLOAD_CHUNK_SIZE) {
			const chunk = list.slice(i, i + UPLOAD_CHUNK_SIZE);
			const body = { platform: platformId, posts: chunk.map(normalize) };
			const res = await fetchWithRetry(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(body),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				console.warn(
					"[api-client] uploadPosts failed:",
					res.status,
					data.error || res.statusText,
					"(chunk",
					Math.floor(i / UPLOAD_CHUNK_SIZE) + 1,
					")",
				);
				return {
					saved: totalSaved,
					total: count,
					error: data.error || res.statusText,
				};
			}
			totalSaved += data.saved ?? 0;
			if (list.length > UPLOAD_CHUNK_SIZE) {
				console.log(
					"[api-client] uploadPosts chunk",
					Math.floor(i / UPLOAD_CHUNK_SIZE) + 1,
					": saved =",
					data.saved ?? 0,
				);
			}
		}
		console.log(
			"[api-client] uploadPosts success: saved =",
			totalSaved,
			"total =",
			count,
		);
		return { saved: totalSaved, total: count };
	} catch (err) {
		console.warn("[api-client] uploadPosts error:", err?.message);
		return {
			saved: 0,
			total: posts?.length ?? 0,
			error: err.message || "Network error",
		};
	}
}

/**
 * Ask backend if starting a scroll is allowed (avoids scrolling then getting 429 on upload).
 * @returns {Promise<{ allowed: boolean, nextAllowedAt?: string|null, error?: string }>}
 */
export async function canStartScroll() {
	const token = getJwt();
	if (!token) {
		return { allowed: false, error: "Not logged in" };
	}
	const base = getApiBase().replace(/\/$/, "");
	const url = `${base}/api/me/social-feed/can-upload`;
	try {
		const res = await fetchWithRetry(url, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			return {
				allowed: false,
				nextAllowedAt: null,
				error: data.error || res.statusText,
			};
		}
		return {
			allowed: data.allowed === true,
			nextAllowedAt: data.nextAllowedAt ?? null,
		};
	} catch (err) {
		return {
			allowed: false,
			nextAllowedAt: null,
			error: err.message || "Network error",
		};
	}
}


/**
 * Get social feed status from unfeed.ai.
 * @returns {Promise<{ connected: boolean, lastUploadAt: string|null, postCountLast24h: number, error?: string }>}
 */
export async function getSocialFeedStatus() {
	const token = getJwt();
	if (!token) {
		return { connected: false, lastUploadAt: null, postCountLast24h: 0 };
	}
	const base = getApiBase().replace(/\/$/, "");
	const url = `${base}/api/me/social-feed/status`;
	try {
		const res = await fetchWithRetry(url, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const data = await res.json().catch(() => ({}));
		console.log("[api-client] GET /api/me/social-feed/status response:", {
			status: res.status,
			ok: res.ok,
			data,
		});
		if (!res.ok) {
			return {
				connected: true,
				lastUploadAt: null,
				postCountLast24h: 0,
				error: data.error || res.statusText,
			};
		}
		const result = {
			connected: data.connected !== false,
			lastUploadAt: data.lastUploadAt ?? null,
			postCountLast24h: data.postCountLast24h ?? 0,
		};
		console.log("[api-client] getSocialFeedStatus returning:", result);
		return result;
	} catch (err) {
		return {
			connected: true,
			lastUploadAt: null,
			postCountLast24h: 0,
			error: err.message || "Network error",
		};
	}
}
