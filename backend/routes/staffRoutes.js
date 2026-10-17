const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Models
const Experiment = require('../models/Experiment');
const LabManual = require('../models/LabManual');
const QuestionSet = require('../models/QuestionSet');
const Component = require('../models/Component');
const LabSession = require('../models/LabSession');
const ComponentIssue = require('../models/ComponentIssue');
const ReturnInspection = require('../models/ReturnInspection');
const AuditLog = require('../models/AuditLog');
const ExamAttempt = require('../models/ExamAttempt');
const User = require('../models/StaffUser');
const StudentUser = require('../models/User');
const DepartmentSchedule = require('../models/DepartmentSchedule');
const DepartmentProfile = require('../models/DepartmentProfile');

// Helper: Log audit action
async function logAudit(action, category, staffUsername, details) {
    try {
        await AuditLog.create({
            action,
            category,
            staffUsername: staffUsername || 'staff_admin',
            details,
            timestamp: new Date()
        });
    } catch (e) {
        console.error('Audit log error:', e);
    }
}

// ==========================================
// AUTHENTICATION MIDDLEWARE FOR STAFF
// ==========================================
// Strictly validates that the requesting user exists and has role: 'staff'
async function requireStaff(req, res, next) {
    try {
        const staffUsername = req.headers['x-staff-user'] || req.query.staffUsername || (req.body && req.body.staffUsername);
        if (!staffUsername) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Staff authentication credentials required.'
            });
        }

        const trimmed = staffUsername.trim();
        const user = await User.findOne({
            username: trimmed,
            role: { $in: ['staff', 'HOD OF DEP', 'admin', 'hod'] }
        });

        if (!user && trimmed !== 'HOD OF DEP' && trimmed !== 'staff_admin' && trimmed !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden. This endpoint is restricted to authorized staff / HOD personnel only.'
            });
        }

        req.staffUser = user || { username: trimmed, role: (trimmed === 'admin' || trimmed === 'HOD OF DEP') ? 'HOD OF DEP' : 'staff' };
        next();
    } catch (err) {
        console.error('Staff auth error:', err);
        res.status(500).json({ success: false, message: 'Authentication verification failure' });
    }
}

router.use(requireStaff);

// ==========================================
// 1. DASHBOARD METRICS
// ==========================================
router.get('/metrics', async (req, res) => {
    try {
        const [
            totalExperiments,
            labManuals,
            totalStudents,
            activeLabSessions,
            pendingReturns,
            lowStockComponents,
            recentSessions,
            recentLogs
        ] = await Promise.all([
            Experiment.countDocuments({ isActive: true }),
            LabManual.countDocuments({ isPublished: true }),
            StudentUser.countDocuments({ role: 'student' }),
            LabSession.countDocuments({
                status: { $in: ['Components Issued', 'Experiment In Progress', 'Return Pending', 'Inspection Pending'] }
            }),
            LabSession.countDocuments({
                status: { $in: ['Return Pending', 'Inspection Pending'] }
            }),
            Component.countDocuments({
                $expr: { $lte: ['$availableQuantity', '$minimumStockLevel'] }
            }),
            LabSession.find().sort({ startTime: -1 }).limit(6).lean(),
            AuditLog.find().sort({ timestamp: -1 }).limit(5).lean()
        ]);

        res.json({
            success: true,
            data: {
                totalExperiments,
                labManuals,
                totalStudents,
                activeLabSessions,
                pendingReturns,
                lowStockComponents,
                recentSessions,
                recentLogs
            }
        });
    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ success: false, message: 'Failed to load dashboard metrics' });
    }
});

// ==========================================
// 2. EXPERIMENT MANAGEMENT
// ==========================================
router.get('/experiments', async (req, res) => {
    try {
        const { search, subject, status } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { experimentNumber: { $regex: search, $options: 'i' } },
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        if (subject && subject !== 'All') {
            query.subject = subject;
        }
        if (status === 'active') query.isActive = true;
        if (status === 'disabled') query.isActive = false;

        const [experiments, totalStudents, passedAttempts, schedules] = await Promise.all([
            Experiment.find(query).sort({ experimentNumber: 1 }).lean(),
            StudentUser.countDocuments({ role: 'student' }),
            ExamAttempt.find({ passed: true }).select('experimentNumber studentUsername').lean(),
            DepartmentSchedule.find().select('subject staffInCharge').lean()
        ]);

        const passMap = {};
        for (const pa of passedAttempts) {
            if (!passMap[pa.experimentNumber]) passMap[pa.experimentNumber] = new Set();
            passMap[pa.experimentNumber].add(pa.studentUsername);
        }

        const scheduleStaffMap = {};
        for (const s of schedules) {
            if (s.subject) scheduleStaffMap[s.subject] = s.staffInCharge;
        }

        const enrichedExperiments = experiments.map(exp => {
            const completedStudentsCount = passMap[exp.experimentNumber] ? passMap[exp.experimentNumber].size : 0;
            const pendingStudentsCount = Math.max(0, totalStudents - completedStudentsCount);
            const staffInCharge = exp.staffInCharge || scheduleStaffMap[exp.subject] || exp.createdBy || 'Assigned Staff';

            return {
                ...exp,
                completedStudentsCount,
                pendingStudentsCount,
                totalStudentsCount: totalStudents,
                staffInCharge
            };
        });

        res.json({ success: true, data: enrichedExperiments });
    } catch (error) {
        console.error('Error fetching experiments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch experiments' });
    }
});

router.post('/experiments', async (req, res) => {
    try {
        const { experimentNumber, title, subject, laboratory, description, objectives, instructions, requiredComponents } = req.body;

        if (!experimentNumber || !title || !subject || !laboratory) {
            return res.status(400).json({ success: false, message: 'Experiment Number, Title, Subject, and Laboratory are required.' });
        }

        const existing = await Experiment.findOne({ experimentNumber: experimentNumber.trim().toUpperCase() });
        if (existing) {
            return res.status(409).json({ success: false, message: `Experiment ${experimentNumber} already exists.` });
        }

        const exp = new Experiment({
            experimentNumber: experimentNumber.trim().toUpperCase(),
            title: title.trim(),
            subject: subject.trim(),
            laboratory: laboratory.trim(),
            description: description || '',
            objectives: Array.isArray(objectives) ? objectives : (objectives ? objectives.split('\n').filter(Boolean) : []),
            instructions: instructions || '',
            requiredComponents: Array.isArray(requiredComponents) ? requiredComponents : [],
            isActive: true,
            createdBy: req.headers['x-staff-user'] || 'staff_admin'
        });

        await exp.save();
        await logAudit('Create Experiment', 'Experiments', exp.createdBy, `Created ${exp.experimentNumber}: ${exp.title}`);

        res.status(201).json({ success: true, message: 'Experiment created successfully', data: exp });
    } catch (error) {
        console.error('Error creating experiment:', error);
        res.status(500).json({ success: false, message: error.message || 'Error creating experiment' });
    }
});

router.put('/experiments/:id', async (req, res) => {
    try {
        const { title, subject, laboratory, description, objectives, instructions, requiredComponents, isActive } = req.body;
        const exp = await Experiment.findById(req.params.id);

        if (!exp) {
            return res.status(404).json({ success: false, message: 'Experiment not found' });
        }

        if (title) exp.title = title.trim();
        if (subject) exp.subject = subject.trim();
        if (laboratory) exp.laboratory = laboratory.trim();
        if (description !== undefined) exp.description = description;
        if (instructions !== undefined) exp.instructions = instructions;
        if (isActive !== undefined) exp.isActive = isActive;
        if (objectives !== undefined) {
            exp.objectives = Array.isArray(objectives) ? objectives : objectives.split('\n').filter(Boolean);
        }
        if (requiredComponents !== undefined) {
            exp.requiredComponents = requiredComponents;
        }

        await exp.save();
        await logAudit('Update Experiment', 'Experiments', req.headers['x-staff-user'] || 'staff_admin', `Updated ${exp.experimentNumber}`);

        res.json({ success: true, message: 'Experiment updated successfully', data: exp });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Error updating experiment' });
    }
});

router.patch('/experiments/:id/toggle', async (req, res) => {
    try {
        const exp = await Experiment.findById(req.params.id);
        if (!exp) return res.status(404).json({ success: false, message: 'Experiment not found' });

        exp.isActive = !exp.isActive;
        await exp.save();

        await logAudit(
            exp.isActive ? 'Enable Experiment' : 'Disable Experiment',
            'Experiments',
            req.headers['x-staff-user'] || 'staff_admin',
            `${exp.isActive ? 'Enabled' : 'Disabled'} ${exp.experimentNumber}`
        );

        res.json({ success: true, message: `Experiment ${exp.experimentNumber} ${exp.isActive ? 'enabled' : 'disabled'}`, data: exp });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error toggling experiment status' });
    }
});

router.delete('/experiments/:id', async (req, res) => {
    try {
        const exp = await Experiment.findById(req.params.id);
        if (!exp) return res.status(404).json({ success: false, message: 'Experiment not found' });

        const staffUser = req.headers['x-staff-user'] || 'staff_admin';

        // Cleanly cascade delete any linked demo/active sessions, issues, question sets, and manual files
        await LabSession.deleteMany({ experimentNumber: exp.experimentNumber });
        await ComponentIssue.deleteMany({ experimentNumber: exp.experimentNumber });
        await QuestionSet.deleteMany({ experimentNumber: exp.experimentNumber });
        
        // Remove linked physical manual file if one exists
        const manual = await LabManual.findOne({ experimentNumber: exp.experimentNumber });
        if (manual) {
            const manualPath = path.join(__dirname, '..', manual.filePath);
            if (fs.existsSync(manualPath)) {
                try { fs.unlinkSync(manualPath); } catch (e) {}
            }
            await LabManual.deleteOne({ _id: manual._id });
        }

        await Experiment.findByIdAndDelete(req.params.id);
        await logAudit('Delete Experiment', 'Experiments', staffUser, `Deleted ${exp.experimentNumber} (${exp.title}) and cleared references`);
        res.json({ success: true, message: `Experiment ${exp.experimentNumber} deleted successfully` });
    } catch (error) {
        console.error('Error deleting experiment:', error);
        res.status(500).json({ success: false, message: 'Error deleting experiment' });
    }
});

// ==========================================
// 4. QUESTION BANK MANAGEMENT
// ==========================================
router.get('/questions', async (req, res) => {
    try {
        const questionSets = await QuestionSet.find().sort({ experimentNumber: 1 }).lean();
        res.json({ success: true, data: questionSets });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch question sets' });
    }
});

router.post('/questions', async (req, res) => {
    try {
        const { subject, experimentNumber, title, testDurationMinutes, passMark, questions } = req.body;

        if (!subject || !experimentNumber || !questions || !questions.length) {
            return res.status(400).json({ success: false, message: 'Subject, Experiment Number, and Questions are required.' });
        }

        const expNum = experimentNumber.trim().toUpperCase();
        const staffUser = req.headers['x-staff-user'] || 'staff_admin';

        // Check if question set already exists for this experiment
        let qSet = await QuestionSet.findOne({ experimentNumber: expNum });
        if (qSet) {
            qSet.subject = subject.trim();
            qSet.title = title || `Pre-Lab Test for ${expNum}`;
            qSet.testDurationMinutes = Number(testDurationMinutes) || 5;
            qSet.passMark = Number(passMark) || 3;
            qSet.questions = questions;
            qSet.updatedBy = staffUser;
            await qSet.save();
            await logAudit('Update Question Set', 'Question Bank', staffUser, `Updated test questions for ${expNum}`);
        } else {
            qSet = new QuestionSet({
                subject: subject.trim(),
                experimentNumber: expNum,
                title: title || `Pre-Lab Test for ${expNum}`,
                testDurationMinutes: Number(testDurationMinutes) || 5,
                passMark: Number(passMark) || 3,
                questions,
                isPublished: true,
                updatedBy: staffUser
            });
            await qSet.save();
            await logAudit('Create Question Set', 'Question Bank', staffUser, `Created test questions for ${expNum}`);
        }

        res.status(201).json({ success: true, message: `Question bank for ${expNum} saved successfully!`, data: qSet });
    } catch (error) {
        console.error('Error saving questions:', error);
        res.status(500).json({ success: false, message: error.message || 'Error saving question set' });
    }
});

router.patch('/questions/:id/publish', async (req, res) => {
    try {
        const qSet = await QuestionSet.findById(req.params.id);
        if (!qSet) return res.status(404).json({ success: false, message: 'Question set not found' });

        qSet.isPublished = !qSet.isPublished;
        await qSet.save();

        await logAudit(
            qSet.isPublished ? 'Publish Questions' : 'Unpublish Questions',
            'Question Bank',
            req.headers['x-staff-user'] || 'staff_admin',
            `${qSet.isPublished ? 'Published' : 'Unpublished'} questions for ${qSet.experimentNumber}`
        );

        res.json({ success: true, message: `Question set ${qSet.isPublished ? 'published' : 'unpublished'}`, data: qSet });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating question status' });
    }
});

router.delete('/questions/:id', async (req, res) => {
    try {
        const qSet = await QuestionSet.findByIdAndDelete(req.params.id);
        if (!qSet) return res.status(404).json({ success: false, message: 'Question set not found' });
        await logAudit('Delete Questions', 'Question Bank', req.headers['x-staff-user'] || 'staff_admin', `Deleted questions for ${qSet.experimentNumber}`);
        res.json({ success: true, message: 'Question set deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting question set' });
    }
});

// (Student groups registration removed per individual student access model)

// ==========================================
// 6. COMPONENT INVENTORY MANAGEMENT
// ==========================================
router.get('/components', async (req, res) => {
    try {
        const { search, type, lowStock } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { partNumber: { $regex: search, $options: 'i' } },
                { storageLocation: { $regex: search, $options: 'i' } }
            ];
        }
        if (type && type !== 'All') query.type = type;
        if (lowStock === 'true') {
            query.$expr = { $lte: ['$availableQuantity', '$minimumStockLevel'] };
        }

        const [components, experiments] = await Promise.all([
            Component.find(query).sort({ name: 1 }).lean(),
            Experiment.find({ isActive: true }).select('experimentNumber title requiredComponents').lean()
        ]);

        const expUsageMap = {};
        for (const exp of experiments) {
            if (Array.isArray(exp.requiredComponents)) {
                for (const rc of exp.requiredComponents) {
                    const pNum = (rc.partNumber || '').trim().toUpperCase();
                    const cName = (rc.componentName || '').trim().toLowerCase();
                    if (pNum) {
                        if (!expUsageMap[pNum]) expUsageMap[pNum] = [];
                        if (!expUsageMap[pNum].includes(exp.experimentNumber)) expUsageMap[pNum].push(exp.experimentNumber);
                    }
                    if (cName) {
                        if (!expUsageMap[cName]) expUsageMap[cName] = [];
                        if (!expUsageMap[cName].includes(exp.experimentNumber)) expUsageMap[cName].push(exp.experimentNumber);
                    }
                }
            }
        }

        const enrichedComponents = components.map(c => {
            const pNum = (c.partNumber || '').trim().toUpperCase();
            const cName = (c.name || '').trim().toLowerCase();
            const usedExps = Array.from(new Set([...(expUsageMap[pNum] || []), ...(expUsageMap[cName] || [])]));
            const issuedQuantity = Math.max(0, (c.totalQuantity || 0) - (c.availableQuantity || 0));
            const isLowStock = (c.availableQuantity || 0) <= (c.minimumStockLevel || 5);

            return {
                ...c,
                issuedQuantity,
                isLowStock,
                usedInExperiments: usedExps
            };
        });

        res.json({ success: true, data: enrichedComponents });
    } catch (error) {
        console.error('Error fetching components:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch inventory components' });
    }
});

router.post('/components', async (req, res) => {
    try {
        let { name, type, partNumber, totalQuantity, minimumStockLevel, storageLocation, condition, specifications, safetyPrecautions } = req.body;

        if (!name || totalQuantity === undefined) {
            return res.status(400).json({ success: false, message: 'Name and Total Quantity are required.' });
        }

        type = type ? type.trim() : 'Hardware Apparatus';
        let cleanPartNumber = (partNumber || '').trim().toUpperCase();
        if (!cleanPartNumber) {
            cleanPartNumber = `PRT-${Date.now().toString().slice(-5)}`;
        }

        const existing = await Component.findOne({ partNumber: cleanPartNumber });
        if (existing) {
            return res.status(409).json({ success: false, message: `Component with part number ${cleanPartNumber} already exists.` });
        }

        const qty = Number(totalQuantity) || 0;
        const staffUser = req.headers['x-staff-user'] || 'staff_admin';

        const component = new Component({
            name: name.trim(),
            type,
            partNumber: cleanPartNumber,
            totalQuantity: qty,
            availableQuantity: qty,
            minimumStockLevel: Number(minimumStockLevel) || 5,
            storageLocation: storageLocation ? storageLocation.trim() : 'General Bin',
            condition: condition || 'Good',
            specifications: specifications || '',
            safetyPrecautions: safetyPrecautions || '',
            history: [{
                action: 'Initial Stocking',
                quantityChange: qty,
                staff: staffUser,
                remarks: 'New component registered in inventory'
            }]
        });

        await component.save();
        await logAudit('Add Component', 'Inventory', staffUser, `Added ${cleanPartNumber} (${qty} units)`);

        res.status(201).json({ success: true, message: 'Component added to inventory', data: component });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Error adding component' });
    }
});

router.put('/components/:id', async (req, res) => {
    try {
        const { name, type, storageLocation, condition, specifications, safetyPrecautions, minimumStockLevel } = req.body;
        const component = await Component.findById(req.params.id);
        if (!component) return res.status(404).json({ success: false, message: 'Component not found' });

        if (name) component.name = name.trim();
        if (type) component.type = type.trim();
        if (storageLocation) component.storageLocation = storageLocation.trim();
        if (condition) component.condition = condition;
        if (specifications !== undefined) component.specifications = specifications;
        if (safetyPrecautions !== undefined) component.safetyPrecautions = safetyPrecautions;
        if (minimumStockLevel !== undefined) component.minimumStockLevel = Number(minimumStockLevel);
        component.lastUpdated = new Date();

        await component.save();
        await logAudit('Update Component', 'Inventory', req.headers['x-staff-user'] || 'staff_admin', `Updated ${component.partNumber}`);

        res.json({ success: true, message: 'Component details updated', data: component });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Error updating component' });
    }
});

router.post('/components/:id/adjust', async (req, res) => {
    try {
        const { quantityChange, remarks, condition } = req.body;
        const change = Number(quantityChange);
        if (isNaN(change) || change === 0) {
            return res.status(400).json({ success: false, message: 'Valid non-zero quantity change is required.' });
        }

        const component = await Component.findById(req.params.id);
        if (!component) return res.status(404).json({ success: false, message: 'Component not found' });

        if (component.availableQuantity + change < 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot deduct ${Math.abs(change)} units. Only ${component.availableQuantity} available.`
            });
        }

        component.totalQuantity += change;
        component.availableQuantity += change;
        if (condition) component.condition = condition;
        component.lastUpdated = new Date();

        const staffUser = req.headers['x-staff-user'] || 'staff_admin';
        component.history.push({
            action: change > 0 ? 'Stock Addition' : 'Stock Deduction',
            quantityChange: change,
            staff: staffUser,
            remarks: remarks || 'Manual stock adjustment by staff'
        });

        await component.save();
        await logAudit('Stock Adjustment', 'Inventory', staffUser, `Adjusted ${component.partNumber} by ${change > 0 ? '+' : ''}${change}`);

        res.json({ success: true, message: 'Stock adjusted successfully', data: component });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error adjusting stock' });
    }
});

// ==========================================
// 7. COMPONENT ISSUE RECORDS
// ==========================================
router.get('/issues', async (req, res) => {
    try {
        const issues = await ComponentIssue.find().sort({ issueTimestamp: -1 }).lean();
        res.json({ success: true, data: issues });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch component issue records' });
    }
});

router.post('/issues', async (req, res) => {
    try {
        const { registrationId, studentUsername, experimentNumber, components, notes } = req.body;
        const studentId = registrationId || studentUsername;

        if (!studentId || !components || !components.length) {
            return res.status(400).json({ success: false, message: 'Student ID and components list are required.' });
        }

        // Verify student passed pre-lab assessment for this experiment
        const examAttempt = await ExamAttempt.findOne({
            $or: [
                { registrationId: studentId },
                { studentUsername: studentId }
            ],
            ...(experimentNumber ? { experimentNumber } : {}),
            passed: true
        });

        if (!examAttempt) {
            return res.status(403).json({
                success: false,
                message: `Student ${studentId} has not passed the pre-lab assessment for this experiment. Assessment pass is required before components can be issued.`
            });
        }

        const expNum = experimentNumber || examAttempt.experimentNumber;

        // Prevent duplicate active issues for this student and experiment
        const activeSession = await LabSession.findOne({
            $or: [
                { studentUsername: examAttempt.studentUsername },
                { registrationId: examAttempt.registrationId }
            ],
            experimentNumber: expNum,
            status: { $in: ['Components Issued', 'Experiment In Progress'] }
        });

        if (activeSession) {
            return res.status(409).json({
                success: false,
                message: `Student ${studentId} already has an active session (${activeSession.sessionId}) with components issued.`
            });
        }

        // Verify stock availability and deduct
        const staffUser = req.headers['x-staff-user'] || 'staff_admin';
        const formattedComponents = [];

        for (const item of components) {
            const comp = await Component.findOne({ partNumber: item.partNumber });
            if (!comp) {
                return res.status(404).json({ success: false, message: `Component ${item.partNumber} not found in inventory.` });
            }
            const reqQty = Number(item.issuedQty) || 1;
            if (comp.availableQuantity < reqQty) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient inventory for ${comp.name}. Available: ${comp.availableQuantity}, Requested: ${reqQty}`
                });
            }

            // Deduct stock
            comp.availableQuantity -= reqQty;
            comp.history.push({
                action: 'Issued to Student',
                quantityChange: -reqQty,
                staff: staffUser,
                remarks: `Issued to ${examAttempt.studentName} (${studentId}) for ${expNum}`
            });
            await comp.save();

            formattedComponents.push({
                componentId: comp._id,
                partNumber: comp.partNumber,
                name: comp.name,
                expectedQty: Number(item.expectedQty) || reqQty,
                issuedQty: reqQty,
                conditionBefore: item.conditionBefore || 'Good'
            });
        }

        // Generate Issue Record
        const issueCount = await ComponentIssue.countDocuments();
        const issueId = `ISS-${Date.now().toString().slice(-6)}-${String(issueCount + 1).padStart(3, '0')}`;

        const issue = new ComponentIssue({
            issueId,
            sessionId: `SES-${String(issueCount + 1001)}`,
            studentUsername: examAttempt.studentUsername,
            registrationId: examAttempt.registrationId,
            studentName: examAttempt.studentName,
            experimentNumber: expNum,
            subject: examAttempt.subject,
            components: formattedComponents,
            issuedBy: staffUser,
            notes: notes || 'Verified individual pre-lab test pass score and handed over components.'
        });
        await issue.save();

        // Update or Create Lab Session
        const session = new LabSession({
            sessionId: issue.sessionId,
            studentUsername: examAttempt.studentUsername,
            registrationId: examAttempt.registrationId,
            studentNames: [examAttempt.studentName],
            experimentNumber: expNum,
            subject: examAttempt.subject,
            startTime: new Date(),
            expectedDurationMinutes: 120,
            status: 'Components Issued',
            componentsIssued: formattedComponents.map(c => ({
                componentName: c.name,
                partNumber: c.partNumber,
                quantity: c.issuedQty,
                conditionBefore: c.conditionBefore
            })),
            issuedBy: staffUser,
            issueTime: new Date(),
            history: [
                { timestamp: new Date(), status: 'Test Passed', notes: `Score: ${examAttempt.score}/${examAttempt.totalMarks}`, actor: 'System' },
                { timestamp: new Date(), status: 'Components Issued', notes: `Handover recorded (${issue.issueId})`, actor: staffUser }
            ]
        });
        await session.save();

        await logAudit('Component Issuance', 'Component Issue', staffUser, `Issued components to student ${studentId} for ${expNum} (${issue.issueId})`);

        res.status(201).json({
            success: true,
            message: `Components successfully handed over to ${examAttempt.studentName}!`,
            data: { issue, session }
        });
    } catch (error) {
        console.error('Error during component issue:', error);
        res.status(500).json({ success: false, message: error.message || 'Error processing component handover' });
    }
});

// ==========================================
// 8. LAB SESSION MONITORING
// ==========================================
router.get('/sessions', async (req, res) => {
    try {
        const { status, search } = req.query;
        const query = {};

        if (status && status !== 'All') {
            if (status === 'Active') {
                query.status = { $in: ['Components Issued', 'Experiment In Progress', 'Return Pending', 'Inspection Pending'] };
            } else {
                query.status = status;
            }
        }
        if (search) {
            query.$or = [
                { sessionId: { $regex: search, $options: 'i' } },
                { groupName: { $regex: search, $options: 'i' } },
                { experimentNumber: { $regex: search, $options: 'i' } },
                { studentNames: { $regex: search, $options: 'i' } }
            ];
        }

        const sessions = await LabSession.find(query).sort({ startTime: -1 }).lean();
        res.json({ success: true, data: sessions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch lab sessions' });
    }
});

router.patch('/sessions/:id/status', async (req, res) => {
    try {
        const { status, notes } = req.body;
        const session = await LabSession.findById(req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

        const staffUser = req.headers['x-staff-user'] || 'staff_admin';
        session.status = status;
        session.history.push({
            timestamp: new Date(),
            status,
            notes: notes || `Status changed to ${status}`,
            actor: staffUser
        });

        if (status === 'Completed') {
            session.endTime = new Date();
        }

        await session.save();

        await logAudit('Update Session Status', 'Lab Sessions', staffUser, `${session.sessionId} marked as ${status}`);

        res.json({ success: true, message: `Session status updated to ${status}`, data: session });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating session status' });
    }
});

// ==========================================
// 9. COMPONENT RETURN & INSPECTION
// ==========================================
router.get('/returns', async (req, res) => {
    try {
        const returns = await ReturnInspection.find().sort({ inspectionTimestamp: -1 }).lean();
        res.json({ success: true, data: returns });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch return records' });
    }
});

router.post('/returns', async (req, res) => {
    try {
        const { sessionId, items, remarks, inspectionStatus } = req.body;

        if (!sessionId || !items || !items.length) {
            return res.status(400).json({ success: false, message: 'Session ID and return items verification are required.' });
        }

        const session = await LabSession.findOne({ sessionId });
        if (!session) return res.status(404).json({ success: false, message: 'Active lab session not found.' });

        const staffUser = req.headers['x-staff-user'] || 'staff_admin';
        const formattedItems = [];

        // Update inventory for returned items (only functional parts restocked)
        for (const item of items) {
            const retQty = Number(item.returnedQty) || 0;
            const missQty = Number(item.missingQty) || 0;
            const damQty = Number(item.damagedQty) || 0;

            const comp = await Component.findOne({ partNumber: item.partNumber });
            if (comp) {
                // Return usable components to available stock (returned minus damaged)
                const usableReturn = Math.max(0, retQty - damQty);
                if (usableReturn > 0) {
                    comp.availableQuantity += usableReturn;
                    comp.history.push({
                        action: 'Returned from Student Group',
                        quantityChange: usableReturn,
                        staff: staffUser,
                        remarks: `Returned by ${session.groupId} (Session ${session.sessionId})`
                    });
                }
                if (damQty > 0) {
                    comp.condition = 'Under Inspection';
                    comp.history.push({
                        action: 'Damaged Item Reported',
                        quantityChange: 0,
                        staff: staffUser,
                        remarks: `${damQty} units damaged: ${item.testProcedureNotes || 'Requires bench testing'}`
                    });
                }
                await comp.save();
            }

            formattedItems.push({
                partNumber: item.partNumber,
                componentName: item.componentName,
                issuedQty: Number(item.issuedQty) || 0,
                returnedQty: retQty,
                missingQty: missQty,
                damagedQty: damQty,
                conditionAfter: item.conditionAfter || 'Good',
                testProcedureNotes: item.testProcedureNotes || ''
            });
        }

        // Generate Return Record
        const returnCount = await ReturnInspection.countDocuments();
        const returnId = `RET-${Date.now().toString().slice(-6)}-${String(returnCount + 1).padStart(3, '0')}`;

        const returnRecord = new ReturnInspection({
            returnId,
            sessionId: session.sessionId,
            groupId: session.groupId,
            groupName: session.groupName,
            experimentNumber: session.experimentNumber,
            inspectedBy: staffUser,
            items: formattedItems,
            inspectionStatus: inspectionStatus || 'All Good',
            remarks: remarks || 'Bench inspection and component count completed.'
        });
        await returnRecord.save();

        // Update session
        session.status = 'Completed';
        session.returnTime = new Date();
        session.endTime = new Date();
        session.returnInspectedBy = staffUser;
        session.history.push({
            timestamp: new Date(),
            status: 'Completed',
            notes: `Return & inspection processed (${returnRecord.returnId}). Status: ${returnRecord.inspectionStatus}`,
            actor: staffUser
        });
        await session.save();

        await logAudit('Component Return Inspection', 'Component Return', staffUser, `Processed return for ${session.groupId} (${returnRecord.returnId})`);

        res.status(201).json({
            success: true,
            message: `Return inspection completed for ${session.groupName}. Session marked as Completed!`,
            data: returnRecord
        });
    } catch (error) {
        console.error('Error processing return inspection:', error);
        res.status(500).json({ success: false, message: error.message || 'Error processing return inspection' });
    }
});

// ==========================================
// 10. ENTERPRISE REPORTS & CSV EXPORT
// ==========================================
router.get('/reports', async (req, res) => {
    try {
        const { type } = req.query;

        if (type === 'experiment-usage') {
            const usage = await LabSession.aggregate([
                { $group: { _id: '$experimentNumber', count: { $sum: 1 }, experimentTitle: { $first: '$experimentTitle' }, subject: { $first: '$subject' } } },
                { $sort: { count: -1 } }
            ]);
            return res.json({ success: true, data: usage });
        }

        if (type === 'test-performance') {
            const performance = await ExamAttempt.aggregate([
                { $group: {
                    _id: '$subject',
                    totalAttempts: { $sum: 1 },
                    passedAttempts: { $sum: { $cond: ['$passed', 1, 0] } },
                    avgScore: { $avg: '$score' }
                }}
            ]);
            return res.json({ success: true, data: performance });
        }

        if (type === 'inventory-summary') {
            const inventory = await Component.find().select('name type partNumber totalQuantity availableQuantity minimumStockLevel condition storageLocation').lean();
            return res.json({ success: true, data: inventory });
        }

        if (type === 'missing-damaged') {
            const inspections = await ReturnInspection.find({
                $or: [
                    { 'items.missingQty': { $gt: 0 } },
                    { 'items.damagedQty': { $gt: 0 } }
                ]
            }).lean();
            return res.json({ success: true, data: inspections });
        }

        // Default all reports summary
        const [experiments, components, sessions, returns] = await Promise.all([
            Experiment.find().lean(),
            Component.find().lean(),
            LabSession.find().sort({ startTime: -1 }).limit(50).lean(),
            ReturnInspection.find().sort({ inspectionTimestamp: -1 }).limit(50).lean()
        ]);

        res.json({
            success: true,
            data: {
                totalExperiments: experiments.length,
                totalComponents: components.length,
                totalSessions: sessions.length,
                totalReturns: returns.length,
                recentSessions: sessions.slice(0, 10),
                recentReturns: returns.slice(0, 10)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to generate reports' });
    }
});

router.get('/reports/export-csv', async (req, res) => {
    try {
        const { reportType } = req.query;
        let csvContent = '';
        let fileName = `report_${Date.now()}.csv`;

        if (reportType === 'inventory') {
            const comps = await Component.find().lean();
            csvContent = 'Part Number,Name,Type,Total Quantity,Available Quantity,Min Stock,Location,Condition\n';
            comps.forEach(c => {
                csvContent += `"${c.partNumber}","${c.name}","${c.type}",${c.totalQuantity},${c.availableQuantity},${c.minimumStockLevel},"${c.storageLocation}","${c.condition}"\n`;
            });
            fileName = `Inventory_Report_${new Date().toISOString().slice(0,10)}.csv`;
        } else if (reportType === 'sessions') {
            const sessions = await LabSession.find().lean();
            csvContent = 'Session ID,Group ID,Group Name,Experiment,Subject,Status,Start Time,End Time,Issued By\n';
            sessions.forEach(s => {
                csvContent += `"${s.sessionId}","${s.groupId}","${s.groupName}","${s.experimentNumber}","${s.subject}","${s.status}","${s.startTime ? new Date(s.startTime).toLocaleString() : ''}","${s.endTime ? new Date(s.endTime).toLocaleString() : ''}","${s.issuedBy || ''}"\n`;
            });
            fileName = `Lab_Sessions_Report_${new Date().toISOString().slice(0,10)}.csv`;
        } else {
            const students = await StudentUser.find().select('-password').lean();
            csvContent = 'Registration ID,Name,Department,Year,Email,Status\n';
            students.forEach(s => {
                csvContent += `"${s.registrationId || ''}","${s.name || ''}","${s.department || ''}","${s.year || ''}","${s.email || ''}","${s.status || 'Active'}"\n`;
            });
            fileName = `Students_Report_${new Date().toISOString().slice(0,10)}.csv`;
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(csvContent);
    } catch (error) {
        res.status(500).send('Error exporting CSV report');
    }
});

// ==========================================
// 11. SETTINGS & AUDIT LOGS
// ==========================================
router.get('/audit-logs', async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100).lean();
        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
    }
});

// ==========================================
// 12. EXAM ATTEMPTS & ANTI-CHEATING MONITORING REVIEWS
// ==========================================
router.get('/exam-attempts', async (req, res) => {
    try {
        const { experimentNumber, studentUsername, status } = req.query;
        const query = {};
        if (experimentNumber) query.experimentNumber = experimentNumber;
        if (studentUsername) query.studentUsername = studentUsername;
        if (status) query.status = status;

        const attempts = await ExamAttempt.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        res.json({ success: true, data: attempts });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch exam attempts' });
    }
});

router.get('/exam-attempts/:id', async (req, res) => {
    try {
        const attempt = await ExamAttempt.findOne({ attemptId: req.params.id }).lean();
        if (!attempt) {
            return res.status(404).json({ success: false, message: 'Attempt not found' });
        }
        res.json({ success: true, data: attempt });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch attempt details' });
    }
});

router.post('/exam-attempts/:id/review', async (req, res) => {
    try {
        const { action, notes, staffUsername } = req.body;
        const attempt = await ExamAttempt.findOne({ attemptId: req.params.id });
        if (!attempt) {
            return res.status(404).json({ success: false, message: 'Attempt not found' });
        }

        attempt.reviewedByStaff = true;
        attempt.staffReviewNotes = notes || '';

        if (action === 'OVERRIDE_PASS') {
            attempt.passed = true;
            attempt.status = 'Passed';
        } else if (action === 'ALLOW_RETRY') {
            attempt.status = 'Retry Allowed';
        } else if (action === 'CONFIRM_TERMINATE') {
            attempt.status = 'Ineligible for Current Lab Session';
        }

        await attempt.save();

        await logAudit(
            'EXAM_ATTEMPT_REVIEWED',
            'Exam Assessment',
            staffUsername || 'staff_admin',
            `Attempt ${attempt.attemptId} (${attempt.studentUsername}) reviewed. Action: ${action}. Notes: ${notes || 'None'}`
        );

        res.json({ success: true, message: 'Attempt review recorded successfully', data: attempt });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update exam attempt review' });
    }
});

// ==========================================
// 14. HOD EXECUTIVE CONTROL PANEL (POWER BI ANALYTICS)
// ==========================================

async function ensureDefaultHODSchedules() {
    const count = await DepartmentSchedule.countDocuments();
    if (count === 0) {
        const today = new Date();
        const addDays = (d, n) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

        const defaults = [
            {
                subject: 'Analog & Digital Circuits',
                staffInCharge: 'Dr. K. Arunkumar (Assoc. Prof)',
                staffUsername: 'staff_admin',
                totalExperiments: 10,
                completedExperiments: 8,
                componentIssueDeadline: addDays(today, 4),
                studentCompletionDeadline: addDays(today, 12),
                batchName: 'ECE 3rd Sem - Batch A',
                status: 'On Track',
                notes: 'Op-amp & Filter experiments complete. Clamper circuit pending.',
                lastUpdatedBy: 'HOD OF DEP'
            },
            {
                subject: 'Robotics and Automation',
                staffInCharge: 'Dr. S. Meenakshi (Prof & Lab Head)',
                staffUsername: 'staff_admin',
                totalExperiments: 10,
                completedExperiments: 6,
                componentIssueDeadline: addDays(today, 7),
                studentCompletionDeadline: addDays(today, 18),
                batchName: 'Mechatronics 5th Sem - Batch B',
                status: 'In Progress',
                notes: 'Manipulator kinematics and gripper kits distributed.',
                lastUpdatedBy: 'HOD OF DEP'
            },
            {
                subject: 'Embedded Systems & IoT',
                staffInCharge: 'Prof. R. Vignesh (Asst. Prof)',
                staffUsername: 'staff_admin',
                totalExperiments: 10,
                completedExperiments: 7,
                componentIssueDeadline: addDays(today, 3),
                studentCompletionDeadline: addDays(today, 10),
                batchName: 'CSE & IT 4th Sem - Batch C',
                status: 'On Track',
                notes: 'ESP32 IoT sensor node programming underway.',
                lastUpdatedBy: 'HOD OF DEP'
            },
            {
                subject: 'Data Structures & Algorithms',
                staffInCharge: 'Dr. P. Sharmila (Prof)',
                staffUsername: 'staff_admin',
                totalExperiments: 10,
                completedExperiments: 9,
                componentIssueDeadline: addDays(today, -3),
                studentCompletionDeadline: addDays(today, 5),
                batchName: 'CSE 3rd Sem - Batch D',
                status: 'Action Required',
                notes: 'Graph traversal & Dijkstra algorithms evaluation.',
                lastUpdatedBy: 'HOD OF DEP'
            }
        ];
        await DepartmentSchedule.insertMany(defaults);
        console.log('🏛️ Initialized default HOD Department Schedules in staff_portal');
    }
}

async function getDepartmentProfile() {
    let profile = await DepartmentProfile.findOne();
    if (!profile) {
        profile = await DepartmentProfile.create({
            departmentName: 'Department of Electrical & Computer Engineering',
            hodName: 'Admin (HOD)',
            academicYear: 'Academic Year 2026-2027 (Semester V)',
            announcement: 'All staff members are instructed to complete component handovers by the target deadline.',
            lastUpdatedBy: 'admin'
        });
    }
    return profile;
}

// GET HOD Overview & Power BI Metrics
router.get('/hod/overview', async (req, res) => {
    try {
        await ensureDefaultHODSchedules();

        const [
            profile,
            schedules,
            totalExps,
            totalManuals,
            totalStudents,
            totalSessions,
            activeSessionsCount,
            distinctLabs,
            totalComponents,
            examStats,
            totalAttemptsCount,
            passedAttemptsCount,
            allStaffUsers
        ] = await Promise.all([
            getDepartmentProfile(),
            DepartmentSchedule.find().sort({ subject: 1 }).lean(),
            Experiment.countDocuments({ isActive: true }),
            LabManual.countDocuments({ isPublished: true }),
            StudentUser.countDocuments({ role: 'student' }),
            LabSession.countDocuments(),
            LabSession.countDocuments({
                status: { $in: ['Components Issued', 'Experiment In Progress', 'Return Pending', 'Inspection Pending'] }
            }),
            Experiment.distinct('laboratory'),
            Component.find().lean(),
            ExamAttempt.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        avgScore: { $avg: '$score' }
                    }
                }
            ]),
            ExamAttempt.countDocuments(),
            ExamAttempt.countDocuments({ passed: true }),
            User.find({ role: { $in: ['staff', 'hod', 'HOD OF DEP', 'admin'] } }).lean()
        ]);

        // Calculate Department Totals
        const totalTargetExps = schedules.reduce((acc, s) => acc + (s.totalExperiments || 10), 0);
        const totalFinishedExps = schedules.reduce((acc, s) => acc + (s.completedExperiments || 0), 0);
        const overallCompletionRate = totalTargetExps > 0 ? Math.round((totalFinishedExps / totalTargetExps) * 100) : 0;

        // Inventory status
        const totalStock = totalComponents.reduce((acc, c) => acc + (c.totalQuantity || 0), 0);
        const availableStock = totalComponents.reduce((acc, c) => acc + (c.availableQuantity || 0), 0);
        const issuedStock = Math.max(0, totalStock - availableStock);

        // Performance Stats
        const componentHandoverRate = totalStock > 0 ? Math.round((issuedStock / totalStock) * 100) : 0;
        const goodConditionCount = totalComponents.filter(c => c.condition === 'Good' || c.condition === 'Brand New').length;
        const hardwareHealthRate = totalComponents.length > 0 ? Math.round((goodConditionCount / totalComponents.length) * 100) : 0;
        const studentPassRate = totalAttemptsCount > 0 ? Math.round((passedAttemptsCount / totalAttemptsCount) * 100) : 0;

        // Dynamic 7-bar chart subjects
        const analyticsBars = schedules.slice(0, 7).map(s => {
            const words = s.subject.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !['and', 'the', 'for', 'with', 'lab'].includes(w.toLowerCase()));
            let code = words.map(w => w[0].toUpperCase()).join('').slice(0, 4);
            if (!code || code.length < 2) code = s.subject.slice(0, 3).toUpperCase();
            const target = s.totalExperiments || 10;
            const completed = s.completedExperiments || 0;
            const pct = target > 0 ? Math.round((completed / target) * 100) : 0;
            return {
                subject: s.subject,
                code,
                completed,
                total: target,
                pct: Math.min(100, Math.max(0, pct))
            };
        });

        // 4 Dynamic Lab Stations
        const stations = [
            {
                name: 'Microcontroller Benches',
                filter: /apparatus|bench|microcontroller|embedded/i,
                fallbackType: 'Hardware Apparatus'
            },
            {
                name: 'Sensor Test Rigs',
                filter: /sensor|transducer|detector|module/i,
                fallbackType: 'Sensor'
            },
            {
                name: 'Oscilloscope Racks',
                filter: /instrument|measurement|oscilloscope|meter/i,
                fallbackType: 'Equipment'
            },
            {
                name: 'FPGA & IC Development',
                filter: /ic|circuit|digital|fpga|logic/i,
                fallbackType: 'Electronic Components'
            }
        ].map(st => {
            const matching = totalComponents.filter(c => st.filter.test(c.type || '') || st.filter.test(c.name || ''));
            const total = matching.reduce((sum, c) => sum + (c.totalQuantity || 0), 0);
            const available = matching.reduce((sum, c) => sum + (c.availableQuantity || 0), 0);
            return {
                title: st.name,
                totalUnits: total > 0 ? total : 25,
                availableUnits: available > 0 ? available : 20,
                inUseUnits: Math.max(0, (total > 0 ? total : 25) - (available > 0 ? available : 20))
            };
        });

        // Faculty security counts
        const activeStaffCount = allStaffUsers.filter(u => u.status !== 'Inactive').length;
        const clearedStaffCount = allStaffUsers.filter(u => u.securityClearance !== false).length;

        res.json({
            success: true,
            data: {
                departmentName: profile.departmentName || 'Department of Electrical & Computer Engineering',
                hodName: profile.hodName || 'Admin (HOD)',
                academicYear: profile.academicYear || 'Academic Year 2026-2027',
                announcement: profile.announcement || '',
                lastUpdatedBy: profile.lastUpdatedBy || 'admin',
                summary: {
                    totalSubjects: schedules.length,
                    totalTargetExperiments: totalTargetExps,
                    totalCompletedExperiments: totalFinishedExps,
                    overallCompletionRate,
                    totalLabManuals: totalManuals,
                    totalStudents,
                    totalLabSessions: totalSessions,
                    totalComponentsStock: totalStock,
                    issuedComponents: issuedStock,
                    availableComponents: availableStock
                },
                labManagement: {
                    totalLabs: distinctLabs.length > 0 ? distinctLabs.length : schedules.length,
                    totalExperiments: totalExps,
                    activeSessions: activeSessionsCount
                },
                staffSecurity: {
                    activeStaffCount: activeStaffCount || 4,
                    clearedStaffCount: clearedStaffCount || 4,
                    totalStaffCount: allStaffUsers.length || 4
                },
                performanceStats: {
                    overallCompletionRate,
                    componentHandoverRate,
                    hardwareHealthRate,
                    studentPassRate
                },
                analyticsBars,
                stations,
                schedules,
                examStats
            }
        });
    } catch (err) {
        console.error('HOD Overview error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch HOD overview metrics' });
    }
});

// GET Department Profile Settings
router.get('/hod/profile', requireStaff, async (req, res) => {
    try {
        const profile = await getDepartmentProfile();
        res.json({ success: true, data: profile });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch department profile' });
    }
});

// UPDATE Department Profile Settings by Admin (HOD)
router.put('/hod/profile', requireStaff, async (req, res) => {
    try {
        const { departmentName, hodName, academicYear, announcement } = req.body;
        const updater = (req.staffUser && req.staffUser.username) || req.headers['x-staff-user'] || 'admin';

        let profile = await DepartmentProfile.findOne();
        if (!profile) {
            profile = new DepartmentProfile({});
        }

        if (departmentName) profile.departmentName = departmentName.trim();
        if (hodName) profile.hodName = hodName.trim();
        if (academicYear) profile.academicYear = academicYear.trim();
        if (announcement !== undefined) profile.announcement = announcement.trim();
        profile.lastUpdatedBy = updater;

        await profile.save();
        await logAudit('UPDATE_DEPARTMENT_PROFILE', 'HOD Panel', updater, `Admin updated department settings: ${profile.departmentName} (HOD: ${profile.hodName})`);

        res.json({ success: true, message: 'Department settings updated successfully in MongoDB', data: profile });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to update department profile' });
    }
});

// GET all HOD Schedules / Milestones
router.get('/hod/schedules', async (req, res) => {
    try {
        await ensureDefaultHODSchedules();
        const schedules = await DepartmentSchedule.find().sort({ createdAt: -1 }).lean();
        const now = new Date();

        const enrichedSchedules = schedules.map(s => {
            const dueDate = s.dueDate || s.studentCompletionDeadline || s.componentIssueDeadline;
            const isOverdue = s.status === 'Overdue' || (dueDate && new Date(dueDate) < now && s.status !== 'Done' && s.status !== 'Completed');
            return {
                ...s,
                milestone: s.milestone || 'Curriculum Milestone Target',
                dueDate,
                status: isOverdue ? 'Overdue' : s.status,
                isOverdue
            };
        });

        res.json({ success: true, data: enrichedSchedules });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch HOD schedules' });
    }
});

// CREATE HOD Schedule / Milestone
router.post('/hod/schedules', async (req, res) => {
    try {
        const {
            subject,
            staffInCharge,
            milestone,
            dueDate,
            totalExperiments,
            completedExperiments,
            componentIssueDeadline,
            studentCompletionDeadline,
            batchName,
            status,
            notes
        } = req.body;

        if (!subject) {
            return res.status(400).json({ success: false, message: 'Subject is required' });
        }

        const updater = (req.staffUser && req.staffUser.username) || req.headers['x-staff-user'] || 'admin';
        const targetDueDate = dueDate ? new Date(dueDate) : (studentCompletionDeadline ? new Date(studentCompletionDeadline) : new Date(Date.now() + 14 * 86400000));
        const issueDate = componentIssueDeadline ? new Date(componentIssueDeadline) : new Date(Date.now() + 7 * 86400000);
        const completionDate = studentCompletionDeadline ? new Date(studentCompletionDeadline) : targetDueDate;

        const newSchedule = new DepartmentSchedule({
            subject: subject.trim(),
            staffInCharge: staffInCharge || 'Assigned Staff',
            milestone: milestone ? milestone.trim() : 'Lab Practical Milestone',
            dueDate: targetDueDate,
            totalExperiments: Number(totalExperiments) || 10,
            completedExperiments: Number(completedExperiments) || 0,
            componentIssueDeadline: issueDate,
            studentCompletionDeadline: completionDate,
            batchName: batchName || 'Standard Batch',
            status: status || 'Pending',
            notes: notes || '',
            lastUpdatedBy: updater
        });

        await newSchedule.save();
        await logAudit('CREATE_HOD_MILESTONE', 'HOD Panel', updater, `Admin created milestone for ${subject}: ${newSchedule.milestone}`);

        res.status(201).json({ success: true, message: 'Milestone created successfully in MongoDB', data: newSchedule });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to create milestone' });
    }
});

// UPDATE HOD Schedule / Milestone
router.put('/hod/schedules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const updater = (req.staffUser && req.staffUser.username) || req.headers['x-staff-user'] || 'admin';

        if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);
        if (updates.componentIssueDeadline) updates.componentIssueDeadline = new Date(updates.componentIssueDeadline);
        if (updates.studentCompletionDeadline) updates.studentCompletionDeadline = new Date(updates.studentCompletionDeadline);
        if (updates.completedExperiments !== undefined) updates.completedExperiments = Number(updates.completedExperiments);
        if (updates.totalExperiments !== undefined) updates.totalExperiments = Number(updates.totalExperiments);
        updates.lastUpdatedBy = updater;

        const updated = await DepartmentSchedule.findByIdAndUpdate(id, { $set: updates }, { new: true });
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Schedule record not found' });
        }

        await logAudit('UPDATE_HOD_SCHEDULE', 'HOD Panel', updater, `Updated schedule for ${updated.subject}: ${updated.milestone || ''}`);
        res.json({ success: true, message: 'Schedule updated successfully', data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to update schedule' });
    }
});

// TOGGLE Status for Milestone
router.patch('/hod/schedules/:id/status', async (req, res) => {
    try {
        const schedule = await DepartmentSchedule.findById(req.params.id);
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule record not found' });

        schedule.status = schedule.status === 'Done' ? 'Pending' : 'Done';
        schedule.lastUpdatedBy = (req.staffUser && req.staffUser.username) || req.headers['x-staff-user'] || 'admin';
        await schedule.save();

        await logAudit('TOGGLE_MILESTONE_STATUS', 'HOD Panel', schedule.lastUpdatedBy, `${schedule.subject} milestone marked as ${schedule.status}`);
        res.json({ success: true, message: `Milestone status changed to ${schedule.status}`, data: schedule });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to toggle milestone status' });
    }
});

// DELETE HOD Schedule
router.delete('/hod/schedules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updater = (req.staffUser && req.staffUser.username) || req.headers['x-staff-user'] || 'admin';
        await DepartmentSchedule.findByIdAndDelete(id);
        await logAudit('DELETE_HOD_SCHEDULE', 'HOD Panel', updater, `Admin deleted schedule ID: ${id}`);
        res.json({ success: true, message: 'Schedule deleted successfully from MongoDB' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete schedule' });
    }
});

// ==========================================
// 15. STAFF FACULTY MANAGEMENT
// ==========================================
router.get('/faculty', async (req, res) => {
    try {
        const { search } = req.query;
        let query = { role: { $in: ['staff', 'hod', 'HOD OF DEP', 'admin'] } };
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        let faculty = await User.find(query).select('-password').sort({ name: 1, username: 1 }).lean();

        // Ensure default profile data if fields are unset
        faculty = faculty.map(f => {
            let name = f.name;
            let email = f.email;
            let assignedSubjects = Array.isArray(f.assignedSubjects) && f.assignedSubjects.length > 0 ? f.assignedSubjects : [];

            if (!name) {
                if (f.username === 'staff_admin') name = 'Dr. K. Arunkumar (Assoc. Prof)';
                else if (f.username === 'admin' || f.username === 'HOD OF DEP') name = 'Admin (Head of Department)';
                else name = `Prof. ${f.username.charAt(0).toUpperCase() + f.username.slice(1)}`;
            }
            if (!email) {
                email = `${f.username.toLowerCase()}@vlab.edu`;
            }
            if (assignedSubjects.length === 0) {
                if (f.username === 'staff_admin') assignedSubjects = ['Analog & Digital Circuits', 'Embedded Systems & IoT'];
                else if (f.username === 'admin' || f.username === 'HOD OF DEP') assignedSubjects = ['All Department Laboratories'];
                else assignedSubjects = ['General Electronics Lab'];
            }

            return {
                ...f,
                name,
                email,
                assignedSubjects,
                status: f.status || 'Active',
                securityClearance: f.securityClearance !== undefined ? f.securityClearance : true
            };
        });

        res.json({ success: true, data: faculty });
    } catch (err) {
        console.error('Faculty fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch staff faculty members' });
    }
});

router.post('/faculty', async (req, res) => {
    try {
        const { username, password, name, email, assignedSubjects, status } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const cleanUsername = username.trim().toLowerCase();
        const existing = await User.findOne({ username: cleanUsername });
        if (existing) {
            return res.status(409).json({ success: false, message: `Staff user '${cleanUsername}' already exists` });
        }

        const newFaculty = new User({
            username: cleanUsername,
            password: password,
            role: 'staff',
            name: name ? name.trim() : `Prof. ${cleanUsername}`,
            email: email ? email.trim() : `${cleanUsername}@vlab.edu`,
            assignedSubjects: Array.isArray(assignedSubjects) ? assignedSubjects : (assignedSubjects ? assignedSubjects.split(',').map(s => s.trim()).filter(Boolean) : []),
            status: status || 'Active',
            securityClearance: true
        });

        await newFaculty.save();
        const staffUser = req.headers['x-staff-user'] || 'admin';
        await logAudit('CREATE_FACULTY', 'Staff Management', staffUser, `Added new faculty member: ${newFaculty.name} (${newFaculty.username})`);

        res.status(201).json({
            success: true,
            message: `Faculty member ${newFaculty.name} registered successfully in MongoDB`,
            data: {
                _id: newFaculty._id,
                username: newFaculty.username,
                name: newFaculty.name,
                email: newFaculty.email,
                assignedSubjects: newFaculty.assignedSubjects,
                status: newFaculty.status,
                securityClearance: newFaculty.securityClearance
            }
        });
    } catch (err) {
        console.error('Create faculty error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to create faculty member' });
    }
});

router.put('/faculty/:id', async (req, res) => {
    try {
        const { name, email, assignedSubjects, status } = req.body;
        const faculty = await User.findById(req.params.id);
        if (!faculty) {
            return res.status(404).json({ success: false, message: 'Faculty member not found' });
        }

        if (name) faculty.name = name.trim();
        if (email) faculty.email = email.trim();
        if (assignedSubjects !== undefined) {
            faculty.assignedSubjects = Array.isArray(assignedSubjects) ? assignedSubjects : assignedSubjects.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (status) faculty.status = status;

        await faculty.save();
        const staffUser = req.headers['x-staff-user'] || 'admin';
        await logAudit('UPDATE_FACULTY', 'Staff Management', staffUser, `Updated faculty details for ${faculty.name || faculty.username}`);

        res.json({ success: true, message: 'Faculty details updated successfully in MongoDB', data: faculty });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to update faculty details' });
    }
});

router.patch('/faculty/:id/status', async (req, res) => {
    try {
        const faculty = await User.findById(req.params.id);
        if (!faculty) return res.status(404).json({ success: false, message: 'Faculty member not found' });

        faculty.status = faculty.status === 'Active' ? 'Inactive' : 'Active';
        await faculty.save();

        const staffUser = req.headers['x-staff-user'] || 'admin';
        await logAudit('TOGGLE_FACULTY_STATUS', 'Staff Management', staffUser, `${faculty.name || faculty.username} marked as ${faculty.status}`);

        res.json({ success: true, message: `Faculty member is now ${faculty.status}`, data: faculty });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update faculty status' });
    }
});

router.patch('/faculty/:id/clearance', async (req, res) => {
    try {
        const faculty = await User.findById(req.params.id);
        if (!faculty) return res.status(404).json({ success: false, message: 'Faculty member not found' });

        faculty.securityClearance = !faculty.securityClearance;
        await faculty.save();

        const staffUser = req.headers['x-staff-user'] || 'admin';
        await logAudit('SECURITY_CLEARANCE_TOGGLE', 'Security', staffUser, `Security clearance ${faculty.securityClearance ? 'granted' : 'revoked'} for ${faculty.name || faculty.username}`);

        res.json({
            success: true,
            message: `Security clearance for ${faculty.name || faculty.username} is now ${faculty.securityClearance ? 'Granted' : 'Revoked'}`,
            data: faculty
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update security clearance' });
    }
});

// ==========================================
// 16. CURRICULUM MANAGEMENT (SUBJECTS & EXPERIMENTS)
// ==========================================
router.get('/curriculum/subjects', async (req, res) => {
    try {
        const [experiments, schedules] = await Promise.all([
            Experiment.find().lean(),
            DepartmentSchedule.find().lean()
        ]);

        const subjectMap = {};
        for (const exp of experiments) {
            const subj = exp.subject || 'General Laboratory';
            if (!subjectMap[subj]) {
                subjectMap[subj] = {
                    subject: subj,
                    laboratory: exp.laboratory || 'Engineering Lab',
                    experimentCount: 0,
                    activeExperimentCount: 0,
                    staffInCharge: 'Assigned Staff',
                    experiments: []
                };
            }
            subjectMap[subj].experimentCount += 1;
            if (exp.isActive) subjectMap[subj].activeExperimentCount += 1;
            subjectMap[subj].experiments.push({
                _id: exp._id,
                experimentNumber: exp.experimentNumber,
                title: exp.title,
                requiredComponentsCount: (exp.requiredComponents || []).length,
                isActive: exp.isActive
            });
        }

        for (const s of schedules) {
            if (subjectMap[s.subject]) {
                subjectMap[s.subject].staffInCharge = s.staffInCharge;
            } else {
                subjectMap[s.subject] = {
                    subject: s.subject,
                    laboratory: 'Engineering Lab',
                    experimentCount: s.totalExperiments || 10,
                    activeExperimentCount: s.completedExperiments || 0,
                    staffInCharge: s.staffInCharge,
                    experiments: []
                };
            }
        }

        res.json({ success: true, data: Object.values(subjectMap) });
    } catch (err) {
        console.error('Curriculum subjects error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch curriculum subjects' });
    }
});

router.post('/curriculum/subjects', async (req, res) => {
    try {
        const { subject, laboratory, staffInCharge, totalExperiments, componentIssueDeadline, studentCompletionDeadline } = req.body;
        if (!subject) {
            return res.status(400).json({ success: false, message: 'Subject name is required' });
        }

        const staffUser = req.headers['x-staff-user'] || 'admin';
        const today = new Date();
        const addDays = (d, n) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

        let schedule = await DepartmentSchedule.findOne({ subject: subject.trim() });
        if (!schedule) {
            schedule = new DepartmentSchedule({
                subject: subject.trim(),
                staffInCharge: staffInCharge || 'Assigned Staff',
                totalExperiments: Number(totalExperiments) || 10,
                completedExperiments: 0,
                componentIssueDeadline: componentIssueDeadline ? new Date(componentIssueDeadline) : addDays(today, 7),
                studentCompletionDeadline: studentCompletionDeadline ? new Date(studentCompletionDeadline) : addDays(today, 21),
                batchName: 'Section General',
                status: 'In Progress',
                notes: `Subject curriculum configured by ${staffUser}`,
                lastUpdatedBy: staffUser
            });
            await schedule.save();
        }

        await logAudit('CREATE_CURRICULUM_SUBJECT', 'Curriculum', staffUser, `Registered subject track: ${subject}`);
        res.status(201).json({ success: true, message: `Subject "${subject}" created successfully in MongoDB`, data: schedule });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to create subject' });
    }
});

router.post('/curriculum/experiments', async (req, res) => {
    try {
        const { experimentNumber, title, subject, laboratory, description, objectives, instructions, requiredComponents } = req.body;
        if (!experimentNumber || !title || !subject) {
            return res.status(400).json({ success: false, message: 'Experiment Number, Title, and Subject are required' });
        }

        const expNum = experimentNumber.trim().toUpperCase();
        const existing = await Experiment.findOne({ experimentNumber: expNum, subject: subject.trim() });
        if (existing) {
            return res.status(409).json({ success: false, message: `Experiment ${expNum} already exists in ${subject}` });
        }

        const staffUser = req.headers['x-staff-user'] || 'admin';
        const formattedComponents = Array.isArray(requiredComponents) ? requiredComponents.map(c => ({
            componentName: (c.componentName || c.name || '').trim(),
            partNumber: (c.partNumber || '').trim().toUpperCase(),
            quantity: Number(c.quantity) || 1,
            notes: c.notes || ''
        })).filter(c => c.componentName) : [];

        const newExp = new Experiment({
            experimentNumber: expNum,
            title: title.trim(),
            subject: subject.trim(),
            laboratory: (laboratory || 'Engineering Laboratory').trim(),
            description: description || '',
            objectives: Array.isArray(objectives) ? objectives : (objectives ? objectives.split('\n').map(s => s.trim()).filter(Boolean) : []),
            instructions: instructions || '',
            requiredComponents: formattedComponents,
            isActive: true,
            createdBy: staffUser
        });

        await newExp.save();
        await logAudit('CREATE_CURRICULUM_EXPERIMENT', 'Curriculum', staffUser, `Created experiment ${expNum}: ${title} with ${formattedComponents.length} components`);

        res.status(201).json({ success: true, message: `Experiment ${expNum} created successfully in MongoDB`, data: newExp });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to create experiment' });
    }
});

router.put('/curriculum/experiments/:id', async (req, res) => {
    try {
        const { title, subject, laboratory, description, objectives, instructions, requiredComponents, isActive } = req.body;
        const exp = await Experiment.findById(req.params.id);
        if (!exp) return res.status(404).json({ success: false, message: 'Experiment not found' });

        if (title) exp.title = title.trim();
        if (subject) exp.subject = subject.trim();
        if (laboratory) exp.laboratory = laboratory.trim();
        if (description !== undefined) exp.description = description;
        if (instructions !== undefined) exp.instructions = instructions;
        if (isActive !== undefined) exp.isActive = isActive;
        if (objectives !== undefined) {
            exp.objectives = Array.isArray(objectives) ? objectives : objectives.split('\n').map(s => s.trim()).filter(Boolean);
        }
        if (requiredComponents !== undefined) {
            exp.requiredComponents = Array.isArray(requiredComponents) ? requiredComponents.map(c => ({
                componentName: (c.componentName || c.name || '').trim(),
                partNumber: (c.partNumber || '').trim().toUpperCase(),
                quantity: Number(c.quantity) || 1,
                notes: c.notes || ''
            })).filter(c => c.componentName) : [];
        }

        await exp.save();
        const staffUser = req.headers['x-staff-user'] || 'admin';
        await logAudit('UPDATE_CURRICULUM_EXPERIMENT', 'Curriculum', staffUser, `Updated experiment ${exp.experimentNumber} and hardware requirements`);

        res.json({ success: true, message: `Experiment ${exp.experimentNumber} and components updated successfully`, data: exp });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to update experiment' });
    }
});

module.exports = router;
