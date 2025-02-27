/**
 * API service for authentication and other requests
 */

// API base URL 
const API_URL = 'https://ofertasimple.com';

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
 * Fetch CSV data from the API
 * @returns {Promise<string>} - Promise containing CSV data
 */
async function fetchCsvData() {
    try {
        const token = sessionStorage.getItem('token');

        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch(`${API_URL}/tools/analytics/csv`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch CSV data');
        }

        return await response.text();
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

export { login, fetchCsvData, checkAuthentication };