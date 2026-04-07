/**
 * Unit tests for configuration validation
 * BDD-style tests for validateConfig and sanitizeCategories
 * Requirements: 5.1, 5.2, 5.4, 12.4, 12.6
 */

import { describe, it, expect } from "vitest";
import { validateConfig, sanitizeCategories } from "../../utils.js";

const VALID_CATEGORIES = ["BI", "HM", "LT", "WS", "WB"];

describe("validateConfig", () => {
  // BDD-Szenario 24: Pflicht-Parameter fehlen
  describe("Szenario 24: Pflicht-Parameter fehlen", () => {
    it("should return an error containing 'street' when street is missing", () => {
      // Given: A config without street name
      const config = { houseNumber: "12" };

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: Returns an error containing "street"
      expect(result.error).toBeDefined();
      expect(result.error).toContain("street");
    });

    it("should return an error containing 'houseNumber' when houseNumber is missing", () => {
      // Given: A config without houseNumber
      const config = { street: "Bergmannstr." };

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: Returns an error containing "houseNumber"
      expect(result.error).toBeDefined();
      expect(result.error).toContain("houseNumber");
    });

    it("should return an error containing both 'street' and 'houseNumber' when both are missing", () => {
      // Given: A config without both street and houseNumber
      const config = {};

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: Returns an error containing both
      expect(result.error).toBeDefined();
      expect(result.error).toContain("street");
      expect(result.error).toContain("houseNumber");
    });
  });

  // BDD-Szenario 28: Direkter addressKey überspringt Adressauflösung
  describe("Szenario 28: Direkter addressKey in Konfiguration", () => {
    it("should accept config with only addressKey (no street/houseNumber)", () => {
      // Given: A config with only addressKey
      const config = { addressKey: "10965_Bergmannstr._12" };

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: Returns valid config without error
      expect(result.error).toBeUndefined();
      expect(result.config).toBeDefined();
      expect(result.config.addressKey).toBe("10965_Bergmannstr._12");
    });

    it("should set addressKey in config when provided alongside street/houseNumber", () => {
      // Given: A config with addressKey and street/houseNumber
      const config = {
        addressKey: "10965_Bergmannstr._12",
        street: "Bergmannstr.",
        houseNumber: "12",
      };

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: addressKey is preserved
      expect(result.error).toBeUndefined();
      expect(result.config.addressKey).toBe("10965_Bergmannstr._12");
    });

    it("should set addressKey to null when not provided", () => {
      // Given: A config without addressKey
      const config = { street: "Bergmannstr.", houseNumber: "12" };

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: addressKey is null
      expect(result.error).toBeUndefined();
      expect(result.config.addressKey).toBeNull();
    });
  });

  // BDD-Szenario 29: Weder addressKey noch street+houseNumber
  describe("Szenario 29: Weder addressKey noch street+houseNumber", () => {
    it("should return error when neither addressKey nor street+houseNumber are provided", () => {
      // Given: Empty config
      const config = {};

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: Returns an error
      expect(result.error).toBeDefined();
    });
  });

  // Standard values for optional parameters
  describe("Standardwerte für optionale Parameter", () => {
    it("should return config with defaults when only required fields are provided", () => {
      // Given: A config with only street and houseNumber
      const config = { street: "Bergmannstr.", houseNumber: "12" };

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: Returns config with defaults
      expect(result.error).toBeUndefined();
      expect(result.config).toBeDefined();
      expect(result.config.dateFormat).toBe("dd.MM.yyyy");
      expect(result.config.maxEntries).toBe(5);
      expect(result.config.updateInterval).toBe(86400000);
      expect(result.config.categories).toEqual(VALID_CATEGORIES);
    });

    it("should preserve provided optional values and not override them with defaults", () => {
      // Given: A config with all fields provided
      const config = {
        street: "Oranienstr.",
        houseNumber: "5",
        dateFormat: "MM/dd/yyyy",
        maxEntries: 10,
        updateInterval: 3600000,
        categories: ["HM", "WS"],
      };

      // When: validateConfig is called
      const result = validateConfig(config);

      // Then: Provided values are preserved
      expect(result.error).toBeUndefined();
      expect(result.config.dateFormat).toBe("MM/dd/yyyy");
      expect(result.config.maxEntries).toBe(10);
      expect(result.config.updateInterval).toBe(3600000);
    });
  });
});

describe("sanitizeCategories", () => {
  // BDD-Szenario 9: Unbekannte Kategorie "XX"
  describe("Szenario 9: Unbekannte Kategorie 'XX'", () => {
    it("should remove unknown category 'XX' and keep only valid ones", () => {
      // Given: config with categories: ["HM", "XX"]
      const categories = ["HM", "XX"];

      // When: sanitizeCategories is called
      const result = sanitizeCategories(categories);

      // Then: "XX" is removed, only ["HM"] remains
      expect(result).toEqual(["HM"]);
      expect(result).not.toContain("XX");
    });
  });

  // BDD-Szenario 20: Leeres categories-Array
  describe("Szenario 20: Leeres categories-Array", () => {
    it("should return all valid categories as fallback when categories is empty", () => {
      // Given: config with categories: []
      const categories = [];

      // When: sanitizeCategories is called
      const result = sanitizeCategories(categories);

      // Then: Returns all valid categories as fallback
      expect(result).toEqual(VALID_CATEGORIES);
    });

    it("should return all valid categories as fallback when all entries are invalid", () => {
      // Given: config with only invalid categories
      const categories = ["XX", "YY", "ZZ"];

      // When: sanitizeCategories is called
      const result = sanitizeCategories(categories);

      // Then: Returns all valid categories as fallback
      expect(result).toEqual(VALID_CATEGORIES);
    });
  });

  describe("Gültige Kategorien", () => {
    it("should keep all valid categories unchanged", () => {
      // Given: All valid categories
      const categories = ["BI", "HM", "LT", "WS", "WB"];

      // When: sanitizeCategories is called
      const result = sanitizeCategories(categories);

      // Then: All valid categories are returned
      expect(result).toEqual(["BI", "HM", "LT", "WS", "WB"]);
    });

    it("should keep a subset of valid categories", () => {
      // Given: A valid subset
      const categories = ["BI", "WS"];

      // When: sanitizeCategories is called
      const result = sanitizeCategories(categories);

      // Then: The subset is returned unchanged
      expect(result).toEqual(["BI", "WS"]);
    });
  });
});
