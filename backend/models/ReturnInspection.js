const mongoose = require('mongoose');
const { staffConn } = require('../db');

const returnInspectionSchema = new mongoose.Schema({
    returnId: {
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
    inspectedBy: {
        type: String,
        required: true
    },
    inspectionTimestamp: {
        type: Date,
        default: Date.now
    },
    items: [{
        partNumber: String,
        componentName: String,
        issuedQty: { type: Number, default: 0 },
        returnedQty: { type: Number, default: 0 },
        missingQty: { type: Number, default: 0 },
        damagedQty: { type: Number, default: 0 },
        conditionAfter: { type: String, default: 'Good' },
        testProcedureNotes: { type: String, default: '' }
    }],
    inspectionStatus: {
        type: String,
        enum: ['All Good', 'Items Missing', 'Damaged Items Found', 'Needs Senior Review'],
        default: 'All Good'
    },
    remarks: String
}, { timestamps: true });

module.exports = staffConn.model('ReturnInspection', returnInspectionSchema);
