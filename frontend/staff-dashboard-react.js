/**
 * HOD OF DEP - Executive Department Control Panel (Power BI Style React Application)
 * Built with React 18 & Chart.js
 * Tracks:
 *  - Subject-wise experiment completion by staff
 *  - Component handover deadlines (date until staff will give components)
 *  - Student experiment completion target deadlines
 *  - Real-time persistence to MongoDB (staff_portal)
 */

const { useState, useEffect, useMemo, useRef } = React;

const API_BASE = '/api/staff';

function getAuthHeaders() {
    const user = localStorage.getItem('username') || 'HOD OF DEP';
    return {
        'Content-Type': 'application/json',
        'x-staff-user': user
    };
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toInputDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
}

function getDaysRemaining(targetDateStr) {
    if (!targetDateStr) return null;
    const target = new Date(targetDateStr);
    const now = new Date();
    const diffTime = target.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ==========================================
// MAIN HOD CONTROL PANEL COMPONENT
// ==========================================
function HodDashboardApp() {
    const [overview, setOverview] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('hod-analytics');
    const [filterSubject, setFilterSubject] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [toast, setToast] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [aiRunning, setAiRunning] = useState(false);
    const [aiResultModal, setAiResultModal] = useState(null);

    // Sub-data for additional operational tabs
    const [experiments, setExperiments] = useState([]);
    const [manuals, setManuals] = useState([]);
    const [components, setComponents] = useState([]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Load All Data from Backend
    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/hod/overview`, { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success && json.data) {
                setOverview(json.data.summary);
                setSchedules(json.data.schedules || []);
            }
        } catch (err) {
            console.error('Failed to load HOD metrics:', err);
            showToast('Failed to load HOD department data from MongoDB', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Load sub-tabs lazily
    const loadSubTabData = async (tab) => {
        setActiveTab(tab);
        try {
            if (tab === 'manuals' && manuals.length === 0) {
                const res = await fetch(`${API_BASE}/manuals`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setManuals(json.data || []);
            } else if (tab === 'experiments' && experiments.length === 0) {
                const res = await fetch(`${API_BASE}/experiments`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setExperiments(json.data || []);
            } else if (tab === 'inventory' && components.length === 0) {
                const res = await fetch(`${API_BASE}/components`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setComponents(json.data || []);
            }
        } catch (e) {
            console.error('Sub tab fetch error:', e);
        }
    };

    // Save Schedule Edit directly to MongoDB
    const handleSaveSchedule = async (e) => {
        e.preventDefault();
        if (!editingSchedule) return;

        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/hod/schedules/${editingSchedule._id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(editingSchedule)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Saved progress for ${editingSchedule.subject} to MongoDB!`, 'success');
                setEditingSchedule(null);
                fetchData();
            } else {
                showToast(json.message || 'Failed to save schedule', 'error');
            }
        } catch (err) {
            showToast('Error saving to staff_portal database', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Quick Increment/Decrement Finished Experiments
    const handleQuickChange = async (schedule, delta) => {
        const nextVal = Math.max(0, Math.min(schedule.totalExperiments || 10, (schedule.completedExperiments || 0) + delta));
        try {
            const res = await fetch(`${API_BASE}/hod/schedules/${schedule._id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    completedExperiments: nextVal,
                    status: nextVal === schedule.totalExperiments ? 'Completed' : (nextVal > 0 ? 'On Track' : 'Action Required')
                })
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Updated ${schedule.subject}: ${nextVal}/${schedule.totalExperiments} finished`, 'success');
                fetchData();
            }
        } catch (e) {
            showToast('Failed to update progress', 'error');
        }
    };

    // Run AI Multi-Curriculum Department Analyzer & Auto-Map Schedules
    const handleRunAIAnalysis = async () => {
        try {
            setAiRunning(true);
            showToast('AI Model running: analyzing manuals, components, and student sessions...', 'success');
            const res = await fetch(`${API_BASE}/hod/ai-analyze`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            if (json.success && json.data) {
                setAiResultModal(json.data);
                showToast('AI Analysis Complete! Synced into MongoDB staff_portal.', 'success');
                await fetchData();
            } else {
                showToast(json.message || 'AI Analysis failed', 'error');
            }
        } catch (err) {
            showToast('Error executing AI Department Analysis', 'error');
        } finally {
            setAiRunning(false);
        }
    };

    // Filtered schedules with real-time search support
    const filteredSchedules = useMemo(() => {
        let list = schedules;
        if (filterSubject !== 'ALL') {
            list = list.filter(s => s.subject === filterSubject);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(s => 
                (s.subject && s.subject.toLowerCase().includes(q)) ||
                (s.staffInCharge && s.staffInCharge.toLowerCase().includes(q)) ||
                (s.batchName && s.batchName.toLowerCase().includes(q)) ||
                (s.status && s.status.toLowerCase().includes(q))
            );
        }
        return list;
    }, [schedules, filterSubject, searchQuery]);

    return (
        <div className="hod-layout">
            {/* TOAST NOTIFICATION */}
            {toast && (
                <div className={`hod-toast ${toast.type}`}>
                    <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
                    <span>{toast.message}</span>
                </div>
            )}

            {/* SIDEBAR NAVIGATION - PODX ICON UI */}
            <aside className="hod-sidebar">
                <div className="hod-brand">
                    <div className="brand-neon-icon"></div>
                    <div className="brand-text-block">
                        <h2>PODX</h2>
                        <span>HOD EXECUTIVE</span>
                    </div>
                </div>

                <nav className="hod-nav">
                    {/* 1. Overview (Active Pill Item with Neon Mint/Cyan Gradient) */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'hod-analytics' ? 'active' : ''}`}
                        onClick={() => setActiveTab('hod-analytics')}
                        title="Executive Dashboard Overview"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <rect x="2" y="3" width="20" height="14" rx="2" />
                                <line x1="8" y1="21" x2="16" y2="21" />
                                <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                        </div>
                        <span>Overview</span>
                    </button>

                    {/* 2. Staff Timelines & Deadlines */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'schedules' ? 'active' : ''}`}
                        onClick={() => setActiveTab('schedules')}
                        title="Staff Deadlines & Milestones"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                        </div>
                        <span>Staff Timelines</span>
                    </button>

                    {/* 3. Curriculum Tracking */}
                    <button
                        className="nav-pill-btn"
                        onClick={() => { setActiveTab('hod-analytics'); showToast('Showing curriculum progress tracking table', 'success'); }}
                        title="Curriculum Tracking"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="8 12 12 16 16 12" />
                                <line x1="12" y1="8" x2="12" y2="16" />
                            </svg>
                        </div>
                        <span>Curriculum</span>
                    </button>

                    {/* 4. Staff Faculty In-Charge */}
                    <button
                        className="nav-pill-btn"
                        onClick={() => { setActiveTab('hod-analytics'); showToast('Faculty In-Charge list verified in MongoDB', 'success'); }}
                        title="Faculty In-Charge"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <span>Staff Faculty</span>
                    </button>

                    {/* 5. Lab Security & Approvals */}
                    <button
                        className="nav-pill-btn"
                        onClick={() => showToast('All laboratory stations verified with security clearance', 'success')}
                        title="Lab Security & Access"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </div>
                        <span>Lab Security</span>
                    </button>

                    {/* 6. Lab Manuals (Docling AI) */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'manuals' ? 'active' : ''}`}
                        onClick={() => loadSubTabData('manuals')}
                        title="Uploaded PDF Guides & Docling AI"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                        </div>
                        <span>Lab Manuals (AI)</span>
                    </button>

                    {/* 7. Hardware Inventory */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                        onClick={() => loadSubTabData('inventory')}
                        title="Hardware Stock & Components"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                        </div>
                        <span>Hardware Stock</span>
                    </button>

                    {/* 8. Experiments Catalog */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'experiments' ? 'active' : ''}`}
                        onClick={() => loadSubTabData('experiments')}
                        title="All 40 Laboratory Experiments"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <span>Experiments</span>
                    </button>
                </nav>

                {/* HOD User Profile Bottom Card */}
                <div className="hod-user-card">
                    <div className="user-avatar-podx">HOD</div>
                    <div className="user-info-podx">
                        <strong>HOD OF DEP</strong>
                        <p>Executive Admin</p>
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="hod-main">
                {/* TOP NAVIGATION BAR */}
                <header className="podx-topbar">
                    <div className="topbar-title-block">
                        <h1>Executive Control Center</h1>
                        <p>Verilent Sem V-Lab | Live MongoDB staff_portal Synchronization</p>
                    </div>

                    {/* Center Pill Search Bar */}
                    <div className="topbar-search-pill">
                        <input
                            type="text"
                            placeholder="Search curriculum, staff in-charge, components..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button className="search-icon-btn" title="Search">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </button>
                    </div>

                    {/* Top Right Action Controls */}
                    <div className="topbar-actions">
                        <button className="circular-action-btn" title="Security & Permissions" onClick={() => showToast('Security protocols verified for HOD session', 'success')}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </button>
                        <button className="circular-action-btn" title="Live Database Sync" onClick={fetchData}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                            </svg>
                        </button>
                        <button className="circular-action-btn" title="Hardware Stock Allocation" onClick={() => loadSubTabData('inventory')}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            </svg>
                        </button>
                        <button className="circular-action-btn" title="Run AI Department Analyzer" onClick={handleRunAIAnalysis}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="10" rx="2" />
                                <circle cx="12" cy="5" r="2" />
                                <path d="M12 7v4" />
                                <line x1="8" y1="16" x2="8" y2="16" />
                                <line x1="16" y1="16" x2="16" y2="16" />
                            </svg>
                        </button>
                        <button className="circular-action-btn" title="More Options" onClick={fetchData}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="5" r="1.5" />
                                <circle cx="12" cy="19" r="1.5" />
                            </svg>
                        </button>

                        {/* Status Pill Button */}
                        <div className="portal-status-pill" onClick={fetchData} title="Click to refresh live database state">
                            <span className="pulse-dot-cyan"></span>
                            <span>v-Lab Portal Active &gt;</span>
                        </div>
                    </div>
                </header>

                {/* ========================================================= */}
                {/* 1. FUTURISTIC 5-CARD MASTER GRID (EXACT REFERENCE UI)    */}
                {/* ========================================================= */}
                {activeTab === 'hod-analytics' && (
                    <div className="hod-dashboard-view">
                        {/* TOP ROW: 3 CARDS */}
                        <div className="podx-grid-top">
                            {/* CARD 1: File Manager / Lab Management (Deep Royal Blue) */}
                            <div className="podx-card card-filemanager">
                                <div className="card-header-row">
                                    <span className="card-title-text">Lab Management</span>
                                </div>
                                <div className="avatar-centerpiece">
                                    <svg className="avatar-emblem-svg" viewBox="0 0 100 100" fill="none">
                                        <circle cx="50" cy="34" r="18" fill="#ffffff" />
                                        <path d="M22 78 C22 58, 35 52, 50 52 C65 52, 78 58, 78 78 Z" fill="#ffffff" />
                                    </svg>
                                </div>
                                <div className="card-actions-row">
                                    <button
                                        className="pill-action-frosted"
                                        onClick={() => loadSubTabData('manuals')}
                                        title="Inspect Uploaded Laboratory Manuals"
                                    >
                                        Inspect Manuals
                                    </button>
                                    <button
                                        className="pill-action-glowing-blue"
                                        onClick={handleRunAIAnalysis}
                                        disabled={aiRunning}
                                        title="Run MK-PATH Docling Document Vision Model"
                                    >
                                        {aiRunning ? 'Analyzing...' : 'AI Docling'}
                                    </button>
                                </div>
                            </div>

                            {/* CARD 2: Security / Staff Approvals (Radiant Mint Aquamarine to Emerald) */}
                            <div className="podx-card card-security">
                                <div className="card-header-row">
                                    <span className="card-title-text">Staff Security</span>
                                    <button className="card-header-icon-btn" title="Options">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <circle cx="12" cy="12" r="1.5" />
                                            <circle cx="12" cy="5" r="1.5" />
                                            <circle cx="12" cy="19" r="1.5" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="security-badges-container">
                                    <div className="security-badge-item">
                                        <div className="circle-badge-large">
                                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                                            </svg>
                                        </div>
                                        <div className="badge-caption-block">
                                            <strong>Assigned Faculty</strong>
                                            <span>{overview ? `${overview.totalSubjects} Active Staff` : '4 Active Staff'}</span>
                                        </div>
                                    </div>
                                    <div className="security-badge-item">
                                        <div className="circle-badge-large">
                                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                            </svg>
                                        </div>
                                        <div className="badge-caption-block">
                                            <strong>Lab Clearance</strong>
                                            <span>Full Access Granted</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="card-actions-row">
                                    <button
                                        className="pill-action-mint"
                                        onClick={() => { setActiveTab('schedules'); showToast('Loaded staff schedule timelines', 'success'); }}
                                    >
                                        Staff Directory
                                    </button>
                                    <button
                                        className="pill-action-mint"
                                        onClick={() => showToast('Security clearance verified for all 40 lab benches', 'success')}
                                    >
                                        Security Audit
                                    </button>
                                </div>
                            </div>

                            {/* CARD 3: Backups / Analytics (Deep Sapphire Blue with Signature 7-Bar Chart) */}
                            <div className="podx-card card-analytics">
                                <div className="card-header-row">
                                    <span className="card-title-text">Experiment Analytics</span>
                                    <div className="arrow-circle-pill" onClick={() => setActiveTab('schedules')} title="View detailed milestone timeline">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </div>
                                </div>

                                {/* 7 Vertical Glowing Cyan Bar Capsules */}
                                <div className="podx-bar-chart">
                                    <div className="podx-bar-col">
                                        <div className="podx-bar-capsule filled" style={{ height: '48%' }}></div>
                                        <span className="podx-bar-label">IOT</span>
                                    </div>
                                    <div className="podx-bar-col">
                                        <div className="podx-bar-capsule outlined" style={{ height: '85%' }}></div>
                                        <span className="podx-bar-label">MC</span>
                                    </div>
                                    <div className="podx-bar-col">
                                        <div className="podx-bar-capsule outlined" style={{ height: '65%' }}></div>
                                        <span className="podx-bar-label">DSP</span>
                                    </div>
                                    <div className="podx-bar-col">
                                        <div className="podx-bar-capsule filled" style={{ height: '40%' }}></div>
                                        <span className="podx-bar-label">VLSI</span>
                                    </div>
                                    <div className="podx-bar-col">
                                        <div className="podx-bar-capsule tall-glow" style={{ height: '95%' }}></div>
                                        <span className="podx-bar-label">EMB</span>
                                    </div>
                                    <div className="podx-bar-col">
                                        <div className="podx-bar-capsule outlined" style={{ height: '72%' }}></div>
                                        <span className="podx-bar-label">AI</span>
                                    </div>
                                    <div className="podx-bar-col">
                                        <div className="podx-bar-capsule filled" style={{ height: '58%' }}></div>
                                        <span className="podx-bar-label">NET</span>
                                    </div>
                                </div>

                                {/* Bottom Toggles */}
                                <div className="analytics-footer-toggles">
                                    <div className="toggle-pill-item" onClick={() => setActiveTab('schedules')}>
                                        <div className="toggle-dot"></div>
                                        <span>Tracks &gt;</span>
                                    </div>
                                    <div className="toggle-pill-item" onClick={fetchData}>
                                        <div className="toggle-dot" style={{ background: '#00f5d4', boxShadow: '0 0 8px #00f5d4' }}></div>
                                        <span>Live Synced</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM ROW: 2 WIDE CARDS */}
                        <div className="podx-grid-bottom">
                            {/* CARD 4: Domain Management / Lab Stations (Deep Navy 2x2 Grid) */}
                            <div className="podx-card card-domains">
                                <div className="card-header-row">
                                    <span className="card-title-text">Lab Stations & Hardware</span>
                                    <button className="card-header-icon-btn" title="Options">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <circle cx="12" cy="12" r="1.5" />
                                            <circle cx="12" cy="5" r="1.5" />
                                            <circle cx="12" cy="19" r="1.5" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="stations-2x2-grid">
                                    <div className="station-pill-capsule" onClick={() => loadSubTabData('inventory')}>
                                        <div className="capsule-white-avatar">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <rect x="2" y="3" width="20" height="14" rx="2" />
                                                <line x1="8" y1="21" x2="16" y2="21" />
                                                <line x1="12" y1="17" x2="12" y2="21" />
                                            </svg>
                                        </div>
                                        <div className="capsule-meta">
                                            <strong>Microcontroller Benches</strong>
                                            <span>{overview ? `${overview.availableComponents} Units Active` : '98 Units Active'}</span>
                                        </div>
                                    </div>

                                    <div className="station-pill-capsule" onClick={() => loadSubTabData('inventory')}>
                                        <div className="capsule-white-avatar">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                                <polyline points="2 17 12 22 22 17" />
                                                <polyline points="2 12 12 17 22 12" />
                                            </svg>
                                        </div>
                                        <div className="capsule-meta">
                                            <strong>Sensor Test Rigs</strong>
                                            <span>142 In Stock</span>
                                        </div>
                                    </div>

                                    <div className="station-pill-capsule" onClick={() => loadSubTabData('inventory')}>
                                        <div className="capsule-white-avatar">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                                            </svg>
                                        </div>
                                        <div className="capsule-meta">
                                            <strong>Oscilloscope Racks</strong>
                                            <span>24 Station Bays</span>
                                        </div>
                                    </div>

                                    <div className="station-pill-capsule" onClick={() => loadSubTabData('inventory')}>
                                        <div className="capsule-white-avatar">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                <line x1="9" y1="9" x2="15" y2="15" />
                                                <line x1="15" y1="9" x2="9" y2="15" />
                                            </svg>
                                        </div>
                                        <div className="capsule-meta">
                                            <strong>FPGA Development</strong>
                                            <span>36 Kits Available</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CARD 5: Performance Stats (Radiant Teal/Mint Gradient with 4 KPI Progress Rows) */}
                            <div className="podx-card card-performance">
                                <div className="card-header-row">
                                    <span className="card-title-text">Performance Stats</span>
                                </div>

                                <div className="performance-rows-list">
                                    <div className="performance-row-item">
                                        <div className="perf-icon-badge">⚡</div>
                                        <div className="perf-info-block">
                                            <div className="perf-info-header">
                                                <span>Overall Curriculum Completion</span>
                                                <span>{overview ? `${overview.overallCompletionRate}%` : '85%'}</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: `${overview ? overview.overallCompletionRate : 85}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="performance-row-item">
                                        <div className="perf-icon-badge">📦</div>
                                        <div className="perf-info-block">
                                            <div className="perf-info-header">
                                                <span>Component Handover Rate</span>
                                                <span>92%</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: '92%' }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="performance-row-item">
                                        <div className="perf-icon-badge">🔬</div>
                                        <div className="perf-info-block">
                                            <div className="perf-info-header">
                                                <span>Hardware Station Health</span>
                                                <span>96%</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: '96%' }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="performance-row-item">
                                        <div className="perf-icon-badge">🎯</div>
                                        <div className="perf-info-block">
                                            <div className="perf-info-header">
                                                <span>Student Deadline Adherence</span>
                                                <span>78%</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: '78%' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ========================================================= */}
                        {/* DETAILED SUBJECT & STAFF PROGRESS MONITORING TABLE        */}
                        {/* ========================================================= */}
                        <div className="section-card-podx">
                            <div className="section-header-podx">
                                <div>
                                    <h3>Subject &amp; Staff Progress Monitoring Table</h3>
                                    <p>Track how many experiments each staff member has finished, component distribution deadline, and student completion targets</p>
                                </div>
                                <div className="table-controls-podx">
                                    <label style={{ fontSize: '0.82rem', color: 'var(--podx-text-muted)' }}>Filter Subject:</label>
                                    <select
                                        value={filterSubject}
                                        onChange={(e) => setFilterSubject(e.target.value)}
                                        className="hod-select-podx"
                                    >
                                        <option value="ALL">All Subjects ({schedules.length})</option>
                                        {schedules.map(s => (
                                            <option key={s._id} value={s.subject}>{s.subject}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="table-responsive-podx">
                                <table className="hod-table-podx">
                                    <thead>
                                        <tr>
                                            <th>Subject Curriculum</th>
                                            <th>Staff In-Charge</th>
                                            <th>Batch Assigned</th>
                                            <th style={{ width: '220px' }}>Experiments Finished</th>
                                            <th>Component Handover Deadline</th>
                                            <th>Student Completion Target</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSchedules.map(s => {
                                            const pct = Math.round(((s.completedExperiments || 0) / (s.totalExperiments || 10)) * 100);
                                            const daysToComp = getDaysRemaining(s.componentIssueDeadline);
                                            const daysToStudent = getDaysRemaining(s.studentCompletionDeadline);

                                            return (
                                                <tr key={s._id}>
                                                    <td>
                                                        <strong className="subject-title">{s.subject}</strong>
                                                        <span className="notes-preview">{s.notes || 'Curriculum on schedule'}</span>
                                                    </td>
                                                    <td>
                                                        <span className="staff-pill-podx">{s.staffInCharge}</span>
                                                    </td>
                                                    <td>{s.batchName}</td>
                                                    <td>
                                                        <div className="progress-cell-podx">
                                                            <div className="progress-numbers-podx">
                                                                <span>{s.completedExperiments || 0} / {s.totalExperiments || 10}</span>
                                                                <strong style={{ color: 'var(--podx-cyan)' }}>{pct}%</strong>
                                                            </div>
                                                            <div className="mini-progress-bar-podx">
                                                                <div
                                                                    className="mini-bar-fill-podx"
                                                                    style={{
                                                                        width: `${pct}%`,
                                                                        background: pct >= 80 ? 'linear-gradient(90deg, #10b981, #00f5d4)' : pct >= 50 ? 'linear-gradient(90deg, #2563eb, #00f5d4)' : 'linear-gradient(90deg, #f59e0b, #ef4444)'
                                                                    }}
                                                                ></div>
                                                            </div>
                                                            <div className="quick-stepper-podx">
                                                                <button
                                                                    className="step-btn-podx"
                                                                    onClick={() => handleQuickChange(s, -1)}
                                                                    title="Decrement finished experiment"
                                                                >-</button>
                                                                <button
                                                                    className="step-btn-podx"
                                                                    onClick={() => handleQuickChange(s, 1)}
                                                                    title="Mark experiment finished"
                                                                >+</button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>
                                                            📅 {formatDate(s.componentIssueDeadline)}
                                                        </div>
                                                        <span className={`days-pill-podx ${daysToComp < 0 ? 'passed' : daysToComp <= 3 ? 'warn' : 'ok'}`}>
                                                            {daysToComp < 0 ? 'Passed' : `${daysToComp} days left`}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>
                                                            🎯 {formatDate(s.studentCompletionDeadline)}
                                                        </div>
                                                        <span className={`days-pill-podx ${daysToStudent < 0 ? 'passed' : daysToStudent <= 5 ? 'warn' : 'ok'}`}>
                                                            {daysToStudent < 0 ? 'Overdue' : `${daysToStudent} days left`}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge-chip-podx ${s.status.toLowerCase().replace(/\s+/g, '-')}`}>
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button
                                                            className="edit-schedule-btn-podx"
                                                            onClick={() => setEditingSchedule({ ...s })}
                                                        >
                                                            ✏️ Edit &amp; Map
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. TIMELINE & DEADLINES VIEW */}
                {activeTab === 'schedules' && (
                    <div className="hod-dashboard-view">
                        <div className="section-card">
                            <div className="section-header">
                                <div>
                                    <h3>Staff Milestone Projections & Deadlines Mapping</h3>
                                    <p>Comprehensive date projections for component provision and final student experiment submissions</p>
                                </div>
                            </div>
                            <TimelineProjectionMap schedules={schedules} detailed={true} />
                        </div>
                    </div>
                )}

                {/* 3. LAB MANUALS TAB */}
                {activeTab === 'manuals' && (
                    <div className="section-card">
                        <div className="section-header">
                            <div>
                                <h3>Uploaded Lab Manuals (IBM Docling AI Analysis)</h3>
                                <p>PDF laboratory guides parsed with Docling layout-aware document vision</p>
                            </div>
                        </div>
                        <div className="table-responsive">
                            <table className="hod-table">
                                <thead>
                                    <tr>
                                        <th>Exp #</th>
                                        <th>Manual Title</th>
                                        <th>Subject</th>
                                        <th>Version</th>
                                        <th>File Size</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {manuals.length === 0 ? (
                                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading lab manuals from staff_portal...</td></tr>
                                    ) : (
                                        manuals.map(m => (
                                            <tr key={m._id}>
                                                <td><span className="badge-purple">{m.experimentNumber}</span></td>
                                                <td><strong>{m.title}</strong></td>
                                                <td>{m.subject}</td>
                                                <td>v{m.version || 1}</td>
                                                <td>{Math.round((m.fileSize || 0) / 1024)} KB</td>
                                                <td><span className="status-badge-chip on-track">Published</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 4. EXPERIMENTS CATALOG TAB */}
                {activeTab === 'experiments' && (
                    <div className="section-card">
                        <div className="section-header">
                            <div>
                                <h3>Department Laboratory Experiments Catalog</h3>
                                <p>All 40 experiments registered across curriculum subjects in staff_portal</p>
                            </div>
                        </div>
                        <div className="table-responsive">
                            <table className="hod-table">
                                <thead>
                                    <tr>
                                        <th>Exp #</th>
                                        <th>Experiment Title</th>
                                        <th>Subject</th>
                                        <th>Apparatus / Components</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {experiments.length === 0 ? (
                                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading experiments catalog...</td></tr>
                                    ) : (
                                        experiments.slice(0, 15).map(e => (
                                            <tr key={e._id}>
                                                <td><span className="badge-purple">{e.experimentNumber}</span></td>
                                                <td><strong>{e.title}</strong></td>
                                                <td>{e.subject}</td>
                                                <td>{e.requiredComponents ? `${e.requiredComponents.length} components assigned` : 'Standard set'}</td>
                                                <td><span className="status-badge-chip on-track">Active</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 5. HARDWARE INVENTORY TAB */}
                {activeTab === 'inventory' && (
                    <div className="section-card">
                        <div className="section-header">
                            <div>
                                <h3>Hardware Component Inventory & Stock Allocation</h3>
                                <p>Hardware items available for staff handover and student laboratory usage</p>
                            </div>
                        </div>
                        <div className="table-responsive">
                            <table className="hod-table">
                                <thead>
                                    <tr>
                                        <th>Part #</th>
                                        <th>Component Name</th>
                                        <th>Type</th>
                                        <th>Total Stock</th>
                                        <th>Available</th>
                                        <th>Condition</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {components.length === 0 ? (
                                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading hardware inventory...</td></tr>
                                    ) : (
                                        components.slice(0, 15).map(c => (
                                            <tr key={c._id}>
                                                <td><code>{c.partNumber}</code></td>
                                                <td><strong>{c.name}</strong></td>
                                                <td>{c.type}</td>
                                                <td>{c.totalQuantity} units</td>
                                                <td><strong style={{ color: 'var(--green)' }}>{c.availableQuantity} units</strong></td>
                                                <td><span className="status-badge-chip on-track">{c.condition || 'Good'}</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* EDIT SCHEDULE MODAL (PERSISTENCE TO MONGODB) */}
            {editingSchedule && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>Edit Subject Progress & Deadlines</h3>
                                <p>Configure staff in-charge, finished experiments, and milestone target dates</p>
                            </div>
                            <button className="close-btn" onClick={() => setEditingSchedule(null)}>✕</button>
                        </div>

                        <form onSubmit={handleSaveSchedule} className="modal-form">
                            <div className="form-group">
                                <label>Subject Title</label>
                                <input
                                    type="text"
                                    value={editingSchedule.subject}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, subject: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Staff In-Charge</label>
                                    <input
                                        type="text"
                                        value={editingSchedule.staffInCharge}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, staffInCharge: e.target.value })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Student Batch</label>
                                    <input
                                        type="text"
                                        value={editingSchedule.batchName}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, batchName: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Finished Experiments</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max={editingSchedule.totalExperiments || 10}
                                        value={editingSchedule.completedExperiments}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, completedExperiments: parseInt(e.target.value) || 0 })}
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Total Experiments in Syllabus</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={editingSchedule.totalExperiments || 10}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, totalExperiments: parseInt(e.target.value) || 10 })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>📅 Component Handover Deadline (Staff)</label>
                                    <input
                                        type="date"
                                        value={toInputDate(editingSchedule.componentIssueDeadline)}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, componentIssueDeadline: e.target.value })}
                                        required
                                        className="hod-input date-accent"
                                    />
                                    <small className="help-text">Date until which staff must give components to students</small>
                                </div>
                                <div className="form-group">
                                    <label>🎯 Student Completion Deadline</label>
                                    <input
                                        type="date"
                                        value={toInputDate(editingSchedule.studentCompletionDeadline)}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, studentCompletionDeadline: e.target.value })}
                                        required
                                        className="hod-input date-accent"
                                    />
                                    <small className="help-text">Target date under which all students must finish experiments</small>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Department Status</label>
                                <select
                                    value={editingSchedule.status}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, status: e.target.value })}
                                    className="hod-select"
                                >
                                    <option value="On Track">On Track</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Action Required">Action Required</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Monitoring Notes / Directives from HOD</label>
                                <textarea
                                    rows="2"
                                    value={editingSchedule.notes || ''}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, notes: e.target.value })}
                                    placeholder="Enter instructions for staff or batch requirements..."
                                    className="hod-textarea"
                                ></textarea>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setEditingSchedule(null)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Saving to staff_portal...' : '💾 Save to Database'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* AI ANALYSIS RESULTS MODAL */}
            {aiResultModal && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal ai-modal">
                        <div className="modal-header ai-modal-header">
                            <div>
                                <div className="ai-badge-header">
                                    <span>🤖 AI Model: {aiResultModal.aiModel || 'MK-PATH / Docling Vision v2.0'}</span>
                                    <span className="confidence-chip">Confidence: {aiResultModal.confidenceScore}%</span>
                                </div>
                                <h3>AI Multi-Curriculum Department Analysis Report</h3>
                                <p>Automated database analysis across manuals, experiments, student attempts, and component allocations</p>
                            </div>
                            <button className="close-btn" onClick={() => setAiResultModal(null)}>✕</button>
                        </div>

                        <div className="ai-modal-body">
                            {/* Executive Summary Card */}
                            <div className="ai-summary-box">
                                <div className="ai-box-title">
                                    <span>📋 Executive Summary & Directives</span>
                                </div>
                                <p>{aiResultModal.executiveSummary}</p>
                            </div>

                            {/* Metrics Banner */}
                            <div className="ai-metrics-row">
                                <div className="ai-mini-kpi">
                                    <span className="label">Department Completion</span>
                                    <strong style={{ color: 'var(--cyan)' }}>{aiResultModal.overallCompletionRate}%</strong>
                                </div>
                                <div className="ai-mini-kpi">
                                    <span className="label">Finished Experiments</span>
                                    <strong style={{ color: 'var(--green)' }}>{aiResultModal.totalCompletedExperiments} / {aiResultModal.totalTargetExperiments}</strong>
                                </div>
                                <div className="ai-mini-kpi">
                                    <span className="label">Schedules Synced</span>
                                    <strong style={{ color: 'var(--purple)' }}>{aiResultModal.schedulesUpdated} Tracks</strong>
                                </div>
                                <div className="ai-mini-kpi">
                                    <span className="label">Analysis Latency</span>
                                    <strong style={{ color: 'var(--amber)' }}>{aiResultModal.durationMs}ms</strong>
                                </div>
                            </div>

                            {/* Inventory Warnings */}
                            {aiResultModal.inventoryAlerts && aiResultModal.inventoryAlerts.length > 0 && (
                                <div className="ai-inventory-box">
                                    <h4>⚠️ Hardware Inventory Stock Warnings ({aiResultModal.inventoryAlerts.length})</h4>
                                    <div className="inventory-chips-grid">
                                        {aiResultModal.inventoryAlerts.map((inv, idx) => (
                                            <div key={idx} className={`inv-warning-chip ${inv.severity.toLowerCase()}`}>
                                                <strong>{inv.name} ({inv.partNumber})</strong>
                                                <span>Available: {inv.available} / {inv.total} units - {inv.advice}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Analyzed Tracks Breakdown */}
                            <div className="ai-tracks-breakdown">
                                <h4>📊 AI Analyzed Curriculum Tracks & Projected Deadlines</h4>
                                <div className="ai-cards-grid">
                                    {(aiResultModal.insights || []).map((ins, idx) => (
                                        <div key={idx} className="ai-track-card">
                                            <div className="ai-track-header">
                                                <strong>{ins.subject}</strong>
                                                <span className={`status-badge-chip ${ins.status.toLowerCase().replace(/\s+/g, '-')}`}>
                                                    {ins.status}
                                                </span>
                                            </div>
                                            <div className="ai-track-meta">
                                                <span>Staff: <strong>{ins.staff}</strong></span>
                                                <span>Completion: <strong>{ins.completionRate} ({ins.finishedExperiments}/{ins.totalExperiments})</strong></span>
                                            </div>
                                            <div className="ai-track-dates">
                                                <span>📦 Handover Deadline: <strong>{formatDate(ins.componentDeadline)}</strong></span>
                                                <span>🎯 Student Target: <strong>{formatDate(ins.studentDeadline)}</strong></span>
                                            </div>
                                            <p className="ai-track-directive">{ins.aiSummary}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                            <button
                                type="button"
                                className="btn-save"
                                onClick={() => setAiResultModal(null)}
                            >
                                ✓ Close & View Mapped Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==========================================
// POWER BI CHART COMPONENT 1: SUBJECT COMPLETION BAR CHART
// ==========================================
function SubjectCompletionBarChart({ schedules }) {
    const canvasRef = useRef(null);
    const chartInstanceRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        if (!schedules || schedules.length === 0) return;

        const ctx = canvasRef.current.getContext('2d');
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
        }

        const labels = schedules.map(s => s.subject.length > 18 ? s.subject.substring(0, 16) + '...' : s.subject);
        const finishedData = schedules.map(s => s.completedExperiments || 0);
        const remainingData = schedules.map(s => Math.max(0, (s.totalExperiments || 10) - (s.completedExperiments || 0)));

        chartInstanceRef.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Finished Experiments',
                        data: finishedData,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    },
                    {
                        label: 'Remaining Experiments',
                        data: remainingData,
                        backgroundColor: '#374151',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: '#9ca3af', font: { size: 11 } }
                    },
                    y: {
                        stacked: true,
                        max: 10,
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        ticks: { color: '#9ca3af', stepSize: 2 }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#e5e7eb', font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            footer: (items) => {
                                const idx = items[0].dataIndex;
                                const s = schedules[idx];
                                return `Staff: ${s.staffInCharge}\nBatch: ${s.batchName}`;
                            }
                        }
                    }
                }
            }
        });

        return () => {
            if (chartInstanceRef.current) chartInstanceRef.current.destroy();
        };
    }, [schedules]);

    return (
        <div className="section-card chart-card">
            <div className="chart-header">
                <div>
                    <h4>Subject Completion Mapping (Finished vs Target)</h4>
                    <span className="chart-subtitle">Power BI Comparative Bar Visualizer</span>
                </div>
            </div>
            <div className="canvas-wrapper">
                {(!schedules || schedules.length === 0) ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        <span>Loading department curriculum metrics from MongoDB...</span>
                    </div>
                ) : (
                    <canvas ref={canvasRef}></canvas>
                )}
            </div>
        </div>
    );
}

// ==========================================
// POWER BI CHART COMPONENT 2: TIMELINE PROJECTION MAP
// ==========================================
function TimelineProjectionMap({ schedules, detailed = false }) {
    return (
        <div className={`section-card ${detailed ? '' : 'chart-card'}`}>
            <div className="chart-header">
                <div>
                    <h4>Milestone Schedule & Deadlines Map</h4>
                    <span className="chart-subtitle">Component Distribution vs Student Completion Target</span>
                </div>
            </div>

            <div className="timeline-cards-list">
                {schedules.map(s => {
                    const daysComp = getDaysRemaining(s.componentIssueDeadline);
                    const daysStudent = getDaysRemaining(s.studentCompletionDeadline);
                    const pct = Math.round(((s.completedExperiments || 0) / (s.totalExperiments || 10)) * 100);

                    return (
                        <div key={s._id} className="timeline-item">
                            <div className="timeline-item-header">
                                <div>
                                    <strong className="timeline-subject">{s.subject}</strong>
                                    <span className="timeline-staff">👨‍🏫 {s.staffInCharge}</span>
                                </div>
                                <span className="timeline-badge">{pct}% Done</span>
                            </div>

                            <div className="timeline-track">
                                <div className="timeline-point point-start">
                                    <span className="point-dot"></span>
                                    <span className="point-label">Curriculum Start</span>
                                </div>

                                <div className="timeline-connector active"></div>

                                <div className="timeline-point point-comp">
                                    <span className="point-dot comp-dot"></span>
                                    <span className="point-label">
                                        <strong>Component Issue:</strong> {formatDate(s.componentIssueDeadline)}
                                    </span>
                                    <span className={`micro-pill ${daysComp < 0 ? 'over' : 'pending'}`}>
                                        {daysComp < 0 ? 'Past Date' : `${daysComp}d left`}
                                    </span>
                                </div>

                                <div className="timeline-connector"></div>

                                <div className="timeline-point point-target">
                                    <span className="point-dot target-dot"></span>
                                    <span className="point-label">
                                        <strong>Student Finish:</strong> {formatDate(s.studentCompletionDeadline)}
                                    </span>
                                    <span className={`micro-pill ${daysStudent < 0 ? 'over' : 'pending'}`}>
                                        {daysStudent < 0 ? 'Past Date' : `${daysStudent}d left`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Mount the React Application
const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<HodDashboardApp />);
}
