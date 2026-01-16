import type { SessionMs } from "../core/time";
import type { PartId } from "../parts/parts";

/**
 * Diagnostic categories for grouping and visual indication.
 */
export type DiagnosticCategory = "input" | "stabilizer" | "grammar" | "control";

/**
 * Diagnostic severity levels.
 */
export type DiagnosticSeverity = "info" | "warning" | "error";

/**
 * A runtime diagnostic emitted when something goes wrong but the system
 * can continue operating (graceful degradation).
 */
export interface Diagnostic {
  /** Unique identifier for deduplication */
  id: string;

  /** Category for grouping and visual indication */
  category: DiagnosticCategory;

  /** Severity level */
  severity: DiagnosticSeverity;

  /** Human-readable message */
  message: string;

  /** When the diagnostic was emitted */
  timestamp: SessionMs;

  /** Optional: which component emitted this */
  source?: string;

  /** Optional: associated part */
  partId?: PartId;

  /**
   * Persistence mode:
   * - "transient": auto-clears after a few seconds
   * - "sticky": persists until condition clears
   */
  persistence: "transient" | "sticky";
}

/**
 * A validation error returned when a control op fails validation.
 */
export interface ValidationError {
  /** Which field or parameter failed */
  field: string;

  /** What went wrong */
  reason: string;

  /** Optional: what values are valid */
  hint?: string;
}

/**
 * Result of executing a control operation.
 */
export interface ControlOpResult {
  /** Whether the op was accepted and applied */
  success: boolean;

  /** If rejected, why */
  errors?: ValidationError[];

  /** Diagnostics emitted during execution (even if successful) */
  diagnostics?: Diagnostic[];
}
