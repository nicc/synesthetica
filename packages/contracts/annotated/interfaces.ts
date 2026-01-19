/**
 * RFC 006 Pipeline Interfaces
 *
 * Re-exports the main pipeline interfaces for convenience.
 * The canonical definitions are in pipeline/interfaces.ts.
 *
 * See RFC 006 for design rationale.
 */

// Re-export the canonical interfaces
export type {
  IVisualRuleset,
  IVisualGrammar,
  GrammarContext,
} from "../pipeline/interfaces";
