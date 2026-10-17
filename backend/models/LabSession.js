const mongoose = require('mongoose');
const { studentConn } = require('../db');

const labSessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    groupId: {
        type: String,
        required: true
    },
    groupName: {
        type: String,
        required: true
    },
    studentNames: [String],
    experimentNumber: {
        type: String,
        required: true
    },
    experimentTitle: String,
    subject: String,
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: Date,
    expectedDurationMinutes: {
        type: Number,
        default: 120
    },
    status: {
        type: String,
        enum: [
            'Test Pending',
            'Test Passed',
            'Test Failed',
            'Awaiting Component Issue',
            'Components Issued',
            'Experiment In Progress',
            'Return Pending',
            'Inspection Pending',
            'Completed'
        ],
        default: 'Awaiting Component Issue'
    },
    componentsIssued: [{
        componentName: String,
        partNumber: String,
        quantity: Number,
        conditionBefore: String
    }],
    issuedBy: String,
    issueTime: Date,
    returnTime: Date,
    inspectedBy: String,
    history: [{
        timestamp: { type: Date, default: Date.now },
        status: String,
        notes: String,
        actor: String
    }]
}, { timestamps: true });

module.exports = studentConn.model('LabSession', labSessionSchema);
