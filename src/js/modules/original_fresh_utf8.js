import { state } from './state.js';
import { getMarksheetSettings, loadMarksheetSettings, applyCombinedPaperLogic } from './marksheetManager.js';
import { loadMarksheetRules, currentMarksheetRules } from './marksheetRulesManager.js';
import { showNotification, convertToBengaliDigits, convertToEnglishDigits, isAbsent, determineStatus, normalizeText, calculateStatistics, isStudentEligibleForSubject } from '../utils.js';
import { getSavedExams, getSettings, getUnifiedStudents, getExamConfigs, getTutorialExamConfigs, getStudentLookupMap, generateStudentDocId, getSubjectConfigs, getSavedExamsByType } from '../firestoreService.js';
import { FAILING_THRESHOLD } from '../constants.js';
import { APP_VERSION } from '../version.js';

let lastGeneratedSubjects = [];
let reportDropdownsBound = false;

function getGradePoint(pct) {
    if (pct >= 80) return 5.00;
    if (pct >= 70) return 4.00;
    if (pct >= 60) return 3.50;
    if (pct >= 50) return 3.00;
    if (pct >= 40) return 2.00;
    if (pct >= 33) return 1.00;
    return 0.00;
}

function getLetterGrade(pct) {
    if (pct >= 80) return 'A+';
    if (pct >= 70) return 'A';
    if (pct >= 60) return 'A-';
    if (pct >= 50) return 'B';
    if (pct >= 40) return 'C';
    if (pct >= 33) return 'D';
    return 'F';
}

function getOverallGradeFromGPA(gpa, allPassed) {
    if (!allPassed || gpa < 1.0) return 'F';
    if (gpa >= 5.0) return 'A+';
    if (gpa >= 4.0) return 'A';
    if (gpa >= 3.5) return 'A-';
    if (gpa >= 3.0) return 'B';
    if (gpa >= 2.0) return 'C';
    return 'D';
}

function getMappedKey(group, keys) {
    const normGroup = normalizeText(group);
    return keys.find(k => normalizeText(k) === normGroup) || group;
}

export async function populateReportDropdowns() {
    const classSelect = document.getElementById('rptClass');
    const sessionSelect = document.getElementById('rptSession');
    const examSelect = document.getElementById('rptExamName');

    if (!classSelect || !sessionSelect || !examSelect) return;

    const exams = await getSavedExams();
    const classes = [...new Set(exams.map(e => e.class).filter(Boolean))].sort();
    const sessions = [...new Set(exams.map(e => e.session).filter(Boolean))].sort().reverse();

    classSelect.innerHTML = '<option value="">αª╢αºìαª░αºçαªúαª┐ αª¿αª┐αª░αºìαª¼αª╛αªÜαª¿</option>';
    classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`);

    sessionSelect.innerHTML = '<option value="">αª╕αºçαª╢αª¿ αª¿αª┐αª░αºìαª¼αª╛αªÜαª¿</option>';
    sessions.forEach(s => sessionSelect.innerHTML += `<option value="${s}">${s}</option>`);

    const updateExams = async () => {
        const selClass = classSelect.value;
        const selSession = sessionSelect.value;
        if (!selClass || !selSession) {
            examSelect.innerHTML = '<option value="">αª╢αºìαª░αºçαªúαª┐ αªô αª╕αºçαª╢αª¿ αª¿αª┐αª░αºìαª¼αª╛αªÜαª¿ αªòαª░αºüαª¿</option>';
            return;
        }
        try {
            let configs;
            if (state.isTutorialReportMode) {
                configs = await getTutorialExamConfigs(selClass, selSession);
            } else {
                configs = await getExamConfigs(selClass, selSession);
            }
            const examNames = [...new Set((configs || []).map(c => c.examName).filter(Boolean))].sort();

            examSelect.innerHTML = '<option value="">αª¬αª░αºÇαªòαºìαª╖αª╛ αª¿αª┐αª░αºìαª¼αª╛αªÜαª¿</option>';
            if (examNames.length === 0) {
                examSelect.innerHTML = '<option value="">αª╢αª╛αªûαª╛/αª╢αºìαª░αºçαªúαª┐αªñαºç αªòαºïαª¿αºï αªÅαªòαºìαª╕αª╛αª« αªòαª¿αª½αª┐αªù αª¿αºçαªç</option>';
            } else {
                examNames.forEach(n => examSelect.innerHTML += `<option value="${n}">${n}</option>`);
            }
        } catch (err) {
            console.error('Dropdown error:', err);
            examSelect.innerHTML = '<option value="">αª▓αºïαªí αªòαª░αªñαºç αª╕αª«αª╕αºìαª»αª╛ αª╣αºƒαºçαª¢αºç</option>';
        }
    };

    if (!reportDropdownsBound) {
        classSelect.onchange = updateExams;
        sessionSelect.onchange = updateExams;
        reportDropdownsBound = true;
    }

    if (classSelect.value && sessionSelect.value) updateExams();
}

export async function generateReport() {
    const rptClass = document.getElementById('rptClass')?.value;
    const rptSession = document.getElementById('rptSession')?.value;
    const examName = document.getElementById('rptExamName')?.value;
    const calcMode = document.getElementById('rptCalculationMode')?.value || 'auto';

    if (!rptClass || !rptSession || !examName) {
        showNotification('αª╢αºìαª░αºçαªúαª┐, αª╕αºçαª╢αª¿ αªÅαª¼αªé αª¬αª░αºÇαªòαºìαª╖αª╛ αª¿αª┐αª░αºìαª¼αª╛αªÜαª¿ αªòαª░αºüαª¿!', 'warning');
        return;
    }

    // Fetch all necessary data in parallel for optimal performance and sync
    const [allExams, masterRules, _msSetResult, specificConfigs, studentLookupMap, rawAllStudents, latestSubjectConfigs] = await Promise.all([
        getSavedExams(),
        loadMarksheetRules(), // Ensures latest rules are loaded
        loadMarksheetSettings(), // Ensures latest subject mappings are loaded
        getExamConfigs(rptClass, rptSession),
        getStudentLookupMap(),
        getUnifiedStudents(),
        getSubjectConfigs()
    ]);

    if (latestSubjectConfigs) {
        state.subjectConfigs = latestSubjectConfigs;
    }

    const clsNorm = normalizeText(rptClass);
    const sesNorm = normalizeText(rptSession);
    const examNorm = normalizeText(examName);

    const relevantExams = allExams.filter(e => {
        const dbClass = normalizeText(e.class);
        const dbSession = normalizeText(e.session);
        const dbExamName = normalizeText(e.examName || e.name || '');
        return dbClass === clsNorm && dbSession === sesNorm && dbExamName === examNorm;
    });

    if (relevantExams.length === 0) {
        showNotification('αªíαºçαªƒαª╛ αª¬αª╛αªôαºƒαª╛ αª»αª╛αºƒαª¿αª┐!', 'error');
        return;
    }

    const tutorialExams = await getSavedExamsByType('tutorial');
    const relevantTutorialExams = tutorialExams.filter(e => {
        const dbClass = normalizeText(e.class);
        const dbSession = normalizeText(e.session);
        return dbClass === clsNorm && dbSession === sesNorm;
    });

    const masterStudents = rawAllStudents.filter(s => {
        // Exclude inactive students via lookup map for dashboard consistency
        const key = generateStudentDocId({ id: s.id, group: s.group, class: rptClass, session: rptSession });
        const lookup = studentLookupMap.get(key);
        if (lookup && (lookup.status === false || lookup.status === 'false')) return false;

        const sCls = normalizeText(s.class || s.currentClass || '');
        const sSes = normalizeText(s.session || s.academicSession || '');
        const classMatch = sCls === clsNorm || sCls.includes(clsNorm) || clsNorm.includes(sCls);
        const cleanSess = (val) => val.replace(/[^\d]/g, '');
        const sesMatch = sSes === sesNorm || cleanSess(sSes).includes(cleanSess(sesNorm)) || cleanSess(sesNorm).includes(cleanSess(sSes));
        return classMatch && sesMatch;
    });

    const masterLookup = new Map();
    masterStudents.forEach(ms => masterLookup.set(String(ms.id).trim(), ms));

    const studentAgg = new Map();
    const subjectsSet = new Set();
    const ms = getMarksheetSettings();
    const rules = masterRules || currentMarksheetRules;
    const hiddenSet = new Set((ms.reportHiddenSubjects || []).map(s => normalizeText(s)));

    relevantExams.forEach(exam => {
        if (hiddenSet.has(normalizeText(exam.subject))) return;
        subjectsSet.add(exam.subject);
        exam.studentData.forEach(s => {
            const rollKey = String(s.id || s.roll).trim();
            if (!masterLookup.has(rollKey)) return;

            const master = masterLookup.get(rollKey);
            if (!studentAgg.has(rollKey)) {
                studentAgg.set(rollKey, {
                    roll: rollKey,
                    name: master.name,
                    class: master.class || rptClass,
                    session: master.session || rptSession,
                    group: master.group || '',
                    subjects: {}
                });
            }

            const curSub = studentAgg.get(rollKey).subjects[exam.subject] || { written: null, mcq: null, practical: null, total: null, status: null };

            const hasVal = (v) => v !== undefined && v !== null && v !== '';

            if (hasVal(s.written)) curSub.written = (curSub.written === null ? 0 : curSub.written) + Number(s.written);
            if (hasVal(s.mcq)) curSub.mcq = (curSub.mcq === null ? 0 : curSub.mcq) + Number(s.mcq);
            if (hasVal(s.practical)) curSub.practical = (curSub.practical === null ? 0 : curSub.practical) + Number(s.practical);
            if (hasVal(s.total)) curSub.total = (curSub.total === null ? 0 : curSub.total) + Number(s.total);

            // Maintain the database status as an exact fallback backup
            if (s.status) curSub.status = s.status;

            studentAgg.get(rollKey).subjects[exam.subject] = curSub;
        });
    });

    // Calculate and integrate tutorial marks
    relevantTutorialExams.forEach(exam => {
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                const rollKey = String(s.id || s.roll).trim();
                
                if (studentAgg.has(rollKey)) {
                    const subjKey = exam.subject || '';
                    if (studentAgg.get(rollKey).subjects[subjKey]) {
                        const targetSubjData = studentAgg.get(rollKey).subjects[subjKey];
                        if (!targetSubjData.tutorialMarksArr) {
                            targetSubjData.tutorialMarksArr = [];
                        }
                        if (s.total > 0 || String(s.status) === 'Absent') {
                            targetSubjData.tutorialMarksArr.push(Number(s.total) || 0);
                        }
                    }
                }
            });
        }
    });



    const subjects = [...subjectsSet].sort();
    lastGeneratedSubjects = subjects;
    const allStudents = [...studentAgg.values()];

    const groupStats = new Map();
    const overallGrades = { 'A+': 0, 'A': 0, 'A-': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    let gT = 0, gE = 0, gP = 0, gF = 0;

    const clsRules = rules[rptClass] || rules['All'] || { generalSubjects: [], groupSubjects: {}, optionalSubjects: {} };
    const optSubsObj = clsRules.optionalSubjects || {};

    let isCombinedMode = clsRules.mode === 'combined';
    if (calcMode === 'combined') isCombinedMode = true;
    if (calcMode === 'single') isCombinedMode = false;

    const getCanonicalGroup = (grp) => {
        const t = normalizeText(grp || '');
        if (t.includes('αª¼αª┐αª£αºìαª₧αª╛αª¿') || t.includes('science')) return 'αª¼αª┐αª£αºìαª₧αª╛αª¿ αªùαºìαª░αºüαª¬';
        if (t.includes('αª¼αºìαª»αª¼αª╕αª╛αª»αª╝') || t.includes('business')) return 'αª¼αºìαª»αª¼αª╕αª╛αª»αª╝ αªùαºìαª░αºüαª¬';
        if (t.includes('αª«αª╛αª¿αª¼αª┐αªò') || t.includes('arts') || t.includes('humanities')) return 'αª«αª╛αª¿αª¼αª┐αªò αªùαºìαª░αºüαª¬';
        return 'αªàαª¿αºìαª»αª╛αª¿αºìαª»';
    };

    const getGroupBadge = (grp) => {
        const canonical = getCanonicalGroup(grp);
        if (canonical === 'αª¼αª┐αª£αºìαª₧αª╛αª¿ αªùαºìαª░αºüαª¬') {
            return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; font-weight: 700; font-size: 0.85em;">${canonical}</span>`;
        } else if (canonical === 'αª¼αºìαª»αª¼αª╕αª╛αª»αª╝ αªùαºìαª░αºüαª¬') {
            return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #eff6ff; color: #2563eb; border: 1px solid #dbeafe; font-weight: 700; font-size: 0.85em;">${canonical}</span>`;
        } else if (canonical === 'αª«αª╛αª¿αª¼αª┐αªò αªùαºìαª░αºüαª¬') {
            return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; font-weight: 700; font-size: 0.85em;">${canonical}</span>`;
        }
        return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; font-weight: 700; font-size: 0.85em;">${grp || 'N/A'}</span>`;
    };

    const getBengaliOrdinal = (n) => {
        if (n === 1) return 'αººαª«';
        if (n === 2) return 'αº¿αºƒ';
        if (n === 3) return 'αº⌐αºƒ';
        if (n === 4) return 'αº¬αª░αºìαªÑ';
        if (n === 5) return 'αº½αª«';
        if (n === 6) return 'αº¼αª╖αºìαªá';
        if (n === 7) return 'αº¡αª«';
        if (n === 8) return 'αº«αª«';
        if (n === 9) return 'αº»αª«';
        if (n === 10) return 'αººαºªαª«';
        return convertToBengaliDigits(n) + 'αªñαª«';
    };

    // ============================================================
    // BUILD MARKSHEET-IDENTICAL SUMMARY AGGREGATION
    // Mirrors marksheetManager.js lines 350-413 and 561-603 EXACTLY
    // Key = ${roll}_${group} (like marksheet), subject key normalized,
    // data handling = overwrite (like marksheet), NOT accumulate
    // ============================================================

    const summaryAgg = new Map();
    // Initialize groupStats and summaryAgg with all ACTIVE master students (true enrollment)
    masterStudents.forEach(ms => {
        const group = getCanonicalGroup(ms.group || '');
        if (!groupStats.has(group)) groupStats.set(group, { total: 0, examinees: 0, pass: 0, fail: 0 });
        groupStats.get(group).total++;

        // Pre-populate summaryAgg to ensure all active students are counted in totals
        const sRoll = convertToEnglishDigits(String(ms.id || '').trim().replace(/^0+/, '')) || '0';
        const sGroupKey = normalizeText(group); // Use canonical group for the key
        const key = `${sRoll}_${sGroupKey}`;
        if (!summaryAgg.has(key)) {
            summaryAgg.set(key, {
                id: ms.id,
                name: ms.name,
                group: group, // Store canonical name
                status: true,
                subjects: {}
            });
        }
    });

    relevantExams.forEach(exam => {
        if (hiddenSet.has(normalizeText(exam.subject))) return;
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                const sRoll = convertToEnglishDigits(String(s.id || '').trim().replace(/^0+/, '')) || '0';
                const sGroupKey = normalizeText(getCanonicalGroup(s.group || ''));
                const key = `${sRoll}_${sGroupKey}`;

                const targetEntry = summaryAgg.get(key);
                if (!targetEntry) return;

                // Use EXACT same subject key normalization as marksheet
                const subjKey = normalizeText(exam.subject).replace(/\s+/g, '') || exam.subject;
                const existingSubData = targetEntry.subjects[subjKey];

                const hasVal = (v) => v !== undefined && v !== null && v !== '';
                const hasMarks = hasVal(s.written) || hasVal(s.mcq) || hasVal(s.practical) || hasVal(s.total);

                if (!existingSubData || hasMarks) {
                    targetEntry.subjects[subjKey] = {
                        written: s.written || 0,
                        mcq: s.mcq || 0,
                        practical: s.practical || 0,
                        total: s.total || 0,
                        grade: s.grade || '',
                        gpa: s.gpa || '',
                        status: s.status || ''
                    };
                }
            });
        }
    });

    // Get all active students for summary (marksheet line 405-406)
    const allSummaryStudents = [...summaryAgg.values()]
        .filter(s => String(s.status) !== 'false');

    // Apply Combined Paper Logic for accurate subject counts
    const allOptSubsList = Object.values(optSubsObj).flat().map(os => normalizeText(os));
    let displaySubjects = subjects.map(s => ({ paper: s, isCombined: false, isOptional: allOptSubsList.some(os => s.includes(os) || os.includes(s)) }));
    if (isCombinedMode && clsRules.combinedSubjects?.length > 0) {
        displaySubjects = applyCombinedPaperLogic(allSummaryStudents, subjects, clsRules, allOptSubsList);
    }

    // Count totals from summary students ΓÇö GROUP-WISE breakdown (marksheet lines 561-603)
    const studentResultRecords = [];
    const fullyAbsentStudents = [];
    const partiallyAbsentStudents = [];

    allSummaryStudents.forEach(student => {
        const group = getCanonicalGroup(student.group || '');
        const gs = groupStats.get(group);
        if (!gs) return; // Should not happen

        const normGroup = normalizeText(student.group || '');
        const optKey = Object.keys(clsRules.groupSubjects || {}).find(k => {
            const nk = normalizeText(k);
            return nk === normGroup || nk.includes(normGroup) || normGroup.includes(nk);
        }) || student.group;

        const generalSubs = (clsRules.generalSubjects || []).map(s => normalizeText(s));
        const groupSubs = (clsRules.groupSubjects?.[optKey] || []).map(s => normalizeText(s));
        const optSubs = (optSubsObj[optKey] || []).map(s => normalizeText(s));

        const visibleSubjects = displaySubjects.filter(subjObj => {
            const isObj = typeof subjObj === 'object';
            const subjName = isObj ? (subjObj.name || subjObj.paper) : subjObj;
            const normSubjName = normalizeText(subjName);
            const papers = isObj ? (subjObj.papers || []) : [subjName];

            const matchesList = (normList) => {
                if (normList.includes(normSubjName)) return true;
                if (isObj && subjObj.papers) {
                    return subjObj.papers.some(p => normList.includes(normalizeText(p)));
                }
                return normList.some(item => normSubjName === item || normSubjName.includes(item) || item.includes(normSubjName));
            };

            const isGeneral = matchesList(generalSubs);
            const isGroup = matchesList(groupSubs);
            const isOpt = matchesList(optSubs);

            const checkMarks = (name) => {
                const sSubjKey = normalizeText(name).replace(/\s+/g, '');
                const data = student.subjects[sSubjKey];

                const sRoll = String(student.id || '').trim().replace(/^0+/, '');
                const sGroupNorm = normalizeText(student.group || '');

                const cleanName = normalizeText(name).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
                const thisSubMap = (ms.subjectMapping || []).find(m => {
                    const mapSubNorm = normalizeText(m.subject).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
                    const mapGroupNorm = normalizeText(m.group);
                    return mapSubNorm === cleanName &&
                        (sGroupNorm.includes(mapGroupNorm) || mapGroupNorm.includes(sGroupNorm));
                });

                if (thisSubMap) {
                    return thisSubMap.rolls.map(r => String(r).replace(/^0+/, '')).includes(sRoll);
                }

                if (data) {
                    const hasVal = (v) => v !== undefined && v !== null && v !== '';
                    const hasActualMarks = (hasVal(data.written) || hasVal(data.mcq) || hasVal(data.practical) || hasVal(data.total));
                    const isExplicitlyAbsent = data.status === 'αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ' || String(data.status).toLowerCase() === 'absent';
                    return hasActualMarks || isExplicitlyAbsent;
                }

                return false;
            };

            if (isOpt && !isGeneral && !isGroup) {
                const hasData = checkMarks(subjName) || papers.some(p => checkMarks(p));
                if (!hasData && optSubs.length > 2) return false;
            }

            if (clsRules.alternativePairs && clsRules.alternativePairs.length > 0) {
                const matchedPairs = clsRules.alternativePairs.filter(p => {
                    const p1 = normalizeText(p.sub1);
                    const p2 = normalizeText(p.sub2);
                    if (p1 === normSubjName || p2 === normSubjName) return true;
                    if (papers.some(paper => normalizeText(paper) === p1 || normalizeText(paper) === p2)) return true;
                    return false;
                });

                if (matchedPairs.length > 0) {
                    let hasAnyPartnerMarks = false;
                    const hasCurrentMarks = checkMarks(subjName) || papers.some(p => checkMarks(p));

                    matchedPairs.forEach(altPair => {
                        const p1 = normalizeText(altPair.sub1);
                        const isP1Current = p1 === normSubjName || papers.some(paper => normalizeText(paper) === p1);
                        const partner = isP1Current ? altPair.sub2 : altPair.sub1;

                        if (checkMarks(partner)) {
                            hasAnyPartnerMarks = true;
                        }
                    });

                    if (hasAnyPartnerMarks && !hasCurrentMarks) return false;
                }
            }

            return isGeneral || isGroup || isOpt;

        });

        let absentVisibleSubjectsList = [];
        let eligibleVisibleSubjectsCount = 0;

        visibleSubjects.forEach(subjObj => {
            const isObj = typeof subjObj === 'object';
            const subjName = isObj ? (subjObj.name || subjObj.paper) : subjObj;

            const isEligible = isStudentEligibleForSubject(student, subjName, {
                subjectMappings: ms.subjectMapping || [],
                marksheetRules: clsRules,
                className: rptClass || 'HSC'
            });

            if (!isEligible) return; // Skip subjects the student is not mapped to take

            eligibleVisibleSubjectsCount++;
            let isAbs = false;

            if (isCombinedMode && isObj && subjObj.isCombined) {
                const combinedData = student.subjects[subjName] || {};
                let hasMarks = false;
                let hasExplicitAbs = (String(combinedData.status).toLowerCase() === 'absent' || combinedData.status === 'αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ');
                const papers = subjObj.papers || [];
                papers.forEach(p => {
                    const pd = student.subjects[normalizeText(p).replace(/\s+/g, '')] || {};
                    const w = parseFloat(pd.written) || 0;
                    const m = parseFloat(pd.mcq) || 0;
                    const pr = parseFloat(pd.practical) || 0;
                    const t = parseFloat(pd.total) || 0;
                    if (w > 0 || m > 0 || pr > 0 || t > 0) hasMarks = true;
                    if (String(pd.status).toLowerCase() === 'absent' || pd.status === 'αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ') hasExplicitAbs = true;
                });
                if (hasExplicitAbs || !hasMarks) isAbs = true;
            } else {
                const sSubjKey = normalizeText(subjName).replace(/\s+/g, '');
                const d = student.subjects[sSubjKey] || {};
                const hasExplicitAbs = (String(d.status).toLowerCase() === 'absent' || d.status === 'αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ');
                const hasMarks = (parseFloat(d.written) || 0) > 0 || (parseFloat(d.mcq) || 0) > 0 || (parseFloat(d.practical) || 0) > 0 || (parseFloat(d.total) || 0) > 0;
                if (hasExplicitAbs || !hasMarks) isAbs = true;
            }

            if (isAbs) absentVisibleSubjectsList.push(subjName);
        });

        if (eligibleVisibleSubjectsCount > 0) {
            if (absentVisibleSubjectsList.length === eligibleVisibleSubjectsCount) {
                fullyAbsentStudents.push({
                    id: student.id,
                    name: student.name,
                    group: group
                });
            } else if (absentVisibleSubjectsList.length > 0) {
                partiallyAbsentStudents.push({
                    id: student.id,
                    name: student.name,
                    group: group,
                    absentSubjects: absentVisibleSubjectsList
                });
            }
        }

        // --- Examinee Calculation (Matching exactly with marksheetManager logic for 100% sync) ---
        // A student is an "examinee" ONLY if they have ANY marks > 0 in ANY subject criteria
        const isExaminee = Object.values(student.subjects).some(data =>
            ((data.written || 0) > 0 || (data.mcq || 0) > 0 || (data.practical || 0) > 0 || (data.total || 0) > 0)
        );

        if (!isExaminee) return;

        gs.examinees++;

        // Calculate GPA like marksheet ranking (lines 872-960)
        let compulsoryGPA = 0;
        let compulsoryCount = 0;
        let optionalBonus = 0;
        let allPassed = true;
        let sTotalMarks = 0;
        let sFailedCount = 0;

        // visibleSubjects logic removed from here as it was hoisted

        // Iterate over the student's visibleSubjects 
        visibleSubjects.forEach(subjObj => {
            const isObj = typeof subjObj === 'object';
            const subjName = isObj ? (subjObj.name || subjObj.paper) : subjObj;
            const isOptional = isObj ? subjObj.isOptional : false;

            const isCompFail = (mark, passMark, defaultPass) => {
                if (!mark || mark === '-') return false;
                const m = parseFloat(mark) || 0;
                let p = (passMark !== undefined && passMark !== '' && passMark !== null) ? parseFloat(passMark) : defaultPass;
                if (isNaN(p)) p = 0;
                return (p > 0 && m < p);
            };

            if (isCombinedMode && isObj && subjObj.isCombined) {
                const papers = subjObj.papers || [];
                const combinedData = student.subjects[subjName] || {};

                let isSubjectFail = false;
                papers.forEach(p => {
                    const pSubjKey = normalizeText(p).replace(/\s+/g, '');
                    const pData = student.subjects[pSubjKey] || {};
                    let pConfig = state.subjectConfigs?.[p] || {};
                    if (state.isTutorialReportMode && pConfig.tutorial) pConfig = pConfig.tutorial;

                    if (isCompFail(pData.written, pConfig.writtenPass, FAILING_THRESHOLD.written) ||
                        isCompFail(pData.mcq, pConfig.mcqPass, FAILING_THRESHOLD.mcq) ||
                        isCompFail(pData.practical, pConfig.practicalPass, 0)) {
                        isSubjectFail = true;
                    }
                });

                let grade = combinedData.grade || 'F';
                let gp = (combinedData.gpa || 0);

                let combinedTotalMarks = 0;
                papers.forEach(p => {
                    const pKey = normalizeText(p).replace(/\s+/g, '');
                    const pD = student.subjects[pKey] || {};
                    combinedTotalMarks += parseFloat(pD.total) || 0;
                });
                sTotalMarks += combinedTotalMarks;

                if (isSubjectFail) {
                    grade = 'F';
                    gp = 0;
                }

                if (combinedData.status === 'αª½αºçαª▓' || combinedData.status === 'fail') {
                    if (ms.boardStandardOptional === true) {
                        if (!isOptional) allPassed = false;
                    } else {
                        allPassed = false;
                    }
                }

                if (isOptional) {
                    if (grade !== 'F' && gp > 2.00) {
                        optionalBonus = Math.max(optionalBonus, gp - 2.00);
                    }
                    if (ms.boardStandardOptional !== true && grade === 'F') {
                        allPassed = false;
                    }
                } else {
                    compulsoryGPA += gp;
                    compulsoryCount++;
                    if (grade === 'F') allPassed = false;
                }

            } else {
                const sSubjKey = normalizeText(subjName).replace(/\s+/g, '');
                const data = student.subjects[sSubjKey] || {};
                const total = data.total || 0;
                sTotalMarks += parseFloat(total) || 0;

                let config = state.subjectConfigs?.[subjName] ||
                    Object.entries(state.subjectConfigs || {}).find(([k]) =>
                        normalizeText(k).replace(/\s+/g, '') === sSubjKey
                    )?.[1] || { total: 100 };
                if (state.isTutorialReportMode && config.tutorial) {
                    config = config.tutorial;
                }
                const maxTotal = parseInt(config.total) || 100;
                
                // Use absolute marks for Main Exams (fixed board scale),
                // but use percentage scaling for Tutorial exams.
                const effectivePct = state.isTutorialReportMode ? (maxTotal > 0 ? (total / maxTotal) * 100 : 0) : total;

                let gp = getGradePoint(effectivePct);
                let grade = getLetterGrade(effectivePct);

                if (isCompFail(data.written, config.writtenPass, FAILING_THRESHOLD.written) ||
                    isCompFail(data.mcq, config.mcqPass, FAILING_THRESHOLD.mcq) ||
                    isCompFail(data.practical, config.practicalPass, 0)) {
                    grade = 'F';
                    gp = 0;
                }

                if (data.status === 'αª½αºçαª▓' || data.status === 'fail') {
                    if (ms.boardStandardOptional === true) {
                        if (!isOptional) allPassed = false;
                    } else {
                        allPassed = false;
                    }
                }

                if (isCombinedMode) {
                    if (isOptional) {
                        if (grade !== 'F' && gp > 2.00) {
                            optionalBonus = Math.max(optionalBonus, gp - 2.00);
                        }
                        if (ms.boardStandardOptional !== true && grade === 'F') {
                            if (allPassed) sFailedCount++;
                            allPassed = false;
                        } else if (grade === 'F') {
                            // Already failing locally, increment failed subject count but may not fail student if board standard optional
                            sFailedCount++;
                        }
                    } else {
                        compulsoryGPA += gp;
                        compulsoryCount++;
                        if (grade === 'F') {
                            sFailedCount++;
                            allPassed = false;
                        }
                    }
                } else {
                    if (isOptional) {
                        if (grade !== 'F' && gp > 2.00) {
                            optionalBonus = Math.max(optionalBonus, gp - 2.00);
                        }
                        if (ms.boardStandardOptional !== true && grade === 'F') {
                            if (allPassed) sFailedCount++;
                            allPassed = false;
                        } else if (grade === 'F') {
                            sFailedCount++;
                        }
                    } else {
                        compulsoryGPA += gp;
                        compulsoryCount++;
                        if (grade === 'F') {
                            sFailedCount++;
                            allPassed = false;
                        }
                    }
                }
            }
        });

        // Final GPA (marksheet lines 943-948)
        let finalGPA = 0;
        if (compulsoryCount > 0) {
            finalGPA = Math.min(5.00, (compulsoryGPA + optionalBonus) / compulsoryCount);
        }

        const grade = getOverallGradeFromGPA(finalGPA, allPassed);

        studentResultRecords.push({
            id: student.id,
            name: student.name,
            group: group,
            allPassed: allPassed,
            failedCount: sFailedCount,
            finalGPA: finalGPA,
            totalMarks: sTotalMarks,
            grade: grade
        });

        if (allPassed) {
            gs.pass++;
            overallGrades[grade]++;
        } else {
            gs.fail++;
            overallGrades['F']++;
        }
    });

    gT = masterStudents.length;
    for (const gs of groupStats.values()) {
        gE += gs.examinees;
        gP += gs.pass;
        gF += gs.fail;
    }
    const pRate = gE > 0 ? ((gP / gE) * 100).toFixed(1) : '0.0';

    const todayDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
    const globalSettings = await getSettings();
    const dev = globalSettings?.developerCredit || {};

    // Improved dynamic dev credit HTML
    const devNameHtml = (dev.enabled !== false && (dev.name || dev.text)) ?
        `<div class="ftr-dev-main" style="display: flex; align-items: center; gap: 4px; justify-content: center;">
            <img src="/edtechmataprologomain.png" style="width: 12px; height: 12px; object-fit: contain;">
            <span>${dev.text || 'Developed By:'} <strong>${dev.name || ''}</strong></span> 
            <span style="opacity: 0.6; font-size: 0.85em; margin-left: 4px;">| αªÅαªíαªƒαºçαªò αªàαªƒαºïαª«αª╛αªƒαª╛ αª¬αºìαª░αºï- v${APP_VERSION}</span>
        </div>` : '';
    const devFullHtml = devNameHtml;

    // Sort and calculate ranks
    studentResultRecords.sort((a, b) => {
        if (a.allPassed !== b.allPassed) return a.allPassed ? -1 : 1;
        if (Math.abs(a.finalGPA - b.finalGPA) > 0.001) return b.finalGPA - a.finalGPA;
        return b.totalMarks - a.totalMarks;
    });

    let currentClassRank = 1;
    studentResultRecords.forEach(r => r.classRank = currentClassRank++);

    const groupRankCounters = {};
    studentResultRecords.forEach(r => {
        const canonicalGrp = getCanonicalGroup(r.group);
        if (!groupRankCounters[canonicalGrp]) groupRankCounters[canonicalGrp] = 1;
        r.groupRank = groupRankCounters[canonicalGrp]++;
    });

    // 1. Generate Passed Students HTML
    const passedStudents = studentResultRecords.filter(r => r.allPassed);
    let passedHtml = `
        <div class="rpt-section">
            <div class="rpt-section-title">
                <i class="fas fa-user-graduate"></i>αª¬αª░αºÇαªòαºìαª╖αª╛αºƒ αª╕αªòαª▓ αª¼αª┐αª╖αºƒ αª¬αª╛αª╢ αª╢αª┐αªòαºìαª╖αª╛αª░αºìαªÑαºÇ
                <span style="margin-left: auto; font-size: 0.7rem; opacity: 0.9; font-weight: 600;">(αª«αºïαªƒ: ${convertToBengaliDigits(passedStudents.length)} αª£αª¿)</span>
            </div>
            <div style="overflow-x: auto;">
                <table class="rpt-subject-table rpt-passed-table">
                    <thead>
                        <tr>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αªòαºìαª░.αª¿αªé</span></th>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αª░αºïαª▓</span></th>
                            <th style="background: #065f46 !important; color: white !important; text-align: left !important; padding-left: 10px !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αª¿αª╛αª«</span></th>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αª¼αª┐αª¡αª╛αªù</span></th>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αª£αª┐αª¬αª┐αªÅ</span></th>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αªùαºìαª░αºçαªí</span></th>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αªòαºìαª▓αª╛αª╕ αª«αºçαªºαª╛αªòαºìαª░αª«αª┐αªé</span></th>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αªùαºìαª░αºüαª¬ αª«αºçαªºαª╛αªòαºìαª░αª«αª┐αªé</span></th>
                            <th style="background: #065f46 !important; color: white !important; font-weight: 900 !important; border: 1px solid #ffffff33 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact;"><span style="color: white !important;">αª╕αºìαªƒαºìαª»αª╛αªƒαª╛αª╕</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${passedStudents.map((st, i) => `
                            <tr>
                                <td>${convertToBengaliDigits(i + 1)}</td>
                                <td style="font-weight: 800; color: #0f172a;">${convertToBengaliDigits(st.id)}</td>
                                <td style="text-align: left !important; padding-left: 10px !important; font-weight: 600; color: #334155;">${st.name}</td>
                                <td style="color: #475569;">${getGroupBadge(st.group)}</td>
                                <td style="font-weight: 800; color: #0f172a;">${convertToBengaliDigits(st.finalGPA.toFixed(2))}</td>
                                <td style="font-weight: 900; color: #166534; background: #f0fdf4;">${st.grade}</td>
                                <td style="font-weight: 700; color: #4338ca;">${getBengaliOrdinal(st.classRank)}</td>
                                <td style="font-weight: 700; color: #0369a1;">${getBengaliOrdinal(st.groupRank)}</td>
                                <td style="color: #166534; font-weight: bold;">αª¬αª╛αª╢</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // 2. Generate Failed Students Table(s)
    const failedStudents = studentResultRecords.filter(r => !r.allPassed && r.failedCount > 0);
    const failedByCount = {};
    failedStudents.forEach(st => {
        if (!failedByCount[st.failedCount]) failedByCount[st.failedCount] = [];
        failedByCount[st.failedCount].push(st);
    });

    const failedCountsSorted = Object.keys(failedByCount).map(Number).sort((a, b) => a - b);

    let failedHtml = `
        <div class="rpt-section" style="margin-top: 40px;">
            <div class="rpt-section-title" style="color: #b91c1c; border-bottom: 2px solid #b91c1c;">
                <i class="fas fa-exclamation-circle"></i>αª¬αª░αºÇαªòαºìαª╖αª╛αºƒ αªàαªòαºâαªñαªòαª╛αª░αºìαª» αª╢αª┐αªòαºìαª╖αª╛αª░αºìαªÑαºÇαª░ αªñαª╛αª▓αª┐αªòαª╛
                <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 8px;">(αª½αºçαª▓ αªòαª░αª╛ αª¼αª┐αª╖αºƒαºçαª░ αª╕αªéαªûαºìαª»αª╛ αªàαª¿αºüαª»αª╛αºƒαºÇ)</span>
            </div>
    `;

    if (failedCountsSorted.length === 0) {
        failedHtml += `<div style="text-align: center; padding: 30px; background: #fef2f2; color: #991b1b; font-weight: bold; border: 1px dashed #f87171; border-radius: 8px;">αªòαºïαª¿αºï αª╢αª┐αªòαºìαª╖αª╛αª░αºìαªÑαºÇ αª½αºçαª▓ αªòαª░αºçαª¿αª┐</div>`;
    }

    failedCountsSorted.forEach(count => {
        const studentsInCount = failedByCount[count];

        // Sort students within this bucket by class rank (or ID/Roll as fallback)
        studentsInCount.sort((a, b) => a.classRank - b.classRank);

        failedHtml += `
            <div style="margin-top: 25px; page-break-inside: avoid;">
                <div style="background: #f1f5f9; color: #334155; padding: 10px 20px; font-weight: bold; font-size: 1.1rem; display: inline-block; border-radius: 6px 6px 0 0; border: 1px solid #cbd5e1; border-bottom: none;">
                    ${convertToBengaliDigits(count)} αª¼αª┐αª╖αºƒ αª½αºçαª▓ 
                    <span style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; font-size: 0.8rem; padding: 2px 8px; border-radius: 12px; margin-left: 10px;">${convertToBengaliDigits(studentsInCount.length)} αª£αª¿</span>
                </div>
                <div style="overflow-x: auto; border: 1px solid #cbd5e1; border-top: none; border-radius: 0 6px 6px 6px;">
                    <table class="rpt-subject-table" style="width: 100%; margin: 0; box-shadow: none;">
                        <thead>
                            <tr>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αªòαºìαª░.αª¿αªé</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αª░αºïαª▓</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; text-align: left !important; padding-left: 10px !important; border-bottom: 2px solid #cbd5e1 !important;">αª¿αª╛αª«</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αª¼αª┐αª¡αª╛αªù</th>
                                <th style="background: #f8fafc !important; color: #b91c1c !important; border-bottom: 2px solid #cbd5e1 !important;">αª╕αºìαªƒαºìαª»αª╛αªƒαª╛αª╕</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${studentsInCount.map((st, i) => `
                                <tr>
                                    <td style="color: #64748b;">${convertToBengaliDigits(i + 1)}</td>
                                    <td style="font-weight: bold; color: #0f172a;">${convertToBengaliDigits(st.id)}</td>
                                    <td style="text-align: left !important; padding-left: 10px !important; font-weight: 500;">${st.name}</td>
                                    <td style="color: #475569;">${getGroupBadge(st.group)}</td>
                                    <td style="color: #dc2626; font-weight: bold; background: #fef2f2;">αª½αºçαª▓</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    failedHtml += `</div>`;

    let partiallyAbsentHtml = ``;
    if (partiallyAbsentStudents.length > 0) {
        // Sort partially absent students by id/roll to ensure ordered
        partiallyAbsentStudents.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        partiallyAbsentHtml = `
            <div class="rpt-section" style="margin-top: 40px;">
                <div class="rpt-section-title" style="color: #0f172a; border-bottom: 2px solid #0f172a;">
                    <i class="fas fa-calendar-minus"></i>αª¬αª░αºÇαªòαºìαª╖αª╛αºƒ αªåαªéαª╢αª┐αªò αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ αª╢αª┐αªòαºìαª╖αª╛αª░αºìαªÑαºÇ
                </div>
                <div style="overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 6px;">
                    <table class="rpt-subject-table" style="width: 100%; margin: 0; box-shadow: none;">
                        <thead>
                            <tr>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αªòαºìαª░.αª¿αªé</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αª░αºïαª▓</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; text-align: left !important; padding-left: 10px !important; border-bottom: 2px solid #cbd5e1 !important;">αª¿αª╛αª«</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αª¼αª┐αª¡αª╛αªù</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; text-align: left !important; padding-left: 10px !important; border-bottom: 2px solid #cbd5e1 !important;">αª»αºç αª╕αªòαª▓ αª¼αª┐αª╖αºƒαºç αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ</th>
                                <th style="background: #f8fafc !important; color: #ea580c !important; border-bottom: 2px solid #cbd5e1 !important;">αª╕αºìαªƒαºìαª»αª╛αªƒαª╛αª╕</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${partiallyAbsentStudents.map((st, i) => `
                                <tr>
                                    <td style="color: #64748b;">${convertToBengaliDigits(i + 1)}</td>
                                    <td style="font-weight: bold; color: #0f172a;">${convertToBengaliDigits(st.id)}</td>
                                    <td style="text-align: left !important; padding-left: 10px !important; font-weight: 500;">${st.name}</td>
                                    <td style="color: #475569;">${getGroupBadge(st.group)}</td>
                                    <td style="text-align: left !important; padding-left: 10px !important; color: #475569; font-size: 0.9em; line-height: 1.4;">
                                        ${st.absentSubjects.map((sub, idx) => `${convertToBengaliDigits(idx + 1)}. ${sub}`).join('<br>')}
                                    </td>
                                    <td style="color: #ea580c; font-weight: bold; background: #fff7ed;">αªåαªéαª╢αª┐αªò αª¬αª░αºÇαªòαºìαª╖αª╛αª░αºìαªÑαºÇ</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    let fullyAbsentHtml = ``;
    if (fullyAbsentStudents.length > 0) {
        // Sort fully absent students by group then id
        fullyAbsentStudents.sort((a, b) => {
            if (a.group !== b.group) return a.group.localeCompare(b.group);
            return parseInt(a.id) - parseInt(b.id);
        });

        fullyAbsentHtml = `
            <div class="rpt-section" style="margin-top: 40px; page-break-inside: avoid;">
                <div class="rpt-section-title" style="color: #0f172a; border-bottom: 2px solid #0f172a;">
                    <i class="fas fa-calendar-times"></i>αª¬αª░αºÇαªòαºìαª╖αª╛αºƒ αª╕αªòαª▓ αª¼αª┐αª╖αºƒαºç αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ αª╢αª┐αªòαºìαª╖αª╛αª░αºìαªÑαºÇ
                </div>
                <div style="overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 6px;">
                    <table class="rpt-subject-table" style="width: 100%; margin: 0; box-shadow: none;">
                        <thead>
                            <tr>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αªòαºìαª░.αª¿αªé</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αª░αºïαª▓</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; text-align: left !important; padding-left: 10px !important; border-bottom: 2px solid #cbd5e1 !important;">αª¿αª╛αª«</th>
                                <th style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important;">αª¼αª┐αª¡αª╛αªù</th>
                                <th style="background: #f8fafc !important; color: #b91c1c !important; border-bottom: 2px solid #cbd5e1 !important;">αª╕αºìαªƒαºìαª»αª╛αªƒαª╛αª╕</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fullyAbsentStudents.map((st, i) => `
                                <tr>
                                    <td style="color: #64748b;">${convertToBengaliDigits(i + 1)}</td>
                                    <td style="font-weight: bold; color: #0f172a;">${convertToBengaliDigits(st.id)}</td>
                                    <td style="text-align: left !important; padding-left: 10px !important; font-weight: 500;">${st.name}</td>
                                    <td style="color: #475569;">${getGroupBadge(st.group)}</td>
                                    <td style="color: #dc2626; font-weight: bold; background: #fef2f2;">αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    const reportHtml = `
    <style>
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .rpt-passed-table thead th,
            .rpt-passed-table thead th span,
            .rpt-passed-table thead th * {
                background-color: #065f46 !important;
                color: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                -webkit-text-fill-color: #ffffff !important;
            }
            .rpt-section-title {
                color: inherit !important;
            }
        }
    </style>
    <div class="rpt-page" id="rpt_page_main">
        <div class="rpt-inner">
            <div class="rpt-header">
                ${ms.watermarkUrl ? `<img src="${ms.watermarkUrl}" class="rpt-logo" alt="Logo">` :
            `<div class="rpt-logo-placeholder"><i class="fas fa-graduation-cap"></i></div>`}
                <div class="rpt-header-text">
                    <h1 class="rpt-inst-name">${ms.institutionName || 'αª╢αª┐αªòαºìαª╖αª╛ αª¬αºìαª░αªñαª┐αª╖αºìαªáαª╛αª¿αºçαª░ αª¿αª╛αª«'}</h1>
                    ${ms.institutionAddress ? `<p class="rpt-inst-addr">${ms.institutionAddress}</p>` : ''}
                </div>
            </div>

            <div class="rpt-title-pill">
                <div class="rpt-pill-left">αª¬αª░αºÇαªòαºìαª╖αª╛αª░ αª╕αª╛αª«αª╛αª░αª┐ αª░αª┐αª¬αºïαª░αºìαªƒ</div>
                <div class="rpt-pill-right">${examName} ΓÇö ${rptSession}</div>
            </div>

            <div class="rpt-meta-row" style="margin-top: 20px; margin-bottom: 25px;">
                <div class="rpt-meta-item">
                    <i class="fas fa-graduation-cap"></i> 
                    <span>αª╢αºìαª░αºçαªúαª┐: <strong>${rptClass}</strong></span>
                </div>
                <div class="rpt-meta-item">
                    <i class="fas fa-calendar-check"></i> 
                    <span>αª╕αºçαª╢αª¿: <strong>${rptSession}</strong></span>
                </div>
                <div class="rpt-meta-item">
                    <i class="fas fa-list-ul"></i> 
                    <span>αª«αºïαªƒ αª¼αª┐αª╖αºƒ: <strong>${convertToBengaliDigits(subjects.length)}</strong></span>
                </div>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-chart-bar"></i> αª╕αª╛αª«αªùαºìαª░αª┐αªò αª½αª▓αª╛αª½αª▓ αª¬αª░αª┐αª╕αªéαªûαºìαª»αª╛αª¿
                    <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 8px;">(αª╕αªòαª▓ αª¼αª┐αª╖αºƒαºçαª░ αª¬αª╛αª╢ αª«αª╛αª░αºìαªò αª¼αª┐αª¼αºçαªÜαª¿αª╛αºƒ)</span>
                </div>
                <div class="rpt-stats-grid">
                    <div class="rpt-stat-card rpt-stat-total">
                        <div class="rpt-stat-icon"><i class="fas fa-users"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gT)}</span>
                            <span class="rpt-stat-label">αª«αºïαªƒ αª╢αª┐αªòαºìαª╖αª╛αª░αºìαªÑαºÇ</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-examinees">
                        <div class="rpt-stat-icon"><i class="fas fa-user-check"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gE)}</span>
                            <span class="rpt-stat-label">αª¬αª░αºÇαªòαºìαª╖αª╛αª»αª╝ αªàαªéαª╢αªùαºìαª░αª╣αªú</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-absent">
                        <div class="rpt-stat-icon" style="background: #fdf4ff !important; color: #a21caf !important;"><i class="fas fa-user-minus"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value" style="color: #a21caf !important;">${convertToBengaliDigits(gT - gE)}</span>
                            <span class="rpt-stat-label">αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-pass">
                        <div class="rpt-stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gP)} αª£αª¿</span>
                            <span class="rpt-stat-label">αª╕αªòαª▓ αª¼αª┐αª╖αª»αª╝αºç αª¬αª╛αª╢</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-fail">
                        <div class="rpt-stat-icon"><i class="fas fa-times-circle"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gF)} αª£αª¿</span>
                            <span class="rpt-stat-label">αª½αºçαª▓</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-rate">
                        <div class="rpt-stat-icon"><i class="fas fa-percentage"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(pRate)}%</span>
                            <span class="rpt-stat-label">αª¬αª╛αª╢αºçαª░ αª╣αª╛αª░</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-layer-group"></i> αª¼αª┐αª¡αª╛αªùαª¡αª┐αªñαºìαªñαª┐αªò αª½αª▓αª╛αª½αª▓ αª¼αª┐αª╢αºìαª▓αºçαª╖αªú
                    <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 8px;">(αª╕αªòαª▓ αª¼αª┐αª╖αºƒαºçαª░ αª¬αª╛αª╢ αª«αª╛αª░αºìαªò αª¼αª┐αª¼αºçαªÜαª¿αª╛αºƒ)</span>
                </div>
                <table class="rpt-summary-table">
                    <thead>
                        <tr>
                            <th>αª¼αª┐αª¡αª╛αªù</th><th>αª«αºïαªƒ</th><th>αªàαªéαª╢αªùαºìαª░αª╣αªú</th><th>αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ</th><th>αª¬αª╛αª╢</th><th>αª½αºçαª▓</th><th>αª¬αª╛αª╢αºçαª░ αª╣αª╛αª░</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...groupStats.entries()].map(([g, s]) => {
                const abs = s.total - s.examinees;
                const pr = s.examinees > 0 ? ((s.pass / s.examinees) * 100).toFixed(1) : '0.0';
                return `<tr>
                                <td class="rpt-group-name">${g}</td>
                                <td>${convertToBengaliDigits(s.total)}</td>
                                <td>${convertToBengaliDigits(s.examinees)}</td>
                                <td>${convertToBengaliDigits(abs)}</td>
                                <td class="rpt-td-pass">${convertToBengaliDigits(s.pass)}</td>
                                <td class="rpt-td-fail">${convertToBengaliDigits(s.fail)}</td>
                                <td class="rpt-td-rate">${convertToBengaliDigits(pr)}%</td>
                            </tr>`;
            }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>αª╕αª░αºìαª¼αª«αºïαªƒ</td>
                            <td>${convertToBengaliDigits(gT)}</td>
                            <td>${convertToBengaliDigits(gE)}</td>
                            <td>${convertToBengaliDigits(gT - gE)}</td>
                            <td class="rpt-td-pass">${convertToBengaliDigits(gP)}</td>
                            <td class="rpt-td-fail">${convertToBengaliDigits(gF)}</td>
                            <td class="rpt-td-rate">${convertToBengaliDigits(pRate)}%</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-medal"></i> αªùαºìαª░αºçαªíαª┐αªé αª¬αª░αª┐αª╕αªéαªûαºìαª»αª╛αª¿
                    <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 8px;">(αª╕αªòαª▓ αª¼αª┐αª╖αºƒαºçαª░ αª¬αª╛αª╢ αª«αª╛αª░αºìαªò αª¼αª┐αª¼αºçαªÜαª¿αª╛αºƒ)</span>
                </div>
                <div class="rpt-grade-grid">
                    ${['A+', 'A', 'A-', 'B', 'C', 'D', 'F'].map(grade => {
                const count = overallGrades[grade] || 0;
                const gClass = grade === 'A+' ? 'aplus' : grade === 'A-' ? 'aminus' : grade.toLowerCase();
                return `
                        <div class="rpt-grade-item rpt-g-${gClass}">
                            <div class="rpt-grade-letter">${grade}</div>
                            <div class="rpt-grade-count">${convertToBengaliDigits(count)}</div>
                            <div class="rpt-grade-label">αª£αª¿</div>
                        </div>`;
            }).join('')}
                </div>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-book-open"></i>αª¬αª░αºÇαªòαºìαª╖αª╛αª░ αª¼αª┐αª╖αºƒαª¡αª┐αªñαºìαªñαª┐αªò αª¼αª┐αª╕αºìαªñαª╛αª░αª┐αªñ αª½αª▓αª╛αª½αª▓ 
                    <span style="margin-left: auto; font-size: 0.7rem; opacity: 0.9; font-weight: 600;">(αª«αºïαªƒ αª╢αª┐αªòαºìαª╖αª╛αª░αºìαªÑαºÇ: ${convertToBengaliDigits(masterStudents.length)} αª£αª¿)</span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="rpt-subject-table">
                        <thead>
                            <tr>
                                <th rowspan="2" style="text-align: left !important; padding-left: 20px !important; background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 800 !important;">αª¼αª┐αª╖αª»αª╝αºçαª░ αª¿αª╛αª«</th>
                                <th rowspan="2" style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 800 !important;">αª«αºïαªƒ</th>
                                <th rowspan="2" style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 800 !important;">αªàαª¿αºüαª¬αª╕αºìαªÑαª┐αªñ</th>
                                <th rowspan="2" style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 800 !important;">αª¬αª░αºÇαªòαºìαª╖αª╛αª░αºìαªÑαºÇ</th>
                                <th rowspan="2" style="background: #dcfce7 !important; color: #166534 !important; border-bottom: 2px solid #bbf7d0 !important; font-weight: 800 !important;">αª¬αª╛αª╢</th>
                                <th rowspan="2" style="background: #fee2e2 !important; color: #991b1b !important; border-bottom: 2px solid #fecaca !important; font-weight: 800 !important;">αª½αºçαª▓(F)</th>
                                <th colspan="3" style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 800 !important;">Achievement</th>
                                <th rowspan="2" style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 800 !important;">αª¬αª╛αª╢αºçαª░ αª╣αª╛αª░</th>
                                <th rowspan="2" style="background: #f8fafc !important; color: #1e293b !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 800 !important;">αª╕αª░αºìαª¼αºïαªÜαºìαªÜ αª«αª╛αª░αºìαªòαºìαª╕</th>
                            </tr>
                            <tr>
                                <th style="background: #f8fafc !important; color: #166534 !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 700 !important;">αªëαªñαºìαªñαª«(A+,A)</th>
                                <th style="background: #f8fafc !important; color: #1e40af !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 700 !important;">αª«αª╛αª¥αª╛αª░αª┐(A-,B)</th>
                                <th style="background: #f8fafc !important; color: #ea580c !important; border-bottom: 2px solid #cbd5e1 !important; font-weight: 700 !important;">αªªαºüαª░αºìαª¼αª▓(C,D)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
            const getSubjectRowData = (subj) => {
                const examForSubj = relevantExams.find(e => e.subject === subj || e.subjectName === subj);
                if (!examForSubj || !examForSubj.studentData) return null;

                const sSubjKey = normalizeText(subj).replace(/\s+/g, '');
                let cfg = state.subjectConfigs?.[subj] || 
                    Object.entries(state.subjectConfigs || {}).find(([k]) => 
                        normalizeText(k).replace(/\s+/g, '') === sSubjKey
                    )?.[1] || null;
                if (state.isTutorialReportMode && cfg && cfg.tutorial) {
                    cfg = cfg.tutorial;
                }

                if (!cfg) {
                    cfg = specificConfigs.find(c => normalizeText(c.subjectName) === normalizeText(subj)) || null;
                }
                const opts = {
                    writtenPass: (cfg && cfg.writtenPass !== undefined && cfg.writtenPass !== '') ? Number(cfg.writtenPass) : FAILING_THRESHOLD.written,
                    mcqPass: (cfg && cfg.mcqPass !== undefined && cfg.mcqPass !== '') ? Number(cfg.mcqPass) : FAILING_THRESHOLD.mcq,
                    practicalPass: (cfg && cfg.practicalPass !== undefined && cfg.practicalPass !== '') ? Number(cfg.practicalPass) : 0,
                    totalPass: (cfg && cfg.total !== undefined && cfg.total !== '') ? Number(cfg.total) * 0.33 : 33
                };

                let targetData = examForSubj.studentData || [];
                const msSettingsForSubj = getMarksheetSettings() || {};
                const subjMappingsForSubj = msSettingsForSubj.subjectMapping || [];

                if (targetData.length > 0) {
                    targetData = targetData.filter(s => {
                        if (studentLookupMap) {
                            const studentKey = generateStudentDocId({
                                id: s.id,
                                group: s.group || '',
                                class: rptClass,
                                session: rptSession
                            });
                            const lookupEntry = studentLookupMap.get(studentKey);
                            if (lookupEntry && (lookupEntry.status === false || lookupEntry.status === 'false')) return false;
                        }

                        return isStudentEligibleForSubject(s, subj, {
                            subjectMappings: subjMappingsForSubj,
                            marksheetRules: rules,
                            className: rptClass || 'HSC'
                        });
                    });
                }

                const stats = calculateStatistics(targetData, opts);
                const gd = stats.gradeDistribution || {};

                const excellent = (gd['A+'] || 0) + (gd['A'] || 0);
                const mid = (gd['A-'] || 0) + (gd['B'] || 0);
                const weak = (gd['C'] || 0) + (gd['D'] || 0);
                const failCount = gd['F'] || 0;

                let highest = 0;
                targetData.forEach(s => {
                    const total = Number(s.total) || (Number(s.written || 0) + Number(s.mcq || 0) + Number(s.practical || 0));
                    if (total > highest) highest = total;
                });

                const passRateStr = stats.participants > 0 ? ((stats.passedStudents / stats.participants) * 100).toFixed(1) : '0.0';
                const passRate = parseFloat(passRateStr);

                let rateColor = '#475569';
                let rateBg = 'transparent';

                if (passRate >= 80) {
                    rateColor = '#166534'; // Green
                    rateBg = '#f0fdf4';
                } else if (passRate >= 40) {
                    rateColor = '#ea580c'; // Orange
                    rateBg = '#fff7ed';
                } else {
                    rateColor = '#dc2626'; // Red
                    rateBg = '#fef2f2';
                }

                const html = `<tr>
                        <td style="text-align: left !important; padding-left: 20px !important; font-weight: 500; color: #334155;">${subj}</td>
                        <td style="color: #475569; font-weight: 700; background: #f8fafc;">${convertToBengaliDigits(stats.totalStudents)}</td>
                        <td style="color: #7c3aed; font-weight: 800; background: #faf5ff;">${convertToBengaliDigits(stats.absentStudents)}</td>
                        <td style="color: #0f172a; font-weight: 800;">${convertToBengaliDigits(stats.participants)}</td>
                        <td style="color: #166534; font-weight: 700; background: #f0fdf4;">${convertToBengaliDigits(stats.passedStudents)}</td>
                        <td style="color: #dc2626; font-weight: 700; background: #fef2f2;">${convertToBengaliDigits(failCount)}</td>
                        <td><span style="font-weight: 700;">${convertToBengaliDigits(excellent)}</span></td>
                        <td><span style="font-weight: 700;">${convertToBengaliDigits(mid)}</span></td>
                        <td><span style="font-weight: 700;">${convertToBengaliDigits(weak)}</span></td>
                        <td style="font-weight: 800; color: ${rateColor}; background: ${rateBg};">${convertToBengaliDigits(passRateStr)}%</td>
                        <td style="color: #4f46e5; font-weight: 700;">${convertToBengaliDigits(highest)}</td>
                    </tr>`;

                return {
                    subj,
                    html,
                    passRate
                };
            };

            const allRowsData = subjects.map(getSubjectRowData).filter(row => row !== null);
            allRowsData.sort((a, b) => b.passRate - a.passRate);

            return allRowsData.map(row => row.html).join('');
        })()}
                        </tbody>
                    </table>
                </div>
            </div>
            ${passedHtml}
            ${failedHtml}
            ${partiallyAbsentHtml}
            ${fullyAbsentHtml}

            <div class="rpt-footer">
                ${devFullHtml}
                <div class="ftr-contact-sub">αª¬αºìαª░αª┐αª¿αºìαªƒαºçαª░ αªñαª╛αª░αª┐αªû: ${todayDate}</div>
            </div>
        </div>
    </div>`;
    document.getElementById('reportPreview').innerHTML = reportHtml;
    document.getElementById('rptPreviewHeader').style.display = 'flex';
    document.getElementById('rptPrintBtn').style.display = 'inline-flex';
    showNotification('αª░αª┐αª¬αºïαª░αºìαªƒ αª╕αª½αª▓αª¡αª╛αª¼αºç αªñαºêαª░αª┐ αª╣αºƒαºçαª¢αºç Γ£à');
}

export function openReportSettings() {
    const modal = document.getElementById('reportSettingsModal');
    if (!modal) {
        console.error('Report settings modal not found in HTML');
        return;
    }

    const list = document.getElementById('reportSubjectVisibilityList');
    if (list) {
        const ms = getMarksheetSettings();
        // Use normalized set for comparison
        const hiddenSet = new Set((ms.reportHiddenSubjects || []).map(s => normalizeText(s)));

        const reportConsiderOptional = document.getElementById('reportConsiderOptional');
        if (reportConsiderOptional) {
            reportConsiderOptional.checked = ms.reportConsiderOptional === true;
        }

        if (!lastGeneratedSubjects || lastGeneratedSubjects.length === 0) {
            list.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #64748b;">
                    <i class="fas fa-info-circle" style="font-size: 1.5rem; margin-bottom: 10px; display: block;"></i>
                    <p>αª¬αºìαª░αªÑαª«αºç αªÅαªòαªƒαª┐ αª░αª┐αª¬αºïαª░αºìαªƒ αªñαºêαª░αª┐ αªòαª░αºüαª¿ αª»αª╛αªñαºç αª¼αª┐αª╖αºƒαºçαª░ αªñαª╛αª▓αª┐αªòαª╛ αª¬αª╛αªôαºƒαª╛ αª»αª╛αºƒαÑñ</p>
                </div>`;
        } else {
            list.innerHTML = lastGeneratedSubjects.map(subj => {
                const isHidden = hiddenSet.has(normalizeText(subj));
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color, #f1f5f9); background: var(--card-bg, transparent);">
                        <span style="font-weight: 600; color: var(--text-color, #1e293b);">${subj}</span>
                        <label class="toggle-switch">
                            <input type="checkbox" class="report-subject-toggle" value="${subj}" ${!isHidden ? 'checked' : ''}>
                            <span class="toggle-slider round"></span>
                        </label>
                    </div>`;
            }).join('');
        }
    }

    modal.classList.add('active');
}

export function closeReportSettings() {
    const modal = document.getElementById('reportSettingsModal');
    if (modal) modal.classList.remove('active');
}

export async function saveReportSettings() {
    const toggles = document.querySelectorAll('.report-subject-toggle');
    const hiddenSubjects = [];
    toggles.forEach(t => {
        if (!t.checked) hiddenSubjects.push(t.value);
    });

    const considerOptional = document.getElementById('reportConsiderOptional')?.checked || false;

    const { saveMarksheetSettings } = await import('./marksheetManager.js');
    await saveMarksheetSettings({
        reportHiddenSubjects: hiddenSubjects,
        reportConsiderOptional: considerOptional
    });

    showNotification('αª░αª┐αª¬αºïαª░αºìαªƒ αª╕αºçαªƒαª┐αªéαª╕ αª╕αªéαª░αªòαºìαª╖αª┐αªñ αª╣αºƒαºçαª¢αºç Γ£à');
    closeReportSettings();

    // Auto-refresh report if we have subjects
    if (lastGeneratedSubjects && lastGeneratedSubjects.length > 0) {
        generateReport();
    }
}

export function initReportManager() {
    const genBtn = document.getElementById('rptGenerateBtn');
    if (genBtn) genBtn.onclick = generateReport;

    const setBtn = document.getElementById('reportSettingsBtn');
    if (setBtn) {
        setBtn.onclick = openReportSettings;
        setBtn.style.display = 'block'; // Ensure it's visible
    }

    const rstBtn = document.getElementById('rptResetBtn');
    if (rstBtn) {
        rstBtn.onclick = () => {
            ['rptClass', 'rptSession', 'rptExamName'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const prev = document.getElementById('reportPreview');
            if (prev) prev.innerHTML = '';
            const head = document.getElementById('rptPreviewHeader');
            if (head) head.style.display = 'none';
        };
    }

    const saveSetBtn = document.getElementById('saveReportSettingsBtn');
    if (saveSetBtn) saveSetBtn.onclick = saveReportSettings;

    const closeSetBtn = document.getElementById('closeReportSettingsBtn');
    if (closeSetBtn) closeSetBtn.onclick = closeReportSettings;

    const prntBtn = document.getElementById('rptPrintBtn');
    if (prntBtn) {
        prntBtn.onclick = () => {
            document.body.classList.add('printing-report');
            window.print();
            document.body.classList.remove('printing-report');
        };
    }

    // Load dropdowns on init
    populateReportDropdowns();
}

window.initReportManager = initReportManager;
window.generateReport = generateReport;
window.openReportSettings = openReportSettings;
window.closeReportSettings = closeReportSettings;
window.saveReportSettings = saveReportSettings;
