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
