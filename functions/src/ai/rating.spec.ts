import { parseRating } from "./rating";

// The article text a raw rating must appear in verbatim; parseRating rejects
// any raw string it can't find, so each case names its score in the text.
const TEXT =
  "A stellar pour. Whiskey Advocate scored it 92/100. The nose is rich. " +
  "Our panel gave it 4.5 stars. Distiller notes call it a 9.2/10 dram. " +
  "The editor's letter grade: B+. Wine Enthusiast: 90 points. A perfect 10/10.";

describe("parseRating (BB-221)", () => {
  describe("verbatim gate", () => {
    it("drops a rating that does not appear in the text", () => {
      expect(parseRating("99/100", TEXT)).toBeNull();
    });

    it("matches case- and whitespace-insensitively", () => {
      expect(parseRating("4.5   STARS", "our panel gave it 4.5 stars")).toBe(90);
    });

    it("returns null for empty / non-string raw", () => {
      expect(parseRating("", TEXT)).toBeNull();
      expect(parseRating("   ", TEXT)).toBeNull();
      // @ts-expect-error exercising the runtime guard
      expect(parseRating(92, TEXT)).toBeNull();
    });
  });

  describe("scale normalization to 0-100", () => {
    it("parses an X/100 score", () => {
      expect(parseRating("92/100", TEXT)).toBe(92);
    });

    it("parses an X/10 score", () => {
      expect(parseRating("9.2/10", TEXT)).toBe(92);
    });

    it("parses a 5-star score to 0-100", () => {
      expect(parseRating("4.5 stars", TEXT)).toBe(90);
    });

    it("parses 'N points' as out of 100", () => {
      expect(parseRating("90 points", TEXT)).toBe(90);
    });

    it("parses a letter grade via the fixed map", () => {
      expect(parseRating("B+", TEXT)).toBe(88);
    });

    it("rounds fractional normalized scores", () => {
      expect(parseRating("4.35 stars", "rated 4.35 stars")).toBe(87);
    });

    it("handles a perfect 10/10", () => {
      expect(parseRating("10/10", TEXT)).toBe(100);
    });
  });

  describe("dropped as unrecognized or out of range", () => {
    it("drops a bare number with no scale", () => {
      expect(parseRating("92", "it earned a 92 overall")).toBeNull();
    });

    it("drops an unrecognized denominator", () => {
      expect(parseRating("7/12", "rated 7/12 by the club")).toBeNull();
    });

    it("drops a fraction whose numerator exceeds its denominator", () => {
      expect(parseRating("11/10", "a rare 11/10 in his book")).toBeNull();
    });

    it("drops more than 5 stars", () => {
      expect(parseRating("6 stars", "an unheard-of 6 stars")).toBeNull();
    });
  });
});
