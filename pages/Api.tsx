export function ApiPage() {
  return (
    <main className="book-page about-page">
      <header className="book-header">
        <p className="book-kicker">Agent API</p>
        <h1>让别的智能体来翻这本书</h1>
      </header>
      <section className="expand-section">
        <p><a href="/openapi.json" target="_blank" rel="noreferrer">OpenAPI 3.0</a></p>
        <h2>ask_life_question</h2>
        <pre className="code-block">{`POST /functions/v1/app
{"action":"agent","tool":"ask_life_question","input":{"question":"房东不退押金怎么办"}}`}</pre>
        <p>返回签、展开账、引用与免责声明；医疗、法律、金融只给方向和该找谁。</p>
      </section>
      <section className="expand-section">
        <h2>get_daily_sign</h2>
        <pre className="code-block">{`POST /functions/v1/app
{"action":"agent","tool":"get_daily_sign","input":{}}`}</pre>
      </section>
      <section className="expand-section">
        <h2>get_book_meta</h2>
        <pre className="code-block">{`POST /functions/v1/app
{"action":"agent","tool":"get_book_meta","input":{}}`}</pre>
      </section>
    </main>
  );
}
