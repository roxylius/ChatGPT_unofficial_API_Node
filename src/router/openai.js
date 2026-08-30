const express = require('express');
const {performLoginWithBasicAuth} = require('../flows/openai_emailAuth');
const { getPage } = require('../services/puppeteerService');
const { promptWithOptions } = require('../flows/openai_promptFlow');
const { isChatGPTLoggedIn } = require('../utils/helpers');

//import logger
const {getLogger} = require('../utils/logger');
const logger = getLogger("prompt.js");

//handle login Routes
const promptRouter = express.Router();

//handle POST request for login
promptRouter.post('/prompt', async (req,res,next)=> {
    logger.debug("POST:/api/openai/prompt","In prompt post request...");

    //retrieve input passed from client
    const {prompt,options = {}} = req.body; //defaults options to null obj

    //get puppeteer page instance
    const page = getPage();

    if (await isChatGPTLoggedIn(page)) {
        logger.debug("POST:/api/prompt",'✅ Already signed in — skipping login flow.');
    } else {
        logger.debug("POST:/api/prompt",'🔐 Not signed in — running login flow…');
        await performLoginWithBasicAuth(page);
    }

    const response = await promptWithOptions(page,options,prompt);

    res.status(200).json(response);

});

module.exports = promptRouter;
