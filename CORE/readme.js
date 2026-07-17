const Readme = {

    // ====================================
    // DATA
    // ====================================

    files: [],

    // ====================================
    // RESET
    // ====================================

    reset() {

        this.files = [];

    },

    // ====================================
    // FORMAT DIFFICULTY
    // ====================================

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

    },

    // ====================================
    // FORMAT LANGUAGE (display name)
    // ====================================

    languageNames: {

        cpp: "C++",
        java: "Java",
        python: "Python",
        python3: "Python3",
        javascript: "JavaScript",
        typescript: "TypeScript",
        c: "C",
        csharp: "C#",
        golang: "Go",
        kotlin: "Kotlin",
        swift: "Swift",
        rust: "Rust",
        ruby: "Ruby",
        php: "PHP",
        dart: "Dart",
        scala: "Scala",
        elixir: "Elixir",
        erlang: "Erlang",
        racket: "Racket",
        mysql: "MySQL",
        mssql: "MS SQL Server",
        oraclesql: "Oracle SQL",
        postgresql: "PostgreSQL",
        pandas: "Pandas",
        bash: "Bash"

    },

    formatLanguage(lang) {

        return this.languageNames[lang] || lang;

    },

    // ====================================
    // FORMAT STATUS
    // ====================================

    formatStatus(status) {

        if (!status) {

            return "❓ Unknown";

        }

        return status === "Accepted" ?
            "✅ Accepted" :
            `❌ ${status}`;

    },

    // ====================================
    // FORMAT DATE  (e.g. "26 Jun 2026")
    // ====================================

    formatDate(timestamp) {

        if (!timestamp) {

            return "-";

        }

        const date = new Date(Number(timestamp) * 1000);

        if (isNaN(date.getTime())) {

            return "-";

        }

        const day = String(date.getDate()).padStart(2, "0");

        const month = date.toLocaleString("en-US", {
            month: "short"
        });

        const year = date.getFullYear();

        return `${day} ${month} ${year}`;

    },



    // ====================================
    // FOLDER NAME (must match Generator)
    // ====================================

    folderName(problem) {

        const qid = String(problem.qid).padStart(4, "0");

        return `${qid}-${problem.slug}`;

    },

    // ====================================
    // COMPUTE STATS
    // ====================================

    computeStats(repository) {

        const languages = new Set();

        let easy = 0,
            medium = 0,
            hard = 0;

        for (const problem of repository) {

            switch ((problem.difficulty || "").toLowerCase()) {

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

            for (const file of problem.files) {

                languages.add(this.formatLanguage(file.language));

            }

        }

        return {

            total: repository.length,
            easy,
            medium,
            hard,
            languages: [...languages].sort(),
            lastSync: this.formatDate(Math.floor(Date.now() / 1000))

        };

    },

    // ====================================
    // GROUP BY TOPIC
    // ====================================

    groupByTopic(repository) {

        const topics = {};

        for (const problem of repository) {

            const tags = (problem.tags && problem.tags.length) ?
                problem.tags :
                [{
                    name: "Uncategorized"
                }];

            for (const tag of tags) {

                if (!topics[tag.name]) {

                    topics[tag.name] = [];

                }

                topics[tag.name].push(problem);

            }

        }

        return topics;

    },

    // ====================================
    // ROOT HEADER + BADGES
    // ====================================

    buildRootHeader() {

        return "# 🚀 LeetCode Solutions\n\n> Automatically synchronized using **LeetVault**\n\n";

    },

    buildBadges(stats) {

        let md = "";

        md += `[![Problems](https://img.shields.io/badge/Problems-${stats.total}-blue)]()\n`;
        md += `[![Easy](https://img.shields.io/badge/Easy-${stats.easy}-success)]()\n`;
        md += `[![Medium](https://img.shields.io/badge/Medium-${stats.medium}-orange)]()\n`;
        md += `[![Hard](https://img.shields.io/badge/Hard-${stats.hard}-red)]()\n`;
        md += `[![Languages](https://img.shields.io/badge/Languages-${stats.languages.length}-blueviolet)]()\n\n`;

        md += "---\n\n";

        return md;

    },

    // ====================================
    // STATISTICS TABLE
    // ====================================

    buildStatsTable(stats) {

        let md = "";

        md += "# 📊 Statistics\n\n";
        md += "| Metric | Count |\n";
        md += "|---------|------:|\n";
        md += `| Problems Solved | ${stats.total} |\n`;
        md += `| Easy | ${stats.easy} |\n`;
        md += `| Medium | ${stats.medium} |\n`;
        md += `| Hard | ${stats.hard} |\n`;
        md += `| Languages | ${stats.languages.join(", ")} |\n`;
        md += `| Last Sync | ${stats.lastSync} |\n\n`;

        md += "---\n\n";

        return md;

    },

    // ====================================
    // BROWSE BY TOPIC
    // ====================================

    buildTopicSections(repository) {

        const topics = this.groupByTopic(repository);

        const topicNames = Object.keys(topics).sort();

        let md = "# 📂 Browse by Topic\n\n";

        for (const topicName of topicNames) {

            const problems = topics[topicName];

            md += `## ${topicName} (${problems.length})\n\n`;

            md += "| # | Problem | Difficulty | Solution |\n";
            md += "|---|---------|------------|----------|\n";

            for (const problem of problems) {

                const folder = this.folderName(problem);

                const qid = String(problem.qid).padStart(4, "0");

                md += `| ${qid} | ${problem.title} | ${this.formatDifficulty(problem.difficulty)} | [View](./${folder}/) |\n`;

            }

            md += "\n---\n\n";

        }

        return md;

    },

    // ====================================
    // RECENTLY SOLVED
    // ====================================

    buildRecentlySolved(repository, limit = 10) {

        const entries = repository.map(problem => {

            const latestFile = problem.files.reduce((a, b) =>

                Number(b.timestamp) > Number(a.timestamp) ? b : a

            );

            return {
                problem,
                file: latestFile
            };

        });

        entries.sort((a, b) => Number(b.file.timestamp) - Number(a.file.timestamp));

        const recent = entries.slice(0, limit);

        let md = "# 🔥 Recently Solved\n\n";

        md += "| Date | Problem | Difficulty | Language |\n";
        md += "|------|----------|------------|----------|\n";

        for (const entry of recent) {

            md += `| ${this.formatDate(entry.file.timestamp)} | ${entry.problem.title} | ${this.formatDifficulty(entry.problem.difficulty)} | ${this.formatLanguage(entry.file.language)} |\n`;

        }

        md += "\n---\n\n";

        return md;

    },

    // ====================================
    // FEATURES
    // ====================================

    buildFeaturesList() {

        return "# ⚡ Features\n\n" +
            "- Historical Import\n" +
            "- Live Sync\n" +
            "- Duplicate Resolution\n" +
            "- Multi-language Support\n" +
            "- Automatic README Generation\n" +
            "- Automatic Statistics\n" +
            "- Topic Classification\n\n" +
            "---\n\n";

    },

    // ====================================
    // BUILD ROOT README
    // ====================================

    buildRoot(repository) {

        const stats = this.computeStats(repository);

        let md = "";

        md += this.buildRootHeader();
        md += this.buildBadges(stats);
        md += this.buildStatsTable(stats);
        md += this.buildTopicSections(repository);
        md += this.buildRecentlySolved(repository);
        md += this.buildFeaturesList();
        md += this.buildFooter();

        return md;

    },

    // ====================================
    // ADD ROOT README TO FILES
    // ====================================

    addRoot(repository) {

        this.files.push({

            path: "README.md",
            content: this.buildRoot(repository)

        });

        return this.files;

    },

    // ====================================
    // HEADER
    // ====================================

    buildHeader(problem) {

        const qid = String(problem.qid).padStart(4, "0");

        return `# ${qid}. ${problem.title}\n\n`;

    },

    // ====================================
    // INFO TABLE  (primary / most recent submission)
    // ====================================

    buildInfoTable(problem) {

        const primary = problem.files[0];

        let md = "";

        md += "| Property | Value |\n";

        md += "|----------|-------|\n";

        md += `| Difficulty | ${this.formatDifficulty(problem.difficulty)} |\n`;

        md += `| Language | ${this.formatLanguage(primary.language)} |\n`;

        md += `| Status | ${this.formatStatus(primary.status)} |\n`;

        md += `| Runtime | ${primary.runtime || "N/A"} |\n`;

        md += `| Memory | ${primary.memory || "N/A"} |\n`;

        md += `| Submission ID | ${primary.id || "N/A"} |\n`;

        md += `| Solved On | ${this.formatDate(primary.timestamp)} |\n`;

        md += "\n---\n\n";

        return md;

    },

    // ====================================
    // PROBLEM LINK
    // ====================================

    buildProblemLink(problem) {

        let md = "";

        md += "## 🔗 Problem\n\n";

        md += `${problem.url || `https://leetcode.com/problems/${problem.slug}/`}\n\n`;

        md += "---\n\n";

        return md;

    },

    // ====================================
    // TAGS
    // ====================================

    buildTags(problem) {

        let md = "";

        md += "## 🏷 Tags\n\n";

        if (!problem.tags || problem.tags.length === 0) {

            md += "- None\n\n";

        } else {

            for (const tag of problem.tags) {

                md += `- ${tag.name}\n`;

            }

            md += "\n";

        }

        md += "---\n\n";

        return md;

    },


    // ====================================
    // NOTES
    // ====================================

    buildNotes(problem) {

        const primary = problem.files[0];

        let md = "";

        md += "## 📝 Notes\n\n";

        const note = primary.note ?
            primary.note.trim() :
            "";

        md += note ? `${note}\n\n` : "No notes provided.\n\n";

        md += "---\n\n";

        return md;

    },

    // ====================================
    // FILES TABLE (all languages/solutions)
    // ====================================

    buildFilesTable(problem) {

        let md = "";

        md += "## 📁 Files\n\n";

        md += "| Language | Runtime | Memory | File |\n";

        md += "|----------|---------|--------|------|\n";

        for (const file of problem.files) {

            const fileName = file.filename || file.name || "solution";

            md += `| ${this.formatLanguage(file.language)} | ${file.runtime || "N/A"} | ${file.memory || "N/A"} | [${fileName}](./${fileName}) |\n`;

        }

        md += "\n---\n";

        return md;

    },

    // ====================================
    // FOOTER
    // ====================================

    buildFooter() {

        return "Generated automatically using [LeetVault](https://github.com/vedant476/LeetVault).\n";

    },

    // ====================================
    // BUILD ONE README
    // ====================================

    buildProblem(problem) {

        let md = "";

        md += this.buildHeader(problem);

        md += this.buildInfoTable(problem);

        md += this.buildProblemLink(problem);

        md += this.buildTags(problem);

        md += this.buildNotes(problem);

        md += this.buildFilesTable(problem);

        md += this.buildFooter();

        return md;

    },

    // ====================================
    // BUILD ALL README FILES
    // ====================================


    build(repository) {

        this.reset();

        for (const problem of repository) {

            this.files.push({

                path: `${Generator.buildFolderName(problem)}/README.md`,

                content: this.buildProblem(problem)

            });

        }

        return this.files;

    },

    // ====================================
    // GET GENERATED FILES
    // ====================================

    getFiles() {

        return this.files;

    },



};