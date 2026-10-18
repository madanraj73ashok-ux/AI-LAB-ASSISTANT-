const mongoose = require('mongoose');
const { staffConn } = require('../db');

const experimentSchema = new mongoose.Schema({
    experimentNumber: {
        type: String,
        required: [true, 'Experiment number is required'],
        trim: true
    },
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true
    },
    subject: {
        type: String,
        required: [true, 'Subject is required'],
        trim: true
    },
    laboratory: {
        type: String,
        required: [true, 'Laboratory is required'],
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    objectives: {
        type: [String],
        default: []
    },
    instructions: {
        type: String,
        default: ''
    },
    requiredComponents: [{
        componentName: String,
        partNumber: String,
        quantity: { type: Number, default: 1 },
        notes: String,
        value: { type: String, default: '' },
        specification: { type: String, default: '' },
        safetyNote: { type: String, default: '' }
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    staffInCharge: {
        type: String,
        default: ''
    },
    createdBy: {
        type: String,
        default: 'staff_admin'
    }
}, { timestamps: true });

experimentSchema.index({ experimentNumber: 1, subject: 1 }, { unique: true });

module.exports = staffConn.model('Experiment', experimentSchema);
