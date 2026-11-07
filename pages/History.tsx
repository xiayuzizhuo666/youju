import { useState } from "react";
import { Button } from "@/components/ui/button";
import { history } from "@/lib/history";
import { navigate } from "@/lib/router";

export function HistoryPage() {
  const [items, setItems] = useState(() => history.list());
  const streak = history.streak();

  function clear() {
    history.clear();
    setItems([]);
  }

  return (
    <main className="book-page">
      <header className="book-header">
        <p className="book-kicker">翻签记录</p>
        <h1>你翻过的签</h1>
      </header>

      {streak >= 2 ? <p className="history-streak">连续 {streak} 天翻签</p> : null}

      {items.length === 0 ? (
        <p className="history-empty">还没有记录。翻一签，这里会留在这台设备上。</p>
      ) : (
        <ol className="history-list">
          {items.map((item) => (
            <li key={`${item.entryId}-${item.savedAt}`} className="history-item">
              <p className="history-question">{item.question}</p>
              <p className="history-text">{item.text}</p>
              <p className="history-meta">
                {item.citation} · {new Date(item.savedAt).toLocaleDateString("zh-CN")}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="sign-actions">
        <Button onClick={() => navigate("/")}>再翻一签</Button>
        {items.length > 0 ? <Button variant="outline" onClick={clear}>清空记录</Button> : null}
      </div>
      <p className="sign-disclaimer">记录只存在这台设备的浏览器里，不上传服务器；清除浏览器数据即删除。</p>
    </main>
  );
}
