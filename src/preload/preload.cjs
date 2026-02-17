/**
 * Preload script: secure bridge between renderer and main process.
 * Exposes the `window.unfeed` API via contextBridge.
 */
const { contextBridge, ipcRenderer } = require("electron");

let onScrollProgress = null;
ipcRenderer.on("scroll-progress", (_, data) => {
	if (typeof onScrollProgress === "function") onScrollProgress(data);
});

contextBridge.exposeInMainWorld("unfeed", {
	// Logging
	log: (...args) => ipcRenderer.invoke("log", ...args),

	// Auth
	getApiBase: () => ipcRenderer.invoke("getApiBase"),
	getJwt: () => ipcRenderer.invoke("getJwt"),
	setJwt: (token) => ipcRenderer.invoke("setJwt", token),
	requestPin: (email) => ipcRenderer.invoke("requestPin", email),
	verifyPin: (email, pin) => ipcRenderer.invoke("verifyPin", email, pin),

	// Settings
	getScrollIntervalHours: () => ipcRenderer.invoke("getScrollIntervalHours"),
	setScrollIntervalHours: (hours) => ipcRenderer.invoke("setScrollIntervalHours", hours),
	getOpenAtLogin: () => ipcRenderer.invoke("getOpenAtLogin"),
	setOpenAtLogin: (value) => ipcRenderer.invoke("setOpenAtLogin", value),

	// Social accounts
	openSocialLogin: (platformId = "x") => ipcRenderer.invoke("openSocialLogin", platformId),
	checkSocialSession: (platformId = "x") => ipcRenderer.invoke("checkSocialSession", platformId),
	getSocialAccountInfo: (platformId = "x") => ipcRenderer.invoke("getSocialAccountInfo", platformId),
	clearSocialSession: (platformId = "x") => ipcRenderer.invoke("clearSocialSession", platformId),
	clearAllSocialSessions: () => ipcRenderer.invoke("clearAllSocialSessions"),

	// Feed
	getSocialFeedStatus: () => ipcRenderer.invoke("getSocialFeedStatus"),
	uploadPosts: (posts) => ipcRenderer.invoke("uploadPosts", posts),
	runScrollNow: () => ipcRenderer.invoke("runScrollNow"),
	setOnScrollProgress: (cb) => {
		onScrollProgress = typeof cb === "function" ? cb : null;
	},

	// Window lifecycle
	loginComplete: () => ipcRenderer.invoke("loginComplete"),
	logoutComplete: () => ipcRenderer.invoke("logoutComplete"),
	quit: () => ipcRenderer.invoke("quit"),
});
