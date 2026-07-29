class TtlCache {
    constructor(defaultTtlMs = 60 * 1000, maxEntries = 500) {
        this.defaultTtlMs = defaultTtlMs;
        this.maxEntries = maxEntries;
        this.store = new Map();
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return undefined;
        }

        if (entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            return undefined;
        }

        return entry.value;
    }

    set(key, value, ttlMs = this.defaultTtlMs) {
        if (this.store.size >= this.maxEntries) {
            const oldestKey = this.store.keys().next().value;
            if (oldestKey !== undefined) {
                this.store.delete(oldestKey);
            }
        }

        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        });

        return value;
    }

    delete(key) {
        this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }
}

module.exports = {
    TtlCache
};
