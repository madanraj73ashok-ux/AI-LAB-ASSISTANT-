/**
 * HOD EXECUTIVE CONTROL PANEL - PODX (Power BI React Application)
 * Built with React 18 & Chart.js
 * Strictly connected to MongoDB (staff_portal & student_portal)
 * Zero hardcoded figures, zero placeholder buttons, full CRUD operations.
 */

const { useState, useEffect, useMemo, useRef } = React;

const API_BASE = '/api/staff';

function getAuthHeaders() {
    const user = localStorage.getItem('username') || 'admin';
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

function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
// MAIN HOD CONTROL PANEL APPLICATION
// ==========================================
function HodDashboardApp() {
    const currentUser = localStorage.getItem('username') || 'admin';

    // Core Data States
    const [overview, setOverview] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [facultyList, setFacultyList] = useState([]);
    const [components, setComponents] = useState([]);
    const [experiments, setExperiments] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [curriculumSubjects, setCurriculumSubjects] = useState([]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('hod-analytics');
    const [filterSubject, setFilterSubject] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [toast, setToast] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Department Settings (Admin / HOD)
    const [departmentMeta, setDepartmentMeta] = useState({
        departmentName: 'Department of Electrical & Computer Engineering',
        hodName: 'Admin (HOD)',
        academicYear: 'Academic Year 2026-2027 (Semester V)',
        announcement: 'All staff members are instructed to complete component handovers by the target deadline.',
        lastUpdatedBy: 'admin'
    });
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

    // Schedule / Milestone Modals
    const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [newSchedule, setNewSchedule] = useState({
        subject: '',
        staffInCharge: 'Prof. Faculty Member',
        batchName: 'Section General',
        milestone: 'Hardware Demonstration & Circuit Handover',
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        totalExperiments: 10,
        completedExperiments: 0,
        componentIssueDeadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        studentCompletionDeadline: new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
        status: 'In Progress',
        notes: ''
    });

    // Faculty Modals
    const [isAddFacultyModalOpen, setIsAddFacultyModalOpen] = useState(false);
    const [editingFaculty, setEditingFaculty] = useState(null);
    const [newFaculty, setNewFaculty] = useState({
        name: '',
        email: '',
        username: '',
        password: '',
        assignedSubjects: '',
        status: 'Active',
        securityClearance: true
    });

    // Hardware Stock Modals
    const [isAddComponentModalOpen, setIsAddComponentModalOpen] = useState(false);
    const [editingComponent, setEditingComponent] = useState(null);
    const [adjustingComponent, setAdjustingComponent] = useState(null);
    const [adjustStockForm, setAdjustStockForm] = useState({ quantityChange: 1, remarks: 'Restocking' });
    const [newComponent, setNewComponent] = useState({
        name: '',
        partNumber: '',
        type: 'Electronic Components',
        rackNumber: 'Rack-A1',
        totalQuantity: 25,
        minimumStockLevel: 5,
        condition: 'Good',
        specifications: ''
    });

    // Curriculum Modals
    const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState(false);
    const [newSubject, setNewSubject] = useState({ subjectName: '', staffInCharge: 'Prof. Faculty Member' });
    const [isAddExperimentModalOpen, setIsAddExperimentModalOpen] = useState(false);
    const [editingCurriculumExp, setEditingCurriculumExp] = useState(null);
    const [curriculumExpForm, setCurriculumExpForm] = useState({
        experimentNumber: '',
        title: '',
        subject: '',
        staffInCharge: 'Prof. Faculty Member',
        aim: '',
        description: '',
        requiredComponents: [
            { componentName: 'Operational Amplifier IC 741', partNumber: 'IC-LM741', quantity: 2, notes: '8-pin DIP' }
        ]
    });

    // Upload or Add Files Modal State (Matching Beta Screenshot + Enrolled Students Roster)
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadSubject, setUploadSubject] = useState('Electronic Circuits Lab');
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadDepartment, setUploadDepartment] = useState('ECE');
    const [uploadYear, setUploadYear] = useState('All');
    const [uploadSection, setUploadSection] = useState('All');
    const [studentSearch, setStudentSearch] = useState('');
    const [allStudents, setAllStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const fileInputRef = useRef(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Load Overview Data from Backend
    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/hod/overview`, { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success && json.data) {
                setOverview(json.data);
                setSchedules(json.data.schedules || []);
                if (json.data.departmentName) {
                    setDepartmentMeta({
                        departmentName: json.data.departmentName || 'Department of Electrical & Computer Engineering',
                        hodName: json.data.hodName || 'Admin (HOD)',
                        academicYear: json.data.academicYear || 'Academic Year 2026-2027',
                        announcement: json.data.announcement || '',
                        lastUpdatedBy: json.data.lastUpdatedBy || 'admin'
                    });
                }
            }
        } catch (err) {
            console.error('Failed to load HOD metrics:', err);
            showToast('Failed to load HOD department data from MongoDB', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Lazy loader for specific views
    const loadTabData = async (tab) => {
        setActiveTab(tab);
        try {
            if (tab === 'faculty') {
                const res = await fetch(`${API_BASE}/faculty`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setFacultyList(json.data || []);
            } else if (tab === 'inventory') {
                const res = await fetch(`${API_BASE}/components`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setComponents(json.data || []);
            } else if (tab === 'experiments') {
                const res = await fetch(`${API_BASE}/experiments`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setExperiments(json.data || []);
            } else if (tab === 'security') {
                const [fRes, aRes] = await Promise.all([
                    fetch(`${API_BASE}/faculty`, { headers: getAuthHeaders() }),
                    fetch(`${API_BASE}/audit-logs`, { headers: getAuthHeaders() })
                ]);
                const [fJson, aJson] = await Promise.all([fRes.json(), aRes.json()]);
                if (fJson.success) setFacultyList(fJson.data || []);
                if (aJson.success) setAuditLogs(aJson.data || []);
            } else if (tab === 'curriculum') {
                const [sRes, eRes] = await Promise.all([
                    fetch(`${API_BASE}/curriculum/subjects`, { headers: getAuthHeaders() }),
                    fetch(`${API_BASE}/experiments`, { headers: getAuthHeaders() })
                ]);
                const [sJson, eJson] = await Promise.all([sRes.json(), eRes.json()]);
                if (sJson.success) setCurriculumSubjects(sJson.data || []);
                if (eJson.success) setExperiments(eJson.data || []);
            } else if (tab === 'students') {
                const res = await fetch(`${API_BASE}/students`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setAllStudents(json.data || []);
            }
        } catch (e) {
            console.error('Tab data load error:', e);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // -------------------------------------------------------------
    // UPLOAD OR ADD FILES MODAL HANDLERS & STUDENT FILTERING
    // -------------------------------------------------------------
    const openUploadModal = async () => {
        setIsUploadModalOpen(true);
        setUploadFile(null);
        setUploadProgress(null);
        setStudentSearch('');
        try {
            setStudentsLoading(true);
            const res = await fetch(`${API_BASE}/students`, { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success && json.data) {
                setAllStudents(json.data);
            }
        } catch (e) {
            console.error('Error fetching students for upload modal:', e);
        } finally {
            setStudentsLoading(false);
        }
    };

    const filteredUploadStudents = useMemo(() => {
        return allStudents.filter(s => {
            const matchesYear = uploadYear === 'All' || s.year === uploadYear;
            const matchesSection = uploadSection === 'All' || s.section === uploadSection;
            const matchesDept = uploadDepartment === 'All' || s.department === uploadDepartment;
            const matchesSearch = !studentSearch.trim() || 
                (s.name && s.name.toLowerCase().includes(studentSearch.toLowerCase())) ||
                (s.username && s.username.toLowerCase().includes(studentSearch.toLowerCase())) ||
                (s.registerNumber && s.registerNumber.toLowerCase().includes(studentSearch.toLowerCase())) ||
                (s.registrationId && s.registrationId.toLowerCase().includes(studentSearch.toLowerCase()));
            return matchesYear && matchesSection && matchesDept && matchesSearch;
        });
    }, [allStudents, uploadYear, uploadSection, uploadDepartment, studentSearch]);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const f = e.dataTransfer.files[0];
            setUploadFile(f);
            if (!uploadTitle) {
                setUploadTitle(f.name.replace(/\.[^/.]+$/, ''));
            }
        }
    };

    const handleUploadModalSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!uploadFile) {
            showToast('Please select a file or PDF lab manual to upload', 'error');
            return;
        }

        try {
            setIsSaving(true);
            setUploadProgress('uploading');
            showToast(`Uploading "${uploadFile.name}" directly to Google Drive...`, 'info');

            const formData = new FormData();
            formData.append('manual', uploadFile);
            formData.append('subject', uploadSubject);
            formData.append('title', uploadTitle || uploadFile.name.replace(/\.[^/.]+$/, ''));
            formData.append('targetYear', uploadYear);
            formData.append('targetSection', uploadSection);
            formData.append('targetDepartment', uploadDepartment);
            formData.append('assignedStudentsCount', filteredUploadStudents.length);

            const headers = getAuthHeaders();
            delete headers['Content-Type'];

            const res = await fetch(`${API_BASE}/manuals/upload`, {
                method: 'POST',
                headers,
                body: formData
            });

            const json = await res.json();
            if (json.success) {
                setUploadProgress('done');
                showToast(`✓ Uploaded to Google Drive & auto-extracted ${json.data?.experimentsCount || 0} experiments for ${filteredUploadStudents.length} students!`, 'success');
                setIsUploadModalOpen(false);
                setUploadFile(null);
                setUploadProgress(null);
                await loadTabData('experiments');
            } else {
                setUploadProgress(null);
                showToast(json.message || 'Upload failed', 'error');
            }
        } catch (err) {
            setUploadProgress(null);
            showToast(err.message || 'Upload failed', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // -------------------------------------------------------------
    // LAB MANUAL & EXPERIMENT REANALYSIS ACTIONS
    // -------------------------------------------------------------
    const handleReanalyzeExperiment = async (expId, expNum) => {
        try {
            showToast(`Re-analysing manual for ${expNum}...`, 'info');
            const res = await fetch(`${API_BASE}/experiments/${expId}/reanalyze`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            if (json.success) {
                showToast(`✓ Re-analysed ${expNum}: refreshed ${json.data?.components?.length || 0} hardware components!`, 'success');
                await loadTabData('experiments');
            } else {
                showToast(json.message || 'Failed to re-analyse manual', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Error triggering manual reanalysis', 'error');
        }
    };

    const handleUploadManualToDrive = async (file) => {
        if (!file) return;
        setUploadFile(file);
        openUploadModal();
    };

    // -------------------------------------------------------------
    // FACULTY ACTIONS
    // -------------------------------------------------------------
    const handleCreateFaculty = async (e) => {
        e.preventDefault();
        if (!newFaculty.username || !newFaculty.password) {
            showToast('Username and password are required', 'error');
            return;
        }
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/faculty`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newFaculty)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Faculty member "${newFaculty.name || newFaculty.username}" added!`, 'success');
                setIsAddFacultyModalOpen(false);
                setNewFaculty({
                    name: '',
                    email: '',
                    username: '',
                    password: '',
                    assignedSubjects: '',
                    status: 'Active',
                    securityClearance: true
                });
                loadTabData('faculty');
            } else {
                showToast(json.message || 'Failed to add faculty', 'error');
            }
        } catch (err) {
            showToast('Error saving faculty member to MongoDB', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateFaculty = async (e) => {
        e.preventDefault();
        if (!editingFaculty) return;
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/faculty/${editingFaculty._id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(editingFaculty)
            });
            const json = await res.json();
            if (json.success) {
                showToast('Faculty member details updated in MongoDB!', 'success');
                setEditingFaculty(null);
                loadTabData('faculty');
            } else {
                showToast(json.message || 'Failed to update faculty', 'error');
            }
        } catch (err) {
            showToast('Error updating faculty member', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleFacultyStatus = async (id, currentStatus) => {
        try {
            const res = await fetch(`${API_BASE}/faculty/${id}/status`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Status toggled to ${json.data.status}`, 'success');
                loadTabData('faculty');
            }
        } catch (e) {
            showToast('Failed to toggle status', 'error');
        }
    };

    const handleToggleClearance = async (id, staffName) => {
        try {
            const res = await fetch(`${API_BASE}/faculty/${id}/clearance`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Security clearance for ${staffName} is now ${json.data.securityClearance ? 'Granted' : 'Revoked'}`, 'success');
                loadTabData(activeTab);
            }
        } catch (e) {
            showToast('Failed to toggle security clearance', 'error');
        }
    };

    // -------------------------------------------------------------
    // HARDWARE STOCK ACTIONS
    // -------------------------------------------------------------
    const handleCreateComponent = async (e) => {
        e.preventDefault();
        if (!newComponent.name) {
            showToast('Component name is required', 'error');
            return;
        }
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/components`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newComponent)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Hardware component "${newComponent.name}" added to stock!`, 'success');
                setIsAddComponentModalOpen(false);
                setNewComponent({
                    name: '',
                    partNumber: '',
                    type: 'Electronic Components',
                    rackNumber: 'Rack-A1',
                    totalQuantity: 25,
                    minimumStockLevel: 5,
                    condition: 'Good',
                    specifications: ''
                });
                loadTabData('inventory');
            } else {
                showToast(json.message || 'Failed to add component', 'error');
            }
        } catch (err) {
            showToast('Error saving hardware stock', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateComponent = async (e) => {
        e.preventDefault();
        if (!editingComponent) return;
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/components/${editingComponent._id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(editingComponent)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Component "${editingComponent.name}" updated!`, 'success');
                setEditingComponent(null);
                loadTabData('inventory');
            } else {
                showToast(json.message || 'Failed to update component', 'error');
            }
        } catch (err) {
            showToast('Error updating component', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAdjustStock = async (e) => {
        e.preventDefault();
        if (!adjustingComponent) return;
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/components/${adjustingComponent._id}/adjust`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(adjustStockForm)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Stock updated for ${adjustingComponent.name} (${adjustStockForm.quantityChange > 0 ? '+' : ''}${adjustStockForm.quantityChange})`, 'success');
                setAdjustingComponent(null);
                loadTabData('inventory');
            } else {
                showToast(json.message || 'Failed to adjust stock', 'error');
            }
        } catch (err) {
            showToast('Error adjusting component stock', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // -------------------------------------------------------------
    // SCHEDULE / MILESTONE ACTIONS
    // -------------------------------------------------------------
    const handleCreateSchedule = async (e) => {
        e.preventDefault();
        if (!newSchedule.subject) {
            showToast('Please specify subject and milestone', 'error');
            return;
        }
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/hod/schedules`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newSchedule)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Milestone for "${newSchedule.subject}" registered in MongoDB!`, 'success');
                setIsAddScheduleModalOpen(false);
                fetchData();
            } else {
                showToast(json.message || 'Failed to create milestone', 'error');
            }
        } catch (err) {
            showToast('Error creating milestone schedule in MongoDB', 'error');
        } finally {
            setIsSaving(false);
        }
    };

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
            showToast('Error saving to database', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleMilestoneStatus = async (id, currentStatus) => {
        const nextStatus = currentStatus === 'Done' ? 'Pending' : 'Done';
        try {
            const res = await fetch(`${API_BASE}/hod/schedules/${id}/status`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({ status: nextStatus })
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Milestone marked as ${nextStatus}!`, 'success');
                fetchData();
            }
        } catch (e) {
            showToast('Failed to toggle milestone status', 'error');
        }
    };

    const handleDeleteSchedule = async (id, subject) => {
        if (!window.confirm(`Delete milestone schedule for "${subject}" from MongoDB?`)) return;
        try {
            const res = await fetch(`${API_BASE}/hod/schedules/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Deleted milestone "${subject}"`, 'success');
                fetchData();
            }
        } catch (e) {
            showToast('Error deleting milestone from MongoDB', 'error');
        }
    };

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
                showToast(`Updated ${schedule.subject}: ${nextVal}/${schedule.totalExperiments} completed`, 'success');
                fetchData();
            }
        } catch (e) {
            showToast('Failed to update progress', 'error');
        }
    };

    // -------------------------------------------------------------
    // CURRICULUM ACTIONS
    // -------------------------------------------------------------
    const handleCreateSubject = async (e) => {
        e.preventDefault();
        if (!newSubject.subjectName) return;
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/curriculum/subjects`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newSubject)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Subject "${newSubject.subjectName}" added to curriculum!`, 'success');
                setIsAddSubjectModalOpen(false);
                setNewSubject({ subjectName: '', staffInCharge: 'Prof. Faculty Member' });
                loadTabData('curriculum');
            } else {
                showToast(json.message || 'Failed to add subject', 'error');
            }
        } catch (e) {
            showToast('Error creating subject in curriculum', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveCurriculumExperiment = async (e) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            const url = editingCurriculumExp
                ? `${API_BASE}/curriculum/experiments/${editingCurriculumExp._id}`
                : `${API_BASE}/curriculum/experiments`;
            const method = editingCurriculumExp ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: getAuthHeaders(),
                body: JSON.stringify(curriculumExpForm)
            });
            const json = await res.json();
            if (json.success) {
                showToast(`Saved experiment ${curriculumExpForm.experimentNumber} & apparatus requirements!`, 'success');
                setIsAddExperimentModalOpen(false);
                setEditingCurriculumExp(null);
                loadTabData('curriculum');
            } else {
                showToast(json.message || 'Failed to save experiment', 'error');
            }
        } catch (e) {
            showToast('Error saving experiment to database', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddApparatusRow = () => {
        setCurriculumExpForm(prev => ({
            ...prev,
            requiredComponents: [
                ...prev.requiredComponents,
                { componentName: '', partNumber: 'PRT-' + Math.floor(10000 + Math.random() * 90000), quantity: 1, notes: '' }
            ]
        }));
    };

    const handleRemoveApparatusRow = (index) => {
        setCurriculumExpForm(prev => ({
            ...prev,
            requiredComponents: prev.requiredComponents.filter((_, i) => i !== index)
        }));
    };

    const handleApparatusRowChange = (index, field, value) => {
        setCurriculumExpForm(prev => {
            const nextList = [...prev.requiredComponents];
            nextList[index] = { ...nextList[index], [field]: value };
            return { ...prev, requiredComponents: nextList };
        });
    };

    // Department Profile Save
    const handleSaveDepartmentProfile = async (e) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            const res = await fetch(`${API_BASE}/hod/profile`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(departmentMeta)
            });
            const json = await res.json();
            if (json.success) {
                showToast('Department Settings updated in MongoDB!', 'success');
                setIsProfileModalOpen(false);
                fetchData();
            } else {
                showToast(json.message || 'Failed to update department profile', 'error');
            }
        } catch (err) {
            showToast('Error saving department settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Logout
    const handleLogout = () => {
        localStorage.removeItem('username');
        localStorage.removeItem('role');
        sessionStorage.removeItem('currentStaffUser');
        window.location.href = 'index.html';
    };

    // Filtered schedules for Overview table
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
                (s.milestone && s.milestone.toLowerCase().includes(q)) ||
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
                    {/* 1. Overview */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'hod-analytics' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('hod-analytics'); fetchData(); }}
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

                    {/* 2. Staff Faculty */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'faculty' ? 'active' : ''}`}
                        onClick={() => loadTabData('faculty')}
                        title="Staff Faculty Management"
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

                    {/* 3. Hardware Stock */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                        onClick={() => loadTabData('inventory')}
                        title="Hardware Stock & Component Requisition"
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

                    {/* 4. Lab Security */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'security' ? 'active' : ''}`}
                        onClick={() => loadTabData('security')}
                        title="Staff Security Clearance & Audit Logs"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </div>
                        <span>Lab Security</span>
                    </button>

                    {/* 5. Experiments */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'experiments' ? 'active' : ''}`}
                        onClick={() => loadTabData('experiments')}
                        title="Department Experiments Catalog & Student Submissions"
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

                    {/* 6. Staff Timelines */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'schedules' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('schedules'); fetchData(); }}
                        title="Staff Milestone Deadlines & Tracking"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                            </svg>
                        </div>
                        <span>Staff Timelines</span>
                    </button>

                    {/* 7. Curriculum */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'curriculum' ? 'active' : ''}`}
                        onClick={() => loadTabData('curriculum')}
                        title="Curriculum Subjects & Apparatus Requirements"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                        </div>
                        <span>Curriculum</span>
                    </button>

                    {/* 8. Enrolled Students */}
                    <button
                        className={`nav-pill-btn ${activeTab === 'students' ? 'active' : ''}`}
                        onClick={() => loadTabData('students')}
                        title="Enrolled Students Roster with Register Numbers"
                    >
                        <div className="nav-circle-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <span>Students</span>
                    </button>
                </nav>

                {/* HOD Profile Bottom Card */}
                <div className="hod-user-card">
                    <div className="user-avatar-podx">
                        {currentUser === 'admin' ? 'AD' : currentUser.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="user-info-podx">
                        <strong>{currentUser === 'admin' ? 'Admin (HOD)' : currentUser}</strong>
                        <p>Executive Head of Dept</p>
                    </div>
                    <button
                        className="logout-icon-btn-podx"
                        onClick={handleLogout}
                        title="Sign Out to Login Portal"
                    >
                        ⎋
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="hod-main">
                {/* TOP NAVIGATION BAR */}
                <header className="podx-topbar">
                    <div className="topbar-title-block">
                        <h1>{departmentMeta.departmentName}</h1>
                        <p>{departmentMeta.academicYear} | Head of Dept: <strong>{departmentMeta.hodName}</strong> (Live MongoDB staff_portal)</p>
                    </div>

                    {/* Center Search Bar */}
                    <div className="topbar-search-pill">
                        <input
                            type="text"
                            placeholder="Search records, staff in-charge, part numbers..."
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
                        <button
                            className="upload-choose-btn"
                            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', border: 'none', padding: '7px 16px', fontSize: '0.84rem' }}
                            onClick={openUploadModal}
                            title="Upload or add files (PDF Lab Manuals to Google Drive)"
                        >
                            <span>📤 Upload or add files</span>
                            <span className="upload-modal-badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '1px 6px', fontSize: '0.65rem' }}>Beta</span>
                        </button>

                        <button
                            className="circular-action-btn"
                            title="Department Settings (Admin / HOD)"
                            onClick={() => setIsProfileModalOpen(true)}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </button>
                        <button
                            className="circular-action-btn"
                            title="Lab Security Clearance"
                            onClick={() => loadTabData('security')}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </button>
                        <button
                            className="circular-action-btn"
                            title="Hardware Stock Allocation"
                            onClick={() => loadTabData('inventory')}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            </svg>
                        </button>
                        <button
                            className="circular-action-btn"
                            title="Live Database Sync"
                            onClick={() => { fetchData(); showToast('Synchronized with live MongoDB database!', 'success'); }}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                            </svg>
                        </button>

                        <div className="portal-status-pill" onClick={fetchData} title="Click to refresh live database state">
                            <span className="pulse-dot-cyan"></span>
                            <span>v-Lab Portal Active &gt;</span>
                        </div>
                    </div>
                </header>

                {/* ========================================================= */}
                {/* 1. OVERVIEW TAB: 5-CARD MASTER GRID & MONITORING TABLE    */}
                {/* ========================================================= */}
                {activeTab === 'hod-analytics' && (
                    <div className="hod-dashboard-view">
                        <div className="podx-grid-top">
                            {/* CARD 1: Lab Management */}
                            <div className="podx-card card-filemanager">
                                <div className="card-header-row">
                                    <span className="card-title-text">Lab Management</span>
                                </div>
                                <div className="avatar-centerpiece" style={{ flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', width: '100%', marginTop: '0.5rem' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ffffff' }}>
                                                {overview ? overview.labManagement.totalLabs : '0'}
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Labs</span>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--podx-cyan)' }}>
                                                {overview ? overview.labManagement.totalExperiments : '0'}
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Experiments</span>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#38bdf8' }}>
                                                {overview ? overview.labManagement.activeSessions : '0'}
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Active Sessions</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="card-actions-row">
                                    <button
                                        className="pill-action-frosted"
                                        onClick={() => loadTabData('experiments')}
                                        title="View All Laboratory Experiments"
                                    >
                                        View Experiments
                                    </button>
                                    <button
                                        className="pill-action-glowing-blue"
                                        onClick={() => loadTabData('curriculum')}
                                        title="Manage Curriculum & Required Apparatus"
                                    >
                                        Curriculum
                                    </button>
                                </div>
                            </div>

                            {/* CARD 2: Staff Security */}
                            <div className="podx-card card-security">
                                <div className="card-header-row">
                                    <span className="card-title-text">Staff Security</span>
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
                                            <span>{overview ? `${overview.staffSecurity.activeStaffCount} Active Staff` : 'No data yet'}</span>
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
                                            <span>{overview ? `${overview.staffSecurity.clearedStaffCount} Cleared` : 'No data yet'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="card-actions-row">
                                    <button
                                        className="pill-action-mint"
                                        onClick={() => loadTabData('faculty')}
                                    >
                                        Staff Directory
                                    </button>
                                    <button
                                        className="pill-action-mint"
                                        onClick={() => loadTabData('security')}
                                    >
                                        Security Audit
                                    </button>
                                </div>
                            </div>

                            {/* CARD 3: Experiment Analytics */}
                            <div className="podx-card card-analytics">
                                <div className="card-header-row">
                                    <span className="card-title-text">Experiment Analytics</span>
                                    <div className="arrow-circle-pill" onClick={() => setActiveTab('schedules')} title="View milestone timeline">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Dynamic Bars from MongoDB */}
                                <div className="podx-bar-chart">
                                    {(!overview || !overview.analyticsBars || overview.analyticsBars.length === 0) ? (
                                        <div style={{ color: 'var(--podx-text-muted)', fontSize: '0.8rem', textAlign: 'center', width: '100%', margin: 'auto' }}>
                                            No data yet
                                        </div>
                                    ) : (
                                        overview.analyticsBars.map((bar, i) => (
                                            <div key={i} className="podx-bar-col" title={`${bar.subject}: ${bar.completed}/${bar.total} completed (${bar.pct}%)`}>
                                                <div
                                                    className={`podx-bar-capsule ${bar.pct >= 80 ? 'tall-glow' : bar.pct >= 40 ? 'filled' : 'outlined'}`}
                                                    style={{ height: `${Math.max(15, bar.pct)}%` }}
                                                ></div>
                                                <span className="podx-bar-label">{bar.code}</span>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="analytics-footer-toggles">
                                    <div className="toggle-pill-item" onClick={() => setActiveTab('schedules')}>
                                        <div className="toggle-dot"></div>
                                        <span>Milestones &gt;</span>
                                    </div>
                                    <div className="toggle-pill-item" onClick={fetchData}>
                                        <div className="toggle-dot" style={{ background: '#00f5d4', boxShadow: '0 0 8px #00f5d4' }}></div>
                                        <span>Live Synced</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM ROW: 2 CARDS */}
                        <div className="podx-grid-bottom">
                            {/* CARD 4: Lab Stations & Hardware */}
                            <div className="podx-card card-domains">
                                <div className="card-header-row">
                                    <span className="card-title-text">Lab Stations & Hardware</span>
                                </div>

                                <div className="stations-2x2-grid">
                                    {(!overview || !overview.stations || overview.stations.length === 0) ? (
                                        <div style={{ color: 'var(--podx-text-muted)', padding: '1rem' }}>No data yet</div>
                                    ) : (
                                        overview.stations.map((st, i) => (
                                            <div key={i} className="station-pill-capsule" onClick={() => loadTabData('inventory')} title="Click to view hardware stock">
                                                <div className="capsule-white-avatar">
                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                                        <line x1="8" y1="21" x2="16" y2="21" />
                                                        <line x1="12" y1="17" x2="12" y2="21" />
                                                    </svg>
                                                </div>
                                                <div className="capsule-meta">
                                                    <strong>{st.title}</strong>
                                                    <span>{st.availableUnits} Available / {st.totalUnits} Total</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* CARD 5: Performance Stats */}
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
                                                <span>{overview ? `${overview.performanceStats.overallCompletionRate}%` : 'No data yet'}</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: `${overview ? overview.performanceStats.overallCompletionRate : 0}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="performance-row-item">
                                        <div className="perf-icon-badge">📦</div>
                                        <div className="perf-info-block">
                                            <div className="perf-info-header">
                                                <span>Component Handover Rate</span>
                                                <span>{overview ? `${overview.performanceStats.componentHandoverRate}%` : 'No data yet'}</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: `${overview ? overview.performanceStats.componentHandoverRate : 0}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="performance-row-item">
                                        <div className="perf-icon-badge">🔬</div>
                                        <div className="perf-info-block">
                                            <div className="perf-info-header">
                                                <span>Hardware Station Health</span>
                                                <span>{overview ? `${overview.performanceStats.hardwareHealthRate}%` : 'No data yet'}</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: `${overview ? overview.performanceStats.hardwareHealthRate : 0}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="performance-row-item">
                                        <div className="perf-icon-badge">🎯</div>
                                        <div className="perf-info-block">
                                            <div className="perf-info-header">
                                                <span>Student Assessment Pass Rate</span>
                                                <span>{overview ? `${overview.performanceStats.studentPassRate}%` : 'No data yet'}</span>
                                            </div>
                                            <div className="perf-progress-track">
                                                <div className="perf-progress-fill" style={{ width: `${overview ? overview.performanceStats.studentPassRate : 0}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* DETAILED SUBJECT & STAFF PROGRESS MONITORING TABLE */}
                        <div className="section-card-podx">
                            <div className="section-header-podx">
                                <div>
                                    <h3>Subject &amp; Staff Progress Monitoring Table</h3>
                                    <p>Track experiment completions per subject, component deadlines, and student targets in MongoDB</p>
                                </div>
                                <div className="table-controls-podx">
                                    <button
                                        className="add-schedule-btn-podx"
                                        onClick={() => setIsAddScheduleModalOpen(true)}
                                    >
                                        + Add Subject Schedule
                                    </button>
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
                                        {filteredSchedules.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>
                                                    No subject schedules found in database
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSchedules.map(s => {
                                                const pct = Math.round(((s.completedExperiments || 0) / (s.totalExperiments || 10)) * 100);
                                                const daysToComp = getDaysRemaining(s.componentIssueDeadline);
                                                const daysToStudent = getDaysRemaining(s.studentCompletionDeadline);

                                                return (
                                                    <tr key={s._id}>
                                                        <td>
                                                            <strong className="subject-title">{s.subject}</strong>
                                                            <span className="notes-preview">{s.notes || s.milestone || 'Curriculum on schedule'}</span>
                                                        </td>
                                                        <td>
                                                            <span className="staff-pill-podx">{s.staffInCharge}</span>
                                                        </td>
                                                        <td>{s.batchName || 'General'}</td>
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
                                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                                <button
                                                                    className="edit-schedule-btn-podx"
                                                                    onClick={() => setEditingSchedule({ ...s })}
                                                                    title="Edit schedule"
                                                                >
                                                                    ✏️ Edit
                                                                </button>
                                                                <button
                                                                    className="delete-schedule-btn-podx"
                                                                    onClick={() => handleDeleteSchedule(s._id, s.subject)}
                                                                    title="Delete from MongoDB"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 2. STAFF FACULTY TAB                                      */}
                {/* ========================================================= */}
                {activeTab === 'faculty' && (
                    <div className="section-card-podx">
                        <div className="section-header-podx">
                            <div>
                                <h3>Staff Faculty Directory & Access</h3>
                                <p>Manage department professors, assigned subjects, account statuses, and laboratory permissions</p>
                            </div>
                            <button
                                className="add-schedule-btn-podx"
                                onClick={() => setIsAddFacultyModalOpen(true)}
                            >
                                + Add Faculty Member
                            </button>
                        </div>

                        <div className="table-responsive-podx">
                            <table className="hod-table-podx">
                                <thead>
                                    <tr>
                                        <th>Faculty Member</th>
                                        <th>Email / Username</th>
                                        <th>Assigned Subjects</th>
                                        <th>Account Status</th>
                                        <th>Lab Clearance</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {facultyList.length === 0 ? (
                                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>No faculty members found in database</td></tr>
                                    ) : (
                                        facultyList
                                            .filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.username.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map(f => (
                                                <tr key={f._id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div className="security-avatar-circle" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                                                                {(f.name || f.username).substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <strong style={{ color: '#ffffff', display: 'block' }}>{f.name || f.username}</strong>
                                                                <span style={{ fontSize: '0.74rem', color: 'var(--podx-text-muted)' }}>{f.role}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div>{f.email || 'N/A'}</div>
                                                        <span style={{ fontSize: '0.74rem', color: 'var(--podx-cyan)' }}>@{f.username}</span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '280px' }}>
                                                            {(!f.assignedSubjects || f.assignedSubjects.length === 0) ? (
                                                                <span style={{ fontSize: '0.76rem', color: 'var(--podx-text-muted)' }}>General Faculty</span>
                                                            ) : (
                                                                f.assignedSubjects.map((sub, i) => (
                                                                    <span key={i} className="staff-pill-podx" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}>
                                                                        {sub}
                                                                    </span>
                                                                ))
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge-chip-podx ${f.status === 'Active' ? 'on-track' : 'action-required'}`}>
                                                            {f.status || 'Active'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={f.securityClearance !== false ? 'badge-clearance-granted' : 'badge-clearance-revoked'}>
                                                            {f.securityClearance !== false ? '✓ Granted' : '✕ Revoked'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button
                                                                className="action-btn-sm primary"
                                                                onClick={() => setEditingFaculty({ ...f, assignedSubjectsStr: (f.assignedSubjects || []).join(', ') })}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                className={`action-btn-sm ${f.status === 'Active' ? 'warning' : 'primary'}`}
                                                                onClick={() => handleToggleFacultyStatus(f._id, f.status)}
                                                            >
                                                                {f.status === 'Active' ? 'Deactivate' : 'Activate'}
                                                            </button>
                                                            <button
                                                                className={`action-btn-sm ${f.securityClearance !== false ? 'danger' : 'primary'}`}
                                                                onClick={() => handleToggleClearance(f._id, f.name || f.username)}
                                                            >
                                                                {f.securityClearance !== false ? 'Revoke' : 'Clear'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 3. HARDWARE STOCK TAB                                     */}
                {/* ========================================================= */}
                {activeTab === 'inventory' && (
                    <div className="section-card-podx">
                        <div className="section-header-podx">
                            <div>
                                <h3>Hardware Stock Allocation & Components</h3>
                                <p>Single source of truth component inventory powering student experiment hardware issuance</p>
                            </div>
                            <button
                                className="add-schedule-btn-podx"
                                onClick={() => setIsAddComponentModalOpen(true)}
                            >
                                + Add Component
                            </button>
                        </div>

                        <div className="table-responsive-podx">
                            <table className="hod-table-podx">
                                <thead>
                                    <tr>
                                        <th>Part ID</th>
                                        <th>Component Name</th>
                                        <th>Rack / Location</th>
                                        <th>Total</th>
                                        <th>Issued</th>
                                        <th>Available</th>
                                        <th>Threshold</th>
                                        <th>Used in Experiments</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {components.length === 0 ? (
                                        <tr><td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>No hardware components found in database</td></tr>
                                    ) : (
                                        components
                                            .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.partNumber.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map(c => {
                                                const isLow = c.isLowStock || c.availableQuantity <= (c.minimumStockLevel || 5);
                                                return (
                                                    <tr key={c._id}>
                                                        <td>
                                                            <span className="part-tag-code">{c.partNumber}</span>
                                                        </td>
                                                        <td>
                                                            <strong style={{ color: '#ffffff', display: 'block' }}>{c.name}</strong>
                                                            <span style={{ fontSize: '0.74rem', color: 'var(--podx-text-muted)' }}>{c.type}</span>
                                                        </td>
                                                        <td>📍 {c.rackNumber || 'Rack-A1'}</td>
                                                        <td>{c.totalQuantity}</td>
                                                        <td>{c.issuedQuantity || Math.max(0, c.totalQuantity - c.availableQuantity)}</td>
                                                        <td>
                                                            <strong style={{ color: isLow ? '#f87171' : 'var(--podx-cyan)', fontSize: '0.96rem' }}>
                                                                {c.availableQuantity}
                                                            </strong>
                                                        </td>
                                                        <td>{c.minimumStockLevel || 5}</td>
                                                        <td>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', maxWidth: '180px' }}>
                                                                {(!c.usedInExperiments || c.usedInExperiments.length === 0) ? (
                                                                    <span style={{ fontSize: '0.74rem', color: 'var(--podx-text-muted)' }}>General Lab</span>
                                                                ) : (
                                                                    c.usedInExperiments.map(exp => (
                                                                        <span key={exp} className="exp-used-tag">{exp}</span>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={isLow ? 'badge-low-stock' : 'badge-in-stock'}>
                                                                {isLow ? '⚠️ Low Stock' : '✓ In Stock'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                <button
                                                                    className="action-btn-sm primary"
                                                                    onClick={() => setEditingComponent({ ...c })}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    className="action-btn-sm warning"
                                                                    onClick={() => {
                                                                        setAdjustingComponent(c);
                                                                        setAdjustStockForm({ quantityChange: 1, remarks: 'Manual stock update' });
                                                                    }}
                                                                >
                                                                    Adjust
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 4. LAB SECURITY TAB                                       */}
                {/* ========================================================= */}
                {activeTab === 'security' && (
                    <div>
                        <div className="section-card-podx" style={{ marginBottom: '1.5rem' }}>
                            <div className="section-header-podx">
                                <div>
                                    <h3>Faculty Laboratory Security Clearance</h3>
                                    <p>Individual access control toggles for staff members across laboratory stations</p>
                                </div>
                            </div>

                            <div className="security-cards-grid">
                                {facultyList.map(f => {
                                    const isCleared = f.securityClearance !== false;
                                    return (
                                        <div key={f._id} className="security-card-item">
                                            <div className="security-card-header">
                                                <div className="security-avatar-circle">
                                                    {(f.name || f.username).substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="security-card-info">
                                                    <h4>{f.name || f.username}</h4>
                                                    <span>{f.email || `@${f.username}`}</span>
                                                </div>
                                            </div>

                                            <div className="security-card-actions">
                                                <span className={isCleared ? 'badge-clearance-granted' : 'badge-clearance-revoked'}>
                                                    {isCleared ? '✓ Access Granted' : '✕ Access Revoked'}
                                                </span>
                                                <button
                                                    className={`toggle-clearance-btn ${isCleared ? 'revoke' : 'grant'}`}
                                                    onClick={() => handleToggleClearance(f._id, f.name || f.username)}
                                                >
                                                    {isCleared ? 'Revoke Access' : 'Grant Clearance'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Read-Only Audit Log */}
                        <div className="section-card-podx">
                            <div className="section-header-podx">
                                <div>
                                    <h3>Read-Only Laboratory Security Audit Log</h3>
                                    <p>Immutable real-time audit trail of logins, component issues, returns, and security clearance actions</p>
                                </div>
                                <button className="action-btn-sm primary" onClick={() => loadTabData('security')}>
                                    ↻ Refresh Log
                                </button>
                            </div>

                            <div className="table-responsive-podx">
                                <table className="hod-table-podx">
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Action</th>
                                            <th>Category</th>
                                            <th>Staff User</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.length === 0 ? (
                                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>No audit events recorded yet</td></tr>
                                        ) : (
                                            auditLogs.slice(0, 25).map(log => (
                                                <tr key={log._id}>
                                                    <td style={{ fontSize: '0.8rem', color: 'var(--podx-text-muted)' }}>
                                                        {formatDateTime(log.timestamp)}
                                                    </td>
                                                    <td>
                                                        <strong style={{ color: '#ffffff' }}>{log.action}</strong>
                                                    </td>
                                                    <td>
                                                        <span className="staff-pill-podx" style={{ fontSize: '0.72rem' }}>{log.category}</span>
                                                    </td>
                                                    <td>@{log.staffUsername || 'admin'}</td>
                                                    <td style={{ fontSize: '0.82rem', color: 'var(--podx-text-light)' }}>
                                                        {log.details}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 5. EXPERIMENTS TAB                                        */}
                {/* ========================================================= */}
                {activeTab === 'experiments' && (
                    <div className="section-card-podx">
                        <div className="section-header-podx" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h3>Department Laboratory Experiments Catalog</h3>
                                <p>All experiments registered across subjects with real individual student pass &amp; pending counts</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="add-schedule-btn-podx"
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                                    onClick={openUploadModal}
                                >
                                    <span>📤 Upload or add files</span>
                                    <span className="upload-modal-badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '1px 6px', fontSize: '0.65rem' }}>Beta</span>
                                </button>
                            </div>
                        </div>

                        <div className="table-responsive-podx">
                            <table className="hod-table-podx">
                                <thead>
                                    <tr>
                                        <th>Exp #</th>
                                        <th>Experiment Title</th>
                                        <th>Subject</th>
                                        <th>Staff In-Charge</th>
                                        <th>Students Completed</th>
                                        <th>Students Pending</th>
                                        <th>Required Apparatus</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {experiments.length === 0 ? (
                                        <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>No experiments found in database</td></tr>
                                    ) : (
                                        experiments
                                            .filter(e => !searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase()) || e.experimentNumber.toLowerCase().includes(searchQuery.toLowerCase()) || e.subject.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map(e => (
                                                <tr key={e._id}>
                                                    <td>
                                                        <span className="badge-purple">{e.experimentNumber}</span>
                                                    </td>
                                                    <td>
                                                        <strong style={{ color: '#ffffff' }}>{e.title}</strong>
                                                    </td>
                                                    <td>{e.subject}</td>
                                                    <td>
                                                        <span className="staff-pill-podx">{e.staffInCharge || 'Assigned Faculty'}</span>
                                                    </td>
                                                    <td>
                                                        <span style={{ color: '#34d399', fontWeight: 800 }}>
                                                            {e.completedStudentsCount || 0} Students
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                                                            {e.pendingStudentsCount || 0} Pending
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {e.requiredComponents ? `${e.requiredComponents.length} items` : 'Standard set'}
                                                    </td>
                                                    <td>
                                                        <span className="status-badge-chip-podx on-track">Active</span>
                                                    </td>
                                                    <td>
                                                        <button
                                                            className="action-btn-sm secondary"
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                padding: '6px 10px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                whiteSpace: 'nowrap',
                                                                borderRadius: '6px',
                                                                background: 'rgba(99, 102, 241, 0.15)',
                                                                color: '#a5b4fc',
                                                                border: '1px solid rgba(99, 102, 241, 0.3)'
                                                            }}
                                                            onClick={() => handleReanalyzeExperiment(e._id, e.experimentNumber)}
                                                            title="Re-run AI extraction to clean components and remove junk"
                                                        >
                                                            🔄 Re-analyse manual
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 6. STAFF TIMELINES TAB                                    */}
                {/* ========================================================= */}
                {activeTab === 'schedules' && (
                    <div>
                        <div className="section-card-podx" style={{ marginBottom: '1.5rem' }}>
                            <div className="section-header-podx">
                                <div>
                                    <h3>Staff Milestone Deadlines &amp; Progress</h3>
                                    <p>Comprehensive milestone tracking for laboratory delivery with overdue alerts</p>
                                </div>
                                <button
                                    className="add-schedule-btn-podx"
                                    onClick={() => setIsAddScheduleModalOpen(true)}
                                >
                                    + Add Milestone
                                </button>
                            </div>

                            <div className="table-responsive-podx">
                                <table className="hod-table-podx">
                                    <thead>
                                        <tr>
                                            <th>Staff In-Charge</th>
                                            <th>Subject</th>
                                            <th>Milestone</th>
                                            <th>Due Date</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schedules.length === 0 ? (
                                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>No milestones registered</td></tr>
                                        ) : (
                                            schedules.map(s => {
                                                const isDone = s.status === 'Done' || s.status === 'Completed';
                                                const isOverdue = !isDone && (s.isOverdue || (s.dueDate && new Date(s.dueDate) < new Date()));
                                                return (
                                                    <tr key={s._id} className={isOverdue ? 'tr-overdue' : ''}>
                                                        <td>
                                                            <strong style={{ color: '#ffffff' }}>{s.staffInCharge}</strong>
                                                        </td>
                                                        <td>{s.subject}</td>
                                                        <td>
                                                            <span style={{ color: 'var(--podx-cyan)', fontWeight: 700 }}>
                                                                {s.milestone || 'Curriculum Milestone'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            📅 {formatDate(s.dueDate || s.studentCompletionDeadline)}
                                                        </td>
                                                        <td>
                                                            {isDone ? (
                                                                <span className="badge-in-stock">✓ Done</span>
                                                            ) : isOverdue ? (
                                                                <span className="badge-overdue">⚠️ Overdue</span>
                                                            ) : (
                                                                <span className="days-pill-podx ok">Pending</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                <button
                                                                    className={`action-btn-sm ${isDone ? 'warning' : 'primary'}`}
                                                                    onClick={() => handleToggleMilestoneStatus(s._id, s.status)}
                                                                >
                                                                    {isDone ? 'Reopen' : 'Mark Done'}
                                                                </button>
                                                                <button
                                                                    className="action-btn-sm primary"
                                                                    onClick={() => setEditingSchedule({ ...s })}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    className="action-btn-sm danger"
                                                                    onClick={() => handleDeleteSchedule(s._id, s.subject)}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <TimelineProjectionMap schedules={schedules} detailed={true} />
                    </div>
                )}

                {/* ========================================================= */}
                {/* 7. CURRICULUM TAB                                         */}
                {/* ========================================================= */}
                {activeTab === 'curriculum' && (
                    <div>
                        <div className="section-card-podx" style={{ marginBottom: '1.5rem' }}>
                            <div className="section-header-podx">
                                <div>
                                    <h3>Curriculum Subjects &amp; Laboratory Syllabus</h3>
                                    <p>Configure curriculum tracks and specify required apparatus components feeding student portals</p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="action-btn-sm primary"
                                        onClick={() => setIsAddSubjectModalOpen(true)}
                                    >
                                        + Add Subject Track
                                    </button>
                                    <button
                                        className="add-schedule-btn-podx"
                                        onClick={() => {
                                            setCurriculumExpForm({
                                                experimentNumber: `EXP-${(experiments.length + 1).toString().padStart(2, '0')}`,
                                                title: '',
                                                subject: curriculumSubjects.length > 0 ? curriculumSubjects[0].name : '',
                                                staffInCharge: 'Prof. Faculty Member',
                                                aim: '',
                                                description: '',
                                                requiredComponents: [
                                                    { componentName: 'Integrated Circuit', partNumber: 'IC-LM741', quantity: 2, notes: 'Standard IC' }
                                                ]
                                            });
                                            setEditingCurriculumExp(null);
                                            setIsAddExperimentModalOpen(true);
                                        }}
                                    >
                                        + Add Experiment
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '1rem' }}>
                                {curriculumSubjects.map(sub => (
                                    <div
                                        key={sub.name}
                                        style={{
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '12px',
                                            padding: '0.85rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }}
                                    >
                                        <div>
                                            <strong style={{ color: '#ffffff', display: 'block' }}>{sub.name}</strong>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--podx-cyan)' }}>{sub.experimentCount} Experiments</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Experiments with Apparatus Editor */}
                        <div className="section-card-podx">
                            <div className="section-header-podx">
                                <div>
                                    <h3>Experiments &amp; Hardware Apparatus Requirements</h3>
                                    <p>Each experiment's required components list directly configures the student Components page</p>
                                </div>
                            </div>

                            <div className="table-responsive-podx">
                                <table className="hod-table-podx">
                                    <thead>
                                        <tr>
                                            <th>Exp #</th>
                                            <th>Experiment Title</th>
                                            <th>Subject</th>
                                            <th>Staff In-Charge</th>
                                            <th>Apparatus / Required Components</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {experiments.length === 0 ? (
                                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>No experiments found</td></tr>
                                        ) : (
                                            experiments.map(exp => (
                                                <tr key={exp._id}>
                                                    <td><span className="badge-purple">{exp.experimentNumber}</span></td>
                                                    <td>
                                                        <strong style={{ color: '#ffffff' }}>{exp.title}</strong>
                                                    </td>
                                                    <td>{exp.subject}</td>
                                                    <td>{exp.staffInCharge || 'Assigned Faculty'}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            {(!exp.requiredComponents || exp.requiredComponents.length === 0) ? (
                                                                <span style={{ color: 'var(--podx-text-muted)', fontSize: '0.78rem' }}>None assigned</span>
                                                            ) : (
                                                                exp.requiredComponents.map((rc, idx) => (
                                                                    <div key={idx} style={{ fontSize: '0.76rem', color: 'var(--podx-text-light)' }}>
                                                                        • <strong>{rc.componentName}</strong> ({rc.partNumber}) - {rc.quantity} units
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <button
                                                            className="action-btn-sm primary"
                                                            onClick={() => {
                                                                setEditingCurriculumExp(exp);
                                                                setCurriculumExpForm({
                                                                    experimentNumber: exp.experimentNumber,
                                                                    title: exp.title,
                                                                    subject: exp.subject,
                                                                    staffInCharge: exp.staffInCharge || 'Prof. Faculty Member',
                                                                    aim: exp.aim || '',
                                                                    description: exp.description || '',
                                                                    requiredComponents: exp.requiredComponents && exp.requiredComponents.length > 0 ? exp.requiredComponents : [
                                                                        { componentName: '', partNumber: 'PRT-10001', quantity: 1, notes: '' }
                                                                    ]
                                                                });
                                                                setIsAddExperimentModalOpen(true);
                                                            }}
                                                        >
                                                            Edit &amp; Apparatus
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                {/* 8. ENROLLED STUDENTS DIRECTORY TAB */}
                {activeTab === 'students' && (
                    <div className="section-card-podx">
                        <div className="section-header-podx" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h3>Department Enrolled Students Directory</h3>
                                <p>All students listed with official Register Numbers, Academic Year, and Section from MongoDB</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="add-schedule-btn-podx"
                                    onClick={openUploadModal}
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                                >
                                    <span>📤 Upload or add files</span>
                                    <span className="upload-modal-badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '1px 6px', fontSize: '0.65rem' }}>Beta</span>
                                </button>
                                <button
                                    type="button"
                                    className="action-btn-sm primary"
                                    onClick={() => loadTabData('students')}
                                    style={{ padding: '8px 14px' }}
                                >
                                    ↻ Refresh Roster
                                </button>
                            </div>
                        </div>

                        {/* Cohort Stats Pills */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '1.25rem' }}>
                            <div style={{ background: '#18181b', border: '1px solid #2e2e33', borderRadius: '12px', padding: '12px 16px' }}>
                                <span style={{ fontSize: '0.74rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Enrolled</span>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>{allStudents.length}</div>
                            </div>
                            <div style={{ background: '#18181b', border: '1px solid #2e2e33', borderRadius: '12px', padding: '12px 16px' }}>
                                <span style={{ fontSize: '0.74rem', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.4px' }}>3rd Year</span>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#c084fc', marginTop: '2px' }}>
                                    {allStudents.filter(s => s.year === '3rd Year').length}
                                </div>
                            </div>
                            <div style={{ background: '#18181b', border: '1px solid #2e2e33', borderRadius: '12px', padding: '12px 16px' }}>
                                <span style={{ fontSize: '0.74rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>2nd Year</span>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                                    {allStudents.filter(s => s.year === '2nd Year').length}
                                </div>
                            </div>
                            <div style={{ background: '#18181b', border: '1px solid #2e2e33', borderRadius: '12px', padding: '12px 16px' }}>
                                <span style={{ fontSize: '0.74rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Section A</span>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                                    {allStudents.filter(s => s.section === 'Section A').length}
                                </div>
                            </div>
                            <div style={{ background: '#18181b', border: '1px solid #2e2e33', borderRadius: '12px', padding: '12px 16px' }}>
                                <span style={{ fontSize: '0.74rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Section B</span>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>
                                    {allStudents.filter(s => s.section === 'Section B').length}
                                </div>
                            </div>
                        </div>

                        {/* Search and Filters */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '1rem', background: '#1b1b1f', padding: '10px 14px', borderRadius: '10px', border: '1px solid #2e2e33' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Filter Year:</span>
                                {['All', '1st Year', '2nd Year', '3rd Year', '4th Year'].map(yr => (
                                    <button
                                        key={yr}
                                        type="button"
                                        className={`upload-filter-chip ${uploadYear === yr ? 'active' : ''}`}
                                        onClick={() => setUploadYear(yr)}
                                    >
                                        {yr}
                                    </button>
                                ))}
                                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, marginLeft: '10px' }}>Section:</span>
                                {['All', 'Section A', 'Section B'].map(sec => (
                                    <button
                                        key={sec}
                                        type="button"
                                        className={`upload-filter-chip ${uploadSection === sec ? 'active' : ''}`}
                                        onClick={() => setUploadSection(sec)}
                                    >
                                        {sec}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                placeholder="🔍 Search by Register No or Name..."
                                value={studentSearch}
                                onChange={(e) => setStudentSearch(e.target.value)}
                                className="upload-student-search"
                                style={{ minWidth: '240px' }}
                            />
                        </div>

                        {/* Full Students Roster Table */}
                        <div className="table-responsive-podx">
                            <table className="hod-table-podx">
                                <thead>
                                    <tr>
                                        <th>Register Number</th>
                                        <th>Student Name</th>
                                        <th>Department</th>
                                        <th>Academic Year</th>
                                        <th>Section</th>
                                        <th>Semester</th>
                                        <th>Labs Completed</th>
                                        <th>Security Clearance</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUploadStudents.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>
                                                No students found matching the selected filter criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUploadStudents.map(stu => (
                                            <tr key={stu._id || stu.username}>
                                                <td>
                                                    <span className="student-reg-badge">
                                                        {stu.registerNumber || stu.registrationId}
                                                    </span>
                                                </td>
                                                <td>
                                                    <strong style={{ color: '#ffffff' }}>{stu.name || stu.username}</strong>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{stu.department}</span>
                                                </td>
                                                <td>
                                                    <span className="student-year-tag">{stu.year}</span>
                                                </td>
                                                <td>
                                                    <span className="student-section-tag">{stu.section}</span>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>{stu.semester || 'Semester V'}</span>
                                                </td>
                                                <td>
                                                    <span style={{ color: '#34d399', fontWeight: 800 }}>
                                                        {stu.passedCount || 0} Passed
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="status-badge-chip-podx on-track" style={{ fontSize: '0.72rem' }}>
                                                        ✓ Granted
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="student-status-tag">
                                                        ● {stu.status || 'Active'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* ========================================================= */}
            {/* MODALS                                                    */}
            {/* ========================================================= */}

            {/* 0. UPLOAD OR ADD FILES MODAL (Matching User Screenshot + Student Cohort Table) */}
            {isUploadModalOpen && (
                <div className="hod-modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
                    <div className="upload-modal-window" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="upload-modal-header">
                            <div className="upload-modal-title-wrap">
                                <h3 className="upload-modal-title">Upload or add files</h3>
                                <span className="upload-modal-badge">Beta</span>
                            </div>
                            <button
                                className="upload-modal-close"
                                onClick={() => setIsUploadModalOpen(false)}
                                title="Close modal"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Drag and Drop Zone */}
                        <div
                            className={`upload-dropzone-box ${isDragging ? 'dragging' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,application/pdf,.doc,.docx,.png,.jpg,.jpeg"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                        setUploadFile(f);
                                        if (!uploadTitle) {
                                            setUploadTitle(f.name.replace(/\.[^/.]+$/, ''));
                                        }
                                    }
                                    e.target.value = '';
                                }}
                            />
                            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📁</div>
                            <div className="upload-dropzone-title">Drag files or photos here</div>
                            <div className="upload-dropzone-sub">Documents, images, spreadsheets, and code files</div>
                            <button
                                type="button"
                                className="upload-choose-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current && fileInputRef.current.click();
                                }}
                            >
                                Choose files
                            </button>
                        </div>

                        {/* Selected File Card */}
                        {uploadFile && (
                            <div className="upload-file-preview-card">
                                <div className="upload-file-meta">
                                    <div className="upload-file-icon">📄</div>
                                    <div>
                                        <div className="upload-file-name">{uploadFile.name}</div>
                                        <div className="upload-file-size">
                                            {(uploadFile.size / 1024).toFixed(1)} KB • {uploadFile.type || 'Document'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span className="upload-drive-indicator">
                                        ☁️ Google Drive Target
                                    </span>
                                    <button
                                        type="button"
                                        className="upload-file-remove"
                                        onClick={() => setUploadFile(null)}
                                        title="Remove file"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Metadata Config Grid */}
                        <div className="upload-form-grid">
                            <div className="upload-form-field">
                                <label>Subject / Laboratory</label>
                                <select
                                    value={uploadSubject}
                                    onChange={(e) => setUploadSubject(e.target.value)}
                                    className="upload-select-dark"
                                >
                                    <option value="Electronic Circuits Lab">Electronic Circuits Lab</option>
                                    <option value="Linear Integrated Circuits Lab">Linear Integrated Circuits Lab</option>
                                    <option value="VLSI Design Laboratory">VLSI Design Laboratory</option>
                                    <option value="Digital Signal Processing Lab">Digital Signal Processing Lab</option>
                                    <option value="Microprocessors & Microcontrollers">Microprocessors & Microcontrollers</option>
                                    <option value="Communication Systems Lab">Communication Systems Lab</option>
                                    <option value="Embedded Systems Laboratory">Embedded Systems Laboratory</option>
                                </select>
                            </div>

                            <div className="upload-form-field">
                                <label>Manual / File Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g. EC8381 Lab Manual V-Semester"
                                    value={uploadTitle}
                                    onChange={(e) => setUploadTitle(e.target.value)}
                                    className="upload-input-dark"
                                />
                            </div>

                            <div className="upload-form-field">
                                <label>Target Department</label>
                                <select
                                    value={uploadDepartment}
                                    onChange={(e) => setUploadDepartment(e.target.value)}
                                    className="upload-select-dark"
                                >
                                    <option value="ECE">ECE (Electronics &amp; Comm)</option>
                                    <option value="CSE">CSE (Computer Science)</option>
                                    <option value="EEE">EEE (Electrical &amp; Electronics)</option>
                                    <option value="MECH">MECH (Mechanical Eng)</option>
                                </select>
                            </div>

                            <div className="upload-form-field">
                                <label>Target Year</label>
                                <select
                                    value={uploadYear}
                                    onChange={(e) => setUploadYear(e.target.value)}
                                    className="upload-select-dark"
                                >
                                    <option value="All">All Years</option>
                                    <option value="1st Year">1st Year</option>
                                    <option value="2nd Year">2nd Year</option>
                                    <option value="3rd Year">3rd Year</option>
                                    <option value="4th Year">4th Year</option>
                                </select>
                            </div>

                            <div className="upload-form-field">
                                <label>Target Section</label>
                                <select
                                    value={uploadSection}
                                    onChange={(e) => setUploadSection(e.target.value)}
                                    className="upload-select-dark"
                                >
                                    <option value="All">All Sections</option>
                                    <option value="Section A">Section A</option>
                                    <option value="Section B">Section B</option>
                                    <option value="Section C">Section C</option>
                                </select>
                            </div>
                        </div>

                        {/* Under, at the bottom, students are listed out */}
                        <div className="upload-students-container">
                            <div className="upload-students-topbar">
                                <div className="upload-students-title-block">
                                    <h4>
                                        <span>👥 Enrolled Students List</span>
                                        <span style={{ fontSize: '0.78rem', color: '#818cf8', background: 'rgba(99,102,241,0.15)', padding: '2px 8px', borderRadius: '12px' }}>
                                            {filteredUploadStudents.length} Students Selected
                                        </span>
                                    </h4>
                                    <p>Showing students from {uploadYear} • {uploadSection} with official College Register Numbers</p>
                                </div>

                                <div className="upload-students-filters">
                                    <input
                                        type="text"
                                        placeholder="🔍 Search name or register no..."
                                        value={studentSearch}
                                        onChange={(e) => setStudentSearch(e.target.value)}
                                        className="upload-student-search"
                                    />
                                    {['All', '1st Year', '2nd Year', '3rd Year', '4th Year'].map(yr => (
                                        <button
                                            key={yr}
                                            type="button"
                                            className={`upload-filter-chip ${uploadYear === yr ? 'active' : ''}`}
                                            onClick={() => setUploadYear(yr)}
                                        >
                                            {yr}
                                        </button>
                                    ))}
                                    {['All', 'Section A', 'Section B'].map(sec => (
                                        <button
                                            key={sec}
                                            type="button"
                                            className={`upload-filter-chip ${uploadSection === sec ? 'active' : ''}`}
                                            onClick={() => setUploadSection(sec)}
                                        >
                                            {sec}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Students Table */}
                            <div className="upload-students-scroll">
                                <table className="upload-students-table">
                                    <thead>
                                        <tr>
                                            <th>Register Number</th>
                                            <th>Student Name</th>
                                            <th>Year</th>
                                            <th>Section</th>
                                            <th>Department</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentsLoading ? (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                                                    Loading student cohort from MongoDB...
                                                </td>
                                            </tr>
                                        ) : filteredUploadStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                                                    No students match the selected Year ({uploadYear}) and Section ({uploadSection}).
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredUploadStudents.map((stu) => (
                                                <tr key={stu._id || stu.username}>
                                                    <td>
                                                        <span className="student-reg-badge">
                                                            {stu.registerNumber || stu.registrationId}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <strong style={{ color: '#ffffff' }}>{stu.name || stu.username}</strong>
                                                    </td>
                                                    <td>
                                                        <span className="student-year-tag">{stu.year}</span>
                                                    </td>
                                                    <td>
                                                        <span className="student-section-tag">{stu.section}</span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{stu.department}</span>
                                                    </td>
                                                    <td>
                                                        <span className="student-status-tag">
                                                            ● {stu.status || 'Enrolled'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div className="upload-modal-footer">
                            <div className="upload-modal-info">
                                <span>☁️</span>
                                <span>PDF will be uploaded directly to Google Drive (manuals folder)</span>
                            </div>

                            <div className="upload-modal-buttons">
                                <button
                                    type="button"
                                    className="upload-btn-cancel"
                                    onClick={() => setIsUploadModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="upload-btn-submit"
                                    onClick={handleUploadModalSubmit}
                                    disabled={!uploadFile || isSaving}
                                >
                                    {isSaving ? 'Uploading to Drive...' : '☁️ Upload to Google Drive & Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ========================================================= */}

            {/* 1. EDIT SCHEDULE / MILESTONE MODAL */}
            {editingSchedule && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>Edit Subject Progress &amp; Milestone</h3>
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
                                        value={editingSchedule.batchName || ''}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, batchName: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Milestone Name / Goal</label>
                                <input
                                    type="text"
                                    value={editingSchedule.milestone || ''}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, milestone: e.target.value })}
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Finished Experiments</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max={editingSchedule.totalExperiments || 10}
                                        value={editingSchedule.completedExperiments || 0}
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
                                </div>
                                <div className="form-group">
                                    <label>🎯 Student Completion Deadline</label>
                                    <input
                                        type="date"
                                        value={toInputDate(editingSchedule.studentCompletionDeadline || editingSchedule.dueDate)}
                                        onChange={(e) => setEditingSchedule({ ...editingSchedule, studentCompletionDeadline: e.target.value, dueDate: e.target.value })}
                                        required
                                        className="hod-input date-accent"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    value={editingSchedule.status}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, status: e.target.value })}
                                    className="hod-select"
                                >
                                    <option value="On Track">On Track</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Action Required">Action Required</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Done">Done</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setEditingSchedule(null)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : '💾 Save to MongoDB'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 2. ADD SCHEDULE / MILESTONE MODAL */}
            {isAddScheduleModalOpen && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>+ Add Staff Milestone Schedule</h3>
                                <p>Register a milestone deadline track into MongoDB staff_portal</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsAddScheduleModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleCreateSchedule} className="modal-form">
                            <div className="form-group">
                                <label>Subject Title *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Linear Integrated Circuits Lab"
                                    value={newSchedule.subject}
                                    onChange={(e) => setNewSchedule({ ...newSchedule, subject: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Staff In-Charge</label>
                                    <input
                                        type="text"
                                        value={newSchedule.staffInCharge}
                                        onChange={(e) => setNewSchedule({ ...newSchedule, staffInCharge: e.target.value })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Batch Name</label>
                                    <input
                                        type="text"
                                        value={newSchedule.batchName}
                                        onChange={(e) => setNewSchedule({ ...newSchedule, batchName: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Milestone Goal</label>
                                <input
                                    type="text"
                                    value={newSchedule.milestone}
                                    onChange={(e) => setNewSchedule({ ...newSchedule, milestone: e.target.value })}
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>📅 Component Handover Deadline *</label>
                                    <input
                                        type="date"
                                        value={newSchedule.componentIssueDeadline}
                                        onChange={(e) => setNewSchedule({ ...newSchedule, componentIssueDeadline: e.target.value })}
                                        required
                                        className="hod-input date-accent"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>🎯 Milestone Due Date *</label>
                                    <input
                                        type="date"
                                        value={newSchedule.studentCompletionDeadline}
                                        onChange={(e) => setNewSchedule({ ...newSchedule, studentCompletionDeadline: e.target.value, dueDate: e.target.value })}
                                        required
                                        className="hod-input date-accent"
                                    />
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsAddScheduleModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Creating...' : '💾 Create in Database'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. ADD FACULTY MODAL */}
            {isAddFacultyModalOpen && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>+ Add Faculty Member</h3>
                                <p>Register staff faculty account with subject assignments in MongoDB</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsAddFacultyModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleCreateFaculty} className="modal-form">
                            <div className="form-group">
                                <label>Full Name *</label>
                                <input
                                    type="text"
                                    placeholder="Prof. Jane Doe"
                                    value={newFaculty.name}
                                    onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Username *</label>
                                    <input
                                        type="text"
                                        placeholder="jane_faculty"
                                        value={newFaculty.username}
                                        onChange={(e) => setNewFaculty({ ...newFaculty, username: e.target.value })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Password *</label>
                                    <input
                                        type="password"
                                        placeholder="Initial password"
                                        value={newFaculty.password}
                                        onChange={(e) => setNewFaculty({ ...newFaculty, password: e.target.value })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    placeholder="jane.doe@univ.edu"
                                    value={newFaculty.email}
                                    onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Assigned Subjects (comma-separated)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Embedded Systems Lab, Digital Signal Processing"
                                    value={newFaculty.assignedSubjects}
                                    onChange={(e) => setNewFaculty({ ...newFaculty, assignedSubjects: e.target.value })}
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Status</label>
                                    <select
                                        value={newFaculty.status}
                                        onChange={(e) => setNewFaculty({ ...newFaculty, status: e.target.value })}
                                        className="hod-select"
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Security Clearance</label>
                                    <select
                                        value={newFaculty.securityClearance ? 'true' : 'false'}
                                        onChange={(e) => setNewFaculty({ ...newFaculty, securityClearance: e.target.value === 'true' })}
                                        className="hod-select"
                                    >
                                        <option value="true">Granted (Full Lab Access)</option>
                                        <option value="false">Revoked / Restricted</option>
                                    </select>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsAddFacultyModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : '💾 Add to Database'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 4. EDIT FACULTY MODAL */}
            {editingFaculty && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>Edit Faculty Member</h3>
                                <p>Update profile and subject assignments for @{editingFaculty.username}</p>
                            </div>
                            <button className="close-btn" onClick={() => setEditingFaculty(null)}>✕</button>
                        </div>

                        <form onSubmit={handleUpdateFaculty} className="modal-form">
                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    value={editingFaculty.name || ''}
                                    onChange={(e) => setEditingFaculty({ ...editingFaculty, name: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    value={editingFaculty.email || ''}
                                    onChange={(e) => setEditingFaculty({ ...editingFaculty, email: e.target.value })}
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Assigned Subjects (comma-separated)</label>
                                <input
                                    type="text"
                                    value={editingFaculty.assignedSubjectsStr || ''}
                                    onChange={(e) => setEditingFaculty({ ...editingFaculty, assignedSubjectsStr: e.target.value, assignedSubjects: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Account Status</label>
                                <select
                                    value={editingFaculty.status || 'Active'}
                                    onChange={(e) => setEditingFaculty({ ...editingFaculty, status: e.target.value })}
                                    className="hod-select"
                                >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setEditingFaculty(null)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Updating...' : '💾 Update in MongoDB'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 5. ADD COMPONENT MODAL */}
            {isAddComponentModalOpen && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>+ Add Hardware Component to Inventory</h3>
                                <p>Registers stock into the unified database collection feeding student requisitions</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsAddComponentModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleCreateComponent} className="modal-form">
                            <div className="form-group">
                                <label>Component Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Raspberry Pi 4 Model B"
                                    value={newComponent.name}
                                    onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Part ID (Leave blank to auto-generate PRT-xxxxx)</label>
                                    <input
                                        type="text"
                                        placeholder="Auto PRT-xxxxx"
                                        value={newComponent.partNumber}
                                        onChange={(e) => setNewComponent({ ...newComponent, partNumber: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Type / Category</label>
                                    <select
                                        value={newComponent.type}
                                        onChange={(e) => setNewComponent({ ...newComponent, type: e.target.value })}
                                        className="hod-select"
                                    >
                                        <option value="Electronic Components">Electronic Components</option>
                                        <option value="Microcontroller Benches">Microcontroller Benches</option>
                                        <option value="Sensor Test Rigs">Sensor Test Rigs</option>
                                        <option value="Equipment">Oscilloscope &amp; Equipment</option>
                                        <option value="Hardware Apparatus">Hardware Apparatus</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Rack / Storage Location</label>
                                    <input
                                        type="text"
                                        value={newComponent.rackNumber}
                                        onChange={(e) => setNewComponent({ ...newComponent, rackNumber: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Total Initial Stock *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={newComponent.totalQuantity}
                                        onChange={(e) => setNewComponent({ ...newComponent, totalQuantity: parseInt(e.target.value) || 1 })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Low Stock Threshold *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={newComponent.minimumStockLevel}
                                        onChange={(e) => setNewComponent({ ...newComponent, minimumStockLevel: parseInt(e.target.value) || 1 })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Condition</label>
                                    <select
                                        value={newComponent.condition}
                                        onChange={(e) => setNewComponent({ ...newComponent, condition: e.target.value })}
                                        className="hod-select"
                                    >
                                        <option value="Brand New">Brand New</option>
                                        <option value="Good">Good</option>
                                        <option value="Fair">Fair</option>
                                    </select>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsAddComponentModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Adding...' : '💾 Add Component to Database'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 6. EDIT COMPONENT MODAL */}
            {editingComponent && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>Edit Hardware Component ({editingComponent.partNumber})</h3>
                                <p>Update details and storage parameters in MongoDB</p>
                            </div>
                            <button className="close-btn" onClick={() => setEditingComponent(null)}>✕</button>
                        </div>

                        <form onSubmit={handleUpdateComponent} className="modal-form">
                            <div className="form-group">
                                <label>Component Name</label>
                                <input
                                    type="text"
                                    value={editingComponent.name}
                                    onChange={(e) => setEditingComponent({ ...editingComponent, name: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Type</label>
                                    <input
                                        type="text"
                                        value={editingComponent.type}
                                        onChange={(e) => setEditingComponent({ ...editingComponent, type: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Rack / Storage Location</label>
                                    <input
                                        type="text"
                                        value={editingComponent.rackNumber || ''}
                                        onChange={(e) => setEditingComponent({ ...editingComponent, rackNumber: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Total Quantity</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={editingComponent.totalQuantity}
                                        onChange={(e) => setEditingComponent({ ...editingComponent, totalQuantity: parseInt(e.target.value) || 0 })}
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Low-Stock Threshold</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={editingComponent.minimumStockLevel || 5}
                                        onChange={(e) => setEditingComponent({ ...editingComponent, minimumStockLevel: parseInt(e.target.value) || 1 })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setEditingComponent(null)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : '💾 Save Component'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 7. ADJUST COMPONENT STOCK MODAL */}
            {adjustingComponent && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>Adjust Stock: {adjustingComponent.name}</h3>
                                <p>Part ID: {adjustingComponent.partNumber} | Current Available: {adjustingComponent.availableQuantity}</p>
                            </div>
                            <button className="close-btn" onClick={() => setAdjustingComponent(null)}>✕</button>
                        </div>

                        <form onSubmit={handleAdjustStock} className="modal-form">
                            <div className="form-group">
                                <label>Quantity Change (+ to add stock, - to deduct)</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={adjustStockForm.quantityChange}
                                    onChange={(e) => setAdjustStockForm({ ...adjustStockForm, quantityChange: parseInt(e.target.value) || 0 })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Reason / Audit Remarks *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Received new department batch from vendor"
                                    value={adjustStockForm.remarks}
                                    onChange={(e) => setAdjustStockForm({ ...adjustStockForm, remarks: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setAdjustingComponent(null)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Updating...' : '💾 Apply Stock Adjustment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 8. ADD CURRICULUM SUBJECT MODAL */}
            {isAddSubjectModalOpen && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>+ Add Curriculum Subject Track</h3>
                                <p>Register a new laboratory course into MongoDB</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsAddSubjectModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleCreateSubject} className="modal-form">
                            <div className="form-group">
                                <label>Subject Title *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Advanced Embedded Systems Laboratory"
                                    value={newSubject.subjectName}
                                    onChange={(e) => setNewSubject({ ...newSubject, subjectName: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Staff In-Charge</label>
                                <input
                                    type="text"
                                    value={newSubject.staffInCharge}
                                    onChange={(e) => setNewSubject({ ...newSubject, staffInCharge: e.target.value })}
                                    className="hod-input"
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsAddSubjectModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Creating...' : '💾 Create Subject'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 9. ADD / EDIT CURRICULUM EXPERIMENT WITH APPARATUS EDITOR */}
            {isAddExperimentModalOpen && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal" style={{ maxWidth: '750px' }}>
                        <div className="modal-header">
                            <div>
                                <h3>{editingCurriculumExp ? `Edit Experiment: ${curriculumExpForm.experimentNumber}` : '+ Add Experiment & Apparatus'}</h3>
                                <p>Define experiment metadata and required components feeding student portals</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsAddExperimentModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSaveCurriculumExperiment} className="modal-form">
                            <div className="form-row">
                                <div className="form-group" style={{ flex: '0 0 140px' }}>
                                    <label>Exp # *</label>
                                    <input
                                        type="text"
                                        value={curriculumExpForm.experimentNumber}
                                        onChange={(e) => setCurriculumExpForm({ ...curriculumExpForm, experimentNumber: e.target.value.toUpperCase() })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Experiment Title *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Design of Inverting & Non-Inverting Op-Amp"
                                        value={curriculumExpForm.title}
                                        onChange={(e) => setCurriculumExpForm({ ...curriculumExpForm, title: e.target.value })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Subject Curriculum *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Linear Integrated Circuits Lab"
                                        value={curriculumExpForm.subject}
                                        onChange={(e) => setCurriculumExpForm({ ...curriculumExpForm, subject: e.target.value })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Staff In-Charge</label>
                                    <input
                                        type="text"
                                        value={curriculumExpForm.staffInCharge}
                                        onChange={(e) => setCurriculumExpForm({ ...curriculumExpForm, staffInCharge: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            {/* Required Hardware Apparatus Rows Editor */}
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ margin: 0 }}>Required Hardware Apparatus &amp; Components ({curriculumExpForm.requiredComponents.length})</label>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--podx-cyan)' }}>Directly feeds student component requisitions</span>
                                </div>

                                <div className="component-rows-container">
                                    {curriculumExpForm.requiredComponents.map((rc, idx) => (
                                        <div key={idx} className="component-row-editor">
                                            <input
                                                type="text"
                                                placeholder="Component Name"
                                                value={rc.componentName}
                                                onChange={(e) => handleApparatusRowChange(idx, 'componentName', e.target.value)}
                                                required
                                                className="hod-input"
                                                style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Part Number"
                                                value={rc.partNumber}
                                                onChange={(e) => handleApparatusRowChange(idx, 'partNumber', e.target.value)}
                                                required
                                                className="hod-input"
                                                style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                placeholder="Qty"
                                                value={rc.quantity}
                                                onChange={(e) => handleApparatusRowChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                                                required
                                                className="hod-input"
                                                style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Notes / Specs"
                                                value={rc.notes || ''}
                                                onChange={(e) => handleApparatusRowChange(idx, 'notes', e.target.value)}
                                                className="hod-input"
                                                style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                                            />
                                            <button
                                                type="button"
                                                className="step-btn-podx"
                                                style={{ background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444', color: '#ff6b6b' }}
                                                onClick={() => handleRemoveApparatusRow(idx)}
                                                title="Remove component"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    className="btn-add-row"
                                    onClick={handleAddApparatusRow}
                                >
                                    + Add Required Apparatus Row
                                </button>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsAddExperimentModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : '💾 Save Experiment to MongoDB'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 10. DEPARTMENT PROFILE / SETTINGS MODAL */}
            {isProfileModalOpen && (
                <div className="hod-modal-overlay">
                    <div className="hod-modal">
                        <div className="modal-header">
                            <div>
                                <h3>⚙️ Department &amp; HOD Executive Settings</h3>
                                <p>Update department name, HOD administrator info, and announcements stored in MongoDB</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsProfileModalOpen(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSaveDepartmentProfile} className="modal-form">
                            <div className="form-group">
                                <label>Department Name</label>
                                <input
                                    type="text"
                                    value={departmentMeta.departmentName}
                                    onChange={(e) => setDepartmentMeta({ ...departmentMeta, departmentName: e.target.value })}
                                    required
                                    className="hod-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>HOD / Administrator Name</label>
                                    <input
                                        type="text"
                                        value={departmentMeta.hodName}
                                        onChange={(e) => setDepartmentMeta({ ...departmentMeta, hodName: e.target.value })}
                                        required
                                        className="hod-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Academic Year</label>
                                    <input
                                        type="text"
                                        value={departmentMeta.academicYear}
                                        onChange={(e) => setDepartmentMeta({ ...departmentMeta, academicYear: e.target.value })}
                                        className="hod-input"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Department Notice Board Memo</label>
                                <textarea
                                    rows="3"
                                    value={departmentMeta.announcement}
                                    onChange={(e) => setDepartmentMeta({ ...departmentMeta, announcement: e.target.value })}
                                    placeholder="Enter department memo visible to staff..."
                                    className="hod-textarea"
                                ></textarea>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsProfileModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : '💾 Update in MongoDB'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==========================================
// TIMELINE PROJECTION MAP VISUALIZER
// ==========================================
function TimelineProjectionMap({ schedules, detailed = false }) {
    if (!schedules || schedules.length === 0) {
        return (
            <div className={`section-card ${detailed ? '' : 'chart-card'}`}>
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--podx-text-muted)' }}>
                    No milestones scheduled yet
                </div>
            </div>
        );
    }

    return (
        <div className={`section-card ${detailed ? '' : 'chart-card'}`}>
            <div className="chart-header">
                <div>
                    <h4>Milestone Schedule &amp; Deadlines Map</h4>
                    <span className="chart-subtitle">Component Distribution vs Student Completion Target</span>
                </div>
            </div>

            <div className="timeline-cards-list">
                {schedules.map(s => {
                    const daysComp = getDaysRemaining(s.componentIssueDeadline);
                    const daysStudent = getDaysRemaining(s.studentCompletionDeadline || s.dueDate);
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
                                        <strong>Student Finish:</strong> {formatDate(s.studentCompletionDeadline || s.dueDate)}
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

// Mount React Root
const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<HodDashboardApp />);
}
