// index.js

// --- Enhanced Imports ---
// Use puppeteer-extra to add plugins and avoid bot detection
const puppeteer = require('puppeteer-extra');
// Import the stealth plugin to make browser automation less detectable
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// Standard Node.js modules for file system and CSV parsing
const fs = require('fs');
const csv = require('csv-parser');
const { format } = require('@fast-csv/format');

// Apply the stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

// --- Configuration ---
// Path to your input CSV file
const INPUT_CSV_PATH = 'LEADS NUMBER CORRECTION.xlsx - Sheet1.csv';
// Path for the output CSV file that will be created
const OUTPUT_CSV_PATH = 'updated_leads.csv';
// The selector to find the phone number on the Google Maps page.
const PHONE_NUMBER_SELECTOR = "button[data-item-id^='phone']";
// --- End of Configuration ---


/**
 * Scrapes the phone number from a given Google Maps URL.
 * @param {puppeteer.Browser} browser - The Puppeteer browser instance.
 * @param {string} url - The Google Maps URL to scrape.
 * @returns {Promise<string>} The scraped phone number, or 'Not Found' if it couldn't be retrieved.
 */
async function scrapePhoneNumber(browser, url) {
    if (!url || !url.startsWith('http')) {
        console.log(`Invalid or missing URL: "${url}". Skipping.`);
        return 'Invalid URL';
    }

    let page;
    try {
        page = await browser.newPage();
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for the phone number element to appear.
        await page.waitForSelector(PHONE_NUMBER_SELECTOR, { timeout: 10000 });

        // Extract the 'aria-label' which contains the phone number.
        const phoneNumberAriaLabel = await page.$eval(PHONE_NUMBER_SELECTOR, el => el.getAttribute('aria-label'));

        // Clean the extracted text to get just the number.
        const phoneNumber = phoneNumberAriaLabel ? phoneNumberAriaLabel.replace('Phone:', '').trim() : 'Not Found';

        console.log(`Found phone number: ${phoneNumber}`);
        return phoneNumber;

    } catch (error) {
        console.error(`Could not scrape phone number from ${url}. Error: ${error.message}`);
        return 'Not Found';
    } finally {
        if (page) {
            await page.close();
        }
    }
}

/**
 * Main function to run the scraper.
 */
async function main() {
    console.log('Starting the scraping process...');

    // --- Updated Browser Launch Configuration ---
    // Launch puppeteer with settings from your working example
    // to improve compatibility and avoid detection.
    const browser = await puppeteer.launch({
        // Set to 'true' for background operation, 'false' to see the browser window.
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled', // Hides the automation flag
        ],
    });

    const results = [];

    fs.createReadStream(INPUT_CSV_PATH)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            console.log(`CSV file successfully processed. Found ${results.length} rows.`);

            const updatedLeads = [];

            // Loop through each row from the CSV file
            for (let i = 0; i < results.length; i++) {
                const row = results[i];
                // Use the correct column names from your CSV
                const originalPhoneNumber = row['Phone Number'];
                const socialLink = row['Social Link'];

                console.log(`\nProcessing row ${i + 1}/${results.length}...`);

                const scrapedPhoneNumber = await scrapePhoneNumber(browser, socialLink);

                updatedLeads.push({
                    'Original Phone Number': originalPhoneNumber,
                    'Social Link': socialLink,
                    'Scraped Phone Number': scrapedPhoneNumber,
                });
            }

            await browser.close();
            console.log('\nBrowser closed.');

            // Write the updated data to the new CSV file.
            const csvStream = format({ headers: true });
            const writeStream = fs.createWriteStream(OUTPUT_CSV_PATH);

            writeStream.on('finish', () => {
                console.log(`\nScraping complete! Updated data saved to ${OUTPUT_CSV_PATH}`);
            });

            csvStream.pipe(writeStream);
            updatedLeads.forEach(lead => csvStream.write(lead));
            csvStream.end();
        });
}

main().catch(console.error);
