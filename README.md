# 🎓 Lab Submission & AI Management System

A comprehensive, role-based web platform designed for academic institutions to manage laboratory experiments, manuals, student group allocations, electronic component inventory, AI-driven PDF lab manual analysis, and online exam assessments.

---

## 📌 Table of Contents
- [Features](#-features)
  - [Student Portal](#student-portal)
  - [Staff Portal](#staff-portal)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Running the Application](#-running-the-application)
- [Default Credentials](#-default-credentials)
- [Project Directory Structure](#-project-directory-structure)
- [API Endpoints Overview](#-api-endpoints-overview)
- [License](#-license)

---

## ✨ Features

### Student Portal
- **Role-Based Authentication**: Registration and login specifically designed for students.
- **Experiment Dashboard**: View assigned laboratory experiments, objectives, and schedules.
- **Interactive Lab Manuals**: Browse and download uploaded experiment PDF manuals.
- **Component Requests**: Request and track hardware/laboratory components needed for sessions.
- **Online Lab Exams**: Take scheduled assessments and view automated/manual grading reports.

### HOD OF DEP - Executive Department Control Panel (Power BI Style React App)
- **Role & Branding**: Rebranded admin panel to **HOD OF DEP** (Head of Department Control Panel).
- **React Architecture**: Fully transformed into a modern React application utilizing React 18, React Hooks, and Chart.js.
- **Staff & Subject Experiment Tracker**: Tracks under each subject curriculum which staff member is in-charge and how many experiments they have finished (with live quick stepper buttons and progress meters).
- **Component Issue Deadlines**: Sets and maps the target date until which staff must provide hardware components to student groups.
- **Student Completion Deadlines**: Projects and tracks target deadlines under which students must finish all laboratory experiments.
- **Power BI Style Data Visualizations**: Real-time comparative stacked bar charts (finished vs remaining experiments) and milestone timeline projection maps.
- **MongoDB Persistence**: Real-time persistence of department schedules and deadlines into `staff_portal.departmentschedules`.
- **Integrated Lab Operations**: Navigation sub-views for AI Docling Lab Manuals, 40-experiment catalog, and hardware inventory stock.

---

## 💻 Tech Stack

- **Runtime & Backend Framework**: Node.js, Express 5
- **Database & ODM**: MongoDB, Mongoose 9 (Dual Database Architecture: `student_portal` & `staff_portal`)
- **Document & PDF Parsing**: IBM Docling (`docling` Python library), pdf-parse, Multer
- **Frontend Architecture**: **React 18**, Babel Standalone, Chart.js, Vanilla CSS3 (Dark Mode & Power BI Glassmorphism)
- **Authentication & Security**: bcryptjs, CORS

---

## ⚙️ Prerequisites

Before running the project, make sure you have the following installed on your machine:
1. [Node.js](https://nodejs.org/) (v18.x or later recommended)
2. [MongoDB Community Server](https://www.mongodb.com/try/download/community) or MongoDB Compass running locally on `localhost:27017`

---

## 🚀 Installation & Setup

1. **Clone or Open the Project Directory**:
   ```bash
   cd "d:/LAB SUB AI SYSTEM"
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Install Docling PDF AI Reader (Optional but Recommended)**:
   Installs IBM Docling for layout-aware PDF extraction (tables, headings, apparatus lists):
   ```bash
   npm run install:docling
   # or: pip install -r requirements.txt
   ```
   *(If omitted, the server automatically uses the built-in `pdf-parse` fallback).*

4. **Verify MongoDB Service**:
   Ensure MongoDB service is running locally on port `27017`. The system uses two dedicated, separated databases:
   - **Student Portal DB**: `mongodb://localhost:27017/student_portal` (Students, Exam Attempts, Student Groups, Lab Sessions, Component Issues)
   - **Staff Portal DB**: `mongodb://localhost:27017/staff_portal` (Staff Users, Experiments, Lab Manuals, Hardware Inventory, Question Banks, Return Inspections, Audit Logs)

---

## 🏃 Running the Application

### Start Server
```bash
npm start
```

### Start in Development Mode (Live Watch)
```bash
npm run dev
```

Once started, open your web browser and navigate to:
- **Login / Home Page**: [http://localhost:5000](http://localhost:5000) (or open [index.html](file:///d:/LAB%20SUB%20AI%20SYSTEM/index.html))
- **Student Dashboard**: [http://localhost:5000/dashboard.html](http://localhost:5000/dashboard.html)
- **Staff Dashboard**: [http://localhost:5000/staff-dashboard.html](http://localhost:5000/staff-dashboard.html)

---

## 🔑 Default Credentials

The server automatically initializes a default staff account on first boot:

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Staff** | `staff_admin` | `password123` | Pre-seeded on first database connection |
| **Student** | *(Register via Signup tab)* | *(Min. 6 chars)* | Created via the Student Signup form |

---

## 📂 Project Directory Structure

```text
├── models/                  # Mongoose data schemas
│   ├── AuditLog.js          # Audit logs for staff actions
│   ├── Component.js         # Lab components inventory
│   ├── ComponentIssue.js    # Component issue records
│   ├── ExamAttempt.js       # Student test submissions
│   ├── Experiment.js        # Lab experiment details
│   ├── LabManual.js         # Metadata for PDF manuals
│   ├── LabSession.js        # Scheduled lab sessions
│   ├── QuestionSet.js       # Generated exam questions
│   ├── ReturnInspection.js  # Returned component condition logs
│   ├── StudentUser.js       # Student profiles & enrollment
│   └── User.js              # User auth credentials & roles
├── routes/                  # Express REST API routes
│   ├── staffRoutes.js       # Endpoints for staff operations
│   └── studentRoutes.js     # Endpoints for student operations
├── services/                # Specialized logic & AI parsing
│   └── pdfAnalyzer.js       # PDF text extraction & analysis
├── uploads/                 # Static uploads storage
│   └── manuals/             # Uploaded PDF lab manuals
├── index.html               # Main login and registration portal
├── dashboard.html           # Student portal interface
├── staff-dashboard.html     # Staff management dashboard
├── server.js                # Express app entry point & DB connection
├── seed_staff_data.js       # Startup seeder for directories & manuals
└── package.json             # NPM dependencies & scripts
```

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/login` | Role-verified authentication (Student / Staff) |
| `POST` | `/api/signup` | Student-only registration |
| `GET` / `POST` | `/api/staff/*` | Staff lab management, manual uploads, inventory & exams |
| `GET` / `POST` | `/api/student/*` | Student lab sessions, component requests & exam submissions |

---

## 📄 License
ISC License
