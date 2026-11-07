import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { BookFlip } from "@/components/BookFlip";
import { SignCard } from "@/components/SignCard";
import { ShareCard } from "@/components/ShareCard";
import { decodeSignToken } from "@/lib/token";
import { downloadShareCard } from "@/lib/share";
import { navigate } from "@/lib/router";

export function SignPage({ token }: { token: string }) {
  const payload = decodeSignToken(token);
  const shareRef = useRef<HTMLDivElement>(null);

  if (!payload) {
    return (
      <main className="book-page">
        <h1>这张签打不开</h1>
        <p>可能链接被截断了。重新问一次就好。</p>
        <Button onClick={() => navigate("/")}>回去再翻一签</Button>
      </main>
    );
  }

  return (
    <main className="book-page">
      <BookFlip>
        <SignCard sign={payload.s} question={payload.q} />
      </BookFlip>
      <div className="sign-actions">
        <Button size="lg" onClick={() => navigate(`/expand/${token}`)}>展开这本账</Button>
        <Button variant="outline" onClick={() => shareRef.current && downloadShareCard(shareRef.current, "有据-签卡.png")}>
          存成签卡
        </Button>
      </div>
      <p className="sign-disclaimer">通用口径，不替代医生、律师、会计。</p>
      <ShareCard ref={shareRef} sign={payload.s} question={payload.q} />
    </main>
  );
}
