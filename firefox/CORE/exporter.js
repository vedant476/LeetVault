const Exporter = {

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
    // ADD SINGLE FILE
    // ====================================

    add(file) {

        if (!file)
            return;

        this.files.push(file);

    },

    // ====================================
    // ADD MULTIPLE FILES
    // ====================================

    addMany(files) {

        if (!Array.isArray(files))
            return;

        for (const file of files) {

            this.add(file);

        }

    },

    // ====================================
    // BUILD EXPORT
    // ====================================

    build(...groups) {

        this.reset();

        for (const group of groups) {

            this.addMany(group);

        }

        return this.files;

    },

    // ====================================
    // GET FILES
    // ====================================

    getFiles() {

        return this.files;

    },

    // ====================================
    // COUNT
    // ====================================

    count() {

        return this.files.length;

    },

    // ====================================
    // HAS PATH
    // ====================================

    has(path) {

        return this.files.some(

            file => file.path === path

        );

    },

    // ====================================
    // VALIDATE
    // ====================================

    validate() {

        const errors = [];

        const paths = new Set();

        for (const file of this.files) {

            if (!file.path) {

                errors.push("Missing file path");

                continue;

            }

            if (paths.has(file.path)) {

                errors.push(

                    `Duplicate file: ${file.path}`

                );

            }

            paths.add(file.path);

            if (typeof file.content !== "string") {

                errors.push(

                    `Missing content: ${file.path}`

                );

            }

        }

        return {

            valid: errors.length === 0,

            totalFiles: this.files.length,

            errors

        };

    },

    // ====================================
    // STATS
    // ====================================

    stats() {

        let readmes = 0;

        let solutions = 0;

        let others = 0;

        for (const file of this.files) {

            if (file.path.endsWith("README.md")) {

                readmes++;

            }

            else if (file.path.includes("solution")) {

                solutions++;

            }

            else {

                others++;

            }

        }

        return {

            totalFiles: this.files.length,

            readmes,

            solutions,

            others

        };

    }

};