/**
 * OPT-IN DATA CLEANUP SCRIPT (DO NOT AUTO-EXECUTE)
 * 
 * Purpose: Allows an administrator to archive or clean up legacy team/group data
 * from the student_portal database now that the system operates strictly on an
 * individual student access model.
 * 
 * Usage:
 *   node scripts/cleanup_team_data.js --dry-run
 *   node scripts/cleanup_team_data.js --execute
 */

const { MongoClient } = require('mongodb');

async function cleanupTeamData() {
    const isExecute = process.argv.includes('--execute');
    const isDryRun = process.argv.includes('--dry-run') || !isExecute;

    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log(`Connected to MongoDB at ${uri}`);

        const db = client.db('student_portal');
        const groupsCol = db.collection('studentgroups');

        const totalGroups = await groupsCol.countDocuments();
        console.log(`Found ${totalGroups} legacy student group/team documents.`);

        if (isDryRun) {
            console.log('\n[DRY RUN MODE]: No data will be modified or removed.');
            console.log('To archive and clean legacy groups, re-run with: node scripts/cleanup_team_data.js --execute\n');
        } else {
            console.log('\n[EXECUTE MODE]: Archiving legacy group records to studentgroups_archive...');
            const archiveCol = db.collection('studentgroups_archive');
            
            const docs = await groupsCol.find({}).toArray();
            if (docs.length > 0) {
                await archiveCol.insertMany(docs);
                console.log(`Archived ${docs.length} documents into studentgroups_archive.`);
                await groupsCol.deleteMany({});
                console.log('Cleared studentgroups active collection.');
            }
            console.log('Legacy team data cleanup complete.');
        }
    } catch (err) {
        console.error('Error in cleanup script:', err);
    } finally {
        await client.close();
    }
}

if (require.main === module) {
    cleanupTeamData();
}

module.exports = { cleanupTeamData };
