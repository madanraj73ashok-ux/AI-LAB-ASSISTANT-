const mongoose = require('mongoose');
const { studentConn } = require('../db');

const examAttemptSchema = new mongoose.Schema({
    attemptId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    studentUsername: {
        type: String,
        required: true,
        index: true,
        trim: true
    },
    registrationId: {
        type: String,
        trim: true
    },
    experimentNumber: {
        type: String,
        required: true,
        index: true,
        trim: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    attemptNumber: {
        type: Number,
        default: 1
    },
    questionSetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuestionSet'
    },
    totalQuestions: {
        type: Number,
        default: 0
    },
    totalMarks: {
        type: Number,
        default: 0
    },
    passMark: {
        type: Number,
        default: 0
    },
    score: {
        type: Number,
        default: 0
    },
    passed: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: [
            'Ready',
            'In Progress',
            'Warning Issued',
            'Submitted',
            'Passed',
            'Failed',
            'Pending Review',
            'Retry Allowed',
            'Terminated',
            'Ineligible for Current Lab Session'
        ],
        default: 'In Progress'
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    submissionTime: {
        type: Date
    },
    durationSeconds: {
        type: Number,
        default: 0
    },
    answers: [{
        questionIndex: Number,
        selectedOptionIndex: Number,
        isCorrect: Boolean,
        marksAwarded: Number
    }],
    monitoringEvents: [{
        eventType: {
            type: String,
            enum: [
                'tab_switch',
                'window_blur',
                'fullscreen_exit',
                'no_face',
                'multiple_faces',
                'looking_away',
                'eyes_closed_down',
                'phone_detected',
                'copy_attempt',
                'camera_offline',
                'camera_denied'
            ],
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        details: {
            type: String,
            default: ''
        },
        confidence: {
            type: Number,
            default: 1.0
        },
        actionTaken: {
            type: String,
            default: 'Logged'
        }
    }],
    warningCount: {
        type: Number,
        default: 0
    },
    cameraEnabled: {
        type: Boolean,
        default: false
    },
    reviewedByStaff: {
        type: Boolean,
        default: false
    },
    staffReviewNotes: {
        type: String,
        default: ''
    },
    snapshots: [{
        imageUrl: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        trigger: {
            type: String,
            default: 'periodic'
        },
        label: {
            type: String,
            default: 'Examinee Verified'
        }
    }]
}, { timestamps: true });

// Compound indexes for rapid student attempt lookup
examAttemptSchema.index({ studentUsername: 1, experimentNumber: 1 });
examAttemptSchema.index({ studentUsername: 1, status: 1 });

module.exports = studentConn.model('ExamAttempt', examAttemptSchema);
