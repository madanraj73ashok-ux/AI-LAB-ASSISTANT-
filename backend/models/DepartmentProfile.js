const mongoose = require('mongoose');
const { staffConn } = require('../db');

const departmentProfileSchema = new mongoose.Schema({
    departmentName: {
        type: String,
        default: 'Department of Electrical & Computer Engineering'
    },
    hodName: {
        type: String,
        default: 'Admin (HOD)'
    },
    academicYear: {
        type: String,
        default: 'Academic Year 2026-2027 (Semester V)'
    },
    announcement: {
        type: String,
        default: 'All staff members are instructed to complete component handovers by the target deadline.'
    },
    lastUpdatedBy: {
        type: String,
        default: 'admin'
    }
}, { timestamps: true });

module.exports = staffConn.model('DepartmentProfile', departmentProfileSchema);
