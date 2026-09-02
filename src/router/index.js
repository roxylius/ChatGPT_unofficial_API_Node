const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

//express routers to handle route
const promptRouter = require('./openai');
const v1Router = require('./v1');

const app = express();

//set up middleware
app.use(cors({ origin: '*', credentials: true, methods: ['GET', 'POST', 'DELETE','PUT'] })); //to enable cross origin resourse sharing ie make post,get,etc request form different url
app.use(bodyParser.urlencoded({ extended: true })); //to read the post request from html form
app.use(express.json()); //to interpret json

//Routes
app.use('/api/openai/',promptRouter);

//OpenAI-compatible surface (/v1/chat/completions, /v1/models) — point any
//OpenAI SDK's base URL at http://<host>:<port>/v1
app.use('/v1', v1Router);


app.get('/',(req,res) => {
    res.send("<html><body><h1>Server is up and Running......</h1></body></html>");
});

module.exports = app;