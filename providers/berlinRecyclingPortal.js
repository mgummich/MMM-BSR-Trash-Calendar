const {
  mapBerlinRecyclingCategory,
  parseBerlinRecyclingPublicDates,
} = require("./berlinRecyclingPublic.js");
const { filterPastDates, getCategoryDisplay, sortByDate } = require("../utils.js");

function parseBerlinRecyclingPortalDates(response, today = new Date().toISOString().slice(0, 10)) {
  if (Array.isArray(response?.dates)) {
    return parseBerlinRecyclingPublicDates(response, today);
  }

  const rows = Array.isArray(response?.appointments) ? response.appointments : [];
  const dates = rows.flatMap((row) => {
    const category = mapBerlinRecyclingCategory(row.material || row.fraction || row.category);
    if (!category || !row.date) {
      return [];
    }
    const display = getCategoryDisplay(category);
    return [
      {
        date: row.date,
        category,
        categoryName: display.name,
        color: display.color,
        icon: display.icon,
        disposalCompany: "Berlin Recycling",
        warningText: row.note ?? row.warningText ?? "",
        provider: "BERLIN_RECYCLING",
      },
    ];
  });
  return sortByDate(filterPastDates(dates, today));
}

async function fetchBerlinRecyclingPortalDates(executeApiCall, credentials) {
  if (!credentials.username || !credentials.password) {
    const error = new Error("Berlin Recycling credentials missing");
    error.type = "BR_AUTH_FAILED";
    throw error;
  }

  const login = await executeApiCall("https://www.berlin-recycling.de/kundenportal/login", {
    method: "POST",
    body: JSON.stringify({ username: credentials.username, password: credentials.password }),
    headers: { "Content-Type": "application/json" },
  });
  const token = login.token || login.accessToken;

  if (!token) {
    const error = new Error("Berlin Recycling authentication failed");
    error.type = "BR_AUTH_FAILED";
    throw error;
  }

  const calendar = await executeApiCall(
    "https://www.berlin-recycling.de/kundenportal/abfuhrkalender",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return parseBerlinRecyclingPortalDates(calendar);
}

module.exports = {
  parseBerlinRecyclingPortalDates,
  fetchBerlinRecyclingPortalDates,
};
