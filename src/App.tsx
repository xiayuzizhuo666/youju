import { useRoute } from "@/lib/router";
import { AskPage } from "@/pages/Ask";
import { SignPage } from "@/pages/Sign";
import { ExpandPage } from "@/pages/Expand";
import { AboutPage } from "@/pages/About";
import { ApiPage } from "@/pages/Api";

export default function App() {
  const route = useRoute();
  return (
    <div className="app-shell">
      {route.name === "ask" ? <AskPage /> : null}
      {route.name === "sign" ? <SignPage token={route.token} /> : null}
      {route.name === "expand" ? <ExpandPage token={route.token} /> : null}
      {route.name === "about" ? <AboutPage /> : null}
      {route.name === "api" ? <ApiPage /> : null}
      <footer className="book-footer">
        <p>内容来自《高性价比人生指南》，CC BY 4.0，有修改；不是官方版本。</p>
        <nav>
          <a href="/about">来源与许可</a>
          <a href="/api">Agent API</a>
        </nav>
      </footer>
    </div>
  );
}
