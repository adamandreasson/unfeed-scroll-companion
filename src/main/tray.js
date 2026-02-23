/**
 * System tray setup for Scroll Companion.
 */
import { app, Tray, Menu, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray = null;

const TRAY_SIZE = 16;

/** Directories to search for tray icons (packaged app vs dev). */
function getIconSearchDirs() {
	const dirs = [];
	if (process.resourcesPath && app.isPackaged) {
		dirs.push(path.join(process.resourcesPath, "icons"));
	}
	dirs.push(path.join(__dirname, "..", "renderer", "icons"));
	dirs.push(path.join(app.getAppPath(), "src", "renderer", "icons"));
	// assets/ dir as final fallback (contains the full app icon)
	dirs.push(path.join(__dirname, "..", "..", "assets"));
	if (app.isPackaged) {
		dirs.push(path.join(process.resourcesPath, "app", "assets"));
	}
	return dirs;
}

function getTrayIcon() {
	const dirs = getIconSearchDirs();

	const candidates =
		process.platform === "darwin"
			? ["trayTemplate.png", "trayTemplate@2x.png", "tray.png"]
			: ["tray.png", "icon.ico", "icon.png"];

	let iconPath = null;
	for (const name of candidates) {
		for (const dir of dirs) {
			const abs = path.resolve(dir, name);
			if (fs.existsSync(abs)) {
				iconPath = abs;
				break;
			}
		}
		if (iconPath) break;
	}

	let img = iconPath ? nativeImage.createFromPath(iconPath) : null;
	if (!img || img.isEmpty()) return nativeImage.createEmpty();

	if (process.platform === "darwin") {
		img.setTemplateImage(true);
	} else {
		const size = img.getSize();
		if (size.width > TRAY_SIZE || size.height > TRAY_SIZE) {
			img = img.resize({ width: TRAY_SIZE, height: TRAY_SIZE });
		}
	}

	return img;
}

/**
 * Create the system tray icon.
 * @param {() => void} onTrayClick - Called on left-click.
 */
export function createTray(onTrayClick) {
	const icon = getTrayIcon();
	tray = new Tray(icon);
	tray.setToolTip("Scroll Companion");

	tray.on("click", () => {
		if (typeof onTrayClick === "function") onTrayClick();
	});

	// Right-click: native context menu. Not using setContextMenu() so macOS
	// doesn't show it on left-click too.
	tray.on("right-click", () => {
		if (!tray || tray.isDestroyed()) return;
		const contextMenu = Menu.buildFromTemplate([
			{
				label: "Show Scroll Companion",
				click: () => typeof onTrayClick === "function" && onTrayClick(),
			},
			{ type: "separator" },
			{ label: "Quit", role: "quit" },
		]);
		tray.popUpContextMenu(contextMenu);
	});

	// Force a redraw after a tick (macOS can cache stale icons)
	if (icon.getSize?.()?.width && process.platform === "darwin") {
		setTimeout(() => {
			if (tray && !tray.isDestroyed()) tray.setImage(icon);
		}, 200);
	}

	return tray;
}

export function getTrayBounds() {
	if (!tray || tray.isDestroyed()) return null;
	return tray.getBounds();
}

/** No-op kept for API compatibility. Menu is built on right-click only. */
export function updateTrayMenu() {}

/**
 * Destroy the tray. On macOS, we do not call tray.destroy() during app quit
 * to avoid "Unhandled disconnected auxiliary scene" / BSBlockSentinel crash:
 * the status item's auxiliary scene is torn down asynchronously and can race
 * with process exit. Let the process exit clean up the status item instead.
 */
export function destroyTray() {
	if (!tray) return;
	if (process.platform === "darwin") {
		tray = null;
		return;
	}
	tray.destroy();
	tray = null;
}
