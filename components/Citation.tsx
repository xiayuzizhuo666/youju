export function Citation({ citation, source, links }: { citation: string; source: string; links: string[] }) {
  return (
    <footer className="citation">
      <p>{citation}</p>
      <p>{source}</p>
      {links.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">{link}</a>)}
    </footer>
  );
}
