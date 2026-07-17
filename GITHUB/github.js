// ======================================================
// github.js
// ------------------------------------------------------
// Single job: "I have generated files. How do I put them
// into a GitHub repository?"
//
// No LeetCode logic. No metadata. No README generation.
// No exporter logic. Only: Auth -> User -> Repository ->
// Files -> Sync.
//
// GitHub upload is NOT git push. Every file write is a
// REST call:
//   PUT /repos/{owner}/{repo}/contents/{path}
// GitHub creates the commit for you.
// ======================================================

const Github = {

    // ==================================
    // CONFIG
    // ==================================

    api: "https://api.github.com",

    // Register a GitHub OAuth App and put its client id here.
    // The GitHub App's "Authorization callback URL" must be
    // set to chrome.identity.getRedirectURL() (printed once
    // in the console the first time login() runs).
    clientId: "Ov23lijwCDBz5jgHFjxH",

    scope: "repo",

    // GitHub's code -> access_token exchange needs a client
    // secret, which can never live in extension code. Stand
    // up a tiny proxy (Cloudflare Worker / Vercel function)
    // that does that exchange and returns { access_token }.
    tokenExchangeUrl: "https://leetvault.vedantrathod476.workers.dev/api/github/oauth",

    // ==================================
    // DATAhttps://leetvault.vedantrathod476.workers.dev/

    token: "",

    username: "",

    repository: "",

    repoUrl: "",

    aboutText: "Automatically organized LeetCode solutions with problem metadata, README files, and seamless GitHub synchronization via LeetVault.",

    defaultBranch: "main",

    // ==================================
    // RESET
    // ==================================

    reset() {

        this.token = "";

        this.username = "";

        this.repository = "";

        this.repoUrl = "";

        this.defaultBranch = "main";

    },

    // ==================================
    // SAVE STATE
    // ==================================

    async saveState() {

        await chrome.storage.local.set({

            githubState: {

                token: this.token,

                username: this.username,

                repository: this.repository,

                repoUrl: this.repoUrl,

                defaultBranch: this.defaultBranch

            }

        });

    },

    // ==================================
    // LIST REPOSITORIES
    // ==================================

    async listRepositories() {

        if (!this.username) {

            await this.getUser();

        }

        const repos = await this.request(
            "GET",
            "/user/repos?per_page=100&sort=updated&affiliation=owner"
        );

        return repos || [];

    },

    // ==================================
    // LOAD STATE
    // ==================================

    async loadState() {

        const data =
            await chrome.storage.local.get("githubState");

        const state = data.githubState;

        if (state) {

            this.token = state.token || "";

            this.username = state.username || "";

            this.repository = state.repository || "";

            this.repoUrl = state.repoUrl || "";

            this.defaultBranch = state.defaultBranch || "main";

        }

        return this;

    },

    // ==================================
    // CLEAR STATE
    // ==================================

    async clearState() {

        this.reset();

        await chrome.storage.local.remove("githubState");

    },

    // ==================================
    // HEADERS
    // ==================================

    headers() {

        return {

            Authorization: `Bearer ${this.token}`,

            Accept: "application/vnd.github+json",

            "Content-Type": "application/json",

            "X-GitHub-Api-Version": "2022-11-28"

        };

    },

    // ==================================
    // REQUEST
    // ==================================
    // Every GitHub API call goes through here.
    // 404 -> null (caller decides what that means)
    // other non-OK -> throws

    async request(method, endpoint, body = null) {

        const res = await fetch(

            `${this.api}${endpoint}`,

            {

                method,

                headers: this.headers(),

                body: body ? JSON.stringify(body) : undefined

            }

        );

        if (res.status === 404) {

            return null;

        }

        if (!res.ok) {

            const text = await res.text().catch(() => "");

            throw new Error(

                `GitHub API ${method} ${endpoint} failed: ${res.status} ${text}`

            );

        }

        if (res.status === 204) {

            return true;

        }

        return res.json();

    },

    // ==================================
    // LOGIN
    // ==================================
    // Opens GitHub OAuth via chrome.identity, exchanges the
    // returned code for a token, saves it.
    // Returns true / false.


    // ==================================
    // SILENT LOGIN (auto-connect, no popup)
    // ==================================
    // Agar user pehle authorize kar chuka hai aur GitHub session
    // abhi bhi valid hai, to bina kisi popup ke token mil jaata hai.
    // Fail hone par false return karta hai (koi error nahi phekta).

    async loginSilent() {

        const extensionRedirectUri =
            chrome.identity.getRedirectURL();

        const authUrl =
            "https://github.com/login/oauth/authorize" +
            `?client_id=${this.clientId}` +
            `&scope=${encodeURIComponent(this.scope)}` +
            `&state=${encodeURIComponent(extensionRedirectUri)}`;

        let responseUrl;

        try {

            responseUrl = await chrome.identity.launchWebAuthFlow({

                url: authUrl,

                interactive: false   // <-- koi popup nahi, silent try

            });

        }

        catch (err) {

            // Normal hai — matlab silent login possible nahi tha
            return false;

        }

        if (!responseUrl) {

            return false;

        }

        const code =
            new URL(responseUrl).searchParams.get("code");

        if (!code) {

            return false;

        }

        try {

            const res = await fetch(this.tokenExchangeUrl, {

                method: "POST",

                headers: { "Content-Type": "application/json" },

                body: JSON.stringify({ code })

            });

            if (!res.ok) {

                return false;

            }

            const data = await res.json();

            if (!data.access_token) {

                return false;

            }

            this.token = data.access_token;

            await this.saveState();

            return true;

        }

        catch (err) {

            return false;

        }

    },


    async login() {

        const extensionRedirectUri =
            chrome.identity.getRedirectURL();

        const authUrl =
            "https://github.com/login/oauth/authorize" +
            `?client_id=${this.clientId}` +
            `&scope=${encodeURIComponent(this.scope)}` +
            `&state=${encodeURIComponent(extensionRedirectUri)}`;

        let responseUrl;

        try {

            responseUrl = await chrome.identity.launchWebAuthFlow({

                url: authUrl,

                interactive: true

            });

        }

        catch (err) {

            console.error(err);

            return false;

        }

        if (!responseUrl) {

            return false;

        }

        const code =
            new URL(responseUrl).searchParams.get("code");

        if (!code) {

            return false;

        }

        try {

            const res = await fetch(this.tokenExchangeUrl, {

                method: "POST",

                headers: { "Content-Type": "application/json" },

                body: JSON.stringify({ code })

            });

            if (!res.ok) {

                throw new Error("Token exchange failed");

            }

            const data = await res.json();

            if (!data.access_token) {

                throw new Error("No access_token in response");

            }

            this.token = data.access_token;

            await this.saveState();

            return true;

        }

        catch (err) {

            console.error(err);

            return false;

        }

    },

    // ==================================
    // LOGOUT
    // ==================================

    async logout() {

        await this.clearState();

    },

    // ==================================
    // IS AUTHENTICATED
    // ==================================

    isAuthenticated() {

        return this.token !== "";

    },

    // ==================================
    // GET USER
    // ==================================

    async getUser() {

        const user = await this.request("GET", "/user");

        if (user) {

            this.username = user.login;

            await this.saveState();

        }

        return user;

    },

    // ==================================
    // REPOSITORY EXISTS
    // ==================================

    async repositoryExists(name = this.repository) {

        if (!this.username || !name) {

            return null;

        }

        return this.request(

            "GET",

            `/repos/${this.username}/${name}`

        );

    },


    // ==================================
    // BUILD ROOT README
    // ==================================

    buildRootReadme(name) {

        return `# ${name}\n\n` +
            `> ${this.aboutText}\n\n` +
            `---\n\n` +
            `Every problem is organized in its own folder with the solution file(s) and a README explaining the approach.\n\n` +
            `Synced automatically — no manual commits needed. 🔄\n`;

    },

    // ==================================
    // CREATE REPOSITORY
    // ==================================

    async createRepository(name = "LeetVault", isPrivate = false) {

        const repo = await this.request("POST", "/user/repos", {

            name,
            private: isPrivate,
            description: this.aboutText,
            auto_init: true         // <-- repo turant ek default branch + commit ke saath banega

        });

        if (repo) {

            this.repository = repo.name;
            this.repoUrl = repo.html_url;
            this.defaultBranch = repo.default_branch || "main";
            await this.saveState();

        }

        return repo;

    },

    // ==================================
    // ENSURE REPOSITORY
    // ==================================
    // Checks first, creates only if missing.

    async ensureRepository(name = "LeetVault", isPrivate = false) {

        const existing = await this.repositoryExists(name);

        if (existing) {

            this.repository = existing.name;

            this.repoUrl = existing.html_url;

            this.defaultBranch = existing.default_branch || "main";

            await this.saveState();

            return existing;

        }

        return this.createRepository(name, isPrivate);

    },

    // ==================================
    // GET FILE SHA
    // ==================================
    // GitHub needs the current SHA to update a file.
    // null means the file doesn't exist yet.

    async getFileSHA(path) {

        const data = await this.request(

            "GET",

            `/repos/${this.username}/${this.repository}/contents/${path}`

        );

        return data ? data.sha : null;

    },

    // ==================================
    // GET FILE CONTENT
    // ==================================
    // Returns decoded UTF-8 string or null if not found.

    async getFileContent(path) {

        const data = await this.request(

            "GET",

            `/repos/${this.username}/${this.repository}/contents/${path}`

        );

        if (!data || !data.content) {

            return null;

        }

        try {

            return decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));

        } catch (err) {

            console.error(`Base64 decode error for ${path}:`, err);

            return null;

        }

    },

    // ==================================
    // UPLOAD FILE
    // ==================================
    // { path, content } -> creates or updates the file.

    async uploadFile({ path, content }) {

        const sha = await this.getFileSHA(path);

        const body = {

            message: sha ? `Update ${path}` : `Add ${path}`,

            content: btoa(unescape(encodeURIComponent(content))),

            branch: this.defaultBranch

        };

        if (sha) {

            body.sha = sha;

        }

        return this.request(

            "PUT",

            `/repos/${this.username}/${this.repository}/contents/${path}`,

            body

        );

    },

    // ==================================
    // UPLOAD FILES
    // ==================================

    async uploadFiles(files, onProgress = null) {

        const results = [];

        for (let i = 0; i < files.length; i++) {

            const file = files[i];

            try {

                const res = await this.uploadFile(file);

                results.push({

                    path: file.path,

                    success: true,

                    result: res

                });

            }

            catch (err) {

                results.push({

                    path: file.path,

                    success: false,

                    error: err.message

                });

            }

            if (onProgress) {

                onProgress(i + 1, files.length, file.path);

            }

        }

        return results;

    },



    // ==================================
    // GET BRANCH REF
    // ==================================
    // null agar branch abhi tak exist nahi karti (fresh empty repo)

    async getRef() {

        return this.request(
            "GET",
            `/repos/${this.username}/${this.repository}/git/ref/heads/${this.defaultBranch}`
        );

    },

    // ==================================
    // COMMIT ALL FILES IN ONE GO
    // ==================================
    // files = [{ path, content }, ...]
    // Sabko ek hi commit me daal deta hai.

    async commitFiles(files, message = "Sync files") {

        const ref = await this.getRef();

        let parentSha = null;

        let baseTreeSha = null;

        if (ref) {

            parentSha = ref.object.sha;

            const parentCommit = await this.request(
                "GET",
                `/repos/${this.username}/${this.repository}/git/commits/${parentSha}`
            );

            baseTreeSha = parentCommit.tree.sha;

        }

        // Step 1: Tree banao (saari files ek saath)
        const treeItems = files.map(file => ({

            path: file.path,

            mode: "100644",

            type: "blob",

            content: file.content

        }));

        const newTree = await this.request(
            "POST",
            `/repos/${this.username}/${this.repository}/git/trees`,
            {
                base_tree: baseTreeSha || undefined,
                tree: treeItems
            }
        );

        // Step 2: Commit banao
        const newCommit = await this.request(
            "POST",
            `/repos/${this.username}/${this.repository}/git/commits`,
            {
                message,
                tree: newTree.sha,
                parents: parentSha ? [parentSha] : []
            }
        );

        // Step 3: Branch ko naye commit pe point karo
        if (ref) {

            await this.request(
                "PATCH",
                `/repos/${this.username}/${this.repository}/git/refs/heads/${this.defaultBranch}`,
                { sha: newCommit.sha }
            );

        } else {

            // Branch abhi tak thi hi nahi (fresh empty repo) -> banao
            await this.request(
                "POST",
                `/repos/${this.username}/${this.repository}/git/refs`,
                {
                    ref: `refs/heads/${this.defaultBranch}`,
                    sha: newCommit.sha
                }
            );

        }

        return newCommit;

    },

    // ==================================
    // SYNC (master function)
    // ==================================
    // Sync -> check login -> check repository (create if
    // needed) -> upload files -> return report.

    async sync(files, {

        repoName = "LeetVault",
        isPrivate = false,
        onProgress = null,
        commitMessage = ""

    } = {}) {

        if (!this.isAuthenticated()) {

            return { success: false, error: "Not authenticated. Call Github.login() first." };

        }

        if (!this.username) {

            await this.getUser();

        }

        await this.ensureRepository(repoName, isPrivate);

        if (onProgress) onProgress("Preparing files...");

        let commit;

        try {

            const msg = commitMessage || `HISTORIC SYNC: ${new Date().toISOString()}`;
            commit = await this.commitFiles(
                files,
                msg
            );

        } catch (err) {

            return { success: false, error: err.message };

        }

        if (onProgress) onProgress("Done");

        return {

            success: true,
            repoUrl: this.repoUrl,
            commitUrl: commit.html_url,
            filesCount: files.length

        };

    }

}


