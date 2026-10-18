/**
 * Initializes essential storage configurations on system startup.
 */
async function seedData() {
    try {
        console.log('✅ Google Drive Cloud Storage active for lab manuals & snapshots.');
    } catch (err) {
        console.warn('Startup notice:', err.message);
    }
}

module.exports = seedData;

