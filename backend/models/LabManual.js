const mongoose = require('mongoose');
const { staffConn } = require('../db');

const labManualSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: [true, 'Subject is required'],
        trim: true
    },
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
    fileName: {
        type: String,
        required: true
    },
    originalFileName: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        default: 0
    },
    mimeType: {
        type: String,
        default: 'application/pdf'
    },
    filePath: {
        type: String,
        default: ''
    },
    driveFileId: {
        type: String,
        default: '',
        index: true
    },
    driveLink: {
        type: String,
        default: ''
    },
    isPublished: {
        type: Boolean,
        default: true
    },
    updatedBy: {
        type: String,
        default: 'staff_admin'
    },
    version: {
        type: Number,
        default: 1
    },
    targetYear: {
        type: String,
        default: 'All'
    },
    targetSection: {
        type: String,
        default: 'All'
    },
    targetDepartment: {
        type: String,
        default: 'ECE'
    },
    assignedStudentsCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = staffConn.model('LabManual', labManualSchema);
