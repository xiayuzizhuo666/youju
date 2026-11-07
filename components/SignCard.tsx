import type { SignPayload } from "../shared/types";
import { Citation } from "./Citation";
import { CostRows } from "./CostRows";

export function SignCard({ sign, question, compact = false }: { sign: SignPayload; question: string; compact?: boolean }) {
  return (
    <article className="sign-card">
      <p className="sign-question">{question}</p>
      <h1 className="sign-text">{sign.text}</h1>
      <CostRows sign={sign} />
      <p className="sign-plain">{sign.plain}</p>
      <Citation citation={sign.citation} source={sign.source_text} links={sign.source_links} compact={compact} />
    </article>
  );
}
