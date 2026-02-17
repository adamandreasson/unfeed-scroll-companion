/**
 * Preload script: secure bridge between renderer and main.
 * CommonJS version for Electron preload.
 */
const { contextBridge, ipcRenderer } = require("electron");

let onScrollProgress = null;
ipcRenderer.on("scroll-progress", (_, data) => {
	if (typeof onScrollProgress === "function") onScrollProgress(data);
});

contextBridge.exposeInMainWorld("unfeed", {
	log: (...args) => ipcRenderer.invoke("log", ...args),
	getApiBase: () => ipcRenderer.invoke("getApiBase"),
	getJwt: () => ipcRenderer.invoke("getJwt"),
	setJwt: (token) => ipcRenderer.invoke("setJwt", token),
	getScrollIntervalHours: () => ipcRenderer.invoke("getScrollIntervalHours"),
	setScrollIntervalHours: (hours) =>
		ipcRenderer.invoke("setScrollIntervalHours", hours),
	getOpenAtLogin: () => ipcRenderer.invoke("getOpenAtLogin"),
	setOpenAtLogin: (value) => ipcRenderer.invoke("setOpenAtLogin", value),
	openSocialLogin: (platformId = "x") => ipcRenderer.invoke("openSocialLogin", platformId),
	checkSocialSession: (platformId = "x") => ipcRenderer.invoke("checkSocialSession", platformId),
	getSocialAccountInfo: (platformId = "x") => ipcRenderer.invoke("getSocialAccountInfo", platformId),
	clearSocialSession: (platformId = "x") => ipcRenderer.invoke("clearSocialSession", platformId),
	clearAllSocialSessions: () => ipcRenderer.invoke("clearAllSocialSessions"),
	getSocialFeedStatus: () => ipcRenderer.invoke("getSocialFeedStatus"),
	uploadPosts: (posts) => ipcRenderer.invoke("uploadPosts", posts),
	runScrollNow: () => ipcRenderer.invoke("runScrollNow"),
	setOnScrollProgress: (cb) => {
		onScrollProgress = typeof cb === "function" ? cb : null;
	},
	requestPin: (email) => ipcRenderer.invoke("requestPin", email),
	verifyPin: (email, pin) => ipcRenderer.invoke("verifyPin", email, pin),
	loginComplete: () => ipcRenderer.invoke("loginComplete"),
	logoutComplete: () => ipcRenderer.invoke("logoutComplete"),
	quit: () => ipcRenderer.invoke("quit"),
});
