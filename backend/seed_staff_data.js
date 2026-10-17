const fs = require('fs');
const path = require('path');
const { syncLocalManualsToDatabase } = require('./services/pdfAnalyzer');

/**
 * Initializes essential storage folders on system startup and
 * automatically synchronizes any PDF manuals from uploads/manuals into MongoDB.
 */
async function seedData() {
    try {
        const uploadsDir = path.join(__dirname, 'uploads', 'manuals');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        console.log('✅ File storage directory verified: uploads/manuals');

        // Automatically sync any PDF manual present in uploads/manuals into MongoDB
        const syncRes = await syncLocalManualsToDatabase();
        if (syncRes && syncRes.synced > 0) {
            console.log(`📁 MongoDB Sync: Saved ${syncRes.synced} lab manual(s) to staff_portal database.`);
        }
    } catch (err) {
        console.warn('Storage/DB sync notice:', err.message);
    }
}

module.exports = seedData;

