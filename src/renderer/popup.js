/**
 * Tray popup UI: scroll, status, connect social accounts, open at login, logout.
 * Uses same IPC as login (preload exposes unfeed).
 */
(function () {
	const feedStatus = document.getElementById("feedStatus");
	const feedStatusRow = feedStatus?.closest(".row") || null;
	const scrollBtn = document.getElementById("scrollNow");
	const connectPlatformBtn = document.getElementById("connectX");
	const platformAccountInfo = document.getElementById("xAccountInfo");
	const unfeedAccountInfo = document.getElementById("unfeedAccountInfo");
	const openAtLoginCheck = document.getElementById("openAtLogin");
	const logoutBtn = document.getElementById("logout");
	const scrollRow = document.getElementById("scrollProgress");
	const scrollText = document.getElementById("scrollProgressText");
	const scrollFill = document.getElementById("scrollProgressFill");
	const lastScrollTime = document.getElementById("lastScrollTime");
	const platformId = "x"; // Currently supporting X platform
	let platformConnected = false;

	function showFeedStatus(text) {
		if (!feedStatus) return;
		feedStatus.textContent = text || "";
		if (feedStatusRow) feedStatusRow.style.display = "flex";
	}

	function hideFeedStatus() {
		if (feedStatusRow) feedStatusRow.style.display = "none";
	}

	function decodeJwtPayload(token) {
		if (!token || typeof token !== "string") return null;
		const parts = token.split(".");
		if (parts.length < 2) return null;
		try {
			const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
			const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
			return JSON.parse(atob(b64 + pad));
		} catch {
			return null;
		}
	}

	function formatTimeAgo(timestamp) {
		if (!timestamp) return "";
		const now = Date.now();
		const then = new Date(timestamp).getTime();
		const diffMs = now - then;
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);

		if (diffSec < 60) return "just now";
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHour < 24) return `${diffHour}h ago`;
		if (diffDay < 7) return `${diffDay}d ago`;
		return new Date(timestamp).toLocaleDateString();
	}

	async function refreshLastScrollTime() {
		if (!lastScrollTime || !window.unfeed?.getSocialFeedStatus) return;
		try {
			const s = await window.unfeed.getSocialFeedStatus();
			if (s.error || !s.lastUploadAt) {
				lastScrollTime.textContent = "";
				return;
			}
			lastScrollTime.textContent = formatTimeAgo(s.lastUploadAt);
		} catch {
			lastScrollTime.textContent = "";
		}
	}

	async function refreshFeedStatus() {
		if (!feedStatus || !window.unfeed?.getSocialFeedStatus) return;
		try {
			const s = await window.unfeed.getSocialFeedStatus();
			if (s.error) {
				showFeedStatus("Error: " + s.error);
			} else {
				hideFeedStatus();
			}
		} catch {
			hideFeedStatus();
		}
	}

	async function refreshPlatformLabel() {
		if (!connectPlatformBtn || !platformAccountInfo) return;
		if (!window.unfeed?.getSocialAccountInfo) {
			platformAccountInfo.textContent = "Not connected";
			connectPlatformBtn.textContent = "Connect";
			platformConnected = false;
			if (scrollBtn) scrollBtn.disabled = true;
			return;
		}
		try {
			const info = await window.unfeed.getSocialAccountInfo(platformId);
			const ok = !!info?.connected;
			platformConnected = ok;
			const handle = info?.username ? `@${info.username}` : null;
			platformAccountInfo.textContent = ok ? handle || "Connected (user unknown)" : "Not connected";
			connectPlatformBtn.textContent = ok ? "Sign out" : "Connect";
			if (scrollBtn) scrollBtn.disabled = !ok;
		} catch {
			platformConnected = false;
			connectPlatformBtn.textContent = "Connect";
			platformAccountInfo.textContent = "Not connected";
			if (scrollBtn) scrollBtn.disabled = true;
		}
	}

	async function refreshUnfeedIdentity() {
		if (!unfeedAccountInfo || !window.unfeed?.getJwt) return;
		try {
			const token = await window.unfeed.getJwt();
			if (!token) {
				unfeedAccountInfo.textContent = "Not logged in";
				return;
			}
			const payload = decodeJwtPayload(token);
			const id =
				payload?.email ||
				payload?.username ||
				payload?.name ||
				payload?.sub ||
				"Logged in";
			unfeedAccountInfo.textContent = String(id);
		} catch {
			unfeedAccountInfo.textContent = "Logged in";
		}
	}

	async function loadOpenAtLogin() {
		if (!openAtLoginCheck || !window.unfeed?.getOpenAtLogin) return;
		try {
			openAtLoginCheck.checked = await window.unfeed.getOpenAtLogin();
		} catch {}
	}

	async function init() {
		if (!window.unfeed) {
			console.error("window.unfeed not available - preload script may not have loaded");
			showFeedStatus("Error: Application not initialized");
			if (connectPlatformBtn) connectPlatformBtn.disabled = true;
			return;
		}
		await Promise.all([
			refreshFeedStatus(),
			refreshLastScrollTime(),
			refreshPlatformLabel(),
			refreshUnfeedIdentity(),
			loadOpenAtLogin(),
		]);
	}

	openAtLoginCheck?.addEventListener("change", async () => {
		if (!window.unfeed?.setOpenAtLogin) return;
		await window.unfeed.setOpenAtLogin(openAtLoginCheck.checked);
	});

	if (connectPlatformBtn) {
		connectPlatformBtn.addEventListener("click", async () => {
			console.log("Connect button clicked, platformConnected:", platformConnected);
			connectPlatformBtn.disabled = true;
			try {
				if (platformConnected) {
					if (!window.unfeed?.clearSocialSession) {
						console.error("clearSocialSession not available");
						showFeedStatus("Error: Sign out function not available");
						return;
					}
					await window.unfeed.clearSocialSession(platformId);
				} else {
					if (!window.unfeed) {
						console.error("window.unfeed not available");
						showFeedStatus("Error: Application not initialized");
						return;
					}
					if (!window.unfeed.openSocialLogin) {
						console.error("openSocialLogin not available");
						showFeedStatus("Error: Login function not available");
						return;
					}
					console.log("Calling openSocialLogin for platform:", platformId);
					const result = await window.unfeed.openSocialLogin(platformId);
					console.log("openSocialLogin result:", result);
					if (result && !result.ok) {
						console.error("Login failed:", result.error);
						showFeedStatus("Error: " + (result.error || "Failed to open login window"));
					}
				}
				await refreshPlatformLabel();
			} catch (error) {
				console.error("Error in connect button:", error);
				showFeedStatus("Error: " + (error?.message || "Unknown error"));
			} finally {
				connectPlatformBtn.disabled = false;
			}
		});
	} else {
		console.error("connectPlatformBtn element not found");
	}

	function showScrollProgress(collected, max) {
		if (!scrollRow || !scrollText || !scrollFill) return;
		scrollRow.style.display = "flex";
		scrollText.textContent = collected + " / " + max;
		const pct = max > 0 ? Math.min(100, Math.round((collected / max) * 100)) : 0;
		scrollFill.style.width = pct + "%";
	}
	function hideScrollProgress() {
		if (scrollRow) scrollRow.style.display = "none";
	}

	scrollBtn?.addEventListener("click", async () => {
		if (!window.unfeed?.runScrollNow || !platformConnected) return;
		scrollBtn.disabled = true;
		showScrollProgress(0, 100);
		try {
			const result = await window.unfeed.runScrollNow();
			hideScrollProgress();
			if (result?.error) showFeedStatus("Error: " + result.error);
			else {
				await Promise.all([refreshFeedStatus(), refreshLastScrollTime()]);
			}
		} finally {
			hideScrollProgress();
			scrollBtn.disabled = !platformConnected;
		}
	});

	logoutBtn?.addEventListener("click", async () => {
		if (!window.unfeed?.setJwt) return;
		logoutBtn.disabled = true;
		try {
			// Clear all social accounts and their local storage first
			if (window.unfeed?.clearAllSocialSessions) {
				console.log("Clearing all social accounts...");
				await window.unfeed.clearAllSocialSessions();
			}
			// Then clear the unfeed JWT
			await window.unfeed.setJwt(null);
			if (unfeedAccountInfo) unfeedAccountInfo.textContent = "Not logged in";
			// Refresh platform labels to show disconnected state
			await refreshPlatformLabel();
			window.unfeed?.logoutComplete?.();
		} catch (error) {
			console.error("Error during logout:", error);
			// Still try to clear JWT even if clearing social sessions failed
			await window.unfeed.setJwt(null);
			if (unfeedAccountInfo) unfeedAccountInfo.textContent = "Not logged in";
			window.unfeed?.logoutComplete?.();
		} finally {
			logoutBtn.disabled = false;
		}
	});

	document.getElementById("exit")?.addEventListener("click", () => {
		window.unfeed?.quit?.();
	});

	if (window.unfeed?.setOnScrollProgress) {
		window.unfeed.setOnScrollProgress((data) => {
			showScrollProgress(data.collected ?? 0, data.max ?? 100);
		});
	}

	init();
})();
