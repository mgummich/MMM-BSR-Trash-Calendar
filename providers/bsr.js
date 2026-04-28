export async function resolveBsrAddress(executeApiCall, street, houseNumber) {
  const url =
    `https://umnewforms.bsr.de/p/de.bsr.adressen.app/plzSet/plzSet` +
    `?searchQuery=${encodeURIComponent(street)}:::${encodeURIComponent(houseNumber)}`;

  const data = await executeApiCall(url);

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0].value;
}

export async function fetchBsrPickupDates(executeApiCall, utils, addressKey, now = new Date()) {
  const months = utils.getMonthRange(now);
  const allDates = [];

  for (const { year, month } of months) {
    const mm = String(month).padStart(2, "0");
    const url =
      `https://umnewforms.bsr.de/p/de.bsr.adressen.app/abfuhrEvents` +
      `?filter=AddrKey eq '${addressKey}'` +
      ` and DateFrom eq datetime'${year}-${mm}-01T00:00:00'` +
      ` and DateTo eq datetime'${year}-${mm}-01T00:00:00'`;

    const data = await executeApiCall(url);
    const parsed = utils.parsePickupDates(data);
    allDates.push(...parsed);
  }

  return allDates.map((date) => ({ ...date, provider: "BSR" }));
}
