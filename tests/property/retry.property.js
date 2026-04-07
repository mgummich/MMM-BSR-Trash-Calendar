// Feature: mmm-bsr-trash-calendar, Property 14: Exponentielles Backoff — korrekte Berechnung
// Validates: Requirements 2.6

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { calculateRetryDelay } from "../../utils.js";

const MINUTE_MS = 60 * 1000;
const MIN_DELAY_MS = 5 * MINUTE_MS;
const MAX_DELAY_MS = 120 * MINUTE_MS;

describe("Property 14: Exponentielles Backoff — korrekte Berechnung", () => {
  it("Für jeden retryCount >= 0 gilt: delay = min(5 × 2^retryCount, 120) Minuten in ms", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (retryCount) => {
        const delay = calculateRetryDelay(retryCount);
        const expectedMinutes = Math.min(5 * Math.pow(2, retryCount), 120);
        const expectedMs = expectedMinutes * MINUTE_MS;
        return delay === expectedMs;
      }),
      { numRuns: 100 }
    );
  });

  it("Für jeden retryCount >= 0 gilt: delay ist niemals kleiner als 5 Minuten", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (retryCount) => {
        return calculateRetryDelay(retryCount) >= MIN_DELAY_MS;
      }),
      { numRuns: 100 }
    );
  });

  it("Für jeden retryCount >= 0 gilt: delay ist niemals größer als 120 Minuten", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (retryCount) => {
        return calculateRetryDelay(retryCount) <= MAX_DELAY_MS;
      }),
      { numRuns: 100 }
    );
  });

  it("Für retryCount < 5 gilt: delay ist streng monoton steigend", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 }), (retryCount) => {
        return calculateRetryDelay(retryCount) < calculateRetryDelay(retryCount + 1);
      }),
      { numRuns: 100 }
    );
  });

  it("Für retryCount >= 5 gilt: delay ist immer 120 Minuten (Maximum erreicht)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 100 }), (retryCount) => {
        return calculateRetryDelay(retryCount) === MAX_DELAY_MS;
      }),
      { numRuns: 100 }
    );
  });

  it("Rückgabewert ist immer eine positive ganze Zahl (Millisekunden)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (retryCount) => {
        const delay = calculateRetryDelay(retryCount);
        return Number.isInteger(delay) && delay > 0;
      }),
      { numRuns: 100 }
    );
  });
});
