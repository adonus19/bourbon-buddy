import { RateLimitError, chatJson } from "./groq";

describe("chatJson (Groq client)", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("parses the model's JSON content", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"nose":["Vanilla"]}' } }],
        }),
    }) as unknown as typeof fetch;

    const out = await chatJson("key", "sys", "user", 400);
    expect(out).toEqual({ nose: ["Vanilla"] });
  });

  it("throws RateLimitError on 429", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;
    await expect(chatJson("key", "s", "u", 400)).rejects.toBeInstanceOf(
      RateLimitError
    );
  });

  it("throws on a non-OK, non-429 response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("boom"),
    }) as unknown as typeof fetch;
    await expect(chatJson("key", "s", "u", 400)).rejects.toThrow("Groq 500");
  });

  it("defaults to an empty object when content is missing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [] }),
    }) as unknown as typeof fetch;
    expect(await chatJson("key", "s", "u", 400)).toEqual({});
  });
});
