/**
 * IPC handlers bridging renderer ↔ main process.
 */
import { app, ipcMain, session } from "electron";
import * as store from "./store.js";
import {
	uploadPosts as apiUploadPosts,
	getSocialFeedStatus as apiGetSocialFeedStatus,
} from "./api-client.js";
import { devLog } from "./log.js";

export function registerIpcHandlers() {
	// App info
	ipcMain.handle("getVersion", () => app.getVersion());

	// Logging
	ipcMain.handle("log", (_, ...args) => devLog("[renderer]", ...args));

	// Store: auth
	ipcMain.handle("getApiBase", () => store.getApiBase());
	ipcMain.handle("getAuthToken", () => store.getAuthToken());
	ipcMain.handle("setAuthToken", (_, token) => store.setAuthToken(token));
	ipcMain.handle("getSessionEmail", () => store.getSessionEmail());

	// Store: settings
	ipcMain.handle("getScrollIntervalHours", () =>
		store.getScrollIntervalHours(),
	);
	ipcMain.handle("setScrollIntervalHours", (_, hours) =>
		store.setScrollIntervalHours(hours),
	);
	ipcMain.handle("getOpenAtLogin", () => store.getOpenAtLogin());
	ipcMain.handle("setOpenAtLogin", (_, value) => store.setOpenAtLogin(value));

	// Platform helpers
	async function getPlatformInstance(platformId = "x") {
		const { getPlatform } = await import("./platforms/index.js");
		return getPlatform(platformId);
	}

	// Social account management
	ipcMain.handle("openSocialLogin", async (_, platformId = "x") => {
		try {
			const platform = await getPlatformInstance(platformId);
			if (!platform)
				return { ok: false, error: `Platform not found: ${platformId}` };
			const success = await platform.openLoginWindow();
			return { ok: success };
		} catch (error) {
			return {
				ok: false,
				error: error?.message || "Failed to open login window",
			};
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
		if (!platform) return { connected: false, username: null };
		return platform.getAccountInfo();
	});

	ipcMain.handle("clearSocialSession", async (_, platformId = "x") => {
		const platform = await getPlatformInstance(platformId);
		if (platform) await platform.clearSession();
		return { ok: true };
	});

	ipcMain.handle("clearAllSocialSessions", async () => {
		try {
			const { getPlatformIds } = await import("./platforms/index.js");
			const platformIds = getPlatformIds();

			for (const id of platformIds) {
				try {
					const platform = await getPlatformInstance(id);
					if (platform) await platform.clearSession();
				} catch {}
			}

			store.clearAllCachedSocialUsernames();

			for (const id of platformIds) {
				try {
					const sess = session.fromPartition(`persist:socialfeed-${id}`, {
						cache: true,
					});
					await sess.clearStorageData();
					await sess.clearCache();
				} catch {}
			}

			return { ok: true };
		} catch (error) {
			return { ok: false, error: error?.message || "Failed to clear sessions" };
		}
	});

	// API proxies
	ipcMain.handle("getSocialFeedStatus", () => apiGetSocialFeedStatus());
	ipcMain.handle("uploadPosts", (_, posts, platformId) =>
		apiUploadPosts(posts || [], platformId),
	);

	// Auth: main process handles HTTP to avoid renderer CORS issues
	// Request body matches frontend (account page): login_only: true for existing-account login
	ipcMain.handle("requestPin", async (_, email) => {
		const base = store.getApiBase();
		try {
			const res = await fetch(`${base}/api/auth/request-pin`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, login_only: true }),
			});
			const data = await res.json().catch(() => ({}));
			const hint =
				!res.ok && base === "https://unfeed.ai"
					? " If you use a custom backend, set UNFEED_API_BASE in .env to your backend URL (same as NEXT_PUBLIC_API_URL)."
					: "";
			return res.ok
				? { ok: true }
				: { ok: false, error: (data.error || res.statusText) + hint };
		} catch (e) {
			return { ok: false, error: e?.message || "Network error" };
		}
	});

	ipcMain.handle("verifyPin", async (_, email, pin) => {
		const base = store.getApiBase();
		try {
			const res = await fetch(`${base}/api/auth/verify-pin`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Client-Session": "true",
				},
				body: JSON.stringify({ email, pin }),
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok && data.token) {
				store.setAuthToken(data.token);
				if (data.email) store.setSessionEmail(data.email);
				return { ok: true, token: data.token, email: data.email };
			}
			return { ok: false, error: data.error || "Invalid or expired code" };
		} catch (e) {
			return { ok: false, error: e?.message || "Network error" };
		}
	});

	// Scrolling
	ipcMain.handle("runScrollNow", async (event) => {
		const { attemptScrollWithBackendCheck } = await import("./scheduler.js");
		const onProgress = (collected, max) => {
			try {
				event.sender.send("scroll-progress", { collected, max });
			} catch {}
		};
		const result = await attemptScrollWithBackendCheck({ onProgress });
		if (result.skipped) {
			return {
				ok: false,
				saved: 0,
				total: 0,
				error: result.reason ?? "Scroll skipped",
			};
		}
		return {
			ok: !result.error,
			saved: result.saved ?? 0,
			total: result.total ?? 0,
			error: result.error,
		};
	});
}
