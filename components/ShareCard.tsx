import { forwardRef } from "react";
import type { SignPayload } from "../shared/types";
import { SignCard } from "./SignCard";

export const ShareCard = forwardRef<HTMLDivElement, { sign: SignPayload; question: string }>(
  function ShareCard({ sign, question }, ref) {
    return (
      <div className="share-card-stage" aria-hidden="true">
        <div ref={ref} className="share-card">
          <p className="share-brand">有据</p>
          <SignCard sign={sign} question={question} compact />
          <p className="share-note">内容来自《高性价比人生指南》，CC BY 4.0，有修改；不是官方版本。</p>
        </div>
      </div>
    );
  },
);
