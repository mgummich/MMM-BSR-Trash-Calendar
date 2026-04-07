/**
 * MMM-BSR-Trash-Calendar.js — MagicMirror² Frontend Module
 * Displays BSR (Berliner Stadtreinigung) trash pickup dates.
 *
 * This is a browser module — no ES module imports/exports.
 * All helper logic is inline.
 */

Module.register("MMM-BSR-Trash-Calendar", {
  // Default configuration values
  defaults: {
    street: "",
    houseNumber: "",
    dateFormat: "dd.MM.yyyy",
    maxEntries: 5,
    updateInterval: 86400000,
    categories: ["BI", "HM", "LT", "WS", "WB"],
  },

  /**
   * Called when the module is started.
   * Initializes state and sends config to node_helper.
   */
  start() {
    Log.info(`[MMM-BSR-Trash-Calendar] Starting module`);
    this.state = "loading";
    this.pickupDates = [];
    this.errorMessage = "";
    this.sendSocketNotification("BSR_INIT_MODULE", this.config);
  },

  /**
   * Returns the list of CSS files to load.
   * @returns {string[]}
   */
  getStyles() {
    return ["MMM-BSR-Trash-Calendar.css"];
  },

  /**
   * Handles socket notifications from node_helper.
   * @param {string} notification
   * @param {object} payload
   */
  socketNotificationReceived(notification, payload) {
    if (notification === "BSR_PICKUP_DATA") {
      const dates = payload && Array.isArray(payload.dates) ? payload.dates : [];
      this.pickupDates = dates;
      this.state = dates.length > 0 ? "data" : "empty";
      this.updateDom();
    } else if (notification === "BSR_ERROR") {
      this.errorMessage = payload && payload.message ? payload.message : "Unbekannter Fehler";
      this.state = "error";
      this.updateDom();
    }
  },

  /**
   * Builds and returns the DOM for the current state.
   * @returns {HTMLElement}
   */
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "bsr-trash-calendar";

    if (this.state === "loading") {
      const loading = document.createElement("div");
      loading.className = "bsr-loading";
      loading.textContent = "Lade Abfuhrtermine...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (this.state === "error") {
      const error = document.createElement("div");
      error.className = "bsr-error";
      error.textContent = this.errorMessage;
      wrapper.appendChild(error);
      return wrapper;
    }

    if (this.state === "empty") {
      const empty = document.createElement("div");
      empty.className = "bsr-empty";
      empty.textContent = "Keine Termine verfügbar";
      wrapper.appendChild(empty);
      return wrapper;
    }

    // state === "data"
    const today = this._getTodayISO();
    const maxEntries = this.config.maxEntries || 5;
    const entries = this.pickupDates.slice(0, maxEntries);

    for (const pickup of entries) {
      const relativeLabel = this._getRelativeLabel(pickup.date, today);

      // Entry row
      const entry = document.createElement("div");
      entry.className = "bsr-entry";
      if (relativeLabel === "Heute") {
        entry.classList.add("today");
      } else if (relativeLabel === "Morgen") {
        entry.classList.add("tomorrow");
      }

      // Icon — use BSR SVG if available, fall back to Font Awesome
      const icon = document.createElement("span");
      icon.className = "bsr-category-icon";
      icon.style.color = pickup.color;
      if (pickup.svgIcon) {
        icon.innerHTML = pickup.svgIcon;
        const svg = icon.querySelector("svg");
        if (svg) {
          svg.style.width = "1.2em";
          svg.style.height = "1.2em";
          svg.style.verticalAlign = "middle";
        }
      } else {
        icon.classList.add("fa", pickup.icon);
      }
      entry.appendChild(icon);

      // Category name
      const categoryName = document.createElement("span");
      categoryName.className = "bsr-category-name";
      categoryName.textContent = pickup.categoryName;
      entry.appendChild(categoryName);

      // Date (relative label or formatted)
      const dateSpan = document.createElement("span");
      dateSpan.className = "bsr-date";
      dateSpan.textContent =
        relativeLabel !== null
          ? relativeLabel
          : this._formatDate(pickup.date, this.config.dateFormat || "dd.MM.yyyy");
      entry.appendChild(dateSpan);

      // Disposal company
      const disposal = document.createElement("span");
      disposal.className = "bsr-disposal";
      disposal.textContent = pickup.disposalCompany;
      entry.appendChild(disposal);

      wrapper.appendChild(entry);

      // Warning notice (below the entry)
      if (pickup.warningText && pickup.warningText.trim() !== "") {
        const warning = document.createElement("div");
        warning.className = "bsr-warning";
        warning.textContent = pickup.warningText;
        wrapper.appendChild(warning);
      }
    }

    return wrapper;
  },

  // ─── Private helper methods ───────────────────────────────────────────────

  /**
   * Returns today's date as an ISO string "YYYY-MM-DD".
   * @returns {string}
   */
  _getTodayISO() {
    return new Date().toISOString().slice(0, 10);
  },

  /**
   * Formats an ISO date string "YYYY-MM-DD" using the given format pattern.
   * Supported tokens: dd, MM, yyyy, yy
   * @param {string} date - ISO date "YYYY-MM-DD"
   * @param {string} format - Format string e.g. "dd.MM.yyyy"
   * @returns {string}
   */
  _formatDate(date, format) {
    const [yyyy, mm, dd] = date.split("-");
    return format
      .replace("dd", dd)
      .replace("MM", mm)
      .replace("yyyy", yyyy)
      .replace("yy", yyyy.slice(-2));
  },

  /**
   * Returns "Heute" if date equals today, "Morgen" if date equals tomorrow, or null.
   * @param {string} date - ISO date "YYYY-MM-DD"
   * @param {string} today - ISO date "YYYY-MM-DD"
   * @returns {"Heute" | "Morgen" | null}
   */
  _getRelativeLabel(date, today) {
    if (date === today) {
      return "Heute";
    }
    const todayDate = new Date(today + "T00:00:00Z");
    todayDate.setUTCDate(todayDate.getUTCDate() + 1);
    const tomorrow = todayDate.toISOString().slice(0, 10);
    if (date === tomorrow) {
      return "Morgen";
    }
    return null;
  },
});
