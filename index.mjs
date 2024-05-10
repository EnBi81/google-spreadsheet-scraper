// Import the necessary modules
import {google} from 'googleapis';
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


const data = {
    tokens: undefined,
    spreadsheetId: process.env.SPREADSHEET_ID,
    spreadsheetRange: process.env.SPREADSHEET_RANGE,
}



// Open an authorization URL in the user's browser
app.get('/auth', (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        client_id: clientId,
        redirect_uri: redirect_uri,
        //response_type: 'token',
        state: 'state-123'
    });

    res.redirect(authUrl)
});

// Handle the OAuth2 callback
app.get('/google-auth-done', async (req, res) => {
    try{
        const { code } = req.query;
        const { tokens } = await oAuth2Client.getToken(code);

        data.tokens = {
            accessToken: tokens['access_token'],
            refreshToken: tokens['refresh_token'],
            tokenType: tokens['token_type'],
            expiryDate: new Date(tokens['expiry_date'])
        }

        res.redirect('/login-success');
    }
    catch (e){
        console.error('Error while OAuth2: ', e);
        res.redirect('/login-error');
    }
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

app.get('/set-spreadsheet-id', async(req, res) => {
    data.spreadsheetId = req.query['spreadsheet-id']

    res.send('Spreadsheet id successfully set to ' + data.spreadsheetId);
})
app.get('/set-spreadsheet-range', async(req, res) => {
    data.spreadsheetRange = req.query['spreadsheet-range']
    data.spreadsheetRange = decodeURIComponent(data.spreadsheetRange)

    res.send('Spreadsheet range successfully set to ' + data.spreadsheetRange);
})

app.get('/spreadsheet-data', async(req, res) => {
    try {
        const data = await readSheet();  // Assuming data comes as an array of arrays
        res.status(200).json({ data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read the sheet', details: error.message });
    }
})

async function readSheet() {
    if (!data.tokens || !data.spreadsheetId) {
        throw new Error('Tokens or spreadsheet ID are not set.');
    }

    // Set credentials with the existing access token
    oAuth2Client.setCredentials({
        access_token: data.tokens.accessToken,
        refresh_token: data.tokens.refreshToken,
        token_type: data.tokens.tokenType,
        expiry_date: data.tokens.expiryDate.getTime()
    });

    // Create a Google Sheets API client with the authenticated OAuth2 client
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

    try {
        const range = data.spreadsheetRange;  // Update this as per your sheet's structure
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: data.spreadsheetId,
            range: range
        });

        // Here we log the rows to the console, you can process them as needed
        return response.data.values;  // Returning the rows for further processing or output
    } catch (error) {
        console.error('The API returned an error: ' + error);
        throw error;  // Re-throw the error for further handling
    }
}


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
