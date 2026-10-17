const mongoose = require('mongoose');
const { staffConn } = require('../db');

const departmentScheduleSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true,
        trim: true
    },
    staffInCharge: {
        type: String,
        required: true,
        default: 'Prof. Staff In-Charge'
    },
    staffUsername: {
        type: String,
        default: 'staff_admin'
    },
    totalExperiments: {
        type: Number,
        default: 10
    },
    completedExperiments: {
        type: Number,
        default: 0
    },
    componentIssueDeadline: {
        type: Date,
        required: true
    },
    studentCompletionDeadline: {
        type: Date,
        required: true
    },
    batchName: {
        type: String,
        default: 'Batch 2026 - Section A'
    },
    milestone: {
        type: String,
        default: 'Lab Practical Milestone'
    },
    dueDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Pending', 'Done', 'Overdue', 'On Track', 'In Progress', 'Action Required', 'Completed'],
        default: 'Pending'
    },
    notes: {
        type: String,
        default: ''
    },
    lastUpdatedBy: {
        type: String,
        default: 'HOD OF DEP'
    }
}, { timestamps: true });

module.exports = staffConn.model('DepartmentSchedule', departmentScheduleSchema);
