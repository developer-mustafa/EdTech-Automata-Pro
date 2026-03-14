import { db } from '../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { state } from './state.js';
import { showNotification } from '../utils.js';
import { getClassSubjectMappings, getSettings, getExamConfigs } from '../firestoreService.js';
import { loadMarksheetRules } from './marksheetRulesManager.js';

const SETTINGS_COLLECTION = 'settings';
const ROUTINES_DOC_ID = 'admit_card_routines';

export let routinesData = {}; // Cache for all routines
let currentRoutineKey = '';

export function getRoutinesData() {
    return routinesData;
}

// UI Elements
let routineModal, closeRoutineBtn, addRowBtn, saveBtn, printBtn;
let rtClassSelect, rtSessionSelect, rtExamNameSelect, rtGroupSelect, routineTableBody;

const DAYS_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

const GROUP_TRANSLATIONS = {
    'science': ['বিজ্ঞান', 'science', 'sci', 'sc.'],
    'humanities': ['মানবিক', 'humanities', 'arts', 'hum', 'arts group'],
    'business': ['ব্যবসায়', 'ব্যবসায়', 'ব্যবসায় শিক্ষা', 'ব্যবসায় শিক্ষা', 'business', 'commerce', 'com', 'bus'],
    'arts': ['মানবিক', 'arts', 'humanities']
};

export async function initRoutineManager() {
    routineModal = document.getElementById('acRoutineModal');
    closeRoutineBtn = document.getElementById('closeAcRoutineBtn');
    addRowBtn = document.getElementById('addRoutineRowBtn');
    saveBtn = document.getElementById('saveRoutineBtn');
    printBtn = document.getElementById('printRoutineBtn');

    rtClassSelect = document.getElementById('rtClass');
    rtSessionSelect = document.getElementById('rtSession');
    rtExamNameSelect = document.getElementById('rtExamName');
    rtGroupSelect = document.getElementById('rtGroup');
    routineTableBody = document.getElementById('routineTableBody');

    // Global Event Listener for opening the modal (will be called from admitCardManager)
    document.getElementById('acRoutineBtn').addEventListener('click', openRoutineModal);

    closeRoutineBtn.addEventListener('click', () => routineModal.classList.remove('active'));
    addRowBtn.addEventListener('click', () => addRoutineRow());
    saveBtn.addEventListener('click', saveCurrentRoutine);
    printBtn.addEventListener('click', printRoutine);

    // Filter Listeners
    [rtClassSelect, rtSessionSelect, rtExamNameSelect, rtGroupSelect].forEach(sel => {
        sel.addEventListener('change', async () => {
            updateRoutineKey();
            await loadRoutineForSelection();
        });
    });

    // Special listener for rtClass and rtSession to update Exam Name dropdown
    rtClassSelect.addEventListener('change', populateExamDropdown);
    rtSessionSelect.addEventListener('change', populateExamDropdown);

    // Initial load from Firestore
    await fetchRoutines();
}

export async function fetchRoutines() {
    try {
        const docRef = doc(db, SETTINGS_COLLECTION, ROUTINES_DOC_ID);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            routinesData = docSnap.data();
        } else {
            routinesData = {};
        }
    } catch (error) {
        console.error("Error fetching routines:", error);
    }
}

async function openRoutineModal() {
    routineModal.classList.add('active');
    populateRoutineDropdowns();
    await populateExamDropdown();
}

export function populateRoutineDropdowns() {
    // Populate Class, Session, Group using state or dynamic attributes
    // This is similar to populateACDropdowns in admitCardManager
    
    // Use attributes if they exist
    const classes = state.academicStructure?.class || [];
    const sessions = state.academicStructure?.session || [];
    const groups = state.academicStructure?.group || [];

    rtClassSelect.innerHTML = classes.map(c => `<option value="${c.value}">${c.value}</option>`).join('');
    rtSessionSelect.innerHTML = sessions.map(s => `<option value="${s.value}">${s.value}</option>`).join('');
    rtGroupSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>' + 
        groups.map(g => `<option value="${g.value}">${g.value}</option>`).join('');

    // Pre-sync with main Admit Card selections if possible
    const mainClass = document.getElementById('acClass').value;
    const mainSession = document.getElementById('acSession').value;
    const mainGroup = document.getElementById('acGroup').value;

    if (mainClass) rtClassSelect.value = mainClass;
    if (mainSession) rtSessionSelect.value = mainSession;
    if (mainGroup) rtGroupSelect.value = mainGroup;

    populateExamDropdown();
}

async function populateExamDropdown() {
    try {
        const cls = rtClassSelect.value;
        const session = rtSessionSelect.value;
        
        // Fetch all configured exams from Master Config instead of just saved results
        let configs = await getExamConfigs(cls, session);
        let relevantExams = [...new Set(configs.map(e => e.examName))].filter(Boolean);

        if (relevantExams.length === 0) {
            rtExamNameSelect.innerHTML = '<option value="">প্রথমে এক্সাম কনফিগারেশন করুন</option>';
        } else {
            rtExamNameSelect.innerHTML = relevantExams.map(name => `<option value="${name}">${name}</option>`).join('');
            
            // Pre-sync with main Admit Card exam if exists
            const mainExam = document.getElementById('acExamName')?.value;
            if (mainExam && relevantExams.includes(mainExam)) {
                rtExamNameSelect.value = mainExam;
            }
        }

        updateRoutineKey();
        loadRoutineForSelection();
    } catch (error) {
        console.error("Error populating exam dropdown:", error);
    }
}

function updateRoutineKey() {
    const cls = (rtClassSelect.value || '').trim();
    const session = (rtSessionSelect.value || '').trim();
    const exam = (rtExamNameSelect.value || '').trim();
    const groupNorm = normalizeGroupName(rtGroupSelect.value);
    currentRoutineKey = `${cls}_${session}_${exam}_${groupNorm}`;
}

async function loadRoutineForSelection() {
    routineTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i>লোড হচ্ছে...</td></tr>';
    const routine = routinesData[currentRoutineKey];
    
    // Clear the loading message
    routineTableBody.innerHTML = '';
    
    if (routine && routine.rows) {
        for (const rowData of routine.rows) {
            await addRoutineRow(rowData);
        }
    } else {
        // Add 3 empty rows by default if no data, sequentially
        for (let i = 0; i < 3; i++) {
            await addRoutineRow();
        }
    }
}

async function getSubjectsForCurrentClass() {
    const cls = rtClassSelect.value;
    const group = rtGroupSelect.value;
    
    let subjectGroups = {
        general: [],
        groupBased: [],
        optional: []
    };
    
    try {
        // 1. Load Marksheet Rules
        const allRules = await loadMarksheetRules();
        const rules = allRules[cls] || allRules['All'] || {};
        
        subjectGroups.general = rules.generalSubjects || [];
        const groupSubsMapping = rules.groupSubjects || {};
        const optionalSubsMapping = rules.optionalSubjects || {};

        if (group === 'all') {
            // Include everything from all groups
            Object.values(groupSubsMapping).forEach(subs => subjectGroups.groupBased.push(...subs));
            Object.values(optionalSubsMapping).forEach(subs => subjectGroups.optional.push(...subs));
        } else {
            // Specific Group Filtering:
            // Match the selected group key in the mappings
            // We search case-insensitively and with common translations
            const matchGroup = (mapping) => {
                const keys = Object.keys(mapping);
                const gValue = group.trim().toLowerCase();
                
                // 1. Exact or include match
                let foundKey = keys.find(k => k.trim().toLowerCase() === gValue) || 
                               keys.find(k => gValue.includes(k.toLowerCase()) || k.toLowerCase().includes(gValue));
                
                // 2. Common Bangladeshi Group Translations Mapping
                if (!foundKey) {
                    for (const [eng, bns] of Object.entries(GROUP_TRANSLATIONS)) {
                        if (bns.some(b => gValue.includes(b)) || gValue.includes(eng)) {
                            foundKey = keys.find(k => {
                                const kLow = k.toLowerCase();
                                return kLow.includes(eng) || bns.some(b => kLow.includes(b));
                            });
                            if (foundKey) break;
                        }
                    }
                }
                
                return foundKey ? mapping[foundKey] : [];
            };

            subjectGroups.groupBased = matchGroup(groupSubsMapping);
            subjectGroups.optional = matchGroup(optionalSubsMapping);
            
            // Also check for "General" or "সকলের জন্য" optional subjects
            const generalOptKey = Object.keys(optionalSubsMapping).find(k => k.toLowerCase().includes('general') || k.includes('সাধারণ'));
            if (generalOptKey && group !== generalOptKey) {
                const generalOpts = optionalSubsMapping[generalOptKey];
                subjectGroups.optional = [...new Set([...subjectGroups.optional, ...generalOpts])];
            }
        }
    } catch (e) {
        console.error("Error fetching rules for subjects:", e);
    }

    // Sort function for Bengali
    const bnSort = (a, b) => a.localeCompare(b, 'bn');

    // Remove duplicates and sort within each category
    subjectGroups.general = [...new Set(subjectGroups.general.filter(Boolean))].sort(bnSort);
    subjectGroups.groupBased = [...new Set(subjectGroups.groupBased.filter(Boolean))].sort(bnSort);
    subjectGroups.optional = [...new Set(subjectGroups.optional.filter(Boolean))].sort(bnSort);
    
    return subjectGroups;
}

// Helper for external modules to normalize group names for routine matching
export function normalizeGroupName(groupName) {
    if (!groupName) return 'all';
    const gn = groupName.trim().toLowerCase();
    if (gn === 'all' || gn === 'সকল গ্রুপ') return 'all';
    
    for (const [standard, variants] of Object.entries(GROUP_TRANSLATIONS)) {
        if (variants.includes(gn) || variants.some(v => gn.includes(v))) return standard;
    }
    return gn;
}

async function addRoutineRow(data = null) {
    const row = document.createElement('tr');
    
    // Auto-increment: get last seq and add 1
    let nextSeq = 1;
    const existingSeqs = Array.from(routineTableBody.querySelectorAll('.rt-seq'))
        .map(input => parseInt(input.value) || 0);
    if (existingSeqs.length > 0) {
        nextSeq = Math.max(...existingSeqs) + 1;
    }
    const currentSeq = data ? data.seq : nextSeq;
    
    const subjectData = await getSubjectsForCurrentClass();
    
    let subOptions = '<option value="">সিলেক্ট করুন</option>';
    
    if (subjectData.general.length > 0) {
        subOptions += `<optgroup label="সাধারণ বিষয় (General Subjects)">`;
        subOptions += subjectData.general.map(s => `<option value="${s}" ${data && data.subject === s ? 'selected' : ''}>${s}</option>`).join('');
        subOptions += `</optgroup>`;
    }
    
    if (subjectData.groupBased.length > 0) {
        subOptions += `<optgroup label="গ্রুপ ভিত্তিক বিষয় (Group Subjects)">`;
        subOptions += subjectData.groupBased.map(s => `<option value="${s}" ${data && data.subject === s ? 'selected' : ''}>${s}</option>`).join('');
        subOptions += `</optgroup>`;
    }
    
    if (subjectData.optional.length > 0) {
        subOptions += `<optgroup label="ঐচ্ছিক বিষয় (Optional Subjects)">`;
        subOptions += subjectData.optional.map(s => `<option value="${s}" ${data && data.subject === s ? 'selected' : ''}>${s}</option>`).join('');
        subOptions += `</optgroup>`;
    }

    row.innerHTML = `
        <td><input type="text" class="form-control rt-seq" value="${currentSeq}" style="text-align:center;"></td>
        <td><input type="date" class="form-control rt-date" value="${data ? data.date : ''}"></td>
        <td><input type="text" class="form-control rt-day" value="${data ? data.day : ''}" readonly style="background:#f8f9fa;"></td>
        <td>
            <select class="form-control rt-subject">
                ${subOptions}
            </select>
        </td>
        <td><input type="text" class="form-control rt-time" value="${data ? data.time : '১০:০০ AM'}" placeholder="e.g. 10:00 AM"></td>
        <td><button class="btn-danger rt-delete-btn" style="padding: 5px 10px;"><i class="fas fa-trash"></i></button></td>
    `;

    // Date change listener for auto-day
    const dateInput = row.querySelector('.rt-date');
    const dayInput = row.querySelector('.rt-day');
    dateInput.addEventListener('change', () => {
        const date = new Date(dateInput.value);
        if (!isNaN(date.getTime())) {
            dayInput.value = DAYS_BN[date.getDay()];
        } else {
            dayInput.value = '';
        }
    });

    // Delete row
    row.querySelector('.rt-delete-btn').addEventListener('click', () => {
        row.remove();
        resequenceRows();
    });

    routineTableBody.appendChild(row);
}

function resequenceRows() {
    const rows = routineTableBody.querySelectorAll('tr');
    rows.forEach((row, i) => {
        row.querySelector('.rt-seq').value = i + 1;
    });
}

async function saveCurrentRoutine() {
    updateRoutineKey();
    if (!rtExamNameSelect.value) {
        showNotification('সঠিক তথ্য (শ্রেণি, সেশন, পরীক্ষা) নিশ্চিত করুন', 'warning');
        return;
    }

    const rows = [];
    const tableRows = routineTableBody.querySelectorAll('tr');
    
    if (tableRows.length === 0) {
        showNotification('রুটিনে কোনো তথ্য নেই', 'warning');
        return;
    }

    tableRows.forEach(tr => {
        const seq = tr.querySelector('.rt-seq').value;
        const date = tr.querySelector('.rt-date').value;
        const day = tr.querySelector('.rt-day').value;
        const subject = tr.querySelector('.rt-subject').value;
        const time = tr.querySelector('.rt-time').value;
        
        if (date || subject) {
            rows.push({ seq, date, day, subject, time });
        }
    });

    if (rows.length === 0) {
        showNotification('কমপক্ষে একটি বিয়য় ও তারিখ দিন', 'warning');
        return;
    }

    try {
        routinesData[currentRoutineKey] = { 
            rows: rows.sort((a,b) => Number(a.seq) - Number(b.seq)), 
            updatedAt: new Date().toISOString() 
        };
        const docRef = doc(db, SETTINGS_COLLECTION, ROUTINES_DOC_ID);
        await setDoc(docRef, routinesData, { merge: true });
        showNotification('রুটিন সফলভাবে সেভ করা হয়েছে', 'success');
    } catch (e) {
        console.error("Save error:", e);
        showNotification('সেভ করতে সমস্যা হয়েছে: ' + e.message, 'error');
    }
}

async function printRoutine() {
    const rows = [];
    routineTableBody.querySelectorAll('tr').forEach(tr => {
        const seq = tr.querySelector('.rt-seq').value;
        const date = tr.querySelector('.rt-date').value;
        const day = tr.querySelector('.rt-day').value;
        const subject = tr.querySelector('.rt-subject').value;
        if (date && subject) {
            rows.push({ seq, date, day, subject });
        }
    });

    if (rows.length === 0) {
        showNotification('প্রিন্ট করার মতো কোনো তথ্য নেই', 'warning');
        return;
    }

    // Sort rows by seq
    rows.sort((a, b) => Number(a.seq) - Number(b.seq));

    // Get dynamic header info from Admit Card Configuration
    const appSettings = await getSettings() || {};
    const acConfig = appSettings.admitCard || {};
    
    // Primary source: Admit Card Settings, Fallback: General Settings
    const instName = acConfig.instName || appSettings.institutionName || 'শিক্ষা প্রতিষ্ঠান';
    const instAddress = acConfig.instAddress || appSettings.institutionAddress || '';
    const logoUrl = acConfig.logoUrl || appSettings.logoUrl || '';
    const watermarkUrl = acConfig.watermarkUrl || '';

    const examTitle = `${rtExamNameSelect.value} এর সময়সূচী`;
    const classInfo = `শ্রেণি: ${rtClassSelect.value} | সেশন: ${rtSessionSelect.value} ${rtGroupSelect.value !== 'all' ? '| গ্রুপ: ' + rtGroupSelect.value : ''}`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Routine Print - ${instName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');
                
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Hind Siliguri', sans-serif; 
                    padding: 0; 
                    margin: 0;
                    color: #2c3e50; 
                    background: #fff;
                }
                
                .print-page {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 20mm;
                    margin: 10mm auto;
                    background: white;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    position: relative;
                    overflow: hidden;
                }

                /* Watermark */
                ${watermarkUrl ? `
                .watermark {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-30deg);
                    width: 400px;
                    height: 400px;
                    opacity: 0.05;
                    pointer-events: none;
                    z-index: 0;
                    background: url('${watermarkUrl}') no-repeat center center;
                    background-size: contain;
                }
                ` : ''}

                .content-wrapper {
                    position: relative;
                    z-index: 1;
                }

                .header { 
                    text-align: center; 
                    border-bottom: 2px double #2c3e50; 
                    padding-bottom: 15px; 
                    margin-bottom: 25px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    gap: 25px; 
                }
                
                .logo { 
                    width: 85px; 
                    height: 85px; 
                    object-fit: contain; 
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
                }
                
                .header-text h1 { 
                    margin: 0; 
                    font-size: 28px; 
                    color: #1a237e; 
                    font-weight: 700;
                    letter-spacing: 0.5px;
                }
                
                .header-text p { 
                    margin: 5px 0 0 0; 
                    font-size: 15px; 
                    color: #555; 
                    font-weight: 500;
                }
                
                .exam-title-card { 
                    text-align: center; 
                    margin-bottom: 30px; 
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    border-left: 5px solid #1a237e;
                }
                
                .exam-title-card h2 { 
                    margin: 0; 
                    font-size: 22px; 
                    color: #c62828; 
                    font-weight: 700;
                    text-transform: uppercase;
                }
                
                .exam-title-card p { 
                    margin: 10px 0 0 0; 
                    font-weight: 600; 
                    font-size: 17px; 
                    color: #34495e;
                }
                
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin-top: 10px;
                    background: white;
                }
                
                th, td { 
                    border: 1px solid #2c3e50; 
                    padding: 14px 10px; 
                    text-align: center; 
                    font-size: 16px; 
                }
                
                th { 
                    background-color: #f1f4f9; 
                    color: #1a237e;
                    font-weight: 700; 
                    text-transform: uppercase;
                    font-size: 15px;
                }
                
                tr:nth-child(even) { background-color: #fafafa; }
                
                .subject-cell { 
                    text-align: left; 
                    padding-left: 20px; 
                    font-weight: 500;
                }

                .footer { 
                    margin-top: 80px; 
                    display: flex; 
                    justify-content: space-between; 
                    padding: 0 20px;
                }
                
                .sig-box { 
                    border-top: 1.5px solid #2c3e50; 
                    width: 180px; 
                    text-align: center; 
                    padding-top: 8px; 
                    font-size: 15px; 
                    font-weight: 600; 
                    color: #2c3e50;
                }

                .print-info {
                    position: absolute;
                    bottom: 10mm;
                    left: 20mm;
                    font-size: 10px;
                    color: #999;
                }
                
                @media print {
                    body { background: none; }
                    .print-page { 
                        margin: 0; 
                        box-shadow: none; 
                        width: 100%;
                        height: 100%;
                    }
                    @page {
                        size: A4;
                        margin: 0;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-page">
                ${watermarkUrl ? `<div class="watermark"></div>` : ''}
                
                <div class="content-wrapper">
                    <div class="header">
                        ${logoUrl ? `<img src="${logoUrl}" class="logo">` : ''}
                        <div class="header-text">
                            <h1>${instName}</h1>
                            <p>${instAddress}</p>
                        </div>
                    </div>
                    
                    <div class="exam-title-card">
                        <h2>${examTitle}</h2>
                        <p>${classInfo}</p>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 10%;">নং</th>
                                <th style="width: 25%;">তারিখ</th>
                                <th style="width: 18%;">বার</th>
                                <th>বিষয়</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                                <tr>
                                    <td style="font-weight:bold;">${convertToBengaliDigits(r.seq)}</td>
                                    <td>${formatDateBengali(r.date)}</td>
                                    <td>${r.day}</td>
                                    <td class="subject-cell">${r.subject}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div class="footer">
                        <div class="sig-box">পরীক্ষা নিয়ন্ত্রক</div>
                        <div class="sig-box">প্রধান শিক্ষক</div>
                    </div>
                </div>

                <div class="print-info">
                    Print Date: ${new Date().toLocaleString('bn-BD')} | Generated by Students Performance Analysis 2.0
                </div>
            </div>

            <script>
                // Format date function for Bengali
                function formatDateBengali(dateStr) {
                    if(!dateStr) return '';
                    const date = new Date(dateStr);
                    const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
                    const enDigits = ['0','1','2','3','4','5','6','7','8','9'];
                    const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
                    
                    const d = date.getDate().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
                    const m = months[date.getMonth()];
                    const y = date.getFullYear().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
                    
                    return d + ' ' + m + ', ' + y;
                }
                
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                    }, 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Utility to convert numbers to Bengali digits
 */
function convertToBengaliDigits(num) {
    const enDigits = ['0','1','2','3','4','5','6','7','8','9'];
    const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    return num.toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
}

function formatDateBengali(dateStr) {
    if(!dateStr) return '';
    const date = new Date(dateStr);
    const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    const enDigits = ['0','1','2','3','4','5','6','7','8','9'];
    const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    
    const d = date.getDate().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
    const m = months[date.getMonth()];
    const y = date.getFullYear().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
    
    return d + ' ' + m + ', ' + y;
}
