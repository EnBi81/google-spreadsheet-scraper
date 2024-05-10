// Import the necessary modules
import { google } from 'googleapis';
import express from 'express';
import open from 'open';
import fs from 'fs';
import {config} from 'dotenv'

config()

const app = express();
const PORT = 3000;

// Load client secrets from a local file.
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uri = process.env.GOOGLE_CLIENT_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
    clientId, clientSecret, redirect_uri
);

// Scopes for read-only access to Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Open an authorization URL in the user's browser
app.get('/auth', (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        scope: SCOPES,
        client_id: clientId,
        redirect_uri: redirect_uri,
        response_type: 'token',
        state: 'state-123'
    });

    open(authUrl);
    res.send('Authentication started...');
});

// Handle the OAuth2 callback
app.get('/google-auth-done', async (req, res) => {
    const { code } = req.query;

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    readSheet(); // Read data from the spreadsheet
    res.send('Authentication successful! your code is ' + code);
});

app.get('/', async (req, res) => {
    res.send('<a href="/auth"><button>Log in</button></a>')
})

async function readSheet() {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = 'Sheet1!A1:E10';

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values;
        if (rows.length) {
            console.log('Name, Major:');
            // Print columns A and E, which correspond to indices 0 and 4.
            rows.forEach((row) => {
                console.log(`${row[0]}, ${row[4]}`);
            });
        } else {
            console.log('No data found.');
        }
    } catch (err) {
        console.error('The API returned an error: ' + err);
    }
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
