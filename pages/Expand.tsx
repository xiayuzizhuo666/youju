import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExpandView } from "@/components/ExpandView";
import { expand } from "@/lib/api";
import { navigate } from "@/lib/router";
import type { ExpandResponse } from "../shared/types";

function expandWaitStatus(elapsed: number): string {
  if (elapsed < 3) return "正在算这本账…";
  if (elapsed < 8) return "还在算，模型正在核对书里的条目…";
  return "快好了；模型有时会多花几秒。";
}

function ExpandSkeleton({ token }: { token: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="book-page" aria-busy="true">
      <header className="book-header">
        <p className="book-kicker">这本账</p>
        <h1>书里算了这几笔</h1>
      </header>
      <div className="expand-progress" role="status" aria-live="polite">
        <span>{expandWaitStatus(elapsed)}</span>
        <span className="expand-progress-time">{elapsed}s</span>
      </div>
      <div className="expand-progress-bar" aria-hidden="true"><span /></div>
      <section className="expand-section" aria-hidden="true">
        <div className="skeleton-line skeleton-short" />
        <div className="skeleton-line" />
      </section>
      <section className="expand-section" aria-hidden="true">
        <div className="skeleton-line skeleton-short" />
        {[0, 1, 2].map((index) => (
          <div className="skeleton-action" key={index}>
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-meta" />
          </div>
        ))}
      </section>
      {elapsed >= 8 ? (
        <div className="sign-actions">
          <Button variant="outline" onClick={() => navigate(`/sign/${token}`)}>等太久？回到签卡</Button>
        </div>
      ) : null}
    </main>
  );
}

export function ExpandPage({ token }: { token: string }) {
  const [data, setData] = useState<ExpandResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    expand(token)
      .then((result) => { if (alive) setData(result); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : "算账失败，请重试。"); });
    return () => { alive = false; };
  }, [token]);

  if (error) {
    return (
      <main className="book-page">
        <h1>这本账没算成</h1>
        <p>{error}</p>
        <Button onClick={() => navigate(`/sign/${token}`)}>回到签卡</Button>
      </main>
    );
  }

  if (!data) return <ExpandSkeleton token={token} />;

  return (
    <main className="book-page">
      <header className="book-header">
        <p className="book-kicker">这本账</p>
        <h1>书里算了这几笔</h1>
      </header>
      {data.degraded || data.expand.degraded ? (
        <p className="degraded-note" role="status">模型这次没接上，下面这些动作是按书里的排序兜底的。</p>
      ) : null}
      <ExpandView expand={data.expand} />
      <p className="sign-disclaimer">{data.disclaimer}</p>
      <div className="sign-actions">
        <Button variant="outline" onClick={() => navigate("/")}>再问一件</Button>
      </div>
    </main>
  );
}
