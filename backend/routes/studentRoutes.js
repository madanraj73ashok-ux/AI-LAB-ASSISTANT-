const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Models
const User = require('../models/User');
const Experiment = require('../models/Experiment');
const QuestionSet = require('../models/QuestionSet');
const ExamAttempt = require('../models/ExamAttempt');
const Component = require('../models/Component');
const ComponentIssue = require('../models/ComponentIssue');
const LabSession = require('../models/LabSession');
const ReturnInspection = require('../models/ReturnInspection');
const LabManual = require('../models/LabManual');

// ==========================================
// AUTHENTICATION MIDDLEWARE FOR STUDENTS
// ==========================================
// Strictly validates that the requesting user exists and is a student
async function requireStudent(req, res, next) {
    try {
        const username = req.headers['x-student-username'] || req.headers['x-student-user'] || req.query.studentUsername || (req.body && req.body.studentUsername);
        if (!username) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please log in as a student.'
            });
        }

        const user = await User.findOne({ username: username.trim(), role: 'student' });
        if (!user) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Valid student credentials are required.'
            });
        }

        req.student = user;
        next();
    } catch (err) {
        console.error('Student auth error:', err);
        res.status(500).json({ success: false, message: 'Internal authentication error' });
    }
}

// Apply authentication to all student endpoints
router.use(requireStudent);

// ==========================================
// 1. STUDENT PROFILE
// ==========================================
router.get('/profile', async (req, res) => {
    try {
        const student = req.student;

        // Aggregate statistics from real MongoDB records
        const [attempts, passedAttempts, sessions, issuedRecords] = await Promise.all([
            ExamAttempt.find({ studentUsername: student.username }).lean(),
            ExamAttempt.find({ studentUsername: student.username, passed: true }).lean(),
            LabSession.find({
                $or: [
                    { studentUsername: student.username },
                    { registrationId: student.registrationId || student.username }
                ]
            }).lean(),
            ComponentIssue.find({
                $or: [
                    { studentUsername: student.username },
                    { registrationId: student.registrationId || student.username }
                ]
            }).lean()
        ]);

        const uniqueExperimentsAttempted = new Set(attempts.map(a => a.experimentNumber)).size;
        const uniqueExperimentsPassed = new Set(passedAttempts.map(a => a.experimentNumber)).size;
        const failedAttemptsCount = attempts.filter(a => a.status === 'Failed' || a.status === 'Terminated').length;
        const inProgressCount = attempts.filter(a => a.status === 'In Progress').length;

        // Components issued count
        let totalComponentsIssued = 0;
        issuedRecords.forEach(rec => {
            if (rec.components) {
                rec.components.forEach(c => totalComponentsIssued += (c.issuedQty || 0));
            }
        });

        res.json({
            success: true,
            data: {
                username: student.username,
                fullName: student.fullName || student.username,
                registrationId: student.registrationId || `STU-${student.username.toUpperCase()}`,
                role: student.role,
                enrolledDepartment: student.enrolledDepartment || 'Electronics & Computer Engineering',
                memberSince: student.createdAt,
                stats: {
                    experimentsAttempted: uniqueExperimentsAttempted,
                    experimentsPassed: uniqueExperimentsPassed,
                    experimentsFailed: failedAttemptsCount,
                    experimentsInProgress: inProgressCount,
                    unlockedPracticals: uniqueExperimentsPassed,
                    componentsIssued: totalComponentsIssued
                }
            }
        });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to load profile details' });
    }
});

// ==========================================
// 2. DASHBOARD OVERVIEW METRICS (MongoDB Driven)
// ==========================================
router.get('/dashboard-overview', async (req, res) => {
    try {
        const student = req.student;

        // 1. Total Experiments Available
        const totalExperiments = await Experiment.countDocuments({ isActive: true });

        // 2. Student Attempts and Passed
        const [studentAttempts, passedAttempts] = await Promise.all([
            ExamAttempt.find({ studentUsername: student.username }).lean(),
            ExamAttempt.find({ studentUsername: student.username, passed: true }).lean()
        ]);

        const attemptedExpSet = new Set(studentAttempts.map(a => a.experimentNumber));
        const passedExpSet = new Set(passedAttempts.map(a => a.experimentNumber));

        const experimentsAttempted = attemptedExpSet.size;
        const experimentsPassed = passedExpSet.size;
        const experimentsRemaining = Math.max(0, totalExperiments - experimentsPassed);

        // 3. Individual Practical Access Status
        const practicalStatus = experimentsPassed > 0
            ? `Practical Unlocked (${experimentsPassed} Passed)`
            : 'Pre-Lab Assessment Required';

        // 4. Current Lab Session Status
        let currentSessionStatus = 'No Active Session';
        const activeSession = await LabSession.findOne({
            $or: [
                { studentUsername: student.username },
                { studentNames: student.fullName || student.username }
            ]
        }).sort({ createdAt: -1 }).lean();

        if (activeSession) {
            currentSessionStatus = activeSession.status;
        }

        // 5. Recent Activity List
        const recentAttempts = await ExamAttempt.find({ studentUsername: student.username })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean();

        const recentActivity = [];
        for (const a of recentAttempts) {
            recentActivity.push({
                type: 'exam',
                title: `${a.experimentNumber} Assessment`,
                subject: a.subject,
                score: `${a.score}/${a.totalMarks}`,
                passed: a.passed,
                status: a.status,
                date: a.submissionTime || a.startTime
            });
        }

        res.json({
            success: true,
            data: {
                totalExperiments,
                experimentsAttempted,
                experimentsPassed,
                experimentsRemaining,
                practicalStatus,
                currentLabSessionStatus: currentSessionStatus,
                recentActivity
            }
        });
    } catch (err) {
        console.error('Dashboard overview error:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve dashboard metrics' });
    }
});

// ==========================================
// 3. SUBJECTS LIST
// ==========================================
router.get('/subjects', async (req, res) => {
    try {
        const student = req.student;

        // Fetch all active experiments
        const experiments = await Experiment.find({ isActive: true }).lean();

        // Fetch student's passed attempts
        const passedAttempts = await ExamAttempt.find({
            studentUsername: student.username,
            passed: true
        }).lean();
        const passedExpNumbers = new Set(passedAttempts.map(a => a.experimentNumber));

        // Group by subject
        const subjectMap = {};
        experiments.forEach(exp => {
            const subjName = exp.subject || 'General Engineering';
            if (!subjectMap[subjName]) {
                // Determine image and code based on subject name
                let imageUrl = '/images/aec_lab_cover.jpg';
                let code = 'AEC';
                let dept = 'Dept. of Electronics & Instrumentation';
                let rating = '4.9 (48 Reviews)';
                let category = 'For my project-related';

                if (subjName.includes('CS') || subjName.toLowerCase().includes('control')) {
                    imageUrl = '/images/cs_lab_cover.jpg';
                    code = 'CS';
                    dept = 'Dept. of Electrical & Control Systems';
                    rating = '5.0 (36 Reviews)';
                } else if (subjName.includes('ROBOTICS') || subjName.toLowerCase().includes('robot')) {
                    imageUrl = '/images/robotics_lab_cover.jpg';
                    code = 'ROBOTICS LAB';
                    dept = 'Dept. of Robotics and Automation';
                    rating = '5.0 (64 Reviews)';
                }

                subjectMap[subjName] = {
                    subjectName: subjName,
                    subjectCode: code,
                    laboratory: exp.laboratory || 'Engineering Lab',
                    imageUrl: imageUrl,
                    dept: dept,
                    rating: rating,
                    category: category,
                    availableExperiments: 0,
                    passedExperiments: 0,
                    remainingExperiments: 0,
                    experiments: []
                };
            }
            subjectMap[subjName].availableExperiments += 1;
            if (passedExpNumbers.has(exp.experimentNumber)) {
                subjectMap[subjName].passedExperiments += 1;
            }
            subjectMap[subjName].experiments.push(exp.experimentNumber);
        });

        // Calculate remaining
        const subjectsList = Object.values(subjectMap).map(s => {
            s.remainingExperiments = Math.max(0, s.availableExperiments - s.passedExperiments);
            return s;
        });

        res.json({
            success: true,
            data: subjectsList
        });
    } catch (err) {
        console.error('Subjects fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to load subjects' });
    }
});

// ==========================================
// 4. EXPERIMENTS FOR SUBJECT WITH REAL STATUS
// ==========================================
router.get('/experiments', async (req, res) => {
    try {
        const student = req.student;
        const { subject } = req.query;

        const query = { isActive: true };
        if (subject) {
            query.subject = subject;
        }

        const experiments = await Experiment.find(query).sort({ experimentNumber: 1 }).lean();

        // Get student's attempts and active sessions across these experiments
        const [studentAttempts, studentSessions, questionSets] = await Promise.all([
            ExamAttempt.find({ studentUsername: student.username }).sort({ createdAt: -1 }).lean(),
            LabSession.find({
                $or: [
                    { studentUsername: student.username },
                    { studentNames: student.fullName || student.username }
                ]
            }).lean(),
            QuestionSet.find({ isPublished: true }).lean()
        ]);

        const qSetMap = {};
        questionSets.forEach(q => {
            qSetMap[q.experimentNumber] = q;
        });

        // Map experiments with real dynamic status
        const enrichedExperiments = experiments.map(exp => {
            const expAttempts = studentAttempts.filter(a => a.experimentNumber === exp.experimentNumber);
            const passedAttempt = expAttempts.find(a => a.passed === true);
            const inProgressAttempt = expAttempts.find(a => a.status === 'In Progress');
            const qSet = qSetMap[exp.experimentNumber];

            let studentStatus = 'Not Started';
            let canAttempt = true;
            let statusDetails = '';

            const activeSession = studentSessions.find(s => s.experimentNumber === exp.experimentNumber);

            if (passedAttempt) {
                if (activeSession) {
                    if (activeSession.status === 'Completed') {
                        studentStatus = 'Completed';
                        statusDetails = 'Practical session completed';
                    } else if (activeSession.status === 'Awaiting Component Issue') {
                        studentStatus = 'Ready for Components';
                        statusDetails = 'Assessment passed! Components pending staff issue.';
                    } else if (activeSession.status === 'Components Issued' || activeSession.status === 'Experiment In Progress') {
                        studentStatus = 'In Lab Session';
                        statusDetails = 'Components issued. Practical session ongoing.';
                    } else {
                        studentStatus = 'Ready for Components';
                        statusDetails = 'Assessment passed! Hardware issuance unlocked.';
                    }
                } else {
                    studentStatus = 'Ready for Components';
                    statusDetails = 'Assessment passed! Hardware issuance unlocked.';
                }
                canAttempt = false; // Already passed
            } else if (inProgressAttempt) {
                studentStatus = 'Test In Progress';
                statusDetails = 'An active exam session is underway.';
            } else if (expAttempts.length > 0) {
                const latestAttempt = expAttempts[0];
                const maxRetakes = (qSet && qSet.maxRetakes) || 2;
                if (expAttempts.length < maxRetakes) {
                    studentStatus = 'Failed (Retake Available)';
                    statusDetails = `Attempt ${expAttempts.length}/${maxRetakes} failed (${latestAttempt.score}/${latestAttempt.totalMarks}). You can retake the assessment.`;
                    canAttempt = true;
                } else {
                    studentStatus = 'Failed';
                    statusDetails = `Maximum retakes (${maxRetakes}) reached. Please contact your lab instructor.`;
                    canAttempt = false;
                }
            } else {
                studentStatus = qSet ? 'Test Available' : 'Not Started';
                statusDetails = qSet ? 'Ready for pre-lab assessment' : 'Questions pending publication';
                canAttempt = !!qSet;
            }

            return {
                _id: exp._id,
                experimentNumber: exp.experimentNumber,
                title: exp.title,
                subject: exp.subject,
                laboratory: exp.laboratory,
                description: exp.description,
                objectives: exp.objectives || [],
                requiredComponentsSummary: (exp.requiredComponents || []).map(c => `${c.componentName} (${c.quantity})`).join(', ') || 'No components specified',
                componentsCount: (exp.requiredComponents || []).length,
                testDurationMinutes: qSet ? qSet.testDurationMinutes : 5,
                passMark: qSet ? qSet.passMark : 3,
                totalMarks: qSet ? qSet.questions.reduce((sum, q) => sum + (q.marks || 1), 0) : 4,
                studentStatus,
                statusDetails,
                canAttempt,
                attemptsCount: expAttempts.length,
                bestScore: expAttempts.length > 0 ? Math.max(...expAttempts.map(a => a.score || 0)) : null
            };
        });

        res.json({
            success: true,
            data: enrichedExperiments
        });
    } catch (err) {
        console.error('Experiments fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to load experiments' });
    }
});

// ==========================================
// 5. EXPERIMENT INTRODUCTION DETAILS
// ==========================================
router.get('/experiments/:expNum', async (req, res) => {
    try {
        const student = req.student;
        const { expNum } = req.params;

        const experiment = await Experiment.findOne({ experimentNumber: expNum, isActive: true }).lean();
        if (!experiment) {
            return res.status(404).json({ success: false, message: 'Experiment not found or inactive' });
        }

        // Get question set config (WITHOUT exposing questions or answers)
        const qSet = await QuestionSet.findOne({ experimentNumber: expNum, isPublished: true }).lean();

        // Get lab manual if available (specific to experiment or subject-wide)
        let labManual = await LabManual.findOne({ experimentNumber: expNum, isPublished: true }).lean();
        if (!labManual) {
            labManual = await LabManual.findOne({ subject: experiment.subject, isPublished: true }).lean();
        }

        // Get student's previous attempts for this experiment
        const previousAttempts = await ExamAttempt.find({
            studentUsername: student.username,
            experimentNumber: expNum
        }).sort({ createdAt: -1 }).lean();

        const passed = previousAttempts.some(a => a.passed === true);
        const inProgress = previousAttempts.find(a => a.status === 'In Progress');

        const maxRetakes = (qSet && qSet.maxRetakes) || 5;
        const canStartTest = !!qSet;

        // Total marks calculation
        const totalMarks = qSet ? qSet.questions.reduce((sum, q) => sum + (q.marks || 1), 0) : 4;
        const totalQuestions = qSet ? qSet.questions.length : 0;

        res.json({
            success: true,
            data: {
                experimentNumber: experiment.experimentNumber,
                title: experiment.title,
                subject: experiment.subject,
                laboratory: experiment.laboratory,
                description: experiment.description,
                objectives: experiment.objectives || [],
                instructions: experiment.instructions || '',
                requiredComponents: experiment.requiredComponents || [],
                examConfig: {
                    hasExam: !!qSet,
                    testDurationMinutes: qSet ? qSet.testDurationMinutes : 5,
                    totalQuestions,
                    totalMarks,
                    passMark: qSet ? qSet.passMark : 3,
                    maxRetakes,
                    penaltyPerWarning: qSet ? qSet.penaltyPerWarning : 0,
                    maxViolationsBeforeSubmit: qSet ? qSet.maxViolationsBeforeSubmit : 2
                },
                manual: labManual ? {
                    title: labManual.title,
                    fileName: labManual.originalFileName || labManual.fileName,
                    fileUrl: `/${labManual.filePath}`,
                    fileSize: labManual.fileSize
                } : null,
                eligibility: {
                    canStartTest,
                    alreadyPassed: passed,
                    inProgressAttemptId: inProgress ? inProgress.attemptId : null,
                    attemptsCount: previousAttempts.length,
                    maxRetakes,
                    retakesRemaining: Math.max(0, maxRetakes - previousAttempts.length)
                },
                examRules: [
                    'The assessment is timed. The timer starts immediately upon confirmation.',
                    'Do not switch browser tabs or leave the exam window. Browser blur and visibility events are recorded.',
                    'First window/tab violation triggers an integrity warning; repeated violations result in automatic submission.',
                    'Copy, paste, and right-click actions are restricted during the assessment.',
                    'Optional camera monitoring verifies that the examinee is present without third-party assistance.',
                    'Server calculates all final scores against the configured pass threshold.',
                    'Passing unlocks the practical session and hardware component issuance.'
                ]
            }
        });
    } catch (err) {
        console.error('Experiment intro fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to load experiment introduction' });
    }
});

// ==========================================
// 6. START EXAM (CONFIRMATION & TIMED ATTEMPT CREATION)
// ==========================================
// Securely delivers questions WITHOUT exposing correct answers
router.post('/exams/start', async (req, res) => {
    try {
        const student = req.student;
        const { experimentNumber, cameraEnabled } = req.body;

        if (!experimentNumber) {
            return res.status(400).json({ success: false, message: 'Experiment number is required' });
        }

        const experiment = await Experiment.findOne({ experimentNumber, isActive: true }).lean();
        if (!experiment) {
            return res.status(404).json({ success: false, message: 'Experiment not found or unavailable' });
        }

        const qSet = await QuestionSet.findOne({ experimentNumber, isPublished: true }).lean();
        if (!qSet || !qSet.questions || qSet.questions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No published test is currently available for this experiment.'
            });
        }

        // Check if student already passed this experiment - allow retest/retake
        const existingPassed = await ExamAttempt.findOne({
            studentUsername: student.username,
            experimentNumber,
            passed: true
        });
        if (existingPassed) {
            // Clean slate for retake/practice run so student can test again
            await ExamAttempt.deleteMany({
                studentUsername: student.username,
                experimentNumber
            });
        }

        // Calculate totals
        const totalMarks = qSet.questions.reduce((sum, q) => sum + (q.marks || 1), 0);
        const passMark = qSet.passMark || 3;
        const durationMinutes = qSet.testDurationMinutes || 5;

        // Generate unique attempt ID
        const attemptId = `ATT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Create new ExamAttempt
        const newAttempt = new ExamAttempt({
            attemptId,
            studentUsername: student.username,
            registrationId: student.registrationId || `STU-${student.username.toUpperCase()}`,
            experimentNumber,
            subject: experiment.subject,
            attemptNumber: 1,
            questionSetId: qSet._id,
            totalQuestions: qSet.questions.length,
            totalMarks,
            passMark,
            status: 'In Progress',
            startTime: new Date(),
            cameraEnabled: !!cameraEnabled
        });

        await newAttempt.save();

        // Deliver sanitized questions: Strip out correctOptionIndex!
        const sanitizedQuestions = qSet.questions.map((q, idx) => ({
            questionIndex: idx,
            questionText: q.questionText,
            options: q.options,
            marks: q.marks || 1
        }));

        res.status(201).json({
            success: true,
            message: 'Exam session initialized. Assessment timer is active.',
            data: {
                attemptId: newAttempt.attemptId,
                experimentNumber: experiment.experimentNumber,
                experimentTitle: experiment.title,
                subject: experiment.subject,
                testDurationMinutes: durationMinutes,
                passMark,
                totalMarks,
                totalQuestions: sanitizedQuestions.length,
                startTime: newAttempt.startTime,
                maxViolationsBeforeSubmit: qSet.maxViolationsBeforeSubmit || 2,
                questions: sanitizedQuestions
            }
        });
    } catch (err) {
        console.error('Exam start error:', err);
        res.status(500).json({ success: false, message: 'Failed to start exam session' });
    }
});

// ==========================================
// 7. RECORD MONITORING / ANTI-CHEATING EVENT
// ==========================================
router.post('/exams/event', async (req, res) => {
    try {
        const student = req.student;
        const { attemptId, eventType, details, confidence } = req.body;

        if (!attemptId || !eventType) {
            return res.status(400).json({ success: false, message: 'Missing attemptId or eventType' });
        }

        const attempt = await ExamAttempt.findOne({
            attemptId,
            studentUsername: student.username
        });

        if (!attempt) {
            return res.status(404).json({ success: false, message: 'Exam attempt not found' });
        }

        if (attempt.status !== 'In Progress' && attempt.status !== 'Warning Issued') {
            return res.json({
                success: true,
                message: 'Attempt already concluded',
                action: 'none'
            });
        }

        // IMMEDIATE ZERO-TOLERANCE TERMINATION FOR CELL PHONE DETECTION
        if (eventType === 'phone_detected') {
            attempt.warningCount = (attempt.warningCount || 0) + 1;
            attempt.status = 'Terminated';
            attempt.passed = false;
            attempt.score = 0;
            attempt.submissionTime = new Date();
            attempt.durationSeconds = Math.round((attempt.submissionTime - attempt.startTime) / 1000);
            attempt.monitoringEvents.push({
                eventType: 'phone_detected',
                timestamp: new Date(),
                details: details || 'Unauthorized cell phone detected in camera feed',
                confidence: typeof confidence === 'number' ? confidence : 1.0,
                actionTaken: 'Ejected & Auto-Submitted'
            });
            await attempt.save();

            return res.json({
                success: true,
                action: 'terminate_phone',
                warningCount: attempt.warningCount,
                message: '🚨 CRITICAL INTEGRITY VIOLATION: Unauthorized Mobile Phone detected! You have been ejected from the examination.'
            });
        }

        // IMMEDIATE SUSPENSION FOR EYES CLOSED / DOWN EXCEEDING 3 SECONDS
        if ((eventType === 'eyes_closed_down' || eventType === 'looking_away') && req.body.action === 'suspend') {
            attempt.warningCount = (attempt.warningCount || 0) + 1;
            attempt.status = 'Terminated';
            attempt.passed = false;
            attempt.score = 0;
            attempt.submissionTime = new Date();
            attempt.durationSeconds = Math.round((attempt.submissionTime - attempt.startTime) / 1000);
            attempt.monitoringEvents.push({
                eventType: 'eyes_closed_down',
                timestamp: new Date(),
                details: details || 'Examinee eyes closed or looking down for >3 seconds without recovery',
                confidence: typeof confidence === 'number' ? confidence : 1.0,
                actionTaken: 'Suspended & Auto-Submitted'
            });
            await attempt.save();

            return res.json({
                success: true,
                action: 'suspend_gaze',
                warningCount: attempt.warningCount,
                message: '🚨 EXAM SUSPENDED: Eyes closed or directed away from screen for more than 3 seconds.'
            });
        }

        // Fetch policy
        const qSet = await QuestionSet.findById(attempt.questionSetId).lean();
        const maxViolations = (qSet && qSet.maxViolationsBeforeSubmit) || 2;

        // Record violation event
        attempt.warningCount = (attempt.warningCount || 0) + 1;
        const actionTaken = attempt.warningCount >= maxViolations ? 'Terminated / Auto-Submitted' : 'Warning Issued';

        attempt.monitoringEvents.push({
            eventType,
            timestamp: new Date(),
            details: details || `Integrity flag: ${eventType}`,
            confidence: typeof confidence === 'number' ? confidence : 1.0,
            actionTaken
        });

        if (attempt.warningCount >= maxViolations) {
            // Apply policy: Auto-submit or terminate
            attempt.status = 'Terminated';
            attempt.submissionTime = new Date();
            attempt.durationSeconds = Math.round((attempt.submissionTime - attempt.startTime) / 1000);
            await attempt.save();

            return res.json({
                success: true,
                action: 'terminate',
                warningCount: attempt.warningCount,
                message: 'Multiple exam integrity violations detected. Your assessment has been terminated according to policy.'
            });
        } else {
            attempt.status = 'Warning Issued';
            await attempt.save();

            return res.json({
                success: true,
                action: 'warning',
                warningCount: attempt.warningCount,
                message: `Integrity warning ${attempt.warningCount}/${maxViolations}: Please maintain focus within the exam window.`
            });
        }
    } catch (err) {
        console.error('Monitoring event error:', err);
        res.status(500).json({ success: false, message: 'Error logging exam monitoring event' });
    }
});

// ==========================================
// 7.5. UPLOAD REAL-TIME PROCTORING SNAPSHOT
// ==========================================
router.post('/exams/snapshot', async (req, res) => {
    try {
        const student = req.student;
        const { attemptId, imageBase64, trigger, label } = req.body;

        if (!attemptId || !imageBase64) {
            return res.status(400).json({ success: false, message: 'Missing attemptId or image data' });
        }

        const attempt = await ExamAttempt.findOne({
            attemptId,
            studentUsername: student.username
        });

        if (!attempt) {
            return res.status(404).json({ success: false, message: 'Exam attempt not found' });
        }

        // Clean Base64 string
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Ensure directory exists
        const dir = path.join(__dirname, '../uploads/proctoring');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const fileName = `snap_${attemptId}_${Date.now()}.jpg`;
        const filePath = path.join(dir, fileName);
        fs.writeFileSync(filePath, buffer);

        const publicUrl = `/uploads/proctoring/${fileName}`;

        attempt.snapshots.push({
            imageUrl: publicUrl,
            timestamp: new Date(),
            trigger: trigger || 'periodic',
            label: label || 'Examinee Verified'
        });

        await attempt.save();

        res.json({
            success: true,
            message: 'Proctoring snapshot saved successfully',
            snapshotCount: attempt.snapshots.length,
            imageUrl: publicUrl
        });
    } catch (err) {
        console.error('Proctoring snapshot upload error:', err);
        res.status(500).json({ success: false, message: 'Failed to save snapshot' });
    }
});

// ==========================================
// 8. SUBMIT EXAM & SERVER-SIDE SCORING
// ==========================================
// Strictly validates and computes score on the server
router.post('/exams/submit', async (req, res) => {
    try {
        const student = req.student;
        const { attemptId, answers } = req.body;

        if (!attemptId) {
            return res.status(400).json({ success: false, message: 'Attempt ID is required' });
        }

        const attempt = await ExamAttempt.findOne({
            attemptId,
            studentUsername: student.username
        });

        if (!attempt) {
            return res.status(404).json({ success: false, message: 'Exam attempt record not found' });
        }

        // Prevent duplicate resubmissions
        if (attempt.status === 'Submitted' || attempt.status === 'Passed' || attempt.status === 'Failed') {
            return res.json({
                success: true,
                message: 'Assessment was already submitted.',
                data: {
                    attemptId: attempt.attemptId,
                    score: attempt.score,
                    totalMarks: attempt.totalMarks,
                    passMark: attempt.passMark,
                    passed: attempt.passed,
                    status: attempt.status,
                    durationSeconds: attempt.durationSeconds
                }
            });
        }

        // Retrieve QuestionSet from MongoDB
        const qSet = await QuestionSet.findById(attempt.questionSetId).lean();
        if (!qSet) {
            return res.status(500).json({ success: false, message: 'Question set configuration missing' });
        }

        const submittedAnswers = Array.isArray(answers) ? answers : [];
        const answerMap = {};
        submittedAnswers.forEach(ans => {
            answerMap[ans.questionIndex] = ans.selectedOptionIndex;
        });

        let calculatedScore = 0;
        const recordedAnswers = [];

        // Grade each question server-side
        qSet.questions.forEach((q, idx) => {
            const selectedOpt = answerMap[idx];
            const isAnswered = selectedOpt !== undefined && selectedOpt !== null;
            const isCorrect = isAnswered && selectedOpt === q.correctOptionIndex;
            const marksAwarded = isCorrect ? (q.marks || 1) : 0;

            calculatedScore += marksAwarded;

            recordedAnswers.push({
                questionIndex: idx,
                selectedOptionIndex: isAnswered ? selectedOpt : -1,
                isCorrect,
                marksAwarded
            });
        });

        // Apply penalty per warning if configured
        const penaltyPerWarning = qSet.penaltyPerWarning || 0;
        const totalPenalty = penaltyPerWarning * (attempt.warningCount || 0);
        const finalScore = Math.max(0, calculatedScore - totalPenalty);

        const passMark = qSet.passMark || 3;
        const passed = finalScore >= passMark;

        const submissionTime = new Date();
        const durationSeconds = Math.round((submissionTime - attempt.startTime) / 1000);

        attempt.submissionTime = submissionTime;
        attempt.durationSeconds = durationSeconds;
        attempt.answers = recordedAnswers;
        attempt.score = finalScore;
        attempt.passed = passed;
        attempt.status = passed ? 'Passed' : 'Failed';

        await attempt.save();

        if (passed) {
            // Update any existing pending session for this student to Awaiting Component Issue
            await LabSession.updateMany(
                {
                    experimentNumber: attempt.experimentNumber,
                    $or: [
                        { studentUsername: student.username },
                        { studentNames: student.fullName || student.username }
                    ],
                    status: { $in: ['Test Pending', 'Registered'] }
                },
                { $set: { status: 'Awaiting Component Issue' } }
            );
        }

        res.json({
            success: true,
            message: passed ? 'Assessment submitted successfully! Pre-lab passed and practical session unlocked.' : 'Assessment submitted. Did not meet passing threshold.',
            data: {
                attemptId: attempt.attemptId,
                experimentNumber: attempt.experimentNumber,
                score: finalScore,
                totalMarks: attempt.totalMarks,
                passMark,
                passed,
                durationSeconds,
                answeredCount: submittedAnswers.length,
                totalQuestions: qSet.questions.length,
                warningCount: attempt.warningCount,
                penaltiesApplied: totalPenalty,
                status: attempt.status,
                nextStep: passed
                    ? 'Congratulations! You have passed the pre-lab assessment. Your practical session and hardware component issuance are now unlocked.'
                    : 'Review the lab manual and objectives before attempting retake.'
            }
        });
    } catch (err) {
        console.error('Exam submission error:', err);
        res.status(500).json({ success: false, message: 'Failed to process exam submission' });
    }
});

// ==========================================
// 9. EXPERIMENT COMPONENT REQUIREMENTS
// ==========================================
router.get('/components/:expNum', async (req, res) => {
    try {
        const student = req.student;
        const { expNum } = req.params;

        const experiment = await Experiment.findOne({ experimentNumber: expNum }).lean();
        if (!experiment) {
            return res.status(404).json({ success: false, message: 'Experiment not found' });
        }

        // Fetch inventory data for required components
        const componentInventory = await Component.find().lean();
        const invMap = {};
        componentInventory.forEach(comp => {
            if (comp.partNumber) invMap[comp.partNumber] = comp;
            if (comp.name) invMap[comp.name.toLowerCase()] = comp;
        });

        const detailedComponents = (experiment.requiredComponents || []).map(rc => {
            const stock = invMap[rc.partNumber] || invMap[(rc.componentName || '').toLowerCase()] || {};
            return {
                componentName: rc.componentName,
                partNumber: rc.partNumber || stock.partNumber || 'GEN-PART',
                requiredQuantity: rc.quantity || 1,
                availableQuantity: stock.availableQuantity !== undefined ? stock.availableQuantity : 'In Stock',
                storageLocation: stock.storageLocation || 'Component Rack',
                condition: stock.condition || 'Good',
                specifications: stock.specifications || 'Standard laboratory rating',
                safetyPrecautions: stock.safetyPrecautions || 'Handle with ESD wrist strap and observe polarity.',
                notes: rc.notes || ''
            };
        });

        // Check if student individually passed the pre-lab assessment
        const passedAttempt = await ExamAttempt.findOne({
            studentUsername: new RegExp(`^${student.username}$`, 'i'),
            experimentNumber: expNum,
            passed: true
        }).lean();

        const allowedPractical = !!passedAttempt;

        // Check if components have been issued for this student & experiment
        const issueRecord = await ComponentIssue.findOne({
            experimentNumber: expNum,
            $or: [
                { studentUsername: student.username },
                { groupId: student.registrationId || student.username }
            ]
        }).lean();

        let issueStatus = 'Pre-Lab Assessment Required';
        let issueDetails = null;

        if (issueRecord) {
            issueStatus = 'Components Issued';
            issueDetails = {
                issuedBy: issueRecord.issuedBy,
                issueTimestamp: issueRecord.issueTimestamp,
                components: issueRecord.components
            };
        } else if (allowedPractical) {
            issueStatus = 'Allowed for Practical (Awaiting Staff Issue)';
        }

        res.json({
            success: true,
            data: {
                experimentNumber: experiment.experimentNumber,
                title: experiment.title,
                subject: experiment.subject,
                laboratory: experiment.laboratory,
                components: detailedComponents,
                issueStatus,
                issueDetails,
                allowedPractical
            }
        });
    } catch (err) {
        console.error('Components fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to load component requirements' });
    }
});

// ==========================================
// 10. COMPREHENSIVE EXPERIMENT & LAB HISTORY
// ==========================================
router.get('/history', async (req, res) => {
    try {
        const student = req.student;

        // Fetch all student's attempts
        const attempts = await ExamAttempt.find({ studentUsername: student.username })
            .sort({ createdAt: -1 })
            .lean();

        // Fetch lab sessions, component issues, and inspections for this student
        const [sessions, issues, inspections] = await Promise.all([
            LabSession.find({
                $or: [
                    { studentUsername: student.username },
                    { studentNames: student.fullName || student.username }
                ]
            }).sort({ createdAt: -1 }).lean(),
            ComponentIssue.find({
                $or: [
                    { studentUsername: student.username },
                    { groupId: student.registrationId || student.username }
                ]
            }).lean(),
            ReturnInspection.find({
                $or: [
                    { studentUsername: student.username },
                    { groupId: student.registrationId || student.username }
                ]
            }).lean()
        ]);

        const sessionMap = {};
        sessions.forEach(s => sessionMap[s.experimentNumber] = s);

        const issueMap = {};
        issues.forEach(i => issueMap[i.experimentNumber] = i);

        const inspectionMap = {};
        inspections.forEach(ins => inspectionMap[ins.experimentNumber || ins.groupId] = ins);

        // Group history by experimentNumber
        const historyRecords = [];

        attempts.forEach(att => {
            const matchingSession = sessionMap[att.experimentNumber];
            const matchingIssue = issueMap[att.experimentNumber];
            const matchingInspection = inspectionMap[att.experimentNumber];

            historyRecords.push({
                attemptId: att.attemptId,
                subject: att.subject,
                experimentNumber: att.experimentNumber,
                attemptNumber: att.attemptNumber,
                testStartTime: att.startTime,
                testSubmissionTime: att.submissionTime,
                durationSeconds: att.durationSeconds,
                score: att.score,
                totalMarks: att.totalMarks,
                passMark: att.passMark,
                passed: att.passed,
                status: att.status,
                warningCount: att.warningCount || 0,
                componentsIssuedTime: matchingIssue ? matchingIssue.issueTimestamp : null,
                issuedBy: matchingIssue ? matchingIssue.issuedBy : null,
                sessionStartTime: matchingSession ? matchingSession.startTime : null,
                sessionEndTime: matchingSession ? matchingSession.endTime : null,
                sessionStatus: matchingSession ? matchingSession.status : (att.passed ? 'Ready for Practical' : 'Test Incomplete'),
                componentsReturnTime: matchingInspection ? matchingInspection.inspectionTimestamp : null,
                inspectionOutcome: matchingInspection ? matchingInspection.inspectionStatus : 'Not Inspected',
                snapshots: att.snapshots || [],
                monitoringEvents: att.monitoringEvents || []
            });
        });

        res.json({
            success: true,
            data: historyRecords
        });
    } catch (err) {
        console.error('History fetch error:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve student history' });
    }
});

module.exports = router;
