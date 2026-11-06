export function SignPage({ token }: { token: string }) {
  return <main className="book-page">签页建设中（{token.slice(0, 8)}…）</main>;
}
