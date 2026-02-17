/**
 * Social media feed scroller for Electron.
 * Uses platform abstraction to scroll feeds from any supported platform.
 */
import { getDefaultPlatform } from "./platforms/index.js";

/**
 * Scroll social media feed using the default platform.
 * @param {{ maxPosts?: number, onProgress?: (collected: number, max: number) => void, platformId?: string }} options
 * @returns {Promise<Array<{ url: string, author: string, fullText: string, images: string[] }>>}
 */
export async function scrollSocialFeed(options = {}) {
	const platform = options.platformId 
		? (await import("./platforms/index.js")).getPlatform(options.platformId)
		: getDefaultPlatform();
	
	if (!platform) {
		throw new Error(`Platform not found: ${options.platformId || "default"}`);
	}
	
	return platform.scrollFeed(options);
}
