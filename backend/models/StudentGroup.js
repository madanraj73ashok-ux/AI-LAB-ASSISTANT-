const mongoose = require('mongoose');
const { studentConn } = require('../db');

const memberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    registrationId: { type: String, required: true },
    email: String,
    passed: { type: Boolean, default: false }
});

const studentGroupSchema = new mongoose.Schema({
    groupId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    groupName: {
        type: String,
        required: true,
        trim: true
    },
    leaderUsername: {
        type: String,
        trim: true
    },
    partnerUsername: {
        type: String,
        trim: true
    },
    member1Passed: {
        type: Boolean,
        default: false
    },
    member2Passed: {
        type: Boolean,
        default: false
    },
    allowedPractical: {
        type: Boolean,
        default: false
    },
    subject: {
        type: String,
        required: true
    },
    experimentNumber: {
        type: String,
        required: true
    },
    members: [memberSchema],
    testStatus: {
        type: String,
        enum: ['Not Started', 'Pending', 'Passed', 'Failed'],
        default: 'Not Started'
    },
    testScore: {
        type: Number,
        default: 0
    },
    testMaxScore: {
        type: Number,
        default: 10
    },
    testAttempts: [{
        attemptDate: { type: Date, default: Date.now },
        score: Number,
        passed: Boolean
    }],
    assignedComponents: [{
        componentName: String,
        partNumber: String,
        quantity: Number,
        issued: { type: Boolean, default: false }
    }],
    status: {
        type: String,
        enum: [
            'Registered',
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
        default: 'Registered'
    },
    sessionStartTime: Date,
    sessionEndTime: Date
}, { timestamps: true });

module.exports = studentConn.model('StudentGroup', studentGroupSchema);
