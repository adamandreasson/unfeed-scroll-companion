/**
 * HTTP client for the unfeed.ai API.
 * Handles post uploads, scroll permission checks, and feed status retrieval.
 */
import { getJwt, getApiBase } from "./store.js";
import { devLog, devWarn } from "./log.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
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

function authHeaders(token) {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};
}

function apiUrl(path) {
	return `${getApiBase().replace(/\/$/, "")}${path}`;
}

/**
 * Upload scrolled social media posts to unfeed.ai.
 * @param {Array<{ url: string, author: string, fullText: string, images: string[] }>} posts
 * @param {string} [platformId]
 * @returns {Promise<{ saved: number, total: number, error?: string }>}
 */
export async function uploadPosts(posts, platformId) {
	if (!platformId) {
		const { getDefaultPlatform } = await import("./platforms/index.js");
		platformId = getDefaultPlatform().getPlatformId();
	}
	const count = posts?.length ?? 0;
	const token = getJwt();
	if (!token) {
		devWarn("[api] uploadPosts: not logged in");
		return { saved: 0, total: count, error: "Not logged in" };
	}

	const url = apiUrl("/api/me/social-feed/posts");
	const normalize = (p) => ({
		url: p.url || "",
		author: p.author || "",
		text: p.fullText || p.text || "",
		imageUrls: Array.isArray(p.images) ? p.images : [],
	});

	try {
		let totalSaved = 0;
		const list = posts || [];
		for (let i = 0; i < list.length; i += UPLOAD_CHUNK_SIZE) {
			const chunk = list.slice(i, i + UPLOAD_CHUNK_SIZE);
			const body = { platform: platformId, posts: chunk.map(normalize) };
			const res = await fetchWithRetry(url, {
				method: "POST",
				headers: authHeaders(token),
				body: JSON.stringify(body),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				devWarn(
					"[api] upload failed:",
					res.status,
					data.error || res.statusText,
				);
				return {
					saved: totalSaved,
					total: count,
					error: data.error || res.statusText,
				};
			}
			totalSaved += data.saved ?? 0;
		}
		devLog("[api] upload complete: saved", totalSaved, "of", count);
		return { saved: totalSaved, total: count };
	} catch (err) {
		devWarn("[api] upload error:", err?.message);
		return { saved: 0, total: count, error: err?.message || "Network error" };
	}
}

/**
 * Check with backend whether a scroll is allowed right now.
 * @returns {Promise<{ allowed: boolean, nextAllowedAt?: string | null, error?: string }>}
 */
export async function canStartScroll() {
	const token = getJwt();
	if (!token) return { allowed: false, error: "Not logged in" };

	try {
		const res = await fetchWithRetry(apiUrl("/api/me/social-feed/can-upload"), {
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
			error: err?.message || "Network error",
		};
	}
}

/**
 * Get social feed status from unfeed.ai.
 * @returns {Promise<{ connected: boolean, lastUploadAt: string | null, postCountLast24h: number, error?: string }>}
 */
export async function getSocialFeedStatus() {
	const token = getJwt();
	if (!token) {
		return { connected: false, lastUploadAt: null, postCountLast24h: 0 };
	}

	try {
		const res = await fetchWithRetry(apiUrl("/api/me/social-feed/status"), {
			headers: { Authorization: `Bearer ${token}` },
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			return {
				connected: true,
				lastUploadAt: null,
				postCountLast24h: 0,
				error: data.error || res.statusText,
			};
		}
		return {
			connected: data.connected !== false,
			lastUploadAt: data.lastUploadAt ?? null,
			postCountLast24h: data.postCountLast24h ?? 0,
		};
	} catch (err) {
		return {
			connected: true,
			lastUploadAt: null,
			postCountLast24h: 0,
			error: err?.message || "Network error",
		};
	}
}
