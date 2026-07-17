importScripts(

    "../CORE/core.js",
    "../CORE/metadata.js",
    "../CORE/generator.js",
    "../CORE/readme.js",
    "../CORE/exporter.js",
    "../GITHUB/github.js",
    "../LEETCODE/sync.js"

);

console.log("LeetVault Background Started");

(async () => {

    await Sync.loadState();
    await Github.loadState();
    await resetSyncProgressState();

})();

// Clear progress state when the browser starts up (Chrome exits/restarts)
chrome.runtime.onStartup.addListener(async () => {
    await chrome.storage.local.remove("syncProgress");
});

let currentSyncState = null;
let resetTimeoutId = null;
let pendingLiveSync = null;
let liveSyncKeepAliveTimeout = null;

// ==================================
// PROGRESS STATE (persisted + broadcast)
// ==================================

async function setSyncProgress(state) {

    await chrome.storage.local.set({ syncProgress: state });

    // Agar popup khula hai, use turant update bhi bhej do
    chrome.runtime.sendMessage({ type: "SYNC_PROGRESS_UPDATE", state }).catch(() => { });

}

async function getSyncProgress() {

    if (currentSyncState) return currentSyncState;

    const data = await chrome.storage.local.get("syncProgress");

    return data.syncProgress || { running: false, paused: false, stopped: false, percent: 0, text: "Idle", logs: [] };

}

async function resetSyncProgressState() {

    const resetState = { running: false, paused: false, stopped: false, percent: 0, text: "Idle", logs: [] };
    currentSyncState = null;
    if (resetTimeoutId) {
        clearTimeout(resetTimeoutId);
        resetTimeoutId = null;
    }
    await chrome.storage.local.set({ syncProgress: resetState });
    chrome.runtime.sendMessage({ type: "SYNC_PROGRESS_UPDATE", state: resetState }).catch(() => { });

}

function scheduleReset() {

    if (resetTimeoutId) {
        clearTimeout(resetTimeoutId);
        resetTimeoutId = null;
    }
    chrome.alarms.clear("resetSyncProgress");
    chrome.alarms.create("resetSyncProgress", { when: Date.now() + 50000 });

    resetTimeoutId = setTimeout(async () => {
        const alarm = await chrome.alarms.get("resetSyncProgress");
        if (alarm) {
            chrome.alarms.clear("resetSyncProgress");
            await resetSyncProgressState();
        }
    }, 50000);

}

function pushLog(state, message, level = "info") {

    state.logs.push({ message, level, at: Date.now() });

    if (state.logs.length > 100) state.logs.shift();   // bahut lambi list na ho

}

async function checkPauseStop() {

    if (!currentSyncState) return;

    const originalText = currentSyncState.text;

    while (currentSyncState.paused && !currentSyncState.stopped) {

        currentSyncState.text = "Paused";
        await setSyncProgress(currentSyncState);
        await new Promise(r => setTimeout(r, 1000));

    }

    if (currentSyncState.stopped) {

        throw new Error("Sync stopped by user.");

    }

    if (currentSyncState.text === "Paused") {

        currentSyncState.text = originalText;

    }

}

// ==================================
// KEEP SERVICE WORKER ALIVE DURING LONG SYNC
// ==================================
// chrome.alarms ka minimum period 1 min tak clamp ho sakta hai,
// jo 30s idle-kill threshold se zyada hai — isliye sirf alarm pe
// depend nahi karte. Har ~20s pe ek real extension API call karte
// hain (chrome.storage.local.get), jo Chrome ke idle timer ko
// guaranteed reset karti hai.

let keepAliveInterval = null;

function startKeepAlive() {

    chrome.alarms.create("keepAlive", { periodInMinutes: 1 });   // backup, best-effort

    if (keepAliveInterval) clearInterval(keepAliveInterval);

    keepAliveInterval = setInterval(() => {

        // Koi bhi halki real extension API call — ye "activity"
        // count hoti hai, service worker ka idle timer reset ho jaata hai
        chrome.storage.local.get("keepAliveTick").then(() => { });

    }, 20000);   // har 20 second

}

function stopKeepAlive() {

    chrome.alarms.clear("keepAlive");

    if (keepAliveInterval) {

        clearInterval(keepAliveInterval);
        keepAliveInterval = null;

    }

}

// ==================================
// SAFE WAIT — chunked delay jo worker ko alive rakhta hai
// ==================================
// Ek single long setTimeout ke bajaye, wait ko 2s ke tukdon
// mein toda jaata hai. Har chunk ke baad ek real API call hoti
// hai taaki Chrome ko pata rahe worker abhi active hai.

async function safeWait(ms) {

    const chunk = 2000;   // 2 second ke tukdo me
    let elapsed = 0;

    while (elapsed < ms) {

        await new Promise(r => setTimeout(r, Math.min(chunk, ms - elapsed)));
        elapsed += chunk;

        // Har chunk ke baad ek halki API call — worker ko "alive" signal
        await chrome.storage.local.get("keepAliveTick").catch(() => { });

    }

}

chrome.alarms.onAlarm.addListener(async (alarm) => {

    if (alarm.name === "keepAlive") {

        console.log("keep-alive ping");   // sirf worker ko zinda rakhne ke liye

    } else if (alarm.name === "resetSyncProgress") {

        await resetSyncProgressState();

    }

});

// ==================================
// MESSAGE ROUTER
// ==================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.type === "START_HISTORICAL_SYNC") {

        runHistoricalSync(request.options);
        sendResponse({ started: true });

    }

    if (request.type === "PAUSE_HISTORICAL_SYNC") {

        if (currentSyncState && currentSyncState.running) {

            currentSyncState.paused = !currentSyncState.paused;
            currentSyncState.text = currentSyncState.paused ? "Paused" : "Resuming...";
            pushLog(currentSyncState, currentSyncState.paused ? "Sync paused by user." : "Sync resumed.", "info");
            setSyncProgress(currentSyncState);

        }
        sendResponse({ paused: currentSyncState?.paused || false });
        return true;

    }

    if (request.type === "STOP_HISTORICAL_SYNC") {

        if (currentSyncState && currentSyncState.running) {

            currentSyncState.stopped = true;
            currentSyncState.paused = false;
            pushLog(currentSyncState, "Sync stopping...", "warning");
            setSyncProgress(currentSyncState);

        }
        sendResponse({ stopped: true });
        return true;

    }

    if (request.type === "GET_SYNC_PROGRESS") {

        getSyncProgress().then(sendResponse);
        return true;   // async response

    }

    if (request.type === "CLEAR_RAW_EXPORT") {

        if (currentSyncState) {
            delete currentSyncState.rawExport;
        }
        chrome.storage.local.get("syncProgress").then(async (data) => {
            if (data.syncProgress) {
                delete data.syncProgress.rawExport;
                await chrome.storage.local.set({ syncProgress: data.syncProgress });
            }
        });
        sendResponse({ cleared: true });
        return true;

    }

    if (request.type === "GET_GITHUB_REPOS") {

        (async () => {
            try {
                await Github.loadState();
                if (!Github.isAuthenticated()) {
                    sendResponse({ success: false, error: "Not authenticated. Connect GitHub first." });
                    return;
                }
                const repos = await Github.listRepositories();
                sendResponse({ success: true, repos });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();

        return true; // async response

    }

    if (request.type === "SETUP_LIVE_SYNC_REPO") {

        (async () => {
            try {
                await Github.loadState();
                if (!Github.isAuthenticated()) {
                    sendResponse({ success: false, error: "Not authenticated. Connect GitHub first." });
                    return;
                }
                await Github.ensureRepository(request.repoName, request.isPrivate);
                await Sync.enable();
                await chrome.storage.local.set({ repoLocked: !!request.lock });
                sendResponse({ success: true });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();

        return true; // async response

    }

    if (request.type === "LEETCODE_SUBMISSION_DETECTED") {

        (async () => {
            const targetTabId = sender.tab?.id;
            startKeepAlive();

            try {
                const { session, csrf } = await getLeetCodeCookies();
                if (!session) {
                    console.error("No LeetCode session found.");
                    if (targetTabId) {
                        chrome.tabs.sendMessage(targetTabId, {
                            type: "LIVE_SYNC_FAILED",
                            error: "No LeetCode session found."
                        });
                    }
                    stopKeepAlive();
                    return;
                }

                // Poll submissions API to detect the new submission ID
                let retries = 0;
                const maxRetries = 15;
                let submissionId = null;

                const query = `
                query submissions($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) {
                  submissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) {
                    submissions {
                      id
                      statusDisplay
                      lang
                      runtime
                      timestamp
                      url
                      isPending
                      memory
                    }
                  }
                }`;

                while (retries < maxRetries) {
                    console.log(`Polling recent submissions list via GraphQL (try ${retries + 1})...`);
                    try {
                        const res = await fetch("https://leetcode.com/graphql", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf}`,
                                "X-CSRFToken": csrf,
                                "Referer": `https://leetcode.com/problems/${request.problemSlug}/`
                            },
                            body: JSON.stringify({
                                query,
                                variables: {
                                    offset: 0,
                                    limit: 5,
                                    lastKey: null,
                                    questionSlug: request.problemSlug
                                }
                            })
                        });

                        if (res.ok) {
                            const { data } = await res.json();
                            const recent = data?.submissionList?.submissions || [];
                            if (recent.length > 0) {
                                const latest = recent[0];
                                if (parseInt(latest.timestamp, 10) >= request.submitTime) {
                                    submissionId = parseInt(latest.id, 10);
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error polling submissions list:", e);
                    }

                    await safeWait(1000);
                    retries++;
                }

                if (!submissionId) {
                    console.error("Submission detection timed out.");
                    if (targetTabId) {
                        chrome.tabs.sendMessage(targetTabId, {
                            type: "LIVE_SYNC_FAILED",
                            error: "Submission detection timed out."
                        });
                    }
                    stopKeepAlive();
                    return;
                }

                await Sync.loadState();
                if (Sync.shouldTrigger()) {
                    runLiveSync(submissionId, targetTabId);
                } else {
                    stopKeepAlive();
                }

            } catch (err) {
                console.error("Error in submission detection:", err);
                if (targetTabId) {
                    chrome.tabs.sendMessage(targetTabId, {
                        type: "LIVE_SYNC_FAILED",
                        error: err.message
                    });
                }
                stopKeepAlive();
            }
        })();

        return true;

    }

    if (request.type === "CONFIRM_LIVE_SYNC") {

        (async () => {
            let syncData = pendingLiveSync;
            if (!syncData) {
                const stored = await chrome.storage.local.get("pendingLiveSync");
                syncData = stored.pendingLiveSync;
            }

            if (syncData) {
                if (liveSyncKeepAliveTimeout) {
                    clearTimeout(liveSyncKeepAliveTimeout);
                    liveSyncKeepAliveTimeout = null;
                }
                startKeepAlive(); // Keep alive during actual push

                try {
                    const result = await Github.sync(syncData.files, {
                        repoName: syncData.repoName,
                        commitMessage: syncData.commitMessage
                    });
                    sendResponse(result);
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                } finally {
                    stopKeepAlive();
                    pendingLiveSync = null;
                    await chrome.storage.local.remove("pendingLiveSync");
                }
            } else {
                sendResponse({ success: false, error: "No pending live sync found." });
            }
        })();

        return true; // async response

    }

    if (request.type === "CANCEL_LIVE_SYNC") {

        if (liveSyncKeepAliveTimeout) {
            clearTimeout(liveSyncKeepAliveTimeout);
            liveSyncKeepAliveTimeout = null;
        }
        stopKeepAlive();
        pendingLiveSync = null;
        chrome.storage.local.remove("pendingLiveSync").then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;

    }

});

// ==================================
// LEETCODE COOKIES
// ==================================

async function getLeetCodeCookies() {

    const cookies = await chrome.cookies.getAll({ domain: "leetcode.com" });

    const session = cookies.find(c => c.name === "LEETCODE_SESSION");
    const csrf = cookies.find(c => c.name === "csrftoken");

    return { session: session?.value || "", csrf: csrf?.value || "" };

}

// ==================================
// FETCH SUBMISSIONS PAGE (REST)
// ==================================

async function fetchSubmissionsPage(session, csrf, limit, offset) {

    const res = await fetch(

        `https://leetcode.com/api/submissions/?offset=${offset}&limit=${limit}`,

        {
            headers: {
                Cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf}`,
                "X-CSRFToken": csrf
            }
        }

    );

    if (res.status === 403) throw new Error("403");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return res.json();

}

// ==================================
// HISTORICAL SYNC — poora kaam yahan, background me
// ==================================

async function runHistoricalSync(options) {

    if (resetTimeoutId) {
        clearTimeout(resetTimeoutId);
        resetTimeoutId = null;
    }
    chrome.alarms.clear("resetSyncProgress");

    // Synchronize GitHub & Sync state from storage
    await Github.loadState();
    await Sync.loadState();

    const {
        pageSize = 20,
        max = 500,
        destination = "github",
        repoName = "LeetVault",
        isPrivate = false
    } = options;

    startKeepAlive();

    let state = { running: true, paused: false, stopped: false, percent: 0, text: "Starting...", logs: [] };
    currentSyncState = state;
    await setSyncProgress(state);

    try {

        const { session, csrf } = await getLeetCodeCookies();

        if (!session) {

            pushLog(state, "No LeetCode session found.", "error");
            state.running = false;
            await setSyncProgress(state);
            return;

        }

        // ---------- DOWNLOAD ----------

        let offset = 0;
        let submissions = [];
        let retry = 0;
        let requests = 0;

        while (submissions.length < max) {

            await checkPauseStop();

            state.percent = Math.min((submissions.length / max) * 40, 40);
            state.text = `Downloading ${submissions.length}/${max}`;
            pushLog(state, `Fetching submissions from offset ${offset}...`, "info");
            await setSyncProgress(state);

            try {

                if (offset > 0) {
                    await safeWait(1500);
                }

                const json = await fetchSubmissionsPage(session, csrf, pageSize, offset);

                requests++;

                if (!json.submissions_dump || json.submissions_dump.length === 0) {
                    pushLog(state, `Reached end of submissions at offset ${offset}.`, "info");
                    await setSyncProgress(state);
                    break;
                }

                pushLog(state, `Successfully fetched ${json.submissions_dump.length} submissions.`, "success");
                submissions.push(...json.submissions_dump);

                offset += pageSize;

                if (requests % 5 === 0) {

                    await checkPauseStop();

                    pushLog(state, "Working", "warning");
                    await setSyncProgress(state);
                    await safeWait(4000);

                } else {

                    await setSyncProgress(state);

                }

                if (json.submissions_dump.length < pageSize) break;

            } catch (err) {

                if (err.message === "403") {

                    retry++;
                    if (retry > 5) throw new Error("Too many 403 errors.");

                    pushLog(state, `403 retry ${retry}/5`, "warning");
                    await setSyncProgress(state);
                    await safeWait(5000);
                    continue;

                }

                throw err;

            }

        }

        submissions = submissions.slice(0, max);

        pushLog(state, `${submissions.length} submissions downloaded.`, "success");

        // ---------- JSON-ONLY PATH ----------

        if (destination === "json") {

            state.percent = 100;
            state.text = "Completed";
            state.running = false;
            state.rawExport = submissions;   // popup isse download trigger karega
            pushLog(state, "Raw JSON ready for export.", "success");
            await setSyncProgress(state);
            stopKeepAlive();
            scheduleReset();
            return;

        }

        // ---------- PIPELINE ----------

        await checkPauseStop();
        state.text = "Preparing repository"; state.percent = 50;
        await setSyncProgress(state);

        Core.load(submissions);
        Core.groupProblems();
        Core.groupLanguages();
        Core.selectBestSubmissions();
        Core.prepareRepository();

        const repository = Core.getRepository();

        await checkPauseStop();
        state.text = "Fetching metadata"; state.percent = 60;
        await setSyncProgress(state);

        Metadata.reset();
        await Metadata.mergeBulk(repository);

        await checkPauseStop();
        state.text = "Generating files"; state.percent = 70;
        await setSyncProgress(state);

        Generator.build(repository);
        Generator.generateSolutionFiles();

        Readme.build(repository);
        Readme.addRoot(repository);

        Exporter.build(Generator.getGeneratedFiles(), Readme.getFiles());

        const report = Exporter.validate();

        if (!report.valid) {

            pushLog(state, "Validation failed: " + report.errors.join(", "), "error");
            state.running = false;
            await setSyncProgress(state);
            stopKeepAlive();
            return;

        }

        const files = Exporter.getFiles();

        // ---------- STATE JSON ----------
        // Save repository state so live sync can read it later and merge
        // new problems without wiping the root README.
        const stats = Readme.computeStats(repository);
        const stateJSON = JSON.stringify({ stats, problems: repository }, null, 2);
        files.push({ path: ".leetvault_state.json", content: stateJSON });

        // ---------- GITHUB ----------

        await checkPauseStop();
        state.text = "Uploading to GitHub"; state.percent = 90;
        await setSyncProgress(state);

        if (!Github.isAuthenticated()) {

            pushLog(state, "GitHub not connected.", "error");
            state.running = false;
            await setSyncProgress(state);
            stopKeepAlive();
            return;

        }

        const result = await Github.sync(files, { repoName, isPrivate });

        if (result.success) {

            pushLog(state, `${result.filesCount} files pushed → ${result.repoUrl}`, "success");

        } else {

            pushLog(state, `Upload failed: ${result.error}`, "error");

        }

        state.percent = 100;
        state.text = "Completed";
        state.running = false;
        await setSyncProgress(state);
        scheduleReset();

    } catch (err) {

        pushLog(state, err.message, "error");
        state.running = false;
        await setSyncProgress(state);

    } finally {

        stopKeepAlive();
        currentSyncState = null;

    }

}

// ==================================
// LIVE SYNC
// ==================================

async function fetchSubmissionDetails(submissionId, session, csrf) {
    const query = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        code
        runtimeDisplay
        memoryDisplay
        statusDisplay
        timestamp
        lang {
          name
        }
        question {
          title
          titleSlug
        }
      }
    }`;

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf}`,
            "X-CSRFToken": csrf
        },
        body: JSON.stringify({
            query,
            variables: { submissionId: parseInt(submissionId, 10) }
        })
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch submission details: HTTP ${res.status}`);
    }

    const { data } = await res.json();
    return data?.submissionDetails || null;
}

async function runLiveSync(submissionId, tabId = null) {
    // Start keep-alive for the live sync flow
    startKeepAlive();

    if (liveSyncKeepAliveTimeout) {
        clearTimeout(liveSyncKeepAliveTimeout);
    }
    liveSyncKeepAliveTimeout = setTimeout(() => {
        console.log("Live sync keep-alive safety timeout reached. Stopping keep-alive.");
        stopKeepAlive();
        liveSyncKeepAliveTimeout = null;
    }, 30000); // 30 seconds safety window

    const targetTabId = tabId || (await new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs?.[0]?.id));
    }));

    try {
        const { session, csrf } = await getLeetCodeCookies();
        if (!session) {
            console.error("No LeetCode session found for live sync.");
            if (targetTabId) {
                chrome.tabs.sendMessage(targetTabId, {
                    type: "LIVE_SYNC_FAILED",
                    error: "No LeetCode session found."
                });
            }
            stopKeepAlive();
            if (liveSyncKeepAliveTimeout) {
                clearTimeout(liveSyncKeepAliveTimeout);
                liveSyncKeepAliveTimeout = null;
            }
            return;
        }

        // Wait 4 seconds for LeetCode's judging to complete
        console.log("LeetVault: Delaying 4 seconds to let judgment finish...");
        await safeWait(4000);

        // Poll submission details until judgment completes (no longer Pending or Judging)
        let subDetails = null;
        let retries = 0;
        const maxRetries = 15;

        while (retries < maxRetries) {
            try {
                subDetails = await fetchSubmissionDetails(submissionId, session, csrf);
                if (subDetails) {
                    const status = subDetails.statusDisplay;
                    if (status !== "Pending" && status !== "Judging") {
                        break;
                    }
                    console.log(`Submission status is ${status}, polling again in 1s...`);
                } else {
                    console.log("Submission details are not ready yet, polling again in 1s...");
                }
            } catch (e) {
                console.error("Error fetching submission details, polling again in 1s...", e);
            }

            await safeWait(1000);
            retries++;
        }

        if (!subDetails) {
            console.error("No submission details returned after all retries.");
            if (targetTabId) {
                chrome.tabs.sendMessage(targetTabId, {
                    type: "LIVE_SYNC_FAILED",
                    error: "No submission details returned."
                });
            }
            stopKeepAlive();
            if (liveSyncKeepAliveTimeout) {
                clearTimeout(liveSyncKeepAliveTimeout);
                liveSyncKeepAliveTimeout = null;
            }
            return;
        }

        if (subDetails.statusDisplay !== "Accepted") {
            console.log(`Live sync skipped: status is ${subDetails.statusDisplay}`);
            if (targetTabId) {
                chrome.tabs.sendMessage(targetTabId, {
                    type: "LIVE_SYNC_SKIPPED",
                    status: subDetails.statusDisplay
                });
            }
            stopKeepAlive();
            if (liveSyncKeepAliveTimeout) {
                clearTimeout(liveSyncKeepAliveTimeout);
                liveSyncKeepAliveTimeout = null;
            }
            return;
        }

        // Fetch question metadata
        await Metadata.loadCache();
        const questionMeta = await Metadata.fetchQuestion(subDetails.question.titleSlug, session, csrf);

        // Construct the problem object
        const problem = {
            title: subDetails.question.title,
            slug: subDetails.question.titleSlug,
            qid: questionMeta?.questionId || "",
            files: [{
                filename: Core.languageMap[subDetails.lang.name] || `solution.${subDetails.lang.name}`,
                language: subDetails.lang.name,
                code: subDetails.code,
                runtime: subDetails.runtimeDisplay,
                memory: subDetails.memoryDisplay,
                status: subDetails.statusDisplay,
                timestamp: subDetails.timestamp,
                note: "",
                id: submissionId
            }]
        };

        if (questionMeta) {
            Metadata.mergeQuestion(problem, questionMeta);
        }

        // Get GitHub status & options (like repoName)
        await Github.loadState();
        if (!Github.isAuthenticated()) {
            console.error("GitHub not connected for live sync.");
            if (targetTabId) {
                chrome.tabs.sendMessage(targetTabId, {
                    type: "LIVE_SYNC_FAILED",
                    error: "GitHub not connected."
                });
            }
            stopKeepAlive();
            if (liveSyncKeepAliveTimeout) {
                clearTimeout(liveSyncKeepAliveTimeout);
                liveSyncKeepAliveTimeout = null;
            }
            return;
        }

        // Fetch current repository state from GitHub
        console.log("LeetVault: Fetching existing .leetvault_state.json from GitHub...");
        let mergedProblems = [];
        try {
            const stateContent = await Github.getFileContent(".leetvault_state.json");
            if (stateContent) {
                const stateData = JSON.parse(stateContent);
                if (stateData && Array.isArray(stateData.problems)) {
                    mergedProblems = stateData.problems;
                    console.log(`LeetVault: Loaded ${mergedProblems.length} problems from repository state.`);
                }
            }
        } catch (e) {
            console.warn("LeetVault: Could not load repository state, initializing new state.", e);
        }

        // Merge current problem into the list
        const existingIndex = mergedProblems.findIndex(p => p.slug === problem.slug);
        let mergedProblemForFolder = problem;
        if (existingIndex !== -1) {
            const existingProb = mergedProblems[existingIndex];
            const existingFileIndex = existingProb.files.findIndex(f => f.language === problem.files[0].language);
            if (existingFileIndex !== -1) {
                existingProb.files[existingFileIndex] = problem.files[0];
            } else {
                existingProb.files.push(problem.files[0]);
            }
            existingProb.title = problem.title;
            existingProb.qid = problem.qid;
            existingProb.difficulty = problem.difficulty;
            if (problem.tags) existingProb.tags = problem.tags;
            mergedProblemForFolder = existingProb;
        } else {
            mergedProblems.push(problem);
        }

        // Build solution files & READMEs
        const repository = [problem];
        Generator.build(repository);
        Generator.generateSolutionFiles();

        Readme.reset();
        Readme.build([mergedProblemForFolder]); // builds problem README with ALL solved languages!
        Readme.addRoot(mergedProblems); // builds and appends root README using merged list!

        Exporter.build(Generator.getGeneratedFiles(), Readme.getFiles());
        const files = Exporter.getFiles();

        // Append updated .leetvault_state.json to push files
        const stats = Readme.computeStats(mergedProblems);
        const updatedStateJSON = JSON.stringify({
            stats,
            problems: mergedProblems
        }, null, 2);

        files.push({
            path: ".leetvault_state.json",
            content: updatedStateJSON
        });

        const repoName = Github.repository || "LeetVault";
        const commitMessage = `LIVE SYNC: Solved ${problem.title} (${Readme.formatLanguage(problem.files[0].language)})`;

        pendingLiveSync = {
            files,
            repoName,
            commitMessage
        };

        // Persist pendingLiveSync in storage to survive service worker reload
        await chrome.storage.local.set({ pendingLiveSync });

        if (targetTabId) {
            chrome.tabs.sendMessage(targetTabId, {
                type: "SHOW_SYNC_PROMPT",
                problemTitle: problem.title,
                language: Readme.formatLanguage(problem.files[0].language)
            });
        }

    } catch (err) {
        console.error("Error in runLiveSync:", err);
        if (targetTabId) {
            chrome.tabs.sendMessage(targetTabId, {
                type: "LIVE_SYNC_FAILED",
                error: err.message
            });
        }
        stopKeepAlive();
        if (liveSyncKeepAliveTimeout) {
            clearTimeout(liveSyncKeepAliveTimeout);
            liveSyncKeepAliveTimeout = null;
        }
    }
}