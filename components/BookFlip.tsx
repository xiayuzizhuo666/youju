import type { ReactNode } from "react";

export function BookFlip({ children }: { children: ReactNode }) {
  return <div className="book-flip">{children}</div>;
}
