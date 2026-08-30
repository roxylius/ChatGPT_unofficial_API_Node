// src/utils/helpers.js
// Contains reusable utility functions for ChatGPT automation flows
const { HtmlToText } = require('html-to-text-conv');

/**
 * Returns a Promise that resolves after a specified timeout.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>} Resolves after the timeout completes.
 */
const waitForTimeout = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};


/**
 * Checks whether the ChatGPT web session is authenticated by querying
 * the official `/api/auth/session` endpoint.
 *
 * This method avoids relying on fragile client-side checks (like localStorage or cookies)
 * and instead performs a direct HTTP GET request using Puppeteer's built-in request API.
 *
 * OpenAI's `/api/auth/session` endpoint responds with:
 *  - A populated JSON object if the user is authenticated (contains `user`, `account`, etc.).
 *  - An empty object `{}` if the user is not logged in.
 *
 * @param {import('puppeteer').Page} page - The Puppeteer Page instance.
 * @returns {Promise<boolean>} `true` if the user is logged in; otherwise `false`.
 */
async function isChatGPTLoggedIn(page) {

  // Ensure we're on the correct ChatGPT host
  if (!page.url().startsWith('https://chatgpt.com')) {
    await page.goto('https://chatgpt.com');
  }

  // Perform fetch inside browser context since `page.request` is not available in Puppeteer
  const session = await page.evaluate(async () => {
    try {
      // Request current auth session; includes cookies for proper context
      const res = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
      console.log("isChatGPTLoggedIn", "Fetch response status:", res.status);
      
      if (!res.ok) return {};          // Non-200 → no session
      return await res.json();         // Parsed session object
    } catch {
      return {};                       // Network/error → treat as not logged in
    }
  });

  // Non-empty object indicates authenticated session
  return session && Object.keys(session).length > 0;
}


/**
 * Convert HTML (including tables, headings, links) to plain text.
 * - Skips <button> elements entirely
 * - Renders headings on their own lines
 * - Preserves paragraphs with blank lines
 * - Inlines links as "text (url)"
 * - Formats tables with tabs between cells and newlines between rows
 *
 * @param {string} html - Raw HTML string to convert
 * @returns {string}    - Plain-text representation
 */
function htmlResponseToText(html) {
  //create converter object
  const converter = new HtmlToText();

  const text = converter.convert(html);

  return text;
}


module.exports = {
  waitForTimeout,
  isChatGPTLoggedIn,
  htmlResponseToText
};
