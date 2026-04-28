/**
 * Tutorial Exam Config Manager
 * Handles the Super Admin "Tutorial / Class Test Exam Configuration" section
 * @module tutorialExamConfigManager
 */

import { addTutorialExamConfig, getTutorialExamConfigs, deleteTutorialExamConfig, updateTutorialExamConfig } from '../firestoreService.js';
import { showNotification } from '../utils.js';
import { showConfirmModal } from './uiManager.js';
import { state } from './state.js';

let currentTutorialConfigs = [];

export async function initTutorialExamConfigManager() {
    const form = document.getElementById('addTutorialExamConfigForm');
    const filterClassSelect = document.getElementById('filterTutorialConfigClass');
    const filterSessionSelect = document.getElementById('filterTutorialConfigSession');

    if (form) {
        form.addEventListener('submit', handleAddTutorialConfig);
    }

    if (filterClassSelect) {
        filterClassSelect.addEventListener('change', () => {
            renderTutorialConfigTable(filterClassSelect.value, filterSessionSelect?.value || 'all');
        });
    }

    if (filterSessionSelect) {
        filterSessionSelect.addEventListener('change', () => {
            renderTutorialConfigTable(filterClassSelect?.value || 'all', filterSessionSelect.value);
        });
    }

    // Edit Modal
    const editForm = document.getElementById('editTutorialConfigForm');
    const closeEditBtn = document.getElementById('closeEditTutorialConfigModal');
    const editModal = document.getElementById('editTutorialConfigModal');

    if (editForm) {
        editForm.addEventListener('submit', handleUpdateTutorialConfig);
    }

    if (closeEditBtn) {
        closeEditBtn.addEventListener('click', () => {
            editModal?.classList.remove('active');
        });
    }

    editModal?.addEventListener('click', (e) => {
        if (e.target === editModal) {
            editModal.classList.remove('active');
        }
    });
}

export async function loadTutorialExamConfigs() {
    const tbody = document.getElementById('tutorialExamConfigTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">লোড হচ্ছে...</td></tr>';

    currentTutorialConfigs = await getTutorialExamConfigs();

    const filterClassSelect = document.getElementById('filterTutorialConfigClass');
    const filterSessionSelect = document.getElementById('filterTutorialConfigSession');
    renderTutorialConfigTable(filterClassSelect?.value || 'all', filterSessionSelect?.value || 'all');
}

function renderTutorialConfigTable(classFilter = 'all', sessionFilter = 'all') {
    const tbody = document.getElementById('tutorialExamConfigTableBody');
    if (!tbody) return;

    let filtered = currentTutorialConfigs;
    if (classFilter !== 'all') {
        filtered = filtered.filter(c => c.class === classFilter);
    }
    if (sessionFilter !== 'all') {
        filtered = filtered.filter(c => c.session === sessionFilter);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #666;">কোনো টিউটোরিয়াল পরীক্ষা যোগ করা হয়নি</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(config => {
        const dateStr = config.examDate
            ? new Date(config.examDate).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
            : '<span style="color:#999;">উল্লেখ নেই</span>';

        const customMarksStr = config.customMarks
            ? `<span class="badge" style="background: #f59e0b; color: white; font-size: 0.75rem;">${config.customMarks} মার্কস</span>`
            : '<span style="color:#999; font-size: 0.8rem;">ডিফল্ট</span>';

        return `
            <tr>
                <td>
                    <span class="badge" style="background:var(--primary); color:white; margin-right: 5px;">${config.class}</span>
                    <span class="badge" style="background:var(--secondary); color:white;">${config.session || 'N/A'}</span>
                </td>
                <td><strong>${config.examName}</strong></td>
                <td>${customMarksStr}</td>
                <td>${dateStr}</td>
                <td><small style="color:#666;"><i class="fas fa-user"></i> ${config.creatorName || 'Admin'}</small></td>
                <td style="text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="action-btn edit-tutorial-config-btn" 
                        data-id="${config.docId}" 
                        data-name="${config.examName}" 
                        data-class="${config.class}"
                        data-session="${config.session || ''}"
                        data-date="${config.examDate || ''}"
                        data-marks="${config.customMarks || ''}"
                        title="সম্পাদনা করুন" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-tutorial-config-btn" data-id="${config.docId}" data-name="${config.examName}" title="মুছুন" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach edit listeners
    tbody.querySelectorAll('.edit-tutorial-config-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const { id, name, date, marks } = btn.dataset;
            const cls = btn.dataset.class;
            const sess = btn.dataset.session;

            const modal = document.getElementById('editTutorialConfigModal');
            const docIdInput = document.getElementById('editTutorialConfigDocId');
            const nameInput = document.getElementById('editTutorialConfigExamName');
            const classInput = document.getElementById('editTutorialConfigClass');
            const sessionInput = document.getElementById('editTutorialConfigSession');
            const dateInput = document.getElementById('editTutorialConfigExamDate');
            const marksInput = document.getElementById('editTutorialConfigCustomMarks');

            if (docIdInput) docIdInput.value = id;
            if (nameInput) nameInput.value = name;
            if (classInput) classInput.value = cls;
            if (sessionInput) sessionInput.value = sess;
            if (dateInput) dateInput.value = date;
            if (marksInput) marksInput.value = marks;

            modal?.classList.add('active');
        });
    });

    // Attach delete listeners
    tbody.querySelectorAll('.delete-tutorial-config-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const docId = btn.dataset.id;
            const name = btn.dataset.name;
            showConfirmModal(`আপনি কি "${name}" মুছে ফেলতে চান?`, async () => {
                const success = await deleteTutorialExamConfig(docId);
                if (success) {
                    showNotification('সফলভাবে মুছে ফেলা হয়েছে');
                    await loadTutorialExamConfigs();
                } else {
                    showNotification('মুছতে সমস্যা হয়েছে', 'error');
                }
            });
        });
    });
}

async function handleAddTutorialConfig(e) {
    e.preventDefault();

    const classVal = document.getElementById('tutorialConfigClass').value;
    const sessionVal = document.getElementById('tutorialConfigSession').value;
    const nameVal = document.getElementById('tutorialConfigExamName').value.trim();
    const dateVal = document.getElementById('tutorialConfigExamDate').value;
    const customMarks = document.getElementById('tutorialConfigCustomMarks').value;

    if (!classVal || !sessionVal || !nameVal) {
        showNotification('ক্লাস, সেশন এবং পরীক্ষার নাম আবশ্যক!', 'warning');
        return;
    }

    // Check for duplicates
    const isDuplicate = currentTutorialConfigs.some(c =>
        c.class === classVal &&
        c.session === sessionVal &&
        c.examName.toLowerCase() === nameVal.toLowerCase()
    );

    if (isDuplicate) {
        showNotification(`${classVal} এবং ${sessionVal} সেশনে ইতিমধ্যেই "${nameVal}" নামে একটি টিউটোরিয়াল পরীক্ষা আছে!`, 'error');
        return;
    }

    const user = state.currentUser;
    const configData = {
        class: classVal,
        session: sessionVal,
        examName: nameVal,
        examDate: dateVal || null,
        customMarks: customMarks ? parseInt(customMarks) : null,
        createdBy: user ? user.uid : null,
        creatorName: user ? (user.displayName || user.email) : 'Super Admin'
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> সেভ হচ্ছে...';
    submitBtn.disabled = true;

    const success = await addTutorialExamConfig(configData);

    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    if (success) {
        showNotification('নতুন টিউটোরিয়াল পরীক্ষা সফলভাবে যোগ করা হয়েছে!', 'success');
        e.target.reset();
        await loadTutorialExamConfigs();
    } else {
        showNotification('টিউটোরিয়াল এক্সাম কনফিগ সেভ করতে সমস্যা হয়েছে।', 'error');
    }
}

async function handleUpdateTutorialConfig(e) {
    e.preventDefault();

    const docId = document.getElementById('editTutorialConfigDocId').value;
    const classVal = document.getElementById('editTutorialConfigClass').value;
    const sessionVal = document.getElementById('editTutorialConfigSession').value;
    const nameVal = document.getElementById('editTutorialConfigExamName').value.trim();
    const dateVal = document.getElementById('editTutorialConfigExamDate').value;
    const customMarks = document.getElementById('editTutorialConfigCustomMarks').value;

    if (!docId || !classVal || !sessionVal || !nameVal) {
        showNotification('সকল তথ্য প্রদান করুন!', 'warning');
        return;
    }

    const configData = {
        class: classVal,
        session: sessionVal,
        examName: nameVal,
        examDate: dateVal || null,
        customMarks: customMarks ? parseInt(customMarks) : null
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> আপডেট হচ্ছে...';
    submitBtn.disabled = true;

    const success = await updateTutorialExamConfig(docId, configData);

    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    if (success) {
        showNotification('টিউটোরিয়াল পরীক্ষার তথ্য সফলভাবে আপডেট করা হয়েছে!', 'success');
        document.getElementById('editTutorialConfigModal')?.classList.remove('active');
        await loadTutorialExamConfigs();
    } else {
        showNotification('আপডেট করতে সমস্যা হয়েছে।', 'error');
    }
}

/**
 * Populate a dropdown with tutorial exam names
 * @param {HTMLElement} dropdown 
 * @param {string} className 
 * @param {string} session
 */
export async function populateTutorialExamNameDropdown(dropdown, className, session) {
    if (!dropdown) return;

    if (!className || !session) {
        dropdown.innerHTML = '<option value="">আগে শ্রেণি ও সেশন সিলেক্ট করুন</option>';
        dropdown.disabled = true;
        return;
    }

    try {
        const configs = await getTutorialExamConfigs(className, session);

        if (!configs || configs.length === 0) {
            dropdown.innerHTML = '<option value="">এই সেশনের জন্য কোনো টিউটোরিয়াল কনফিগ করা নেই</option>';
            dropdown.disabled = true;
            return;
        }

        dropdown.disabled = false;
        dropdown.innerHTML = '<option value="">পরীক্ষা নির্বাচন করুন</option>' + configs.map(cfg =>
            `<option value="${cfg.examName}" data-marks="${cfg.customMarks || ''}">${cfg.examName}${cfg.customMarks ? ` (${cfg.customMarks} মার্কস)` : ''}</option>`
        ).join('');
    } catch (error) {
        console.error('Error populating tutorial exam name dropdown:', error);
        dropdown.innerHTML = '<option value="">লোড করতে সমস্যা হয়েছে</option>';
        dropdown.disabled = true;
    }
}
