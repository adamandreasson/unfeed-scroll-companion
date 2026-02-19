/**
 * Persistent config using electron-store.
 * JWT is encrypted via safeStorage (OS keychain) when available.
 */
import Store from "electron-store";
import { safeStorage } from "electron";

const store = new Store({ name: "scroll-companion" });

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

/** @returns {number} Clamped between 2–24 hours. */
export function getScrollIntervalHours() {
	const v =
		store.get(SCROLL_INTERVAL_HOURS_KEY) ?? DEFAULT_SCROLL_INTERVAL_HOURS;
	return Math.max(2, Math.min(24, v));
}

/** @param {number} hours - Clamped between 2–24 hours. */
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
 * @param {string} platformId
 * @returns {string | null}
 */
export function getCachedSocialUsername(platformId) {
	return store.get(`cachedSocialUsernames.${platformId}`) ?? null;
}

/**
 * @param {string} platformId
 * @param {string | null} username
 */
export function setCachedSocialUsername(platformId, username) {
	const key = `cachedSocialUsernames.${platformId}`;
	username ? store.set(key, username) : store.delete(key);
}

/** Clear all cached social usernames across platforms. */
export function clearAllCachedSocialUsernames() {
	for (const key of Object.keys(store.store)) {
		if (key.startsWith("cachedSocialUsernames.")) {
			store.delete(key);
		}
	}
}
