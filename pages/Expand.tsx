import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExpandView } from "@/components/ExpandView";
import { expand } from "@/lib/api";
import { navigate } from "@/lib/router";
import type { ExpandResponse } from "../shared/types";

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

  if (!data) return <main className="book-page"><p>正在算这本账…</p></main>;

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
