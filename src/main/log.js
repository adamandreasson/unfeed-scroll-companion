/**
 * Dev-only logger. Logs are silenced in production builds.
 */
const isDev =
	process.env.NODE_ENV === "development" ||
	process.defaultApp ||
	/[\\/]electron/.test(process.execPath);

export { isDev };

/** Log to console only in development. */
export function devLog(...args) {
	if (isDev) console.log(...args);
}

/** Warn to console only in development. */
export function devWarn(...args) {
	if (isDev) console.warn(...args);
}
