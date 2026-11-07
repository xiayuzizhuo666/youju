const COMPACT_SOURCE_CHARS = 140;

export function Citation({
  citation,
  source,
  links,
  compact = false,
}: {
  citation: string;
  source: string;
  links: string[];
  compact?: boolean;
}) {
  if (compact) {
    const chars = Array.from(source);
    const truncated = chars.length > COMPACT_SOURCE_CHARS
      ? `${chars.slice(0, COMPACT_SOURCE_CHARS).join("")}…`
      : source;
    return (
      <footer className="citation citation-compact">
        <p>{citation}</p>
        <p>{truncated}</p>
        <p>共 {links.length} 条来源，见有据原页</p>
      </footer>
    );
  }
  return (
    <footer className="citation">
      <p>{citation}</p>
      <p>{source}</p>
      {links.map((link, index) => <a key={`${index}-${link}`} href={link} target="_blank" rel="noreferrer">{link}</a>)}
    </footer>
  );
}
