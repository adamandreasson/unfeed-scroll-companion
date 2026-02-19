/**
 * Scroll Companion – Electron main process.
 * System tray app: scrolls social media feeds and uploads them to unfeed.ai.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { app, BrowserWindow, session, ipcMain } from "electron";
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

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 250;

function createLoginWindow() {
	if (loginWindow && !loginWindow.isDestroyed()) return loginWindow;
	loginWindow = new BrowserWindow({
		width: 380,
		height: 420,
		show: false,
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

function positionPopupUnderTray() {
	const bounds = getTrayBounds();
	if (!bounds || !popupWindow || popupWindow.isDestroyed()) return;
	const x = Math.round(bounds.x + bounds.width - POPUP_WIDTH);
	const y = Math.round(bounds.y + bounds.height + 4);
	popupWindow.setPosition(x, y);
}

function showPopup() {
	const win = createPopupWindow();
	if (!win.isDestroyed() && win.webContents && !win.webContents.isLoading()) {
		positionPopupUnderTray();
		win.show();
		win.focus();
	} else {
		win.once("ready-to-show", () => {
			positionPopupUnderTray();
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
