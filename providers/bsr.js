/**
 * providers/bsr.js — BSR (Berliner Stadtreinigung) provider.
 *
 * Talks to the public `umapi.bsr.de` endpoints. HTTP is injected as `executeApiCall`
 * so the provider stays testable without network access.
 */

/**
 * Resolves a street address to a BSR address key.
 * Picks the first match returned by the API.
 * @param {(url: string, options?: object) => Promise<any>} executeApiCall - HTTP executor
 * @param {string} street - Street name, e.g. "Hauptstraße"
 * @param {string} houseNumber - House number, e.g. "12a"
 * @returns {Promise<string|null>} Address key, or null if the API returned no match
 * @throws {Error} Propagates HTTP/timeout errors from `executeApiCall`
 */
async function resolveBsrAddress(executeApiCall, street, houseNumber) {
  const url =
    `https://umapi.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet` +
    `?searchQuery=${encodeURIComponent(street)}:::${encodeURIComponent(houseNumber)}`;

  const data = await executeApiCall(url);

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0].value;
}

/**
 * Fetches pickup dates for the current and the following month, one request per month.
 * Requests are sequential; a failure on either month rejects the whole call.
 * Each returned entry is tagged with `provider: "BSR"`.
 * @param {(url: string, options?: object) => Promise<any>} executeApiCall - HTTP executor
 * @param {typeof import("../utils.js")} utils - Utils module (injected for testability)
 * @param {string} addressKey - BSR address key from {@link resolveBsrAddress}
 * @param {Date} [now] - Reference date deciding which two months are queried
 * @returns {Promise<import("../utils.js").PickupDate[]>} Parsed dates of both months, unsorted across months
 * @throws {Error} On HTTP/timeout errors or when a response fails to parse
 */
async function fetchBsrPickupDates(executeApiCall, utils, addressKey, now = new Date()) {
  const months = utils.getMonthRange(now);
  const allDates = [];
  const categories =
    "Category eq 'HM' or Category eq 'BI' or Category eq 'WS' or Category eq 'LT' or Category eq 'WB'";

  for (const { year, month } of months) {
    const mm = String(month).padStart(2, "0");
    const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, "0");
    const url =
      `https://umapi.bsr.de/p/de.bsr.adressen.app/abfuhrEvents` +
      `?filter=AddrKey eq '${addressKey}'` +
      ` and DateFrom eq datetime'${year}-${mm}-01T00:00:00'` +
      ` and DateTo eq datetime'${year}-${mm}-${lastDay}T00:00:00'` +
      ` and (${categories})`;

    const data = await executeApiCall(url);
    const parsed = utils.parsePickupDates(data);
    allDates.push(...parsed);
  }

  return allDates.map((date) => ({ ...date, provider: "BSR" }));
}

module.exports = {
  resolveBsrAddress,
  fetchBsrPickupDates,
};
