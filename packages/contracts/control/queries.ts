import type { Registration } from "../config/registration";
import type { PartMeta, PartId } from "../parts/parts";
import type { MotifId, RegistrationId } from "./control_ops";

export type Query =
  | { q: "listRegistrations" }
  | { q: "describeRegistration"; registrationId: RegistrationId }
  | { q: "listMotifs" }
  | { q: "getParts" }
  | { q: "getPartMeta"; partId: PartId }
  | { q: "getAssignments" };

export type QueryResult =
  | { q: "listRegistrations"; registrations: Array<Pick<Registration, "id" | "name">> }
  | { q: "describeRegistration"; registration: Registration }
  | { q: "listMotifs"; motifs: Array<{ id: MotifId; name?: string }> }
  | { q: "getParts"; parts: PartId[] }
  | { q: "getPartMeta"; meta: PartMeta }
  | { q: "getAssignments"; assignments: Array<{ partId: PartId; registrationId?: RegistrationId }> };
