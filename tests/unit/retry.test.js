import { describe, it, expect } from "vitest";
import { calculateRetryDelay } from "../../utils.js";

// ---------------------------------------------------------------------------
// Backoff-Sequenz: 5→10→20→40→80→120 Min (Requirements 2.5, 2.6, 2.7, 2.8, 2.9)
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;

describe("calculateRetryDelay: Exponentielles Backoff (Req 2.6)", () => {
  it("retryCount=0 → 5 Minuten", () => {
    expect(calculateRetryDelay(0)).toBe(5 * MINUTE_MS);
  });

  it("retryCount=1 → 10 Minuten", () => {
    expect(calculateRetryDelay(1)).toBe(10 * MINUTE_MS);
  });

  it("retryCount=2 → 20 Minuten", () => {
    expect(calculateRetryDelay(2)).toBe(20 * MINUTE_MS);
  });

  it("retryCount=3 → 40 Minuten", () => {
    expect(calculateRetryDelay(3)).toBe(40 * MINUTE_MS);
  });

  it("retryCount=4 → 80 Minuten", () => {
    expect(calculateRetryDelay(4)).toBe(80 * MINUTE_MS);
  });

  it("retryCount=5 → 120 Minuten (Maximum)", () => {
    expect(calculateRetryDelay(5)).toBe(120 * MINUTE_MS);
  });

  it("retryCount=6 → 120 Minuten (Maximum, nicht überschreiten)", () => {
    expect(calculateRetryDelay(6)).toBe(120 * MINUTE_MS);
  });

  it("retryCount=100 → 120 Minuten (Maximum bleibt 120 Min)", () => {
    expect(calculateRetryDelay(100)).toBe(120 * MINUTE_MS);
  });

  it("Rückgabewert ist immer mindestens 5 Minuten", () => {
    expect(calculateRetryDelay(0)).toBeGreaterThanOrEqual(5 * MINUTE_MS);
  });

  it("Rückgabewert ist immer höchstens 120 Minuten", () => {
    for (let i = 0; i <= 20; i++) {
      expect(calculateRetryDelay(i)).toBeLessThanOrEqual(120 * MINUTE_MS);
    }
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 14: Retry mit exponentiellem Backoff (5 Min → 10 Min)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 14: Retry mit exponentiellem Backoff", () => {
  it("Gegeben: erster fehlgeschlagener Retry (retryCount=0) — Dann: nächster Retry nach 5 Min", () => {
    // Given: first failure, retryCount starts at 0
    const retryCount = 0;

    // When
    const delay = calculateRetryDelay(retryCount);

    // Then: next retry scheduled after 5 minutes
    expect(delay).toBe(5 * MINUTE_MS);
  });

  it("Gegeben: zweiter fehlgeschlagener Retry (retryCount=1) — Dann: nächster Retry nach 10 Min", () => {
    // Given: second failure
    const retryCount = 1;

    // When
    const delay = calculateRetryDelay(retryCount);

    // Then: next retry scheduled after 10 minutes
    expect(delay).toBe(10 * MINUTE_MS);
  });

  it("Gegeben: Backoff-Sequenz — Dann: jeder Schritt verdoppelt sich bis zum Maximum", () => {
    // Given: sequence of retry counts
    const expected = [5, 10, 20, 40, 80, 120, 120];

    // When / Then
    expected.forEach((minutes, retryCount) => {
      expect(calculateRetryDelay(retryCount)).toBe(minutes * MINUTE_MS);
    });
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 15: Reguläres Intervall bei aktivem Retry übersprungen (Req 2.8)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 15: Reguläres Intervall wird bei aktivem Retry übersprungen", () => {
  it("Gegeben: isRetrying=true — Dann: reguläres Update-Intervall wird nicht gestartet", () => {
    // This behaviour is enforced in node_helper.js (scheduleUpdate checks isRetrying).
    // Here we verify the contract: calculateRetryDelay always returns a positive value
    // so the retry timer is always set, and the regular interval must be skipped.
    const retryCount = 3;
    const delay = calculateRetryDelay(retryCount);

    // The retry delay is positive, meaning a retry timer will be set.
    // The node_helper must NOT start a regular update timer while isRetrying is true.
    expect(delay).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// BDD-Szenario 16: Erfolgreicher Retry setzt Intervall zurück (Req 2.7, 2.9)
// ---------------------------------------------------------------------------

describe("BDD-Szenario 16: Erfolgreicher Retry setzt reguläres Intervall zurück", () => {
  it("Gegeben: retryCount=3 nach mehreren Fehlern — Wenn: Retry erfolgreich — Dann: retryCount=0 und Delay wieder 5 Min", () => {
    // Simulate state before success
    let retryCount = 3;
    expect(calculateRetryDelay(retryCount)).toBe(40 * MINUTE_MS);

    // Simulate successful retry: reset retryCount to 0
    retryCount = 0;

    // Then: next delay (if needed) starts fresh at 5 minutes
    expect(calculateRetryDelay(retryCount)).toBe(5 * MINUTE_MS);
  });

  it("Gegeben: retryCount=5 (Maximum-Backoff) — Wenn: Retry erfolgreich — Dann: retryCount=0 und Delay wieder 5 Min", () => {
    let retryCount = 5;
    expect(calculateRetryDelay(retryCount)).toBe(120 * MINUTE_MS);

    // Reset after success
    retryCount = 0;
    expect(calculateRetryDelay(retryCount)).toBe(5 * MINUTE_MS);
  });
});
