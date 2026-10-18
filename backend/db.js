const mongoose = require('mongoose');

const STUDENT_DB_URI = process.env.STUDENT_DB_URI || 'mongodb://127.0.0.1:27017/student_portal';
const STAFF_DB_URI = process.env.STAFF_DB_URI || 'mongodb://127.0.0.1:27017/staff_portal';

// Dedicated connection for Student Portal
const studentConn = mongoose.createConnection(STUDENT_DB_URI);

// Dedicated connection for Staff Portal
const staffConn = mongoose.createConnection(STAFF_DB_URI);

studentConn.on('connected', () => {
    console.log('✅ Connected to MongoDB - student_portal (Students, Exam Attempts, Groups)');
});
studentConn.on('error', (err) => {
    console.error('❌ MongoDB Connection Error (student_portal):', err.message || err);
});

staffConn.on('connected', () => {
    console.log('✅ Connected to MongoDB - staff_portal (Staff, Experiments, Manuals, Components, Questions, Audit)');
});
staffConn.on('error', (err) => {
    console.error('❌ MongoDB Connection Error (staff_portal):', err.message || err);
});

async function initDatabases() {
    await Promise.all([
        studentConn.asPromise(),
        staffConn.asPromise()
    ]);
}

module.exports = {
    mongoose,
    studentConn,
    staffConn,
    initDatabases
};
