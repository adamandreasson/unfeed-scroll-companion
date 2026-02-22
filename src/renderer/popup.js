/**
 * Tray popup UI: status, connect social accounts, scroll now, settings.
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

	const platformId = "x";
	let platformConnected = false;

	function showFeedStatus(text) {
		if (!feedStatus) return;
		feedStatus.textContent = text || "";
		if (feedStatusRow) feedStatusRow.style.display = "flex";
	}

	function hideFeedStatus() {
		if (feedStatusRow) feedStatusRow.style.display = "none";
	}

	function formatTimeAgo(timestamp) {
		if (!timestamp) return "";
		const diffMs = Date.now() - new Date(timestamp).getTime();
		const diffMin = Math.floor(diffMs / 60_000);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);

		if (diffMin < 1) return "just now";
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHour < 24) return `${diffHour}h ago`;
		if (diffDay < 7) return `${diffDay}d ago`;
		return new Date(timestamp).toLocaleDateString();
	}

	async function refreshLastScrollTime() {
		if (!lastScrollTime || !window.unfeed?.getSocialFeedStatus) return;
		try {
			const s = await window.unfeed.getSocialFeedStatus();
			lastScrollTime.textContent =
				!s.error && s.lastUploadAt ? formatTimeAgo(s.lastUploadAt) : "";
		} catch {
			lastScrollTime.textContent = "";
		}
	}

	async function refreshFeedStatus() {
		if (!feedStatus || !window.unfeed?.getSocialFeedStatus) return;
		try {
			const s = await window.unfeed.getSocialFeedStatus();
			s.error ? showFeedStatus("Error: " + s.error) : hideFeedStatus();
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
			platformAccountInfo.textContent = ok
				? info?.username
					? `@${info.username}`
					: "Connected"
				: "Not connected";
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
		if (!unfeedAccountInfo || !window.unfeed?.getAuthToken) return;
		try {
			const token = await window.unfeed.getAuthToken();
			if (!token) {
				unfeedAccountInfo.textContent = "Not logged in";
				return;
			}
			const sessionEmail =
				window.unfeed?.getSessionEmail &&
				(await window.unfeed.getSessionEmail());
			unfeedAccountInfo.textContent = sessionEmail || "Logged in";
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

	async function showVersionInTitle() {
		const titleEl = document.querySelector(".popup-title");
		if (!titleEl || !window.unfeed?.getVersion) return;
		try {
			const version = await window.unfeed.getVersion();
			if (version) titleEl.textContent = `Scroll Companion v${version}`;
		} catch {}
	}

	async function init() {
		if (!window.unfeed) {
			showFeedStatus("Error: Application not initialized");
			if (connectPlatformBtn) connectPlatformBtn.disabled = true;
			return;
		}
		await Promise.all([
			showVersionInTitle(),
			refreshFeedStatus(),
			refreshLastScrollTime(),
			refreshPlatformLabel(),
			refreshUnfeedIdentity(),
			loadOpenAtLogin(),
		]);
	}

	// Event listeners
	openAtLoginCheck?.addEventListener("change", async () => {
		if (window.unfeed?.setOpenAtLogin)
			await window.unfeed.setOpenAtLogin(openAtLoginCheck.checked);
	});

	connectPlatformBtn?.addEventListener("click", async () => {
		connectPlatformBtn.disabled = true;
		try {
			if (platformConnected) {
				if (window.unfeed?.clearSocialSession)
					await window.unfeed.clearSocialSession(platformId);
			} else {
				if (!window.unfeed?.openSocialLogin) {
					showFeedStatus("Error: Login function not available");
					return;
				}
				const result = await window.unfeed.openSocialLogin(platformId);
				if (result && !result.ok) {
					showFeedStatus(
						"Error: " + (result.error || "Failed to open login window"),
					);
				}
			}
			await refreshPlatformLabel();
		} catch (error) {
			showFeedStatus("Error: " + (error?.message || "Unknown error"));
		} finally {
			connectPlatformBtn.disabled = false;
		}
	});

	function showScrollProgress(collected, max) {
		if (!scrollRow || !scrollText || !scrollFill) return;
		scrollRow.style.display = "flex";
		scrollText.textContent = collected + " / " + max;
		scrollFill.style.width =
			(max > 0 ? Math.min(100, Math.round((collected / max) * 100)) : 0) + "%";
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
			if (result?.error) {
				showFeedStatus("Error: " + result.error);
			} else {
				await Promise.all([refreshFeedStatus(), refreshLastScrollTime()]);
			}
		} finally {
			hideScrollProgress();
			scrollBtn.disabled = !platformConnected;
		}
	});

	logoutBtn?.addEventListener("click", async () => {
		if (!window.unfeed?.setAuthToken) return;
		logoutBtn.disabled = true;
		try {
			if (window.unfeed?.clearAllSocialSessions)
				await window.unfeed.clearAllSocialSessions();
			await window.unfeed.setAuthToken(null);
			if (unfeedAccountInfo) unfeedAccountInfo.textContent = "Not logged in";
			await refreshPlatformLabel();
			window.unfeed?.logoutComplete?.();
		} catch {
			await window.unfeed.setAuthToken(null);
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
