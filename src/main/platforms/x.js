/**
 * X (Twitter) platform implementation.
 * Handles login, session management, and feed scrolling for X.com.
 */
import { BrowserWindow } from "electron";
import { PlatformBase } from "./base.js";
import { getSocialSession } from "../index.js";
import { getCachedSocialUsername, setCachedSocialUsername } from "../store.js";

const X_HOME = "https://x.com/home";
const X_LOGIN = "https://x.com/i/flow/login";
const DYNAMIC_CONTENT_DELAY_MS = 400;
const SCROLL_DISCOVERY_DELAY_MS = 300;
const TWEET_PROCESSING_DELAY_MS = 400;
const NAVIGATION_TIMEOUT_MS = 60000;

const SCROLLER_LOG_PREFIX = "[scroller]";

/** Run in page: return DOM stats to debug why no posts are found. */
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
		articleCount: articleCount,
		firstArticleTextLength: firstArticleText.length,
		firstArticleTextPreview: firstArticleText.slice(0, 100),
		firstArticleHasStatusLink: firstArticleHasStatusLink,
		documentReadyState: document.readyState,
		bodyChildCount: document.body ? document.body.children.length : 0
	};
})();
`;

/**
 * Script run in page context to get the next post. Must be a string that evaluates to an async function
 * returning the post object or null. Receives { seenIdsOnPage, dynamicContentTimeout }.
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
		async function expandInlineShowMore(root) {
			if (!root) return;
			const all = root.querySelectorAll("*");
			const candidates = [];
			for (let i = 0; i < all.length; i++) {
				const el = all[i];
				const text = el.textContent ? el.textContent.trim() : "";
				if (!text || text !== "Show more") continue;
				if (el.closest("a[href]")) continue;
				candidates.push(el);
			}
			for (let j = 0; j < candidates.length; j++) {
				try {
					candidates[j].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
				} catch (_) {}
			}
			if (candidates.length > 0) {
				await new Promise(function(r) { setTimeout(r, dynamicContentTimeout); });
			}
		}
		function cleanPostText(raw) {
			if (!raw) return "";
			var parts = raw.split("\\n");
			var out = [];
			for (let i = 0; i < parts.length; i++) {
				var l = parts[i].trim();
				if (!l || l === "Show more" || l === "Show more replies") continue;
				out.push(l);
			}
			return out.join("\\n").trim();
		}
		var main = document.querySelector("main");
		if (!main) return null;
		var articles = main.querySelectorAll("article");
		if (!articles.length) return null;
		for (let a = 0; a < articles.length; a++) {
			var article = articles[a];
			var rect = article.getBoundingClientRect();
			if (rect.bottom < 0 || rect.top > window.innerHeight * 1.5) continue;
			await expandInlineShowMore(article);
			var rawText = article.innerText || "";
			var fullText = cleanPostText(rawText.trim());
			if (!fullText) continue;
			var linkEl = article.querySelector('a[href*="/status/"]');
			var postUrl = linkEl ? linkEl.href : null;
			var id = postUrl || fullText.split("\\n").slice(0, 5).join(" ").slice(0, 200);
			if (!id || seen.has(id)) continue;
			var lineParts = fullText.split("\\n");
			var author = "Unknown";
			if (lineParts.length >= 2) author = (lineParts[0] + " " + lineParts[1]).trim();
			else if (lineParts.length === 1) author = lineParts[0];
			var mediaSel = '[data-testid="tweetPhoto"] img, [data-testid="tweetImage"] img, [data-testid="attachmentImage"] img';
			var mediaImages = article.querySelectorAll(mediaSel);
			var images = [];
			for (let m = 0; m < mediaImages.length; m++) {
				var img = mediaImages[m];
				var src = img.currentSrc || img.src;
				if (!src) continue;
				var lowerSrc = src.toLowerCase();
				if (lowerSrc.indexOf("emoji") >= 0 || lowerSrc.indexOf("twemoji") >= 0 || lowerSrc.indexOf("icon") >= 0 || lowerSrc.indexOf("profile_images") >= 0 || lowerSrc.indexOf("profile_banners") >= 0) continue;
				if (img.getAttribute("aria-hidden") === "true") continue;
				var ir = img.getBoundingClientRect();
				var iw = parseInt(img.getAttribute("width") || "0", 10) || ir.width;
				var ih = parseInt(img.getAttribute("height") || "0", 10) || ir.height;
				if (iw > 0 && ih > 0 && (iw < 40 || ih < 40)) continue;
				if (images.indexOf(src) === -1) images.push(src);
			}
			clearHighlight();
			article.setAttribute(HIGHLIGHT_ATTR, "true");
			article.style.outline = "3px solid #ff9900";
			article.style.boxShadow = "0 0 12px rgba(255,153,0,0.8)";
			article.style.backgroundColor = "rgba(255, 255, 0, 0.06)";
			article.scrollIntoView({ behavior: "smooth", block: "center" });
			return { id: id, url: postUrl, author: author, fullText: fullText, images: images };
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
		JSON.stringify(Array.from(seenIds)),
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
		const clean = input.trim();
		const match = clean.match(/^\/?([A-Za-z0-9_]{1,15})(?:\/)?$/);
		return match ? match[1] : null;
	}

	async readLoggedInHandle(win) {
		try {
			const handle = await win.webContents.executeJavaScript(
				`new Promise((resolve) => {
					let attempts = 0;
					const maxAttempts = 20;
					const tick = () => {
						const profileLink =
							document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
							document.querySelector('a[aria-label*="Profile"][href]');
						const href = profileLink?.getAttribute("href") || "";
						const direct = href.match(/^\\/([A-Za-z0-9_]{1,15})(?:\\/)?$/);
						if (direct) return resolve(direct[1]);

						const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
						const titleMatch = ogTitle.match(/\\(@([A-Za-z0-9_]{1,15})\\)/);
						if (titleMatch) return resolve(titleMatch[1]);

						attempts += 1;
						if (attempts >= maxAttempts) return resolve(null);
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
			// Close any existing login window
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
			
			// Ensure window is visible and focused
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
							if (username) {
								setCachedSocialUsername(this.getPlatformId(), username);
							}
						} catch {
							// Ignore errors when reading username
						}
					}
					loginWindow.close();
					loginWindow = null;
				}
				resolve(success);
			};

			loginWindow.on("closed", () => finish(false));

			loginWindow.webContents.on("did-navigate-in-page", (_, url) => {
				if (url && url.startsWith(X_HOME)) finish(true);
			});
			loginWindow.webContents.on("did-navigate", (_, url) => {
				if (url && url.startsWith(X_HOME)) finish(true);
			});

			loginWindow.loadURL(X_LOGIN).catch(() => {
				loginWindow.loadURL(X_HOME).catch(() => finish(false));
			});
		});
	}

	async getAccountInfo() {
		const cachedUsername = getCachedSocialUsername(this.getPlatformId());
		const sess = getSocialSession(this.getPlatformId());
		
		// Fast path: check cookies without loading page
		try {
			// Check cookies for both x.com and twitter.com (X uses both domains)
			const [xCookies, twitterCookies] = await Promise.all([
				sess.cookies.get({ domain: "x.com" }).catch(() => []),
				sess.cookies.get({ domain: "twitter.com" }).catch(() => []),
			]);
			// X.com uses various auth cookies (auth_token, ct0, twid, etc.)
			// If we have cookies for either domain, likely logged in
			const hasAuthCookies = xCookies.length > 0 || twitterCookies.length > 0;
			
			if (hasAuthCookies && cachedUsername) {
				// Fast path: have cookies and cached username - return immediately
				return { connected: true, username: cachedUsername };
			}
			
			if (!hasAuthCookies) {
				// No cookies = not logged in, clear cache
				if (cachedUsername) {
					setCachedSocialUsername(this.getPlatformId(), null);
				}
				return { connected: false, username: null };
			}
			
			// Have cookies but no cached username - need to load page to get username
		} catch (err) {
			// Cookie check failed, fall through to page load verification
		}
		
		// Slow path: load page to verify connection and get username
		return new Promise((resolve) => {
			const win = new BrowserWindow({
				show: false,
				webPreferences: { session: sess, contextIsolation: true, nodeIntegration: false },
			});
			win.webContents.once("did-finish-load", async () => {
				const url = win.webContents.getURL();
				if (!url.startsWith(X_HOME)) {
					win.close();
					// Clear cached username if we're not on home page (not logged in)
					if (cachedUsername) {
						setCachedSocialUsername(this.getPlatformId(), null);
					}
					resolve({ connected: false, username: null });
					return;
				}
				const username = await this.readLoggedInHandle(win);
				win.close();
				if (username) {
					setCachedSocialUsername(this.getPlatformId(), username);
					resolve({ connected: true, username: username });
				} else {
					// Couldn't read username - clear cache and report as not connected
					if (cachedUsername) {
						setCachedSocialUsername(this.getPlatformId(), null);
					}
					resolve({ connected: false, username: null });
				}
			});
			win.loadURL(X_HOME).catch(() => {
				win.close();
				// Clear cached username on load failure
				if (cachedUsername) {
					setCachedSocialUsername(this.getPlatformId(), null);
				}
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
		console.log(SCROLLER_LOG_PREFIX, `Starting scrollFeed for ${this.getDisplayName()}`, {
			maxPosts,
			url: X_HOME,
		});

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
			console.log(SCROLLER_LOG_PREFIX, `Loading ${this.getDisplayName()} home...`);
			await win.loadURL(X_HOME, { timeout: NAVIGATION_TIMEOUT_MS });
			console.log(SCROLLER_LOG_PREFIX, "Page loaded.");
		} catch (err) {
			win.destroy();
			console.error(SCROLLER_LOG_PREFIX, "Load failed:", err?.message);
			throw new Error(`Failed to load ${this.getDisplayName()} home: ${err.message || "timeout"}`);
		}

		console.log(SCROLLER_LOG_PREFIX, "Waiting 3s for timeline to hydrate...");
		await new Promise((r) => setTimeout(r, 3000));

		const webContents = win.webContents;

		try {
			let diag = await webContents.executeJavaScript(PAGE_DIAGNOSTIC_SCRIPT);
			console.log(
				SCROLLER_LOG_PREFIX,
				"Page diagnostic (after 3s):",
				JSON.stringify(diag, null, 2),
			);
			if (!diag.hasMain) {
				console.warn(
					SCROLLER_LOG_PREFIX,
					`No <main> found – ${this.getDisplayName()} DOM may have changed or page not fully loaded.`,
				);
			}
			if (diag.articleCount === 0) {
				console.warn(
					SCROLLER_LOG_PREFIX,
					"Zero articles in main – waiting 5s and re-checking (feed may load late)...",
				);
				await new Promise((r) => setTimeout(r, 5000));
				diag = await webContents.executeJavaScript(PAGE_DIAGNOSTIC_SCRIPT);
				console.log(
					SCROLLER_LOG_PREFIX,
					"Page diagnostic (after +5s):",
					JSON.stringify(diag, null, 2),
				);
				if (diag.articleCount === 0) {
					console.warn(
						SCROLLER_LOG_PREFIX,
						`Still zero articles – feed empty or ${this.getDisplayName()} DOM/selectors changed.`,
					);
				}
			}
		} catch (diagErr) {
			console.warn(
				SCROLLER_LOG_PREFIX,
				"Diagnostic script failed:",
				diagErr?.message,
			);
		}

		const seenIds = new Set();
		const posts = [];
		let consecutiveMisses = 0;
		let iteration = 0;
		const onProgress = options.onProgress;
		if (typeof onProgress === "function") onProgress(0, maxPosts);

		while (posts.length < maxPosts && consecutiveMisses < 10) {
			iteration++;
			const script = buildGetNextPostScript(seenIds, DYNAMIC_CONTENT_DELAY_MS);
			let next;
			try {
				next = await webContents.executeJavaScript(script);
			} catch (err) {
				consecutiveMisses++;
				console.log(
					SCROLLER_LOG_PREFIX,
					"Iteration",
					iteration,
					"executeJavaScript error:",
					err?.message,
					"| posts:",
					posts.length,
					"consecutiveMisses:",
					consecutiveMisses,
				);
				await webContents.executeJavaScript(
					"window.scrollBy(0, window.innerHeight * 0.9);",
				);
				await new Promise((r) => setTimeout(r, SCROLL_DISCOVERY_DELAY_MS));
				continue;
			}

			if (next && next.__error) {
				consecutiveMisses++;
				console.error(
					SCROLLER_LOG_PREFIX,
					"Iteration",
					iteration,
					"page script threw:",
					next.__error,
				);
				if (next.__stack)
					console.error(SCROLLER_LOG_PREFIX, "stack:", next.__stack.slice(0, 500));
				await webContents.executeJavaScript(
					"window.scrollBy(0, window.innerHeight * 0.9);",
				);
				await new Promise((r) => setTimeout(r, SCROLL_DISCOVERY_DELAY_MS));
				continue;
			}

			if (!next) {
				consecutiveMisses++;
				if (iteration <= 3 || consecutiveMisses <= 2 || iteration % 5 === 0) {
					console.log(
						SCROLLER_LOG_PREFIX,
						"Iteration",
						iteration,
						"no post returned (scroll to discover) | posts:",
						posts.length,
						"consecutiveMisses:",
						consecutiveMisses,
					);
				}
				await webContents.executeJavaScript(
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
			if (posts.length <= 3 || posts.length % 10 === 0) {
				console.log(
					SCROLLER_LOG_PREFIX,
					"Iteration",
					iteration,
					"collected post",
					posts.length,
					"| url:",
					(next.url || "").slice(0, 60) +
						(next.url && next.url.length > 60 ? "..." : ""),
				);
			}

			await new Promise((r) => setTimeout(r, TWEET_PROCESSING_DELAY_MS));
			await webContents.executeJavaScript(
				"window.scrollBy(0, window.innerHeight * 0.7);",
			);
			await new Promise((r) => setTimeout(r, TWEET_PROCESSING_DELAY_MS));
		}

		const exitReason =
			posts.length >= maxPosts ? "maxPosts" : "10 consecutive misses";
		console.log(SCROLLER_LOG_PREFIX, "Scroll finished:", {
			postsCount: posts.length,
			exitReason,
			iterations: iteration,
		});

		win.destroy();
		return posts;
	}
}
