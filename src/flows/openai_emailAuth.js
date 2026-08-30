// src/flows/basic-login.js
// Contains the logic specific to the basic (email/password) login process

const { waitForTimeout } = require('../utils/helpers');

/**
 * Performs the ChatGPT login flow using email/password credentials.
 * - Waits for page redirects to settle
 * - Clicks through the OpenAI login prompts
 * - Fills in email and password from environment variables
 *
 * @param {import('puppeteer').Page} page - The Puppeteer Page instance
 */
async function performLoginWithBasicAuth(page) {
  // ensure we’re on chatgpt.com for correct session context
  if (!page.url().includes('chatgpt.com')) {
    await page.goto('https://chatgpt.com');
  }

  console.log('Waiting for page load and potential redirects...');
  // Give time for any automatic redirects or network idle
  await waitForTimeout(3000);

  // Locate and click the main "Log in" button by its accessible name
  console.log('Locating and clicking the Log in button...');
  const loginButton = page.locator('::-p-aria(Log in)');
  await loginButton.click();
  await waitForTimeout(3000);

  // Fill in the email field
  console.log('Filling in email address...');
  const emailField = page.locator('input[type="email"]');
  await emailField.fill(process.env.OPENAI_EMAIL);

  // Submit email to proceed to the password prompt
  console.log('Submitting email...');
  await page.locator('button[type="submit"]').click();

  // Fill in the password field
  console.log('Filling in password...');
  const passwordField = page.locator('input[type="password"]');
  await passwordField.fill(process.env.OPENAI_PASSWORD);

  // Finalize login by clicking the continue button
  console.log('Submitting login form...');
  const continueButton = page.locator('div ::-p-aria(Continue)');
  await continueButton.click();

  //wait for page to load and redirect correctly
  await waitForTimeout(4000);
  await page.waitForSelector('#prompt-textarea');
  console.log('Login flow complete.');
}

module.exports = {
  performLoginWithBasicAuth,
};
