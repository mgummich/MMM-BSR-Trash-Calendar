import { filterByCategories, sortByDate } from "../utils.js";

export function mergeProviderDates(dateGroups, categories) {
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
