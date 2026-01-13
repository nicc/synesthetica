import type { CMSFrame } from "../cms/cms";
import type { PartId } from "../parts/parts";

export interface IRouter {
  route(frame: CMSFrame): Map<PartId, CMSFrame>;
}
