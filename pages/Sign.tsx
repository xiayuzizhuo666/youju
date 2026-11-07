import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookFlip } from "@/components/BookFlip";
import { SignCard } from "@/components/SignCard";
import { ShareCard } from "@/components/ShareCard";
import { sign as fetchSign } from "@/lib/api";
import { decodeSignToken } from "@/lib/token";
import { downloadShareCard } from "@/lib/share";
import { history } from "@/lib/history";
import { navigate } from "@/lib/router";
import type { SignPayload } from "../shared/types";

interface SignState {
  sign: SignPayload;
  question: string;
  degraded: boolean;
}

export function SignPage({ token }: { token: string }) {
  // The token only carries references; the card is hydrated by the verified
  // `sign` action, never rendered from an unverified payload.
  const envelope = useMemo(() => decodeSignToken(token), [token]);
  const [state, setState] = useState<SignState | null>(null);
  const [error, setError] = useState("");
  const recordedToken = useRef("");
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    if (!envelope) return;
    let alive = true;
    setState(null);
    setError("");
    fetchSign(token)
      .then((result) => {
        if (!alive) return;
        setState({ sign: result.sign, question: result.question, degraded: result.degraded === true });
        if (recordedToken.current !== token) {
          recordedToken.current = token;
          history.record(result.question, result.sign);
        }
      })
      .catch((err) => {
        if (!alive) return;
        const message = err instanceof Error ? err.message : "";
        setError(message && !/failed to fetch/i.test(message) ? message : "这张签打不开或已过期，请重新翻一次。");
      });
    return () => { alive = false; };
  }, [token, envelope]);

  async function handleShare() {
    if (!shareRef.current || sharing) return;
    setSharing(true);
    setShareError("");
    try {
      await downloadShareCard(shareRef.current, "有据-签卡.png");
    } catch {
      setShareError("签卡没存下来，请再试一次。");
    } finally {
      setSharing(false);
    }
  }

  if (!envelope) {
    return (
      <main className="book-page">
        <h1>这张签打不开</h1>
        <p>可能链接被截断了。重新问一次就好。</p>
        <Button onClick={() => navigate("/")}>回去再翻一签</Button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="book-page">
        <h1>这张签打不开</h1>
        <p>{error}</p>
        <Button onClick={() => navigate("/")}>回去再翻一签</Button>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="book-page">
        <p className="book-kicker">有据</p>
        <p>正在翻回这张签…</p>
        {envelope.q ? <p className="sign-question">{envelope.q}</p> : null}
      </main>
    );
  }

  return (
    <main className="book-page">
      <BookFlip>
        <SignCard sign={state.sign} question={state.question} />
      </BookFlip>
      {state.degraded ? (
        <p className="degraded-note" role="status">模型这次没接上，这张签是按书里的排序兜底的。</p>
      ) : null}
      <div className="sign-actions">
        <Button size="lg" onClick={() => navigate(`/expand/${token}`)}>展开这本账</Button>
        <Button variant="outline" disabled={sharing} onClick={handleShare}>
          {sharing ? "正在生成…" : "存成签卡"}
        </Button>
      </div>
      {shareError ? <p className="share-error" role="alert">{shareError}</p> : null}
      <p className="sign-disclaimer">通用口径，不替代医生、律师、会计。</p>
      <ShareCard ref={shareRef} sign={state.sign} question={state.question} />
    </main>
  );
}
