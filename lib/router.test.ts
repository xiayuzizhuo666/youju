import { describe, expect, it } from "vitest";
import { parseRoute } from "./router";

describe("parseRoute", () => {
  it("maps paths", () => {
    expect(parseRoute("/")).toEqual({ name: "ask" });
    expect(parseRoute("/sign/abc.def")).toEqual({ name: "sign", token: "abc.def" });
    expect(parseRoute("/expand/abc.def")).toEqual({ name: "expand", token: "abc.def" });
    expect(parseRoute("/about")).toEqual({ name: "about" });
    expect(parseRoute("/api")).toEqual({ name: "api" });
    expect(parseRoute("/history")).toEqual({ name: "history" });
    expect(parseRoute("/unknown")).toEqual({ name: "ask" });
  });
});
