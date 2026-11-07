import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SceneCards } from "@/components/SceneCards";
import { ask, daily, type DailyResponse } from "@/lib/api";
import { history } from "@/lib/history";
import { navigate } from "@/lib/router";

export function AskPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dailySign, setDailySign] = useState<DailyResponse | null>(null);
  const streak = history.streak();

  useEffect(() => {
    let alive = true;
    daily()
      .then((data) => { if (alive) setDailySign(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await ask(trimmed);
      if (result.mode === "triage") {
        setError(result.triage?.message ?? "先处理眼前的风险。");
        return;
      }
      if (result.mode === "no_match" || !result.signToken) {
        setError("书里没有直接对应这一问。换一种说法，或从下面挑一个场景。");
        return;
      }
      navigate(`/sign/${result.signToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  async function openDaily() {
    try {
      const data = await daily();
      navigate(`/sign/${data.signToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "今日一签暂时打不开。");
    }
  }

  return (
    <main className="book-page">
      <header className="book-header">
        <p className="book-kicker">有据</p>
        <h1>你现在在纠结什么？</h1>
      </header>

      <section className="ask-box">
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例如：房东不退押金怎么办？"
          name="question"
          maxLength={200}
          rows={4}
        />
        <Button size="lg" onClick={() => submit(question)} disabled={loading || !question.trim()}>
          {loading ? "正在翻书…" : "翻一签"}
        </Button>
        {error ? <p className="ask-error" role="alert">{error}</p> : null}
      </section>

      {dailySign ? (
        <button className="daily-sign" onClick={openDaily}>
          <span>今日一签</span>
          <strong>{dailySign.sign.text}</strong>
          <small>{dailySign.sign.citation}</small>
        </button>
      ) : null}

      {streak >= 2 ? (
        <p className="ask-streak">连续 {streak} 天翻签 · <a href="/history">翻签记录</a></p>
      ) : null}

      <SceneCards onPick={submit} />
    </main>
  );
}
