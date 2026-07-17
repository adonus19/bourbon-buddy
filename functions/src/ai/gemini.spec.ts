import {
  RateLimitError,
  chatJson,
  generateText,
  stripJsonFences,
} from "./gemini";

const reply = (text: string) => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe("stripJsonFences (Gemma 4 fence bug, BB-226)", () => {
  it("strips the trailing fence Gemma reliably appends", () => {
    expect(stripJsonFences('{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips a full ```json wrapper", () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("leaves clean JSON and inner backticks alone", () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
    expect(stripJsonFences('{"a":"uses ``` inside"}')).toBe(
      '{"a":"uses ``` inside"}'
    );
  });
});

describe("Gemini client", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns fence-stripped text and sends the request shape", async () => {
    const mock = jest.fn().mockResolvedValue(reply('{"bottles":[]}\n```'));
    global.fetch = mock as unknown as typeof fetch;

    const out = await generateText("key", {
      model: "gemini-3.1-flash-lite",
      system: "sys",
      user: "user",
      maxTokens: 1024,
      responseSchema: { type: "OBJECT" },
    });
    expect(out).toBe('{"bottles":[]}');

    const [url, init] = mock.mock.calls[0];
    expect(url).toContain("/gemini-3.1-flash-lite:generateContent");
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toEqual({ type: "OBJECT" });
    expect(body.generationConfig.temperature).toBe(0);
    expect(init.headers["x-goog-api-key"]).toBe("key");
  });

  it("joins multi-part candidates and returns '' when none", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: '{"a"' }, { text: ":1}" }] } }],
        }),
    }) as unknown as typeof fetch;
    expect(
      await generateText("key", { model: "m", system: "s", user: "u", maxTokens: 10 })
    ).toBe('{"a":1}');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;
    expect(
      await generateText("key", { model: "m", system: "s", user: "u", maxTokens: 10 })
    ).toBe("");
  });

  it("throws RateLimitError on 429 and Error otherwise", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;
    await expect(
      generateText("key", { model: "m", system: "s", user: "u", maxTokens: 10 })
    ).rejects.toBeInstanceOf(RateLimitError);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("boom"),
    }) as unknown as typeof fetch;
    await expect(
      generateText("key", { model: "m", system: "s", user: "u", maxTokens: 10 })
    ).rejects.toThrow("Gemini 500");
  });

  it("chatJson parses the object and honors a temperature override (BB-196)", async () => {
    const mock = jest.fn().mockResolvedValue(reply('{"nose":["Vanilla"]}\n```'));
    global.fetch = mock as unknown as typeof fetch;

    const out = await chatJson("key", "gemma-4-26b-a4b-it", "s", "u", 400, 0.4);
    expect(out).toEqual({ nose: ["Vanilla"] });
    expect(JSON.parse(mock.mock.calls[0][1].body).generationConfig.temperature).toBe(
      0.4
    );
  });

  it("chatJson returns {} on an empty reply instead of throwing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;
    expect(await chatJson("key", "m", "s", "u", 400)).toEqual({});
  });
});
