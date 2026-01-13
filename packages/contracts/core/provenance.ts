export type SourceId = "midi" | "audio" | (string & {});
export type StreamId = string;

export interface Provenance {
  source: SourceId;
  stream: StreamId;
  model?: string;
  version?: string;
}
