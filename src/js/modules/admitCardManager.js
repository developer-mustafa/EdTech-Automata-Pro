import { getSavedExams, getExamConfigs, getSettings, saveSettings } from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits } from '../utils.js';

let acClassSelect, acSessionSelect, acExamNameSelect, acGroupSelect, acLayoutSelect;
let acGenerateBtn, spGenerateBtn, acResetBtn, acPrintAllBtn, acSettingsBtn;
let admitCardPreview, acPreviewWrapper, acEmptyStateMsg, acMainZoomInput, acMainZoomLevelTxt;

// Settings Modal Elements
let acSettingsModal, closeAcSettingsBtn, acSaveSettingsBtn;
let acInstNameInput, acInstAddressInput;
let acLogoUpload, acWatermarkUpload, acClearLogoBtn, acClearWatermarkBtn;
let acBaseFontSizeSelect, acTitleFontSizeSelect, acTableFontSizeSelect, acThemeSelect;

let acCurrentSettings = {
    logoUrl: '',
    watermarkUrl: ''
};

export function initAdmitCardManager() {
    acClassSelect = document.getElementById('acClass');
    acSessionSelect = document.getElementById('acSession');
    acExamNameSelect = document.getElementById('acExamName');
    acGroupSelect = document.getElementById('acGroup');
    acLayoutSelect = document.getElementById('acLayout');

    acGenerateBtn = document.getElementById('acGenerateBtn');
    spGenerateBtn = document.getElementById('spGenerateBtn');
    acResetBtn = document.getElementById('acResetBtn');
    acPrintAllBtn = document.getElementById('acPrintAllBtn');
    acSettingsBtn = document.getElementById('acSettingsBtn');

    admitCardPreview = document.getElementById('admitCardPreview');
    acPreviewWrapper = document.getElementById('acPreviewWrapper');
    acEmptyStateMsg = document.getElementById('acEmptyStateMsg');
    acMainZoomInput = document.getElementById('acMainZoom');
    acMainZoomLevelTxt = document.getElementById('acMainZoomLevel');

    // Settings
    acSettingsModal = document.getElementById('acSettingsModal');
    closeAcSettingsBtn = document.getElementById('closeAcSettingsBtn');
    acSaveSettingsBtn = document.getElementById('acSaveSettingsBtn');
    acInstNameInput = document.getElementById('acInstName');
    acInstAddressInput = document.getElementById('acInstAddress');
    acLogoUpload = document.getElementById('acLogoUpload');
    acWatermarkUpload = document.getElementById('acWatermarkUpload');
    acClearLogoBtn = document.getElementById('acClearLogoBtn');
    acClearWatermarkBtn = document.getElementById('acClearWatermarkBtn');
    acBaseFontSizeSelect = document.getElementById('acBaseFontSize');
    acTitleFontSizeSelect = document.getElementById('acTitleFontSize');
    acTableFontSizeSelect = document.getElementById('acTableFontSize');
    acThemeSelect = document.getElementById('acTheme');

    // Tab Switching Logic
    const acMenuItems = document.querySelectorAll('#acSettingsModal .config-menu-item');
    const acTabContents = document.querySelectorAll('#acSettingsModal .config-tab-content');

    acMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            acMenuItems.forEach(m => m.classList.remove('active'));
            acTabContents.forEach(c => c.classList.remove('active'));
            item.classList.add('active');
            const tabId = item.getAttribute('data-tab');
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add('active');
        });
    });


    if (acGenerateBtn) {
        acGenerateBtn.addEventListener('click', () => generateCards('admit'));
    }

    if (spGenerateBtn) {
        spGenerateBtn.addEventListener('click', () => generateCards('seat'));
    }

    if (acResetBtn) {
        acResetBtn.addEventListener('click', () => {
            admitCardPreview.innerHTML = '';
            acPreviewWrapper.style.display = 'none';
            acEmptyStateMsg.style.display = 'flex';
            acPrintAllBtn.style.display = 'none';
        });
    }

    if (acPrintAllBtn) {
        acPrintAllBtn.addEventListener('click', () => {
            const orientationSelect = document.getElementById('acOrientation');
            const orientation = orientationSelect ? orientationSelect.value : 'portrait';

            document.body.classList.add('ac-printing');
            document.body.classList.add(`ac-print-${orientation}`);

            window.print();

            setTimeout(() => {
                document.body.classList.remove('ac-printing');
                document.body.classList.remove(`ac-print-${orientation}`);
            }, 500);
        });
    }

    if (acMainZoomInput) {
        acMainZoomInput.addEventListener('input', (e) => {
            const scale = parseFloat(e.target.value);
            admitCardPreview.style.setProperty('--ac-main-scale', scale);
            if (acMainZoomLevelTxt) {
                acMainZoomLevelTxt.textContent = Math.round(scale * 100) + '%';
            }
        });
    }

    if (acSettingsBtn) {
        acSettingsBtn.addEventListener('click', openSettingsModal);
    }
    if (closeAcSettingsBtn) {
        closeAcSettingsBtn.addEventListener('click', () => acSettingsModal.classList.remove('active'));
    }

    // File Upload Handlers
    if (acLogoUpload) {
        acLogoUpload.addEventListener('change', (e) => handleImageUpload(e, 'logoUrl', 'acLogoPreview'));
    }
    if (acWatermarkUpload) {
        acWatermarkUpload.addEventListener('change', (e) => handleImageUpload(e, 'watermarkUrl', 'acWatermarkPreview'));
    }

    // Clear Image Handlers
    if (acClearLogoBtn) {
        acClearLogoBtn.addEventListener('click', () => clearImage('logoUrl', 'acLogoPreview', acLogoUpload));
    }
    if (acClearWatermarkBtn) {
        acClearWatermarkBtn.addEventListener('click', () => clearImage('watermarkUrl', 'acWatermarkPreview', acWatermarkUpload));
    }
    if (acSaveSettingsBtn) {
        acSaveSettingsBtn.addEventListener('click', saveACSettings);
    }

    // Live Preview Listeners
    const settingsInputs = [
        acInstNameInput, acInstAddressInput,
        acBaseFontSizeSelect, acTitleFontSizeSelect, acTableFontSizeSelect, acThemeSelect
    ];
    settingsInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', updateACLivePreview);
            input.addEventListener('change', updateACLivePreview);
        }
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === acSettingsModal) {
            acSettingsModal.classList.remove('active');
        }
    });
}

/**
 * Auto-scales institution names to fit on a single line
 */
function fitTitleScaling() {
    const selectors = ['.ac-header-text h3', '.sp-inst-name'];
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            let fontSize = parseFloat(window.getComputedStyle(el).fontSize);
            const container = el.parentElement;
            if (!container) return;

            // Reset font size to initial to re-evaluate
            el.style.fontSize = ''; // Clear any previous scaling
            fontSize = parseFloat(window.getComputedStyle(el).fontSize); // Get original computed size

            // Reduce font size until it fits (max 40 iterations to prevent infinite loop)
            let iterations = 0;
            while (el.scrollWidth > el.clientWidth && fontSize > 8 && iterations < 40) {
                fontSize -= 0.5;
                el.style.fontSize = fontSize + 'px';
                iterations++;
            }
        });
    });
}

async function openSettingsModal() {
    const settings = await getSettings() || {};
    const acConfig = settings.admitCard || {};

    if (acInstNameInput) acInstNameInput.value = acConfig.instName || '';
    if (acInstAddressInput) acInstAddressInput.value = acConfig.instAddress || '';

    if (acBaseFontSizeSelect) acBaseFontSizeSelect.value = acConfig.baseFontSize || '14px';
    if (acTitleFontSizeSelect) acTitleFontSizeSelect.value = acConfig.titleFontSize || '22px';
    if (acTableFontSizeSelect) acTableFontSizeSelect.value = acConfig.tableFontSize || '13px';
    if (acThemeSelect) acThemeSelect.value = acConfig.theme || 'modern';

    acCurrentSettings.logoUrl = acConfig.logoUrl || '';
    acCurrentSettings.watermarkUrl = acConfig.watermarkUrl || '';

    updateImagePreview('acLogoPreview', acCurrentSettings.logoUrl);
    updateImagePreview('acWatermarkPreview', acCurrentSettings.watermarkUrl);

    if (acSettingsModal) {
        acSettingsModal.classList.add('active');
        updateACLivePreview();
    }
}

function handleImageUpload(e, settingKey, previewId) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            acCurrentSettings[settingKey] = ev.target.result;
            updateImagePreview(previewId, ev.target.result);
            updateACLivePreview();
        };
        reader.readAsDataURL(file);
    }
}

function clearImage(settingKey, previewId, inputElement) {
    acCurrentSettings[settingKey] = '';
    if (inputElement) inputElement.value = '';
    updateImagePreview(previewId, '');
    updateACLivePreview();
}

function updateImagePreview(previewId, url) {
    const preview = document.getElementById(previewId);
    if (!preview) return;

    if (url) {
        preview.innerHTML = `<img src="${url}" style="max-height: 80px; max-width: 100%; border-radius: 4px;">`;
    } else {
        preview.innerHTML = '<span style="opacity: 0.5;">কোনো ছবি নেই</span>';
    }
}

function updateACLivePreview() {
    const acPreviewContainer = document.getElementById('acSettingsLivePreview');
    const spPreviewContainer = document.getElementById('spSettingsLivePreview');
    if (!acPreviewContainer || !spPreviewContainer) return;

    const configPack = {
        institutionName: acInstNameInput?.value.trim() || 'প্রতিষ্ঠানের নাম',
        institutionAddress: acInstAddressInput?.value.trim() || 'স্থাপিত: ১৯১১ | ইআইআইএন: ১০৪৩৪৫',
        logoUrl: acCurrentSettings.logoUrl,
        watermarkUrl: acCurrentSettings.watermarkUrl,
        baseFontSize: acBaseFontSizeSelect?.value || '14px',
        titleFontSize: acTitleFontSizeSelect?.value || '22px',
        tableFontSize: acTableFontSizeSelect?.value || '13px',
        theme: acThemeSelect?.value || 'modern'
    };

    const mockStudent = {
        id: '১০১',
        name: 'শিক্ষার্থীর নাম',
        class: '৯ম',
        session: '২০২৪-২০২৫',
        group: 'বিজ্ঞান'
    };

    const mockSubjects = ['বাংলা', 'ইংরেজি', 'গণিত', 'পদার্থবিজ্ঞান', 'রসায়ন'];
    const mockExamName = 'অর্ধবার্ষিক পরীক্ষা';

    const acHtml = renderAdmitCard(mockStudent, mockSubjects, mockExamName, configPack);
    const spHtml = renderSeatPlan(mockStudent, mockExamName, configPack);

    const styleBlock = `
        --ac-watermark-url: url('${configPack.watermarkUrl}'); 
        --ac-base-font-size: ${configPack.baseFontSize}; 
        --ac-title-font-size: ${configPack.titleFontSize}; 
        --ac-table-font-size: ${configPack.tableFontSize};
    `;

    acPreviewContainer.innerHTML = `
        <div class="ac-page ac-theme-${configPack.theme}" style="${styleBlock} min-height: auto; width: 100%; border: none; box-shadow: none; padding: 15px; display: block;">
            ${acHtml}
        </div>
    `;

    spPreviewContainer.innerHTML = `
        <div class="ac-page ac-theme-${configPack.theme} seat-plan-mode" style="${styleBlock} min-height: auto; width: 100%; border: none; box-shadow: none; padding: 15px; display: block;">
            ${spHtml}
        </div>
    `;

    // Auto-scale titles in preview
    setTimeout(fitTitleScaling, 10);
}

async function saveACSettings() {
    const btn = acSaveSettingsBtn;
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> সেভ হচ্ছে...';
    btn.disabled = true;

    try {
        const settings = await getSettings() || {};
        const newSettings = {
            ...settings,
            admitCard: {
                instName: acInstNameInput?.value.trim() || '',
                instAddress: acInstAddressInput?.value.trim() || '',
                logoUrl: acCurrentSettings.logoUrl,
                watermarkUrl: acCurrentSettings.watermarkUrl,
                baseFontSize: acBaseFontSizeSelect?.value || '14px',
                titleFontSize: acTitleFontSizeSelect?.value || '22px',
                tableFontSize: acTableFontSizeSelect?.value || '13px',
                theme: acThemeSelect?.value || 'modern'
            }
        };

        const success = await saveSettings(newSettings);
        if (success) {
            showNotification('এডমিট কার্ডের সেটিংস সংরক্ষণ করা হয়েছে ✅');
            acSettingsModal.classList.remove('active');
            // Optional: Re-generate cards if already showing
            if (acPreviewWrapper.style.display === 'block') {
                const isSeat = admitCardPreview.classList.contains('seat-plan-mode');
                generateCards(isSeat ? 'seat' : 'admit');
            }
            // Trigger auto-scaling for titles after settings are saved and potentially cards regenerated
            setTimeout(fitTitleScaling, 50);
        } else {
            showNotification('সেটিংস সেভ করতে ব্যর্থ হয়েছে', 'error');
        }
    } catch (err) {
        console.error("Error saving admit card settings:", err);
        showNotification('সার্ভার এরর', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

export async function populateACDropdowns() {
    const exams = await getSavedExams();
    const settings = await getSettings() || {};

    const classes = [...new Set(exams.map(e => e.class).filter(Boolean))].sort();
    const sessions = [...new Set(exams.map(e => e.session).filter(Boolean))].sort().reverse();

    if (acClassSelect) {
        acClassSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন</option>';
        classes.forEach(c => acClassSelect.innerHTML += `<option value="${c}">${c}</option>`);
    }

    if (acSessionSelect) {
        acSessionSelect.innerHTML = '<option value="">সেশন নির্বাচন</option>';
        sessions.forEach(s => acSessionSelect.innerHTML += `<option value="${s}">${s}</option>`);
    }

    const updateExamNames = async () => {
        const selClass = acClassSelect?.value;
        const selSession = acSessionSelect?.value;

        if (acExamNameSelect) {
            if (!selClass || !selSession) {
                acExamNameSelect.innerHTML = '<option value="">শ্রেণি ও সেশন নির্বাচন</option>';
                if (acGroupSelect) acGroupSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>';
                return;
            }
            acExamNameSelect.innerHTML = '<option value="">লোড হচ্ছে...</option>';
            const configs = await getExamConfigs(selClass, selSession);
            const examNames = configs.map(c => c.examName);

            acExamNameSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন</option>';
            if (examNames.length > 0) {
                examNames.forEach(n => acExamNameSelect.innerHTML += `<option value="${n}">${n}</option>`);
            } else {
                acExamNameSelect.innerHTML = '<option value="">কোনো পরীক্ষা তৈরি করা নেই</option>';
            }

            // Auto Update Groups when Class/Session changes
            updateGroupDropdown();
        }
    };

    const updateGroupDropdown = async () => {
        const selClass = acClassSelect?.value;
        const selSession = acSessionSelect?.value;

        if (acGroupSelect) {
            acGroupSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>';
            if (selClass && selSession) {
                const filteredExams = exams.filter(e => e.class === selClass && e.session === selSession);
                const groups = new Set();
                filteredExams.forEach(exam => {
                    if (exam.studentData) {
                        exam.studentData.forEach(s => {
                            if (s.group) groups.add(s.group);
                        });
                    }
                });

                const sortedGroups = [...groups].sort();
                sortedGroups.forEach(g => {
                    acGroupSelect.innerHTML += `<option value="${g}">${g}</option>`;
                });
            }
        }
    }

    if (acClassSelect) acClassSelect.addEventListener('change', updateExamNames);
    if (acSessionSelect) acSessionSelect.addEventListener('change', updateExamNames);
    // When Exam Name changes, update groups specifically for that exam if needed (Optional, currently global for class/session)
    if (acExamNameSelect) acExamNameSelect.addEventListener('change', updateGroupDropdown);
}

async function generateCards(type) {
    const cls = acClassSelect?.value;
    const session = acSessionSelect?.value;
    const examName = acExamNameSelect?.value;
    const layoutSize = parseInt(acLayoutSelect?.value || '6', 10);
    const orientationSelect = document.getElementById('acOrientation');
    const pageOrientation = orientationSelect ? orientationSelect.value : 'portrait';

    if (!cls || !session || !examName) {
        showNotification('শ্রেণি, সেশন এবং পরীক্ষা নির্বাচন করুন', 'error');
        return;
    }

    const allExams = await getSavedExams();
    const relevantExams = allExams.filter(e => e.class === cls && e.session === session && e.name === examName);

    if (relevantExams.length === 0) {
        showNotification('নির্বাচিত তথ্য অনুযায়ী কোনো শিক্ষার্থী পাওয়া যায়নি', 'error');
        return;
    }

    const subjectsSet = new Set(relevantExams.map(e => e.subject).filter(Boolean));
    const subjects = [...subjectsSet].sort(); // Optional sorting

    // Build unique student list
    const studentAgg = new Map();
    const selectedGroup = acGroupSelect?.value || 'all';

    relevantExams.forEach(exam => {
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                const sGroup = s.group || '';
                // Filter by group if a specific group is selected
                if (selectedGroup !== 'all' && sGroup !== selectedGroup) {
                    return;
                }

                const key = `${s.id}_${sGroup}`;
                if (!studentAgg.has(key)) {
                    studentAgg.set(key, {
                        id: s.id,
                        name: s.name,
                        group: sGroup,
                        class: cls,
                        session: session
                    });
                }
            });
        }
    });

    let studentsArray = [...studentAgg.values()].sort((a, b) => {
        // Primary sort: Group Alphabetically
        const groupA = a.group.toLowerCase();
        const groupB = b.group.toLowerCase();
        if (groupA < groupB) return -1;
        if (groupA > groupB) return 1;

        // Secondary sort: Roll number
        return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
    });

    if (studentsArray.length === 0) {
        showNotification('শিক্ষার্থী পাওয়া যায়নি (হয়তো এই গ্রুপে কেউ নেই)', 'error');
        return;
    }

    // Fetch Settings
    const settings = await getSettings() || {};
    const acConfig = settings.admitCard || {};
    const institutionName = acConfig.instName || 'প্রতিষ্ঠান এর নাম';
    const institutionAddress = acConfig.instAddress || '';
    const logoUrl = acConfig.logoUrl || '';
    const watermarkUrl = acConfig.watermarkUrl || '';

    const baseFontSize = acConfig.baseFontSize || '14px';
    const titleFontSize = acConfig.titleFontSize || '22px';
    const tableFontSize = acConfig.tableFontSize || '13px';
    const theme = acConfig.theme || 'modern';

    // Pass configuration pack to render functions
    const configPack = { institutionName, institutionAddress, logoUrl, watermarkUrl, baseFontSize, titleFontSize, tableFontSize, theme };

    // Chunking logic based on layoutSize
    const cardsPerPage = type === 'admit' ? layoutSize : layoutSize * 2;
    const totalPages = Math.ceil(studentsArray.length / cardsPerPage);
    let pagesHTML = '';
    for (let i = 0; i < totalPages; i++) {
        const slice = studentsArray.slice(i * cardsPerPage, (i + 1) * cardsPerPage);
        const cardsHtml = slice.map(student => {
            if (type === 'admit') return renderAdmitCard(student, subjects, examName, configPack);
            return renderSeatPlan(student, examName, configPack);
        }).join('');

        pagesHTML += `
            <div class="ac-page ac-layout-${layoutSize} ac-theme-${configPack.theme} ac-page-${pageOrientation}" 
                 style="--ac-watermark-url: url('${configPack.watermarkUrl}');
                        --ac-base-font-size: ${configPack.baseFontSize};
                        --ac-title-font-size: ${configPack.titleFontSize};
                        --ac-table-font-size: ${configPack.tableFontSize};">
                ${cardsHtml}
            </div>
        `;
    }

    admitCardPreview.innerHTML = pagesHTML;
    admitCardPreview.classList.remove('seat-plan-mode');
    if (type === 'seat') admitCardPreview.classList.add('seat-plan-mode');

    acPreviewWrapper.style.display = 'block';
    acEmptyStateMsg.style.display = 'none';
    if (acPrintAllBtn) acPrintAllBtn.style.display = 'inline-flex';

    showNotification(`${studentsArray.length} জন শিক্ষার্থীর ${type === 'admit' ? 'এডমিট কার্ড' : 'সীট প্ল্যান'} তৈরি হয়েছে ✅`);

    // Auto-scale titles to fit one line
    setTimeout(fitTitleScaling, 50);
}

function renderAdmitCard(student, subjects, examName, config) {
    const subjectsList = subjects.length > 0 ?
        `<div class="ac-subjects-box">
            <strong>বিষয়সমূহ:</strong>
            <div class="ac-subjects-grid">${subjects.map(sub => `<span>${sub}</span>`).join('')}</div>
        </div>` : '';

    // Logo block
    const logoHtml = config.logoUrl ? `<img src="${config.logoUrl}" class="ac-logo" alt="Logo">` : '';
    const addressHtml = config.institutionAddress ? `<div class="ac-address">${config.institutionAddress}</div>` : '';

    return `
        <div class="ac-card ${config.watermarkUrl ? 'ac-has-watermark' : ''}">
            <div class="ac-card-inner">
                <div class="ac-header">
                    <div class="ac-logo-container">${logoHtml}</div>
                    <div class="ac-header-text">
                        <h3>${config.institutionName}</h3>
                        ${addressHtml}
                    </div>
                </div>
                
                <div class="ac-title-wrapper">
                    <div class="ac-title">প্রবেশপত্র</div>
                </div>
                
                <div class="ac-exam-name">${examName} - ${student.session}</div>
                
                <div class="ac-body">
                    <div class="ac-info-section">
                        <table class="ac-info-table">
                            <tr><th>শিক্ষার্থীর নাম</th><td>: <strong>${student.name}</strong></td></tr>
                            <tr><th>রোল নম্বর</th><td>: <strong>${student.id}</strong></td></tr>
                            <tr><th>শ্রেণি</th><td>: ${student.class}</td></tr>
                            <tr><th>বিভাগ/গ্রুপ</th><td>: ${student.group || 'প্রযোজ্য নয়'}</td></tr>
                        </table>
                        ${subjectsList}
                    </div>
                    <div class="ac-photo-section">
                        <div class="ac-photo-box">
                            <span>পাসপোর্ট<br>সাইজ ছবি</span>
                        </div>
                    </div>
                </div>
                
                <div class="ac-footer">
                    <div class="ac-footer-left">
                        <div class="ac-sig">শ্রেণি শিক্ষক</div>
                    </div>
                    <div class="ac-footer-right">
                        <div class="ac-sig">অধ্যক্ষ / পরীক্ষা নিয়ন্ত্রক</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderSeatPlan(student, examName, config) {
    const logoHtml = config.logoUrl ? `<img src="${config.logoUrl}" class="sp-logo" alt="Logo">` : '';

    return `
        <div class="sp-card ${config.watermarkUrl ? 'sp-has-watermark' : ''}">
            <div class="sp-card-inner">
                <div class="sp-header">
                    ${logoHtml}
                    <div class="sp-header-text">
                        <div class="sp-inst-name">${config.institutionName}</div>
                        <div class="sp-exam">${examName} - ${student.session}</div>
                    </div>
                </div>
                
                <div class="sp-body">
                    <table class="sp-table">
                        <tr><th>নাম</th><td>: ${student.name}</td></tr>
                        <tr><th>রোল</th><td class="sp-highlight-roll">: ${student.id}</td></tr>
                        <tr><th>শ্রেণি</th><td>: ${student.class}</td></tr>
                        <tr><th>গ্রুপ</th><td>: ${student.group || 'N/A'}</td></tr>
                    </table>
                </div>
            </div>
        </div>
    `;
}
