/**
 * Feed scroller abstraction layer.
 * Delegates to the appropriate platform implementation.
 */
import { getDefaultPlatform, getPlatform } from "./platforms/index.js";

/**
 * Scroll a social media feed and collect posts.
 * @param {{ maxPosts?: number, onProgress?: (collected: number, max: number) => void, platformId?: string }} options
 * @returns {Promise<Array<{ url: string, author: string, fullText: string, images: string[] }>>}
 */
export async function scrollSocialFeed(options = {}) {
	const platform = options.platformId
		? getPlatform(options.platformId)
		: getDefaultPlatform();
	if (!platform) {
		throw new Error(`Platform not found: ${options.platformId || "default"}`);
	}
	return platform.scrollFeed(options);
}
