import { spawn } from "child_process";
import path from "path";
import { app } from "electron";

/**
 * Handle Squirrel.Windows install/update/uninstall lifecycle events.
 * Returns true if a squirrel event was handled (caller should skip normal init).
 */
export function handleSquirrelEvent() {
	if (process.platform !== "win32") return false;

	const cmd = process.argv[1];
	if (!cmd?.startsWith("--squirrel-")) return false;

	const exeName = path.basename(process.execPath);
	const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe");

	switch (cmd) {
		case "--squirrel-install":
		case "--squirrel-updated":
			spawnUpdate(updateExe, ["--createShortcut", exeName]);
			return true;
		case "--squirrel-uninstall":
			spawnUpdate(updateExe, ["--removeShortcut", exeName]);
			return true;
		case "--squirrel-obsolete":
			app.quit();
			return true;
		default:
			return false;
	}
}

function spawnUpdate(updateExe, args) {
	try {
		spawn(updateExe, args, { detached: true }).on("close", () => app.quit());
	} catch {
		app.quit();
	}
}
