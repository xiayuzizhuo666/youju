export type Evidence = "A" | "B" | "C";
export type Ratio = "极高" | "高" | "一般";

export interface BookEntry {
  id: string;
  section_no: number;
  section_title: string;
  item_no: number;
  title: string;
  cost: { money: string; time: string; will: string };
  benefit: { level: string; metric: string };
  evidence: Evidence;
  cost_text: string;
  plain: string;
  gain_text: string;
  source_text: string;
  source_links: string[];
  notes: string;
  population: string[];
  ratio: Ratio;
  dispute: boolean;
  todo: boolean;
}

export interface BookSection {
  no: number;
  title: string;
  intro: string;
  entries: BookEntry[];
}

export interface BookData {
  meta: {
    commit: string;
    synced_at: string;
    total: number;
    evidence: Record<Evidence, number>;
    license: string;
  };
  sections: BookSection[];
  entries: BookEntry[];
}

export type AskMode = "sign" | "triage" | "no_match" | "fallback";

export interface SignPayload {
  entry_id: string;
  text: string;
  plain: string;
  cost: BookEntry["cost"];
  benefit: BookEntry["benefit"];
  evidence: Evidence;
  citation: string;
  source_text: string;
  source_links: string[];
}

export interface ExpandAction {
  entry_id: string;
  action: string;
  cost: string;
  benefit: string;
  evidence: Evidence;
  citation: string;
}

export interface ExpandPayload {
  /** One-line conclusion: whether the trade is worth it and the first step. */
  conclusion?: string;
  actions: ExpandAction[];
  avoid: ExpandAction[];
  not_covered: string;
  refer: string;
  recheck: string;
}

/**
 * Compact, HMAC-signed token carried in `/sign/:token` and `/expand/:token`.
 * It only carries references (question, chosen entry, candidate entries,
 * expiry); the sign body is always re-hydrated from the book on the server so
 * a fabricated token cannot render a branded, book-cited card.
 */
export interface SignTokenPayload {
  q: string;
  id: string;
  c: string[];
  exp: number;
}

export interface AskResponse {
  ok: true;
  mode: AskMode;
  question: string;
  sign?: SignPayload;
  signToken?: string;
  triage?: { kind: "emergency" | "suicide" | "legal"; message: string; citation?: string };
  nearest_sections?: { no: number; title: string }[];
  /** True when the answer came from a generation-layer fallback, not the model. */
  degraded?: boolean;
  disclaimer: string;
}

export interface SignResponse {
  ok: true;
  question: string;
  sign: SignPayload;
  disclaimer: string;
}

export interface ExpandResponse {
  ok: true;
  expand: ExpandPayload;
  citations: string[];
  disclaimer: string;
}
