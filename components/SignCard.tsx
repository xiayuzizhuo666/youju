import type { SignPayload } from "../shared/types";
import { Citation } from "./Citation";
import { CostRows } from "./CostRows";

export function SignCard({ sign, question }: { sign: SignPayload; question: string }) {
  return (
    <article className="sign-card">
      <p className="sign-question">{question}</p>
      <p className="sign-text">{sign.text}</p>
      <CostRows sign={sign} />
      <p className="sign-plain">{sign.plain}</p>
      <Citation citation={sign.citation} source={sign.source_text} links={sign.source_links} />
    </article>
  );
}
