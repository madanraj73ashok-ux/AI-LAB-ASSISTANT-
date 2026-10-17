const mongoose = require('mongoose');
const { studentConn } = require('../db');

const componentIssueSchema = new mongoose.Schema({
    issueId: {
        type: String,
        required: true,
        unique: true
    },
    sessionId: {
        type: String,
        required: true
    },
    groupId: {
        type: String,
        required: true
    },
    groupName: {
        type: String,
        required: true
    },
    experimentNumber: {
        type: String,
        required: true
    },
    components: [{
        componentId: mongoose.Schema.Types.ObjectId,
        partNumber: String,
        name: String,
        expectedQty: Number,
        issuedQty: Number,
        conditionBefore: { type: String, default: 'Good' }
    }],
    issuedBy: {
        type: String,
        required: true
    },
    issueTimestamp: {
        type: Date,
        default: Date.now
    },
    notes: String
}, { timestamps: true });

module.exports = studentConn.model('ComponentIssue', componentIssueSchema);
