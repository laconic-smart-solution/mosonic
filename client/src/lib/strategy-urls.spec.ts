import { describe, expect, it } from "vitest"
import {
  collectStrategyUrls,
  extractUrlsFromText,
  normalizeHttpUrl,
} from "@/lib/strategy-urls"

describe("normalizeHttpUrl", () => {
  it("adds https for bare hosts", () => {
    expect(normalizeHttpUrl("zenichub.com/en")).toBe("https://zenichub.com/en")
  })

  it("keeps full URLs", () => {
    expect(normalizeHttpUrl("https://www.adidas.co.th/th")).toBe(
      "https://www.adidas.co.th/th",
    )
  })
})

describe("extractUrlsFromText", () => {
  it("extracts pasted marketing URLs", () => {
    expect(
      extractUrlsFromText(
        "https://zenichub.com/en https://www.adidas.co.th/th",
      ),
    ).toEqual([
      "https://zenichub.com/en",
      "https://www.adidas.co.th/th",
    ])
  })
})

describe("collectStrategyUrls", () => {
  it("merges attachment urls with text urls", () => {
    expect(
      collectStrategyUrls("also see adidas.co.th/th", [
        "https://zenichub.com/en",
      ]),
    ).toEqual([
      "https://zenichub.com/en",
      "https://adidas.co.th/th",
    ])
  })
})
