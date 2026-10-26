/** Search-engine metadata (settings hold the site-wide defaults). */
export class SeoDto {
  /**
   * `<title>`; null to fall back to the site default.
   * @example "SimpleFood: food delivery in Kyiv"
   */
  title: string | null;

  /**
   * `<meta name="description">`; null to fall back to the site default.
   * @example "Home-style meals delivered hot."
   */
  description: string | null;
}
