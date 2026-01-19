/**
 * Golden Test Harness
 *
 * Utilities for loading fixtures, comparing frames, and updating golden files.
 * Golden tests compare actual module output against saved "known good" fixtures.
 *
 * Usage:
 *   const { input, expected } = loadFixture<StabilizerFixture>('stabilizer/note-tracking/basic-note.json');
 *   const actual = stabilizer.process(input);
 *   expectFrameEquals(actual, expected);
 *
 * To update fixtures when behavior intentionally changes:
 *   UPDATE_GOLDEN=1 npm test
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { dirname, resolve } from "path";
import { expect } from "vitest";

// ============================================================================
// Types
// ============================================================================

/**
 * Generic fixture shape - input/expected pairs for any boundary.
 */
export interface Fixture<TInput, TOutput> {
  description: string;
  input: TInput;
  expected: TOutput;
}

/**
 * Sequence fixture for testing stateful modules across multiple frames.
 * Each step feeds input and checks expected output at that point in time.
 */
export interface SequenceFixture<TInput, TOutput> {
  name: string;
  description: string;
  config?: Record<string, unknown>;
  steps: Array<{
    t: number;
    input: TInput;
    expected: TOutput;
  }>;
}

/**
 * Options for frame comparison.
 */
export interface CompareOptions {
  /** Tolerance for floating point comparisons (default: 1e-10) */
  floatTolerance?: number;
  /** Fields to ignore during comparison */
  ignoreFields?: string[];
}

// ============================================================================
// Fixture Loading
// ============================================================================

const FIXTURES_DIR = resolve(__dirname, "fixtures");

/**
 * Load a JSON fixture file.
 *
 * @param relativePath - Path relative to fixtures/ directory
 * @returns Parsed fixture data
 * @throws If file doesn't exist or isn't valid JSON
 */
export function loadFixture<T>(relativePath: string): T {
  const fullPath = resolve(FIXTURES_DIR, relativePath);

  if (!existsSync(fullPath)) {
    throw new Error(`Fixture not found: ${relativePath}\n  at: ${fullPath}`);
  }

  const content = readFileSync(fullPath, "utf-8");

  try {
    return JSON.parse(content) as T;
  } catch (e) {
    throw new Error(
      `Invalid JSON in fixture: ${relativePath}\n  ${e instanceof Error ? e.message : e}`
    );
  }
}

/**
 * Load all fixtures from a directory.
 *
 * @param dir - Directory path relative to fixtures/
 * @returns Array of fixture data
 */
export function loadFixturesFromDir<T>(dir: string): T[] {
  const fullPath = resolve(FIXTURES_DIR, dir);

  if (!existsSync(fullPath)) {
    return [];
  }

  const files = readdirSync(fullPath).filter((f: string) => f.endsWith(".json"));

  return files.map((f: string) => loadFixture<T>(`${dir}/${f}`));
}

// ============================================================================
// Frame Comparison
// ============================================================================

/**
 * Deep equality check with float tolerance and field ignoring.
 *
 * @returns null if equal, or a diff description if not
 */
export function compareDeep(
  actual: unknown,
  expected: unknown,
  options: CompareOptions = {},
  path: string = ""
): string | null {
  const { floatTolerance = 1e-10, ignoreFields = [] } = options;

  // Check ignored fields
  const fieldName = path.split(".").pop() || "";
  if (ignoreFields.includes(fieldName)) {
    return null;
  }

  // Handle null/undefined
  if (actual === null && expected === null) return null;
  if (actual === undefined && expected === undefined) return null;
  if (actual === null || actual === undefined) {
    return `${path || "root"}: expected ${JSON.stringify(expected)}, got ${actual}`;
  }
  if (expected === null || expected === undefined) {
    return `${path || "root"}: expected ${expected}, got ${JSON.stringify(actual)}`;
  }

  // Handle primitives
  if (typeof actual !== typeof expected) {
    return `${path || "root"}: type mismatch - expected ${typeof expected}, got ${typeof actual}`;
  }

  if (typeof actual === "number" && typeof expected === "number") {
    if (Number.isNaN(actual) && Number.isNaN(expected)) return null;
    if (Math.abs(actual - expected) > floatTolerance) {
      return `${path || "root"}: ${actual} !== ${expected} (diff: ${Math.abs(actual - expected)})`;
    }
    return null;
  }

  if (typeof actual === "string" || typeof actual === "boolean") {
    if (actual !== expected) {
      return `${path || "root"}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`;
    }
    return null;
  }

  // Handle arrays
  if (Array.isArray(actual)) {
    if (!Array.isArray(expected)) {
      return `${path || "root"}: expected array, got ${typeof expected}`;
    }
    if (actual.length !== expected.length) {
      return `${path || "root"}: array length ${actual.length} !== ${expected.length}`;
    }
    for (let i = 0; i < actual.length; i++) {
      const diff = compareDeep(actual[i], expected[i], options, `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  // Handle objects
  if (typeof actual === "object") {
    if (typeof expected !== "object" || Array.isArray(expected)) {
      return `${path || "root"}: expected object, got ${Array.isArray(expected) ? "array" : typeof expected}`;
    }

    const actualKeys = Object.keys(actual as object).filter(
      (k) => !ignoreFields.includes(k)
    );
    const expectedKeys = Object.keys(expected as object).filter(
      (k) => !ignoreFields.includes(k)
    );

    // Check for missing/extra keys
    const missingKeys = expectedKeys.filter((k) => !actualKeys.includes(k));
    const extraKeys = actualKeys.filter((k) => !expectedKeys.includes(k));

    if (missingKeys.length > 0) {
      return `${path || "root"}: missing keys: ${missingKeys.join(", ")}`;
    }
    if (extraKeys.length > 0) {
      return `${path || "root"}: extra keys: ${extraKeys.join(", ")}`;
    }

    // Compare each key
    for (const key of actualKeys) {
      const diff = compareDeep(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        options,
        path ? `${path}.${key}` : key
      );
      if (diff) return diff;
    }
    return null;
  }

  return `${path || "root"}: unexpected type ${typeof actual}`;
}

/**
 * Assert that actual frame equals expected, with helpful diff on failure.
 */
export function expectFrameEquals<T>(
  actual: T,
  expected: T,
  options: CompareOptions = {}
): void {
  const diff = compareDeep(actual, expected, options);

  if (diff) {
    // Provide full context on failure
    expect.fail(
      `Frame mismatch:\n  ${diff}\n\nActual:\n${JSON.stringify(actual, null, 2)}\n\nExpected:\n${JSON.stringify(expected, null, 2)}`
    );
  }
}

// ============================================================================
// Fixture Updates
// ============================================================================

/**
 * Check if golden fixtures should be updated (UPDATE_GOLDEN=1 env var).
 */
export function shouldUpdateGolden(): boolean {
  return process.env.UPDATE_GOLDEN === "1";
}

/**
 * Update a fixture file with new expected output.
 * Only works when UPDATE_GOLDEN=1 is set.
 *
 * @param relativePath - Path relative to fixtures/
 * @param fixture - New fixture data to write
 */
export function updateFixture<T>(relativePath: string, fixture: T): void {
  if (!shouldUpdateGolden()) {
    throw new Error(
      "Cannot update fixture without UPDATE_GOLDEN=1 environment variable"
    );
  }

  const fullPath = resolve(FIXTURES_DIR, relativePath);
  const dir = dirname(fullPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(fullPath, JSON.stringify(fixture, null, 2) + "\n", "utf-8");
  console.log(`Updated fixture: ${relativePath}`);
}

/**
 * Helper for tests that auto-update when UPDATE_GOLDEN=1.
 * Compares actual to expected, updating fixture if env var is set.
 */
export function assertOrUpdate<TInput, TOutput>(
  relativePath: string,
  fixture: Fixture<TInput, TOutput>,
  actual: TOutput,
  options: CompareOptions = {}
): void {
  if (shouldUpdateGolden()) {
    const updated: Fixture<TInput, TOutput> = {
      ...fixture,
      expected: actual,
    };
    updateFixture(relativePath, updated);
  } else {
    expectFrameEquals(actual, fixture.expected, options);
  }
}
