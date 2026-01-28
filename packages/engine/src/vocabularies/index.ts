export {
  MusicalVisualVocabulary,
  type MusicalVisualVocabularyConfig,
} from "./MusicalVisualVocabulary";

// Vocabulary utilities
export { buildChordShape } from "./utils";

// Rendering utilities for grammars
export {
  renderChordShape,
  colorToCSS,
  getDashArray,
  HUB_RADIUS,
  ARM_LENGTH,
  BASE_WIDTH,
  type ChordShapeRenderOptions,
  type ChordShapeRenderResult,
} from "./renderChordShape";

/**
 * @deprecated Use MusicalVisualVocabulary instead
 */
export { MusicalVisualVocabulary as MusicalVisualRuleset } from "./MusicalVisualVocabulary";

/**
 * @deprecated Use MusicalVisualVocabularyConfig instead
 */
export { type MusicalVisualVocabularyConfig as MusicalVisualRulesetConfig } from "./MusicalVisualVocabulary";
