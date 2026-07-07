import { buildModelText, fetchArticleBody, htmlToText } from "./article-text";

describe("htmlToText", () => {
  it("returns '' for empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  it("strips tags and collapses whitespace", () => {
    expect(htmlToText("<p>Hello   <b>world</b></p>\n<p>Again</p>")).toBe(
      "Hello world Again"
    );
  });

  it("drops script and style blocks entirely", () => {
    const html =
      "<style>.x{color:red}</style><p>Keep</p><script>alert(1)</script>";
    expect(htmlToText(html)).toBe("Keep");
  });

  it("decodes named and numeric entities", () => {
    expect(htmlToText("<p>Jack &amp; Coke &#39;24 &#x2019;s</p>")).toBe(
      "Jack & Coke '24 ’s"
    );
  });
});

describe("buildModelText", () => {
  it("composes headline and body", () => {
    expect(buildModelText("Title", "Body text", 100)).toBe("Title\nBody text");
  });

  it("caps at maxChars", () => {
    expect(buildModelText("abc", "defghij", 5)).toBe("abc\nd");
  });
});

describe("fetchArticleBody", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns '' for an empty url without fetching", async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchArticleBody("")).toBe("");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns '' on a non-OK response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    expect(await fetchArticleBody("https://x.test/a")).toBe("");
  });

  it("returns '' when fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    expect(await fetchArticleBody("https://x.test/a")).toBe("");
  });

  it("extracts the article body text on success", async () => {
    const html = `<!doctype html><html><head><title>JD Guide</title></head>
      <body><nav>Home About</nav>
      <article>
        <h1>The Jack Daniel's Range Guide</h1>
        <p>Old No. 7 is the flagship expression that most drinkers know first,
        a Tennessee whiskey filtered through sugar maple charcoal before aging.</p>
        <p>Gentleman Jack is charcoal mellowed a second time for a softer profile,
        while the Single Barrel Select offers a bolder, higher-proof pour.</p>
        <p>Jack Daniel's Bonded and the Triple Mash bottled-in-bond round out the
        core range with more assertive, oak-forward character for enthusiasts.</p>
      </article>
      <footer>Copyright</footer></body></html>`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
    }) as unknown as typeof fetch;

    const body = await fetchArticleBody("https://x.test/jd");
    expect(body).toContain("Gentleman Jack");
    expect(body).toContain("Single Barrel");
    expect(body).toContain("Bonded");
    // Chrome/footer should be dropped by Readability.
    expect(body).not.toContain("Home About");
  });
});
