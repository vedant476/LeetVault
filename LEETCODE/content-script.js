// ======================================================
// content-script.js
// ------------------------------------------------------
// Single job: LeetCode submit button/keyboard shortcut
// detect karo, submission ID milne ka wait karo, background
// ko batao ki naya submission aaya hai.
// ======================================================

function wasSubmittedByKeyboard(event) {

    return (

        event.type === "keydown" &&

        (event.metaKey || event.ctrlKey) &&

        event.key === "Enter"

    );

}



async function handleSubmissionEvent(event) {

    if (event.type !== "click" && !wasSubmittedByKeyboard(event)) {

        return;

    }

    const storage = await chrome.storage.local.get("syncState");
    const liveSyncEnabled = storage.syncState?.liveSyncEnabled ?? true;
    if (!liveSyncEnabled) {
        return;
    }

    // Get the problem slug from URL
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    const problemSlug = match ? match[1] : null;
    if (!problemSlug) {
        console.warn("LeetVault: Could not extract problem slug.");
        return;
    }

    // Capture submit timestamp
    const submitTime = Math.floor(Date.now() / 1000) - 5; // 5s safety window

    // Show detecting prompt instantly!
    showDetectingPrompt();

    // Background ko batao ki submission detect ho chuki hai
    chrome.runtime.sendMessage({
        type: "LEETCODE_SUBMISSION_DETECTED",
        problemSlug,
        submitTime
    });

}

// ==================================
// WAIT FOR SUBMIT BUTTON TO EXIST
// ==================================

function findSubmitButton() {
    // 1. Try standard Cypress locator
    let btn = document.querySelector("[data-cy='submit-code-btn']");
    if (btn) return btn;

    // 2. Try e2e locator
    btn = document.querySelector("[data-e2e-locator='console-submit-button']");
    if (btn) return btn;

    // 3. Fallback: Search all buttons for text content "Submit"
    const buttons = document.querySelectorAll("button");
    for (const b of buttons) {
        if (b.textContent && b.textContent.trim() === "Submit") {
            return b;
        }
    }
    return null;
}

let liveSyncEnabledCache = true;

const buttonObserver = new MutationObserver(() => {

    const submitButton = findSubmitButton();

    if (submitButton && !submitButton.dataset.leetvaultBound) {

        submitButton.dataset.leetvaultBound = "true";

        submitButton.addEventListener("click", handleSubmissionEvent);

    }

    const editor = document.querySelector("textarea, .monaco-editor");

    if (editor && !editor.dataset?.leetvaultBound) {

        if (editor.dataset) editor.dataset.leetvaultBound = "true";

        document.addEventListener("keydown", handleSubmissionEvent);

    }

    const spacer = document.querySelector("div.h-8.w-full.min-w-0.flex-1");
    if (spacer && !document.getElementById("leetvault-status-indicator")) {
        updateStatusWidget(liveSyncEnabledCache);
    }

});

buttonObserver.observe(document.body, {

    childList: true,

    subtree: true

});

// ==================================
// CONFIRMATION TOAST POPUP
// ==================================

function injectStyles() {
    if (document.getElementById("leetvault-toast-styles")) return;
    const style = document.createElement("style");
    style.id = "leetvault-toast-styles";
    style.textContent = `
        #leetvault-toast-container {
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 10000000;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            width: 350px;
            background: rgba(30, 30, 35, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
            padding: 16px;
            color: #ffffff;
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        #leetvault-toast-container.visible {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        .leetvault-toast-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        .leetvault-toast-brand {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 700;
            font-size: 14px;
            color: #a855f7;
        }
        .leetvault-toast-brand svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
        .leetvault-toast-close {
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.4);
            cursor: pointer;
            font-size: 16px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
        }
        .leetvault-toast-close:hover {
            color: #ffffff;
        }
        .leetvault-toast-body {
            font-size: 13px;
            line-height: 1.5;
            color: rgba(255, 255, 255, 0.95);
            margin-bottom: 14px;
        }
        .leetvault-toast-body strong {
            color: #ffffff;
            font-weight: 600;
        }
        .leetvault-toast-progress-bg {
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 16px;
        }
        .leetvault-toast-progress-bar {
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg, #6366f1, #a855f7);
            transition: width 0.1s linear;
        }
        .leetvault-toast-footer {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        .leetvault-toast-btn {
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            outline: none;
        }
        .leetvault-toast-btn-skip {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: rgba(255, 255, 255, 0.8);
        }
        .leetvault-toast-btn-skip:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.05);
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.4);
        }
        .leetvault-toast-btn-sync {
            background: linear-gradient(135deg, #6366f1, #a855f7);
            border: none;
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25);
        }
        .leetvault-toast-btn-sync:hover:not(:disabled) {
            filter: brightness(1.15);
            transform: translateY(-1px);
        }
        .leetvault-toast-btn-sync:active:not(:disabled) {
            transform: translateY(0);
        }
        .leetvault-toast-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .leetvault-toast-status-msg {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .leetvault-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: leetvault-spin 0.8s linear infinite;
        }
        @keyframes leetvault-spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

let currentToast = null;
let toastTimer = null;

function showDetectingPrompt() {
    injectStyles();

    // Remove existing toast if any
    if (currentToast) {
        clearTimeout(toastTimer);
        currentToast.remove();
    }

    const container = document.createElement("div");
    container.id = "leetvault-toast-container";
    container.innerHTML = `
        <div class="leetvault-toast-header">
            <div class="leetvault-toast-brand">
                <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                <span>LeetVault</span>
            </div>
            <button class="leetvault-toast-close" id="leetvault-close-btn" disabled>&times;</button>
        </div>
        <div class="leetvault-toast-body" id="leetvault-toast-body">
            New submission detected! Waiting for evaluation...
        </div>
        <div class="leetvault-toast-progress-bg" style="display: none;">
            <div class="leetvault-toast-progress-bar" id="leetvault-progress-bar"></div>
        </div>
        <div class="leetvault-toast-footer" style="justify-content: flex-start;">
            <div id="leetvault-status-area" style="display: flex; align-items: center;">
                <div class="leetvault-spinner"></div>
                <span class="leetvault-toast-status-msg" style="margin-left: 6px;">Evaluating...</span>
            </div>
        </div>
    `;

    document.body.appendChild(container);
    currentToast = container;

    const closeBtn = container.querySelector("#leetvault-close-btn");
    if (closeBtn) {
        closeBtn.onclick = () => {
            if (currentToast) {
                clearTimeout(toastTimer);
                currentToast.classList.remove("visible");
                setTimeout(() => {
                    if (currentToast) {
                        currentToast.remove();
                        currentToast = null;
                    }
                }, 400);
            }
        };
    }

    requestAnimationFrame(() => {
        container.classList.add("visible");
    });
}

function showLiveSyncSkipped(status) {
    if (!currentToast) return;
    
    const body = currentToast.querySelector(".leetvault-toast-body");
    const progressBg = currentToast.querySelector(".leetvault-toast-progress-bg");
    const footer = currentToast.querySelector(".leetvault-toast-footer");
    const closeBtn = currentToast.querySelector("#leetvault-close-btn");
    
    if (body) {
        body.innerHTML = `Live sync skipped: status is <strong>${status}</strong>.`;
    }
    if (progressBg) {
        progressBg.style.display = "none";
    }
    if (footer) {
        footer.style.justifyContent = "flex-start";
        footer.innerHTML = `
            <div style="margin-right: auto; display: flex; align-items: center;">
                <span class="leetvault-toast-status-msg" style="color: #f87171; font-weight: 700;">✖ Skipped</span>
            </div>
        `;
    }
    if (closeBtn) {
        closeBtn.disabled = false;
        closeBtn.onclick = () => {
            if (currentToast) {
                clearTimeout(toastTimer);
                currentToast.classList.remove("visible");
                setTimeout(() => {
                    if (currentToast) {
                        currentToast.remove();
                        currentToast = null;
                    }
                }, 400);
            }
        };
    }

    setTimeout(() => {
        if (currentToast) {
            currentToast.classList.remove("visible");
            toastTimer = setTimeout(() => {
                if (currentToast) {
                    currentToast.remove();
                    currentToast = null;
                }
            }, 400);
        }
    }, 2500);
}

function showLiveSyncFailed(errorMsg) {
    if (!currentToast) return;
    
    const body = currentToast.querySelector(".leetvault-toast-body");
    const progressBg = currentToast.querySelector(".leetvault-toast-progress-bg");
    const footer = currentToast.querySelector(".leetvault-toast-footer");
    const closeBtn = currentToast.querySelector("#leetvault-close-btn");
    
    if (body) {
        body.innerHTML = `Live sync failed: <strong>${errorMsg}</strong>.`;
    }
    if (progressBg) {
        progressBg.style.display = "none";
    }
    if (footer) {
        footer.style.justifyContent = "flex-start";
        footer.innerHTML = `
            <div style="margin-right: auto; display: flex; align-items: center;">
                <span class="leetvault-toast-status-msg" style="color: #f87171; font-weight: 700;">✖ Failed</span>
            </div>
        `;
    }
    if (closeBtn) {
        closeBtn.disabled = false;
        closeBtn.onclick = () => {
            if (currentToast) {
                clearTimeout(toastTimer);
                currentToast.classList.remove("visible");
                setTimeout(() => {
                    if (currentToast) {
                        currentToast.remove();
                        currentToast = null;
                    }
                }, 400);
            }
        };
    }

    setTimeout(() => {
        if (currentToast) {
            currentToast.classList.remove("visible");
            toastTimer = setTimeout(() => {
                if (currentToast) {
                    currentToast.remove();
                    currentToast = null;
                }
            }, 400);
        }
    }, 2500);
}

function showSyncPrompt(problemTitle, language) {
    injectStyles();

    let container = currentToast;
    
    if (!container || container.id !== "leetvault-toast-container") {
        container = document.createElement("div");
        container.id = "leetvault-toast-container";
        document.body.appendChild(container);
        currentToast = container;
        
        requestAnimationFrame(() => {
            container.classList.add("visible");
        });
    }

    // Now set HTML for the countdown sync options
    container.innerHTML = `
        <div class="leetvault-toast-header">
            <div class="leetvault-toast-brand">
                <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                <span>LeetVault</span>
            </div>
            <button class="leetvault-toast-close" id="leetvault-close-btn">&times;</button>
        </div>
        <div class="leetvault-toast-body">
            New submission detected! Sync <strong>${problemTitle}</strong> (${language}) to GitHub?
        </div>
        <div class="leetvault-toast-progress-bg">
            <div class="leetvault-toast-progress-bar" id="leetvault-progress-bar"></div>
        </div>
        <div class="leetvault-toast-footer">
            <div id="leetvault-status-area" style="margin-right: auto; display: flex; align-items: center;"></div>
            <button class="leetvault-toast-btn leetvault-toast-btn-skip" id="leetvault-skip-btn">Skip</button>
            <button class="leetvault-toast-btn leetvault-toast-btn-sync" id="leetvault-sync-btn">Sync Now (5s)</button>
        </div>
    `;

    const progressBar = container.querySelector("#leetvault-progress-bar");
    const skipBtn = container.querySelector("#leetvault-skip-btn");
    const syncBtn = container.querySelector("#leetvault-sync-btn");
    const closeBtn = container.querySelector("#leetvault-close-btn");
    const statusArea = container.querySelector("#leetvault-status-area");

    let secondsLeft = 5;
    const intervalTime = 100; // Update every 100ms for smooth progress bar
    const totalDuration = 5000;
    let timeElapsed = 0;

    const dismissToast = (delay = 0) => {
        clearInterval(countdownInterval);
        container.classList.remove("visible");
        toastTimer = setTimeout(() => {
            container.remove();
            if (currentToast === container) currentToast = null;
        }, delay + 400); // Wait for transition
    };

    const triggerUpload = () => {
        clearInterval(countdownInterval);
        syncBtn.disabled = true;
        skipBtn.disabled = true;
        closeBtn.disabled = true;
        progressBar.parentElement.style.display = "none";
        statusArea.innerHTML = `<div class="leetvault-spinner"></div><span class="leetvault-toast-status-msg">Syncing to GitHub...</span>`;
        syncBtn.textContent = "Syncing...";

        chrome.runtime.sendMessage({ type: "CONFIRM_LIVE_SYNC" }, (response) => {
            if (response && response.success) {
                closeBtn.onclick = () => dismissToast(0);
                closeBtn.disabled = false;
                statusArea.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                        <span class="leetvault-toast-status-msg" style="color: #4ade80; font-weight: 600;">✔ Synced successfully!</span>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; width: 280px;">
                            <span style="font-size: 11px; color: rgba(255,255,255,0.6);">Support LeetVault:</span>
                            <a href="https://paypal.me/vedantcodes" target="_blank" class="leetvault-toast-btn leetvault-toast-btn-sync" style="text-decoration: none; padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; background: linear-gradient(135deg, #0070ba, #003087); box-shadow: none;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                Donate
                            </a>
                        </div>
                    </div>
                `;
                syncBtn.style.display = "none";
                skipBtn.style.display = "none";
                dismissToast(8000);
            } else {
                const errMsg = response?.error || "Unknown error";
                statusArea.innerHTML = `<span class="leetvault-toast-status-msg" style="color: #f87171;">✖ Failed: ${errMsg}</span>`;
                closeBtn.disabled = false;
                syncBtn.style.display = "none";
                skipBtn.style.display = "none";
            }
        });
    };

    const triggerSkip = () => {
        clearInterval(countdownInterval);
        chrome.runtime.sendMessage({ type: "CANCEL_LIVE_SYNC" });
        dismissToast(0);
    };

    const countdownInterval = setInterval(() => {
        timeElapsed += intervalTime;
        const progress = Math.max(0, 100 - (timeElapsed / totalDuration) * 100);
        progressBar.style.width = `${progress}%`;

        const displaySecs = Math.max(0, Math.ceil((totalDuration - timeElapsed) / 1000));
        syncBtn.textContent = `Sync Now (${displaySecs}s)`;

        if (timeElapsed >= totalDuration) {
            clearInterval(countdownInterval);
            triggerUpload();
        }
    }, intervalTime);

    syncBtn.addEventListener("click", triggerUpload);
    skipBtn.addEventListener("click", triggerSkip);
    closeBtn.addEventListener("click", triggerSkip);
}

// ==================================
// MESSAGE LISTENER
// ==================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SHOW_SYNC_PROMPT") {
        showSyncPrompt(request.problemTitle, request.language);
    } else if (request.type === "LIVE_SYNC_SKIPPED") {
        showLiveSyncSkipped(request.status);
    } else if (request.type === "LIVE_SYNC_FAILED") {
        showLiveSyncFailed(request.error);
    }
});

// ==================================
// LIVE SYNC STATUS INDICATOR WIDGET
// ==================================

let leetvaultModalOverlay = null;
let leetvaultSetupModal = null;

function showLeetCodeSetupModal(repos, token) {
    if (!token) {
        alert("Please connect GitHub first via the LeetVault extension popup.");
        return;
    }

    if (!leetvaultModalOverlay) {
        leetvaultModalOverlay = document.createElement("div");
        leetvaultModalOverlay.className = "leetvault-modal-overlay";
        document.body.appendChild(leetvaultModalOverlay);
    }
    
    if (!leetvaultSetupModal) {
        leetvaultSetupModal = document.createElement("div");
        leetvaultSetupModal.id = "leetvault-setup-modal";
        document.body.appendChild(leetvaultSetupModal);
    }

    let repoOptionsHTML = `<option value="__new__">+ Create new repository</option>`;
    if (repos && repos.length > 0) {
        repos.forEach(repo => {
            repoOptionsHTML += `<option value="${repo.name}">${repo.name} ${repo.private ? '(private)' : '(public)'}</option>`;
        });
    }

    leetvaultSetupModal.innerHTML = `
        <div class="leetvault-modal-title">Configure Live Sync</div>
        <div class="leetvault-modal-hint">Select the GitHub repository where your accepted submissions will be synced automatically.</div>
        
        <div class="leetvault-modal-field">
            <label>Repository</label>
            <select id="leetvault-modal-repo-select">
                ${repoOptionsHTML}
            </select>
        </div>

        <div class="leetvault-modal-field" id="leetvault-modal-repo-name-group">
            <label>New Repository Name</label>
            <input id="leetvault-modal-repo-name" type="text" value="LeetVault">
        </div>

        <div class="leetvault-modal-field" id="leetvault-modal-repo-visibility-group">
            <label>Visibility</label>
            <select id="leetvault-modal-repo-visibility">
                <option value="public">Public</option>
                <option value="private" selected>Private</option>
            </select>
        </div>

        <label class="leetvault-modal-checkbox">
            <input type="checkbox" id="leetvault-modal-lock-check" checked>
            <span>Lock repository settings</span>
        </label>

        <div class="leetvault-modal-buttons">
            <button class="leetvault-modal-btn leetvault-modal-btn-cancel" id="leetvault-modal-btn-cancel">Cancel</button>
            <button class="leetvault-modal-btn leetvault-modal-btn-confirm" id="leetvault-modal-btn-confirm">Confirm & Enable</button>
        </div>
    `;

    leetvaultModalOverlay.classList.add("visible");
    leetvaultSetupModal.classList.add("visible");

    const repoSelect = leetvaultSetupModal.querySelector("#leetvault-modal-repo-select");
    const repoNameGroup = leetvaultSetupModal.querySelector("#leetvault-modal-repo-name-group");
    const repoNameInput = leetvaultSetupModal.querySelector("#leetvault-modal-repo-name");
    const visibilityGroup = leetvaultSetupModal.querySelector("#leetvault-modal-repo-visibility-group");
    const visibilitySelect = leetvaultSetupModal.querySelector("#leetvault-modal-repo-visibility");
    const lockCheck = leetvaultSetupModal.querySelector("#leetvault-modal-lock-check");
    const btnCancel = leetvaultSetupModal.querySelector("#leetvault-modal-btn-cancel");
    const btnConfirm = leetvaultSetupModal.querySelector("#leetvault-modal-btn-confirm");

    const updateVisibility = () => {
        if (repoSelect.value === "__new__") {
            repoNameGroup.style.display = "flex";
            visibilityGroup.style.display = "flex";
        } else {
            repoNameGroup.style.display = "none";
            visibilityGroup.style.display = "none";
        }
    };

    repoSelect.addEventListener("change", updateVisibility);
    updateVisibility();

    const closeModal = () => {
        leetvaultModalOverlay.classList.remove("visible");
        leetvaultSetupModal.classList.remove("visible");
    };

    btnCancel.addEventListener("click", closeModal);

    btnConfirm.addEventListener("click", () => {
        const selectedRepo = repoSelect.value;
        const chosenRepoName = selectedRepo === "__new__" ? repoNameInput.value.trim() : selectedRepo;
        const isPrivate = visibilitySelect.value === "private";
        const lock = lockCheck.checked;

        if (!chosenRepoName) {
            alert("Please enter a valid repository name.");
            return;
        }

        btnConfirm.disabled = true;
        btnCancel.disabled = true;
        btnConfirm.textContent = "Setting up...";

        chrome.runtime.sendMessage({
            type: "SETUP_LIVE_SYNC_REPO",
            repoName: chosenRepoName,
            isPrivate,
            lock
        }, (response) => {
            btnConfirm.disabled = false;
            btnCancel.disabled = false;
            btnConfirm.textContent = "Confirm & Enable";
            
            if (response && response.success) {
                closeModal();
            } else {
                alert("Failed to configure repository: " + (response?.error || "Unknown error"));
            }
        });
    });
}

function createStatusWidget() {
    const spacer = document.querySelector("div.h-8.w-full.min-w-0.flex-1");
    if (!spacer) return;

    if (document.getElementById("leetvault-status-indicator")) return;

    const style = document.getElementById("leetvault-indicator-styles") || document.createElement("style");
    if (!style.parentNode) {
        style.id = "leetvault-indicator-styles";
        style.textContent = `
            #leetvault-status-indicator {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                height: 28px;
                padding: 0 10px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: currentColor;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
                margin-left: auto;
            }
            .dark #leetvault-status-indicator {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.1);
                color: #e4e4e7;
            }
            #leetvault-status-indicator:hover {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.2);
            }
            .leetvault-ind-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                flex-shrink: 0;
            }
            .leetvault-ind-dot.active {
                background: #22c55e;
                box-shadow: 0 0 8px #22c55e;
            }
            .leetvault-ind-dot.inactive {
                background: #ef4444;
                box-shadow: 0 0 6px #ef4444;
            }
            .leetvault-ind-text {
                white-space: nowrap;
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    const widget = document.createElement("div");
    widget.id = "leetvault-status-indicator";
    widget.title = "Click to toggle Live Sync";
    widget.innerHTML = `
        <div class="leetvault-ind-dot" id="leetvault-ind-dot"></div>
        <span class="leetvault-ind-text" id="leetvault-ind-text">Live Sync: Loading...</span>
    `;
    
    widget.addEventListener("click", async () => {
        const storage = await chrome.storage.local.get(["syncState", "githubState", "repoLocked"]);
        const currentState = storage.syncState?.liveSyncEnabled ?? true;
        
        if (currentState) {
            // Turning it OFF is direct
            await chrome.storage.local.set({
                syncState: {
                    liveSyncEnabled: false
                }
            });
        } else {
            // Turning it ON
            const hasRepo = !!storage.githubState?.repository;
            const isLocked = !!storage.repoLocked;
            
            if (hasRepo && isLocked) {
                // Settings are locked and repository exists. Enable directly!
                await chrome.storage.local.set({
                    syncState: {
                        liveSyncEnabled: true
                    }
                });
            } else {
                // If unlocked or no repo, show setup modal on LeetCode DOM
                chrome.runtime.sendMessage({ type: "GET_GITHUB_REPOS" }, (response) => {
                    if (response && response.success) {
                        showLeetCodeSetupModal(response.repos, storage.githubState?.token);
                    } else {
                        const token = storage.githubState?.token;
                        if (!token) {
                            alert("Please connect GitHub first via the LeetVault extension popup.");
                        } else {
                            alert("Failed to fetch repository list: " + (response?.error || "Unknown error"));
                        }
                    }
                });
            }
        }
    });

    // Make spacer act as flex container to align items to the right
    spacer.style.display = "flex";
    spacer.style.justifyContent = "flex-end";
    spacer.style.alignItems = "center";

    spacer.appendChild(widget);
}

function updateStatusWidget(isEnabled) {
    createStatusWidget();
    
    const dot = document.getElementById("leetvault-ind-dot");
    const text = document.getElementById("leetvault-ind-text");
    
    if (dot && text) {
        if (isEnabled) {
            dot.className = "leetvault-ind-dot active";
            text.textContent = "Live Sync: ON";
        } else {
            dot.className = "leetvault-ind-dot inactive";
            text.textContent = "Live Sync: OFF";
        }
    }
}

// Load status widget initial state
chrome.storage.local.get("syncState").then((data) => {
    liveSyncEnabledCache = data.syncState?.liveSyncEnabled ?? true;
    updateStatusWidget(liveSyncEnabledCache);
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.syncState) {
        liveSyncEnabledCache = changes.syncState.newValue?.liveSyncEnabled ?? true;
        updateStatusWidget(liveSyncEnabledCache);
    }
});