export function ExpandPage({ token }: { token: string }) {
  return <main className="book-page">这本账建设中（{token.slice(0, 8)}…）</main>;
}
