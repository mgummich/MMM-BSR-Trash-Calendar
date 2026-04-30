/**
 * node_helper.js — Node_Helper for MMM-BSR-Trash-Calendar
 *
 * Handles BSR API communication, caching, retry logic, and socket notifications.
 * Must use CommonJS (require/module.exports) because MagicMirror² requires it.
 */

"use strict";

const NodeHelper = require("node_helper");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const utils = require("./utils.js");
const { resolveBsrAddress, fetchBsrPickupDates } = require("./providers/bsr.js");
const { fetchBerlinRecyclingPortalDates } = require("./providers/berlinRecyclingPortal.js");
const { fetchBerlinRecyclingPublicDates } = require("./providers/berlinRecyclingPublic.js");
const { mergeProviderDates } = require("./providers/merge.js");

const CACHE_PATH = path.join(__dirname, "cache.json");
const ICONS_DIR = path.join(__dirname, "icons");

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

  log(message) {
    console.log(`[MMM-BSR-Trash-Calendar] ${message}`);
  },

  debug(message) {
    if (this.config?.debug) {
      this.log(`DEBUG ${message}`);
    }
  },

  warn(message) {
    console.warn(`[MMM-BSR-Trash-Calendar] ${message}`);
  },

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

    this.log("Node helper started");
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

    const { validateConfig } = utils;

    // 1. Validate configuration
    const validation = validateConfig(payload);
    if (validation.error) {
      this.warn(`Configuration error: ${validation.error}`);
      this.sendSocketNotification("BSR_ERROR", {
        message: validation.error,
        type: "CONFIG_ERROR",
      });
      return;
    }

    this.config = validation.config;
    this.debug(
      `Config accepted: addressKey=${this.config.addressKey ? "yes" : "no"}, ` +
        `street=${this.config.street || "-"}, maxEntries=${this.config.maxEntries}, ` +
        `categories=${this.config.categories.join(",")}, ` +
        `berlinRecycling=${this.config.berlinRecycling.enabled ? "enabled" : "disabled"}`
    );

    // 2. Concurrency Guard — ignore if a fetch cycle is already running
    if (this.requestLock) {
      this.debug("Fetch already running; ignoring duplicate init/update request");
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
    const { isCacheValid, isCacheAddressMatch } = utils;
    this.debug("Fetch cycle started");

    // 3. Load cache
    const cache = this.loadCache();

    if (cache && isCacheAddressMatch(cache, this.config)) {
      this.debug(`Cache hit for current address with ${cache.pickupDates.length} dates`);
      // Cache exists and address matches → send cached data immediately
      this.addressKey = cache.addressKey;
      this.currentData = cache.pickupDates;
      this.sendSocketNotification("BSR_PICKUP_DATA", { dates: cache.pickupDates });

      // If cache is still valid → schedule next update and stop
      if (isCacheValid(cache, this.config, Date.now(), this.config.updateInterval)) {
        this.debug("Cache valid; using cached data and scheduling next update");
        this.scheduleUpdate(this.config.updateInterval);
        return;
      }
      this.debug("Cache stale; refreshing provider data");
      // Otherwise fall through to refresh
    } else if (cache && !isCacheAddressMatch(cache, this.config)) {
      this.debug("Cache address mismatch; discarding cached address/data");
      // Address changed → discard cache, re-resolve
      this.addressKey = null;
      this.currentData = null;
    } else {
      this.debug("No cache available");
    }

    // 4. Resolve address if we don't have one yet
    if (!this.addressKey) {
      // Use directly configured addressKey if provided, skip API lookup
      if (this.config.addressKey) {
        this.debug("Using configured BSR addressKey; skipping address lookup");
        this.addressKey = this.config.addressKey;
      } else {
        let key;
        try {
          this.debug(`Resolving BSR address for ${this.config.street} ${this.config.houseNumber}`);
          key = await this.resolveAddress(this.config.street, this.config.houseNumber);
        } catch (err) {
          this.handleApiError(err);
          return;
        }

        if (!key) {
          this.warn(`BSR address not found for ${this.config.street} ${this.config.houseNumber}`);
          this.sendSocketNotification("BSR_ERROR", {
            message: "Adresse nicht gefunden",
            type: "ADDRESS_NOT_FOUND",
          });
          return;
        }

        this.addressKey = key;
        this.debug("BSR address resolved");
      }
    }

    // 5. Fetch pickup dates for current + next month
    let dates;
    try {
      this.debug("Fetching BSR pickup dates");
      dates = await this.fetchPickupDates(this.addressKey);
      this.debug(`BSR returned ${dates.length} dates`);
    } catch (err) {
      this.handleApiError(err);
      return;
    }

    const berlinRecyclingDates = await this.fetchBerlinRecyclingDates();
    this.debug(`Berlin Recycling returned ${berlinRecyclingDates.length} dates`);
    dates = mergeProviderDates([dates, berlinRecyclingDates], this.config.categories);
    this.debug(`Merged and filtered to ${dates.length} dates`);

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
    return resolveBsrAddress(this.executeApiCall.bind(this), street, houseNumber);
  },

  /**
   * Fetches pickup dates for the current and next month sequentially.
   * @param {string} addressKey
   * @returns {Promise<Array>} Combined, parsed pickup dates
   */
  async fetchPickupDates(addressKey) {
    return fetchBsrPickupDates(this.executeApiCall.bind(this), utils, addressKey);
  },

  /**
   * Fetches Berlin Recycling dates via portal or public fallback.
   * @returns {Promise<Array>}
   */
  async fetchBerlinRecyclingDates() {
    if (!this.config.berlinRecycling?.enabled) {
      this.debug("Berlin Recycling disabled");
      return [];
    }

    const brConfig = this.config.berlinRecycling;
    this.debug(
      `Berlin Recycling enabled: portal=${brConfig.usePortal ? "on" : "off"}, ` +
        `fallback=${brConfig.usePublicFallback ? "on" : "off"}`
    );

    if (brConfig.usePortal) {
      try {
        this.debug(
          `Trying Berlin Recycling portal; credentials=${
            process.env.BERLIN_RECYCLING_USERNAME && process.env.BERLIN_RECYCLING_PASSWORD
              ? "present"
              : "missing"
          }`
        );
        return await fetchBerlinRecyclingPortalDates(this.executeApiCall.bind(this), {
          username: process.env.BERLIN_RECYCLING_USERNAME,
          password: process.env.BERLIN_RECYCLING_PASSWORD,
        });
      } catch (err) {
        this.warn(`Berlin Recycling portal fetch failed: ${err.message}`);
      }
    }

    if (brConfig.usePublicFallback) {
      try {
        this.debug("Trying Berlin Recycling public fallback");
        return await fetchBerlinRecyclingPublicDates(this.executeApiCall.bind(this), this.config);
      } catch (err) {
        this.warn(`Berlin Recycling public fetch failed: ${err.message}`);
      }
    }

    this.debug("No Berlin Recycling dates available");
    return [];
  },

  /**
   * Executes a single HTTP request with a 30-second timeout.
   * @param {string} url
   * @returns {Promise<object|string>} Parsed response body
   */
  async executeApiCall(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const fetch = require("node-fetch");
      const { includeHeaders = false, responseType = "json", ...fetchOptions } = options;
      const res = await fetch(url, { ...fetchOptions, signal: controller.signal });

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const body = responseType === "text" ? await res.text() : await res.json();
      if (!includeHeaders) {
        return body;
      }
      return {
        body,
        cookies:
          typeof res.headers.raw === "function" ? (res.headers.raw()["set-cookie"] ?? []) : [],
        headers: Object.fromEntries(res.headers.entries()),
        status: res.status,
        url: res.url,
      };
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
    return utils.loadCache(CACHE_PATH);
  },

  /**
   * Saves data to the cache file as JSON.
   * @param {object} data
   */
  saveCache(data) {
    utils.saveCache(CACHE_PATH, data);
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

    // Embed SVG icon content into each pickup date
    const datesWithIcons = dates.map((d) => {
      const categoryInfo = utils.CATEGORY_MAP[d.category];
      const svgContent = categoryInfo ? utils.loadSvgIcon(ICONS_DIR, categoryInfo.svgFile) : null;
      return { ...d, svgIcon: svgContent };
    });

    this.currentData = datesWithIcons;
    this.debug(`Saving cache with ${datesWithIcons.length} dates`);

    // Persist to cache
    this.saveCache({
      street: this.config.street,
      houseNumber: this.config.houseNumber,
      addressKey: this.addressKey,
      pickupDates: datesWithIcons,
      lastFetchTimestamp: Date.now(),
    });

    // Notify frontend
    this.sendSocketNotification("BSR_PICKUP_DATA", { dates: datesWithIcons });
    this.debug("Sent pickup data to frontend");

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

    const delay = utils.calculateRetryDelay(this.retryCount);
    this.retryCount++;
    this.warn(
      `API error: ${error.message || "API nicht erreichbar"}; retry #${this.retryCount} in ${Math.round(
        delay / 60000
      )} minutes`
    );

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
      this.debug("Skipping regular update scheduling because retry cycle is active");
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
    this.debug(`Scheduled next regular update in ${Math.round(interval / 60000)} minutes`);
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
    this.debug(`Scheduled retry in ${Math.round(delay / 60000)} minutes`);
  },
});
