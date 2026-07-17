// ======================================================
// LeetVault Popup
// Part 1
// DOM + State + Logger + Progress + Stats + Utilities
// ======================================================

// Apply theme synchronously to avoid flash
const initialTheme = localStorage.getItem("uiTheme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.body.setAttribute("data-theme", initialTheme);

// ======================================================
// DOM
// ======================================================

// ---------- LeetCode ----------

const leetcodeStatus =
    document.getElementById("leetcode-status");

const leetcodeInfo =
    document.getElementById("leetcode-info");

// ---------- GitHub ----------

const githubStatus =
    document.getElementById("github-status");

const btnLogin =
    document.getElementById("btn-login");

// ---------- Repository ----------

const repoName =
    document.getElementById("repo-name");

const repoVisibility =
    document.getElementById("repo-visibility");

const repoSelect =
    document.getElementById("repo-select");

const repoNameGroup =
    document.getElementById("repo-name-group");

// ---------- Sync ----------

const btnSync =
    document.getElementById("btn-sync");

// ---------- Progress ----------

const progressPanel =
    document.getElementById("progress-panel");

const progressPercent =
    document.getElementById("progress-percent");

// ---------- Logs ----------

const logs =
    document.getElementById("logs");

// ---------- Stats ----------

const statProblems =
    document.getElementById("stat-problems");

const statSolutions =
    document.getElementById("stat-solutions");

const statReadmes =
    document.getElementById("stat-readmes");

const statFiles =
    document.getElementById("stat-files");

// ---------- Buttons ----------

const btnExport =
    document.getElementById("btn-export");

const btnOpenRepo =
    document.getElementById("btn-open-repo");

const btnPause =
    document.getElementById("btn-pause");

const btnStop =
    document.getElementById("btn-stop");


// ---------- Sync Destination ----------

function getSyncDestination() {

    const selected = document.querySelector(

        "input[name='sync-destination']:checked"

    );

    return selected ? selected.value : "github";

}

// ---------- Live Sync ----------

const liveSyncToggle =
    document.getElementById("live-sync-toggle");

const btnLockRepo =
    document.getElementById("btn-lock-repo");


// ---------- Wizard Step Navigation ----------
let wasSyncing = false;

function showStep(stepId) {
    const steps = ["step-auth", "step-repo", "step-sync", "step-progress", "step-success"];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === stepId) {
                el.classList.remove("hidden");
            } else {
                el.classList.add("hidden");
            }
        }
    });
    if (stepId === "step-auth") {
        checkAuthStatus();
    }
}

async function determineActiveStep() {
    const leetCodeConnected = await checkLeetCodeSession();
    const gitHubConnected = Github.isAuthenticated();

    if (!leetCodeConnected || !gitHubConnected) {
        showStep("step-auth");
        return;
    }

    if (!Github.repository) {
        showStep("step-repo");
        return;
    }

    showStep("step-sync");
    const btnSyncEl = document.getElementById("btn-sync");
    if (btnSyncEl) {
        btnSyncEl.disabled = !leetCodeConnected;
    }
}

async function checkAuthStatus() {
    const leetCodeConnected = await checkLeetCodeSession();
    const gitHubConnected = Github.isAuthenticated();
    const btnStep1Next = document.getElementById("btn-step1-next");
    if (btnStep1Next) {
        btnStep1Next.disabled = !(leetCodeConnected && gitHubConnected);
    }
}


// ======================================================
// GLOBAL STATE
// ======================================================

const State = {

    session: "",

    csrfToken: "",

    github: null,

    repository: [],

    files: [],

    syncing: false

};


const SyncConfig = {

    PAGE_SIZE: 100,

    RETRY_DELAY: 5000,

    COOLDOWN_DELAY: 5000,

    COOLDOWN_AFTER: 300,

    MAX_RETRIES: 5,

    REQUESTS_PER_COOLDOWN: 5
};


// ======================================================
// LOGGER
// ======================================================

function clearLogs() {

    if (!logs)
        return;

    logs.innerHTML = "";

}

function log(message, type = "info") {

    if (!logs)
        return;

    const div =
        document.createElement("div");

    div.className =
        `log-item ${type}`;

    div.textContent = message;

    logs.appendChild(div);

    logs.scrollTop =
        logs.scrollHeight;

    if (readoutText) {

        if (readoutLinePrev && lastReadoutLine) {

            readoutLinePrev.textContent = lastReadoutLine;

        }

        readoutText.textContent = message;
        lastReadoutLine = message;

    }

}

function success(message) {

    log(message, "success");

}

function warning(message) {

    log(message, "warning");

}

function error(message) {

    log(message, "error");

}


// ======================================================
// PROGRESS
// ======================================================

function showProgress() {
    wasSyncing = true;
    showStep("step-progress");
    if (progressPanel) {
        progressPanel.classList.remove("hidden");
        progressPanel.classList.add("is-running");
    }
}

function hideProgress() {
    if (progressPanel) {
        progressPanel.classList.add("hidden");
        progressPanel.classList.remove("is-running");
    }
    if (wasSyncing) {
        wasSyncing = false;
        chrome.runtime.sendMessage({ type: "GET_SYNC_PROGRESS" }, (state) => {
            if (state && state.percent >= 100) {
                showStep("step-success");
                updateStats();
            } else {
                determineActiveStep();
            }
        });
    }
}

function resetProgress() {

    setProgress(

        0,

        "Waiting..."

    );

}

const ringProgress = document.getElementById("ring-progress");
const terminalProgressFill = document.getElementById("terminal-progress-fill");
const readoutPercent = document.getElementById("readout-percent");
const readoutText = document.getElementById("readout-text");
const readoutLinePrev = document.getElementById("readout-line-prev");

const RING_CIRCUMFERENCE = 326.7;

let lastReadoutLine = "";

function setProgress(percent, text = "") {

    if (progressPercent) {

        progressPercent.textContent = percent.toFixed(2) + "%";
        progressPercent.className = "badge " + (percent >= 100 ? "connected" : "checking");

    }

    if (readoutPercent) {

        readoutPercent.textContent = percent.toFixed(2) + "%";

    }

    if (ringProgress) {

        const offset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * percent) / 100;
        ringProgress.style.strokeDashoffset = offset;

    }

    if (terminalProgressFill) {

        terminalProgressFill.style.width = percent.toFixed(1) + "%";

    }

    if (text) {

        if (readoutLinePrev && lastReadoutLine) {

            readoutLinePrev.textContent = lastReadoutLine;

        }

        if (readoutText) {

            readoutText.textContent = text;

        }

        lastReadoutLine = text;

    }

}


// ======================================================
// STATISTICS
// ======================================================

function resetStats() {

    if (statProblems)
        statProblems.textContent = "0";

    if (statSolutions)
        statSolutions.textContent = "0";

    if (statReadmes)
        statReadmes.textContent = "0";

    if (statFiles)
        statFiles.textContent = "0";

}



async function loadRepositoryList() {

    if (!Github.isAuthenticated()) return;

    repoSelect.innerHTML = `<option value="__new__">+ Create new repository</option>`;

    try {

        const repos = await Github.listRepositories();

        for (const repo of repos) {

            const option = document.createElement("option");

            option.value = repo.name;

            option.textContent = repo.private
                ? `${repo.name} (private)`
                : repo.name;

            repoSelect.appendChild(option);

        }

    } catch (err) {

        error("Could not load repository list.");

    }

    if (Github.repository) {
        repoSelect.value = Github.repository;
    }

    updateRepoNameVisibility();

}

function updateRepoNameVisibility() {

    if (repoSelect.value === "__new__") {
        repoNameGroup.classList.remove("hidden");
    } else {
        repoNameGroup.classList.add("hidden");
    }

}

if (repoSelect) {
    repoSelect.onchange = updateRepoNameVisibility;
}

function updateStats() {

    if (!State.files)
        return;

    const stats =
        Exporter.stats();

    const repository =
        Core.getRepository();

    if (statProblems)
        statProblems.textContent =
            repository.length;

    if (statSolutions)
        statSolutions.textContent =
            stats.solutions;

    if (statReadmes)
        statReadmes.textContent =
            stats.readmes;

    if (statFiles)
        statFiles.textContent =
            stats.totalFiles;

}


// ======================================================
// BUTTONS
// ======================================================

function disableUI() {

    State.syncing = true;

    if (btnSync)
        btnSync.disabled = true;

    if (btnLogin)
        btnLogin.disabled = true;

}

function enableUI() {

    State.syncing = false;

    if (btnSync)
        btnSync.disabled = false;

    if (btnLogin)
        btnLogin.disabled = false;



}


// ======================================================
// STATUS HELPERS
// ======================================================

function setLeetCodeStatus(text, css) {

    if (!leetcodeStatus)
        return;

    leetcodeStatus.textContent =
        text;

    leetcodeStatus.className =
        `badge ${css}`;

}

function setGitHubStatus(text, css) {

    if (!githubStatus)
        return;

    githubStatus.textContent =
        text;

    githubStatus.className =
        `badge ${css}`;

}


// ======================================================
// UTILITIES
// ======================================================

function sleep(ms) {

    return new Promise(

        resolve =>

            setTimeout(resolve, ms)

    );

}

function formatNumber(number) {

    return Number(number)
        .toLocaleString();

}


// ======================================================
// LEETCODE SESSION
// ======================================================

async function getCookies() {

    try {

        const cookies =
            await chrome.cookies.getAll({

                domain: "leetcode.com"

            });

        const session =
            cookies.find(

                c => c.name === "LEETCODE_SESSION"

            );

        const csrf =
            cookies.find(

                c => c.name === "csrftoken"

            );

        State.session =
            session?.value || "";

        State.csrfToken =
            csrf?.value || "";

        return {

            session: State.session,

            csrf: State.csrfToken

        };

    }

    catch (err) {

        error(err.message);

        return null;

    }

}


// ======================================================
// CHECK SESSION
// ======================================================

async function checkLeetCodeSession() {

    log("Checking LeetCode session...");

    const cookies =
        await getCookies();

    if (!cookies) {

        setLeetCodeStatus(

            "Error",

            "disconnected"

        );

        return false;

    }

    if (!cookies.session) {

        setLeetCodeStatus(

            "Not Logged In",

            "disconnected"

        );

        leetcodeInfo.textContent =
            "Please login to LeetCode.";

        return false;

    }

    setLeetCodeStatus(

        "Connected",

        "connected"

    );

    leetcodeInfo.textContent =
        "LeetCode session detected.";

    success("LeetCode connected.");

    // Fetch latest submission to find the highest frontend ID for max sync default
    try {
        const res = await fetch("https://leetcode.com/api/submissions/?offset=0&limit=1", {
            headers: {
                Cookie: `LEETCODE_SESSION=${cookies.session}; csrftoken=${cookies.csrf}`,
                "X-CSRFToken": cookies.csrf
            }
        });
        if (res.ok) {
            const data = await res.json();
            const latest = data?.submissions_dump?.[0];
            if (latest) {
                const frontendId = latest.frontend_id;
                if (frontendId) {
                    console.log("LeetVault: Detected latest submission's frontend_id:", frontendId);
                    const syncMaxInput = document.getElementById("sync-max");
                    if (syncMaxInput) {
                        syncMaxInput.value = frontendId;
                        console.log("LeetVault: Set sync-max default to", frontendId);
                    }
                }
            }
        }
    } catch (e) {
        console.error("LeetVault: Failed to retrieve latest submission frontend_id:", e);
    }

    return true;

}



// ======================================================
// START SYNC (sirf background ko trigger karo)
// ======================================================

async function startSync() {

    const selectedRepo = repoSelect.value;
    const chosenRepoName = selectedRepo === "__new__" ? repoName.value : selectedRepo;

    const options = {

        pageSize: Number(document.getElementById("sync-limit").value) || 20,
        max: Number(document.getElementById("sync-max").value) || 500,
        destination: getSyncDestination(),
        repoName: chosenRepoName,
        isPrivate: repoVisibility.value === "private"

    };

    disableUI();
    clearLogs();
    showProgress();

    if (btnPause) {
        btnPause.textContent = "Pause";
        btnPause.disabled = false;
    }
    if (btnStop) {
        btnStop.disabled = false;
    }

    chrome.runtime.sendMessage({ type: "START_HISTORICAL_SYNC", options });

    // Ab bas listen karo — background jo bhi update bheje

}

// ======================================================
// LISTEN FOR LIVE PROGRESS UPDATES (jab popup khula ho)
// ======================================================

chrome.runtime.onMessage.addListener((request) => {

    if (request.type === "SYNC_PROGRESS_UPDATE") {

        renderProgress(request.state);

    }

});

// ======================================================
// RENDER PROGRESS (chahe background se ya poll se aaya ho)
// ======================================================
function renderProgress(state) {

    if (!state.running && state.percent >= 100) {
        wasSyncing = false;
        showStep("step-success");
        updateStats();
        return;
    }

    if (state.running) {

        showProgress();

    } else {

        hideProgress();

    }

    if (progressPanel) {

        progressPanel.classList.toggle("is-running", !!state.running);

    }

    setProgress(state.percent, state.text || "idle");

    clearLogs();

    for (const entry of state.logs) {

        log(entry.message, entry.level);

    }

    if (!state.running) {

        enableUI();

        if (state.rawExport) {

            exportRawSubmissions(state.rawExport);
            chrome.runtime.sendMessage({ type: "CLEAR_RAW_EXPORT" });

        }

    }

}

// ======================================================
// ON POPUP OPEN — pichla progress fetch karo
// ======================================================

async function syncPopupWithBackground() {

    chrome.runtime.sendMessage({ type: "GET_SYNC_PROGRESS" }, (state) => {

        if (state) {

            renderProgress(state);

            if (state.running) {

                showProgress();
                disableUI();

            }

        }

    });

}





// ======================================================
// EXPORT
// ======================================================

function exportGeneratedFiles() {

    if (!State.files || State.files.length === 0) {

        warning("Nothing to export.");

        return;

    }

    const blob = new Blob(

        [

            JSON.stringify(

                State.files,

                null,

                4

            )

        ],

        {

            type: "application/json"

        }

    );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;

    a.download = "leetvault-export.json";

    a.click();

    URL.revokeObjectURL(url);

    success("Export completed.");

}



// ======================================================
// EXPORT RAW SUBMISSIONS (no processing, exact LeetCode data)
// ======================================================

function exportRawSubmissions(submissions) {

    const blob = new Blob(

        [JSON.stringify(submissions, null, 4)],

        { type: "application/json" }

    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "leetvault-raw-submissions.json";

    a.click();

    URL.revokeObjectURL(url);

}



// ======================================================
// OPEN REPOSITORY
// ======================================================

function openRepository() {
    if (!Github.repoUrl) {
        warning("No repository yet.");
        return;
    }
    chrome.tabs.create({ url: Github.repoUrl });
}



// ======================================================
// GITHUB LOGIN PLACEHOLDER
// ======================================================



async function githubLogin() {
    console.log("STEP 1: function called");

    if (Github.isAuthenticated()) {
        success("Already connected to GitHub.");
        return;
    }

    console.log("STEP 2: not authenticated, proceeding");

    setGitHubStatus("Connecting...", "checking");

    console.log("STEP 3: about to call Github.login()");

    const ok = await Github.login();

    console.log("STEP 4: login() returned:", ok);

    if (ok) {
        await Github.getUser();
        setGitHubStatus(`Connected: ${Github.username}`, "connected");
        success("GitHub connected.");
        await loadRepositoryList();
        await checkAuthStatus();
    } else {
        setGitHubStatus("Not Connected", "disconnected");
        error("GitHub login failed.");
    }

}



// ======================================================
// BUTTON EVENTS
// ======================================================

if (btnSync) {

    btnSync.onclick =
        startSync;

}

if (btnLogin) {

    btnLogin.onclick =
        githubLogin;

}

if (btnExport) {

    btnExport.onclick =
        exportGeneratedFiles;

}

if (btnOpenRepo) {

    btnOpenRepo.onclick =
        openRepository;

}

// ---------- Wizard Navigation Click Events ----------
const btnStep1Next = document.getElementById("btn-step1-next");
if (btnStep1Next) {
    btnStep1Next.onclick = () => {
        showStep("step-repo");
    };
}

const btnStep2Back = document.getElementById("btn-step2-back");
if (btnStep2Back) {
    btnStep2Back.onclick = () => {
        showStep("step-auth");
    };
}

const btnStep2Next = document.getElementById("btn-step2-next");
if (btnStep2Next) {
    btnStep2Next.onclick = async () => {
        const selectedRepo = repoSelect.value;
        const chosenRepoName = selectedRepo === "__new__" ? repoName.value : selectedRepo;
        const isPrivate = repoVisibility.value === "private";

        btnStep2Next.disabled = true;
        btnStep2Next.textContent = "Setting up...";

        try {
            await Github.ensureRepository(chosenRepoName, isPrivate);
            success(`Repository set up successfully: ${chosenRepoName}`);
            if (liveSyncToggle && liveSyncToggle.checked) {
                await Sync.enable();
            } else {
                await Sync.disable();
            }
            showStep("step-sync");
        } catch (err) {
            error(`Failed to configure repository: ${err.message}`);
        } finally {
            btnStep2Next.disabled = false;
            btnStep2Next.textContent = "Continue";
        }
    };
}

const btnStep3Back = document.getElementById("btn-step3-back");
if (btnStep3Back) {
    btnStep3Back.onclick = () => {
        showStep("step-repo");
    };
}

const btnSuccessDone = document.getElementById("btn-success-done");
if (btnSuccessDone) {
    btnSuccessDone.onclick = () => {
        determineActiveStep();
    };
}

if (btnLockRepo) {
    btnLockRepo.onclick = async () => {
        const isLocked = btnLockRepo.classList.contains("locked");
        if (isLocked) {
            btnLockRepo.classList.remove("locked");
            if (repoSelect) repoSelect.disabled = false;
            await chrome.storage.local.set({ repoLocked: false });
            success("Repository settings unlocked.");
        } else {
            const selectedRepo = repoSelect.value;
            const chosenRepoName = selectedRepo === "__new__" ? repoName.value.trim() : selectedRepo;
            if (!chosenRepoName) {
                error("Please enter a valid repository name first.");
                return;
            }
            btnLockRepo.classList.add("locked");
            if (repoSelect) repoSelect.disabled = true;
            await chrome.storage.local.set({ repoLocked: true });
            success("Repository settings locked.");
        }
    };
}


if (btnPause) {
    btnPause.onclick = () => {
        chrome.runtime.sendMessage({ type: "PAUSE_HISTORICAL_SYNC" }, (response) => {
            if (response) {
                btnPause.textContent = response.paused ? "Resume" : "Pause";
            }
        });
    };
}

if (btnStop) {
    btnStop.onclick = () => {
        btnStop.disabled = true;
        btnPause.disabled = true;
        chrome.runtime.sendMessage({ type: "STOP_HISTORICAL_SYNC" });
    };
}


// ---------- Theme Toggle ----------
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
    themeToggle.onclick = () => {
        const currentTheme = document.body.getAttribute("data-theme") || "light";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.body.setAttribute("data-theme", newTheme);
        localStorage.setItem("uiTheme", newTheme);
    };
}


const liveSyncModal = document.getElementById("live-sync-modal");
const modalRepoSelect = document.getElementById("modal-repo-select");
const modalRepoNameGroup = document.getElementById("modal-repo-name-group");
const modalRepoName = document.getElementById("modal-repo-name");
const modalRepoVisibility = document.getElementById("modal-repo-visibility");
const modalBtnCancel = document.getElementById("modal-btn-cancel");
const modalBtnConfirm = document.getElementById("modal-btn-confirm");

async function loadModalRepositoryList() {
    if (!Github.isAuthenticated()) return;
    modalRepoSelect.innerHTML = `<option value="__new__">+ Create new repository</option>`;
    try {
        const repos = await Github.listRepositories();
        for (const repo of repos) {
            const option = document.createElement("option");
            option.value = repo.name;
            option.textContent = repo.private ? `${repo.name} (private)` : repo.name;
            modalRepoSelect.appendChild(option);
        }
        if (Github.repository) {
            modalRepoSelect.value = Github.repository;
        }
    } catch (err) {
        console.error("Could not load repo list for modal:", err);
    }
    updateModalRepoNameVisibility();
}

function updateModalRepoNameVisibility() {
    if (modalRepoSelect.value === "__new__") {
        modalRepoNameGroup.classList.remove("hidden");
    } else {
        modalRepoNameGroup.classList.add("hidden");
    }
}

if (modalRepoSelect) {
    modalRepoSelect.onchange = updateModalRepoNameVisibility;
}

if (modalBtnCancel) {
    modalBtnCancel.onclick = () => {
        liveSyncModal.classList.add("hidden");
        if (liveSyncToggle) {
            liveSyncToggle.checked = false;
        }
    };
}

if (modalBtnConfirm) {
    modalBtnConfirm.onclick = async () => {
        const selectedRepo = modalRepoSelect.value;
        const chosenRepoName = selectedRepo === "__new__" ? modalRepoName.value : selectedRepo;
        const isPrivate = modalRepoVisibility.value === "private";

        modalBtnConfirm.disabled = true;
        modalBtnCancel.disabled = true;
        modalBtnConfirm.textContent = "Configuring...";

        try {
            await Github.ensureRepository(chosenRepoName, isPrivate);
            await Sync.enable();
            if (liveSyncToggle) {
                liveSyncToggle.checked = true;
            }
            success(`Live Sync enabled: ${chosenRepoName}`);

            await loadRepositoryList();
            if (repoSelect) {
                repoSelect.value = chosenRepoName;
                updateRepoNameVisibility();
            }
        } catch (err) {
            error(`Failed to configure repository: ${err.message}`);
            if (liveSyncToggle) {
                liveSyncToggle.checked = false;
            }
        } finally {
            modalBtnConfirm.disabled = false;
            modalBtnCancel.disabled = false;
            modalBtnConfirm.textContent = "Confirm & Enable";
            liveSyncModal.classList.add("hidden");
        }
    };
}

if (liveSyncToggle) {
    liveSyncToggle.onchange = async () => {
        if (liveSyncToggle.checked) {
            // Revert state first, let confirmation set it
            liveSyncToggle.checked = false;

            if (!Github.isAuthenticated()) {
                error("Please connect GitHub first.");
                return;
            }

            const storage = await chrome.storage.local.get("repoLocked");
            if (storage.repoLocked && Github.repository) {
                // Bypass settings modal
                await Sync.enable();
                liveSyncToggle.checked = true;
                success(`Live Sync enabled: ${Github.repository}`);
            } else {
                await loadModalRepositoryList();
                liveSyncModal.classList.remove("hidden");
            }
        } else {
            await Sync.disable();
            success("Live Sync disabled.");
        }
    };
}





// ======================================================
// INITIALIZE
// ======================================================
async function init() {

    // Validate Page Size Input
    const syncLimitInput = document.getElementById("sync-limit");
    if (syncLimitInput) {
        syncLimitInput.addEventListener("change", () => {
            const val = Number(syncLimitInput.value);
            if (val < 10) {
                alert("Warning: Page size must be at least 10 for efficient loading!");
                syncLimitInput.value = 10;
            } else if (val > 20) {
                alert("Warning: LeetCode restricts page sizes to a maximum of 20!");
                syncLimitInput.value = 20;
            }
        });
    }

    clearLogs();
    resetStats();
    resetProgress();
    hideProgress();

    setLeetCodeStatus("Checking...", "checking");
    setGitHubStatus("Not Connected", "disconnected");

    log("Initializing LeetVault...");

    await Sync.loadState();
    if (liveSyncToggle) liveSyncToggle.checked = Sync.liveSyncEnabled;

    await Github.loadState();

    // Initialize repository lock UI state
    const lockData = await chrome.storage.local.get("repoLocked");
    const isLocked = !!lockData.repoLocked;
    if (btnLockRepo) {
        if (isLocked) {
            btnLockRepo.classList.add("locked");
            if (repoSelect) repoSelect.disabled = true;
        } else {
            btnLockRepo.classList.remove("locked");
            if (repoSelect) repoSelect.disabled = false;
        }
    }

    if (Github.isAuthenticated()) {
        setGitHubStatus(`Connected: ${Github.username}`, "connected");
        await loadRepositoryList();
    } else {
        setGitHubStatus("Checking...", "checking");
        const autoConnected = await Github.loginSilent();
        if (autoConnected) {
            await Github.getUser();
            setGitHubStatus(`Connected: ${Github.username}`, "connected");
            success("GitHub auto-connected.");
            await loadRepositoryList();
        } else {
            setGitHubStatus("Not Connected", "disconnected");
        }
    }

    // Check active background progress first to avoid step flashes
    const activeSyncState = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "GET_SYNC_PROGRESS" }, resolve);
    });

    if (activeSyncState && activeSyncState.running) {
        renderProgress(activeSyncState);
    } else {
        await determineActiveStep();
        if (activeSyncState) {
            renderProgress(activeSyncState);
        }
    }

    success("Ready.");

}



// ======================================================
// START
// ======================================================

document.addEventListener(

    "DOMContentLoaded",

    init

);