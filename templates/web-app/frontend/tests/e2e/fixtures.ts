import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

/** Every journey fails on a browser console error, an uncaught page error or
 *  a server error (5xx), so a page that "works" while throwing underneath
 *  does not pass. Import `test` and `expect` from here, not from
 *  "@playwright/test".
 *
 *  Chrome's own "Failed to load resource" lines are ignored: a 4xx is often
 *  expected (401 before login, a 404 a test asks for), and a 5xx is caught
 *  from the response itself. A test that expects other errors names them:
 *  `test.use({ allowedErrors: /one|or another/ })` (one pattern: Playwright
 *  reads an array given to `test.use` as a value and its options). */
type Options = { allowedErrors: RegExp | null };

const CHROME_RESOURCE_LINE = /^Failed to load resource:/;

export const test = base.extend<Options & { failOnErrors: void }>({
  allowedErrors: [null, { option: true }],
  failOnErrors: [
    async ({ page, allowedErrors }, use) => {
      const problems: string[] = [];
      const note = (text: string) => {
        if (!allowedErrors?.test(text)) problems.push(text);
      };
      page.on("console", (message) => {
        if (message.type() === "error" && !CHROME_RESOURCE_LINE.test(message.text())) {
          note(`console: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => note(`page error: ${error.message}`));
      page.on("response", (response) => {
        if (response.status() >= 500) {
          note(`${response.status()} ${response.request().method()} ${response.url()}`);
        }
      });
      await use();
      expect(problems, "console errors, page errors or server errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** WCAG 2.1 A and AA, as axe checks them. Fails with one line per rule
 *  broken. Skip a rule only with a reason in a comment and a DEC. */
export async function expectAccessible(page: Page, options: { skipRules?: string[] } = {}) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(options.skipRules ?? [])
    .analyze();
  expect(
    violations.map(
      (v) => `${v.id} (${v.impact}): ${v.help}, ${v.nodes.length} element(s), first: ${v.nodes[0]?.html.slice(0, 200)}`,
    ),
    `accessibility on ${page.url()}`,
  ).toEqual([]);
}
