const mongoose = require('mongoose');
const { staffConn } = require('../db');

const componentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Component name is required'],
        trim: true
    },
    type: {
        type: String,
        required: [true, 'Component type is required'],
        trim: true
    },
    partNumber: {
        type: String,
        required: [true, 'Part number is required'],
        unique: true,
        trim: true
    },
    totalQuantity: {
        type: Number,
        default: 0
    },
    availableQuantity: {
        type: Number,
        default: 0
    },
    minimumStockLevel: {
        type: Number,
        default: 5
    },
    storageLocation: {
        type: String,
        default: 'Storage Bin'
    },
    condition: {
        type: String,
        enum: ['Brand New', 'Good', 'Fair', 'Under Inspection', 'Defective'],
        default: 'Good'
    },
    specifications: {
        type: String,
        default: ''
    },
    safetyPrecautions: {
        type: String,
        default: ''
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    history: [{
        action: String,
        quantityChange: Number,
        staff: String,
        date: { type: Date, default: Date.now },
        remarks: String
    }]
}, { timestamps: true });

module.exports = staffConn.model('Component', componentSchema);
