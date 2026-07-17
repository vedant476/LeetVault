const Generator = {

    // ==================================
    // DATA
    // ==================================

    tree: [],
    generatedFiles: [],

    // ==================================
    // RESET
    // ==================================

    reset() {

        this.tree = [];

    },

    // ==================================
    // VALIDATE REPOSITORY
    // ==================================

    validate(repository) {

        const errors = [];

        repository.forEach((problem, index) => {

            if (!problem.title) {

                errors.push(`Problem ${index + 1}: Missing title`);

            }

            if (!problem.slug) {

                errors.push(`Problem ${index + 1}: Missing slug`);

            }

            if (!problem.qid) {

                errors.push(`${problem.title}: Missing qid`);

            }

            if (!problem.files || problem.files.length === 0) {

                errors.push(`${problem.title}: No solution files`);

                return;

            }

            problem.files.forEach(file => {

                if (!file.filename) {

                    errors.push(`${problem.title}: Missing filename`);

                }

                if (!file.language) {

                    errors.push(`${problem.title}: Missing language`);

                }

                if (!file.code) {

                    errors.push(`${problem.title}: Missing code`);

                }

            });

        });

        return {

            valid: errors.length === 0,

            totalProblems: repository.length,

            errors

        };

    },

    // ==================================
    // BUILD FOLDER NAME
    // ==================================
buildFolderName(problem) {

    const qid = String(problem.qid).padStart(4, "0");

    return `${qid}-${problem.slug}`;

},

    // ==================================
    // BUILD TREE
    // ==================================

    build(repository) {

        this.reset();

        for (const problem of repository) {

            const folder = {

                name: this.buildFolderName(problem),

                title: problem.title,

                slug: problem.slug,

                qid: problem.qid,

                files: []

            };

            for (const file of problem.files) {

                folder.files.push({

                    name: file.filename,

                    language: file.language,

                    content: file.code,

                    runtime: file.runtime,

                    memory: file.memory,

                    status: file.status,

                    timestamp: file.timestamp

                });

            }

            this.tree.push(folder);

        }

    },

    // ==================================
    // GET TREE
    // ==================================

    getTree() {

        return this.tree;

    },

    // ==================================
    // PREVIEW
    // ==================================

    preview() {

        return this.tree.map(folder => ({

            folder: folder.name,

            qid: folder.qid,

            files: folder.files.length

        }));

    },


    // ==================================
    // FILE GENRATOR
    // ==================================
    generateSolutionFiles() {

    this.generatedFiles = [];

    for (const folder of this.tree) {

        for (const file of folder.files) {

            this.generatedFiles.push({

                path: `${folder.name}/${file.name}`,

                content: file.content,

                language: file.language

            });

        }

    }

},

getGeneratedFiles() {

    return this.generatedFiles;

},


generateProblemMetadata() {

    for (const folder of this.tree) {

        const metadata = {

            qid: folder.qid,

            title: folder.title,

            slug: folder.slug,

            languages: folder.files.map(

                file => file.language

            ),

            totalSolutions: folder.files.length

        };

        this.generatedFiles.push({

            path: `${folder.name}/metadata.json`,

            content: JSON.stringify(
                metadata,
                null,
                4
            ),

            language: "json"

        });

    }

},

    // ==================================
    // STATS
    // ==================================

    stats() {

        const languages = {};

        let totalFiles = 0;

        for (const folder of this.tree) {

            totalFiles += folder.files.length;

            for (const file of folder.files) {

                languages[file.language] =
                    (languages[file.language] || 0) + 1;

            }

        }

        return {

            folders: this.tree.length,

            files: totalFiles,

            languages

        };

    }

};