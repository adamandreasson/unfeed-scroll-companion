/**
 * Login window: email + PIN authentication flow.
 * After login, notifies main process to close this window.
 */
(function () {
	const emailInput = document.getElementById("email");
	const requestPinBtn = document.getElementById("requestPin");
	const emailRow = document.getElementById("emailRow");
	const pinRow = document.getElementById("pinRow");
	const pinInput = document.getElementById("pin");
	const verifyPinBtn = document.getElementById("verifyPin");
	const authError = document.getElementById("authError");
	const authSuccess = document.getElementById("authSuccess");

	function showError(msg) {
		authError.textContent = msg || "";
		authError.classList.toggle("hidden", !msg);
		authSuccess.classList.add("hidden");
	}

	function showSuccess(msg) {
		authSuccess.textContent = msg || "";
		authSuccess.classList.toggle("hidden", !msg);
		authError.classList.add("hidden");
	}

	async function checkExistingAuth() {
		if (!window.unfeed) return;
		const token = await window.unfeed.getAuthToken();
		if (token) {
			try {
				await window.unfeed.loginComplete?.();
			} catch {}
		}
	}

	async function requestPin() {
		if (requestPinBtn) {
			requestPinBtn.textContent = "Sending…";
			requestPinBtn.disabled = true;
		}

		const email = emailInput?.value?.trim();
		if (!email) {
			showError("Enter your email.");
			if (requestPinBtn) {
				requestPinBtn.textContent = "Send login code";
				requestPinBtn.disabled = false;
			}
			return;
		}

		try {
			if (!window.unfeed?.requestPin) {
				showError("App not ready. Restart the app.");
				return;
			}
			const result = await window.unfeed.requestPin(email);
			if (result?.ok) {
				showSuccess("Check your email for the code.");
				emailRow.classList.add("hidden");
				pinRow.classList.remove("hidden");
				pinInput.focus();
			} else {
				showError(result?.error || "Failed to send code.");
			}
		} catch (e) {
			showError("Error: " + (e?.message || String(e)));
		} finally {
			if (requestPinBtn) {
				requestPinBtn.textContent = "Send login code";
				requestPinBtn.disabled = false;
			}
		}
	}

	async function verifyPin() {
		const email = emailInput?.value?.trim();
		const pin = pinInput?.value?.trim();
		if (!email || !pin) {
			showError("Enter email and code.");
			return;
		}
		showError("");
		verifyPinBtn.disabled = true;
		try {
			if (!window.unfeed?.verifyPin) {
				showError("App not ready. Restart the app.");
				return;
			}
			const result = await window.unfeed.verifyPin(email, pin);
			if (result?.ok && result?.token) {
				await window.unfeed.setAuthToken(result.token);
				showSuccess("Logged in. Closing…");
				setTimeout(async () => {
					try {
						await window.unfeed.loginComplete?.();
					} catch {}
				}, 500);
			} else {
				showError(result?.error || "Invalid or expired code.");
			}
		} catch (e) {
			showError("Error: " + (e?.message || String(e)));
		} finally {
			verifyPinBtn.disabled = false;
		}
	}

	requestPinBtn?.addEventListener("click", requestPin);
	verifyPinBtn?.addEventListener("click", verifyPin);
	pinInput?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") verifyPin();
	});

	document.getElementById("quit")?.addEventListener("click", () => {
		window.unfeed?.quit?.();
	});

	checkExistingAuth();
})();
