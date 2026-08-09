/**
 * providers/berlinRecyclingPortal.js — Berlin Recycling customer portal provider.
 *
 * The portal is an ASP.NET WebForms app with no public API: the provider logs in,
 * carries the session cookies by hand across a fixed request sequence and reads the
 * "ABFUHRKALENDER" dataset. HTTP is injected as `executeApiCall` for testability.
 */

const {
  mapBerlinRecyclingCategory,
  parseBerlinRecyclingDateList,
} = require("./berlinRecyclingParse.js");
const { filterPastDates, getCategoryDisplay, sortByDate } = require("../utils.js");

const SERVICE_URL = "https://kundenportal.berlin-recycling.de/";

/**
 * Merges the `set-cookie` values of a response into an existing Cookie header.
 * Cookie attributes (Path, HttpOnly, …) are stripped and later values for the same
 * name replace earlier ones, so session cookies survive the whole request chain.
 * @param {string} cookieHeader - Current Cookie header value, may be empty
 * @param {{cookies?: string[]}} response - Response envelope from `executeApiCall`
 * @returns {string} Updated Cookie header value, e.g. "a=1; b=2"
 */
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

/**
 * Unwraps an ASP.NET `{ "d": "<json string>" }` envelope.
 * Accepts either a raw body or an `executeApiCall` envelope, and passes through
 * anything that is not double-encoded.
 * @param {any} response
 * @returns {any} The decoded payload
 * @throws {SyntaxError} If `d` is a string but not valid JSON
 */
function unwrapAspNetJson(response) {
  const body = response?.body ?? response;
  if (typeof body?.d === "string") {
    return JSON.parse(body.d);
  }
  return body;
}

/**
 * Builds the error thrown when a portal response carries no recognisable calendar rows.
 * @returns {Error & {type: "BR_PORTAL_RESPONSE_INVALID"}}
 */
function createPortalResponseError() {
  const error = new Error("Berlin Recycling portal response missing calendar data");
  error.type = "BR_PORTAL_RESPONSE_INVALID";
  return error;
}

/**
 * Parses a portal calendar response into PickupDate objects.
 * Handles three shapes: the simple `{ dates: [...] }` list (delegated to
 * {@link parseBerlinRecyclingDateList}), `{ appointments: [...] }`, and the
 * `{ Object: { data: [...] } }` dataset shape, each possibly wrapped in an ASP.NET
 * `d` envelope. Column names vary per shape, so material and date are read from
 * several candidate keys. Rows with an unknown material or no date are dropped.
 * @param {any} response - Raw portal response
 * @param {string} [today] - ISO date string "YYYY-MM-DD" (defaults to the current date)
 * @returns {import("../utils.js").PickupDate[]} Future dates only, sorted ascending
 * @throws {Error} With `type: "BR_PORTAL_RESPONSE_INVALID"` if no known row array is present
 */
function parseBerlinRecyclingPortalDates(response, today = new Date().toISOString().slice(0, 10)) {
  if (Array.isArray(response?.dates)) {
    return parseBerlinRecyclingDateList(response, today);
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

/**
 * Logs into the Berlin Recycling customer portal and fetches the pickup calendar.
 *
 * Request sequence, each step feeding its cookies into the next:
 * 1. `GET /` to obtain the initial session cookie
 * 2. `POST /Login.aspx/Auth` with the credentials
 * 3. `GET /Default.aspx` — a redirect back to `Login.aspx` means the login failed
 * 4. `POST /Default.aspx/GetDashboard` — the portal expects this before the dataset call
 * 5. `POST /Default.aspx/GetDatasetTableHead` for the "ABFUHRKALENDER" dataset
 *
 * @param {(url: string, options?: object) => Promise<any>} executeApiCall - HTTP executor
 * @param {{username?: string, password?: string}} credentials - Portal login, from the `BERLIN_RECYCLING_*` env vars
 * @returns {Promise<import("../utils.js").PickupDate[]>} Future dates only, sorted ascending
 * @throws {Error} With `type: "BR_AUTH_FAILED"` when credentials are missing or rejected,
 *   `type: "BR_PORTAL_RESPONSE_INVALID"` for an unparsable calendar, or an HTTP/timeout
 *   error propagated from `executeApiCall`
 */
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
