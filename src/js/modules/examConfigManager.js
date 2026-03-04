/**
 * Exam Config Manager
 * Handles the Super Admin "Exam Configuration" page
 * @module examConfigManager
 */

import { addExamConfig, getExamConfigs, deleteExamConfig } from '../firestoreService.js';
import { showNotification } from '../utils.js';
import { showConfirmModal } from './uiManager.js';
import { auth } from '../firebase.js';

let currentConfigs = [];

export async function initExamConfigManager() {
    const form = document.getElementById('addExamConfigForm');
    const filterSelect = document.getElementById('filterConfigClass');

    if (form) {
        form.addEventListener('submit', handleAddConfig);
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            renderConfigTable(filterSelect.value);
        });
    }
}

export async function loadExamConfigs() {
    const tbody = document.getElementById('examConfigTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">লোড হচ্ছে...</td></tr>';

    currentConfigs = await getExamConfigs();

    const filterSelect = document.getElementById('filterConfigClass');
    renderConfigTable(filterSelect?.value || 'all');
}

function renderConfigTable(classFilter = 'all') {
    const tbody = document.getElementById('examConfigTableBody');
    if (!tbody) return;

    const filtered = classFilter === 'all'
        ? currentConfigs
        : currentConfigs.filter(c => c.class === classFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #666;">কোনো পরীক্ষার নাম যোগ করা হয়নি</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(config => {
        const dateStr = config.examDate
            ? new Date(config.examDate).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
            : '<span style="color:#999;">উল্লেখ নেই</span>';

        return `
            <tr>
                <td><span class="badge" style="background:var(--primary); color:white;">${config.class}</span></td>
                <td><strong>${config.examName}</strong></td>
                <td>${dateStr}</td>
                <td><small style="color:#666;"><i class="fas fa-user"></i> ${config.creatorName || 'Admin'}</small></td>
                <td style="text-align: right;">
                    <button class="action-btn delete-config-btn" data-id="${config.docId}" data-name="${config.examName}" title="মুছুন" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach delete listeners
    tbody.querySelectorAll('.delete-config-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const docId = btn.dataset.id;
            const name = btn.dataset.name;
            showConfirmModal(`আপনি কি "${name}" মুছে ফেলতে চান?`, async () => {
                const success = await deleteExamConfig(docId);
                if (success) {
                    showNotification('সফলভাবে মুছে ফেলা হয়েছে');
                    await loadExamConfigs();
                } else {
                    showNotification('মুছতে সমস্যা হয়েছে', 'error');
                }
            });
        });
    });
}

async function handleAddConfig(e) {
    e.preventDefault();

    const classVal = document.getElementById('configClass').value;
    const nameVal = document.getElementById('configExamName').value.trim();
    const dateVal = document.getElementById('configExamDate').value; // YYYY-MM-DD

    if (!classVal || !nameVal) {
        showNotification('ক্লাস এবং পরীক্ষার নাম আবশ্যক!', 'warning');
        return;
    }

    // Check for duplicates in same class
    const isDuplicate = currentConfigs.some(c =>
        c.class === classVal && c.examName.toLowerCase() === nameVal.toLowerCase()
    );

    if (isDuplicate) {
        showNotification(`${classVal} ক্লাসে ইতিমধ্যেই "${nameVal}" নামে একটি পরীক্ষা আছে!`, 'error');
        return;
    }

    const user = auth.currentUser;
    const configData = {
        class: classVal,
        examName: nameVal,
        examDate: dateVal || null,
        createdBy: user ? user.uid : null,
        creatorName: user ? user.displayName || user.email : 'Super Admin'
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> সেভ হচ্ছে...';
    submitBtn.disabled = true;

    const success = await addExamConfig(configData);

    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    if (success) {
        showNotification('নতুন পরীক্ষা সফলভাবে যোগ করা হয়েছে!', 'success');
        e.target.reset(); // Clear form
        await loadExamConfigs(); // Refresh list
    } else {
        showNotification('গ্লোবাল এক্সাম নাম সেভ করতে সমস্যা হয়েছে।', 'error');
    }
}
