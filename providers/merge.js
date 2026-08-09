/**
 * providers/merge.js — Combines pickup dates from several providers into one display list.
 */

const { filterByCategories, sortByDate } = require("../utils.js");

/**
 * Merges provider date groups, drops duplicates, filters by category and sorts ascending.
 * Two entries are duplicates when date, category, disposal company and provider all match —
 * so the same pickup reported by two providers is kept twice on purpose, because the
 * disposal companies differ.
 * @param {Array<import("../utils.js").PickupDate[]|null|undefined>} dateGroups - One array per provider; nullish groups are skipped
 * @param {string[]} categories - Category codes to keep
 * @returns {import("../utils.js").PickupDate[]} Merged dates sorted ascending by date
 */
function mergeProviderDates(dateGroups, categories) {
  const seen = new Set();
  const merged = [];

  for (const group of dateGroups) {
    for (const date of group || []) {
      const key = `${date.date}|${date.category}|${date.disposalCompany}|${date.provider ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(date);
      }
    }
  }

  return sortByDate(filterByCategories(merged, categories));
}

module.exports = {
  mergeProviderDates,
};
