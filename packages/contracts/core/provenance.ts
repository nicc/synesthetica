// Allow known source types with autocomplete, plus arbitrary strings
// eslint-disable-next-line @typescript-eslint/ban-types
export type SourceId = "midi" | "audio" | (string & {});
export type StreamId = string;

export interface Provenance {
  source: SourceId;
  stream: StreamId;
  model?: string;
  version?: string;
}
