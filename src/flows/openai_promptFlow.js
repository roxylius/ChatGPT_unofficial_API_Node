// src/flows/prompt-flow.js
// Contains the logic for sending prompts to ChatGPT with optional modes
const { waitForTimeout, htmlResponseToText, isChatGPTLoggedIn } = require("../utils/helpers");
const {getLogger} = require('../utils/logger');

const logger = getLogger('prompt-flow.js'); //get logger object

/**
 * Sends a prompt to ChatGPT (with “Reason”/“Search” modes), waits for the reply,
 * polls the streaming response until it stabilizes, and returns the final text.
 *
 * @param {import('puppeteer').Page} page    - Puppeteer Page instance
 * @param {{ reason: boolean, search: boolean, threadId: string | null  }}  options - Configuration flags: 1) `reason` to enable Reason mode, 2) `search` to enable Search mode, and 3) optional `threadId` to reuse an existing conversation thread
 * @param {string} prompt                    - The user’s prompt
 * @returns {Promise<string|null>}           - The completed response text, or null if none received
 */
async function promptWithOptions(page, options, prompt) {
    let { reason, search, threadId } = options;

    // Navigate: reuse existing thread or start fresh
    const base = 'https://chatgpt.com';
    const url = threadId ? `${base}/c/${threadId}` : base;
    logger.debug('promptWithOptions',`🌐 Loading URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000  }); //wait for DOM to load for a 120sec

    // // Toggle modes if requested
    // logger.debug('promptWithOptions','☰ Toggle Prompt tools...');
    // await page.locator('button::-p-aria(Choose tool)').click();
    
    if (reason) {
        logger.debug('promptWithOptions','🔍 Enabling Reason mode...');
        await page.locator('div::-p-text(Think)').click();
        search = false;
    }
    if (search) {
        logger.debug('promptWithOptions','🔍 Enabling Search mode...');
        await page.locator('div::-p-text(Search)').click();
    }

    // Prepare and clear editor
    logger.debug('promptWithOptions','✏️ Clearing editor...');
    const editor = await page.waitForSelector('#prompt-textarea');
    await editor.click();
    await editor.evaluate(el => {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
    });

    // Type and submit prompt
    logger.debug('promptWithOptions','✏️ Typing and submitting prompt...');
    const promptContext = `return the response to the below prompt excluding all the sources with links mentioned in the response anywhere. Prompt as follows: `;
    await editor.type(promptContext + prompt);
    await editor.press('Enter');

// Grab the latest assistant response
logger.debug('promptWithOptions','⏳ Waiting for response container to appear…');

const assistantSelector = 'div[data-message-author-role="assistant"] div.markdown';
const beforeCount = await page.$$eval(assistantSelector, els => els.length);

await page.waitForFunction(
    (selector, oldCount) => document.querySelectorAll(selector).length > oldCount,
    { timeout: 600_000 },
    assistantSelector,
    beforeCount
);

const assistantMessages = await page.$$(assistantSelector);
const handle = assistantMessages[assistantMessages.length - 1];

// Poll until the text stops changing
logger.debug('promptWithOptions','🕒 Polling response until stable…');

let previous = '';
let finalText = null;
let stableCount = 0;

const POLL_LIMIT = reason ? 600 : 300; // if reason mode poll for 10min else poll for 5min

for (let i = 0; i < POLL_LIMIT; i++) {

    const text = handle ? await handle.evaluate(el => el.innerText.trim()) : '';
    console.log('promptWithOptions: ',`🕒 Poll #${i + 1}: ${text ? text.slice(0, 50) + '…' : '[empty]'}`);

    if (text && text === previous) {
        stableCount++;

        if (stableCount >= 2) {
            finalText = text;
            break;
        }

    } else {
        stableCount = 0;
    }
    previous = text;

    await waitForTimeout(3000); // wait for 3sec before polling the next time
}

if (finalText === null) {
    logger.warn('promptWithOptions','⚠️ Response never stabilized; returning last received text (if any).');
    finalText = previous || null; // empty string becomes null
}

    // parse text from html content
    const cleaned = htmlResponseToText(finalText);

    if (cleaned === null) {
        logger.warn('promptWithOptions','⚠️ Failed to parse text content form HTML.');
    } else {
        logger.debug('promptWithOptions',`🎯 Cleaned response: ${cleaned.slice(0, 50)}....`);
    }

    // After the prompt, re-capture the actual thread from the URL
    const match = page.url().match(/\/c\/([0-9a-f\-]+)/);
    const newThreadId = match ? match[1] : null;
    logger.debug('promptWithOptions',`Resolved threadId: ${newThreadId}`);

    return {
        threadId: newThreadId,
        response: cleaned
    };
}

module.exports = { promptWithOptions };
