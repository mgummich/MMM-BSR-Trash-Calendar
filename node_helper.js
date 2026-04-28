/**
 * node_helper.js — Node_Helper for MMM-BSR-Trash-Calendar
 *
 * Handles BSR API communication, caching, retry logic, and socket notifications.
 * Must use CommonJS (require/module.exports) because MagicMirror² requires it,
 * even though the rest of the project uses ESM ("type": "module" in package.json).
 *
 * Utils (ESM) are loaded via dynamic import() in start().
 */

"use strict";

const NodeHelper = require("node_helper");
const path = require("path");

const CACHE_PATH = path.join(__dirname, "cache.json");

module.exports = NodeHelper.create({
  // ---------------------------------------------------------------------------
  // State variables (design.md §2 Backend)
  // ---------------------------------------------------------------------------

  /** @type {boolean} Concurrency Guard — prevents parallel API calls */
  requestLock: false,

  /** @type {number} Current retry counter (0 = no retry active) */
  retryCount: 0,

  /** @type {ReturnType<typeof setTimeout>|null} Active retry timer */
  retryTimer: null,

  /** @type {ReturnType<typeof setTimeout>|null} Active regular update timer */
  updateTimer: null,

  /** @type {boolean} Whether a retry cycle is currently active */
  isRetrying: false,

  /** @type {object|null} Current module configuration */
  config: null,

  /** @type {string|null} Resolved address key */
  addressKey: null,

  /** @type {Array|null} Last successfully fetched pickup dates */
  currentData: null,

  /** @type {object|null} Lazily loaded utils module (ESM, loaded via dynamic import) */
  _utils: null,

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Called when the helper starts. Initialises state and pre-loads utils.
   */
  start() {
    this.requestLock = false;
    this.retryCount = 0;
    this.retryTimer = null;
    this.updateTimer = null;
    this.isRetrying = false;
    this.config = null;
    this.addressKey = null;
    this.currentData = null;
    this._utils = null;

    // Pre-load the ESM utils module so it is ready when the first notification arrives.
    import("./utils.js")
      .then((utils) => {
        this._utils = utils;
      })
      .catch((err) => {
        console.error("[MMM-BSR-Trash-Calendar] Failed to load utils.js:", err);
      });
  },

  // ---------------------------------------------------------------------------
  // Socket notifications
  // ---------------------------------------------------------------------------

  /**
   * Handles incoming socket notifications from the frontend.
   * @param {string} notification
   * @param {object} payload
   */
  async socketNotificationReceived(notification, payload) {
    if (notification !== "BSR_INIT_MODULE") {
      return;
    }

    // Ensure utils are loaded (lazy fallback in case start() import hasn't resolved yet)
    if (!this._utils) {
      try {
        this._utils = await import("./utils.js");
      } catch (err) {
        console.error("[MMM-BSR-Trash-Calendar] Cannot load utils.js:", err);
        this.sendSocketNotification("BSR_ERROR", {
          message: "Internal error: utils not available",
          type: "CONFIG_ERROR",
        });
        return;
      }
    }

    const { validateConfig } = this._utils;

    // 1. Validate configuration
    const validation = validateConfig(payload);
    if (validation.error) {
      this.sendSocketNotification("BSR_ERROR", {
        message: validation.error,
        type: "CONFIG_ERROR",
      });
      return;
    }

    this.config = validation.config;

    // 2. Concurrency Guard — ignore if a fetch cycle is already running
    if (this.requestLock) {
      return;
    }
    this.requestLock = true;

    try {
      await this._fetchAndUpdate();
    } finally {
      this.requestLock = false;
    }
  },

  // ---------------------------------------------------------------------------
  // Core data-fetch cycle
  // ---------------------------------------------------------------------------

  /**
   * Main data-fetch cycle: load cache, resolve address if needed, fetch dates.
   * Called on init and on each retry/update tick.
   */
  async _fetchAndUpdate() {
    const { isCacheValid, isCacheAddressMatch } = this._utils;

    // 3. Load cache
    const cache = this.loadCache();

    if (cache && isCacheAddressMatch(cache, this.config)) {
      // Cache exists and address matches → send cached data immediately
      this.addressKey = cache.addressKey;
      this.currentData = cache.pickupDates;
      this.sendSocketNotification("BSR_PICKUP_DATA", { dates: cache.pickupDates });

      // If cache is still valid → schedule next update and stop
      if (isCacheValid(cache, this.config, Date.now(), this.config.updateInterval)) {
        this.scheduleUpdate(this.config.updateInterval);
        return;
      }
      // Otherwise fall through to refresh
    } else if (cache && !isCacheAddressMatch(cache, this.config)) {
      // Address changed → discard cache, re-resolve
      this.addressKey = null;
      this.currentData = null;
    }

    // 4. Resolve address if we don't have one yet
    if (!this.addressKey) {
      let key;
      try {
        key = await this.resolveAddress(this.config.street, this.config.houseNumber);
      } catch (err) {
        this.handleApiError(err);
        return;
      }

      if (!key) {
        this.sendSocketNotification("BSR_ERROR", {
          message: "Adresse nicht gefunden",
          type: "ADDRESS_NOT_FOUND",
        });
        return;
      }

      this.addressKey = key;
    }

    // 5. Fetch pickup dates for current + next month
    let dates;
    try {
      dates = await this.fetchPickupDates(this.addressKey);
    } catch (err) {
      this.handleApiError(err);
      return;
    }

    // 6. Success
    this.handleApiSuccess(dates);
  },

  // ---------------------------------------------------------------------------
  // API methods
  // ---------------------------------------------------------------------------

  /**
   * Resolves a street address to a BSR address key.
   * @param {string} street
   * @param {string} houseNumber
   * @returns {Promise<string|null>} Address key, or null if not found
   */
  async resolveAddress(street, houseNumber) {
    const { resolveBsrAddress } = await import("./providers/bsr.js");
    return resolveBsrAddress(this.executeApiCall.bind(this), street, houseNumber);
  },

  /**
   * Fetches pickup dates for the current and next month sequentially.
   * @param {string} addressKey
   * @returns {Promise<Array>} Combined, parsed pickup dates
   */
  async fetchPickupDates(addressKey) {
    const { fetchBsrPickupDates } = await import("./providers/bsr.js");
    return fetchBsrPickupDates(this.executeApiCall.bind(this), this._utils, addressKey);
  },

  /**
   * Executes a single HTTP GET with a 30-second timeout.
   * @param {string} url
   * @returns {Promise<object>} Parsed JSON response
   */
  async executeApiCall(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // node-fetch is an ESM-only package in v3; use dynamic import
      const { default: fetch } = await import("node-fetch");
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") {
        const timeoutErr = new Error("API request timed out after 30s");
        timeoutErr.type = "API_TIMEOUT";
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // ---------------------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------------------

  /**
   * Loads the cache file. Returns null on any error.
   * @returns {object|null}
   */
  loadCache() {
    const { loadCache } = this._utils;
    return loadCache(CACHE_PATH);
  },

  /**
   * Saves data to the cache file as JSON.
   * @param {object} data
   */
  saveCache(data) {
    const { saveCache } = this._utils;
    saveCache(CACHE_PATH, data);
  },

  // ---------------------------------------------------------------------------
  // Success / error handlers
  // ---------------------------------------------------------------------------

  /**
   * Called on successful data fetch.
   * Resets retry state, saves cache, sends data to frontend, schedules next update.
   * @param {Array} dates
   */
  handleApiSuccess(dates) {
    this.retryCount = 0;
    this.isRetrying = false;

    // Clear any pending retry timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.currentData = dates;

    // Persist to cache
    this.saveCache({
      street: this.config.street,
      houseNumber: this.config.houseNumber,
      addressKey: this.addressKey,
      pickupDates: dates,
      lastFetchTimestamp: Date.now(),
    });

    // Notify frontend
    this.sendSocketNotification("BSR_PICKUP_DATA", { dates });

    // Restart regular update interval
    this.scheduleUpdate(this.config.updateInterval);
  },

  /**
   * Called on API error. Starts retry cycle, cancels regular interval, keeps cached data.
   * @param {Error} error
   */
  handleApiError(error) {
    this.isRetrying = true;

    // Cancel regular update timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    const delay = this._utils.calculateRetryDelay(this.retryCount);
    this.retryCount++;

    // If we have cached data, keep showing it; otherwise send an error
    if (this.currentData) {
      this.sendSocketNotification("BSR_PICKUP_DATA", { dates: this.currentData });
    } else {
      this.sendSocketNotification("BSR_ERROR", {
        message: error.message || "API nicht erreichbar",
        type: error.type || "API_UNREACHABLE",
      });
    }

    this.scheduleRetry(delay);
  },

  // ---------------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------------

  /**
   * Schedules the next regular update. Does nothing if a retry cycle is active.
   * @param {number} interval - Delay in milliseconds
   */
  scheduleUpdate(interval) {
    if (this.isRetrying) {
      return;
    }

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(async () => {
      this.updateTimer = null;
      if (this.requestLock) {
        return;
      }
      this.requestLock = true;
      try {
        await this._fetchAndUpdate();
      } finally {
        this.requestLock = false;
      }
    }, interval);
  },

  /**
   * Schedules the next retry attempt with the given delay.
   * @param {number} delay - Delay in milliseconds (from calculateRetryDelay)
   */
  scheduleRetry(delay) {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.requestLock) {
        return;
      }
      this.requestLock = true;
      try {
        await this._fetchAndUpdate();
      } finally {
        this.requestLock = false;
      }
    }, delay);
  },
});
