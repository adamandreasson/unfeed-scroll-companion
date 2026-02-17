/**
 * Persistent config using electron-store.
 * JWT is stored via safeStorage when available (OS keychain).
 */
import Store from "electron-store";
import { safeStorage } from "electron";

const store = new Store({ name: "unfeed-client" });

const JWT_KEY = "jwt";
const JWT_ENCRYPTED_KEY = "jwt_encrypted";
const SCROLL_INTERVAL_HOURS_KEY = "scrollIntervalHours";

const DEFAULT_API_BASE = "https://unfeed.ai";
const DEFAULT_SCROLL_INTERVAL_HOURS = 4;

function useEncryption() {
	try {
		return safeStorage.isEncryptionAvailable();
	} catch {
		return false;
	}
}

export function getJwt() {
	if (useEncryption()) {
		const raw = store.get(JWT_ENCRYPTED_KEY);
		if (typeof raw !== "string") return store.get(JWT_KEY) ?? null;
		try {
			return safeStorage.decryptString(Buffer.from(raw, "base64"));
		} catch {
			return null;
		}
	}
	return store.get(JWT_KEY) ?? null;
}

export function setJwt(token) {
	if (!token) {
		store.delete(JWT_KEY);
		store.delete(JWT_ENCRYPTED_KEY);
		return;
	}
	if (useEncryption()) {
		try {
			store.set(
				JWT_ENCRYPTED_KEY,
				safeStorage.encryptString(token).toString("base64"),
			);
			store.delete(JWT_KEY);
		} catch {
			store.set(JWT_KEY, token);
		}
	} else {
		store.set(JWT_KEY, token);
		store.delete(JWT_ENCRYPTED_KEY);
	}
}

export function getApiBase() {
	return process.env.UNFEED_API_BASE?.trim() || DEFAULT_API_BASE;
}

/** Minimum 2h to match server rate limit. */
export function getScrollIntervalHours() {
	const v =
		store.get(SCROLL_INTERVAL_HOURS_KEY) ?? DEFAULT_SCROLL_INTERVAL_HOURS;
	return Math.max(2, Math.min(24, v));
}

/** Minimum 2h to match server rate limit (at most 1 social feed scroll upload per 2h). */
export function setScrollIntervalHours(hours) {
	store.set(SCROLL_INTERVAL_HOURS_KEY, Math.max(2, Math.min(24, hours)));
}

export function getOpenAtLogin() {
	return store.get("openAtLogin") ?? true;
}

export function setOpenAtLogin(value) {
	store.set("openAtLogin", !!value);
}

/**
 * Get cached username for a platform.
 * @param {string} platformId - Platform identifier (e.g., "x")
 * @returns {string | null}
 */
export function getCachedSocialUsername(platformId) {
	const key = `cachedSocialUsernames.${platformId}`;
	return store.get(key) ?? null;
}

/**
 * Set cached username for a platform.
 * @param {string} platformId - Platform identifier (e.g., "x")
 * @param {string | null} username - Username to cache, or null to clear
 */
export function setCachedSocialUsername(platformId, username) {
	const key = `cachedSocialUsernames.${platformId}`;
	if (username) {
		store.set(key, username);
	} else {
		store.delete(key);
	}
}

/**
 * Clear all cached social usernames for all platforms.
 */
export function clearAllCachedSocialUsernames() {
	const storeData = store.store; // Access the underlying data object
	const keysToDelete = [];
	
	// Find all keys that match the pattern cachedSocialUsernames.*
	for (const key of Object.keys(storeData)) {
		if (key.startsWith("cachedSocialUsernames.")) {
			keysToDelete.push(key);
		}
	}
	
	// Delete all found keys
	for (const key of keysToDelete) {
		store.delete(key);
	}
}
