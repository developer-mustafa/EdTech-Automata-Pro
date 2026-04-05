/**
 * Notice Manager Module
 * Handles notice board, news bulletin, and sidebar headline history.
 */

import { saveNotice, getNotices, deleteNotice, subscribeToNotices } from '../firestoreService.js';
import { formatDateBengali, showNotification } from '../utils.js';
import { navigateTo } from './pageRouter.js';

let state = {
    notices: [],
    currentPage: 1,
    perPage: 2,
    sidebarPage: 1,
    sidebarPerPage: 5,
    searchTerm: '',
    dateFilter: '',
    bulletinEnabled: localStorage.getItem('bulletinEnabled') !== 'false',
    userRole: null,
    isAdmin: false,
    currentNoticeId: null, // Track currently viewed notice for comments
    isAuthenticating: false
};

let elements = {};

const bng = (num) => num?.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]) || '০';

/**
 * Initialize Notice Manager
 */
export async function initNoticeManager() {
    initDOMElements();
    setupEventListeners();
    
    // Initial data fetch
    state.notices = await getNotices();
    renderNotices();
    renderSidebarHistory();
    updateBulletinVisibility();
    
    // Subscribe to real-time updates
    subscribeToNotices((notices) => {
        state.notices = notices;
        renderNotices();
        renderSidebarHistory();
        renderBulletin();
    });
}

/**
 * Initialize DOM Elements
 */
function initDOMElements() {
    elements = {
        noticeContainer: document.getElementById('noticeContainer'),
        noticePagination: document.getElementById('noticePagination'),
        noticeSearchInput: document.getElementById('noticeSearchInput'),
        noticeSearchClear: document.getElementById('noticeSearchClear'),
        noticeDateFilter: document.getElementById('noticeDateFilter'),
        noticeDateClear: document.getElementById('noticeDateClear'),
        bulletinToggle: document.getElementById('bulletinToggle'),
        addNoticeBtn: document.getElementById('addNoticeBtn'),
        noticeModal: document.getElementById('noticeModal'),
        noticeForm: document.getElementById('noticeForm'),
        closeNoticeModalBtn: document.getElementById('closeNoticeModalBtn'),
        noticeDetailModal: document.getElementById('noticeDetailModal'),
        closeDetailModalBtn: document.getElementById('closeDetailModalBtn'),
        sidebarNoticeList: document.getElementById('sidebarNoticeList'),
        sidebarPagination: document.getElementById('sidebarPagination'),
        sidebarTotalCount: document.getElementById('sidebarTotalCount'),
        noticeScroller: document.getElementById('noticeScroller'),
        noticeBulletinWrapper: document.getElementById('noticeBulletinWrapper'),
        printNoticeBtn: document.getElementById('printNoticeBtn'),
        noticeCommentForm: document.getElementById('noticeCommentForm'),
        commentInput: document.getElementById('commentInput')
    };
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
    // Search
    elements.noticeSearchInput?.addEventListener('input', (e) => {
        state.searchTerm = e.target.value;
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeSearchClear) {
            elements.noticeSearchClear.style.display = e.target.value ? 'flex' : 'none';
        }
    });

    // Date Filter
    elements.noticeDateFilter?.addEventListener('change', (e) => {
        state.dateFilter = e.target.value;
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeDateClear) {
            elements.noticeDateClear.style.display = e.target.value ? 'flex' : 'none';
        }
    });

    // Clear buttons
    elements.noticeSearchClear?.addEventListener('click', () => {
        if (elements.noticeSearchInput) elements.noticeSearchInput.value = '';
        state.searchTerm = '';
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeSearchClear) elements.noticeSearchClear.style.display = 'none';
    });

    elements.noticeDateClear?.addEventListener('click', () => {
        if (elements.noticeDateFilter) elements.noticeDateFilter.value = '';
        state.dateFilter = '';
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeDateClear) elements.noticeDateClear.style.display = 'none';
    });

    // Bulletin Toggle
    elements.bulletinToggle?.addEventListener('change', (e) => {
        state.bulletinEnabled = e.target.checked;
        localStorage.setItem('bulletinEnabled', state.bulletinEnabled);
        updateBulletinVisibility();
    });

    // Bulletin Navigation
    if (elements.noticeBulletinWrapper) {
        elements.noticeBulletinWrapper.addEventListener('click', () => {
            navigateTo('notices');
        });
    }

    // Modal Control
    elements.addNoticeBtn?.addEventListener('click', () => {
        resetForm();
        if (elements.noticeModal) elements.noticeModal.classList.add('active');
    });

    const closeModals = () => {
       document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    };

    elements.closeNoticeModalBtn?.addEventListener('click', closeModals);
    elements.closeDetailModalBtn?.addEventListener('click', closeModals);

    // Comment Submission
    elements.noticeCommentForm?.addEventListener('submit', handleCommentSubmit);

    // Click background to close
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) closeModals();
    });

    // Share logic
    document.querySelector('.notice-share-btn')?.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            showNotification('নোটিশ লিঙ্ক কপি করা হয়েছে!');
        });
    });

    // Form Submission
    elements.noticeForm?.addEventListener('submit', handleNoticeSubmit);

    // Main Grid dynamic delegates
    elements.noticeContainer?.addEventListener('click', (e) => {
        const docId = e.target.closest('[data-id]')?.dataset.id;
        if (!docId) return;

        if (e.target.closest('.notice-read-more') || e.target.closest('.notice-title')) {
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) showNoticeDetails(notice);
        }

        if (e.target.closest('.notice-delete-btn')) handleNoticeDelete(docId);
        if (e.target.closest('.notice-edit-btn')) {
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) editNotice(notice);
        }
    });

    // Sidebar dynamic delegates
    elements.sidebarNoticeList?.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-notice-item');
        if (item) {
            const docId = item.dataset.id;
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) showNoticeDetails(notice);
        }
    });

    // Marquee dynamic delegates
    elements.noticeScroller?.addEventListener('click', (e) => {
        const item = e.target.closest('.notice-marquee-item');
        if (item) {
            const docId = item.dataset.id;
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) showNoticeDetails(notice);
        }
    });

    // Print
    elements.printNoticeBtn?.addEventListener('click', () => {
        window.print();
    });
}

/**
 * Handle form submission
 */
async function handleNoticeSubmit(e) {
    e.preventDefault();
    
    const formData = {
        docId: document.getElementById('noticeForm').dataset.editingId || null,
        title: document.getElementById('noticeTitle').value,
        content: document.getElementById('noticeContent').value,
        author: document.getElementById('noticeAuthor').value,
        important: document.getElementById('noticeImportant').checked,
        views: 0,
        comments: []
    };

    const success = await saveNotice(formData);
    if (success) {
        showNotification(formData.docId ? 'নোটিশ আপডেট করা হয়েছে' : 'নতুন নোটিশ পোস্ট করা হয়েছে', 'success');
        elements.noticeModal?.classList.remove('active');
        resetForm();
    } else {
        showNotification('নোটিশটি সেভ করা যায়নি', 'error');
    }
}

/**
 * Render main notice cards
 */
function renderNotices() {
    if (!elements.noticeContainer) return;

    const filtered = state.notices.filter(n => {
        const matchesSearch = n.title.toLowerCase().includes(state.searchTerm.toLowerCase()) || 
                            n.content.toLowerCase().includes(state.searchTerm.toLowerCase());
        const matchesDate = !state.dateFilter || n.createdAt?.toDate?.().toISOString().split('T')[0] === state.dateFilter;
        return matchesSearch && matchesDate;
    });

    if (filtered.length === 0) {
        elements.noticeContainer.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-white/50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <i class="fas fa-search text-3xl mb-3 opacity-20"></i>
                <p class="text-sm font-medium">কোনো নোটিশ পাওয়া যায়নি</p>
            </div>
        `;
        if (elements.noticePagination) elements.noticePagination.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filtered.length / 2);
    const start = (state.currentPage - 1) * 2;
    const paginated = filtered.slice(start, start + 2);

    elements.noticeContainer.innerHTML = paginated.map((notice, idx) => {
        const date = notice.createdAt?.toDate ? notice.createdAt.toDate() : new Date();
        const formattedDate = formatDateBengali(date);
        const noticeNoBng = bng(filtered.length - (start + idx));

        return `
            <div class="group h-full bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col relative" data-id="${notice.docId}" style="animation: noticeCardIn 0.4s ease ${idx * 0.05}s backwards">
                <div class="h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-60"></div>
                <div class="p-5 flex flex-col flex-1 gap-3">
                    <div class="flex items-center justify-between gap-3">
                        <span class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-lg text-[14px] font-black border border-indigo-100 dark:border-indigo-500/20 shrink-0 tracking-tighter shadow-sm">
                             <i class="fas fa-hashtag text-[12px] opacity-70"></i> নোটিশ নং: ${noticeNoBng}
                        </span>
                        
                        ${state.isAdmin ? `
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                            <button class="notice-edit-btn w-7 h-7 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-indigo-600 transition-colors flex items-center justify-center p-0 border-0" data-id="${notice.docId}"><i class="fas fa-edit text-xs"></i></button>
                            <button class="notice-delete-btn w-7 h-7 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-red-600 transition-colors flex items-center justify-center p-0 border-0" data-id="${notice.docId}"><i class="fas fa-trash-alt text-xs"></i></button>
                        </div>
                        ` : ''}
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 text-slate-500 dark:text-indigo-400/80 text-[14px] mb-2 font-black uppercase tracking-tight">
                            <i class="far fa-calendar-alt text-indigo-500/60 text-[13px]"></i> ${formattedDate}
                        </div>
                        <h3 class="text-[22px] font-black text-slate-800 dark:text-slate-100 mb-2.5 leading-tight line-clamp-1 group-hover:text-indigo-600 transition-colors cursor-pointer notice-title">${notice.title}</h3>
                        <p class="text-[16px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3 break-words mb-4">${notice.content}</p>
                    </div>

                    <div class="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-700/50 mt-auto">
                        <div class="flex items-center gap-5 shrink-0">
                            <div class="flex items-center gap-2 text-[13px] font-black text-slate-500 dark:text-slate-400">
                                <i class="far fa-eye text-indigo-500/80 text-[13px]"></i> <span>${bng(notice.views || 0)}</span>
                            </div>
                            <div class="flex items-center gap-2 text-[13px] font-black text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700/50 pl-4">
                                <i class="far fa-comment-dots text-indigo-500/80 text-[13px]"></i> <span>${bng(notice.comments?.length || 0)}</span>
                            </div>
                        </div>
                        <button class="notice-read-more px-5 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[14px] font-black rounded-lg hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-0.5 shadow-md active:scale-95 border-0 cursor-pointer flex items-center gap-2 group/btn" data-id="${notice.docId}">
                             বিস্তারিত <i class="fas fa-arrow-right text-[12px] group-hover/btn:translate-x-1 transition-transform"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderGenericPagination(elements.noticePagination, totalPages, state.currentPage, (p) => {
        state.currentPage = p;
        renderNotices();
    });
}

/**
 * Render Sidebar Headline List
 */
function renderSidebarHistory() {
    if (!elements.sidebarNoticeList) return;

    const recentNotices = state.notices.slice(0, 15);
    const now = new Date();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

    if (recentNotices.length === 0) {
        elements.sidebarNoticeList.innerHTML = '<li class="py-5 text-center text-sm text-gray-400 dark:text-gray-500 italic">কোনো নোটিশ নেই</li>';
        return;
    }

    // Sidebar total count in Bengali
    if (elements.sidebarTotalCount) {
        const bngDigits = (num) => num.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
        elements.sidebarTotalCount.textContent = `${bngDigits(recentNotices.length)}টি`;
    }

    // Seamless loop items: render 15 + first 5 again
    const loopItems = [...recentNotices, ...recentNotices.slice(0, 5)];

    elements.sidebarNoticeList.innerHTML = `
        <div class="bulletin-scroll-container">
            ${loopItems.map((n, i) => {
                const dateObj = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
                const shortDate = formatDateBengali(dateObj);
                const isNew = (now - dateObj) < twoDaysInMs;
                const noticeNo = (state.notices.length - (i % recentNotices.length));

                return `
                    <div class="bulletin-item p-2.5 hover:bg-slate-50 dark:hover:bg-indigo-500/5 transition-colors border-b border-slate-50 dark:border-slate-800/50 last:border-b-0 cursor-pointer group sidebar-notice-item" data-id="${n.docId}">
                        <div class="flex items-center gap-3 w-full">
                            <div class="w-13 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 flex flex-col items-center justify-center shrink-0 border border-indigo-200/50 dark:border-indigo-500/20 shadow-sm relative overflow-hidden group-hover:scale-105 transition-transform px-1">
                                <div class="text-[8px] font-black opacity-60 leading-none mb-0.5 whitespace-nowrap uppercase">নোটিশ নং</div>
                                <div class="text-[17px] font-black leading-none mt-0.5">${bng(noticeNo)}</div>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    <span class="block text-[16px] font-black text-slate-700 dark:text-slate-100 line-clamp-1 group-hover:text-indigo-600 transition-colors tracking-tight leading-snug">${n.title}</span>
                                    ${isNew ? '<span class="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] pulse"></span>' : ''}
                                </div>
                                <div class="flex items-center gap-5 text-[12.5px] font-black text-slate-400 dark:text-slate-500">
                                    <span class="opacity-80 flex items-center gap-2"><i class="far fa-calendar-alt text-[12px]"></i> ${shortDate}</span>
                                    <div class="flex items-center gap-2 border-l border-slate-100 dark:border-slate-800/50 pl-4">
                                        <i class="far fa-eye opacity-50 text-[12px]"></i> ${bng(n.views || 0)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    if (elements.sidebarPagination) elements.sidebarPagination.innerHTML = '';
}

function renderGenericPagination(container, total, current, onPageChange) {
    if (!container) return;
    if (total <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= total; i++) {
        const isActive = current === i;
        html += `<button class="page-btn w-8 h-8 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex items-center justify-center p-0 ${
            isActive
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/30'
                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-black/[0.06] dark:border-white/[0.08] hover:border-indigo-500 hover:text-indigo-600 hover:-translate-y-0.5'
        }">${i}</button>`;
    }
    container.innerHTML = `<div class="flex gap-1.5 items-center">${html}</div>`;

    container.querySelectorAll('.page-btn').forEach((btn, idx) => {
        btn.addEventListener('click', () => onPageChange(idx + 1));
    });
}

function filterNotices() {
    let filtered = state.notices;
    if (state.searchTerm) {
        const query = state.searchTerm.toLowerCase();
        filtered = filtered.filter(n => 
            n.title.toLowerCase().includes(query) || 
            n.content.toLowerCase().includes(query)
        );
    }
    if (state.dateFilter) {
        filtered = filtered.filter(n => {
            const dateStr = n.createdAt?.toDate ? n.createdAt.toDate().toISOString().split('T')[0] : '';
            return dateStr === state.dateFilter;
        });
    }
    return filtered;
}

/**
 * Header Marquee Render
 */
function renderBulletin() {
    if (!elements.noticeScroller) return;
    const important = state.notices.filter(n => n.important).slice(0, 5);
    if (important.length === 0) {
        elements.noticeScroller.innerHTML = '<span>আপাতত কোনো গুরুত্বপূর্ণ আপডেট নেই</span>';
        return;
    }
    const html = important.map(n => `
        <a class="notice-marquee-item" data-id="${n.docId}">
            <i class="fas fa-bullhorn fa-shake"></i> ${n.title}
        </a>
    `).join('');
    elements.noticeScroller.innerHTML = html + html; 
}

function updateBulletinVisibility() {
    if (elements.noticeBulletinWrapper) {
        elements.noticeBulletinWrapper.style.display = state.bulletinEnabled ? 'flex' : 'none';
    }
}

export function updateNoticeAcl(isAdmin) {
    state.isAdmin = isAdmin;
    if (elements.addNoticeBtn) elements.addNoticeBtn.style.display = isAdmin ? 'block' : 'none';
    renderNotices();
}

/**
 * Show Notice Detail in Modal
 */
async function showNoticeDetails(notice) {
    state.currentNoticeId = notice.docId;
    const date = notice.createdAt?.toDate ? notice.createdAt.toDate() : new Date();
    const formattedDate = formatDateBengali(date);
    const noticeNo = (state.notices.length - state.notices.indexOf(notice));
    
    // UI Elements
    if (document.getElementById('noticeDetailTitle')) document.getElementById('noticeDetailTitle').textContent = notice.title;
    if (document.getElementById('noticeDetailAuthor')) document.getElementById('noticeDetailAuthor').textContent = notice.author || 'কর্তৃপক্ষ';
    if (document.getElementById('noticeDetailDate')) document.getElementById('noticeDetailDate').textContent = formattedDate;
    if (document.getElementById('noticeDetailText')) document.getElementById('noticeDetailText').textContent = notice.content;
    if (document.getElementById('noticeDetailNo')) document.getElementById('noticeDetailNo').textContent = bng(noticeNo);
    if (document.getElementById('noticeDetailViews')) document.getElementById('noticeDetailViews').textContent = bng(notice.views || 0);
    if (document.getElementById('noticeDetailCommentsCount')) document.getElementById('noticeDetailCommentsCount').textContent = bng(notice.comments?.length || 0);
    if (document.getElementById('commentListCount')) document.getElementById('commentListCount').textContent = bng(notice.comments?.length || 0);
    if (document.getElementById('noticeAuthorInitial')) document.getElementById('noticeAuthorInitial').textContent = (notice.author || 'M').charAt(0).toUpperCase();

    // Tag styling
    const tag = document.getElementById('noticeDetailTag');
    if (tag) {
        tag.textContent = notice.important ? 'জরুরি নোটিশ' : 'নোটিশ বোর্ড';
        tag.className = notice.important ? 'bg-red-500 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg shadow-red-500/30' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-[10px] font-bold border border-indigo-500/20';
    }

    // Comment Auth Logic
    const user = window.authManager?.state?.user;
    if (user) {
        document.getElementById('commentAuthPrompt')?.classList.add('hidden');
        document.getElementById('noticeCommentForm')?.classList.remove('hidden');
        if (document.getElementById('currentUserAvatar')) document.getElementById('currentUserAvatar').textContent = user.email.charAt(0).toUpperCase();
    } else {
        document.getElementById('commentAuthPrompt')?.classList.remove('hidden');
        document.getElementById('noticeCommentForm')?.classList.add('hidden');
    }

    renderComments(notice.comments || []);
    elements.noticeDetailModal?.classList.add('active');

    // Increment View Count
    incrementViewCount(notice.docId);
}

function renderComments(comments) {
    const list = document.getElementById('noticeCommentList');
    if (!list) return;

    if (comments.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-30 text-slate-400 grayscale">
                <i class="far fa-comments text-3xl mb-2"></i>
                <p class="text-xs font-black italic tracking-tight">এখনও কোনো মন্তব্য নেই। প্রথম মন্তব্যটি আপনার হোক!</p>
            </div>
        `;
        return;
    }

    list.innerHTML = comments.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(c => `
        <div class="flex gap-4 group">
            <div class="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-xs font-black shrink-0 border border-black/5 dark:border-white/5 uppercase">${(c.user || 'U').charAt(0)}</div>
            <div class="flex-1 bg-slate-50 dark:bg-slate-900/10 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 group-hover:border-indigo-500/20 transition-all">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-none">${c.user}</span>
                    <span class="text-[9px] font-bold text-slate-400 leading-none">${c.date}</span>
                </div>
                <p class="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">${c.text}</p>
            </div>
        </div>
    `).join('');
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('commentInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !state.currentNoticeId) return;

    const userEmail = window.authManager?.state?.user?.email || 'Authenticated User';
    const bngDate = new Date().toLocaleDateString('bn-BD', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const comment = {
        user: userEmail,
        text: text,
        date: bngDate,
        createdAt: new Date()
    };

    const success = await addComment(state.currentNoticeId, comment);
    if (success) {
        input.value = '';
        showNotification('আপনার মন্তব্য পোস্ট করা হয়েছে', 'success');
        
        // Local state update for immediate feedback
        const notice = state.notices.find(n => n.docId === state.currentNoticeId);
        if (notice) {
            if (!notice.comments) notice.comments = [];
            notice.comments.unshift(comment);
            renderComments(notice.comments);
            if (document.getElementById('noticeDetailCommentsCount')) document.getElementById('noticeDetailCommentsCount').textContent = bng(notice.comments.length);
            if (document.getElementById('commentListCount')) document.getElementById('commentListCount').textContent = bng(notice.comments.length);
        }
    }
}

async function incrementViewCount(docId) {
    try {
        const { db } = await import('../firebase.js');
        const { doc, updateDoc, increment } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const docRef = doc(db, 'notices', docId);
        await updateDoc(docRef, { views: increment(1) });
    } catch (e) { console.error('View increment failed', e); }
}

async function addComment(docId, comment) {
    try {
        const { db } = await import('../firebase.js');
        const { doc, updateDoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const docRef = doc(db, 'notices', docId);
        await updateDoc(docRef, { comments: arrayUnion(comment) });
        return true;
    } catch (e) {
        console.error('Comment failed', e);
        return false;
    }
}

async function handleNoticeDelete(docId) {
    if (!confirm('আপনি কি নিশ্চিত যে এই নোটিশটি মুছতে চান?')) return;
    const success = await deleteNotice(docId);
    if (success) showNotification('নোটিশ মুছে ফেলা হয়েছে', 'warning');
}

function editNotice(notice) {
    resetForm();
    if (document.getElementById('noticeModalTitle')) document.getElementById('noticeModalTitle').textContent = 'নোটিশ এডিট করুন';
    if (document.getElementById('noticeTitle')) document.getElementById('noticeTitle').value = notice.title;
    if (document.getElementById('noticeContent')) document.getElementById('noticeContent').value = notice.content;
    if (document.getElementById('noticeAuthor')) document.getElementById('noticeAuthor').value = notice.author;
    if (document.getElementById('noticeImportant')) document.getElementById('noticeImportant').checked = notice.important;
    if (elements.noticeForm) elements.noticeForm.dataset.editingId = notice.docId;
    elements.noticeModal?.classList.add('active');
}

function resetForm() {
    elements.noticeForm?.reset();
    if (elements.noticeForm) elements.noticeForm.dataset.editingId = '';
    if (document.getElementById('noticeModalTitle')) document.getElementById('noticeModalTitle').textContent = 'নতুন নোটিশ তৈরি করুন';
}
