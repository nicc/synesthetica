export interface LayoutPolicy {
  region: "left" | "right" | "top" | "bottom" | "center" | "full";
  scale?: number;
}

export interface CompositingPolicy {
  opacityMultiplier?: number;
  blendMode?: "normal" | "additive" | "multiply";
  zOrder?: number;
}

export interface Registration {
  id: string;
  name: string;

  motifs: Array<{
    motifId: string;
    enabled: boolean;
    params?: Record<string, unknown>;
    priority?: number;
  }>;

  layout?: LayoutPolicy;
  compositing?: CompositingPolicy;

  macros: {
    articulation: number;  // tight(0) .. loose(1)
    persistence: number;   // ephemeral(0) .. lingering(1)
    emphasis: {
      melody: number;
      harmony: number;
      rhythm: number;
      timbre: number;
    };
  };
}
