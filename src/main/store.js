/**
 * Persistent config using electron-store.
 * Session token is encrypted via safeStorage (OS keychain) when available.
 * On macOS we skip keychain: each app update changes the code signature, so
 * the OS prompts for keychain password every time. We store the token in app
 * data instead (user-private ~/Library/Application Support); same threat model
 * as keychain for single-user machines.
 */
import Store from "electron-store";
import { safeStorage } from "electron";
import { platform } from "os";

const store = new Store({ name: "scroll-companion" });

const AUTH_TOKEN_KEY = "authToken";
const AUTH_TOKEN_ENCRYPTED_KEY = "authToken_encrypted";
const SESSION_EMAIL_KEY = "sessionEmail";
const SCROLL_INTERVAL_HOURS_KEY = "scrollIntervalHours";

const DEFAULT_API_BASE = "https://unfeed.ai";
const DEFAULT_SCROLL_INTERVAL_HOURS = 4;

function useEncryption() {
	// Avoid keychain on macOS: updates change the app signature and trigger
	// "enter password for keychain" on every update. App data is user-private.
	if (platform() === "darwin") return false;
	try {
		return safeStorage.isEncryptionAvailable();
	} catch {
		return false;
	}
}

export function getAuthToken() {
	if (useEncryption()) {
		const raw = store.get(AUTH_TOKEN_ENCRYPTED_KEY);
		if (typeof raw !== "string") return store.get(AUTH_TOKEN_KEY) ?? null;
		try {
			return safeStorage.decryptString(Buffer.from(raw, "base64"));
		} catch {
			return null;
		}
	}
	return store.get(AUTH_TOKEN_KEY) ?? null;
}

export function setAuthToken(token) {
	if (!token) {
		store.delete(AUTH_TOKEN_KEY);
		store.delete(AUTH_TOKEN_ENCRYPTED_KEY);
		store.delete(SESSION_EMAIL_KEY);
		return;
	}
	if (useEncryption()) {
		try {
			store.set(
				AUTH_TOKEN_ENCRYPTED_KEY,
				safeStorage.encryptString(token).toString("base64"),
			);
			store.delete(AUTH_TOKEN_KEY);
		} catch {
			store.set(AUTH_TOKEN_KEY, token);
		}
	} else {
		store.set(AUTH_TOKEN_KEY, token);
		store.delete(AUTH_TOKEN_ENCRYPTED_KEY);
	}
}

export function getSessionEmail() {
	return store.get(SESSION_EMAIL_KEY) ?? null;
}

export function setSessionEmail(email) {
	if (email == null || email === "") {
		store.delete(SESSION_EMAIL_KEY);
		return;
	}
	store.set(SESSION_EMAIL_KEY, String(email));
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
