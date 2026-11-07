import bookMeta from "../data/book-meta.json";

export function AboutPage() {
  return (
    <main className="book-page about-page">
      <header className="book-header">
        <p className="book-kicker">关于</p>
        <h1>一本给你依据的答案之书</h1>
      </header>
      <section className="expand-section">
        <h2>内容来源</h2>
        <p>
          内容来自《高性价比人生指南》（
          <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noreferrer">HowToLiveBetter</a>
          ），正文按 CC BY 4.0 许可使用。本站做了结构化解析、检索、生成和界面改造，不是官方版本，也不代表原作者或出版方。
        </p>
      </section>
      <section className="expand-section">
        <h2>边界</h2>
        <p>通用口径，不替代医生、律师、会计；政策以当地部门为准。急症先打 120，心理危机先打 12356，正在进行的法律程序先找律师。</p>
      </section>
      <section className="expand-section">
        <h2>我们改了什么</h2>
        <p>把 772 条建议解析成结构化条目；按书的成本/收益/证据算法排序；加入章节路由、BM25 检索、判断守卫和引用校验；把条目做成可翻、可分享的签卡。</p>
      </section>
      <section className="expand-section">
        <h2>版本</h2>
        <p>书内容截至 {bookMeta.synced_at.slice(0, 10)}，共 {bookMeta.total} 条；证据分布 A {bookMeta.evidence.A} / B {bookMeta.evidence.B} / C {bookMeta.evidence.C}。</p>
      </section>
    </main>
  );
}
