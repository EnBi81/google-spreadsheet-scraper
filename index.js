const { google } = require('googleapis');
const express = require('express');
const open = require('open');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Load client secrets from a local file.
const credentials = JSON.parse(fs.readFileSync('credentials.json'));
const { client_secret, client_id, redirect_uris } = credentials.web;

const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]
);

// Scopes for read-only access to Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Open an authorization URL in the user's browser
app.get('/auth', (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    open(authUrl);
    res.send('Authentication started...');
});

// Handle the OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    readSheet(); // Read data from the spreadsheet
    res.send('Authentication successful!');
});

async function readSheet() {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const spreadsheetId = 'YOUR_SPREADSHEET_ID';
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
