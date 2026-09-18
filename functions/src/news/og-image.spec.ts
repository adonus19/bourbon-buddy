import { parseOgImage } from "./og-image";

describe("parseOgImage", () => {
  it("reads og:image from a page head", () => {
    // Fred Minnick's real shape — the only route to a hero for that source.
    const html =
      "<html><head><meta property=\"og:image\" " +
      "content=\"https://www.fredminnick.com/wp-content/uploads/2026/09/hero.jpg\" />" +
      "</head><body>x</body></html>";
    expect(parseOgImage(html)).toBe(
      "https://www.fredminnick.com/wp-content/uploads/2026/09/hero.jpg"
    );
  });

  it("prefers og:image over twitter:image regardless of document order", () => {
    const html =
      "<meta name=\"twitter:image\" content=\"https://x.com/tw.jpg\">" +
      "<meta property=\"og:image\" content=\"https://x.com/og.jpg\">";
    expect(parseOgImage(html)).toBe("https://x.com/og.jpg");
  });

  it("falls back to twitter:image when og:image is absent", () => {
    const html = "<meta name=\"twitter:image\" content=\"https://x.com/tw.jpg\">";
    expect(parseOgImage(html)).toBe("https://x.com/tw.jpg");
  });

  it("resolves relative content against the page URL", () => {
    const html = "<meta property=\"og:image\" content=\"/img/hero.jpg\">";
    expect(parseOgImage(html, "https://x.com/post/1")).toBe(
      "https://x.com/img/hero.jpg"
    );
  });

  it("returns null for no tags, junk images, and empty input", () => {
    expect(parseOgImage("<html><head></head></html>")).toBeNull();
    expect(
      parseOgImage("<meta property=\"og:image\" content=\"https://x.com/1x1.gif\">")
    ).toBeNull();
    expect(parseOgImage("")).toBeNull();
  });

  it("ignores meta tags beyond the head-sized scan window", () => {
    const html =
      "x".repeat(200_001) +
      "<meta property=\"og:image\" content=\"https://x.com/late.jpg\">";
    expect(parseOgImage(html)).toBeNull();
  });
});
