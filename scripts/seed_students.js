const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { studentConn } = require('../backend/db');
const User = require('../backend/models/User');

const studentsData = [
    // 3rd Year - Section A
    { username: 'Mohanraj M', name: 'Mohanraj M', registerNumber: '917621104028', registrationId: '917621104028', year: '3rd Year', section: 'Section A', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'mohanraj.m@college.edu' },
    { username: 'MADANRAJ M', name: 'Madanraj M', registerNumber: '917621104025', registrationId: '917621104025', year: '3rd Year', section: 'Section A', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'madanraj.m@college.edu' },
    { username: 'Abinaya S', name: 'Abinaya S', registerNumber: '917621104001', registrationId: '917621104001', year: '3rd Year', section: 'Section A', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'abinaya.s@college.edu' },
    { username: 'Dinesh Kumar K', name: 'Dinesh Kumar K', registerNumber: '917621104015', registrationId: '917621104015', year: '3rd Year', section: 'Section A', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'dinesh.k@college.edu' },
    { username: 'Naveen Prasanth P', name: 'Naveen Prasanth P', registerNumber: '917621104033', registrationId: '917621104033', year: '3rd Year', section: 'Section A', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'naveen.p@college.edu' },
    { username: 'Praveen R', name: 'Praveen R', registerNumber: '917621104037', registrationId: '917621104037', year: '3rd Year', section: 'Section A', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'praveen.r@college.edu' },

    // 3rd Year - Section B
    { username: 'RAMYA R', name: 'Ramya R', registerNumber: '917621104042', registrationId: '917621104042', year: '3rd Year', section: 'Section B', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'ramya.r@college.edu' },
    { username: 'Sanjay Kumar V', name: 'Sanjay Kumar V', registerNumber: '917621104048', registrationId: '917621104048', year: '3rd Year', section: 'Section B', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'sanjay.v@college.edu' },
    { username: 'Sneha Priya M', name: 'Sneha Priya M', registerNumber: '917621104052', registrationId: '917621104052', year: '3rd Year', section: 'Section B', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'sneha.m@college.edu' },
    { username: 'Vigneshwaran K', name: 'Vigneshwaran K', registerNumber: '917621104059', registrationId: '917621104059', year: '3rd Year', section: 'Section B', department: 'ECE', batch: '2023-2027', semester: 'Semester V', email: 'vignesh.k@college.edu' },

    // 2nd Year - Section A
    { username: 'Aravindhan T', name: 'Aravindhan T', registerNumber: '917622104003', registrationId: '917622104003', year: '2nd Year', section: 'Section A', department: 'ECE', batch: '2024-2028', semester: 'Semester III', email: 'aravindhan.t@college.edu' },
    { username: 'Deepika S', name: 'Deepika S', registerNumber: '917622104011', registrationId: '917622104011', year: '2nd Year', section: 'Section A', department: 'ECE', batch: '2024-2028', semester: 'Semester III', email: 'deepika.s@college.edu' },
    { username: 'Karthikeyan B', name: 'Karthikeyan B', registerNumber: '917622104022', registrationId: '917622104022', year: '2nd Year', section: 'Section A', department: 'ECE', batch: '2024-2028', semester: 'Semester III', email: 'karthik.b@college.edu' },
    { username: 'Manoj Prabhakar S', name: 'Manoj Prabhakar S', registerNumber: '917622104031', registrationId: '917622104031', year: '2nd Year', section: 'Section A', department: 'ECE', batch: '2024-2028', semester: 'Semester III', email: 'manoj.s@college.edu' },

    // 2nd Year - Section B
    { username: 'Rohit Sharma A', name: 'Rohit Sharma A', registerNumber: '917622104045', registrationId: '917622104045', year: '2nd Year', section: 'Section B', department: 'ECE', batch: '2024-2028', semester: 'Semester III', email: 'rohit.a@college.edu' },
    { username: 'Swetha K', name: 'Swetha K', registerNumber: '917622104051', registrationId: '917622104051', year: '2nd Year', section: 'Section B', department: 'ECE', batch: '2024-2028', semester: 'Semester III', email: 'swetha.k@college.edu' },
    { username: 'Vijay Anand R', name: 'Vijay Anand R', registerNumber: '917622104058', registrationId: '917622104058', year: '2nd Year', section: 'Section B', department: 'ECE', batch: '2024-2028', semester: 'Semester III', email: 'vijay.r@college.edu' },

    // 4th Year - Section A
    { username: 'Balaji G', name: 'Balaji G', registerNumber: '917620104012', registrationId: '917620104012', year: '4th Year', section: 'Section A', department: 'ECE', batch: '2022-2026', semester: 'Semester VII', email: 'balaji.g@college.edu' },
    { username: 'Harish V', name: 'Harish V', registerNumber: '917620104024', registrationId: '917620104024', year: '4th Year', section: 'Section A', department: 'ECE', batch: '2022-2026', semester: 'Semester VII', email: 'harish.v@college.edu' },
    { username: 'Keerthana M', name: 'Keerthana M', registerNumber: '917620104035', registrationId: '917620104035', year: '4th Year', section: 'Section A', department: 'ECE', batch: '2022-2026', semester: 'Semester VII', email: 'keerthana.m@college.edu' },

    // 1st Year - Section A
    { username: 'Ananya R', name: 'Ananya R', registerNumber: '917623104005', registrationId: '917623104005', year: '1st Year', section: 'Section A', department: 'ECE', batch: '2025-2029', semester: 'Semester I', email: 'ananya.r@college.edu' },
    { username: 'Gowtham N', name: 'Gowtham N', registerNumber: '917623104018', registrationId: '917623104018', year: '1st Year', section: 'Section A', department: 'ECE', batch: '2025-2029', semester: 'Semester I', email: 'gowtham.n@college.edu' },
    { username: 'Monika S', name: 'Monika S', registerNumber: '917623104027', registrationId: '917623104027', year: '1st Year', section: 'Section A', department: 'ECE', batch: '2025-2029', semester: 'Semester I', email: 'monika.s@college.edu' }
];

async function seedStudents() {
    try {
        console.log('Seeding student cohort with register numbers, years, and sections...');
        const defaultPasswordHash = await bcrypt.hash('student123', 10);

        for (const data of studentsData) {
            const existing = await User.findOne({ username: data.username });
            if (existing) {
                existing.name = data.name;
                existing.registerNumber = data.registerNumber;
                existing.registrationId = data.registrationId;
                existing.year = data.year;
                existing.section = data.section;
                existing.department = data.department;
                existing.batch = data.batch;
                existing.semester = data.semester;
                existing.email = data.email;
                existing.role = 'student';
                await existing.save();
                console.log(`Updated student: ${data.username} (${data.registerNumber}) - ${data.year} ${data.section}`);
            } else {
                const newStudent = new User({
                    username: data.username,
                    password: defaultPasswordHash,
                    name: data.name,
                    registerNumber: data.registerNumber,
                    registrationId: data.registrationId,
                    year: data.year,
                    section: data.section,
                    department: data.department,
                    batch: data.batch,
                    semester: data.semester,
                    email: data.email,
                    role: 'student',
                    status: 'Active',
                    securityClearance: true
                });
                await newStudent.save();
                console.log(`Created student: ${data.username} (${data.registerNumber}) - ${data.year} ${data.section}`);
            }
        }

        console.log('Successfully seeded students!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding students:', err);
        process.exit(1);
    }
}

seedStudents();
