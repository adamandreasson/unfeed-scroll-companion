/**
 * System tray setup for Unfeed client.
 */
import { app, Tray, Menu, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray = null;

const isDev =
	process.env.NODE_ENV === "development" ||
	process.defaultApp ||
	/[\\/]electron/.test(process.execPath);

// macOS tray: 16x16 and 32x32@2x. Do NOT resize template icons (resize adds antialias → weak mask).
const TRAY_SIZE = 16;

/** Resolve dirs to search for tray icons. Packaged app: use resourcesPath; dev: use source tree. */
function getIconSearchDirs() {
	const dirs = [];
	if (process.resourcesPath && app.isPackaged) {
		dirs.push(path.join(process.resourcesPath, "icons"));
	}
	dirs.push(path.join(__dirname, "..", "renderer", "icons"));
	dirs.push(path.join(app.getAppPath(), "src", "renderer", "icons"));
	return dirs;
}

function getTrayIcon() {
	const dirs = getIconSearchDirs();

	// Electron Tray docs (macOS): "The filename needs to end in Template" for system to
	// invert colors and use @2x. Use 16x16 (72dpi) and 32x32@2x (144dpi).
	const templateBase = "trayTemplate.png";
	const template2x = "trayTemplate@2x.png";
	const fallbackBase = "tray.png";

	let iconPath = null;
	for (const dir of dirs) {
		const abs = path.resolve(dir, templateBase);
		if (fs.existsSync(abs)) {
			iconPath = abs;
			break;
		}
	}
	if (!iconPath) {
		for (const dir of dirs) {
			const abs = path.resolve(dir, template2x);
			if (fs.existsSync(abs)) {
				iconPath = abs;
				break;
			}
		}
	}
	if (!iconPath) {
		for (const dir of dirs) {
			const abs = path.resolve(dir, fallbackBase);
			if (fs.existsSync(abs)) {
				iconPath = abs;
				break;
			}
		}
	}

	let img = iconPath ? nativeImage.createFromPath(iconPath) : null;
	if (!img || img.isEmpty()) {
		return nativeImage.createEmpty();
	}

	// macOS template: set BEFORE any resize. Resizing after adds antialias and weakens the alpha mask.
	if (process.platform === "darwin") {
		img.setTemplateImage(true);
	}

	// Do NOT resize template icons; use correct source assets (16x16 / 32x32@2x).
	if (process.platform !== "darwin") {
		const size = img.getSize();
		if (size.width > TRAY_SIZE || size.height > TRAY_SIZE) {
			img = img.resize({ width: TRAY_SIZE, height: TRAY_SIZE });
		}
	}

	return img;
}

/**
 * @param {() => void} onTrayClick - Called when user clicks the tray icon (show popup or login window).
 */
export function createTray(onTrayClick) {
	const icon = getTrayIcon();
	tray = new Tray(icon);
	tray.setToolTip("Unfeed Social Scroller");
	// Left-click: show our popup/login (no context menu = no flash)
	tray.on("click", () => {
		if (typeof onTrayClick === "function") onTrayClick();
	});
	// Right-click: show native menu (Show Unfeed, Quit). Don't use setContextMenu() or macOS shows it on left-click too.
	tray.on("right-click", () => {
		if (!tray || tray.isDestroyed()) return;
		const contextMenu = Menu.buildFromTemplate([
			{
				label: "Show Unfeed",
				click: () => typeof onTrayClick === "function" && onTrayClick(),
			},
			{ type: "separator" },
			{ label: "Quit", role: "quit" },
		]);
		tray.popUpContextMenu(contextMenu);
	});
	// Force redraw after a tick; can help if macOS cached an empty/old icon
	if (icon.size?.width && process.platform === "darwin") {
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

/**
 * No-op: menu is built on right-click only to avoid left-click flash.
 * Kept for API compatibility if initApp calls it.
 */
export function updateTrayMenu() {}

export function destroyTray() {
	if (tray) {
		tray.destroy();
		tray = null;
	}
}
