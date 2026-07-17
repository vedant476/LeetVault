const Metadata = {

    // ====================================
    // DATA
    // ====================================

    cache: {},

    endpoint: "https://leetcode.com/graphql",

    // ====================================
    // RESET
    // ====================================

    reset() {

        this.cache = {};

    },

    // ====================================
    // FETCH ONE QUESTION (single problem, on-demand)
    // ====================================

    async fetchQuestion(titleSlug, session = "", csrfToken = "") {

        if (!titleSlug)
            return null;

        // Already fetched
        if (this.has(titleSlug)) {

            return this.get(titleSlug);

        }

        const query = `
        query getQuestion($titleSlug: String!) {

            question(titleSlug: $titleSlug) {

                questionId

                title

                titleSlug

                difficulty

                topicTags {

                    name
                    slug

                }

                likes

                dislikes

                isPaidOnly

            }

        }`;

        try {

            const res = await fetch(this.endpoint, {

                method: "POST",

                headers: {

                    "Content-Type": "application/json",

                    ...(session && {

                        Cookie:
                        `LEETCODE_SESSION=${session}; csrftoken=${csrfToken}`,

                        "X-CSRFToken":
                        csrfToken

                    })

                },

                body: JSON.stringify({

                    query,

                    variables: {

                        titleSlug

                    }

                })

            });

            const { data } =
                await res.json();

            if (!data?.question)
                return null;

            this.cache[titleSlug] =
                data.question;

            await this.saveCache();

            return data.question;

        }

        catch (err) {

            console.error(err);

            return null;

        }

    },

    // ====================================
    // FETCH ENTIRE REPOSITORY (sequential, per-problem)
    // ====================================
    // Kept for cases where only a handful of specific
    // problems need metadata (e.g. live sync single problem).
    // For historical bulk sync, use mergeBulk() instead —
    // it's a single paginated fetch, not one call per problem.

    async fetchQuestions(repository, session = "", csrfToken = "") {

        for (const problem of repository) {

            const metadata =
                await this.fetchQuestion(

                    problem.slug,

                    session,

                    csrfToken

                );

            if (metadata) {

                this.mergeQuestion(
                    problem,
                    metadata
                );

            }

        }

        return repository;

    },

    // ====================================
    // MERGE ONE QUESTION
    // ====================================

    mergeQuestion(problem, metadata) {

        if (!problem || !metadata)
            return problem;

        problem.questionId =
            metadata.questionId;

        problem.url =
            `https://leetcode.com/problems/${problem.slug}/`;

        problem.difficulty =
            metadata.difficulty;

        problem.tags =
            metadata.topicTags || [];

        problem.likes =
            metadata.likes;

        problem.dislikes =
            metadata.dislikes;

        problem.paidOnly =
            metadata.isPaidOnly;

        return problem;

    },

    // ====================================
    // MERGE ENTIRE REPOSITORY (from cache only, no fetch)
    // ====================================

    mergeRepository(repository) {

        for (const problem of repository) {

            const metadata =
                this.cache[problem.slug];

            if (!metadata)
                continue;

            this.mergeQuestion(
                problem,
                metadata
            );

        }

        return repository;

    },

    // ====================================
    // FETCH ALL PROBLEMS (difficulty + tags, paginated bulk)
    // ====================================
    // Single source of truth for ALL LeetCode problems.
    // ~3985 problems / 100 per page = ~40 GraphQL calls total,
    // done ONCE, then cached. No per-problem calls needed after.

    async fetchAllProblemsWithTags() {

        const pageSize = 100;

        let skip = 0;

        let total = Infinity;

        const lookup = {};

        while (skip < total) {

            const query = {

                query: `
                query problemsetQuestionList($skip: Int!, $limit: Int!) {
                    problemsetQuestionList: questionList(
                        categorySlug: ""
                        limit: $limit
                        skip: $skip
                        filters: {}
                    ) {
                        total: totalNum
                        questions: data {
                            questionId
                            title
                            titleSlug
                            difficulty
                            isPaidOnly
                            topicTags {
                                name
                                slug
                            }
                        }
                    }
                }`,

                variables: { skip, limit: pageSize },

                operationName: "problemsetQuestionList"

            };

            let res;
            let success = false;
            let attempt = 0;
            const maxAttempts = 5;

            while (attempt < maxAttempts) {
                try {
                    // Impose a small delay between paginated GraphQL bulk calls to stay within rate limits
                    await new Promise(r => setTimeout(r, 1200));

                    res = await fetch("https://leetcode.com/graphql/", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(query)
                    });

                    if (res.status === 403 || res.status === 429) {
                        console.warn(`Bulk fetch rate limit hit (HTTP ${res.status}). Retrying in 15s (attempt ${attempt + 1}/${maxAttempts})...`);
                        await new Promise(r => setTimeout(r, 15000));
                        attempt++;
                        continue;
                    }

                    if (!res.ok) {
                        throw new Error(`GraphQL HTTP ${res.status}`);
                    }

                    success = true;
                    break;
                } catch (err) {
                    console.error(`Bulk fetch attempt ${attempt + 1} failed for skip=${skip}:`, err.message);
                    attempt++;
                    if (attempt >= maxAttempts) throw err;
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            if (!success || !res) {
                throw new Error(`Bulk fetch failed at offset ${skip} after ${maxAttempts} attempts.`);
            }

            const json = await res.json();

            const data = json?.data?.problemsetQuestionList;

            if (!data) {

                break;

            }

            total = data.total;

            for (const q of data.questions) {

                lookup[q.titleSlug] = {

                    questionId: q.questionId,
                    difficulty: q.difficulty,
                    paidOnly: q.isPaidOnly,
                    tags: q.topicTags || []

                };

            }

            skip += pageSize;

        }

        return lookup;

    },

    // ====================================
    // ENSURE BULK CACHE (fetch only if empty)
    // ====================================

    async ensureBulkCache() {

        await this.loadCache();

        const cachedCount = Object.keys(this.cache).length;

        // Agar cache me kuch bhi hai, use maano complete hai
        // (fetchAllProblemsWithTags hamesha sab kuch ek saath
        // fetch karta hai, koi partial state nahi bachta)
        if (cachedCount > 0) {

            return;

        }

        const lookup = await this.fetchAllProblemsWithTags();

        this.cache = lookup;

        await this.saveCache();

    },

    // ====================================
    // MERGE DIFFICULTY + TAGS (bulk, no per-problem calls)
    // ====================================

    async mergeBulk(repository) {

        await this.ensureBulkCache();

        for (const problem of repository) {

            const data = this.cache[problem.slug];

            if (data) {

                problem.questionId = data.questionId;
                problem.difficulty = data.difficulty;
                problem.paidOnly = data.paidOnly;
                problem.tags = data.tags;
                problem.url = `https://leetcode.com/problems/${problem.slug}/`;

            }

        }

        return repository;

    },

    // ====================================
    // GET ONE
    // ====================================

    get(slug) {

        return this.cache[slug] || null;

    },

    // ====================================
    // GET ALL
    // ====================================

    getAll() {

        return this.cache;

    },

    // ====================================
    // SAVE CACHE
    // ====================================

    async saveCache() {

        await chrome.storage.local.set({

            metadataCache: this.cache

        });

    },

    // ====================================
    // LOAD CACHE
    // ====================================

    async loadCache() {

        const data =
            await chrome.storage.local.get(
                "metadataCache"
            );

        this.cache =
            data.metadataCache || {};

        return this.cache;

    },

    // ====================================
    // CLEAR CACHE
    // ====================================

    async clearCache() {

        this.cache = {};

        await chrome.storage.local.remove(
            "metadataCache"
        );

    },

    // ====================================
    // HAS
    // ====================================

    has(slug) {

        return Object.prototype.hasOwnProperty.call(
            this.cache,
            slug
        );

    },

    // ====================================
    // REMOVE
    // ====================================

    async remove(slug) {

        if (!this.has(slug))
            return false;

        delete this.cache[slug];

        await this.saveCache();

        return true;

    },

    // ====================================
    // GET STATS
    // ====================================

    getStats() {

        let paid = 0;

        let free = 0;

        let easy = 0;

        let medium = 0;

        let hard = 0;

        for (const slug in this.cache) {

            const item = this.cache[slug];

            if (item.paidOnly || item.isPaidOnly)
                paid++;
            else
                free++;

            switch ((item.difficulty || "").toLowerCase()) {

                case "easy":
                    easy++;
                    break;

                case "medium":
                    medium++;
                    break;

                case "hard":
                    hard++;
                    break;
            }

        }

        return {

            cached: Object.keys(this.cache).length,

            easy,

            medium,

            hard,

            free,

            paid

        };

    },

    // ====================================
    // FORMAT
    // ====================================

    format(metadata) {

        if (!metadata)
            return null;

        return {

            questionId:
                metadata.questionId,

            title:
                metadata.title,

            slug:
                metadata.titleSlug,

            difficulty:
                metadata.difficulty,

            difficultyEmoji:
                this.formatDifficulty(
                    metadata.difficulty
                ),

            likes:
                metadata.likes,

            dislikes:
                metadata.dislikes,

            paidOnly:
                metadata.isPaidOnly,

            tags:
                (metadata.topicTags || []).map(
                    tag => tag.name
                )

        };

    },

    // ====================================
    // FORMAT DIFFICULTY
    // ====================================

    formatDifficulty(difficulty) {

        switch ((difficulty || "").toLowerCase()) {

            case "easy":
                return "🟢 Easy";

            case "medium":
                return "🟡 Medium";

            case "hard":
                return "🔴 Hard";

            default:
                return "⚪ Unknown";

        }

    }

};