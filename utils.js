/**
 * utils.js — Pure utility functions for MMM-BSR-Trash-Calendar
 */
"use strict";

const fs = require("fs");

/** @type {Record<string, {name: string, color: string, icon: string, svgFile: string}>} */
const CATEGORY_MAP = {
  BI: { name: "Biogut", color: "#8B4513", icon: "fa-seedling", svgFile: "BI.svg" },
  HM: { name: "Hausmüll", color: "#808080", icon: "fa-trash", svgFile: "HM.svg" },
  LT: { name: "Laubtonne", color: "#228B22", icon: "fa-leaf", svgFile: "LT.svg" },
  WS: { name: "Wertstoffe", color: "#FFD700", icon: "fa-recycle", svgFile: "WS.svg" },
  WB: { name: "Weihnachtsbaum", color: "#006400", icon: "fa-tree", svgFile: "WB.svg" },
  PP: { name: "Papier", color: "#1E88E5", icon: "fa-newspaper", svgFile: null },
  GL: { name: "Glas", color: "#43A047", icon: "fa-wine-bottle", svgFile: null },
  GW: { name: "Gewerbeabfall", color: "#6D4C41", icon: "fa-dumpster", svgFile: null },
};

/**
 * Parses a BSR API calendar response into an array of PickupDate objects.
 * Only returns future dates (>= today), sorted ascending by date.
 * @param {object} apiResponse - BSR API CalendarEventsResponse
 * @param {string} [today] - ISO date string "YYYY-MM-DD" (defaults to current date)
 * @returns {PickupDate[]}
 * @throws {Error} If apiResponse is invalid
 */
function parsePickupDates(apiResponse, today) {
  if (
    apiResponse === null ||
    apiResponse === undefined ||
    typeof apiResponse !== "object" ||
    !("dates" in apiResponse)
  ) {
    throw new Error("Invalid API response: missing 'dates' field");
  }

  const { dates } = apiResponse;

  if (dates === null || typeof dates !== "object" || Array.isArray(dates)) {
    throw new Error("Invalid API response: 'dates' must be a non-null object");
  }

  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const result = [];

  for (const [, entries] of Object.entries(dates)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.category) {
        throw new Error("Invalid API response: entry missing 'category' field");
      }
      if (!entry.serviceDate_actual) {
        throw new Error("Invalid API response: entry missing 'serviceDate_actual' field");
      }

      // Convert "dd.MM.yyyy" → "YYYY-MM-DD"
      const [dd, mm, yyyy] = entry.serviceDate_actual.split(".");
      const isoDate = `${yyyy}-${mm}-${dd}`;

      const categoryInfo = CATEGORY_MAP[entry.category];

      result.push({
        date: isoDate,
        category: entry.category,
        categoryName: categoryInfo ? categoryInfo.name : entry.category,
        color: categoryInfo ? categoryInfo.color : "",
        icon: categoryInfo ? categoryInfo.icon : "",
        disposalCompany: entry.disposalComp ?? "",
        warningText: entry.warningText ?? "",
      });
    }
  }

  return sortByDate(filterPastDates(result, todayStr));
}

/**
 * Filters an array of PickupDate objects to only include the given categories.
 * @param {PickupDate[]} dates
 * @param {string[]} categories - Array of category codes to keep
 * @returns {PickupDate[]}
 */
function filterByCategories(dates, categories) {
  const catSet = new Set(categories);
  return dates.filter((d) => catSet.has(d.category));
}

/**
 * Sorts an array of PickupDate objects ascending by date.
 * Does not mutate the original array.
 * @param {PickupDate[]} dates
 * @returns {PickupDate[]}
 */
function sortByDate(dates) {
  return [...dates].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Removes pickup dates that are strictly before today.
 * @param {PickupDate[]} dates
 * @param {string} today - ISO date string "YYYY-MM-DD"
 * @returns {PickupDate[]}
 */
function filterPastDates(dates, today) {
  return dates.filter((d) => d.date >= today);
}

/**
 * Formats an ISO date string according to the given format pattern.
 * Supported tokens: dd, MM, yyyy, yy
 * @param {string} date - ISO date string "YYYY-MM-DD"
 * @param {string} format - Format string (e.g. "dd.MM.yyyy")
 * @returns {string}
 */
function formatDate(date, format) {
  const [yyyy, mm, dd] = date.split("-");
  return format
    .replace("dd", dd)
    .replace("MM", mm)
    .replace("yyyy", yyyy)
    .replace("yy", yyyy.slice(-2));
}

/**
 * Returns "Heute" if date equals today, "Morgen" if date equals tomorrow, or null otherwise.
 * @param {string} date - ISO date string "YYYY-MM-DD"
 * @param {string} today - ISO date string "YYYY-MM-DD"
 * @returns {"Heute" | "Morgen" | null}
 */
function getRelativeLabel(date, today) {
  if (date === today) {
    return "Heute";
  }
  // Compute tomorrow from today
  const todayDate = new Date(today + "T00:00:00Z");
  todayDate.setUTCDate(todayDate.getUTCDate() + 1);
  const tomorrow = todayDate.toISOString().slice(0, 10);
  if (date === tomorrow) {
    return "Morgen";
  }
  return null;
}

/**
 * Returns the display info for a category code.
 * @param {string} code - Category code ("BI", "HM", etc.)
 * @returns {{ name: string, color: string, icon: string } | null}
 */
function getCategoryDisplay(code) {
  return CATEGORY_MAP[code] ?? null;
}

/**
 * Validates the module configuration.
 * Accepts either (street + houseNumber) or (addressKey) as identification.
 * @param {object} config
 * @returns {{ config: object } | { error: string }}
 */
function validateConfig(config) {
  const hasAddressKey = config && typeof config.addressKey === "string" && config.addressKey !== "";
  const hasStreet = config && typeof config.street === "string" && config.street !== "";
  const hasHouseNumber =
    config && typeof config.houseNumber === "string" && config.houseNumber !== "";

  if (!hasAddressKey && !(hasStreet && hasHouseNumber)) {
    const missing = [];
    if (!hasAddressKey && !hasStreet) {
      missing.push("street");
    }
    if (!hasAddressKey && !hasHouseNumber) {
      missing.push("houseNumber");
    }
    return { error: `Missing required parameters: ${missing.join(", ")}` };
  }

  const berlinRecycling = {
    enabled: config.berlinRecycling?.enabled ?? false,
    usePortal: config.berlinRecycling?.usePortal ?? true,
    usePublicFallback: config.berlinRecycling?.usePublicFallback ?? true,
  };

  return {
    config: {
      ...config,
      addressKey: config.addressKey || null,
      street: config.street || "",
      houseNumber: config.houseNumber || "",
      dateFormat: config.dateFormat || "dd.MM.yyyy",
      maxEntries: config.maxEntries ?? 5,
      updateInterval: config.updateInterval ?? 86400000,
      categories: sanitizeCategories(config.categories ?? []),
      berlinRecycling,
    },
  };
}

/**
 * Serializes a PickupDate back into a BSR API CalendarEventsResponse-like structure.
 * Used for round-trip testing.
 * @param {PickupDate} pickupDate
 * @returns {{ dates: { [date: string]: Array<object> } }}
 */
function serializePickupDate(pickupDate) {
  const [yyyy, mm, dd] = pickupDate.date.split("-");
  return {
    dates: {
      [pickupDate.date]: [
        {
          category: pickupDate.category,
          serviceDay: "",
          serviceDate_actual: `${dd}.${mm}.${yyyy}`,
          serviceDate_regular: `${dd}.${mm}.${yyyy}`,
          rhythm: "",
          warningText: pickupDate.warningText,
          disposalComp: pickupDate.disposalCompany,
        },
      ],
    },
  };
}

/**
 * Checks whether the cache is still valid (interval not expired and has future dates).
 * @param {object} cache - CacheData object
 * @param {object} _config - Module configuration (unused, kept for API consistency)
 * @param {number} now - Current Unix timestamp in ms
 * @param {number} interval - Update interval in ms
 * @returns {boolean}
 */
function isCacheValid(cache, _config, now, interval) {
  if (now - cache.lastFetchTimestamp >= interval) {
    return false;
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const hasFuture = cache.pickupDates.some((d) => d.date >= today);
  return hasFuture;
}

/**
 * Checks whether the cache address matches the current configuration.
 * @param {object} cache - CacheData object
 * @param {object} config - Module configuration
 * @returns {boolean}
 */
function isCacheAddressMatch(cache, config) {
  return cache.street === config.street && cache.houseNumber === config.houseNumber;
}

/**
 * Calculates the exponential backoff delay for a retry attempt.
 * Formula: min(5 × 2^retryCount, 120) minutes in milliseconds.
 * Sequence: 5 → 10 → 20 → 40 → 80 → 120 (max) minutes.
 * @param {number} retryCount - Number of retries already attempted (0-based)
 * @returns {number} Delay in milliseconds
 */
function calculateRetryDelay(retryCount) {
  const minutes = Math.min(5 * Math.pow(2, retryCount), 120);
  return minutes * 60 * 1000;
}

/**
 * Returns the current month and the following month (handles Dec→Jan year rollover).
 * @param {Date} [now] - Reference date (defaults to current date)
 * @returns {{ year: number, month: number }[]} Array of two { year, month } objects (month is 1-based)
 */
function getMonthRange(now) {
  const date = now ?? new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based

  const current = { year, month };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return [current, next];
}

/**
 * Removes invalid categories; falls back to all valid categories if result is empty.
 * @param {string[]} categories
 * @returns {string[]}
 */
function sanitizeCategories(categories) {
  const valid = Object.keys(CATEGORY_MAP);
  const filtered = (categories || []).filter((c) => valid.includes(c));
  return filtered.length > 0 ? filtered : valid;
}

/**
 * Loads and parses a JSON cache file. Returns null on any error.
 * @param {string} filePath - Absolute or relative path to the cache file
 * @returns {object|null}
 */
function loadCache(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Saves data as JSON to the given file path.
 * @param {string} filePath - Absolute or relative path to the cache file
 * @param {object} data - Data to serialize
 */
function saveCache(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
}

/**
 * Loads an SVG icon file and returns its content as a string.
 * Returns null if the file cannot be read.
 * @param {string} iconsDir - Absolute path to the icons directory
 * @param {string} svgFile - SVG filename (e.g. "HM.svg")
 * @returns {string|null}
 */
function loadSvgIcon(iconsDir, svgFile) {
  if (!svgFile) {
    return null;
  }
  try {
    return fs.readFileSync(require("path").join(iconsDir, svgFile), "utf8");
  } catch {
    return null;
  }
}

module.exports = {
  CATEGORY_MAP,
  parsePickupDates,
  filterByCategories,
  sortByDate,
  filterPastDates,
  formatDate,
  getRelativeLabel,
  getCategoryDisplay,
  validateConfig,
  serializePickupDate,
  isCacheValid,
  isCacheAddressMatch,
  calculateRetryDelay,
  getMonthRange,
  sanitizeCategories,
  loadCache,
  saveCache,
  loadSvgIcon,
};
