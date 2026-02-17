/**
 * Platform registry and factory.
 * Manages available social media platform implementations.
 */
import { XPlatform } from "./x.js";

const platforms = new Map();

// Register X platform
const xPlatform = new XPlatform();
platforms.set("x", xPlatform);

/**
 * Get a platform instance by ID.
 * @param {string} platformId - Platform identifier (e.g., "x")
 * @returns {PlatformBase | null}
 */
export function getPlatform(platformId) {
	return platforms.get(platformId) || null;
}

/**
 * Get all registered platform IDs.
 * @returns {string[]}
 */
export function getPlatformIds() {
	return Array.from(platforms.keys());
}

/**
 * Get all registered platform instances.
 * @returns {PlatformBase[]}
 */
export function getAllPlatforms() {
	return Array.from(platforms.values());
}

/**
 * Get the default platform (currently X).
 * @returns {PlatformBase}
 */
export function getDefaultPlatform() {
	return xPlatform;
}
