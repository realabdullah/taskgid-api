/**
 * Simple in-memory cache utility
 */
class Cache {
    /**
     * Initialize a new cache instance
     */
    constructor() {
        this.cache = new Map();
        this.ttl = new Map();
    }

    /**
     * Set a value in the cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttlSeconds - Time to live in seconds (default: 300)
     */
    set(key, value, ttlSeconds = 300) {
        this.cache.set(key, value);
        this.ttl.set(key, Date.now() + ttlSeconds * 1000);
    }

    /**
     * Get a value from the cache
     * @param {string} key - Cache key
     * @return {any|null} Cached value or null if not found or expired
     */
    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }

        const expiryTime = this.ttl.get(key);
        if (Date.now() > expiryTime) {
            this.cache.delete(key);
            this.ttl.delete(key);
            return null;
        }

        return this.cache.get(key);
    }

    /**
     * Delete a value from the cache
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
        this.ttl.delete(key);
    }

    /**
     * Clear the entire cache
     */
    clear() {
        this.cache.clear();
        this.ttl.clear();
    }
}

// Create a singleton instance
const cache = new Cache();
export default cache;
