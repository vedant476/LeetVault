const Core = {

    // ===================================
    // DATA
    // ===================================

    submissions: [],

    problemGroups: {},

    repository: [],

    

    languageMap: {

    // Compiled / mainstream
    cpp: "solution.cpp",
    java: "Solution.java",
    python: "solution.py",
    python3: "solution.py",
    javascript: "solution.js",
    typescript: "solution.ts",
    c: "solution.c",
    csharp: "Solution.cs",
    golang: "solution.go",
    kotlin: "solution.kt",
    swift: "solution.swift",
    rust: "solution.rs",
    ruby: "solution.rb",
    php: "solution.php",
    dart: "solution.dart",
    scala: "solution.scala",
    elixir: "solution.ex",
    erlang: "solution.erl",
    racket: "solution.rkt",

    // Databases / query languages
    mysql: "solution.sql",
    mssql: "solution.sql",
    oraclesql: "solution.sql",
    postgresql: "solution.sql",

    // Data / scripting
    pandas: "solution.py",
    bash: "solution.sh"

},

    // ===================================
    // LOAD
    // ===================================

    load(json) {

        this.submissions = json;
        this.problemGroups = {};
        this.repository = [];

    },

    // ===================================
    // GROUP PROBLEMS
    // ===================================

    groupProblems() {

        this.problemGroups = {};

        for (const submission of this.submissions) {

            const slug = submission.title_slug;

            if (!this.problemGroups[slug]) {

                this.problemGroups[slug] = {

                    title: submission.title,
                    slug: submission.title_slug,

                    submissions: []

                };

            }

            this.problemGroups[slug].submissions.push(submission);

        }

        return this.problemGroups;

    },

    // ===================================
    // GROUP LANGUAGES
    // ===================================

    groupLanguages() {

        for (const slug in this.problemGroups) {

            const problem = this.problemGroups[slug];

            problem.languages = {};

            for (const submission of problem.submissions) {

                const lang = submission.lang;

                if (!problem.languages[lang]) {

                    problem.languages[lang] = {

                        submissions: [],

                        bestSubmission: null

                    };

                }

                problem.languages[lang]
                    .submissions
                    .push(submission);

            }

        }

    },

    // ===================================
    // BEST SUBMISSIONS
    // ===================================

    selectBestSubmissions() {

        for (const slug in this.problemGroups) {

            const problem = this.problemGroups[slug];

            for (const lang in problem.languages) {

                const bucket =
                    problem.languages[lang];

                bucket.submissions.sort(

                    (a, b) =>

                        Number(b.timestamp) -

                        Number(a.timestamp)

                );

                const accepted =
                    bucket.submissions.find(

                        s =>
                        s.status_display ===
                        "Accepted"

                    );

                bucket.bestSubmission =
                    accepted ||
                    bucket.submissions[0];

            }

        }

    },

    // ===================================
    // PREPARE REPOSITORY
    // ===================================

    prepareRepository() {

        this.repository = [];
        

        for (const slug in this.problemGroups) {

            const problem = this.problemGroups[slug];

            const firstSubmission = problem.submissions[0];

            const repoProblem = {

                title: problem.title,

                slug: problem.slug,
                qid: firstSubmission.question_id,

                files: []

            };

            for (const lang in problem.languages) {

    const bucket =
        problem.languages[lang];

    const sub =
        bucket.bestSubmission;

    let filename =
        this.languageMap[lang] ||
        `solution.${lang}`;

    // Agar ye filename is problem ke andar already use ho chuka hai,
    // to language naam daal ke unique bana do
    const usedNames =
        repoProblem.files.map(f => f.filename);

    if (usedNames.includes(filename)) {

        const dotIndex =
            filename.lastIndexOf(".");

        const base =
            filename.substring(0, dotIndex);

        const ext =
            filename.substring(dotIndex);

        filename =
            `${base}.${lang}${ext}`;

    }

    repoProblem.files.push({

        filename,

        language: lang,

        code: sub.code,

        runtime: sub.runtime,

        memory: sub.memory,

        status: sub.status_display,

        timestamp: sub.timestamp,

        note: sub.note || "",

        id: sub.id || sub.submission_id || ""
        
    });

}

            this.repository.push(repoProblem);
            

        }

    },

    // ===================================
    // GETTERS
    // ===================================

    getRepository() {

        return this.repository;

    },

    getProblemStats() {

        return {

            totalSubmissions:
                this.submissions.length,

            uniqueProblems:
                Object.keys(
                    this.problemGroups
                ).length,

            repositorySize:
                this.repository.length

        };

    }

};