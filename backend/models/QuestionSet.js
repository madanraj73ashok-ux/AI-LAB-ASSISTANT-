const mongoose = require('mongoose');
const { staffConn } = require('../db');

const questionItemSchema = new mongoose.Schema({
    questionText: {
        type: String,
        required: true
    },
    options: {
        type: [String],
        validate: [arr => arr.length === 4, 'Must have exactly 4 options']
    },
    correctOptionIndex: {
        type: Number,
        min: 0,
        max: 3,
        required: true
    },
    marks: {
        type: Number,
        default: 1
    }
});

const questionSetSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true,
        trim: true
    },
    experimentNumber: {
        type: String,
        required: true,
        trim: true
    },
    title: {
        type: String,
        default: ''
    },
    testDurationMinutes: {
        type: Number,
        default: 5
    },
    passMark: {
        type: Number,
        default: 3
    },
    questions: [questionItemSchema],
    isPublished: {
        type: Boolean,
        default: true
    },
    updatedBy: {
        type: String,
        default: 'staff_admin'
    }
}, { timestamps: true });

module.exports = staffConn.model('QuestionSet', questionSetSchema);
