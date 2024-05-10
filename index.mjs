// Import the necessary modules
import { google } from 'googleapis';
import express from 'express';
import {config} from 'dotenv'

config()

const app = express();
const PORT = process.env.WEB_APP_PORT;

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
        access_type: 'offline',
        scope: SCOPES,
        client_id: clientId,
        redirect_uri: redirect_uri,
        response_type: 'token',
        state: 'state-123'
    });

    res.redirect(authUrl)
});

// Handle the OAuth2 callback
app.get('/google-auth-done', async (req, res) => {
    res.send('<script src="site/google_auth_done.js"></script>');
});

app.get('/', async (req, res) => {
    res.send('<a href="/auth"><button>Log in</button></a>');
})

app.get('/login-error', async (req, res) => {
    res.send('Could not log in: access denied <br/> <a href="/"><button>Go back</button></a>');
})

app.get('/login-success', async (req, res) => {
    res.send('App logged in!');
})

app.post('/google-auth-access-token', async(req, res) => {
    const body = req.body

    const accessToken = body['access-token']
    const tokenType = body['token-type']
    const expiresIn = body['expires_in']
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
