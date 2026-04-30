const {
  mapBerlinRecyclingCategory,
  parseBerlinRecyclingPublicDates,
} = require("./berlinRecyclingPublic.js");
const { filterPastDates, getCategoryDisplay, sortByDate } = require("../utils.js");

const SERVICE_URL = "https://kundenportal.berlin-recycling.de/";

function appendCookies(cookieHeader, response) {
  const cookies = response?.cookies ?? [];
  const existing = cookieHeader
    ? cookieHeader
        .split(";")
        .map((cookie) => cookie.trim())
        .filter(Boolean)
    : [];
  const byName = new Map(
    existing.map((cookie) => {
      const [name] = cookie.split("=");
      return [name, cookie];
    })
  );

  for (const rawCookie of cookies) {
    const cookie = rawCookie.split(";")[0];
    const [name] = cookie.split("=");
    if (name && cookie) {
      byName.set(name, cookie);
    }
  }

  return [...byName.values()].join("; ");
}

function unwrapAspNetJson(response) {
  const body = response?.body ?? response;
  if (typeof body?.d === "string") {
    return JSON.parse(body.d);
  }
  return body;
}

function createPortalResponseError() {
  const error = new Error("Berlin Recycling portal response missing calendar data");
  error.type = "BR_PORTAL_RESPONSE_INVALID";
  return error;
}

function parseBerlinRecyclingPortalDates(response, today = new Date().toISOString().slice(0, 10)) {
  if (Array.isArray(response?.dates)) {
    return parseBerlinRecyclingPublicDates(response, today);
  }

  const data = unwrapAspNetJson(response);
  let rows;
  if (Array.isArray(data?.appointments)) {
    rows = data.appointments;
  } else if (Array.isArray(data?.Object?.data)) {
    rows = data.Object.data;
  } else {
    throw createPortalResponseError();
  }

  const dates = rows.flatMap((row) => {
    const material =
      row.material ||
      row.fraction ||
      row.category ||
      row["Material Description"] ||
      row.MaterialDescription;
    const date = row.date || row["Task Date"] || row.TaskDate;
    const category = mapBerlinRecyclingCategory(material);
    if (!category || !date) {
      return [];
    }
    const display = getCategoryDisplay(category);
    return [
      {
        date,
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

  let cookieHeader = "";
  const initial = await executeApiCall(SERVICE_URL, {
    allowRedirectStatus: true,
    includeHeaders: true,
    redirect: "manual",
    responseType: "text",
  });
  cookieHeader = appendCookies(cookieHeader, initial);

  const headers = { "Content-Type": "application/json" };
  const login = await executeApiCall(`${SERVICE_URL}Login.aspx/Auth`, {
    method: "POST",
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
      rememberMe: false,
      encrypted: false,
    }),
    headers: { ...headers, Cookie: cookieHeader },
    includeHeaders: true,
  });
  cookieHeader = appendCookies(cookieHeader, login);

  const defaultView = await executeApiCall(`${SERVICE_URL}Default.aspx`, {
    headers: { Cookie: cookieHeader },
    includeHeaders: true,
    responseType: "text",
  });
  cookieHeader = appendCookies(cookieHeader, defaultView);

  if (defaultView.url?.includes("Login.aspx")) {
    const error = new Error("Berlin Recycling authentication failed");
    error.type = "BR_AUTH_FAILED";
    throw error;
  }

  await executeApiCall(`${SERVICE_URL}Default.aspx/GetDashboard`, {
    method: "POST",
    headers: { ...headers, Cookie: cookieHeader },
  });

  const calendar = await executeApiCall(`${SERVICE_URL}Default.aspx/GetDatasetTableHead`, {
    method: "POST",
    body: JSON.stringify({
      datasettablecode: "ABFUHRKALENDER",
      startindex: 0,
      searchtext: "",
      rangefilter: "[]",
      ordername: "",
      orderdir: "",
      ClientParameters: "",
      headrecid: "",
    }),
    headers: { ...headers, Cookie: cookieHeader },
  });
  return parseBerlinRecyclingPortalDates(calendar);
}

module.exports = {
  parseBerlinRecyclingPortalDates,
  fetchBerlinRecyclingPortalDates,
};
