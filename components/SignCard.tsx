import type { SignPayload } from "../shared/types";
import { Citation } from "./Citation";
import { CostRows } from "./CostRows";

export function SignCard({ sign, question, summary, compact = false }: { sign: SignPayload; question: string; summary?: string; compact?: boolean }) {
  const shownQuestion = compact && question.length > 80 ? `${question.slice(0, 80)}…` : question;
  return (
    <article className="sign-card">
      <p className="sign-question">{shownQuestion}</p>
      {summary ? (
        <section className="sign-summary">
          <p className="sign-summary-label">据书整理</p>
          <p className="sign-summary-text">{summary}</p>
        </section>
      ) : null}
      <h1 className="sign-text">{sign.text}</h1>
      <CostRows sign={sign} />
      <p className="sign-plain">{sign.plain}</p>
      <Citation citation={sign.citation} source={sign.source_text} links={sign.source_links} compact={compact} />
    </article>
  );
}
