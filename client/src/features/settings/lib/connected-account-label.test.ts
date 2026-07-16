import { describe, expect, it } from "vitest"

import { formatConnectedAccountLabel } from "./connected-account-label"

describe("formatConnectedAccountLabel", () => {
  it("prefers display name over username", () => {
    expect(
      formatConnectedAccountLabel({
        accountId: "acc_1",
        displayName: "My Page",
        username: "mypage",
      }),
    ).toBe("My Page · @mypage")
  })

  it("does not show synthetic rednote account ids", () => {
    expect(
      formatConnectedAccountLabel({
        accountId: "rednote:user-uuid",
        displayName: null,
        username: null,
      }),
    ).toBe("")
  })

  it("shows rednote handle without @ prefix", () => {
    expect(
      formatConnectedAccountLabel({
        accountId: "rednote:user-uuid",
        displayName: "红薯蜀",
        username: "红薯蜀",
      }),
    ).toBe("红薯蜀")
  })

  it("ignores synthetic values stored in username fields", () => {
    expect(
      formatConnectedAccountLabel({
        accountId: "rednote:user-uuid",
        displayName: "rednote:user-uuid",
        username: "rednote:user-uuid",
      }),
    ).toBe("")
  })
})
