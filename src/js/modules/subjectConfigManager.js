/**
 * Subject Configuration Module
 */

import {
    saveSubjectConfig,
    deleteSubjectConfig,
    subscribeToSubjectConfigs,
    getSavedExams,
    getSavedExamsByType
} from '../firestoreService.js';
import { elements, showConfirmModal } from './uiManager.js';
import { showNotification } from '../utils.js';
import { state, DEFAULT_SUBJECT_CONFIG } from './state.js';

let allConfigs = {};
let isTutorialConfigMode = false;
let knownSubjects = new Set();

/**
 * Initialize Subject Configuration Manager
 */
export function initSubjectConfigManager() {
    if (!elements.subjectSettingsModal) return;

    // Fetch all unique subjects asynchronously
    Promise.all([getSavedExams(), getSavedExamsByType('tutorial')]).then(([mainExams, tutorialExams]) => {
        mainExams.forEach(e => knownSubjects.add(e.subject));
        tutorialExams.forEach(e => knownSubjects.add(e.subject));
        renderConfigList(allConfigs, elements.subjectSearch?.value || '');
    });

    // Listeners for inputs to calculate total
    const markInputs = [
        elements.configWrittenMax,
        elements.configMcqMax,
        elements.configPracticalMax
    ];

    markInputs.forEach(input => {
        input?.addEventListener('input', calculateLiveTotal);
    });

    // Save Button
    elements.saveSubjectConfigBtn?.addEventListener('click', handleSaveConfig);

    // Add New Button
    elements.addNewSubjectBtn?.addEventListener('click', () => {
        resetConfigForm();
        elements.formTitle.innerText = 'নতুন কনফিগারেশন';
    });

    // Delete Button
    elements.deleteSubjectBtn?.addEventListener('click', handleDeleteConfig);

    // Mode Switches
    elements.modeMainExamBtn?.addEventListener('click', () => switchConfigMode('main'));
    elements.modeTutorialBtn?.addEventListener('click', () => switchConfigMode('tutorial'));

    // Search
    elements.subjectSearch?.addEventListener('input', (e) => {
        renderConfigList(allConfigs, e.target.value);
    });

    // Close Button
    elements.closeSubjectSettingsBtn?.addEventListener('click', () => {
        elements.subjectSettingsModal.classList.remove('active');
    });

    // Real-time subscription
    subscribeToSubjectConfigs((configs) => {
        allConfigs = configs || {};
        state.subjectConfigs = allConfigs;
        renderConfigList(allConfigs);
    });
}

function calculateLiveTotal() {
    const written = parseInt(elements.configWrittenMax?.value) || 0;
    const mcq = parseInt(elements.configMcqMax?.value) || 0;
    const practical = parseInt(elements.configPracticalMax?.value) || 0;
    const autoSum = written + mcq + practical;

    // Only show auto-sum as a HINT — don't overwrite the Total field
    // User can set Total independently (e.g., 100 even if components sum to 33)
    if (elements.calcTotalPreview) {
        elements.calcTotalPreview.innerText = `যোগফল: ${autoSum}`;
    }

    // Auto-fill Total ONLY if it's currently empty or 0
    const currentTotal = parseInt(elements.configTotalMax?.value) || 0;
    if (currentTotal === 0 && autoSum > 0) {
        elements.configTotalMax.value = autoSum;
    }
}

function renderConfigList(configs, searchTerm = '') {
    if (!elements.savedConfigsList) return;

    // Get all unique subjects from all sources to ensure sync
    const configSubjects = Object.keys(configs).filter(key => key !== 'updatedAt');
    const mappingSubjects = [...new Set(Object.values(state.classSubjectMapping || {}).flat())];

    // Merge and filter
    const allUniqueSubjects = [...new Set([...configSubjects, ...knownSubjects, ...mappingSubjects])]
        .filter(s => s && s.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.localeCompare(b, 'bn'));

    if (allUniqueSubjects.length === 0) {
        elements.savedConfigsList.innerHTML = '<div style="padding: 10px; color: #999; font-size: 0.8em; text-align: center;">কোনো বিষয় খুঁজে পাওয়া যায়নি</div>';
        if (elements.subjectCount) elements.subjectCount.innerText = '০';
        return;
    }

    // Create a flat list with both Main and Tutorial for each subject
    const displayList = [];
    allUniqueSubjects.forEach(key => {
        displayList.push({ subject: key, mode: 'main' });
        displayList.push({ subject: key, mode: 'tutorial' });
    });

    // Update count badge with Bengali digits
    if (elements.subjectCount) {
        const count = displayList.length;
        const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        const countStr = count.toString().split('').map(d => bengaliDigits[parseInt(d)] || d).join('');
        elements.subjectCount.innerText = countStr;
    }

    elements.savedConfigsList.innerHTML = displayList.map(item => {
        const key = item.subject;
        const mode = item.mode;
        const hasConfig = configs[key] ? true : false;
        const hasTutConfig = hasConfig && configs[key].tutorial ? true : false;
        const isActive = state.editingSubjectKey === key && isTutorialConfigMode === (mode === 'tutorial');
        
        let marks = '';
        let badge = '';
        let isConfigured = false;

        if (mode === 'main') {
            isConfigured = hasConfig;
            marks = hasConfig ? configs[key].total : '';
            badge = `<span style="background:#e2e8f0; color:#334155; padding:2px 6px; border-radius:4px;">মেইন: ${marks}</span>`;
        } else {
            isConfigured = hasTutConfig;
            marks = hasTutConfig ? configs[key].tutorial.total : '';
            badge = `<span style="background:#fef3c7; color:#d97706; padding:2px 6px; border-radius:4px;">টিউটোরিয়াল: ${marks}</span>`;
        }

        return `
            <div class="config-item ${isActive ? 'active' : ''} ${isConfigured ? 'has-config' : 'no-config'}" 
                 data-subject="${key}" data-mode="${mode}" 
                 style="display:flex; flex-direction:column; gap:5px; align-items:flex-start;">
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <strong>${key} <span style="font-size: 0.8em; color: #666; font-weight: normal;">(${mode === 'main' ? 'মেইন' : 'টিউটোরিয়াল'})</span></strong>
                    <i class="fas ${isConfigured ? 'fa-check-circle' : 'fa-exclamation-circle'}" 
                       style="color: ${isConfigured ? '#27ae60' : '#f59e0b'}; opacity: ${isConfigured ? '0.8' : '0.5'}"></i>
                </div>
                <div style="display:flex; gap:5px; flex-wrap:wrap; font-size: 0.8rem;">
                    ${isConfigured ? badge : '<span style="color: var(--warning)">কনফিগার করা নেই</span>'}
                </div>
            </div>
        `;
    }).join('');

    // Attach click listeners to items
    elements.savedConfigsList.querySelectorAll('.config-item').forEach(item => {
        item.addEventListener('click', () => {
            const subject = item.dataset.subject;
            const mode = item.dataset.mode;
            const config = configs[subject] || DEFAULT_SUBJECT_CONFIG;
            isTutorialConfigMode = (mode === 'tutorial');
            loadConfigIntoForm(subject, config);
        });
    });
}

function loadConfigIntoForm(subject, fullConfig) {
    state.editingSubjectKey = subject;
    
    updateModeUI();

    elements.configSubjectName.value = subject;
    
    let targetConfig;
    if (isTutorialConfigMode) {
        targetConfig = fullConfig.tutorial || DEFAULT_SUBJECT_CONFIG;
    } else {
        targetConfig = fullConfig;
    }
    populateFormWithConfig(targetConfig);

    const canDelete = state.isSuperAdmin;
    elements.deleteSubjectBtn.style.display = canDelete ? 'block' : 'none';
    elements.formTitle.innerText = `এডিট: ${subject} (${isTutorialConfigMode ? 'টিউটোরিয়াল' : 'মেইন'})`;

    // Highlight active item in list
    renderConfigList(allConfigs, elements.subjectSearch?.value);
}

function switchConfigMode(mode) {
    if (!state.editingSubjectKey) {
        showNotification('আগে তালিকা থেকে একটি বিষয় নির্বাচন করুন বা নতুন বিষয় তৈরি করুন', 'warning');
        return;
    }
    
    // Auto save current fields into memory before switching
    const currentSubject = state.editingSubjectKey;
    let currentConfig = allConfigs[currentSubject] || JSON.parse(JSON.stringify(DEFAULT_SUBJECT_CONFIG));
    
    // Save current values to memory
    const formVals = {
        total: elements.configTotalMax.value,
        written: elements.configWrittenMax.value,
        writtenPass: elements.configWrittenPass.value,
        mcq: elements.configMcqMax.value,
        mcqPass: elements.configMcqPass.value,
        practical: elements.configPracticalMax.value,
        practicalPass: elements.configPracticalPass.value,
        practicalOptional: elements.configPracticalOptional.checked
    };

    if (isTutorialConfigMode) {
        currentConfig.tutorial = formVals;
    } else {
        Object.assign(currentConfig, formVals);
    }
    allConfigs[currentSubject] = currentConfig;

    // Switch mode
    isTutorialConfigMode = mode === 'tutorial';
    updateModeUI();

    // Load values for the new mode
    let targetConfig;
    if (isTutorialConfigMode) {
        targetConfig = currentConfig.tutorial || JSON.parse(JSON.stringify(DEFAULT_SUBJECT_CONFIG));
    } else {
        targetConfig = currentConfig;
    }
    
    populateFormWithConfig(targetConfig);
}

function updateModeUI() {
    if (isTutorialConfigMode) {
        elements.modeTutorialBtn.style.background = '#f59e0b';
        elements.modeTutorialBtn.style.color = '#fff';
        elements.modeTutorialBtn.style.borderColor = '#f59e0b';
        
        elements.modeMainExamBtn.style.background = 'transparent';
        elements.modeMainExamBtn.style.color = '#cbd5e1';
        elements.modeMainExamBtn.style.borderColor = 'transparent';
        
        elements.formTitle.innerText = state.editingSubjectKey ? `এডিট (টিউটোরিয়াল): ${state.editingSubjectKey}` : 'নতুন টিউটোরিয়াল কনফিগারেশন';
    } else {
        elements.modeMainExamBtn.style.background = 'var(--primary)';
        elements.modeMainExamBtn.style.color = '#fff';
        elements.modeMainExamBtn.style.borderColor = 'var(--primary)';
        
        elements.modeTutorialBtn.style.background = 'transparent';
        elements.modeTutorialBtn.style.color = '#cbd5e1';
        elements.modeTutorialBtn.style.borderColor = 'transparent';
        
        elements.formTitle.innerText = state.editingSubjectKey ? `এডিট (মেইন এক্সাম): ${state.editingSubjectKey}` : 'নতুন কনফিগারেশন';
    }


}

function populateFormWithConfig(config) {
    elements.configWrittenMax.value = config.written || '';
    elements.configWrittenPass.value = config.writtenPass || '';
    elements.configMcqMax.value = config.mcq || '';
    elements.configMcqPass.value = config.mcqPass || '';
    elements.configPracticalMax.value = config.practical || '';
    elements.configPracticalPass.value = config.practicalPass || '';
    elements.configPracticalOptional.checked = !!config.practicalOptional;
    elements.configTotalMax.value = config.total || '';
    calculateLiveTotal();
}

function resetConfigForm() {
    state.editingSubjectKey = null;
    isTutorialConfigMode = false;
    updateModeUI();

    elements.configSubjectName.value = '';
    populateFormWithConfig(DEFAULT_SUBJECT_CONFIG);

    elements.deleteSubjectBtn.style.display = 'none';
}

async function handleSaveConfig() {
    const subject = elements.configSubjectName.value.trim();
    if (!subject) {
        showNotification('বিষয়ের নাম দিতে হবে', 'warning');
        return;
    }

    // Current form values
    const formVals = {
        total: elements.configTotalMax.value,
        written: elements.configWrittenMax.value,
        writtenPass: elements.configWrittenPass.value,
        mcq: elements.configMcqMax.value,
        mcqPass: elements.configMcqPass.value,
        practical: elements.configPracticalMax.value,
        practicalPass: elements.configPracticalPass.value,
        practicalOptional: elements.configPracticalOptional.checked
    };

    // Merge with existing full config so we don't wipe out tutorial if saving main, and vice versa
    let fullConfig = allConfigs[subject] || JSON.parse(JSON.stringify(DEFAULT_SUBJECT_CONFIG));
    
    if (isTutorialConfigMode) {
        fullConfig.tutorial = formVals;
    } else {
        // Keep existing tutorial config if any
        const existingTutorial = fullConfig.tutorial;
        Object.assign(fullConfig, formVals);
        if (existingTutorial) fullConfig.tutorial = existingTutorial;
    }

    const success = await saveSubjectConfig(subject, fullConfig);
    if (success) {
        showNotification(`${subject} কনফিগারেশন সেভ করা হয়েছে`);
        resetConfigForm();
    } else {
        showNotification('সেভ করতে সমস্যা হয়েছে', 'error');
    }
}

async function handleDeleteConfig() {
    const subject = state.editingSubjectKey;
    if (!subject) return;

    showConfirmModal(
        `আপনি কি নিশ্চিত যে আপনি এই বিষযের কনফিগারেশন মুছে ফেলতে চান?`,
        async () => {
            const success = await deleteSubjectConfig(subject);
            if (success) {
                showNotification(`${subject} কনফিগারেশন মুছে ফেলা হয়েছে`);
                resetConfigForm();
            } else {
                showNotification('ডিলিট করতে সমস্যা হয়েছে', 'error');
            }
        },
        subject,
        'এটি ডাটাবেস থেকে স্থায়ীভাবে মুছে যাবে।'
    );
}
