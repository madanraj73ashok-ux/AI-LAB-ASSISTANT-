const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { studentConn, staffConn } = require('../db');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    role: {
        type: String,
        enum: ['student', 'staff', 'HOD OF DEP', 'admin', 'hod'],
        default: 'student',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash the password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Student User model in student_portal database
const StudentUser = studentConn.model('User', userSchema);

// Staff User model in staff_portal database
const StaffUser = staffConn.model('User', userSchema);

// Default export is StudentUser for backwards-compatibility in student routes
module.exports = StudentUser;
module.exports.StudentUser = StudentUser;
module.exports.StaffUser = StaffUser;
module.exports.userSchema = userSchema;
