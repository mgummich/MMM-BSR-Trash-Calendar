/**
 * Property-based tests for configuration validation
 * Feature: mmm-bsr-trash-calendar, Property 5: Konfigurationsvalidierung — gültige Config oder Fehler
 *
 * Validates: Requirements 5.1, 5.2, 5.4, 9.4
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { validateConfig } from "../../utils.js";

// **Validates: Requirements 5.1, 5.2, 5.4, 9.4**

describe("Property 5: Konfigurationsvalidierung — gültige Config oder Fehler", () => {
  it("Property 5a: For any config with non-empty street and non-empty houseNumber → result has config, no error", () => {
    fc.assert(
      fc.property(
        fc.record({
          street: fc.string({ minLength: 1 }),
          houseNumber: fc.string({ minLength: 1 }),
          dateFormat: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          maxEntries: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
          updateInterval: fc.option(fc.integer({ min: 1000 }), { nil: undefined }),
          categories: fc.option(fc.array(fc.constantFrom("BI", "HM", "LT", "WS", "WB")), {
            nil: undefined,
          }),
        }),
        (config) => {
          const result = validateConfig(config);
          return result.config !== undefined && result.error === undefined;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 5b: For any config missing street or houseNumber (empty string or undefined) → result has error, no config", () => {
    fc.assert(
      fc.property(
        fc
          .record({
            street: fc.option(fc.string(), { nil: undefined }),
            houseNumber: fc.option(fc.string(), { nil: undefined }),
          })
          .filter(
            (config) =>
              !config.street ||
              config.street === "" ||
              !config.houseNumber ||
              config.houseNumber === ""
          ),
        (config) => {
          const result = validateConfig(config);
          return result.error !== undefined && result.config === undefined;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 5c: For any valid config → result.config has all required fields (dateFormat, maxEntries, updateInterval, categories)", () => {
    fc.assert(
      fc.property(
        fc.record({
          street: fc.string({ minLength: 1 }),
          houseNumber: fc.string({ minLength: 1 }),
        }),
        (config) => {
          const result = validateConfig(config);
          if (!result.config) {
            return false;
          }
          return (
            typeof result.config.dateFormat === "string" &&
            typeof result.config.maxEntries === "number" &&
            typeof result.config.updateInterval === "number" &&
            Array.isArray(result.config.categories) &&
            result.config.categories.length > 0
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 5d: For any config → result has EITHER error OR config, never both, never neither", () => {
    fc.assert(
      fc.property(
        fc.record({
          street: fc.option(fc.string(), { nil: undefined }),
          houseNumber: fc.option(fc.string(), { nil: undefined }),
        }),
        (config) => {
          const result = validateConfig(config);
          const hasConfig = result.config !== undefined;
          const hasError = result.error !== undefined;
          // XOR: exactly one of the two must be true
          return hasConfig !== hasError;
        }
      ),
      { numRuns: 100 }
    );
  });
});
