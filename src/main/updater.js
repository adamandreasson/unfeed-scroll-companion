/**
 * Auto-update via Electron's built-in autoUpdater (Squirrel) and
 * update.electronjs.org as the feed server.
 *
 * Supports Windows (Squirrel.Windows) and macOS (Squirrel.Mac).
 * Linux has no built-in auto-update; users update via package manager.
 *
 * Only active in packaged (production) builds.
 */
import { app, autoUpdater } from "electron";
import { devLog } from "./log.js";

const OWNER = "adamandreasson";
const REPO = "unfeed-scroll-companion";
const UPDATE_SERVER = `https://update.electronjs.org/${OWNER}/${REPO}`;

const INITIAL_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000; // 4 hours

export function setupAutoUpdate() {
	if (process.defaultApp || process.env.NODE_ENV === "development") return;
	if (!app.isPackaged) return;
	if (process.platform !== "win32" && process.platform !== "darwin") return;

	const platform = `${process.platform}-${process.arch}`;
	const version = app.getVersion();
	const feedURL = `${UPDATE_SERVER}/${platform}/${version}`;

	devLog("[updater] Feed URL:", feedURL);
	autoUpdater.setFeedURL({ url: feedURL });

	autoUpdater.on("checking-for-update", () => {
		devLog("[updater] Checking for update…");
	});
	autoUpdater.on("update-available", () => {
		devLog("[updater] Update available, downloading…");
	});
	autoUpdater.on("update-not-available", () => {
		devLog("[updater] Up to date");
	});
	autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
		devLog("[updater] Update downloaded:", releaseName || "(unknown)");
		autoUpdater.quitAndInstall();
	});
	autoUpdater.on("error", (err) => {
		devLog("[updater] Error:", err?.message || err);
	});

	setTimeout(() => {
		autoUpdater.checkForUpdates();
		setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS);
	}, INITIAL_DELAY_MS);
}
