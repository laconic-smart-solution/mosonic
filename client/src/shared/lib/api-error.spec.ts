import axios from "axios"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string) => key,
  },
}))

import {
  getApiErrorMessage,
  isInsufficientCredits,
  isNetworkError,
  parseApiError,
} from "./api-error"

describe("parseApiError", () => {
  it("reads string message from axios response", () => {
    const err = new axios.AxiosError(
      "fail",
      "ERR",
      undefined,
      undefined,
      {
        status: 400,
        data: { message: "Bad input", error: "ValidationFailed" },
        statusText: "400",
        headers: {},
        config: {} as never,
      },
    )
    const parsed = parseApiError(err)
    expect(parsed.status).toBe(400)
    expect(parsed.message).toBe("Bad input")
    expect(parsed.error).toBe("ValidationFailed")
  })

  it("detects insufficient credits by status and error code", () => {
    const byStatus = new axios.AxiosError("fail", "ERR", undefined, undefined, {
      status: 402,
      data: { error: "InsufficientCredits", message: "Need more credits" },
      statusText: "402",
      headers: {},
      config: {} as never,
    })
    expect(isInsufficientCredits(byStatus)).toBe(true)
    expect(getApiErrorMessage(byStatus)).toBe("credit:runConfirm.insufficientTitle")
  })

  it("detects network errors", () => {
    const err = new axios.AxiosError("Network Error", "ERR_NETWORK")
    expect(isNetworkError(err)).toBe(true)
    expect(getApiErrorMessage(err)).toBe("common:errors.network")
  })

  it("maps auth error codes to i18n fallbacks", () => {
    const err = new axios.AxiosError("fail", "ERR", undefined, undefined, {
      status: 401,
      data: { error: "InvalidCredentials" },
      statusText: "401",
      headers: {},
      config: {} as never,
    })
    expect(getApiErrorMessage(err)).toBe("auth:errors.invalidCredentials")
  })
})
