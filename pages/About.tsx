export function AboutPage() {
  return (
    <main className="book-page about-page">
      <header className="book-header">
        <p className="book-kicker">关于</p>
        <h1>什么是答案之书</h1>
      </header>
      <section className="expand-section">
        <p>你问一件正在纠结的事，它从书里翻出一条最相关的建议，连同成本、收益、证据和出处一起给你。它不是替你决定，而是给你一个看问题的视角。</p>
      </section>
      <section className="expand-section">
        <h2>怎么用</h2>
        <p>写下问题 → 翻一签 → 展开这本账。签文是书里的一条建议；展开会按成本、收益和证据排序，告诉你先做什么、别做什么、书里没写的，以及什么时候该找医生或律师。</p>
      </section>
      <section className="expand-section">
        <h2>记录</h2>
        <p>翻签记录只存在你这台设备的浏览器里，不上传服务器，也不用于训练；清除浏览器数据即删除。</p>
      </section>
      <section className="expand-section">
        <h2>边界</h2>
        <p>急症先打 120，心理危机先打 12356，正在进行的法律程序先找律师。通用口径，不替代医生、律师、会计。</p>
      </section>
      <section className="expand-section">
        <h2>来源与许可</h2>
        <p>
          内容来自《高性价比人生指南》（
          <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noreferrer">HowToLiveBetter</a>
          ），按 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 许可使用，有修改；不是官方版本，也不代表原作者或出版方。
        </p>
      </section>
    </main>
  );
}