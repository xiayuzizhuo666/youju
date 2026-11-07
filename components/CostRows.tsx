import type { SignPayload } from "../shared/types";

export function CostRows({ sign }: { sign: SignPayload }) {
  const money = sign.cost.money === "0" ? "不花钱" : `钱 ${sign.cost.money}`;
  return (
    <dl className="cost-rows">
      <div><dt>花掉</dt><dd>{money} · 时间 {sign.cost.time} · 毅力 {sign.cost.will}</dd></div>
      <div><dt>换回</dt><dd>{sign.benefit.level}（{sign.benefit.metric}）</dd></div>
      <div><dt>证据</dt><dd>{sign.evidence} 级</dd></div>
    </dl>
  );
}
