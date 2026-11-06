import { describe, expect, it } from "vitest";
import { parseSection } from "./parse-book";

const FIXTURE = `[← 回总目录](../README.md)

# 10. 恋爱和结婚划不划算

本节导读。

### 1. 认识更多人，而不是死磕一个
<!-- 成本标签: 钱=0 时间=中 毅力=些 收益=中 口径=时间 -->
- 成本：不花钱。
- 说人话：多见几个人。
- 收益：见面才知道。
- 证据等级：A
- 来源：Joel S, et al. (2017). <https://doi.org/10.1177/0956797617714580>
- 备注：研究对象是欧美大学生。

### 2. 对方明确拒绝之后就停下
<!-- 成本标签: 钱=0 时间=少 毅力=是 收益=中 口径=自由 人群=成年人 -->
- 成本：不花钱。
- 说人话：拒绝就停。
- 收益：避免治安违法。
- 证据等级：A
- 来源：治安管理处罚法. <https://www.spp.gov.cn/spp/fl/202506/t20250627_699863.shtml>
- 备注：争议。个案要找律师。
`;

describe("parseSection", () => {
  it("parses section and entry fields", () => {
    const section = parseSection(FIXTURE, "10-恋爱和结婚划不划算.md");
    expect(section.no).toBe(10);
    expect(section.title).toBe("恋爱和结婚划不划算");
    expect(section.entries).toHaveLength(2);
    const first = section.entries[0];
    expect(first.id).toBe("10-1");
    expect(first.title).toBe("认识更多人，而不是死磕一个");
    expect(first.cost).toEqual({ money: "0", time: "中", will: "些" });
    expect(first.benefit).toEqual({ level: "中", metric: "时间" });
    expect(first.evidence).toBe("A");
    expect(first.source_links).toEqual(["https://doi.org/10.1177/0956797617714580"]);
    expect(first.ratio).toBe("一般");
    expect(first.dispute).toBe(false);
    expect(section.entries[1].population).toEqual(["成年人"]);
    expect(section.entries[1].dispute).toBe(true);
  });
});
