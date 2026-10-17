const mongoose = require('mongoose');
const { staffConn } = require('../db');

const auditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true
    },
    category: {
        type: String,
        default: 'General'
    },
    staffUsername: {
        type: String,
        required: true
    },
    details: {
        type: String,
        default: ''
    },
    ip: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = staffConn.model('AuditLog', auditLogSchema);
