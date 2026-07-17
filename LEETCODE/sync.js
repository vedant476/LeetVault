// ======================================================
// sync.js
// ------------------------------------------------------
// Single job: live sync ON/OFF state rakhna, aur duplicate
// triggers ko rokna. Pipeline chalane ka kaam iska nahi hai
// — wo background.js karega.
// ======================================================

const Sync = {

    // ==================================
    // DATA
    // ==================================

    liveSyncEnabled: true,

    lastTriggeredAt: 0,

    minGapMs: 10000,   // 10 second ke andar dobara trigger na ho

    // ==================================
    // LOAD STATE
    // ==================================

    async loadState() {

        const data = await chrome.storage.local.get("syncState");

        const state = data.syncState;

        if (state) {

            this.liveSyncEnabled = state.liveSyncEnabled ?? true;

        }

        return this;

    },

    // ==================================
    // SAVE STATE
    // ==================================

    async saveState() {

        await chrome.storage.local.set({

            syncState: {

                liveSyncEnabled: this.liveSyncEnabled

            }

        });

    },

    // ==================================
    // ENABLE / DISABLE
    // ==================================

    async enable() {

        this.liveSyncEnabled = true;

        await this.saveState();

    },

    async disable() {

        this.liveSyncEnabled = false;

        await this.saveState();

    },

    // ==================================
    // SHOULD TRIGGER?
    // ==================================
    // Debounce check — bahut jaldi jaldi trigger na ho

    shouldTrigger() {

        if (!this.liveSyncEnabled) {

            return false;

        }

        const now = Date.now();

        if (now - this.lastTriggeredAt < this.minGapMs) {

            return false;

        }

        this.lastTriggeredAt = now;

        return true;

    }

};