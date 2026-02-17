/**
 * IPC handlers for renderer (invoke from preload).
 */
import { ipcMain, session } from "electron";
import * as store from "./store.js";
import { uploadPosts as apiUploadPosts, getSocialFeedStatus as apiGetSocialFeedStatus } from "./api-client.js";

const isDev =
	process.env.NODE_ENV === "development" ||
	process.defaultApp ||
	/[\\/]electron/.test(process.execPath);

function devLog(...args) {
	if (isDev) console.log("[client]", ...args);
}

export function registerIpcHandlers() {
	ipcMain.handle("log", (_, ...args) => {
		if (isDev) console.log("[client]", ...args);
	});
	ipcMain.handle("getApiBase", () => {
		const base = store.getApiBase();
		devLog("getApiBase ->", base);
		return base;
	});
	ipcMain.handle("getJwt", () => store.getJwt());
	ipcMain.handle("setJwt", (_, token) => store.setJwt(token));
	ipcMain.handle("getScrollIntervalHours", () => store.getScrollIntervalHours());
	ipcMain.handle("setScrollIntervalHours", (_, hours) =>
		store.setScrollIntervalHours(hours),
	);
	ipcMain.handle("getOpenAtLogin", () => store.getOpenAtLogin());
	ipcMain.handle("setOpenAtLogin", (_, value) => store.setOpenAtLogin(value));
	async function getPlatformInstance(platformId = "x") {
		const { getPlatform } = await import("./platforms/index.js");
		return getPlatform(platformId);
	}

	ipcMain.handle("openSocialLogin", async (_, platformId = "x") => {
		devLog("openSocialLogin requested for platform:", platformId);
		try {
			const platform = await getPlatformInstance(platformId);
			if (!platform) {
				devLog("Platform not found:", platformId);
				return { ok: false, error: `Platform not found: ${platformId}` };
			}
			const success = await platform.openLoginWindow();
			devLog("openLoginWindow result:", success);
			return { ok: success };
		} catch (error) {
			devLog("Error in openSocialLogin:", error);
			return { ok: false, error: error?.message || "Failed to open login window" };
		}
	});
	ipcMain.handle("checkSocialSession", async (_, platformId = "x") => {
		const platform = await getPlatformInstance(platformId);
		if (!platform) return false;
		const info = await platform.getAccountInfo();
		return !!info.connected;
	});
	ipcMain.handle("getSocialAccountInfo", async (_, platformId = "x") => {
		const platform = await getPlatformInstance(platformId);
		if (!platform) {
			return { connected: false, username: null };
		}
		return await platform.getAccountInfo();
	});
	ipcMain.handle("clearSocialSession", async (_, platformId = "x") => {
		const platform = await getPlatformInstance(platformId);
		if (platform) {
			await platform.clearSession();
		}
		return { ok: true };
	});
	ipcMain.handle("clearAllSocialSessions", async () => {
		devLog("clearAllSocialSessions: clearing all social accounts");
		try {
			const { getPlatformIds } = await import("./platforms/index.js");
			const platformIds = getPlatformIds();
			
			// Clear sessions for all platforms
			for (const platformId of platformIds) {
				try {
					const platform = await getPlatformInstance(platformId);
					if (platform) {
						await platform.clearSession();
						devLog("Cleared session for platform:", platformId);
					}
				} catch (error) {
					devLog("Error clearing session for platform", platformId, ":", error);
				}
			}
			
			// Clear all cached social usernames
			store.clearAllCachedSocialUsernames();
			devLog("Cleared all cached social usernames");
			
			// Clear all session partitions (cookies, cache, etc.)
			for (const platformId of platformIds) {
				try {
					const partition = `persist:socialfeed-${platformId}`;
					const sess = session.fromPartition(partition, { cache: true });
					await sess.clearStorageData();
					await sess.clearCache();
					devLog("Cleared storage and cache for partition:", partition);
				} catch (error) {
					devLog("Error clearing partition for platform", platformId, ":", error);
				}
			}
			
			return { ok: true };
		} catch (error) {
			devLog("Error in clearAllSocialSessions:", error);
			return { ok: false, error: error?.message || "Failed to clear all social sessions" };
		}
	});
	ipcMain.handle("getSocialFeedStatus", async () => apiGetSocialFeedStatus());
	ipcMain.handle("uploadPosts", async (_, posts, platformId) => apiUploadPosts(posts || [], platformId));

	// Auth: main process does the HTTP request (avoids renderer fetch/CORS/file origin issues)
	ipcMain.handle("requestPin", async (_, email) => {
		const base = store.getApiBase();
		devLog("requestPin", email, "->", base + "/api/auth/request-pin");
		try {
			const res = await fetch(`${base}/api/auth/request-pin`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			devLog("requestPin response", res.status);
			const data = await res.json().catch(() => ({}));
			if (res.ok) return { ok: true };
			return { ok: false, error: data.error || res.statusText };
		} catch (e) {
			devLog("requestPin failed", e?.message);
			return { ok: false, error: e?.message || "Network error" };
		}
	});
	ipcMain.handle("verifyPin", async (_, email, pin) => {
		const base = store.getApiBase();
		devLog("verifyPin", email, "->", base + "/api/auth/verify-pin");
		try {
			const res = await fetch(`${base}/api/auth/verify-pin`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, pin }),
			});
			devLog("verifyPin response", res.status);
			const data = await res.json().catch(() => ({}));
			if (res.ok && data.token) return { ok: true, token: data.token };
			return { ok: false, error: data.error || "Invalid or expired code" };
		} catch (e) {
			devLog("verifyPin failed", e?.message);
			return { ok: false, error: e?.message || "Network error" };
		}
	});
	ipcMain.handle("runScrollNow", async (event) => {
		devLog("runScrollNow: attempting scroll with backend check...");
		const { attemptScrollWithBackendCheck } = await import("./scheduler.js");
		const onProgress = (collected, max) => {
			try {
				event.sender.send("scroll-progress", { collected, max });
			} catch (_) {}
		};
		const result = await attemptScrollWithBackendCheck({ onProgress });
		devLog("runScrollNow: result", result);
		if (result.skipped) {
			return { ok: false, saved: 0, total: 0, error: result.reason ?? "Scroll skipped" };
		}
		return {
			ok: !result.error,
			saved: result.saved ?? 0,
			total: result.total ?? 0,
			error: result.error,
		};
	});
}
