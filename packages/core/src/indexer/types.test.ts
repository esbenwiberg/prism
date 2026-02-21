/**
 * Tests for indexer types and utilities.
 */

import { describe, it, expect } from "vitest";
import { createBudgetTracker } from "./types.js";

describe("BudgetTracker", () => {
  it("tracks spending", () => {
    const tracker = createBudgetTracker(10.0);
    expect(tracker.budgetUsd).toBe(10.0);
    expect(tracker.spentUsd).toBe(0);
    expect(tracker.remaining).toBe(10.0);
    expect(tracker.exceeded).toBe(false);

    tracker.record(3.5);
    expect(tracker.spentUsd).toBe(3.5);
    expect(tracker.remaining).toBe(6.5);
    expect(tracker.exceeded).toBe(false);
  });

  it("detects when budget is exceeded", () => {
    const tracker = createBudgetTracker(5.0);
    tracker.record(5.0);
    expect(tracker.exceeded).toBe(true);
    expect(tracker.remaining).toBe(0);
  });

  it("clamps remaining to zero when overspent", () => {
    const tracker = createBudgetTracker(5.0);
    tracker.record(7.0);
    expect(tracker.exceeded).toBe(true);
    expect(tracker.remaining).toBe(0);
  });
});
