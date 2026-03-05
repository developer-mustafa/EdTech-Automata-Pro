/**
 * User Management Module
 */

import { getAllUsers, updateUserRole } from '../firestoreService.js';
import { elements, setLoading, showConfirmModal } from './uiManager.js';
import { showNotification } from '../utils.js';
import { state } from './state.js';

/**
 * Initialize and render user management list
 */
export async function handleUserManagement() {
    if (!state.isSuperAdmin) {
        showNotification('শুধুমাত্র সুপার অ্যাডমিনরা এই পেজটি এক্সেস করতে পারবেন', 'warning');
        return;
    }

    setLoading(true, '#userManagementModal .modal-content');
    try {
        const users = await getAllUsers();
        renderUsers(users);
    } catch (error) {
        console.error('Error in user management:', error);
        showNotification('ব্যবহারকারী তালিকা লোড করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false, '#userManagementModal .modal-content');
    }
}

/**
 * Render user rows into the table
 * @param {Array} users 
 */
function renderUsers(users) {
    if (!elements.userListBody) return;

    if (users.length === 0) {
        elements.userListBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">কোনো ব্যবহারকারী পাওয়া যায়নি</td></tr>';
        return;
    }

    elements.userListBody.innerHTML = users.map(user => {
        const isSelf = state.currentUser && state.currentUser.uid === user.uid;
        const roleLabel = user.role === 'super_admin' ? 'Super Admin' :
            user.role === 'admin' ? 'Admin' : 'User';

        return `
            <tr class="user-row">
                <td class="user-name-cell">
                    <div class="user-info-flex">
                        <img class="user-avatar-small" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + user.displayName}">
                        <span class="user-display-name">${user.displayName || 'Unnamed'}</span>
                    </div>
                </td>
                <td class="user-email-cell">${user.email}</td>
                <td class="user-role-cell">
                    <span class="role-badge role-${user.role || 'user'}">
                        ${roleLabel}
                    </span>
                </td>
                <td class="user-action-cell">
                    <select class="role-select-premium" data-uid="${user.uid}" data-name="${user.displayName || 'Unnamed'}" ${isSelf ? 'disabled' : ''}>
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');

    // Attach listeners to selects
    elements.userListBody.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const uid = e.target.dataset.uid;
            const userName = e.target.dataset.name;
            const newRole = e.target.value;
            await handleRoleUpdate(uid, newRole, userName);
        });
    });
}

/**
 * Update user role
 * @param {string} uid 
 * @param {string} newRole 
 * @param {string} userName // Added userName parameter
 */
async function handleRoleUpdate(uid, newRole, userName) {
    showConfirmModal(
        `আপনি কি নিশ্চিত যে আপনি এই ব্যবহারকারীর রোল পরিবর্তন করতে চান?`,
        async () => {
            try {
                const success = await updateUserRole(uid, newRole);
                if (success) {
                    showNotification('ব্যবহারকারীর রোল সফলভাবে আপডেট করা হয়েছে');
                    // Re-fetch and re-render after successful update
                    await handleUserManagement();
                } else {
                    showNotification('রোল আপডেট করতে সমস্যা হয়েছে', 'error');
                }
            } catch (error) {
                console.error('Error updating role:', error);
                showNotification('একটি ত্রুটি ঘটেছে', 'error');
            }
        },
        `ব্যবহারকারী: ${userName}`,
        `নতুন রোল: ${newRole}`
    );
}

function getRoleColor(role) {
    switch (role) {
        case 'super_admin': return '#6c5ce7';
        case 'admin': return '#00b894';
        default: return '#b2bec3';
    }
}
