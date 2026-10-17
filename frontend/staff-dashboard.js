/* ==========================================================================
   Staff Control Panel - Enterprise JavaScript Controller
   ========================================================================== */

const API_BASE = '/api/staff';

// Current active session state
let currentStaffUser = 'staff_admin';
let cachedExperiments = [];
let cachedGroups = [];
let cachedSessions = [];

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    // 1. Verify Staff Authorization
    const role = localStorage.getItem('role');
    const storedUser = localStorage.getItem('username');

    if (role !== 'staff') {
        // If not authenticated as staff, redirect back to login
        console.warn('Unauthorized access: User role is not staff. Redirecting...');
        // For testing convenience, if someone opens directly, allow staff_admin fallback or redirect
        if (!storedUser || role !== 'staff') {
            window.location.href = 'index.html';
            return;
        }
    }

    currentStaffUser = storedUser || 'staff_admin';
    document.getElementById('sidebarUsername').textContent = currentStaffUser;
    document.getElementById('sidebarAvatar').textContent = currentStaffUser.charAt(0).toUpperCase();
    if (document.getElementById('settingsStaffName')) {
        document.getElementById('settingsStaffName').value = currentStaffUser;
    }

    // 2. Setup Navigation Event Listeners
    setupSidebarNavigation();

    // 3. Load Initial Dashboard Metrics
    loadDashboardMetrics();

    // 4. Setup Global Search and Filters
    setupSearchAndFilters();

    // 5. Logout Listener
    document.getElementById('btnLogout').addEventListener('click', handleLogout);

    // 6. Mobile Menu Toggle
    const mobileToggle = document.getElementById('btnToggleMobileMenu');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('mobile-open');
        });
    }

    // 7. Setup Drag and Drop File Upload Listeners
    setupDropzones();
});

// Headers with staff authorization
function getAuthHeaders(isJson = true) {
    const headers = {
        'x-staff-user': currentStaffUser
    };
    if (isJson) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

// ==========================================================================
// Navigation & Tab Switching
// ==========================================================================
const TAB_TITLES = {
    dashboard: { title: 'Dashboard Overview', sub: 'Monitor active lab sessions, inventory, and experiment handovers' },
    experiments: { title: 'Experiment Management', sub: 'Configure curriculum experiments, objectives, and component lists' },
    manuals: { title: 'Lab Manual Management', sub: 'Upload and publish official PDF lab guides for student groups' },
    questions: { title: 'Question Bank Management', sub: 'Configure pre-lab test MCQs, test durations, and passing standards' },
    groups: { title: 'Student Groups Directory', sub: 'View registered student groups, test results, and lab session eligibility' },
    sessions: { title: 'Lab Session Monitoring', sub: 'Real-time lifecycle monitoring of active laboratory experiments' },
    inventory: { title: 'Component Inventory Management', sub: 'Track electronic parts, available quantities, and storage locations' },
    issues: { title: 'Component Handover Records', sub: 'Handover records for eligible student groups who passed the pre-lab test' },
    returns: { title: 'Component Return & Inspection', sub: 'Inspect returned components, verify functional integrity, and restock' },
    reports: { title: 'Enterprise Reports & Audit', sub: 'Analytical usage reports and downloadable CSV audit archives' },
    settings: { title: 'Laboratory System Settings', sub: 'Manage lab defaults, safety guidelines, and active staff profile' }
};

function setupSidebarNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = item.getAttribute('data-tab');
            switchTab(tab);
        });
    });
}

function switchTab(tabId) {
    // Update sidebar active classes
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }

    // Update Topbar Title
    if (TAB_TITLES[tabId]) {
        document.getElementById('topbarTitle').textContent = TAB_TITLES[tabId].title;
        document.getElementById('topbarSubtitle').textContent = TAB_TITLES[tabId].sub;
    }

    // Close mobile menu if open
    document.getElementById('sidebar').classList.remove('mobile-open');

    // Trigger tab-specific data load
    switch (tabId) {
        case 'dashboard': loadDashboardMetrics(); break;
        case 'experiments': loadExperiments(); break;
        case 'manuals': loadManuals(); break;
        case 'questions': loadQuestions(); break;
        case 'groups': loadGroups(); break;
        case 'sessions': loadSessions(); break;
        case 'inventory': loadComponents(); break;
        case 'issues': loadIssues(); break;
        case 'returns': loadReturns(); break;
        case 'reports': loadReports(); break;
    }
}

// ==========================================================================
// 1. Dashboard Metrics Loader
// ==========================================
async function loadDashboardMetrics() {
    try {
        const res = await fetch(`${API_BASE}/metrics`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const m = json.data;
        document.getElementById('cardTotalExperiments').textContent = m.totalExperiments || 0;
        document.getElementById('cardLabManuals').textContent = m.labManuals || 0;
        document.getElementById('cardStudentGroups').textContent = m.studentGroups || 0;
        document.getElementById('cardActiveSessions').textContent = m.activeLabSessions || 0;
        document.getElementById('cardPendingReturns').textContent = m.pendingReturns || 0;

        // Update sidebar badges
        document.getElementById('badgeActiveSessions').textContent = m.activeLabSessions || 0;
        document.getElementById('badgePendingReturns').textContent = m.pendingReturns || 0;

        // Render live sessions table
        renderDashboardSessions(m.recentSessions || []);

        // Render audit logs
        renderDashboardLogs(m.recentLogs || []);
    } catch (err) {
        console.error('Error loading dashboard metrics:', err);
    }
}

function renderDashboardSessions(sessions) {
    const tbody = document.getElementById('tableDashboardSessions');
    if (!sessions || !sessions.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-subtle);">No active lab sessions at the moment.</td></tr>`;
        return;
    }

    tbody.innerHTML = sessions.map(s => {
        const elapsedMinutes = s.startTime ? Math.floor((Date.now() - new Date(s.startTime).getTime()) / 60000) : 0;
        const statusBadge = getStatusBadge(s.status);
        const issuedCount = (s.componentsIssued || []).reduce((acc, c) => acc + (c.quantity || 1), 0);

        return `
            <tr>
                <td><strong>${s.sessionId}</strong></td>
                <td>${s.groupName}</td>
                <td><span class="badge badge-purple">${s.experimentNumber}</span></td>
                <td>${elapsedMinutes} mins ago</td>
                <td>${issuedCount} components</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="switchTab('sessions')">Monitor</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderDashboardLogs(logs) {
    const tbody = document.getElementById('tableDashboardLogs');
    if (!logs || !logs.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-subtle);">No recent audit logs.</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(l => `
        <tr>
            <td><strong>${escapeHtml(l.action)}</strong></td>
            <td><span class="badge badge-muted">${escapeHtml(l.category || 'General')}</span></td>
            <td>${escapeHtml(l.staffUsername)}</td>
            <td style="color:var(--text-muted);">${escapeHtml(l.details || '')}</td>
            <td style="font-size:0.8rem; color:var(--text-subtle);">${new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        </tr>
    `).join('');
}

// ==========================================================================
// 2. Experiment Management
// ==========================================================================
async function loadExperiments() {
    try {
        const search = document.getElementById('searchExperiments')?.value || '';
        const res = await fetch(`${API_BASE}/experiments?search=${encodeURIComponent(search)}`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        cachedExperiments = json.data || [];
        const tbody = document.getElementById('tableExperiments');

        if (!cachedExperiments.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-subtle);">No experiments found. Click "+ New Experiment" to add one.</td></tr>`;
            return;
        }

        tbody.innerHTML = cachedExperiments.map(e => `
            <tr>
                <td><strong>${e.experimentNumber}</strong></td>
                <td>
                    <div style="font-weight:600;">${escapeHtml(e.title)}</div>
                    <div style="font-size:0.75rem; color:var(--text-subtle);">${escapeHtml((e.description || '').slice(0, 75))}...</div>
                </td>
                <td>${escapeHtml(e.subject)}</td>
                <td>${escapeHtml(e.laboratory)}</td>
                <td>${(e.requiredComponents || []).length} parts configured</td>
                <td>
                    <span class="badge ${e.isActive ? 'badge-success' : 'badge-danger'}">
                        ${e.isActive ? 'Active' : 'Disabled'}
                    </span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="icon-btn" title="Toggle Active / Disabled" onclick="handleToggleExperiment('${e._id}')">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/></svg>
                        </button>
                        <button class="icon-btn danger" title="Delete Experiment" onclick="handleDeleteExperiment('${e._id}', '${e.experimentNumber}')">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading experiments:', err);
    }
}

async function handleCreateExperiment(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const partsStr = formData.get('requiredComponentsStr') || '';
    const parts = partsStr.split(',').filter(Boolean).map(p => {
        const [name, qty] = p.split(':');
        return {
            componentName: (name || '').trim(),
            quantity: Number(qty) || 1
        };
    });

    const payload = {
        experimentNumber: formData.get('experimentNumber'),
        title: formData.get('title'),
        subject: formData.get('subject'),
        laboratory: formData.get('laboratory'),
        description: formData.get('description'),
        requiredComponents: parts
    };

    try {
        const res = await fetch(`${API_BASE}/experiments`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-create-experiment');
            form.reset();
            loadExperiments();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error saving experiment', 'error');
    }
}

async function handleToggleExperiment(id) {
    try {
        const res = await fetch(`${API_BASE}/experiments/${id}/toggle`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadExperiments();
        }
    } catch (err) {
        showToast('Failed to toggle experiment', 'error');
    }
}

function handleDeleteExperiment(id, expNum) {
    // Populate and open the custom confirm modal
    const msgEl = document.getElementById('delExpModalMessage');
    if (msgEl) {
        msgEl.textContent = `Are you sure you want to permanently delete experiment ${expNum}? This action cannot be undone.`;
    }

    const confirmBtn = document.getElementById('btnConfirmDelExp');
    // Remove any previous listener to avoid stacking
    const fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);

    fresh.addEventListener('click', async () => {
        fresh.disabled = true;
        fresh.textContent = 'Deleting...';
        try {
            const res = await fetch(`${API_BASE}/experiments/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            closeModal('modal-confirm-delete-experiment');
            if (json.success) {
                showToast(json.message, 'success');
                loadExperiments();
            } else {
                showToast(json.message || 'Deletion blocked — dependencies exist.', 'error');
            }
        } catch (err) {
            closeModal('modal-confirm-delete-experiment');
            showToast('Error deleting experiment', 'error');
        } finally {
            fresh.disabled = false;
            fresh.textContent = 'Delete Experiment';
        }
    });

    openModal('modal-confirm-delete-experiment');
}

// ==========================================================================
// 3. Lab Manual Management
// ==========================================================================
async function loadManuals() {
    try {
        const res = await fetch(`${API_BASE}/manuals`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const tbody = document.getElementById('tableManuals');
        const manuals = json.data || [];

        if (!manuals.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-subtle);">No lab manuals uploaded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = manuals.map(m => {
            const kbSize = (m.fileSize / 1024).toFixed(1) + ' KB';
            const updatedDate = new Date(m.updatedAt || m.createdAt).toLocaleDateString();

            return `
                <tr>
                    <td><strong class="badge badge-purple">${m.experimentNumber}</strong></td>
                    <td>
                        <div style="font-weight:600;">${escapeHtml(m.title)}</div>
                        <div style="font-size:0.75rem; color:var(--text-subtle);">${escapeHtml(m.originalFileName)}</div>
                    </td>
                    <td>${escapeHtml(m.subject)}</td>
                    <td>v${m.version || 1}</td>
                    <td>${kbSize}</td>
                    <td>${updatedDate} (${escapeHtml(m.updatedBy || 'staff')})</td>
                    <td>
                        <span class="badge ${m.isPublished ? 'badge-success' : 'badge-muted'}">
                            ${m.isPublished ? 'Published' : 'Draft'}
                        </span>
                    </td>
                    <td>
                        <div class="action-btn-group">
                            <a href="${API_BASE}/manuals/${m._id}/download" target="_blank" class="icon-btn" title="Preview / Download PDF">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                            </a>
                            <button class="icon-btn" title="Toggle Publish" onclick="handleToggleManualPublish('${m._id}')">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <button class="icon-btn danger" title="Delete Manual" onclick="handleDeleteManual('${m._id}')">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading manuals:', err);
    }
}

function handleManualFileSelected(input) {
    if (input.files && input.files[0]) {
        document.getElementById('uploadFileNameDisplay').textContent = input.files[0].name;
    }
}

async function handleUploadManual(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = document.getElementById('btnSubmitManual');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    const formData = new FormData(form);

    try {
        const res = await fetch(`${API_BASE}/manuals/upload`, {
            method: 'POST',
            headers: getAuthHeaders(false),
            body: formData
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-upload-manual');
            form.reset();
            document.getElementById('uploadFileNameDisplay').textContent = 'Click to browse or drop PDF here';
            loadManuals();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error uploading manual', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload & Publish';
    }
}

async function handleToggleManualPublish(id) {
    try {
        const res = await fetch(`${API_BASE}/manuals/${id}/publish`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadManuals();
        }
    } catch (err) {
        showToast('Failed to update manual', 'error');
    }
}

function handleDeleteManual(id) {
    // Populate and open the custom confirm modal
    const msgEl = document.getElementById('delManualModalMessage');
    if (msgEl) {
        msgEl.textContent = 'Are you sure you want to permanently delete this lab manual? Students will no longer be able to access the PDF.';
    }

    const confirmBtn = document.getElementById('btnConfirmDelManual');
    const fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);

    fresh.addEventListener('click', async () => {
        fresh.disabled = true;
        fresh.textContent = 'Deleting...';
        try {
            const res = await fetch(`${API_BASE}/manuals/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            closeModal('modal-confirm-delete-manual');
            if (json.success) {
                showToast(json.message, 'success');
                loadManuals();
            } else {
                showToast(json.message || 'Failed to delete manual.', 'error');
            }
        } catch (err) {
            closeModal('modal-confirm-delete-manual');
            showToast('Error deleting manual', 'error');
        } finally {
            fresh.disabled = false;
            fresh.textContent = 'Delete Manual';
        }
    });

    openModal('modal-confirm-delete-manual');
}

// AI Smart Lab Manual Upload & Auto-Analysis Handlers
window.handleAiManualFileSelected = function(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const display = document.getElementById('aiUploadFileNameDisplay');
        if (display) {
            display.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        }
        
        // Auto-suggest and clean subject in subject input
        const subjectInput = document.getElementById('aiManualSubject');
        if (subjectInput) {
            const current = subjectInput.value.trim();
            // If empty or user dragged filename into subject field, auto-clean it
            if (!current || current.toLowerCase().endsWith('.pdf') || /^(lab\s*man+u+al|manual|untitled)$/i.test(current)) {
                let suggested = file.name
                    .replace(/\.pdf$/i, '')
                    .replace(/[-_]/g, ' ')
                    .replace(/^(introduction to|study of|lab manual for|lab manual)\s+/i, '')
                    .replace(/\b(lab\s*man+u+al|manual|lab|notes|v\d+)\b/gi, '')
                    .trim();
                if (suggested.length > 2) {
                    subjectInput.value = suggested.charAt(0).toUpperCase() + suggested.slice(1);
                }
            }
        }
    }
};

function setupDropzones() {
    const aiDropzone = document.getElementById('aiDropzone');
    const aiFileInput = document.getElementById('aiManualFileInput');

    if (aiDropzone && aiFileInput) {
        ['dragenter', 'dragover'].forEach(name => {
            aiDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                aiDropzone.style.borderColor = '#ec4899';
                aiDropzone.style.background = 'rgba(236,72,153,0.1)';
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            aiDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                aiDropzone.style.borderColor = 'rgba(139,92,246,0.4)';
                aiDropzone.style.background = 'rgba(255,255,255,0.02)';
            });
        });

        aiDropzone.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
                    aiFileInput.files = e.dataTransfer.files;
                    handleAiManualFileSelected(aiFileInput);
                } else {
                    showToast('Only PDF documents (.pdf) are supported.', 'error');
                }
            }
        });
    }

    const regDropzone = document.querySelector('#modal-upload-manual .upload-dropzone');
    const regFileInput = document.getElementById('manualFileInput');
    if (regDropzone && regFileInput) {
        ['dragenter', 'dragover'].forEach(name => {
            regDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        regDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                regFileInput.files = e.dataTransfer.files;
                if (typeof handleManualFileSelected === 'function') {
                    handleManualFileSelected(regFileInput);
                }
            }
        });
    }
}

window.handleAiUploadManual = async function(e) {
    e.preventDefault();
    const form = e.target;
    const fileInput = document.getElementById('aiManualFileInput');
    if (!fileInput.files || !fileInput.files[0]) {
        showToast('Please select or drop a PDF lab manual to analyze.', 'error');
        return;
    }

    // Auto-clean subject input if it contains a .pdf file name
    const subjectInput = document.getElementById('aiManualSubject');
    if (subjectInput && subjectInput.value) {
        let clean = subjectInput.value.replace(/\.pdf$/i, '').trim();
        subjectInput.value = clean;
    }

    const submitBtn = document.getElementById('btnSubmitAiManual');
    const progressEl = document.getElementById('aiAnalysisProgress');
    const resultsEl = document.getElementById('aiAnalysisResults');
    const summaryEl = document.getElementById('aiResultsSummary');

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ AI is Processing PDF...';
    progressEl.style.display = 'block';
    resultsEl.style.display = 'none';

    const formData = new FormData(form);

    try {
        const res = await fetch(`${API_BASE}/manuals/ai-upload`, {
            method: 'POST',
            headers: getAuthHeaders(false),
            body: formData
        });
        const json = await res.json();
        progressEl.style.display = 'none';

        if (json.success && json.data) {
            resultsEl.style.display = 'block';
            const d = json.data;
            summaryEl.innerHTML = `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:12px;">
                    <div style="background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px;">
                        <span style="color:var(--text-subtle); font-size:0.75rem;">SUBJECT</span>
                        <div style="font-weight:700; color:#fff;">${escapeHtml(d.subject)}</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px;">
                        <span style="color:var(--text-subtle); font-size:0.75rem;">EXPERIMENTS AUTO-FILLED</span>
                        <div style="font-weight:700; color:#a78bfa;">${d.experimentsCount} Experiments</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px;">
                        <span style="color:var(--text-subtle); font-size:0.75rem;">PARTS ADDED TO INVENTORY</span>
                        <div style="font-weight:700; color:#34d399;">${d.componentsCount} Hardware Parts</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px;">
                        <span style="color:var(--text-subtle); font-size:0.75rem;">TEST QUIZZES CONFIGURED</span>
                        <div style="font-weight:700; color:#f472b6;">${d.questionSetsCount} Pre-Lab Tests</div>
                    </div>
                </div>
                <div style="color:var(--text-muted); font-size:0.8rem;">
                    Experiment Catalog, Lab Manuals, Hardware Inventory, and Question Bank have all been updated and saved to MongoDB!
                </div>
            `;

            showToast(json.message, 'success');

            // Refresh all frontend tables with newly created records
            loadExperiments();
            loadManuals();
            loadComponents();
            loadQuestions();
            loadDashboard();

            submitBtn.textContent = '✓ Done! Close Window';
            submitBtn.disabled = false;
            submitBtn.onclick = () => {
                closeModal('modal-ai-upload-manual');
                form.reset();
                document.getElementById('aiUploadFileNameDisplay').textContent = 'Click or Drag & Drop Lab Manual PDF Here';
                resultsEl.style.display = 'none';
                submitBtn.onclick = null;
                submitBtn.textContent = '✨ Analyze with AI & Auto-Fill Tables';
            };
        } else {
            showToast(json.message || 'AI analysis could not complete.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = '✨ Analyze with AI & Auto-Fill Tables';
        }
    } catch (err) {
        progressEl.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ Analyze with AI & Auto-Fill Tables';
        showToast('Error uploading & analyzing manual: ' + err.message, 'error');
    }
}

async function handleSyncFolderManuals() {
    showToast('Scanning uploads/manuals folder and syncing to MongoDB...', 'info');
    try {
        const res = await fetch(`${API_BASE}/manuals/sync-folder`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message || 'Folder manuals successfully saved to MongoDB database!', 'success');
            loadManuals();
            loadOverviewMetrics();
        } else {
            showToast(json.message || 'Failed to sync manuals from folder.', 'error');
        }
    } catch (err) {
        showToast('Error syncing folder: ' + err.message, 'error');
    }
}

async function handleCleanupDummyData() {
    const msgEl = document.getElementById('delExpModalMessage');
    const modalEl = document.getElementById('modal-confirm-delete-experiment');
    
    // Use the custom styled modal
    if (msgEl) {
        msgEl.textContent = 'Are you sure you want to clear default demo experiments (EXP-01 to EXP-05)? This cleans the catalog to make room for your real uploaded subject lab manuals.';
    }

    const confirmBtn = document.getElementById('btnConfirmDelExp');
    const fresh = confirmBtn.cloneNode(true);
    fresh.textContent = 'Clear Demo Data';
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);

    fresh.addEventListener('click', async () => {
        fresh.disabled = true;
        fresh.textContent = 'Clearing...';
        try {
            const res = await fetch(`${API_BASE}/experiments/cleanup-dummy`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            closeModal('modal-confirm-delete-experiment');
            if (json.success) {
                showToast(json.message, 'success');
                loadExperiments();
                loadManuals();
                loadDashboard();
            } else {
                showToast(json.message || 'Failed to clear demo data', 'error');
            }
        } catch (err) {
            closeModal('modal-confirm-delete-experiment');
            showToast('Error clearing demo data', 'error');
        } finally {
            fresh.disabled = false;
            fresh.textContent = 'Delete Experiment';
        }
    });

    openModal('modal-confirm-delete-experiment');
}

// ==========================================================================
// 4. Question Bank Management
// ==========================================================================
async function loadQuestions() {
    try {
        const res = await fetch(`${API_BASE}/questions`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const tbody = document.getElementById('tableQuestions');
        const list = json.data || [];

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-subtle);">No question sets configured. Click "+ Configure Questions".</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(q => `
            <tr>
                <td><strong class="badge badge-purple">${q.experimentNumber}</strong></td>
                <td>${escapeHtml(q.subject)}</td>
                <td>${escapeHtml(q.title || 'Pre-Lab Test')}</td>
                <td>${(q.questions || []).length} MCQs</td>
                <td>${q.testDurationMinutes || 5} mins</td>
                <td>Score: ${q.passMark || 3}</td>
                <td>
                    <span class="badge ${q.isPublished ? 'badge-success' : 'badge-muted'}">
                        ${q.isPublished ? 'Active' : 'Unpublished'}
                    </span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="icon-btn" title="Toggle Publish" onclick="handleToggleQuestionPublish('${q._id}')">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button class="icon-btn danger" title="Delete" onclick="handleDeleteQuestionSet('${q._id}')">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading questions:', err);
    }
}

function addQuestionRow(data = null) {
    const container = document.getElementById('questionsContainer');
    const index = container.children.length + 1;

    const row = document.createElement('div');
    row.className = 'card-panel';
    row.style.padding = '1.2rem';
    row.style.marginBottom = '0.5rem';

    row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:0.9rem;">Question ${index}</strong>
            <button type="button" class="icon-btn danger" onclick="this.closest('.card-panel').remove()">✕</button>
        </div>
        <div class="form-group">
            <input type="text" class="form-control q-text" placeholder="Enter question statement..." value="${data ? escapeHtml(data.questionText) : ''}" required>
        </div>
        <div class="form-grid">
            <input type="text" class="form-control q-opt-0" placeholder="Option A" value="${data ? escapeHtml(data.options[0] || '') : ''}" required>
            <input type="text" class="form-control q-opt-1" placeholder="Option B" value="${data ? escapeHtml(data.options[1] || '') : ''}" required>
            <input type="text" class="form-control q-opt-2" placeholder="Option C" value="${data ? escapeHtml(data.options[2] || '') : ''}" required>
            <input type="text" class="form-control q-opt-3" placeholder="Option D" value="${data ? escapeHtml(data.options[3] || '') : ''}" required>
        </div>
        <div class="form-group" style="margin-top:8px;">
            <label>Correct Answer:</label>
            <select class="form-control q-correct">
                <option value="0" ${data && data.correctOptionIndex === 0 ? 'selected' : ''}>Option A</option>
                <option value="1" ${data && data.correctOptionIndex === 1 ? 'selected' : ''}>Option B</option>
                <option value="2" ${data && data.correctOptionIndex === 2 ? 'selected' : ''}>Option C</option>
                <option value="3" ${data && data.correctOptionIndex === 3 ? 'selected' : ''}>Option D</option>
            </select>
        </div>
    `;

    container.appendChild(row);
}

async function handleSaveQuestions(e) {
    e.preventDefault();
    const rows = document.querySelectorAll('#questionsContainer .card-panel');
    if (!rows.length) {
        showToast('Please add at least one question.', 'error');
        return;
    }

    const questions = [];
    rows.forEach(r => {
        questions.push({
            questionText: r.querySelector('.q-text').value.trim(),
            options: [
                r.querySelector('.q-opt-0').value.trim(),
                r.querySelector('.q-opt-1').value.trim(),
                r.querySelector('.q-opt-2').value.trim(),
                r.querySelector('.q-opt-3').value.trim()
            ],
            correctOptionIndex: Number(r.querySelector('.q-correct').value),
            marks: 1
        });
    });

    const payload = {
        experimentNumber: document.getElementById('qExpNumber').value.trim().toUpperCase(),
        subject: document.getElementById('qSubject').value.trim(),
        testDurationMinutes: Number(document.getElementById('qDuration').value),
        passMark: Number(document.getElementById('qPassMark').value),
        questions
    };

    try {
        const res = await fetch(`${API_BASE}/questions`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-create-question');
            loadQuestions();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error saving questions', 'error');
    }
}

async function handleToggleQuestionPublish(id) {
    try {
        const res = await fetch(`${API_BASE}/questions/${id}/publish`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadQuestions();
        }
    } catch (err) {
        showToast('Error updating question set', 'error');
    }
}

async function handleDeleteQuestionSet(id) {
    // Reuse the manual confirm modal for question sets (generic danger confirm)
    const msgEl = document.getElementById('delManualModalMessage');
    if (msgEl) msgEl.textContent = 'Are you sure you want to permanently delete this question set? Students will no longer be able to take the assessment for this experiment.';

    const confirmBtn = document.getElementById('btnConfirmDelManual');
    const fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);

    fresh.textContent = 'Delete Question Set';
    fresh.addEventListener('click', async () => {
        fresh.disabled = true;
        fresh.textContent = 'Deleting...';
        try {
            const res = await fetch(`${API_BASE}/questions/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            closeModal('modal-confirm-delete-manual');
            if (json.success) {
                showToast(json.message, 'success');
                loadQuestions();
            } else {
                showToast(json.message || 'Failed to delete question set.', 'error');
            }
        } catch (err) {
            closeModal('modal-confirm-delete-manual');
            showToast('Error deleting question set', 'error');
        } finally {
            fresh.disabled = false;
            fresh.textContent = 'Delete Question Set';
        }
    });

    openModal('modal-confirm-delete-manual');
}

// ==========================================================================
// 5. Student Groups Directory
// ==========================================================================
async function loadGroups() {
    try {
        const search = document.getElementById('searchGroups')?.value || '';
        const res = await fetch(`${API_BASE}/groups?search=${encodeURIComponent(search)}`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        cachedGroups = json.data || [];
        const tbody = document.getElementById('tableGroups');

        if (!cachedGroups.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-subtle);">No student groups found.</td></tr>`;
            return;
        }

        tbody.innerHTML = cachedGroups.map(g => {
            const memberNames = (g.members || []).map(m => m.name).join(', ');
            const testBadge = g.testStatus === 'Passed'
                ? `<span class="badge badge-success">Passed (${g.testScore}/${g.testMaxScore})</span>`
                : (g.testStatus === 'Failed' ? `<span class="badge badge-danger">Failed (${g.testScore}/${g.testMaxScore})</span>` : `<span class="badge badge-muted">Test Pending</span>`);

            return `
                <tr>
                    <td><strong>${g.groupId}</strong></td>
                    <td>
                        <div style="font-weight:600;">${escapeHtml(g.groupName)}</div>
                        <div style="font-size:0.75rem; color:var(--text-subtle);">${escapeHtml(g.subject)}</div>
                    </td>
                    <td><span class="badge badge-purple">${g.experimentNumber}</span></td>
                    <td style="font-size:0.85rem;">${escapeHtml(memberNames)}</td>
                    <td>${testBadge}</td>
                    <td>${getStatusBadge(g.status)}</td>
                    <td>
                        <button class="btn-secondary btn-sm" onclick="viewGroupDetails('${g.groupId}')">View Details</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading groups:', err);
    }
}

async function handleRegisterGroup(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const payload = {
        groupName: formData.get('groupName'),
        subject: formData.get('subject'),
        experimentNumber: formData.get('experimentNumber'),
        members: [
            { name: formData.get('member1Name'), registrationId: formData.get('member1Reg') },
            { name: formData.get('member2Name'), registrationId: formData.get('member2Reg') }
        ]
    };

    try {
        const res = await fetch(`${API_BASE}/groups`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-register-group');
            form.reset();
            loadGroups();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error registering group', 'error');
    }
}

function viewGroupDetails(groupId) {
    const group = cachedGroups.find(g => g.groupId === groupId);
    if (!group) return;

    document.getElementById('groupDetailTitle').textContent = `${group.groupName} (${group.groupId})`;
    const body = document.getElementById('groupDetailBody');

    body.innerHTML = `
        <div style="margin-bottom:1.2rem;">
            <p><strong>Subject:</strong> ${escapeHtml(group.subject)}</p>
            <p><strong>Experiment:</strong> ${escapeHtml(group.experimentNumber)}</p>
            <p><strong>Status:</strong> ${getStatusBadge(group.status)}</p>
            <p><strong>Pre-Lab Test:</strong> ${group.testStatus} (${group.testScore} / ${group.testMaxScore})</p>
        </div>
        <div class="card-panel" style="padding:1rem; margin-bottom:1rem;">
            <h4>Members</h4>
            <ul style="padding-left:1.2rem; margin-top:6px;">
                ${(group.members || []).map(m => `<li>${escapeHtml(m.name)} (ID: ${escapeHtml(m.registrationId)})</li>`).join('')}
            </ul>
        </div>
        ${group.assignedComponents && group.assignedComponents.length ? `
            <div class="card-panel" style="padding:1rem;">
                <h4>Assigned Components</h4>
                <ul style="padding-left:1.2rem; margin-top:6px;">
                    ${group.assignedComponents.map(c => `<li>${escapeHtml(c.componentName)} (${c.partNumber || ''}) — Qty: ${c.quantity}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
    `;

    openModal('modal-group-detail');
}

// ==========================================================================
// 6. Component Inventory Management
// ==========================================
async function loadComponents() {
    try {
        const search = document.getElementById('searchComponents')?.value || '';
        const type = document.getElementById('filterComponentType')?.value || 'All';
        const res = await fetch(`${API_BASE}/components?search=${encodeURIComponent(search)}&type=${encodeURIComponent(type)}`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const tbody = document.getElementById('tableComponents');
        const comps = json.data || [];

        if (!comps.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-subtle);">No components found.</td></tr>`;
            return;
        }

        tbody.innerHTML = comps.map(c => {
            const isLow = c.availableQuantity <= c.minimumStockLevel;
            const stockColor = isLow ? 'color:var(--danger); font-weight:700;' : '';

            return `
                <tr>
                    <td><strong>${c.partNumber}</strong></td>
                    <td>
                        <div style="font-weight:600;">${escapeHtml(c.name)}</div>
                        <div style="font-size:0.75rem; color:var(--text-subtle);">${escapeHtml(c.specifications || '')}</div>
                    </td>
                    <td><span class="badge badge-muted">${escapeHtml(c.type)}</span></td>
                    <td style="${stockColor}">
                        ${c.availableQuantity} / ${c.totalQuantity}
                        ${isLow ? '<span class="badge badge-danger" style="margin-left:6px;">LOW STOCK</span>' : ''}
                    </td>
                    <td>${c.minimumStockLevel}</td>
                    <td>${escapeHtml(c.storageLocation)}</td>
                    <td><span class="badge ${c.condition === 'Good' || c.condition === 'Brand New' ? 'badge-success' : 'badge-warning'}">${c.condition}</span></td>
                    <td>
                        <div class="action-btn-group">
                            <button class="btn-secondary btn-sm" onclick="openAdjustStockModal('${c._id}', '${c.partNumber}', '${escapeHtml(c.name)}')">Adjust Stock</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading components:', err);
    }
}

async function handleAddComponent(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const payload = {
        name: formData.get('name'),
        partNumber: formData.get('partNumber'),
        type: formData.get('type'),
        totalQuantity: Number(formData.get('totalQuantity')),
        minimumStockLevel: Number(formData.get('minimumStockLevel')),
        storageLocation: formData.get('storageLocation'),
        specifications: formData.get('specifications')
    };

    try {
        const res = await fetch(`${API_BASE}/components`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-add-component');
            form.reset();
            loadComponents();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error registering component', 'error');
    }
}

function openAdjustStockModal(id, partNum, name) {
    document.getElementById('adjustComponentId').value = id;
    document.getElementById('adjustComponentName').value = `${name} (${partNum})`;
    document.getElementById('adjustQuantityChange').value = '';
    document.getElementById('adjustRemarks').value = '';
    openModal('modal-adjust-stock');
}

async function handleAdjustStockSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('adjustComponentId').value;
    const change = Number(document.getElementById('adjustQuantityChange').value);
    const remarks = document.getElementById('adjustRemarks').value;

    try {
        const res = await fetch(`${API_BASE}/components/${id}/adjust`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ quantityChange: change, remarks })
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-adjust-stock');
            loadComponents();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error adjusting stock', 'error');
    }
}

// ==========================================================================
// 7. Component Handover (Issue Records)
// ==========================================
async function loadIssues() {
    try {
        const res = await fetch(`${API_BASE}/issues`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const tbody = document.getElementById('tableIssues');
        const issues = json.data || [];

        if (!issues.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-subtle);">No component handovers recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = issues.map(iss => {
            const partsList = (iss.components || []).map(c => `${c.name} (${c.issuedQty})`).join(', ');

            return `
                <tr>
                    <td><strong>${iss.issueId}</strong></td>
                    <td>${iss.sessionId}</td>
                    <td><strong>${escapeHtml(iss.groupName)}</strong></td>
                    <td><span class="badge badge-purple">${iss.experimentNumber}</span></td>
                    <td style="font-size:0.85rem;">${escapeHtml(partsList)}</td>
                    <td>${escapeHtml(iss.issuedBy)}</td>
                    <td>${new Date(iss.issueTimestamp).toLocaleString()}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading issues:', err);
    }
}

// Populate eligible groups into the handover modal
async function populateEligibleGroups() {
    const select = document.getElementById('issueSelectGroup');
    select.innerHTML = '<option value="">Loading eligible groups...</option>';

    try {
        const res = await fetch(`${API_BASE}/issues/eligible-groups`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const groups = json.data || [];
        if (!groups.length) {
            select.innerHTML = '<option value="">No groups eligible (Must pass pre-lab test first)</option>';
            return;
        }

        select.innerHTML = '<option value="">-- Select Eligible Group --</option>' + groups.map(g => `
            <option value="${g.groupId}" data-exp="${g.experimentNumber}">${g.groupName} (${g.groupId} • ${g.experimentNumber})</option>
        `).join('');
    } catch (err) {
        select.innerHTML = '<option value="">Error loading eligible groups</option>';
    }
}

async function loadGroupRequirementForIssue(groupId) {
    const box = document.getElementById('issueRequirementBox');
    const container = document.getElementById('issueComponentsList');
    if (!groupId) {
        box.style.display = 'none';
        return;
    }

    const select = document.getElementById('issueSelectGroup');
    const opt = select.options[select.selectedIndex];
    const expNum = opt.getAttribute('data-exp');

    // Find experiment
    const exp = cachedExperiments.find(e => e.experimentNumber === expNum);
    box.style.display = 'block';

    if (!exp || !exp.requiredComponents || !exp.requiredComponents.length) {
        container.innerHTML = `<p style="color:var(--text-subtle);">No default parts listed for ${expNum}. Add parts below.</p>`;
        return;
    }

    container.innerHTML = exp.requiredComponents.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:8px 12px; border-radius:6px;">
            <span><strong>${escapeHtml(c.componentName)}</strong> (${c.partNumber || 'Std'})</span>
            <span>Qty: <input type="number" class="form-control" style="width:70px; display:inline-block; padding:4px;" value="${c.quantity || 1}" min="1" data-part="${c.partNumber}" data-name="${escapeHtml(c.componentName)}"></span>
        </div>
    `).join('');
}

async function handleIssueComponents(e) {
    e.preventDefault();
    const groupId = document.getElementById('issueSelectGroup').value;
    const condition = document.getElementById('issueCondition').value;
    const notes = document.getElementById('issueNotes').value;

    if (!groupId) {
        showToast('Please select an eligible group.', 'error');
        return;
    }

    const inputs = document.querySelectorAll('#issueComponentsList input');
    const components = [];
    inputs.forEach(inp => {
        components.push({
            partNumber: inp.getAttribute('data-part'),
            name: inp.getAttribute('data-name'),
            issuedQty: Number(inp.value) || 1,
            expectedQty: Number(inp.value) || 1,
            conditionBefore: condition
        });
    });

    try {
        const res = await fetch(`${API_BASE}/issues`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ groupId, components, notes })
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-issue-components');
            loadIssues();
            loadDashboardMetrics();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error completing component handover', 'error');
    }
}

// ==========================================================================
// 8. Lab Session Monitoring
// ==========================================
async function loadSessions() {
    try {
        const filter = document.getElementById('filterSessionStatus')?.value || 'All';
        const res = await fetch(`${API_BASE}/sessions?status=${encodeURIComponent(filter)}`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        cachedSessions = json.data || [];
        const tbody = document.getElementById('tableSessions');

        if (!cachedSessions.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-subtle);">No lab sessions match the filter.</td></tr>`;
            return;
        }

        tbody.innerHTML = cachedSessions.map(s => {
            const elapsed = s.startTime ? Math.floor((Date.now() - new Date(s.startTime).getTime()) / 60000) : 0;
            const isCompleted = s.status === 'Completed';

            return `
                <tr>
                    <td><strong>${s.sessionId}</strong></td>
                    <td>
                        <div style="font-weight:600;">${escapeHtml(s.groupName)}</div>
                        <div style="font-size:0.75rem; color:var(--text-subtle);">${escapeHtml((s.studentNames || []).join(', '))}</div>
                    </td>
                    <td><span class="badge badge-purple">${s.experimentNumber}</span></td>
                    <td>${new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>${isCompleted ? 'Finished' : `${elapsed} mins`}</td>
                    <td>${getStatusBadge(s.status)}</td>
                    <td>
                        <select class="select-filter btn-sm" onchange="handleUpdateSessionStatus('${s._id}', this.value)" ${isCompleted ? 'disabled' : ''}>
                            <option value="Components Issued" ${s.status === 'Components Issued' ? 'selected' : ''}>Components Issued</option>
                            <option value="Experiment In Progress" ${s.status === 'Experiment In Progress' ? 'selected' : ''}>Experiment In Progress</option>
                            <option value="Return Pending" ${s.status === 'Return Pending' ? 'selected' : ''}>Return Pending</option>
                            <option value="Inspection Pending" ${s.status === 'Inspection Pending' ? 'selected' : ''}>Inspection Pending</option>
                            <option value="Completed" ${s.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading sessions:', err);
    }
}

async function handleUpdateSessionStatus(id, newStatus) {
    try {
        const res = await fetch(`${API_BASE}/sessions/${id}/status`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: newStatus })
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            loadSessions();
            loadDashboardMetrics();
        }
    } catch (err) {
        showToast('Error updating session status', 'error');
    }
}

// ==========================================================================
// 9. Returns & Inspection
// ==========================================
async function loadReturns() {
    try {
        const res = await fetch(`${API_BASE}/returns`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const tbody = document.getElementById('tableReturns');
        const returns = json.data || [];

        if (!returns.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-subtle);">No return inspections recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = returns.map(r => {
            const returnedItemsCount = (r.items || []).reduce((acc, i) => acc + (i.returnedQty || 0), 0);
            const missingCount = (r.items || []).reduce((acc, i) => acc + (i.missingQty || 0), 0);
            const damagedCount = (r.items || []).reduce((acc, i) => acc + (i.damagedQty || 0), 0);

            const statusClass = r.inspectionStatus === 'All Good' ? 'badge-success' : 'badge-danger';

            return `
                <tr>
                    <td><strong>${r.returnId}</strong></td>
                    <td>${r.sessionId}</td>
                    <td><strong>${escapeHtml(r.groupName)}</strong></td>
                    <td>${returnedItemsCount} units</td>
                    <td style="${missingCount > 0 ? 'color:var(--danger); font-weight:700;' : ''}">${missingCount}</td>
                    <td style="${damagedCount > 0 ? 'color:var(--danger); font-weight:700;' : ''}">${damagedCount}</td>
                    <td><span class="badge ${statusClass}">${r.inspectionStatus}</span></td>
                    <td>${escapeHtml(r.inspectedBy)}</td>
                    <td>${new Date(r.inspectionTimestamp).toLocaleDateString()}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading returns:', err);
    }
}

function openReturnModalForFirstPending() {
    const select = document.getElementById('returnSelectSession');
    select.innerHTML = '<option value="">Loading active sessions...</option>';

    // Filter sessions with status 'Return Pending', 'Inspection Pending', or active
    const active = cachedSessions.filter(s => s.status !== 'Completed');
    if (!active.length) {
        select.innerHTML = '<option value="">No active sessions awaiting return.</option>';
    } else {
        select.innerHTML = '<option value="">-- Select Active Session --</option>' + active.map(s => `
            <option value="${s.sessionId}">${s.groupName} (${s.sessionId} • ${s.experimentNumber})</option>
        `).join('');
    }

    openModal('modal-inspect-return');
}

function loadSessionForReturn(sessionId) {
    const box = document.getElementById('returnItemsBox');
    const container = document.getElementById('returnItemsList');
    if (!sessionId) {
        box.style.display = 'none';
        return;
    }

    const session = cachedSessions.find(s => s.sessionId === sessionId);
    box.style.display = 'block';

    if (!session || !session.componentsIssued || !session.componentsIssued.length) {
        container.innerHTML = '<p style="color:var(--text-subtle);">No component handover recorded for this session.</p>';
        return;
    }

    container.innerHTML = session.componentsIssued.map((c, i) => `
        <div style="background:var(--bg-card); padding:10px 14px; border-radius:8px; border:1px solid var(--border-subtle);" data-part="${c.partNumber}" data-name="${escapeHtml(c.componentName)}" data-issued="${c.quantity}">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <strong>${escapeHtml(c.componentName)} (${c.partNumber})</strong>
                <span style="font-size:0.8rem; color:var(--text-muted);">Issued: <strong>${c.quantity}</strong></span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
                <div>
                    <label style="font-size:0.75rem;">Returned Qty</label>
                    <input type="number" class="form-control ret-qty" value="${c.quantity}" min="0" max="${c.quantity}">
                </div>
                <div>
                    <label style="font-size:0.75rem;">Missing Qty</label>
                    <input type="number" class="form-control miss-qty" value="0" min="0" max="${c.quantity}">
                </div>
                <div>
                    <label style="font-size:0.75rem;">Damaged Qty</label>
                    <input type="number" class="form-control dam-qty" value="0" min="0" max="${c.quantity}">
                </div>
            </div>
        </div>
    `).join('');
}

async function handleProcessReturn(e) {
    e.preventDefault();
    const sessionId = document.getElementById('returnSelectSession').value;
    const inspectionStatus = document.getElementById('returnInspectionStatus').value;
    const remarks = document.getElementById('returnRemarks').value;

    if (!sessionId) {
        showToast('Please select a session.', 'error');
        return;
    }

    const items = [];
    document.querySelectorAll('#returnItemsList > div').forEach(div => {
        items.push({
            partNumber: div.getAttribute('data-part'),
            componentName: div.getAttribute('data-name'),
            issuedQty: Number(div.getAttribute('data-issued')),
            returnedQty: Number(div.querySelector('.ret-qty').value),
            missingQty: Number(div.querySelector('.miss-qty').value),
            damagedQty: Number(div.querySelector('.dam-qty').value),
            conditionAfter: 'Good',
            testProcedureNotes: remarks
        });
    });

    try {
        const res = await fetch(`${API_BASE}/returns`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ sessionId, items, inspectionStatus, remarks })
        });
        const json = await res.json();
        if (json.success) {
            showToast(json.message, 'success');
            closeModal('modal-inspect-return');
            loadReturns();
            loadDashboardMetrics();
        } else {
            showToast(json.message, 'error');
        }
    } catch (err) {
        showToast('Error processing return inspection', 'error');
    }
}

// ==========================================================================
// 10. Reports
// ==========================================
async function loadReports() {
    try {
        const res = await fetch(`${API_BASE}/reports`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json.success) return;

        const data = json.data;
        document.getElementById('reportMetricUsage').textContent = data.totalExperiments || 5;

        // Populate inventory health preview
        const invRes = await fetch(`${API_BASE}/reports?type=inventory-summary`, { headers: getAuthHeaders() });
        const invJson = await invRes.json();
        if (invJson.success) {
            const tbody = document.getElementById('tableReportsInventory');
            tbody.innerHTML = (invJson.data || []).slice(0, 8).map(c => `
                <tr>
                    <td><strong>${c.partNumber}</strong></td>
                    <td>${escapeHtml(c.name)}</td>
                    <td>${c.type}</td>
                    <td>${c.availableQuantity} / ${c.totalQuantity}</td>
                    <td><span class="badge ${c.availableQuantity <= c.minimumStockLevel ? 'badge-danger' : 'badge-success'}">${c.availableQuantity <= c.minimumStockLevel ? 'Restock Needed' : 'Healthy'}</span></td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Error loading reports:', err);
    }
}

// ==========================================================================
// 11. Settings & Utilities
// ==========================================
function handleSettingsSave(e) {
    e.preventDefault();
    showToast('Lab configuration saved successfully!', 'success');
}

function handleLogout() {
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    window.location.href = 'index.html';
}

function setupSearchAndFilters() {
    // Dynamic search debounce
    const expSearch = document.getElementById('searchExperiments');
    if (expSearch) expSearch.addEventListener('input', debounce(loadExperiments, 300));

    const grpSearch = document.getElementById('searchGroups');
    if (grpSearch) grpSearch.addEventListener('input', debounce(loadGroups, 300));

    const compSearch = document.getElementById('searchComponents');
    if (compSearch) compSearch.addEventListener('input', debounce(loadComponents, 300));

    const compType = document.getElementById('filterComponentType');
    if (compType) compType.addEventListener('change', loadComponents);

    const sessFilter = document.getElementById('filterSessionStatus');
    if (sessFilter) sessFilter.addEventListener('change', loadSessions);
}

// Helper: Modal toggling
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        if (modalId === 'modal-issue-components') {
            populateEligibleGroups();
        }
        if (modalId === 'modal-create-question') {
            const container = document.getElementById('questionsContainer');
            if (!container.children.length) {
                addQuestionRow();
                addQuestionRow();
            }
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Helper: Toast Notification
function showToast(message, type = 'info') {
    const existing = document.getElementById('toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-visible`;
    toast.id = 'toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '9999';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '10px';
    toast.style.background = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#8555e8');
    toast.style.color = '#fff';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.4)';
    toast.textContent = (type === 'success' ? '✓ ' : (type === 'error' ? '✗ ' : 'ℹ ')) + message;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Helper: Status badge generator
function getStatusBadge(status) {
    switch (status) {
        case 'Components Issued':
        case 'Experiment In Progress':
            return `<span class="badge badge-warning">${status}</span>`;
        case 'Return Pending':
        case 'Inspection Pending':
            return `<span class="badge badge-danger">${status}</span>`;
        case 'Completed':
            return `<span class="badge badge-success">Completed</span>`;
        case 'Test Passed':
            return `<span class="badge badge-success">Test Passed</span>`;
        case 'Test Failed':
            return `<span class="badge badge-danger">Test Failed</span>`;
        default:
            return `<span class="badge badge-muted">${status || 'Pending'}</span>`;
    }
}

// Helper: Sanitization
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);
}

// Helper: Debounce
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
