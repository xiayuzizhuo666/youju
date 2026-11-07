import type { ExpandPayload } from "../shared/types";

function ActionList({ title, items }: { title: string; items: ExpandPayload["actions"] }) {
  if (items.length === 0) return null;
  return (
    <section className="expand-section">
      <h2>{title}</h2>
      <ol className="expand-list">
        {items.map((item) => (
          <li key={`${item.entry_id}-${item.action}`}>
            <p className="expand-action">{item.action}</p>
            <p className="expand-meta">{item.cost} · {item.benefit} · 证据 {item.evidence}</p>
            <p className="expand-citation">{item.citation}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ExpandView({ expand }: { expand: ExpandPayload }) {
  return (
    <div className="expand">
      {expand.conclusion ? (
        <section className="expand-section expand-conclusion">
          <h2>一句话结论</h2>
          <p className="expand-action">{expand.conclusion}</p>
        </section>
      ) : null}
      <ActionList title="先做这几条" items={expand.actions} />
      <ActionList title="别做 / 不用做" items={expand.avoid} />
      {expand.not_covered ? (
        <section className="expand-section">
          <h2>书里没写的</h2>
          <p className="expand-note">不是书里的内容，只是常识提醒。</p>
          <p>{expand.not_covered}</p>
        </section>
      ) : null}
      {expand.refer ? <section className="expand-section"><h2>该找谁</h2><p>{expand.refer}</p></section> : null}
      {expand.recheck ? <section className="expand-section"><h2>什么时候回来看</h2><p>{expand.recheck}</p></section> : null}
    </div>
  );
}
