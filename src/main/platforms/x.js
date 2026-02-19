/**
 * X (Twitter) platform implementation.
 * Handles login, session management, and feed scrolling for x.com.
 */
import { BrowserWindow } from "electron";
import { PlatformBase } from "./base.js";
import { getSocialSession } from "../index.js";
import { getCachedSocialUsername, setCachedSocialUsername } from "../store.js";
import { devLog, devWarn } from "../log.js";

const X_HOME = "https://x.com/home";
const X_LOGIN = "https://x.com/i/flow/login";

const DYNAMIC_CONTENT_DELAY_MS = 400;
const SCROLL_DISCOVERY_DELAY_MS = 300;
const POST_PROCESSING_DELAY_MS = 400;
const NAVIGATION_TIMEOUT_MS = 60_000;

/** Page diagnostic: returns DOM stats useful for debugging empty feeds. */
const PAGE_DIAGNOSTIC_SCRIPT = `
(function() {
	const main = document.querySelector("main");
	const articleCount = main ? main.querySelectorAll("article").length : 0;
	let firstArticleText = "";
	let firstArticleHasStatusLink = false;
	if (main && articleCount > 0) {
		const first = main.querySelector("article");
		if (first) {
			firstArticleText = (first.innerText || "").trim().slice(0, 200);
			firstArticleHasStatusLink = !!first.querySelector('a[href*="/status/"]');
		}
	}
	return {
		hasMain: !!main,
		articleCount,
		firstArticleTextLength: firstArticleText.length,
		firstArticleHasStatusLink,
		documentReadyState: document.readyState,
	};
})();
`;

/**
 * In-page script: finds the next unprocessed post in the visible viewport.
 * Returns the post object or null. Receives { seenIdsOnPage, dynamicContentTimeout }.
 */
const GET_NEXT_POST_SCRIPT = `
(async function(args) {
	try {
		const seen = new Set(args.seenIdsOnPage || []);
		const dynamicContentTimeout = args.dynamicContentTimeout || 400;
		const HIGHLIGHT_ATTR = "data-unfeed-highlight";

		function clearHighlight() {
			const highlighted = document.querySelectorAll("article[" + HIGHLIGHT_ATTR + "]");
			for (let i = 0; i < highlighted.length; i++) {
				const el = highlighted[i];
				el.style.outline = ""; el.style.boxShadow = ""; el.style.backgroundColor = "";
				el.removeAttribute(HIGHLIGHT_ATTR);
			}
		}

		async function expandShowMore(root) {
			if (!root) return;
			const candidates = [];
			for (const el of root.querySelectorAll("*")) {
				const text = (el.textContent || "").trim();
				if (text === "Show more" && !el.closest("a[href]")) candidates.push(el);
			}
			for (const el of candidates) {
				try { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); } catch (_) {}
			}
			if (candidates.length) await new Promise(r => setTimeout(r, dynamicContentTimeout));
		}

		function cleanText(raw) {
			if (!raw) return "";
			return raw.split("\\n")
				.map(l => l.trim())
				.filter(l => l && l !== "Show more" && l !== "Show more replies")
				.join("\\n")
				.trim();
		}

		const main = document.querySelector("main");
		if (!main) return null;
		const articles = main.querySelectorAll("article");
		if (!articles.length) return null;

		for (const article of articles) {
			const rect = article.getBoundingClientRect();
			if (rect.bottom < 0 || rect.top > window.innerHeight * 1.5) continue;

			await expandShowMore(article);
			const fullText = cleanText(article.innerText || "");
			if (!fullText) continue;

			const linkEl = article.querySelector('a[href*="/status/"]');
			const postUrl = linkEl ? linkEl.href : null;
			const id = postUrl || fullText.split("\\n").slice(0, 5).join(" ").slice(0, 200);
			if (!id || seen.has(id)) continue;

			const lines = fullText.split("\\n");
			const author = lines.length >= 2 ? (lines[0] + " " + lines[1]).trim() : (lines[0] || "Unknown");

			const mediaSel = '[data-testid="tweetPhoto"] img, [data-testid="tweetImage"] img, [data-testid="attachmentImage"] img';
			const images = [];
			for (const img of article.querySelectorAll(mediaSel)) {
				const src = img.currentSrc || img.src;
				if (!src) continue;
				const lower = src.toLowerCase();
				if (["emoji", "twemoji", "icon", "profile_images", "profile_banners"].some(k => lower.includes(k))) continue;
				if (img.getAttribute("aria-hidden") === "true") continue;
				const ir = img.getBoundingClientRect();
				const iw = parseInt(img.getAttribute("width") || "0", 10) || ir.width;
				const ih = parseInt(img.getAttribute("height") || "0", 10) || ir.height;
				if (iw > 0 && ih > 0 && (iw < 40 || ih < 40)) continue;
				if (!images.includes(src)) images.push(src);
			}

			clearHighlight();
			article.setAttribute(HIGHLIGHT_ATTR, "true");
			article.style.outline = "3px solid #ff9900";
			article.style.boxShadow = "0 0 12px rgba(255,153,0,0.8)";
			article.style.backgroundColor = "rgba(255, 255, 0, 0.06)";
			article.scrollIntoView({ behavior: "smooth", block: "center" });

			return { id, url: postUrl, author, fullText, images };
		}
		return null;
	} catch (err) {
		return { __error: String(err && err.message), __stack: String(err && err.stack || "") };
	}
})({ seenIdsOnPage: SEEN_IDS_PLACEHOLDER, dynamicContentTimeout: DYNAMIC_PLACEHOLDER })
`;

function buildGetNextPostScript(seenIds, dynamicContentTimeout) {
	return GET_NEXT_POST_SCRIPT.replace(
		"SEEN_IDS_PLACEHOLDER",
		JSON.stringify([...seenIds]),
	).replace("DYNAMIC_PLACEHOLDER", String(dynamicContentTimeout));
}

let loginWindow = null;

export class XPlatform extends PlatformBase {
	getPlatformId() {
		return "x";
	}
	getDisplayName() {
		return "X";
	}
	getHomeUrl() {
		return X_HOME;
	}
	getLoginUrl() {
		return X_LOGIN;
	}
	getSessionPartition() {
		return "persist:socialfeed-x";
	}

	parseHandle(input) {
		if (!input || typeof input !== "string") return null;
		const match = input.trim().match(/^\/?([A-Za-z0-9_]{1,15})\/?$/);
		return match ? match[1] : null;
	}

	/** Read the logged-in handle from the X home page DOM. */
	async readLoggedInHandle(win) {
		try {
			const handle = await win.webContents.executeJavaScript(
				`new Promise((resolve) => {
					let attempts = 0;
					const tick = () => {
						const profileLink =
							document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
							document.querySelector('a[aria-label*="Profile"][href]');
						const href = profileLink?.getAttribute("href") || "";
						const m = href.match(/^\\/([A-Za-z0-9_]{1,15})\\/?$/);
						if (m) return resolve(m[1]);

						const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
						const tm = ogTitle.match(/\\(@([A-Za-z0-9_]{1,15})\\)/);
						if (tm) return resolve(tm[1]);

						if (++attempts >= 20) return resolve(null);
						setTimeout(tick, 200);
					};
					tick();
				})`,
				true,
			);
			return this.parseHandle(handle);
		} catch {
			return null;
		}
	}

	async openLoginWindow() {
		return new Promise((resolve) => {
			if (loginWindow && !loginWindow.isDestroyed()) {
				loginWindow.close();
				loginWindow = null;
			}

			const sess = getSocialSession(this.getPlatformId());
			loginWindow = new BrowserWindow({
				width: 500,
				height: 700,
				show: true,
				title: `Log in to ${this.getDisplayName()}`,
				webPreferences: {
					session: sess,
					contextIsolation: true,
					nodeIntegration: false,
				},
			});
			loginWindow.setMenu(null);

			loginWindow.once("ready-to-show", () => {
				if (loginWindow && !loginWindow.isDestroyed()) {
					loginWindow.show();
					loginWindow.focus();
				}
			});

			const finish = async (success) => {
				if (loginWindow) {
					loginWindow.removeAllListeners("closed");
					if (success) {
						try {
							const username = await this.readLoggedInHandle(loginWindow);
							if (username)
								setCachedSocialUsername(this.getPlatformId(), username);
						} catch {}
					}
					loginWindow.close();
					loginWindow = null;
				}
				resolve(success);
			};

			loginWindow.on("closed", () => finish(false));
			loginWindow.webContents.on("did-navigate-in-page", (_, url) => {
				if (url?.startsWith(X_HOME)) finish(true);
			});
			loginWindow.webContents.on("did-navigate", (_, url) => {
				if (url?.startsWith(X_HOME)) finish(true);
			});

			loginWindow.loadURL(X_LOGIN).catch(() => {
				loginWindow.loadURL(X_HOME).catch(() => finish(false));
			});
		});
	}

	async getAccountInfo() {
		const cachedUsername = getCachedSocialUsername(this.getPlatformId());
		const sess = getSocialSession(this.getPlatformId());

		// Fast path: check cookies without loading a page
		try {
			const [xCookies, twitterCookies] = await Promise.all([
				sess.cookies.get({ domain: "x.com" }).catch(() => []),
				sess.cookies.get({ domain: "twitter.com" }).catch(() => []),
			]);
			const hasAuth = xCookies.length > 0 || twitterCookies.length > 0;

			if (hasAuth && cachedUsername) {
				return { connected: true, username: cachedUsername };
			}
			if (!hasAuth) {
				if (cachedUsername) setCachedSocialUsername(this.getPlatformId(), null);
				return { connected: false, username: null };
			}
		} catch {}

		// Slow path: load page to verify and read username
		return new Promise((resolve) => {
			const win = new BrowserWindow({
				show: false,
				webPreferences: {
					session: sess,
					contextIsolation: true,
					nodeIntegration: false,
				},
			});

			win.webContents.once("did-finish-load", async () => {
				const url = win.webContents.getURL();
				if (!url.startsWith(X_HOME)) {
					win.close();
					if (cachedUsername)
						setCachedSocialUsername(this.getPlatformId(), null);
					return resolve({ connected: false, username: null });
				}
				const username = await this.readLoggedInHandle(win);
				win.close();
				if (username) {
					setCachedSocialUsername(this.getPlatformId(), username);
					return resolve({ connected: true, username });
				}
				if (cachedUsername) setCachedSocialUsername(this.getPlatformId(), null);
				resolve({ connected: false, username: null });
			});

			win.loadURL(X_HOME).catch(() => {
				win.close();
				if (cachedUsername) setCachedSocialUsername(this.getPlatformId(), null);
				resolve({ connected: false, username: null });
			});
		});
	}

	async clearSession() {
		if (loginWindow && !loginWindow.isDestroyed()) {
			loginWindow.close();
			loginWindow = null;
		}
		const sess = getSocialSession(this.getPlatformId());
		await sess.clearStorageData();
		await sess.clearCache();
		setCachedSocialUsername(this.getPlatformId(), null);
	}

	async scrollFeed(options = {}) {
		const maxPosts = options.maxPosts ?? 100;
		devLog("[scroller] Starting scroll for", this.getDisplayName());

		const sess = getSocialSession(this.getPlatformId());
		const win = new BrowserWindow({
			show: false,
			width: 1280,
			height: 720,
			webPreferences: {
				session: sess,
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		try {
			await win.loadURL(X_HOME, { timeout: NAVIGATION_TIMEOUT_MS });
		} catch (err) {
			win.destroy();
			throw new Error(
				`Failed to load ${this.getDisplayName()} home: ${err?.message || "timeout"}`,
			);
		}

		// Wait for timeline to hydrate
		await new Promise((r) => setTimeout(r, 3000));
		const wc = win.webContents;

		// Run diagnostic to check feed state
		try {
			let diag = await wc.executeJavaScript(PAGE_DIAGNOSTIC_SCRIPT);
			if (diag.articleCount === 0) {
				devWarn("[scroller] Zero articles after 3s, waiting 5s more…");
				await new Promise((r) => setTimeout(r, 5000));
				diag = await wc.executeJavaScript(PAGE_DIAGNOSTIC_SCRIPT);
				if (diag.articleCount === 0) {
					devWarn(
						"[scroller] Still zero articles – feed may be empty or DOM changed.",
					);
				}
			}
		} catch {}

		const seenIds = new Set();
		const posts = [];
		let consecutiveMisses = 0;
		let iteration = 0;
		const { onProgress } = options;
		if (typeof onProgress === "function") onProgress(0, maxPosts);

		while (posts.length < maxPosts && consecutiveMisses < 10) {
			iteration++;
			let next;
			try {
				next = await wc.executeJavaScript(
					buildGetNextPostScript(seenIds, DYNAMIC_CONTENT_DELAY_MS),
				);
			} catch {
				consecutiveMisses++;
				await wc.executeJavaScript(
					"window.scrollBy(0, window.innerHeight * 0.9);",
				);
				await new Promise((r) => setTimeout(r, SCROLL_DISCOVERY_DELAY_MS));
				continue;
			}

			if (next?.__error) {
				consecutiveMisses++;
				devWarn("[scroller] Page script error:", next.__error);
				await wc.executeJavaScript(
					"window.scrollBy(0, window.innerHeight * 0.9);",
				);
				await new Promise((r) => setTimeout(r, SCROLL_DISCOVERY_DELAY_MS));
				continue;
			}

			if (!next) {
				consecutiveMisses++;
				await wc.executeJavaScript(
					"window.scrollBy(0, window.innerHeight * 0.9);",
				);
				await new Promise((r) => setTimeout(r, SCROLL_DISCOVERY_DELAY_MS));
				continue;
			}

			consecutiveMisses = 0;
			seenIds.add(next.id);
			posts.push({
				url: next.url || "",
				author: next.author || "Unknown",
				fullText: next.fullText || "",
				images: Array.isArray(next.images) ? next.images : [],
			});
			if (typeof onProgress === "function") onProgress(posts.length, maxPosts);

			await new Promise((r) => setTimeout(r, POST_PROCESSING_DELAY_MS));
			await wc.executeJavaScript(
				"window.scrollBy(0, window.innerHeight * 0.7);",
			);
			await new Promise((r) => setTimeout(r, POST_PROCESSING_DELAY_MS));
		}

		devLog(
			"[scroller] Finished:",
			posts.length,
			"posts in",
			iteration,
			"iterations",
		);
		win.destroy();
		return posts;
	}
}
