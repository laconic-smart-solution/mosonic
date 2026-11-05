import { dedupeAskQuestion, displayUserChoice } from "./parse-ask-user"
import { describe, expect, it } from "vitest"
import { formatAskUserChoice, normalizeUserUrl, optionNeedsUrl, parseAskUserPrompt } from "./parse-ask-user"

describe("parseAskUserPrompt", () => {
  it("parses a yes_no marker", () => {
    const prompt = parseAskUserPrompt(
      JSON.stringify({
        action: "ask_user",
        type: "yes_no",
        question: "Create the profile?",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      }),
    )
    expect(prompt?.type).toBe("yes_no")
    expect(formatAskUserChoice(prompt!, ["yes"])).toBe("User choice: yes (Yes)")
  })

  it("returns null for non-markers", () => {
    expect(parseAskUserPrompt("plain observation")).toBeNull()
  })
})

describe("ask_user URL options and confirmation notice", () => {
  it("keeps inputType and flags website options as needing a URL", () => {
    const prompt = parseAskUserPrompt(
      JSON.stringify({
        action: "ask_user",
        type: "single",
        question: "How should we start?",
        options: [
          { id: "name_industry", label: "I can share the name and industry" },
          { id: "website_url", label: "I have a website URL", inputType: "url" },
        ],
      }),
    )!
    expect(prompt.options[1].inputType).toBe("url")
    expect(optionNeedsUrl(prompt.options[0])).toBe(false)
    expect(optionNeedsUrl({ id: "site", label: "I have a website" })).toBe(true)
    expect(formatAskUserChoice(prompt, ["website_url"], "https://baanbrew.co/")).toBe(
      "User choice: website_url (I have a website URL)\nhttps://baanbrew.co/",
    )
  })

  it("reads the server confirmation card notice", () => {
    const prompt = parseAskUserPrompt(
      JSON.stringify({
        ok: false,
        code: "confirmation_required",
        action: "ask_user",
        type: "yes_no",
        confirmFor: "approve_content",
        question: "Approve this draft?",
        message: "I need your confirmation before I do this.",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      }),
    )!
    expect(prompt.confirmFor).toBe("approve_content")
    expect(prompt.notice).toBe("I need your confirmation before I do this.")
  })

  it("normalizes typed URLs", () => {
    expect(normalizeUserUrl("baanbrew.co")).toBe("https://baanbrew.co/")
    expect(normalizeUserUrl("http://shop.example.th/a")).toBe("http://shop.example.th/a")
    expect(normalizeUserUrl("not a url")).toBeNull()
    expect(normalizeUserUrl("localhost")).toBeNull()
  })
})


describe("displayUserChoice", () => {
  it("shows only the label", () => {
    expect(displayUserChoice("User choice: exploring (Just exploring)")).toBe("Just exploring")
    expect(displayUserChoice("User choice: website_url (I have a website URL)\nhttps://a.co/")).toBe("I have a website URL\nhttps://a.co/")
    expect(displayUserChoice("hello")).toBe("hello")
  })
})

describe("dedupeAskQuestion", () => {
  it("hides text that repeats the card question", () => {
    expect(dedupeAskQuestion("Where to start?", "Where to start?")).toBe("")
    expect(dedupeAskQuestion("Welcome! Where to start?", "Where to start?")).toBe("Welcome!")
    expect(dedupeAskQuestion("Hi", undefined)).toBe("Hi")
  })
})
