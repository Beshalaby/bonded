import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth-client";

describe("safeNext (post-login redirect)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/runs/new")).toBe("/runs/new");
    expect(safeNext("/traces?model=sim%2Fcareful#s3")).toBe("/traces?model=sim%2Fcareful#s3");
  });
  it.each([
    ["//evil.example"], ["/\\evil.example"], ["/\\/evil.example"], ["/\t/evil.example"], ["/%0a/evil"], ["/.//evil.example"], ["/x/..//evil.example"], ["/./\\evil"],
    ["https://evil.example"], ["javascript:alert(1)"], ["evil"], [""], [null], [undefined],
  ])("rejects %j", (n) => {
    const out = safeNext(n as string | null | undefined);
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
    expect(new URL(out, "http://local.invalid").origin).toBe("http://local.invalid");
  });
});
