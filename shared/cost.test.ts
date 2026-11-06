import { describe, expect, it } from "vitest";
import { costScore, ratioFor } from "./cost";

describe("costScore / ratioFor", () => {
  it("matches the book algorithm", () => {
    expect(costScore({ cost: { money: "0", time: "少", will: "些" } })).toBe(1);
    expect(ratioFor("中", 1)).toBe("一般");
    expect(ratioFor("大", 0)).toBe("极高");
    expect(ratioFor("大", 2)).toBe("高");
    expect(ratioFor("大", 3)).toBe("一般");
    expect(ratioFor("小", 0)).toBe("一般");
  });
});
