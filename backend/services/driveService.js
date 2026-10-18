const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');

// Ensure environment variables are loaded
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

/**
 * Creates and returns an authenticated OAuth2 client for Google Drive.
 */
function getOAuth2Client() {
    const clientId = process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
    const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
    const accessToken = process.env.GDRIVE_ACCESS_TOKEN;
    const redirectUri = process.env.GDRIVE_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const creds = {};
    if (refreshToken && refreshToken.trim()) {
        creds.refresh_token = refreshToken.trim();
    }
    if (accessToken && accessToken.trim()) {
        creds.access_token = accessToken.trim();
    }

    oauth2Client.setCredentials(creds);
    return oauth2Client;
}

/**
 * Checks if Google Drive OAuth2 is configured with a refresh or access token.
 */
function isDriveConfigured() {
    return Boolean(
        (process.env.GDRIVE_REFRESH_TOKEN && process.env.GDRIVE_REFRESH_TOKEN.trim().length > 10) ||
        (process.env.GDRIVE_ACCESS_TOKEN && process.env.GDRIVE_ACCESS_TOKEN.trim().length > 10)
    );
}

/**
 * Uploads an in-memory Buffer directly to Google Drive.
 * Sets permission so "anyone with the link can view".
 * 
 * @param {Buffer} buffer - In-memory file buffer (from multer or base64 decode)
 * @param {string} filename - Target file name on Google Drive
 * @param {string} mimeType - MIME type (e.g. 'application/pdf', 'image/jpeg')
 * @param {string} [folderId] - Optional Google Drive parent folder ID
 * @returns {Promise<{ fileId: string, webViewLink: string }>}
 */
async function uploadBuffer(buffer, filename, mimeType = 'application/octet-stream', folderId = null) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('uploadBuffer requires a valid Buffer as its first argument');
    }

    if (!isDriveConfigured()) {
        throw new Error(
            'Google Drive upload aborted: Neither GDRIVE_REFRESH_TOKEN nor GDRIVE_ACCESS_TOKEN is configured in .env.'
        );
    }

    const auth = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    // Build file metadata
    const requestBody = {
        name: filename
    };

    let targetFolder = (folderId && folderId.trim()) ? folderId.trim() : null;
    if (targetFolder && targetFolder.includes('drive.google.com')) {
        const urlMatch = targetFolder.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (urlMatch) targetFolder = urlMatch[1];
    }
    if (targetFolder) {
        requestBody.parents = [targetFolder];
    }

    // Convert Buffer to Readable stream
    const media = {
        mimeType: mimeType || 'application/octet-stream',
        body: Readable.from(buffer)
    };

    console.log(`[GoogleDrive] Uploading "${filename}" (${buffer.length} bytes, ${mimeType})...`);

    // 1. Upload file
    const fileRes = await drive.files.create({
        requestBody,
        media,
        fields: 'id, name, webViewLink, webContentLink'
    });

    const fileId = fileRes.data.id;
    let webViewLink = fileRes.data.webViewLink;

    if (!webViewLink) {
        webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
    }

    console.log(`[GoogleDrive] File uploaded successfully. File ID: ${fileId}`);

    // 2. Set "anyone with link can view" permission
    try {
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });
        console.log(`[GoogleDrive] Set public view permission on file ID: ${fileId}`);
    } catch (permErr) {
        console.warn(`[GoogleDrive] Warning: Could not set public permission on file ${fileId}:`, permErr.message);
    }

    return {
        fileId: fileId,
        webViewLink: webViewLink
    };
}

module.exports = {
    uploadBuffer,
    getOAuth2Client,
    isDriveConfigured
};
