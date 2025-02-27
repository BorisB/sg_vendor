/**
 * API service for authentication and other requests
 */

// API base URL 
const API_URL = 'http://localhost:8010';

/**
 * Login function to authenticate user with the API
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @returns {Promise} - Promise containing token and user data
 */
async function login(username, password) {
    try {
        const response = await fetch(`${API_URL}/tools/analytics/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error de autenticación');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw error;
    }
}

/**
 * Check if the user is authenticated
 * @returns {boolean} - True if user is logged in
 */
function checkAuthentication() {
    if (!sessionStorage.getItem('token')) {
        return false;
    }
    return true;
}

export { login, checkAuthentication };