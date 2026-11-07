import { useRoute } from "@/lib/router";
import { AskPage } from "@/pages/Ask";
import { SignPage } from "@/pages/Sign";
import { ExpandPage } from "@/pages/Expand";
import { AboutPage } from "@/pages/About";
import { ApiPage } from "@/pages/Api";
import { HistoryPage } from "@/pages/History";
import { DISCLAIMER } from "@/shared/disclaimer";

export default function App() {
  const route = useRoute();
  return (
    <div className="app-shell">
      {route.name === "ask" ? <AskPage /> : null}
      {route.name === "sign" ? <SignPage token={route.token} /> : null}
      {route.name === "expand" ? <ExpandPage token={route.token} /> : null}
      {route.name === "about" ? <AboutPage /> : null}
      {route.name === "api" ? <ApiPage /> : null}
      {route.name === "history" ? <HistoryPage /> : null}
      <footer className="book-footer">
        <p>{DISCLAIMER}</p>
        <nav>
          <a href="/about">什么是答案之书</a>
          <a href="/history">翻签记录</a>
          <a href="/api">Agent API</a>
        </nav>
      </footer>
    </div>
  );
}
