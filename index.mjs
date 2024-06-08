// Import the necessary modules
import {google} from 'googleapis';
import express from 'express';
import {config} from 'dotenv';
import path from 'path';
import {existsSync, readFileSync, writeFile, renameSync, unlinkSync} from 'fs'
import axios from 'axios'

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


const data = readFileToData();
const cacheData = {
    data: undefined,
    lastRefreshed: undefined,
    CACHE_LIFETIME_MINUTES: 3 * 60,
}

app.get('/', async (req, res) => {
    res.send('Hello World!');
})

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
            expiryDate: tokens['expiry_date']
        }

        writeDataToFile(data);
        res.redirect('/login-success');
    }
    catch (e){
        console.error('Error while OAuth2: ', e);
        res.redirect('/login-error');
    }
});

app.get('/login', async (req, res) => {
    res.send('<a href="/auth"><button>Log in</button></a>');
})

app.get('/login-error', async (req, res) => {
    res.send('Could not log in: access denied <br/> <a href="/login"><button>Go back</button></a>');
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
        const { tzo } = req.query;
        let nowDate = new Date();

        const timezoneOffset = parseInt(tzo)
        if(!isNaN(timezoneOffset)) {
            const timeZoneDifference = nowDate.getTimezoneOffset() - timezoneOffset;
            nowDate.setTime(nowDate.getTime() + timeZoneDifference * 60 * 1000);
        }

        let responseData = getCachedData(nowDate);

        if(!responseData) {
            console.log('Accessing Google Spreadsheet ' + new Date().toLocaleDateString())
            const data = await readSheet();  // Assuming data comes as an array of arrays
            cacheData.data = processSpreadsheetData(data);
            cacheData.lastRefreshed = new Date();

            responseData = getCachedData(nowDate);
        }

        res.status(200).json({ data: responseData });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read the sheet', details: error.message });
    }
})

app.get('/person-mapping', async(req, res) => {
    let { from, to } = req.query;

    from = decodeURIComponent(from)
    to = decodeURIComponent(to)

    data.personMapping[from] = {
        name: to
    };

    writeDataToFile(data)
    res.send(`Person ${from} is set to ${to}`)
})

app.post('/update-release', (req, res) => {
    const appsFolderPath = path.join(process.cwd(), 'public', 'apps');
    const updatedFilePath = path.join(appsFolderPath, 'app-updated-release.apk');
    const latestFilePath = path.join(appsFolderPath, 'app-latest-release.apk');
    const backupFilePath = path.join(appsFolderPath, 'app-backup-release.apk');

    let { version } = req.query;

    if(typeof version !== 'string' || version.length === 0){
        return res.status(400).send('Invalid version: ' + version);
    }

    if(version === data.androidApkVersion){
        return res.status(400).send('Provided version is the same as the current version');
    }

    // Check if the updated file exists
    if (!existsSync(updatedFilePath)) {
        return res.status(400).send('Updated version does not exist');
    }

    // Delete the old backup file if it exists
    if (existsSync(backupFilePath)) {
        unlinkSync(backupFilePath);
    }

    // Rename the current latest release to backup
    if (existsSync(latestFilePath)) {
        renameSync(latestFilePath, backupFilePath);
    }

    // Rename the updated release to the latest release
    renameSync(updatedFilePath, latestFilePath);


    data.androidApkVersion = version;
    writeDataToFile(data);

    res.status(200).send('File renamed successfully');
    console.log('Updated file renamed to latest release and old latest release backed up');
});

app.get('/set-apk-version', async(req, res) => {
    let { version } = req.query;
    data.androidApkVersion = version;
    writeDataToFile(data);
    res.send(`Android apk upgraded to version ${version}.`);
})
app.get('/apk-version', async (req, res) => {
    res.send(data.androidApkVersion);
})

app.get('/location', async(req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const location = await getIpLocation(ip);
    if (location) {
        res.json(location);
    } else {
        res.status(500).json({ error: 'Could not fetch location' });
    }
})

// Function to get IP location using ipinfo
const getIpLocation = async (ip) => {
    try {
        const response = await axios.get(`https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN}`);
        return response.json;
    } catch (error) {
        console.error('Error fetching IP location:', error);
        return null;
    }
};

function getCachedData(dateTimeFrom){
    const now = new Date();

    const cacheRefreshDate = cacheData.lastRefreshed;

    if(!(cacheRefreshDate && cacheRefreshDate instanceof Date))
        return undefined;

    const cacheLifeTimeMs = now.getTime() - cacheRefreshDate.getTime();
    if(cacheLifeTimeMs > cacheData.CACHE_LIFETIME_MINUTES * 60 * 1000)
        return undefined;

    const cachedDataArray = cacheData.data;
    if(!Array.isArray(cachedDataArray))
        return undefined;

    const fromTime = dateTimeFrom.getTime();
    return cachedDataArray.filter(d => {
        const dateTime = Date.parse(d.date);
        const date = new Date(dateTime);
        date.setHours(0);

        const MILLI_SECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

        return date.getTime() + MILLI_SECONDS_IN_A_DAY > fromTime;
    })
}

async function readSheet() {
    if (!data.tokens || !data.spreadsheetId) {
        throw new Error('Tokens or spreadsheet ID are not set.');
    }

    // Set credentials with the existing access token
    oAuth2Client.setCredentials({
        access_token: data.tokens.accessToken,
        refresh_token: data.tokens.refreshToken,
        token_type: data.tokens.tokenType,
        expiry_date: data.tokens.expiryDate
    });

    try{
        oAuth2Client
            .refreshAccessToken()
            .then(res => {
                const tokens = res.credentials;

                data.tokens = {
                    accessToken: tokens['access_token'],
                    refreshToken: tokens['refresh_token'],
                    tokenType: tokens['token_type'],
                    expiryDate: tokens['expiry_date']
                }

                writeDataToFile(data);
            })
    }
    catch (e){
        console.error('Error while writing token to file:', e)
    }


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

function processSpreadsheetData(spreadsheetData){
    if(!Array.isArray(spreadsheetData))
        throw new Error('data is not an array while processing spreadsheet data');

    const newDataArr = []
    const NA = '#N/A';

    for(const row of spreadsheetData){
        const date = new Date(row[0])
        const isValidDate = !isNaN(date);

        if(!isValidDate){
            continue;
        }

        const meziNames = []

        const mezi_person_count_start = 1;
        for(let i = mezi_person_count_start; i < data.maxPersonCountMezi + mezi_person_count_start; i++){
            let meziName = row[i];

            if(meziName in data.personMapping)
                meziName = data.personMapping[meziName].name;

            if(meziName && meziName !== NA && /\S/.test(meziName))
                meziNames.push(meziName);
        }

        const doborgazNames = []

        const doborgaz_person_count_start = 1 + data.maxPersonCountMezi;
        for (let i = doborgaz_person_count_start; i < data.maxPersonCountDoborgaz + doborgaz_person_count_start; i++) {
            let doborgazName = row[i];

            if(doborgazName in data.personMapping)
                doborgazName = data.personMapping[doborgazName].name

            if(doborgazName && doborgazName !== NA && /\S/.test(doborgazName))
                doborgazNames.push(doborgazName);
        }

        newDataArr.push({
            date: date,
            cikola: meziNames,
            doborgaz: doborgazNames
        });
    }

    return newDataArr
}

app.use(express.static('public'))
app.listen(PORT, () => console.log(`Server running`));


function writeDataToFile(data){
    const string = JSON.stringify(data);
    writeFile(process.env.FILE_TO_SAVE_TOKENS, string, () => {})
}

function readFileToData() {
    const defaultObj = {
        tokens: undefined,
        spreadsheetId: process.env.SPREADSHEET_ID,
        spreadsheetRange: process.env.SPREADSHEET_RANGE,
        maxPersonCountMezi: parseInt(process.env.DATA_MEZI_MAX_PERSON),
        maxPersonCountDoborgaz: parseInt(process.env.DATA_DOBORGAZ_MAX_PERSON),
        personMapping: {},
        androidApkVersion: '',
    }

    if(!existsSync(process.env.FILE_TO_SAVE_TOKENS)){
        return defaultObj
    }

    const string = readFileSync(process.env.FILE_TO_SAVE_TOKENS).toString();
    return {
        ...defaultObj,
        ...JSON.parse(string)
    };
}

function generateDummyData(entries) {
    const data = [];

    const mockData = [
        {cikola: ['Zia', 'Kata', 'Somlo'], doborgaz: ['Horvath']},
        {cikola: ['Zia'], doborgaz: ['Horvath']},
        {cikola: [], doborgaz: ['Horvath']},
        {cikola: ['Zia', 'Kata', 'Somlo'], doborgaz: []},
        {cikola: [], doborgaz: []},
    ]

    for (let i = 0; i < entries; i++) {
        const dateTimeThing = new Date().getTime() + i * 1000 * 60 * 60 * 24;
        const date = new Date();
        date.setTime(dateTimeThing)

        const dateString = date.toISOString().replace(/T.*$/, ''); // Extract only the date part
        const entry = {
            date: `${dateString}T00:00:00.000Z`,
            cikola: mockData[i % mockData.length].cikola,
            doborgaz: mockData[i % mockData.length].doborgaz
        };
        data.push(entry);
    }

    return data;
}