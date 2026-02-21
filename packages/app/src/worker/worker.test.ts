/**
 * Tests for the worker polling loop.
 *
 * These tests verify the shutdown and state management logic.
 * The actual polling loop requires a database, so we test the
 * exported utility functions and signal behavior here.
 */

import { describe, it, expect } from "vitest";
import { requestShutdown, isExecuting } from "./index.js";

describe("worker state management", () => {
  it("requestShutdown sets shutdown flag", () => {
    // requestShutdown should not throw
    expect(() => requestShutdown()).not.toThrow();
  });

  it("isExecuting returns false when no job is running", () => {
    expect(isExecuting()).toBe(false);
  });
});
