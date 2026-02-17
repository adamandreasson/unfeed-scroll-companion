/**
 * Auto-update via electron-updater.
 * Only runs in packaged app (not in electron-forge start).
 */
import { app } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;

export function setupAutoUpdate() {
	// Skip in development
	if (process.defaultApp || process.env.NODE_ENV === "development") return;
	// Skip if not packaged
	if (!app.isPackaged) return;

	autoUpdater.autoDownload = false;
	autoUpdater.on("update-available", () => {
		autoUpdater.downloadUpdate().catch(() => {});
	});
	autoUpdater.on("update-downloaded", () => {
		autoUpdater.quitAndInstall(false, true);
	});
	// Check after a short delay so app starts fast
	setTimeout(() => {
		autoUpdater.checkForUpdates().catch(() => {});
	}, 10 * 1000);
}
