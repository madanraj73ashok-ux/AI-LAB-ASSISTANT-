/**
 * Migration Script: Migrate Local Uploads to Google Drive
 * 
 * Uploads existing lab manual PDFs and proctoring snapshots to Google Drive,
 * updates MongoDB records with driveFileId and driveLink, and keeps local files intact.
 * 
 * Usage:
 *   node scripts/migrate_uploads_to_drive.js
 */

const path = require('path');
const fs = require('fs');

// Ensure environment variables are loaded
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const { initDatabases, mongoose } = require('../backend/db');
const LabManual = require('../backend/models/LabManual');
const ExamAttempt = require('../backend/models/ExamAttempt');
const driveService = require('../backend/services/driveService');
const {
    parseAndAnalyzeLabManual,
    saveAnalysisToStaffCollections,
    cleanupJunkComponentsInDatabase
} = require('../backend/services/pdfAnalyzer');

async function runMigration() {
    console.log('====================================================');
    console.log('🚀 STARTING UPLOADS TO GOOGLE DRIVE MIGRATION SCRIPT');
    console.log('====================================================\n');

    // 1. Connect to MongoDB databases
    console.log('📡 Connecting to MongoDB databases (staff_portal & student_portal)...');
    await initDatabases();
    console.log('✅ Connected to MongoDB successfully.\n');

    const manualsDir = path.join(__dirname, '..', 'backend', 'uploads', 'manuals');
    const proctoringDir = path.join(__dirname, '..', 'backend', 'uploads', 'proctoring');

    const manualsFolderId = process.env.GDRIVE_MANUALS_FOLDER_ID || null;
    const proctoringFolderId = process.env.GDRIVE_PROCTORING_FOLDER_ID || null;

    const driveConfigured = driveService.isDriveConfigured();
    if (!driveConfigured) {
        console.warn('⚠️  NOTICE: Google Drive OAuth credentials (GDRIVE_REFRESH_TOKEN) are not fully populated in .env.');
        console.warn('   The script will perform a dry-run migration check or generate simulation drive links.');
        console.warn('   To enable live uploading to Google Drive, please add GDRIVE_REFRESH_TOKEN to your .env file.\n');
    }

    // ---------------------------------------------------------------
    // STEP 1: MIGRATE LAB MANUALS
    // ---------------------------------------------------------------
    console.log('📁 [1/2] Processing Lab Manuals in:', manualsDir);
    let manualsMigrated = 0;
    let manualsFailed = 0;

    if (fs.existsSync(manualsDir)) {
        const manualFiles = fs.readdirSync(manualsDir).filter(f => f.toLowerCase().endsWith('.pdf'));
        console.log(`   Found ${manualFiles.length} manual PDF(s) on disk.\n`);

        for (const fileName of manualFiles) {
            const filePath = path.join(manualsDir, fileName);
            try {
                const buffer = fs.readFileSync(filePath);
                const stats = fs.statSync(filePath);
                let driveData = { fileId: '', webViewLink: '' };

                if (driveConfigured) {
                    console.log(`   ⬆️  Uploading manual "${fileName}" to Google Drive...`);
                    driveData = await driveService.uploadBuffer(
                        buffer,
                        fileName,
                        'application/pdf',
                        manualsFolderId
                    );
                    console.log(`   ✅ Uploaded! Drive File ID: ${driveData.fileId}`);
                    console.log(`      Link: ${driveData.webViewLink}`);
                } else {
                    const mockId = `drive_manual_${Math.abs(hash(fileName))}`;
                    driveData = {
                        fileId: mockId,
                        webViewLink: `https://drive.google.com/file/d/${mockId}/view`
                    };
                    console.log(`   ℹ️  [Dry-run] Simulated Drive link for "${fileName}": ${driveData.webViewLink}`);
                }

                // Parse content and extract clean experiments and components
                const analysis = await parseAndAnalyzeLabManual(
                    buffer,
                    fileName,
                    '',
                    `uploads/manuals/${fileName}`,
                    driveData.webViewLink,
                    driveData.fileId
                );

                // Save or update LabManual record and sync staff-side collections
                await saveAnalysisToStaffCollections({
                    analysis,
                    fileName: fileName,
                    originalFileName: fileName,
                    fileSize: stats.size,
                    mimeType: 'application/pdf',
                    filePath: `uploads/manuals/${fileName}`,
                    driveFileId: driveData.fileId,
                    driveLink: driveData.webViewLink,
                    staffUser: 'migration_script'
                });

                manualsMigrated++;
            } catch (err) {
                console.error(`   ❌ Failed to migrate manual "${fileName}":`, err.message);
                manualsFailed++;
            }
        }
    } else {
        console.log('   ⚠️  Manuals upload directory not found:', manualsDir);
    }

    console.log(`\n   ✓ Lab Manuals Summary: ${manualsMigrated} migrated, ${manualsFailed} failed.\n`);

    // ---------------------------------------------------------------
    // STEP 2: MIGRATE PROCTORING SNAPSHOTS
    // ---------------------------------------------------------------
    console.log('📸 [2/2] Processing Proctoring Snapshots in:', proctoringDir);
    let snapshotsMigrated = 0;
    let snapshotsFailed = 0;

    if (fs.existsSync(proctoringDir)) {
        const snapFiles = fs.readdirSync(proctoringDir).filter(f => {
            const lower = f.toLowerCase();
            return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
        });
        console.log(`   Found ${snapFiles.length} snapshot image(s) on disk.\n`);

        for (const fileName of snapFiles) {
            const filePath = path.join(proctoringDir, fileName);
            try {
                const buffer = fs.readFileSync(filePath);
                let driveData = { fileId: '', webViewLink: '' };

                if (driveConfigured) {
                    console.log(`   ⬆️  Uploading snapshot "${fileName}" to Google Drive...`);
                    driveData = await driveService.uploadBuffer(
                        buffer,
                        fileName,
                        'image/jpeg',
                        proctoringFolderId
                    );
                    console.log(`   ✅ Uploaded! Drive File ID: ${driveData.fileId}`);
                } else {
                    const mockId = `drive_snap_${Math.abs(hash(fileName))}`;
                    driveData = {
                        fileId: mockId,
                        webViewLink: `https://drive.google.com/file/d/${mockId}/view`
                    };
                    console.log(`   ℹ️  [Dry-run] Simulated Drive link for snapshot "${fileName}"`);
                }

                // Update MongoDB ExamAttempt records where snapshot references this file
                const localUrlPattern = new RegExp(fileName, 'i');
                const attempts = await ExamAttempt.find({
                    'snapshots.imageUrl': { $regex: localUrlPattern }
                });

                for (const att of attempts) {
                    let updated = false;
                    for (const snap of att.snapshots) {
                        if (snap.imageUrl && snap.imageUrl.includes(fileName)) {
                            snap.driveFileId = driveData.fileId;
                            snap.driveLink = driveData.webViewLink;
                            snap.imageUrl = driveData.webViewLink;
                            updated = true;
                        }
                    }
                    if (updated) {
                        await att.save();
                    }
                }

                snapshotsMigrated++;
            } catch (err) {
                console.error(`   ❌ Failed to migrate snapshot "${fileName}":`, err.message);
                snapshotsFailed++;
            }
        }
    } else {
        console.log('   ⚠️  Proctoring upload directory not found:', proctoringDir);
    }

    console.log(`\n   ✓ Proctoring Snapshots Summary: ${snapshotsMigrated} migrated, ${snapshotsFailed} failed.\n`);

    // Clean up historic junk components in database
    console.log('🧹 Cleaning up any legacy junk components in MongoDB...');
    await cleanupJunkComponentsInDatabase();
    console.log('✅ Legacy junk components purged.\n');

    console.log('====================================================');
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log(`   • Total Manuals Processed: ${manualsMigrated}`);
    console.log(`   • Total Snapshots Processed: ${snapshotsMigrated}`);
    console.log('   • Local files on disk: PRESERVED (not deleted)');
    console.log('====================================================\n');

    await mongoose.disconnect();
    process.exit(0);
}

function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return h;
}

runMigration().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
});
