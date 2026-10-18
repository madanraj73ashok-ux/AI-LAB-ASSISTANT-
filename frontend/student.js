/* ====================================================================
   Student Portal - AI Laboratory Management System
   Full Frontend Engine: Auth, Dashboard, Experiments, Timed Exam,
   AI Anti-Cheating Monitoring & Individual Lab History
   ==================================================================== */

const API_BASE = 'http://localhost:5000/api/student';

// Global Student Portal State
const state = {
    username: localStorage.getItem('username') || '',
    role: localStorage.getItem('role') || 'student',
    profile: null,
    currentTab: 'dashboard',
    selectedSubject: null,
    selectedExperiment: null,
    activeExam: null,
    examTimerInterval: null,
    cameraStream: null,
    cameraMonitoringInterval: null,
    examAnswers: {}, // { questionIndex: selectedOptionIndex }
    currentQuestionIndex: 0,
    examWarningCount: 0
};

// ==========================================
// 1. INITIALIZATION & AUTH GUARD
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Enforce student authentication
    if (!state.username || state.role !== 'student') {
        window.location.href = 'index.html';
        return;
    }

    // Set UI User Info in Navbar
    const avatarInitial = document.getElementById('avatarInitial');
    const navUsername = document.getElementById('navUsername');
    const navUserRole = document.getElementById('navUserRole');
    if (avatarInitial) avatarInitial.textContent = state.username.charAt(0).toUpperCase();
    if (navUsername) navUsername.textContent = state.username;
    if (navUserRole) navUserRole.textContent = 'Student';

    // Bind Navigation Tab Buttons
    document.querySelectorAll('.nav-link-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = btn.getAttribute('data-tab');
            if (tab) switchTab(tab);
        });
    });

    // Bind Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            stopExamMonitoring();
            localStorage.removeItem('username');
            localStorage.removeItem('role');
            window.location.href = 'index.html';
        });
    }

    // Bind Search Input
    const searchInput = document.getElementById('topbarSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.course-card-item').forEach(card => {
                const title = card.querySelector('.course-card-title')?.textContent.toLowerCase() || '';
                const author = card.querySelector('.course-card-author')?.textContent.toLowerCase() || '';
                const match = title.includes(query) || author.includes(query);
                card.style.display = match ? 'flex' : 'none';
            });
        });
    }

    // Initialize Dashboard
    await loadStudentProfile();
    await loadDashboardOverview();
});

// Helper for Authenticated Fetch
async function studentFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    headers['x-student-username'] = state.username;
    headers['Content-Type'] = 'application/json';

    const config = {
        ...options,
        headers
    };

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await res.json();
        return data;
    } catch (err) {
        console.error(`API Error on ${endpoint}:`, err);
        showToast('Server connection failed. Please ensure the backend is running.', 'error');
        return { success: false, message: 'Network error' };
    }
}

// ==========================================
// 2. TAB SWITCHING SYSTEM
// ==========================================
window.switchTab = function switchTab(tabName) {
    // If student is inside an active exam, prompt before navigating away
    if (state.activeExam && tabName !== 'exam') {
        const confirmLeave = confirm('Warning: You have an active exam session in progress. Leaving this page will trigger an integrity warning or auto-submit your test. Are you sure?');
        if (!confirmLeave) return;
        recordExamIntegrityEvent('tab_switch', 'Student navigated away from exam tab', 1.0);
    }

    state.currentTab = tabName;

    // Update nav buttons
    document.querySelectorAll('.nav-link-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
    });

    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.remove('active');
    });

    // Show target section
    const targetSection = document.getElementById(`view-${tabName}`);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Trigger tab-specific data load
    if (tabName === 'dashboard') loadDashboardOverview();
    if (tabName === 'experiments') loadSubjects();
    if (tabName === 'tests') loadMyTests();
    if (tabName === 'components') loadComponentsView();
    if (tabName === 'history') loadLabHistory();
    if (tabName === 'profile') loadStudentProfile();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 3. STUDENT PROFILE & DASHBOARD OVERVIEW
// ==========================================
async function loadStudentProfile() {
    const res = await studentFetch('/profile');
    if (res.success && res.data) {
        state.profile = res.data;
        const profileName = document.getElementById('profileName');
        const profileRegId = document.getElementById('profileRegId');
        const profileDept = document.getElementById('profileDept');
        const profileRole = document.getElementById('profileRole');
        const studentGreetingName = document.getElementById('studentGreetingName');

        if (profileName) profileName.textContent = res.data.fullName || res.data.username;
        if (profileRegId) profileRegId.textContent = res.data.registrationId;
        if (profileDept) profileDept.textContent = res.data.enrolledDepartment;
        if (profileRole) profileRole.textContent = res.data.role.toUpperCase();
        if (studentGreetingName) studentGreetingName.textContent = res.data.fullName || res.data.username;

        // Populate profile stats
        const s = res.data.stats || {};
        const pAttempted = document.getElementById('pAttempted');
        const pPassed = document.getElementById('pPassed');
        const pFailed = document.getElementById('pFailed');
        const pUnlocked = document.getElementById('pUnlocked');
        if (pAttempted) pAttempted.textContent = s.experimentsAttempted || 0;
        if (pPassed) pPassed.textContent = s.experimentsPassed || 0;
        if (pFailed) pFailed.textContent = s.experimentsFailed || 0;
        if (pUnlocked) pUnlocked.textContent = s.unlockedPracticals || 0;
    }
}

async function loadDashboardOverview() {
    // 0. Update Date and Greeting
    const heroCurrentDate = document.getElementById('heroCurrentDate');
    if (heroCurrentDate) {
        const today = new Date();
        const options = { month: 'long', day: 'numeric', year: 'numeric' };
        heroCurrentDate.textContent = today.toLocaleDateString('en-US', options);
    }

    const studentGreetingName = document.getElementById('studentGreetingName');
    if (studentGreetingName) {
        studentGreetingName.textContent = state.username;
    }

    // Load subjects for the dashboard grid
    loadSubjects();

    const res = await studentFetch('/dashboard-overview');
    if (!res.success || !res.data) return;

    const d = res.data;

    // 1. Total Experiments Available
    const valTotalExp = document.getElementById('valTotalExp');
    if (valTotalExp) valTotalExp.textContent = d.totalExperiments || 0;

    // 2. Experiments Attempted
    const valExpAttempted = document.getElementById('valExpAttempted');
    if (valExpAttempted) valExpAttempted.textContent = d.experimentsAttempted || 0;

    // 3. Experiments Passed
    const valExpPassed = document.getElementById('valExpPassed');
    if (valExpPassed) valExpPassed.textContent = d.experimentsPassed || 0;

    // 4. Experiments Remaining
    const valExpRemaining = document.getElementById('valExpRemaining');
    if (valExpRemaining) valExpRemaining.textContent = d.experimentsRemaining || 0;

    // 5. Practical Access Status
    const valPracticalStatus = document.getElementById('valPracticalStatus') || document.getElementById('valTeamStatus');
    if (valPracticalStatus) {
        valPracticalStatus.textContent = d.practicalStatus || (d.experimentsPassed > 0 ? 'Unlocked ✓' : 'Assessment Required');
        valPracticalStatus.title = valPracticalStatus.textContent;
    }

    // 6. Current Lab Session Status
    const valSessionStatus = document.getElementById('valSessionStatus');
    if (valSessionStatus) {
        valSessionStatus.textContent = d.currentLabSessionStatus || 'No Active Session';
        if (d.currentLabSessionStatus === 'Components Issued' || d.currentLabSessionStatus === 'Experiment In Progress') {
            valSessionStatus.style.color = '#10b981';
        } else if (d.currentLabSessionStatus === 'Awaiting Component Issue') {
            valSessionStatus.style.color = '#f59e0b';
        } else {
            valSessionStatus.style.color = 'var(--text-white)';
        }
    }

}

// ==========================================
// 4. SUBJECT AND EXPERIMENT SELECTION FLOW
// ==========================================
async function loadSubjects() {
    const res = await studentFetch('/subjects');
    const dashGrid = document.getElementById('dashboardSubjectsGrid');

    if (!res.success || !res.data || res.data.length === 0) {
        if (dashGrid) dashGrid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">No subjects currently available.</p>`;
        return;
    }

    state.subjects = res.data;

    // 1. Populate Dashboard Grid (Ref: User UI Images with 'Select these' / 'For my project-related')
    if (dashGrid) {
        dashGrid.innerHTML = res.data.map(subj => {
            const completionPercent = subj.availableExperiments > 0 
                ? Math.round((subj.passedExperiments / subj.availableExperiments) * 100) 
                : 0;

            return `
                <div class="course-card-item" onclick="selectSubjectAndOpen('${escapeHtml(subj.subjectName)}')">
                    <div class="course-card-thumb-wrap">
                        <img src="${escapeHtml(subj.imageUrl || '/images/aec_lab_cover.jpg')}" alt="${escapeHtml(subj.subjectName)}" class="course-card-img" />
                        <div class="card-rating-badge">
                            <span>⭐</span> ${escapeHtml(subj.rating || '5.0 (42)')}
                        </div>
                        <button type="button" class="card-bookmark-icon" title="Save to project wishlist" onclick="event.stopPropagation()">
                            🔖
                        </button>
                    </div>

                    <div class="course-card-body">
                        <div class="course-category-tag">
                            ${escapeHtml(subj.category || 'For my project-related')}
                        </div>
                        <h3 class="course-card-title">${escapeHtml(subj.subjectName)}</h3>
                        <p class="course-card-author">By ${escapeHtml(subj.dept || 'Dept. of Robotics and Automation')}</p>

                        <div class="course-progress-box">
                            <div class="progress-labels-row">
                                <span class="progress-lbl">My Progress:</span>
                                <span class="progress-ratio">${subj.passedExperiments} / ${subj.availableExperiments} Completed</span>
                            </div>
                            <div class="progress-track-mini">
                                <div class="progress-fill-mini" style="width: ${completionPercent}%;"></div>
                            </div>
                        </div>

                        <button type="button" class="btn-select-course" onclick="event.stopPropagation(); selectSubjectAndOpen('${escapeHtml(subj.subjectName)}')">
                            Select these
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Populate Subject Switcher Dropdown in Experiments View
    const dropdown = document.getElementById('subjectSwitcherDropdown');
    if (dropdown) {
        dropdown.innerHTML = res.data.map(s => `
            <option value="${escapeHtml(s.subjectName)}" ${state.selectedSubject === s.subjectName ? 'selected' : ''}>
                ${escapeHtml(s.subjectName)} (${s.passedExperiments}/${s.availableExperiments} Passed)
            </option>
        `).join('');
    }

    // Default to first subject if none selected
    if (!state.selectedSubject && res.data.length > 0) {
        state.selectedSubject = res.data[0].subjectName;
    }

    if (state.selectedSubject) {
        loadExperimentsForSubject(state.selectedSubject);
    }
}

// Select a subject from dashboard and open its experiments page directly
window.selectSubjectAndOpen = function(subjectName) {
    state.selectedSubject = subjectName;
    switchTab('experiments');
    loadExperimentsForSubject(subjectName);
};

window.selectSubject = function(subjectName) {
    state.selectedSubject = subjectName;
    const dropdown = document.getElementById('subjectSwitcherDropdown');
    if (dropdown) dropdown.value = subjectName;
    loadExperimentsForSubject(subjectName);
};

async function loadExperimentsForSubject(subjectName) {
    // 1. Update Subject Hub Header Banner
    const currSubj = (state.subjects || []).find(s => s.subjectName === subjectName);
    const titleEl = document.getElementById('hubSubjectTitle');
    const codeEl = document.getElementById('hubSubjectCode');
    const labEl = document.getElementById('hubSubjectLab');
    const deptEl = document.getElementById('hubSubjectDept');
    const statTotal = document.getElementById('hubStatTotal');
    const statPassed = document.getElementById('hubStatPassed');
    const statRemaining = document.getElementById('hubStatRemaining');
    const sectionTitle = document.getElementById('selectedSubjectTitle');

    if (titleEl) titleEl.textContent = subjectName;
    if (codeEl) codeEl.textContent = currSubj?.subjectCode || 'LAB';
    if (labEl) labEl.textContent = currSubj?.laboratory || 'Laboratory';
    if (deptEl) deptEl.textContent = currSubj?.dept || 'Department of Engineering';
    if (statTotal) statTotal.textContent = currSubj?.availableExperiments ?? 0;
    if (statPassed) statPassed.textContent = currSubj?.passedExperiments ?? 0;
    if (statRemaining) statRemaining.textContent = currSubj?.remainingExperiments ?? 0;
    if (sectionTitle) sectionTitle.textContent = `${subjectName} Experiments`;

    const dropdown = document.getElementById('subjectSwitcherDropdown');
    if (dropdown && dropdown.value !== subjectName) dropdown.value = subjectName;

    // 2. Fetch Experiments & Lab Manual for this Subject
    const res = await studentFetch(`/experiments?subject=${encodeURIComponent(subjectName)}`);
    const manualCard = document.getElementById('subjectManualCard');
    const container = document.getElementById('experimentsContainer');

    // 3. Render Dedicated Subject Lab Manual Card
    if (manualCard) {
        if (res.subjectManual) {
            manualCard.innerHTML = `
                <div class="manual-card-inner">
                    <div class="manual-card-left">
                        <div class="manual-icon-badge">📖</div>
                        <div class="manual-text-group">
                            <div class="manual-status-row">
                                <span class="manual-status-pill">Official Lab Manual</span>
                                <span class="manual-format-pill">PDF Document</span>
                                ${res.subjectManual.version ? `<span class="manual-format-pill">v${res.subjectManual.version}.0</span>` : ''}
                            </div>
                            <h3 class="manual-heading">${escapeHtml(res.subjectManual.title || `${subjectName} Official Lab Manual`)}</h3>
                            <p class="manual-subtext">Verified curriculum guide. Review apparatus schematics, laboratory safety protocols, and pre-lab background material.</p>
                        </div>
                    </div>
                    <div class="manual-card-actions">
                        <a href="${res.subjectManual.fileUrl}" target="_blank" rel="noopener noreferrer" class="btn-open-manual">
                            <span>📄</span> Open / Download Manual
                        </a>
                    </div>
                </div>
            `;
            manualCard.style.display = 'block';
        } else {
            manualCard.innerHTML = `
                <div class="manual-empty-state">
                    <span>ℹ️</span> No official lab manual has been published for ${escapeHtml(subjectName)} yet.
                </div>
            `;
            manualCard.style.display = 'block';
        }
    }

    // 4. Render Experiments List strictly for this Subject
    state.currentExperiments = res.data || [];
    state.activeFilter = 'all';

    // Reset filter buttons
    document.querySelectorAll('.exp-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === 'all');
    });

    renderFilteredExperiments();
}

window.filterExperiments = function(filter) {
    state.activeFilter = filter;
    document.querySelectorAll('.exp-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });
    renderFilteredExperiments();
};

function renderFilteredExperiments() {
    const container = document.getElementById('experimentsContainer');
    if (!container) return;

    let list = state.currentExperiments || [];
    const filter = state.activeFilter || 'all';

    if (filter === 'available') {
        list = list.filter(e => e.studentStatus === 'Test Available' || e.canAttempt);
    } else if (filter === 'passed') {
        list = list.filter(e => e.studentStatus === 'Passed' || e.studentStatus === 'Ready for Components' || e.studentStatus === 'Completed' || e.studentStatus === 'In Lab Session');
    }

    if (list.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); padding: 2rem;">No experiments match the "${escapeHtml(filter)}" filter.</p>`;
        return;
    }

    container.innerHTML = list.map(exp => {
        let badgeClass = 'not-started';
        if (exp.studentStatus === 'Test Available') badgeClass = 'test-available';
        if (exp.studentStatus === 'Test In Progress') badgeClass = 'test-in-progress';
        if (exp.studentStatus === 'Passed') badgeClass = 'passed';
        if (exp.studentStatus.includes('Failed')) badgeClass = 'failed';
        if (exp.studentStatus === 'Ready for Components' || exp.studentStatus === 'In Lab Session') badgeClass = 'ready-components';
        if (exp.studentStatus === 'Completed') badgeClass = 'completed';

        let actionBtnText = 'View Details';
        let actionBtnClass = 'secondary-btn';
        if (exp.canAttempt) {
            actionBtnText = 'Open Experiment →';
            actionBtnClass = 'primary-btn';
        } else if (exp.studentStatus === 'Ready for Components' || exp.studentStatus === 'Passed') {
            actionBtnText = 'View Components →';
            actionBtnClass = 'primary-btn';
        }

        return `
            <div class="experiment-card">
                <div class="exp-main-info">
                    <div class="exp-meta-line">
                        <span class="exp-num-badge">${escapeHtml(exp.experimentNumber)}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(exp.laboratory)}</span>
                    </div>
                    <h3 class="exp-title">${escapeHtml(exp.title)}</h3>
                    <p class="exp-desc">${escapeHtml(exp.description)}</p>
                    <div class="exp-tags-row">
                        <span class="exp-tag">⏱ Duration: ${exp.testDurationMinutes} mins</span>
                        <span class="exp-tag">🎯 Pass Mark: ${exp.passMark} / ${exp.totalMarks}</span>
                        <span class="exp-tag">📦 Components: ${exp.componentsCount}</span>
                        ${exp.attemptsCount > 0 ? `<span class="exp-tag">📝 Attempts: ${exp.attemptsCount}</span>` : ''}
                    </div>
                </div>
                <div class="exp-actions">
                    <span class="badge-status ${badgeClass}">${escapeHtml(exp.studentStatus)}</span>
                    ${exp.manual && exp.manual.fileUrl ? `
                        <a href="${exp.manual.fileUrl}" target="_blank" rel="noopener noreferrer" class="secondary-btn" style="padding: 0.5rem 0.9rem; font-size: 0.82rem; text-decoration: none;" title="Open Lab Manual for this Experiment">
                            📄 Manual
                        </a>
                    ` : ''}
                    <button class="${actionBtnClass}" onclick="openExperimentIntroduction('${escapeHtml(exp.experimentNumber)}')">
                        ${actionBtnText}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 5. EXPERIMENT INTRODUCTION & CONFIRMATION
// ==========================================
window.openExperimentIntroduction = async function(expNumber) {
    state.selectedExperiment = expNumber;
    const res = await studentFetch(`/experiments/${expNumber}`);
    if (!res.success || !res.data) {
        showToast(res.message || 'Failed to load experiment introduction', 'error');
        return;
    }

    const exp = res.data;

    // Switch to intro section view
    document.getElementById('introSubject').textContent = exp.subject;
    document.getElementById('introExpNum').textContent = exp.experimentNumber;
    document.getElementById('introTitle').textContent = exp.title;
    document.getElementById('introDesc').textContent = exp.description;
    document.getElementById('introLab').textContent = exp.laboratory;
    document.getElementById('introDuration').textContent = `${exp.examConfig.testDurationMinutes} Minutes`;
    document.getElementById('introMarks').textContent = `${exp.examConfig.totalMarks} Marks`;
    document.getElementById('introPassMark').textContent = `${exp.examConfig.passMark} / ${exp.examConfig.totalMarks}`;

    // Objectives List
    const objList = document.getElementById('introObjectivesList');
    if (objList) {
        objList.innerHTML = (exp.objectives || []).map(o => `<li>${escapeHtml(o)}</li>`).join('') || '<li>No specific objectives listed</li>';
    }

    // Instructions
    const instrEl = document.getElementById('introInstructions');
    if (instrEl) instrEl.textContent = exp.instructions || 'Follow safety protocols and verify circuit connections.';

    // Lab Manual Download/View Button
    const manualBtn = document.getElementById('introManualBtn');
    if (manualBtn) {
        if (exp.manual && exp.manual.fileUrl) {
            manualBtn.href = exp.manual.fileUrl;
            manualBtn.style.display = 'inline-flex';
            manualBtn.textContent = `📄 Download Lab Manual (${exp.manual.fileName})`;
        } else {
            manualBtn.style.display = 'none';
        }
    }

    // Required Components List
    const compList = document.getElementById('introComponentsList');
    if (compList) {
        compList.innerHTML = (exp.requiredComponents || []).map(c => `
            <li><strong>${escapeHtml(c.componentName)}</strong> (${escapeHtml(c.partNumber || 'GEN')}) — Required: ${c.quantity} unit(s) ${c.notes ? `[${escapeHtml(c.notes)}]` : ''}</li>
        `).join('') || '<li>No physical components required</li>';
    }

    // Action button status
    const readyExamBtn = document.getElementById('readyExamBtn');
    const introStatusNotice = document.getElementById('introStatusNotice');
    if (readyExamBtn) {
        readyExamBtn.style.display = 'inline-flex';
        if (exp.eligibility.alreadyPassed) {
            readyExamBtn.textContent = 'Retake Assessment →';
            if (introStatusNotice) {
                introStatusNotice.innerHTML = `
                    <div style="background: var(--success-bg); border: 1px solid var(--success-border); color: #10b981; padding: 12px; border-radius: 8px; margin-top: 1rem; font-size: 0.9rem;">
                        ✓ You previously completed this assessment! You can re-take it now to test your knowledge or proceed to Component Requirements.
                    </div>
                `;
            }
        } else if (!exp.eligibility.canStartTest) {
            readyExamBtn.style.display = 'none';
            if (introStatusNotice) {
                introStatusNotice.innerHTML = `
                    <div style="background: var(--danger-bg); border: 1px solid var(--danger-border); color: #ef4444; padding: 12px; border-radius: 8px; margin-top: 1rem;">
                        ✗ No test questions published for this experiment yet.
                    </div>
                `;
            }
        } else {
            readyExamBtn.textContent = 'Ready for the Exam →';
            if (introStatusNotice) introStatusNotice.innerHTML = '';
        }
    }

    switchTab('intro');
};

// Ready for Exam -> Open Confirmation Modal
window.confirmStartExam = function() {
    const modal = document.getElementById('examConfirmModal');
    if (modal) modal.classList.add('active');
};

window.closeConfirmModal = function() {
    const modal = document.getElementById('examConfirmModal');
    if (modal) modal.classList.remove('active');
};

// ==========================================
// 6. AI-ASSISTED ONLINE EXAM ENGINE
// ==========================================
window.startExamSession = async function() {
    closeConfirmModal();
    const enableCamera = document.getElementById('modalCameraCheck')?.checked ?? true;

    // Call server to start exam session
    const res = await studentFetch('/exams/start', {
        method: 'POST',
        body: JSON.stringify({
            experimentNumber: state.selectedExperiment,
            cameraEnabled: enableCamera
        })
    });

    if (!res.success || !res.data) {
        showToast(res.message || 'Cannot start exam session.', 'error');
        return;
    }

    state.activeExam = res.data;
    state.examAnswers = {};
    state.currentQuestionIndex = 0;
    state.examWarningCount = 0;
    state.isEjecting = false;

    // Switch to Exam HUD
    switchTab('exam');

    // Populate Exam Information
    document.getElementById('examExpTitle').textContent = `${res.data.experimentNumber}: ${res.data.experimentTitle}`;
    document.getElementById('examPassMarkInfo').textContent = `Pass: ${res.data.passMark}/${res.data.totalMarks} marks`;
    document.getElementById('examWarningCounter').textContent = `0/${res.data.maxViolationsBeforeSubmit}`;

    // Render Question Palette
    renderQuestionPalette();

    // Render First Question
    renderCurrentQuestion();

    // Start Countdown Timer
    startExamTimer(res.data.testDurationMinutes);

    // Initialize Anti-Cheating Listeners
    initExamIntegrityListeners();

    // Initialize Camera Monitoring if enabled
    if (enableCamera) {
        initCameraMonitoring();
    } else {
        const cameraBox = document.getElementById('cameraVideo');
        if (cameraBox) cameraBox.style.display = 'none';
        const fallback = document.getElementById('cameraFallback');
        if (fallback) {
            fallback.style.display = 'flex';
            fallback.innerHTML = `<span style="color: var(--text-muted);">Camera monitoring not requested</span>`;
        }
    }

    showToast('Assessment started. Focus inside this exam window.', 'info');
};

function renderQuestionPalette() {
    const palette = document.getElementById('questionPalette');
    if (!palette || !state.activeExam) return;

    palette.innerHTML = state.activeExam.questions.map((q, idx) => {
        const isAnswered = state.examAnswers[idx] !== undefined;
        const isActive = idx === state.currentQuestionIndex;
        return `
            <button class="palette-btn ${isActive ? 'active' : ''} ${isAnswered ? 'answered' : ''}" onclick="goToQuestion(${idx})">
                ${idx + 1}
            </button>
        `;
    }).join('');
}

function renderCurrentQuestion() {
    if (!state.activeExam) return;
    const q = state.activeExam.questions[state.currentQuestionIndex];
    if (!q) return;

    // Question number & progress
    document.getElementById('examQuestionNum').textContent = `Question ${state.currentQuestionIndex + 1} of ${state.activeExam.questions.length}`;
    const progressPercent = ((state.currentQuestionIndex + 1) / state.activeExam.questions.length) * 100;
    const progressFill = document.getElementById('examProgressFill');
    if (progressFill) progressFill.style.width = `${progressPercent}%`;

    // Question text
    document.getElementById('examQuestionText').textContent = q.questionText;

    // Question Options
    const optionsContainer = document.getElementById('examOptionsContainer');
    const selectedOpt = state.examAnswers[state.currentQuestionIndex];

    optionsContainer.innerHTML = q.options.map((optText, optIdx) => `
        <div class="option-item ${selectedOpt === optIdx ? 'selected' : ''}" onclick="selectExamOption(${optIdx})">
            <span class="option-circle"></span>
            <span class="option-text">${escapeHtml(optText)}</span>
        </div>
    `).join('');

    // Update buttons
    const prevBtn = document.getElementById('examPrevBtn');
    const nextBtn = document.getElementById('examNextBtn');
    const submitBtn = document.getElementById('examSubmitBtn');

    if (prevBtn) prevBtn.disabled = state.currentQuestionIndex === 0;
    if (nextBtn) {
        nextBtn.style.display = (state.currentQuestionIndex === state.activeExam.questions.length - 1) ? 'none' : 'inline-flex';
    }
    if (submitBtn) {
        submitBtn.style.display = (state.currentQuestionIndex === state.activeExam.questions.length - 1) ? 'inline-flex' : 'none';
    }

    renderQuestionPalette();
}

window.selectExamOption = function(optionIndex) {
    state.examAnswers[state.currentQuestionIndex] = optionIndex;
    renderCurrentQuestion();
};

window.examNextQuestion = function() {
    if (!state.activeExam) return;
    if (state.currentQuestionIndex < state.activeExam.questions.length - 1) {
        state.currentQuestionIndex++;
        renderCurrentQuestion();
    }
};

window.examPrevQuestion = function() {
    if (state.currentQuestionIndex > 0) {
        state.currentQuestionIndex--;
        renderCurrentQuestion();
    }
};

window.goToQuestion = function(index) {
    if (!state.activeExam) return;
    state.currentQuestionIndex = index;
    renderCurrentQuestion();
};

// Countdown Timer
function startExamTimer(durationMinutes) {
    let remainingSeconds = durationMinutes * 60;
    const timerDisplay = document.getElementById('examTimerDisplay');

    clearInterval(state.examTimerInterval);
    state.examTimerInterval = setInterval(() => {
        remainingSeconds--;

        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (timerDisplay) {
            timerDisplay.textContent = formatted;
            if (remainingSeconds <= 60) {
                timerDisplay.classList.add('low-time');
            } else {
                timerDisplay.classList.remove('low-time');
            }
        }

        if (remainingSeconds <= 0) {
            clearInterval(state.examTimerInterval);
            showToast('Time expired! Automatically submitting your assessment...', 'warning');
            submitExam(true);
        }
    }, 1000);
}

// Submit Exam Server-Side
window.submitExam = async function(isAutoSubmit = false) {
    if (!state.activeExam) return;

    if (!isAutoSubmit) {
        const answeredCount = Object.keys(state.examAnswers).length;
        const total = state.activeExam.questions.length;
        const confirmSub = confirm(`You have answered ${answeredCount} of ${total} questions. Are you ready to submit your exam?`);
        if (!confirmSub) return;
    }

    // Capture final exam submission snapshot before closing stream
    try {
        await captureAndUploadSnapshot('submit', 'Final Exam Submission Photo');
    } catch (e) {}

    clearInterval(state.examTimerInterval);
    stopExamMonitoring();

    // Format answers array
    const formattedAnswers = Object.entries(state.examAnswers).map(([qIdx, optIdx]) => ({
        questionIndex: parseInt(qIdx, 10),
        selectedOptionIndex: optIdx
    }));

    const res = await studentFetch('/exams/submit', {
        method: 'POST',
        body: JSON.stringify({
            attemptId: state.activeExam.attemptId,
            answers: formattedAnswers
        })
    });

    state.activeExam = null;

    if (!res.success || !res.data) {
        showToast(res.message || 'Submission failed.', 'error');
        switchTab('dashboard');
        return;
    }

    // Display Result View
    renderExamResult(res.data);
};

function renderExamResult(data) {
    const card = document.getElementById('examResultCard');
    if (!card) return;

    card.className = `result-card ${data.passed ? 'passed' : 'failed'}`;

    const icon = document.getElementById('resultIcon');
    const title = document.getElementById('resultTitle');
    const subtitle = document.getElementById('resultSubtitle');
    const scoreVal = document.getElementById('resScoreVal');
    const passMarkVal = document.getElementById('resPassMarkVal');
    const warningsVal = document.getElementById('resWarningsVal');
    const nextActionBtn = document.getElementById('resultNextActionBtn');

    if (icon) icon.innerHTML = data.passed ? '✓' : '✗';
    if (title) title.textContent = data.passed ? 'Assessment Passed!' : 'Assessment Not Cleared';
    if (subtitle) subtitle.textContent = data.passed
        ? 'Congratulations! You have satisfied the pre-lab assessment criteria.'
        : 'You did not meet the required passing mark for this experiment.';

    if (scoreVal) scoreVal.textContent = `${data.score} / ${data.totalMarks}`;
    if (passMarkVal) passMarkVal.textContent = `${data.passMark}`;
    if (warningsVal) warningsVal.textContent = `${data.warningCount || 0}`;

    if (nextActionBtn) {
        if (data.passed) {
            nextActionBtn.textContent = 'View Components →';
            nextActionBtn.onclick = () => {
                switchTab('components');
            };
        } else {
            nextActionBtn.textContent = 'Return to Experiments';
            nextActionBtn.onclick = () => {
                switchTab('experiments');
            };
        }
    }

    switchTab('result');
}

// ==========================================
// 7. ANTI-CHEATING & BROWSER EVENT MONITORING
// ==========================================
function initExamIntegrityListeners() {
    // Visibility change (tab switching)
    document.addEventListener('visibilitychange', onExamVisibilityChange);

    // Window blur
    window.addEventListener('blur', onExamWindowBlur);

    // Prevent copy, cut, paste, and right click inside exam
    window.addEventListener('copy', preventExamCopy);
    window.addEventListener('paste', preventExamPaste);
    window.addEventListener('contextmenu', preventExamContextMenu);
}

function stopExamMonitoring() {
    document.removeEventListener('visibilitychange', onExamVisibilityChange);
    window.removeEventListener('blur', onExamWindowBlur);
    window.removeEventListener('copy', preventExamCopy);
    window.removeEventListener('paste', preventExamPaste);
    window.removeEventListener('contextmenu', preventExamContextMenu);

    if (state.snapshotInterval) {
        clearInterval(state.snapshotInterval);
        state.snapshotInterval = null;
    }

    if (state.cameraMonitoringInterval) {
        clearInterval(state.cameraMonitoringInterval);
        state.cameraMonitoringInterval = null;
    }

    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
    }
}

function onExamVisibilityChange() {
    if (!state.activeExam) return;
    if (document.hidden) {
        recordExamIntegrityEvent('tab_switch', 'Browser tab switched away or minimized', 1.0);
    }
}

function onExamWindowBlur() {
    if (!state.activeExam) return;
    recordExamIntegrityEvent('window_blur', 'Exam window lost focus', 0.9);
}

function preventExamCopy(e) {
    if (!state.activeExam) return;
    e.preventDefault();
    recordExamIntegrityEvent('copy_attempt', 'Clipboard copy attempted during exam', 1.0);
}

function preventExamPaste(e) {
    if (!state.activeExam) return;
    e.preventDefault();
}

function preventExamContextMenu(e) {
    if (!state.activeExam) return;
    e.preventDefault();
}

async function recordExamIntegrityEvent(eventType, details, confidence) {
    if (!state.activeExam) return;

    // Immediately capture violation evidence snapshot
    try {
        captureAndUploadSnapshot('warning', `Integrity Flag: ${eventType}`);
    } catch (e) {}

    const res = await studentFetch('/exams/event', {
        method: 'POST',
        body: JSON.stringify({
            attemptId: state.activeExam.attemptId,
            eventType,
            details,
            confidence
        })
    });

    if (res.success) {
        state.examWarningCount = res.warningCount || state.examWarningCount + 1;
        const warningEl = document.getElementById('examWarningCounter');
        if (warningEl && state.activeExam) {
            warningEl.textContent = `${state.examWarningCount}/${state.activeExam.maxViolationsBeforeSubmit}`;
        }

        if (res.action === 'terminate') {
            showToast(res.message, 'error');
            alert(res.message);
            submitExam(true);
        } else if (res.action === 'warning') {
            showToast(res.message, 'warning');
        }
    }
}

// ==========================================
// 8. CAMERA-BASED MONITORING (ON-DEVICE)
// ==========================================
// Transparent on-device camera presence monitoring. Does not transmit video feeds to cloud services.
let globalCocoModel = null;
async function loadAiPhoneModel() {
    if (globalCocoModel) return globalCocoModel;
    if (window.cocoSsd) {
        try {
            globalCocoModel = await window.cocoSsd.load();
            console.log('✅ COCO-SSD Model Loaded for Exam Proctoring');
            return globalCocoModel;
        } catch (err) {
            console.warn('Failed to load COCO-SSD:', err);
        }
    }
    return null;
}

let globalBlazeModel = null;
async function loadBlazeFaceModel() {
    if (globalBlazeModel) return globalBlazeModel;
    if (window.blazeface) {
        try {
            globalBlazeModel = await window.blazeface.load();
            console.log('✅ BlazeFace Model Loaded for Face Presence Verification');
            return globalBlazeModel;
        } catch (err) {
            console.warn('Failed to load BlazeFace:', err);
        }
    }
    return null;
}

// Transparent on-device camera presence, face verification & mobile phone detection
async function initCameraMonitoring() {
    const video = document.getElementById('cameraVideo');
    const overlayCanvas = document.getElementById('cameraCanvas');
    const statusText = document.getElementById('cameraStatusText');
    const phoneDot = document.getElementById('phoneStatusDot');
    const phoneLabel = document.getElementById('phoneStatusLabel');
    const faceDot = document.getElementById('faceStatusDot');
    const faceLabel = document.getElementById('faceStatusLabel');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
            audio: false
        });

        state.cameraStream = stream;
        if (video) {
            video.srcObject = stream;
            video.play();
            video.style.display = 'block';
        }

        if (statusText) statusText.textContent = 'Loading AI Models...';

        // Load TensorFlow COCO-SSD and BlazeFace models
        const [cocoModel, blazeModel] = await Promise.all([
            loadAiPhoneModel(),
            loadBlazeFaceModel()
        ]);

        if (statusText) statusText.textContent = 'Active (Face & Phone AI)';
        if (phoneDot) phoneDot.style.background = '#10b981';
        if (phoneLabel) phoneLabel.innerHTML = 'Phone Detection: <strong style="color: #10b981;">Active</strong>';
        if (faceDot) faceDot.style.background = '#10b981';
        if (faceLabel) faceLabel.innerHTML = 'Face Presence: <strong style="color: #10b981;">Verified</strong>';

        // Initialize snapshot counter
        state.uploadedSnapshotsCount = 0;
        const snapCounterEl = document.getElementById('snapshotUploadCounter');
        if (snapCounterEl) snapCounterEl.textContent = '0 uploaded';

        // 1. Initial Identity Snapshot (captured at 2.5s once camera settles)
        setTimeout(() => {
            if (state.activeExam && !state.isEjecting && !state.isSuspended) {
                captureAndUploadSnapshot('start', 'Exam Start Identity Capture');
            }
        }, 2500);

        // 2. Periodic Proctoring Snapshots every 25 seconds
        if (state.snapshotInterval) clearInterval(state.snapshotInterval);
        state.snapshotInterval = setInterval(() => {
            if (state.activeExam && !state.isEjecting && !state.isSuspended) {
                captureAndUploadSnapshot('periodic', 'Periodic Proctoring Capture');
            }
        }, 25000);

        // Continuous local frame analysis every 500ms
        state.cameraMonitoringInterval = setInterval(async () => {
            if (!state.activeExam || state.isEjecting || state.isSuspended || !video || video.readyState < 2) return;

            try {
                // Adjust canvas resolution
                if (overlayCanvas) {
                    if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
                        overlayCanvas.width = video.videoWidth || 320;
                        overlayCanvas.height = video.videoHeight || 240;
                    }
                }

                const ctx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
                if (ctx) ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

                // --- 1. PHONE DETECTION (COCO-SSD) ---
                if (cocoModel) {
                    const predictions = await cocoModel.detect(video);
                    for (const p of predictions) {
                        const className = p.class.toLowerCase();
                        if (className === 'cell phone' || className === 'remote' || className === 'telephone') {
                            if (p.score >= 0.35) {
                                if (ctx) {
                                    const [x, y, w, h] = p.bbox;
                                    ctx.strokeStyle = '#ef4444';
                                    ctx.lineWidth = 3;
                                    ctx.strokeRect(x, y, w, h);
                                }
                                triggerPhoneDetectionEjection(p.class, p.score);
                                return;
                            }
                        }
                    }
                }

                // --- 2. FACE PRESENCE DETECTION (BlazeFace) ---
                if (blazeModel) {
                    const faces = await blazeModel.estimateFaces(video, false);
                    const facePresent = faces && faces.length > 0;

                    if (faceDot) faceDot.style.background = facePresent ? '#10b981' : '#f59e0b';
                    if (faceLabel) faceLabel.innerHTML = facePresent
                        ? 'Face Presence: <strong style="color: #10b981;">Verified</strong>'
                        : 'Face Presence: <strong style="color: #f59e0b;">Not Detected</strong>';

                    if (facePresent && ctx) {
                        const face = faces[0];
                        const [x1, y1] = face.topLeft;
                        const [x2, y2] = face.bottomRight;
                        const faceH = y2 - y1;
                        const faceW = x2 - x1;

                        ctx.strokeStyle = '#10b981';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x1, y1, faceW, faceH);

                        const label = 'Examinee Verified';
                        ctx.fillStyle = '#10b981';
                        ctx.font = 'bold 10px Inter, sans-serif';
                        ctx.fillRect(x1, Math.max(0, y1 - 16), ctx.measureText(label).width + 8, 16);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(label, x1 + 4, Math.max(12, y1 - 4));
                    }
                }

            } catch (cvErr) {
                console.warn('Frame analysis cycle notice:', cvErr);
            }
        }, 500);

    } catch (camErr) {
        console.warn('Camera access error:', camErr);
        if (statusText) statusText.textContent = 'Unavailable';
        const fallback = document.getElementById('cameraFallback');
        if (fallback) {
            fallback.style.display = 'flex';
            fallback.innerHTML = `<span style="color: var(--danger); font-size: 0.75rem;">Camera permission denied or camera not connected</span>`;
        }
        showToast('Camera access denied. Assessment will continue with browser event monitoring only.', 'warning');
    }
}


// ==========================================
// 8.5. REAL-TIME PROCTORING SNAPSHOT SYSTEM
// ==========================================
window.captureAndUploadSnapshot = async function(trigger = 'periodic', label = 'Proctoring Snapshot') {
    if (!state.activeExam) return;
    const video = document.getElementById('cameraVideo');
    if (!video || video.readyState < 2) return;

    try {
        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = video.videoWidth || 320;
        snapCanvas.height = video.videoHeight || 240;
        const sCtx = snapCanvas.getContext('2d');
        sCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);

        const imageBase64 = snapCanvas.toDataURL('image/jpeg', 0.72);

        const res = await studentFetch('/exams/snapshot', {
            method: 'POST',
            body: JSON.stringify({
                attemptId: state.activeExam.attemptId,
                imageBase64,
                trigger,
                label
            })
        });

        if (res.success) {
            state.uploadedSnapshotsCount = res.snapshotCount || (state.uploadedSnapshotsCount + 1);
            const counterEl = document.getElementById('snapshotUploadCounter');
            if (counterEl) {
                counterEl.textContent = `${state.uploadedSnapshotsCount} uploaded`;
            }
            const dot = document.getElementById('snapshotStatusDot');
            if (dot) {
                dot.style.transform = 'scale(1.5)';
                setTimeout(() => { if (dot) dot.style.transform = 'scale(1)'; }, 350);
            }
            console.log(`📸 Proctoring photo uploaded (#${state.uploadedSnapshotsCount}):`, res.imageUrl);
        }
    } catch (err) {
        console.warn('Snapshot upload notice:', err);
    }
};

window.triggerManualSnapshotUpload = async function() {
    if (!state.activeExam) {
        showToast('Please start an exam session first to capture snapshots.', 'warning');
        return;
    }
    showToast('Capturing and uploading proctoring photo...', 'info');
    await captureAndUploadSnapshot('manual', 'Manual Verification Snapshot');
    showToast(`✓ Proctoring photo #${state.uploadedSnapshotsCount} saved to server!`, 'success');
};

// ==========================================
// 9. INSTANT PHONE DETECTION EJECTION SYSTEM
// ==========================================
window.triggerPhoneDetectionEjection = async function(deviceType = 'cell phone', confidence = 0.95) {
    if (state.isEjecting) return;
    state.isEjecting = true;

    // 1. Terminate local timers immediately
    clearInterval(state.examTimerInterval);
    if (state.cameraMonitoringInterval) {
        clearInterval(state.cameraMonitoringInterval);
        state.cameraMonitoringInterval = null;
    }

    // 2. Play warning alert tone
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}

    // 3. Stop camera hardware immediately
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
        state.cameraStream = null;
    }

    // 4. Report termination event to server
    try {
        if (state.activeExam) {
            await studentFetch('/exams/event', {
                method: 'POST',
                body: JSON.stringify({
                    attemptId: state.activeExam.attemptId,
                    eventType: 'phone_detected',
                    details: `Unauthorized ${deviceType} detected in live camera feed (${Math.round(confidence * 100)}% confidence)`,
                    confidence
                })
            });
        }
    } catch (err) {
        console.error('Failed to notify server of phone ejection:', err);
    }

    // 5. Display critical fullscreen ejection modal
    const overlay = document.getElementById('phoneAlertOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }

    // 6. 3-second countdown to exit the website completely
    let secondsLeft = 3;
    const countdownEl = document.getElementById('phoneCountdownText');
    const ejectionInterval = setInterval(() => {
        secondsLeft--;
        if (countdownEl) {
            countdownEl.textContent = `Exiting website in ${secondsLeft} seconds...`;
        }
        if (secondsLeft <= 0) {
            clearInterval(ejectionInterval);
            // Clear student session and exit portal
            localStorage.removeItem('studentUser');
            localStorage.removeItem('studentToken');
            sessionStorage.clear();
            window.location.href = 'index.html?ejected=phone_detected';
        }
    }, 1000);
};

// Simulation trigger for testing without holding a physical phone
window.simulatePhoneDetection = function() {
    if (!state.activeExam) {
        showToast('Please start an exam session first before simulating phone detection.', 'warning');
        return;
    }
    triggerPhoneDetectionEjection('Smartphone (Simulation)', 0.99);
};





// ==========================================
// 10. COMPONENT REQUIREMENTS VIEW
// ==========================================
async function loadComponentsView() {
    const expNum = state.selectedExperiment || 'EXP-01';
    const titleEl = document.getElementById('compExpTitle');
    if (titleEl) titleEl.textContent = `${expNum} Component Requirements`;

    const res = await studentFetch(`/components/${expNum}`);
    const grid = document.getElementById('componentRequirementsGrid');
    const issueStatusTag = document.getElementById('compIssueStatusTag');

    if (!grid) return;

    if (!res.success || !res.data) {
        grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">No component requirements found for ${escapeHtml(expNum)}.</p>`;
        return;
    }

    const d = res.data;
    if (issueStatusTag) {
        issueStatusTag.textContent = d.issueStatus || (d.allowedPractical ? 'Authorized for Components' : 'Assessment Required');
        issueStatusTag.className = `badge-status ${d.issueStatus === 'Components Issued' ? 'passed' : (d.allowedPractical ? 'passed' : 'failed')}`;
    }

    // Practical Allowance Banner
    let bannerHtml = '';
    if (!d.allowedPractical) {
        bannerHtml = `
            <div class="practical-access-banner locked" style="grid-column: 1/-1; margin-bottom: 1.5rem;">
                <div class="banner-status-icon">🔒</div>
                <div>
                    <div class="banner-title locked">Practical Session & Hardware Issuance Locked</div>
                    <div class="banner-sub">
                        Pass the pre-lab assessment for this experiment to unlock the practical session and hardware issuance.
                    </div>
                </div>
            </div>
        `;
    } else {
        bannerHtml = `
            <div class="practical-access-banner allowed" style="grid-column: 1/-1; margin-bottom: 1.5rem;">
                <div class="banner-status-icon">✅</div>
                <div>
                    <div class="banner-title allowed">Practical Session & Components Allowed</div>
                    <div class="banner-sub">
                        Pre-lab assessment passed! You are authorized for practical session & hardware component issuance at the workbench.
                    </div>
                </div>
            </div>
        `;
    }

    if (!d.components || d.components.length === 0) {
        grid.innerHTML = bannerHtml + `
            <div style="grid-column: 1/-1; text-align: center; padding: 2.5rem 1rem; background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border-light);">
                <div style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.7;">📦</div>
                <h4 style="color: var(--text-white); margin-bottom: 0.25rem;">No components extracted yet</h4>
                <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 400px; margin: 0 auto;">
                    Hardware apparatus has not yet been processed for this experiment, or practical is entirely software-based.
                </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = bannerHtml + d.components.map(c => {
        const hasSpec = c.specifications && c.specifications.trim() && c.specifications !== 'Lab manual standard apparatus';
        const hasSafety = c.safetyPrecautions && c.safetyPrecautions.trim();

        return `
        <div class="comp-card">
            <div>
                <div class="comp-card-top">
                    <h4 class="comp-name">${escapeHtml(c.componentName)}</h4>
                    <span class="comp-part-tag">${escapeHtml(c.partNumber)}</span>
                </div>
                <div class="comp-quantities">
                    <div>Required: <strong style="color: var(--text-white);">${c.requiredQuantity} units</strong></div>
                    <div>Stock: <strong style="color: #10b981;">${c.availableQuantity}</strong></div>
                    <div>Rack: <strong>${escapeHtml(c.storageLocation)}</strong></div>
                </div>
                ${hasSpec ? `
                <div class="comp-spec-box">
                    <strong>Specifications:</strong> ${escapeHtml(c.specifications)}
                </div>` : ''}
            </div>
            ${hasSafety ? `
            <div class="comp-safety-box">
                <span>⚠️</span>
                <span><strong>Safety Precautions:</strong> ${escapeHtml(c.safetyPrecautions)}</span>
            </div>` : ''}
        </div>
        `;
    }).join('');
}

// ==========================================
// 11. MY TESTS & LAB HISTORY
// ==========================================
async function loadMyTests() {
    await loadLabHistory();
}

async function loadLabHistory() {
    const res = await studentFetch('/history');
    const list = document.getElementById('historyTimelineList');
    if (!list) return;

    if (!res.success || !res.data || res.data.length === 0) {
        list.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No experiment assessment or lab history recorded yet.</p>`;
        return;
    }

    list.innerHTML = res.data.map(h => `
        <div class="history-card">
            <div class="history-header">
                <div>
                    <h3 style="font-size: 1.1rem; color: var(--text-white); font-weight: 700;">
                        ${escapeHtml(h.experimentNumber)} — ${escapeHtml(h.subject)}
                    </h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Attempt ID: ${escapeHtml(h.attemptId)} • Attempt #${h.attemptNumber}</p>
                </div>
                <span class="badge-status ${h.passed ? 'passed' : 'failed'}">
                    ${h.passed ? '✓ Passed' : '✗ Failed'}
                </span>
            </div>
            <div class="history-grid-details">
                <div class="h-cell">
                    <span class="h-lbl">Score Obtained</span>
                    <p class="h-val" style="color: ${h.passed ? '#10b981' : '#ef4444'};">${h.score} / ${h.totalMarks} (Pass: ${h.passMark})</p>
                </div>
                <div class="h-cell">
                    <span class="h-lbl">Test Duration</span>
                    <p class="h-val">${h.durationSeconds ? `${Math.floor(h.durationSeconds / 60)}m ${h.durationSeconds % 60}s` : 'N/A'}</p>
                </div>
                <div class="h-cell">
                    <span class="h-lbl">Practical Access</span>
                    <p class="h-val" style="color: ${h.passed ? '#10b981' : '#f59e0b'};">${h.passed ? 'Unlocked ✓' : 'Assessment Required'}</p>
                </div>
                <div class="h-cell">
                    <span class="h-lbl">Components Issued</span>
                    <p class="h-val">${h.componentsIssuedTime ? formatDate(h.componentsIssuedTime) : 'Pending'}</p>
                </div>
                <div class="h-cell">
                    <span class="h-lbl">Session Status</span>
                    <p class="h-val">${escapeHtml(h.sessionStatus)}</p>
                </div>
                <div class="h-cell">
                    <span class="h-lbl">Inspection Outcome</span>
                    <p class="h-val">${escapeHtml(h.inspectionOutcome)}</p>
                </div>
            </div>
            ${h.snapshots && h.snapshots.length > 0 ? `
                <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.8rem;">
                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--purple-light);">📸 Proctoring Snapshots (${h.snapshots.length}):</span>
                    <div style="display: flex; gap: 8px; overflow-x: auto; margin-top: 6px; padding-bottom: 4px;">
                        ${h.snapshots.map(s => `
                            <div style="flex-shrink: 0; text-align: center;">
                                <a href="${s.imageUrl}" target="_blank" title="View Full Snapshot">
                                    <img src="${s.imageUrl}" style="width: 72px; height: 54px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(133, 85, 232, 0.4);" alt="Proctoring Photo">
                                </a>
                                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">${formatDate(s.timestamp)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// ==========================================
// 12. UTILITY HELPERS
// ==========================================
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `student-toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠️' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}
