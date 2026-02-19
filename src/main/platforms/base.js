/**
 * Abstract base class for social media platform implementations.
 * All platform implementations must extend this class and implement all abstract methods.
 */
export class PlatformBase {
	/**
	 * Returns the platform identifier (e.g., "x", "instagram").
	 * @returns {string}
	 */
	getPlatformId() {
		throw new Error("getPlatformId() must be implemented by platform subclass");
	}

	/**
	 * Returns the user-friendly display name (e.g., "X", "Instagram").
	 * @returns {string}
	 */
	getDisplayName() {
		throw new Error(
			"getDisplayName() must be implemented by platform subclass",
		);
	}

	/**
	 * Returns the URL for the platform's home feed.
	 * @returns {string}
	 */
	getHomeUrl() {
		throw new Error("getHomeUrl() must be implemented by platform subclass");
	}

	/**
	 * Returns the URL for the platform's login page.
	 * @returns {string}
	 */
	getLoginUrl() {
		throw new Error("getLoginUrl() must be implemented by platform subclass");
	}

	/**
	 * Returns the Electron session partition name for this platform.
	 * @returns {string}
	 */
	getSessionPartition() {
		throw new Error(
			"getSessionPartition() must be implemented by platform subclass",
		);
	}

	/**
	 * Scroll the platform's feed and collect posts.
	 * @param {{ maxPosts?: number, onProgress?: (collected: number, max: number) => void }} options
	 * @returns {Promise<Array<{ url: string, author: string, fullText: string, images: string[] }>>}
	 */
	async scrollFeed(options = {}) {
		throw new Error("scrollFeed() must be implemented by platform subclass");
	}

	/**
	 * Get account information for the logged-in user.
	 * @returns {Promise<{ connected: boolean, username: string | null }>}
	 */
	async getAccountInfo() {
		throw new Error(
			"getAccountInfo() must be implemented by platform subclass",
		);
	}

	/**
	 * Open a login window for the platform.
	 * @returns {Promise<boolean>} Resolves to true if login successful, false otherwise
	 */
	async openLoginWindow() {
		throw new Error(
			"openLoginWindow() must be implemented by platform subclass",
		);
	}

	/**
	 * Clear all persisted session data for this platform.
	 * @returns {Promise<void>}
	 */
	async clearSession() {
		throw new Error("clearSession() must be implemented by platform subclass");
	}

	/**
	 * Parse a platform handle from input string.
	 * @param {string} input
	 * @returns {string | null}
	 */
	parseHandle(input) {
		throw new Error("parseHandle() must be implemented by platform subclass");
	}
}
