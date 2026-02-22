/**
 * Scroll Companion – Electron main process.
 * System tray app: scrolls social media feeds and uploads them to unfeed.ai.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { app, BrowserWindow, screen, session, ipcMain } from "electron";
import {
	createTray,
	updateTrayMenu,
	destroyTray,
	getTrayBounds,
} from "./tray.js";
import { getOpenAtLogin, getApiBase, getJwt } from "./store.js";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { startScheduler } from "./scheduler.js";
import { setupAutoUpdate } from "./updater.js";
import { isDev, devLog } from "./log.js";

registerIpcHandlers();

/** @type {BrowserWindow | null} */
let loginWindow = null;
/** @type {BrowserWindow | null} */
let popupWindow = null;
let tray = null;

ipcMain.handle("loginComplete", () => {
	loginWindow?.close();
});
ipcMain.handle("logoutComplete", () => {
	popupWindow?.close();
	showLoginWindow();
});
ipcMain.handle("quit", () => {
	app.quit();
});

const preloadPath = path.join(__dirname, "..", "preload", "preload.cjs");
const loginPath = path.join(__dirname, "..", "renderer", "login.html");
const popupPath = path.join(__dirname, "..", "renderer", "popup.html");
const appIconPath = path.join(__dirname, "..", "..", "assets", "icon.ico");

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 250;

function createLoginWindow() {
	if (loginWindow && !loginWindow.isDestroyed()) return loginWindow;
	loginWindow = new BrowserWindow({
		width: 380,
		height: 420,
		show: false,
		icon: appIconPath,
		autoHideMenuBar: true,
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: !isDev,
		},
		title: "Scroll Companion – Log in",
	});
	loginWindow.on("closed", () => {
		loginWindow = null;
	});
	loginWindow.loadFile(loginPath);
	loginWindow.once("ready-to-show", () => {
		loginWindow?.show();
		loginWindow?.focus();
	});
	return loginWindow;
}

function createPopupWindow() {
	if (popupWindow && !popupWindow.isDestroyed()) return popupWindow;
	popupWindow = new BrowserWindow({
		width: POPUP_WIDTH,
		height: POPUP_HEIGHT,
		show: false,
		frame: false,
		resizable: false,
		icon: appIconPath,
		autoHideMenuBar: true,
		transparent: process.platform === "darwin",
		hasShadow: true,
		roundedCorners: true,
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: !isDev,
		},
		title: "Scroll Companion",
	});
	popupWindow.on("closed", () => {
		popupWindow = null;
	});
	popupWindow.on("blur", () => {
		if (popupWindow && !popupWindow.isDestroyed()) {
			popupWindow.close();
		}
	});
	popupWindow.loadFile(popupPath);
	return popupWindow;
}

const POPUP_GAP = 4;

function positionPopupNearTray() {
	const bounds = getTrayBounds();
	if (!bounds || !popupWindow || popupWindow.isDestroyed()) return;

	const trayCenterX = bounds.x + bounds.width / 2;
	const trayCenterY = bounds.y + bounds.height / 2;
	const display = screen.getDisplayNearestPoint({ x: trayCenterX, y: trayCenterY });
	const wa = display.workArea;
	const da = display.bounds;

	// Detect which edge the taskbar occupies by comparing workArea to full display bounds.
	const taskbarBottom = da.y + da.height - (wa.y + wa.height);
	const taskbarTop = wa.y - da.y;
	const taskbarLeft = wa.x - da.x;
	const taskbarRight = da.x + da.width - (wa.x + wa.width);
	const maxEdge = Math.max(taskbarBottom, taskbarTop, taskbarLeft, taskbarRight);

	let x, y;

	if (maxEdge === taskbarBottom || (maxEdge === 0 && bounds.y > wa.y + wa.height / 2)) {
		// Taskbar at bottom (or ambiguous but tray is in lower half): popup above
		x = Math.round(trayCenterX - POPUP_WIDTH / 2);
		y = Math.round(bounds.y - POPUP_HEIGHT - POPUP_GAP);
	} else if (maxEdge === taskbarTop) {
		// Taskbar at top: popup below
		x = Math.round(trayCenterX - POPUP_WIDTH / 2);
		y = Math.round(bounds.y + bounds.height + POPUP_GAP);
	} else if (maxEdge === taskbarLeft) {
		// Taskbar at left: popup to the right
		x = Math.round(bounds.x + bounds.width + POPUP_GAP);
		y = Math.round(trayCenterY - POPUP_HEIGHT / 2);
	} else {
		// Taskbar at right: popup to the left
		x = Math.round(bounds.x - POPUP_WIDTH - POPUP_GAP);
		y = Math.round(trayCenterY - POPUP_HEIGHT / 2);
	}

	// Clamp to workArea so the popup never goes off-screen
	x = Math.max(wa.x, Math.min(x, wa.x + wa.width - POPUP_WIDTH));
	y = Math.max(wa.y, Math.min(y, wa.y + wa.height - POPUP_HEIGHT));

	popupWindow.setPosition(x, y);
}

function showPopup() {
	const win = createPopupWindow();
	if (!win.isDestroyed() && win.webContents && !win.webContents.isLoading()) {
		positionPopupNearTray();
		win.show();
		win.focus();
	} else {
		win.once("ready-to-show", () => {
			positionPopupNearTray();
			win.show();
			win.focus();
		});
	}
}

function showLoginWindow() {
	createLoginWindow();
}

/** Called when user clicks the tray icon. */
function onTrayClick() {
	if (getJwt()) {
		if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
			popupWindow.close();
		} else {
			showPopup();
		}
	} else {
		showLoginWindow();
	}
}

function initApp() {
	tray = createTray(onTrayClick);
	updateTrayMenu();
	startScheduler();

	if (!getJwt()) {
		createLoginWindow();
	}
}

app.whenReady().then(() => {
	if (process.platform === "darwin") {
		app.dock.hide();
	}
	try {
		app.setLoginItemSettings({ openAtLogin: getOpenAtLogin() });
	} catch {}
	setupAutoUpdate();
	devLog("[main] API base:", getApiBase());
	initApp();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) initApp();
		else onTrayClick();
	});
});

app.on("window-all-closed", () => {
	// Tray app: keep running with no windows; user quits via tray menu.
});

app.on("before-quit", () => {
	app.isQuitting = true;
	destroyTray();
});

/**
 * Get the persistent session for a social media platform.
 * @param {string} platformId - e.g. "x"
 * @returns {Electron.Session}
 */
export function getSocialSession(platformId) {
	return session.fromPartition(`persist:socialfeed-${platformId}`, {
		cache: true,
	});
}

/**
 * Create a BrowserWindow that uses a platform's persistent session.
 * @param {string} platformId - e.g. "x"
 * @param {Electron.BrowserWindowConstructorOptions} options
 * @returns {BrowserWindow}
 */
export function createSocialBrowserWindow(platformId, options = {}) {
	return new BrowserWindow({
		...options,
		icon: appIconPath,
		autoHideMenuBar: true,
		webPreferences: {
			...options.webPreferences,
			session: getSocialSession(platformId),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
}

export function getLoginWindow() {
	return loginWindow;
}
export function getPopupWindow() {
	return popupWindow;
}
export function getTray() {
	return tray;
}
