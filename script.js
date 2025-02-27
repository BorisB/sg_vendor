// Import API functions
import { fetchCsvData } from './api.js';

let transactionData = [];
let currentDatePicker;
let previousDatePicker;
let selectedBusiness = 'all';
let selectedLocation = 'all';
let currentDateRange = null;
let previousDateRange = null;
let returningWindow = 1;
let firstTimeUsersThreshold = 1; // Default threshold for first-time users
let uniqueUsersChart = null;
let returningUsersChart = null;
let returningUsersPercentageChart = null;
let totalAmountChart = null;
let avgVisitsChart = null;
let firstTimeUsersChart = null;
let globalUserFirstVisit = new Map(); // Track first visit date for each user across all businesses
let globalUserBusinessFirstVisit = new Map(); // Track first visit date for each user-business combination
let modalChart = null;
let currentExpandedChart = null;
let currentEnlargedChart = null;

// Add this function at the top of the file
function isAuthenticated() {
    return !!sessionStorage.getItem('token') && !!sessionStorage.getItem('isLoggedIn');
}

// Helper function to parse dates
function parseDate(dateStr) {
    // Try different date formats
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // If standard parsing fails, try to parse DD/MM/YYYY format
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
        // Try both DD/MM/YYYY and MM/DD/YYYY formats
        const possibleDates = [
            new Date(parts[2], parts[1] - 1, parts[0]), // DD/MM/YYYY
            new Date(parts[2], parts[0] - 1, parts[1])  // MM/DD/YYYY
        ];

        for (const d of possibleDates) {
            if (!isNaN(d.getTime())) {
                return d;
            }
        }
    }

    throw new Error(`Invalid date format: ${dateStr}`);
}

// Helper function to format date to YYYY-MM
function formatYearMonth(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Helper function to parse CSV line considering quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Handle escaped quotes
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

// Helper function to extract location from business name
function extractLocation(businessName) {
    const parts = businessName.split('-');
    if (parts.length > 1) {
        return parts[parts.length - 1].trim();
    }
    return 'Unknown';
}

// Helper function to extract business name without location
function extractBusinessName(fullName) {
    const parts = fullName.split('-');
    if (parts.length > 1) {
        return parts.slice(0, -1).join('-').trim();
    }
    return fullName.trim();
}

document.addEventListener('DOMContentLoaded', function () {
    // Check authentication first
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    // Update welcome message with display name
    const userDisplayName = sessionStorage.getItem('userDisplayName') || 'User';
    document.getElementById('welcomeUser').textContent = `Welcome, ${userDisplayName}`;

    // Setup logout functionality
    document.getElementById('logoutBtn').addEventListener('click', function () {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    // Initialize current period date picker
    currentDatePicker = flatpickr("#currentDateRange", {
        mode: "range",
        dateFormat: "M j, Y",
        defaultDate: null,
        onChange: function (selectedDates) {
            if (selectedDates.length === 2) {
                currentDateRange = selectedDates;
                const days = getDaysBetween(selectedDates[0], selectedDates[1]);
                const input = document.querySelector('#currentDateRange');
                if (input) {
                    input.value = `${selectedDates[0].toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    })} to ${selectedDates[1].toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    })} (${days} days)`;
                }

                // Automatically set previous period based on current selection
                const periodLength = selectedDates[1] - selectedDates[0];
                const previousEnd = new Date(selectedDates[0]);
                previousEnd.setDate(previousEnd.getDate() - 1); // Day before current start
                const previousStart = new Date(previousEnd);
                previousStart.setTime(previousEnd.getTime() - periodLength);

                previousDateRange = [previousStart, previousEnd];
                const previousDays = getDaysBetween(previousStart, previousEnd);
                previousDatePicker.setDate([previousStart, previousEnd]);
                const previousInput = document.querySelector('#previousDateRange');
                if (previousInput) {
                    previousInput.value = `${previousStart.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    })} to ${previousEnd.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    })} (${previousDays} days)`;
                }

                filterAndUpdateDashboard();
            }
        }
    });

    // Initialize previous period date picker (read-only)
    previousDatePicker = flatpickr("#previousDateRange", {
        mode: "range",
        dateFormat: "M j, Y",
        defaultDate: null,
        clickOpens: false, // Make it read-only
        onChange: function (selectedDates) {
            if (selectedDates.length === 2) {
                previousDateRange = selectedDates;
                filterAndUpdateDashboard();
            }
        }
    });

    // Set up download CSV button
    document.getElementById('downloadCsvBtn').addEventListener('click', handleCsvDownload);

    // Load pre-built data only after authentication
    if (isAuthenticated()) {
        // Instead of loading from a local file, fetch from API
        loadDataFromApi();
    }

    // Set up business filter listener
    document.getElementById('businessSearch').addEventListener('change', function (e) {
        selectedBusiness = e.target.value;
        updateLocationFilter();
        // Reset date ranges when business changes
        currentDateRange = null;
        previousDateRange = null;
        filterAndUpdateDashboard();
    });

    // Set up location filter listener
    document.getElementById('locationSearch').addEventListener('change', function (e) {
        selectedLocation = e.target.value;
        // Reset date ranges when location changes
        currentDateRange = null;
        previousDateRange = null;
        filterAndUpdateDashboard();
    });

    // Set up returning window listener
    document.getElementById('returningWindow').addEventListener('change', function (e) {
        returningWindow = parseInt(e.target.value);
        filterAndUpdateDashboard();
    });

    // Add first time users threshold listener
    document.getElementById('firstTimeUsersThreshold').addEventListener('change', function (e) {
        firstTimeUsersThreshold = parseInt(e.target.value);
        filterAndUpdateDashboard();
    });

    // Initialize chart modal functionality
    initializeModalHandlers();

    initializeMobileHandlers();

    // Initialize business search
    initializeBusinessSearch();

    // Remove the old business search listener
    document.getElementById('businessSearch').removeEventListener('change', function (e) {
        selectedBusiness = e.target.value;
        updateLocationFilter();
        currentDateRange = null;
        previousDateRange = null;
        filterAndUpdateDashboard();
    });

    // Add this after the date picker initialization code
    document.getElementById('quickDateFilter').addEventListener('change', function (e) {
        const days = parseInt(e.target.value);
        if (!days) return; // If no value selected, do nothing

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        // Set the current date range
        currentDateRange = [startDate, endDate];
        currentDatePicker.setDate([startDate, endDate]);

        // Calculate and set the previous period
        const prevEndDate = new Date(startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1);
        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - days);

        // Set the previous date range
        previousDateRange = [prevStartDate, prevEndDate];
        previousDatePicker.setDate([prevStartDate, prevEndDate]);

        // Update the dashboard with new date ranges
        filterAndUpdateDashboard();
    });
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    console.log('Processing new file...');

    reader.onload = function (e) {
        const text = e.target.result;
        try {
            processData(text);
            filterAndUpdateDashboard();
        } catch (error) {
            alert(`Error processing file: ${error.message}`);
            console.error('Error processing file:', error);
        }
    };

    reader.readAsText(file);
}

function calculateFirstVisitDates(transactions) {
    // Clear existing data
    globalUserFirstVisit.clear();
    globalUserBusinessFirstVisit.clear();

    // Process each transaction to find first visits
    transactions.forEach(item => {
        const email = item.email;
        const businessName = extractBusinessName(item.merchant);

        // Track first visit ever (across all businesses)
        if (!globalUserFirstVisit.has(email)) {
            globalUserFirstVisit.set(email, item.date);
        } else if (item.date < globalUserFirstVisit.get(email)) {
            globalUserFirstVisit.set(email, item.date);
        }

        // Track first visit to specific business
        const userBusinessKey = `${email}-${businessName}`;
        if (!globalUserBusinessFirstVisit.has(userBusinessKey)) {
            globalUserBusinessFirstVisit.set(userBusinessKey, item.date);
        } else if (item.date < globalUserBusinessFirstVisit.get(userBusinessKey)) {
            globalUserBusinessFirstVisit.set(userBusinessKey, item.date);
        }
    });
}

function processData(csvText) {
    const lines = csvText.split('\n');
    const headers = parseCSVLine(lines[0].toLowerCase());

    // Map the exact headers from the CSV file
    const columnMappings = {
        email: ['user email'],
        merchant: ['merchant'],
        date: ['date'],
        amount: ['transaction amount']
    };

    // Find actual column indices
    const columnIndices = {
        email: headers.findIndex(header => columnMappings.email.includes(header)),
        merchant: headers.findIndex(header => columnMappings.merchant.includes(header)),
        date: headers.findIndex(header => columnMappings.date.includes(header)),
        amount: headers.findIndex(header => columnMappings.amount.includes(header))
    };

    // Debug log to see what headers were found
    console.log('Found column indices:', {
        headers: headers,
        indices: columnIndices
    });

    // Validate that we found all required columns
    const missingColumns = [];
    Object.entries(columnIndices).forEach(([column, index]) => {
        if (index === -1) {
            missingColumns.push(column);
        }
    });

    if (missingColumns.length > 0) {
        console.error('CSV Headers:', headers);
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}. Please ensure your CSV file has the necessary columns.`);
    }

    // Clear existing data
    transactionData = [];

    // Process each line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const values = parseCSVLine(line);

            // Create row data using found column indices
            const rowData = {
                email: values[columnIndices.email],
                merchant: values[columnIndices.merchant],
                date: parseDate(values[columnIndices.date]),
                amount: parseFloat(values[columnIndices.amount].replace(/[^0-9.-]+/g, ''))
            };

            // Validate the row data
            if (!rowData.email || !rowData.merchant || isNaN(rowData.date.getTime()) || isNaN(rowData.amount)) {
                console.error(`Skipping invalid row ${i + 1}`);
                continue;
            }

            transactionData.push(rowData);
        } catch (error) {
            console.error(`Error processing line ${i + 1}: ${error.message}`);
        }
    }

    // Calculate first visit dates
    calculateFirstVisitDates(transactionData);

    // Reset filters
    selectedBusiness = 'all';
    selectedLocation = 'all';

    // Update filters
    console.log('Updating business filter with', transactionData.length, 'transactions');
    initializeBusinessSearch(); // Reinitialize business search with new data
    updateLocationFilter();

    // Log summary data
    console.log(`Processed ${transactionData.length} transactions`);
    if (transactionData.length > 0) {
        console.log('Sample transaction:', {
            merchant: maskBusinessName(transactionData[0].merchant),
            date: transactionData[0].date,
            amount: transactionData[0].amount
        });
    }
    console.log('Data processing complete');
}

function initializeSearchableSelect(searchInput, optionsContainer, options, onSelect) {
    const input = document.getElementById(searchInput);
    const container = document.getElementById(optionsContainer);

    // Clear existing options
    container.innerHTML = '';

    // Add "All" option
    const allOption = document.createElement('div');
    allOption.className = 'option selected';
    allOption.textContent = 'All Businesses';
    allOption.dataset.value = 'all';
    container.appendChild(allOption);

    // Add input event listener for search
    input.addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();
        const allOptions = container.querySelectorAll('.option');

        allOptions.forEach(option => {
            const text = option.textContent.toLowerCase();
            if (text === 'all businesses' || text.includes(searchTerm)) {
                option.style.display = 'block';
            } else {
                option.style.display = 'none';
            }
        });

        container.classList.add('show');
    });

    // Show options on input focus
    input.addEventListener('focus', function () {
        container.classList.add('show');
    });

    // Handle click on "All" option
    allOption.addEventListener('click', function () {
        const allOptions = container.querySelectorAll('.option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        allOption.classList.add('selected');

        input.value = '';
        container.classList.remove('show');
        onSelect('all');
    });

    // Add business options
    options.forEach(option => {
        const div = document.createElement('div');
        div.className = 'option';
        div.textContent = option;
        div.dataset.value = option;

        div.addEventListener('click', () => {
            const allOptions = container.querySelectorAll('.option');
            allOptions.forEach(opt => opt.classList.remove('selected'));
            div.classList.add('selected');

            input.value = option;
            container.classList.remove('show');
            onSelect(option);
        });

        container.appendChild(div);
    });

    // Close options when clicking outside
    document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !container.contains(e.target)) {
            container.classList.remove('show');
        }
    });
}

function updateOptions(container, options, onSelect, searchTerm = '') {
    // Always keep the "All" option
    const isBusinessFilter = container.id === 'businessOptions';
    const allOptionText = `All ${isBusinessFilter ? 'Businesses' : 'Locations'}`;
    const selectedValue = isBusinessFilter ? selectedBusiness : selectedLocation;

    container.innerHTML = `
        <div class="option ${selectedValue === 'all' ? 'selected' : ''}" data-value="all">
            ${allOptionText}
        </div>
    `;

    if (options.length === 0 && searchTerm) {
        container.innerHTML += `<div class="no-results">No matches found</div>`;
        return;
    }

    // Add "All" option to the click handler
    const allOption = container.querySelector('.option[data-value="all"]');
    allOption.addEventListener('click', () => {
        const allOptions = container.querySelectorAll('.option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        allOption.classList.add('selected');

        const input = container.previousElementSibling;
        input.value = '';

        container.classList.remove('show');
        onSelect('all');
    });

    options.forEach(option => {
        const div = document.createElement('div');
        div.className = `option ${option === selectedValue ? 'selected' : ''}`;
        div.textContent = option;
        div.dataset.value = option;

        div.addEventListener('click', () => {
            const allOptions = container.querySelectorAll('.option');
            allOptions.forEach(opt => opt.classList.remove('selected'));
            div.classList.add('selected');

            const input = container.previousElementSibling;
            input.value = option;

            container.classList.remove('show');
            onSelect(option);
        });

        container.appendChild(div);
    });
}

function updateBusinessFilter() {
    const uniqueBusinesses = new Set();

    // Get unique business names without locations
    transactionData.forEach(item => {
        uniqueBusinesses.add(extractBusinessName(item.merchant));
    });

    const businesses = [...uniqueBusinesses].sort();

    // Initialize searchable select for businesses
    initializeSearchableSelect(
        'businessSearch',
        'businessOptions',
        businesses,
        (selected) => {
            selectedBusiness = selected;
            updateLocationFilter();
            // Reset date ranges when business changes
            currentDateRange = null;
            previousDateRange = null;
            filterAndUpdateDashboard();
        }
    );
}

function updateLocationFilter() {
    const locations = new Set();

    // Get locations based on selected business
    transactionData.forEach(item => {
        const businessName = extractBusinessName(item.merchant);
        if (selectedBusiness === 'all' || businessName === selectedBusiness) {
            locations.add(extractLocation(item.merchant));
        }
    });

    const sortedLocations = [...locations].sort();

    // Initialize searchable select for locations
    initializeSearchableSelect(
        'locationSearch',
        'locationOptions',
        sortedLocations,
        (selected) => {
            selectedLocation = selected;
            filterAndUpdateDashboard();
        }
    );
}

function getDaysBetween(startDate, endDate) {
    const diffTime = Math.abs(endDate - startDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Add 1 to include both start and end dates
}

function formatDateForDisplay(startDate, endDate) {
    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const days = getDaysBetween(startDate, endDate);
    return `${formatDate(startDate)} - ${formatDate(endDate)} (${days} days)`;
}

function updatePeriodTexts(currentStart, currentEnd, compareStart, compareEnd) {
    const currentText = document.getElementById('currentPeriodText');
    const comparisonText = document.getElementById('comparisonPeriodText');

    if (currentStart && currentEnd) {
        currentText.textContent = formatDateForDisplay(currentStart, currentEnd);
    } else {
        currentText.textContent = 'No date range selected';
    }

    if (compareStart && compareEnd) {
        comparisonText.textContent = formatDateForDisplay(compareStart, compareEnd);
    } else {
        comparisonText.textContent = 'No date range selected';
    }
}

function filterAndUpdateDashboard() {
    // Ensure transactionData is an array
    if (!Array.isArray(transactionData)) {
        console.error('Transaction data is not an array');
        transactionData = [];
    }

    let filteredData = [...transactionData];

    // Apply business and location filters
    if (selectedBusiness !== 'all' || selectedLocation !== 'all') {
        filteredData = filteredData.filter(item => {
            const businessName = extractBusinessName(item.merchant);
            const location = extractLocation(item.merchant);
            const businessMatch = selectedBusiness === 'all' || businessName === selectedBusiness;
            const locationMatch = selectedLocation === 'all' || location === selectedLocation;
            return businessMatch && locationMatch;
        });
    }

    // If no date ranges are selected and we have data, set default periods
    if ((!currentDateRange || currentDateRange.length !== 2) && filteredData.length > 0) {
        const sortedData = [...filteredData].sort((a, b) => a.date - b.date);
        const firstTransactionDate = new Date(sortedData[0].date);
        const lastTransactionDate = new Date(sortedData[sortedData.length - 1].date);

        // Set current period to last 30 days of data
        const currentEnd = lastTransactionDate;
        const currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() - 29);

        currentDateRange = [currentStart, currentEnd];
        currentDatePicker.setDate([currentStart, currentEnd]);

        // Set previous period
        const previousEnd = new Date(currentStart);
        previousEnd.setDate(previousEnd.getDate() - 1);
        const previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 29);

        previousDateRange = [previousStart, previousEnd];
        previousDatePicker.setDate([previousStart, previousEnd]);
    }

    // Update the dashboard with filtered data
    updateDashboard(filteredData);
}

function calculateGrowth(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

function formatGrowth(growth) {
    const prefix = growth > 0 ? '+' : '';
    return `${prefix}${growth.toFixed(1)}%`;
}

function updateComparisonDisplay(elementId, growth) {
    const element = document.getElementById(elementId);
    element.textContent = formatGrowth(growth);

    // Remove existing classes
    element.classList.remove('positive', 'negative', 'neutral');

    // Add appropriate class based on growth
    if (growth > 0) {
        element.classList.add('positive');
    } else if (growth < 0) {
        element.classList.add('negative');
    } else {
        element.classList.add('neutral');
    }
}

function calculateAverageVisits(data) {
    // Group transactions by user
    const userVisits = {};
    data.forEach(item => {
        if (!userVisits[item.email]) {
            userVisits[item.email] = 0;
        }
        userVisits[item.email]++;
    });

    // Calculate average visits
    const totalUsers = Object.keys(userVisits).length;
    if (totalUsers === 0) return 0;

    const totalVisits = Object.values(userVisits).reduce((sum, visits) => sum + visits, 0);
    return totalVisits / totalUsers;
}

function formatAverage(value) {
    return value.toFixed(1);
}

function calculateGrowthPercentage(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

function initMetricsCharts(data) {
    initUniqueUsersChart(data);
    initReturningUsersChart(data);
    initReturningUsersPercentageChart(data);
    initTotalAmountChart(data);
    initAvgVisitsChart(data);
    initFirstTimeUsersChart(data);
}

function initUniqueUsersChart(data) {
    const ctx = document.getElementById('uniqueUsersChart').getContext('2d');
    if (uniqueUsersChart instanceof Chart) {
        uniqueUsersChart.destroy();
    }

    uniqueUsersChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Usuarios Únicos por Mes',
                data: data.uniqueUsers,
                backgroundColor: 'rgba(107, 100, 219, 0.7)',
                borderColor: '#6B64DB',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 30,
                    bottom: 20,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Usuarios Únicos por Mes',
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 30, top: 10 }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 5,
                    formatter: Math.round,
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    padding: 6
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Número de Usuarios',
                        padding: { top: 10, bottom: 10 }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function initReturningUsersChart(data) {
    const ctx = document.getElementById('returningUsersChart').getContext('2d');
    if (returningUsersChart instanceof Chart) {
        returningUsersChart.destroy();
    }

    const returningData = returningWindow === 0 ? data.returningUsers : data.lastMonthReturningUsers;

    returningUsersChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: returningWindow === 0 ?
                    'Visitas Múltiples (Mes Actual)' :
                    `Usuarios Recurrentes (${returningWindow} ${returningWindow > 1 ? 'Meses' : 'Mes'} Anterior${returningWindow > 1 ? 'es' : ''}`,
                data: returningData,
                backgroundColor: 'rgba(107, 100, 219, 0.7)',
                borderColor: '#6B64DB',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 30,
                    bottom: 20,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: returningWindow === 0 ?
                        'Usuarios con Visitas Múltiples en el Mismo Mes' :
                        `Usuarios Recurrentes de ${returningWindow} ${returningWindow > 1 ? 'Meses' : 'Mes'} Anterior${returningWindow > 1 ? 'es' : ''}`,
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 30, top: 10 }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 5,
                    formatter: Math.round,
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    padding: 6
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Número de Usuarios',
                        padding: { top: 10, bottom: 10 }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function initReturningUsersPercentageChart(data) {
    const ctx = document.getElementById('returningUsersPercentageChart').getContext('2d');
    if (returningUsersPercentageChart instanceof Chart) {
        returningUsersPercentageChart.destroy();
    }

    const returningData = returningWindow === 0 ? data.returningUsers : data.lastMonthReturningUsers;
    const percentages = data.labels.map((_, index) =>
        (returningData[index] / data.uniqueUsers[index] * 100) || 0
    );

    returningUsersPercentageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: returningWindow === 0 ?
                    'Visitas Múltiples % (Mes Actual)' :
                    `Usuarios Recurrentes % (${returningWindow} ${returningWindow > 1 ? 'Meses' : 'Mes'} Anterior${returningWindow > 1 ? 'es' : ''}`,
                data: percentages,
                backgroundColor: 'rgba(107, 100, 219, 0.7)',
                borderColor: '#6B64DB',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 30,
                    bottom: 20,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: returningWindow === 0 ?
                        'Porcentaje de Usuarios con Visitas Múltiples' :
                        `Porcentaje de Usuarios Recurrentes (${returningWindow} ${returningWindow > 1 ? 'Meses' : 'Mes'} Anterior${returningWindow > 1 ? 'es' : ''}`,
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 30, top: 10 }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 5,
                    formatter: (value) => `${Math.round(value)}%`,
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    padding: 6
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Porcentaje de Usuarios Mensuales',
                        padding: { top: 10, bottom: 10 }
                    },
                    ticks: {
                        callback: value => value + '%'
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function initTotalAmountChart(data) {
    const ctx = document.getElementById('totalAmountChart').getContext('2d');
    if (totalAmountChart instanceof Chart) {
        totalAmountChart.destroy();
    }

    totalAmountChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Monto Total',
                data: data.totalAmount,
                backgroundColor: 'rgba(107, 100, 219, 0.7)',
                borderColor: '#6B64DB',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 30,
                    bottom: 20,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Monto de Transacciones Mensuales',
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 30, top: 10 }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 5,
                    formatter: function (value) {
                        return new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }).format(value || 0);
                    },
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    padding: 6
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Amount ($)',
                        padding: { top: 10, bottom: 10 }
                    },
                    ticks: {
                        callback: function (value) {
                            return new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            }).format(value || 0);
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function initAvgVisitsChart(data) {
    const ctx = document.getElementById('avgVisitsChart').getContext('2d');
    if (avgVisitsChart instanceof Chart) {
        avgVisitsChart.destroy();
    }

    avgVisitsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Visitas Promedio',
                data: data.avgVisits,
                backgroundColor: 'rgba(107, 100, 219, 0.7)',
                borderColor: '#6B64DB',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 30,
                    bottom: 20,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Promedio de Visitas Mensuales por Usuario',
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 30, top: 10 }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 5,
                    formatter: formatAverage,
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    padding: 6
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Visitas Promedio',
                        padding: { top: 10, bottom: 10 }
                    },
                    ticks: {
                        callback: formatAverage
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function initFirstTimeUsersChart(data) {
    const ctx = document.getElementById('firstTimeUsersChart').getContext('2d');
    if (firstTimeUsersChart instanceof Chart) {
        firstTimeUsersChart.destroy();
    }

    firstTimeUsersChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Usuarios Nuevos o Reactivados',
                data: data.firstTimeUsers,
                backgroundColor: 'rgba(107, 100, 219, 0.7)',
                borderColor: '#6B64DB',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 30,
                    bottom: 20,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Usuarios Nuevos o Reactivados en ${selectedBusiness}`,
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 30, top: 10 }
                },
                subtitle: {
                    display: true,
                    text: `Usuarios que realizaron su primera visita a ${selectedBusiness} al menos ${firstTimeUsersThreshold} días después de su primera transacción en cualquier negocio`,
                    font: { size: 12 },
                    padding: { bottom: 10 }
                },
                tooltip: {
                    enabled: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 5,
                    formatter: Math.round,
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    padding: 6
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 5
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Número de Usuarios',
                        padding: { top: 10, bottom: 10 }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function updateCharts(data) {
    // Group data by month
    const monthlyData = {};

    // Group data by month (data is already filtered by date range)
    data.forEach(item => {
        const monthYear = formatYearMonth(item.date);
        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = {
                users: new Set(),
                returningUsers: new Set(),
                lastMonthReturningUsers: new Set(),
                firstTimeUsers: new Set(),
                amount: 0,
                visits: {}
            };
        }

        monthlyData[monthYear].users.add(item.email);
        monthlyData[monthYear].amount += item.amount;

        // Track visits per user
        if (!monthlyData[monthYear].visits[item.email]) {
            monthlyData[monthYear].visits[item.email] = new Set();
        }
        monthlyData[monthYear].visits[item.email].add(item.date.toDateString());
    });

    // Calculate metrics for each month
    const sortedMonths = Object.keys(monthlyData).sort();
    sortedMonths.forEach((month) => {
        // Calculate first-time users based on threshold
        monthlyData[month].firstTimeUsers = new Set();

        // For each user who had a transaction this month
        monthlyData[month].users.forEach(email => {
            // Skip if we're looking at all businesses
            if (selectedBusiness === 'all') {
                return;
            }

            // Get user's first visit to the selected business
            const userBusinessKey = `${email}-${selectedBusiness}`;
            const businessFirstVisit = globalUserBusinessFirstVisit.get(userBusinessKey);

            // Skip if user never visited this business or first visit wasn't in this month
            if (!businessFirstVisit || formatYearMonth(businessFirstVisit) !== month) {
                return;
            }

            // Get user's first ever visit
            const userFirstEverVisit = globalUserFirstVisit.get(email);

            // Calculate days between first ever visit and first business visit
            const daysDiff = (businessFirstVisit.getTime() - userFirstEverVisit.getTime()) / (1000 * 60 * 60 * 24);

            // Add to first-time users if days difference meets threshold
            if (daysDiff >= firstTimeUsersThreshold) {
                monthlyData[month].firstTimeUsers.add(email);
            }
        });

        // Calculate regular returning users (multiple visits in same month)
        monthlyData[month].returningUsers = new Set(
            Object.entries(monthlyData[month].visits)
                .filter(([_, dates]) => dates.size > 1)
                .map(([email]) => email)
        );

        // Calculate users returning from previous months based on window
        if (month && returningWindow > 0) {
            const previousMonthsUsers = new Set();
            for (let i = 1; i <= returningWindow; i++) {
                const previousMonth = sortedMonths[sortedMonths.indexOf(month) - i];
                if (previousMonth && monthlyData[previousMonth]) {
                    monthlyData[previousMonth].users.forEach(email => previousMonthsUsers.add(email));
                }
            }
            monthlyData[month].lastMonthReturningUsers = new Set(
                [...monthlyData[month].users].filter(email => previousMonthsUsers.has(email))
            );
        }

        const totalVisits = Object.values(monthlyData[month].visits)
            .reduce((sum, dates) => sum + dates.size, 0);
        monthlyData[month].avgVisits = totalVisits / monthlyData[month].users.size;
    });

    // Prepare chart data
    const labels = sortedMonths;
    const chartData = {
        labels: labels,
        uniqueUsers: labels.map(month => monthlyData[month].users.size),
        returningUsers: labels.map(month => monthlyData[month].returningUsers.size),
        lastMonthReturningUsers: labels.map(month => monthlyData[month].lastMonthReturningUsers.size),
        firstTimeUsers: labels.map(month => monthlyData[month].firstTimeUsers.size),
        totalAmount: labels.map(month => monthlyData[month].amount),
        avgVisits: labels.map(month => monthlyData[month].avgVisits)
    };

    // Initialize all charts with the data
    initMetricsCharts(chartData);
}

function updateDashboard(data) {
    // Ensure data is an array
    const safeData = Array.isArray(data) ? data : [];

    // Apply date range filtering
    let filteredData = safeData;
    if (currentDateRange && currentDateRange.length === 2) {
        const startDate = new Date(currentDateRange[0]);
        const endDate = new Date(currentDateRange[1]);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        filteredData = safeData.filter(item => {
            const date = new Date(item.date);
            return date >= startDate && date <= endDate;
        });
    }

    // Get data for previous period
    let previousPeriodData = [];
    if (previousDateRange && previousDateRange.length === 2) {
        const prevStartDate = new Date(previousDateRange[0]);
        const prevEndDate = new Date(previousDateRange[1]);
        prevStartDate.setHours(0, 0, 0, 0);
        prevEndDate.setHours(23, 59, 59, 999);

        previousPeriodData = safeData.filter(item => {
            const date = new Date(item.date);
            return date >= prevStartDate && date <= prevEndDate;
        });
    }

    // Helper function to safely update element text content
    function safeSetText(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        } else {
            console.warn(`Element with id '${elementId}' not found`);
        }
    }

    // Calculate metrics for current period
    const uniqueUsers = new Set(filteredData.map(item => item.email)).size;
    const uniqueUsersPrev = new Set(previousPeriodData.map(item => item.email)).size;
    safeSetText('uniqueUsers', uniqueUsers);
    safeSetText('uniqueUsersPrev', uniqueUsersPrev);

    // Calculate returning users
    const userVisits = {};
    filteredData.forEach(item => {
        if (!userVisits[item.email]) {
            userVisits[item.email] = new Set();
        }
        userVisits[item.email].add(item.date.toDateString());
    });

    const userVisitsPrev = {};
    previousPeriodData.forEach(item => {
        if (!userVisitsPrev[item.email]) {
            userVisitsPrev[item.email] = new Set();
        }
        userVisitsPrev[item.email].add(item.date.toDateString());
    });

    // Count users with multiple visits
    const returningUsers = Object.values(userVisits)
        .filter(dates => dates.size > 1).length;
    const returningUsersPrev = Object.values(userVisitsPrev)
        .filter(dates => dates.size > 1).length;
    safeSetText('returningUsers', returningUsers);
    safeSetText('returningUsersPrev', returningUsersPrev);

    // Calculate total amount
    const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0);
    const totalAmountPrev = previousPeriodData.reduce((sum, item) => sum + item.amount, 0);
    safeSetText('totalAmount', totalAmount.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD'
    }));
    safeSetText('totalAmountPrev', totalAmountPrev.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD'
    }));

    // Calculate average visits
    const avgVisits = calculateAverageVisits(filteredData);
    const avgVisitsPrev = calculateAverageVisits(previousPeriodData);
    safeSetText('avgVisits', formatAverage(avgVisits));
    safeSetText('avgVisitsPrev', formatAverage(avgVisitsPrev));

    // Calculate and update growth comparisons
    const uniqueUsersGrowth = calculateGrowth(uniqueUsers, uniqueUsersPrev);
    const returningUsersGrowth = calculateGrowth(returningUsers, returningUsersPrev);
    const totalAmountGrowth = calculateGrowth(totalAmount, totalAmountPrev);
    const avgVisitsGrowth = calculateGrowth(avgVisits, avgVisitsPrev);

    updateComparisonDisplay('usersComparison', uniqueUsersGrowth);
    updateComparisonDisplay('returningUsersComparison', returningUsersGrowth);
    updateComparisonDisplay('amountComparison', totalAmountGrowth);
    updateComparisonDisplay('avgVisitsComparison', avgVisitsGrowth);

    try {
        // Update charts with filtered data
        if (filteredData.length > 0) {
            updateCharts(filteredData);
        } else {
            console.warn('No data available for charts');
        }
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}

function updateChart(data) {
    // Group data by month
    const monthlyData = {};
    data.forEach(item => {
        const monthYear = formatYearMonth(item.date);
        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = {
                users: new Set(),
                amount: 0
            };
        }
        monthlyData[monthYear].users.add(item.email);
        monthlyData[monthYear].amount += item.amount;
    });

    const labels = Object.keys(monthlyData).sort();
    const userData = labels.map(month => monthlyData[month].users.size);
    const amountData = labels.map(month => monthlyData[month].amount);

    if (momChart) {
        momChart.data.labels = labels;
        momChart.data.datasets[0].data = userData;
        momChart.data.datasets[1].data = amountData;
        momChart.update();
    }
}

function formatCurrency(amount) {
    // Round up to the nearest integer
    const roundedAmount = Math.ceil(amount);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0, // Remove decimal places
        minimumFractionDigits: 0
    }).format(roundedAmount);
}

function initializeModalHandlers() {
    const modal = document.getElementById('chartModal');
    const closeBtn = document.querySelector('.close-modal');

    // Close modal when clicking the close button
    closeBtn.onclick = function () {
        modal.style.display = "none";
        if (modalChart) {
            modalChart.destroy();
            modalChart = null;
        }
    }

    // Close modal when clicking outside the modal content
    window.onclick = function (event) {
        if (event.target === modal) {
            modal.style.display = "none";
            if (modalChart) {
                modalChart.destroy();
                modalChart = null;
            }
        }
    }

    // Add click handlers to all chart containers
    document.querySelectorAll('.metrics-chart').forEach(chartContainer => {
        chartContainer.onclick = function () {
            const canvasId = chartContainer.querySelector('canvas').id;
            enlargeChart(canvasId);
        };
    });
}

function enlargeChart(sourceChartId) {
    console.log('Enlarging chart:', sourceChartId);

    const modal = document.getElementById('chartModal');
    const modalCanvas = document.getElementById('modalChart');
    const sourceChart = Chart.getChart(sourceChartId);

    if (!sourceChart) {
        console.error('Source chart not found');
        return;
    }

    console.log('Source chart data:', sourceChart.data);
    console.log('Source chart options:', sourceChart.options);

    // Destroy previous modal chart if it exists
    if (modalChart) {
        console.log('Destroying previous modal chart');
        modalChart.destroy();
    }

    // Show the modal
    modal.style.display = "block";

    // Clone the source chart configuration and data
    const newConfig = {
        type: sourceChart.config.type,
        data: JSON.parse(JSON.stringify(sourceChart.data)),
        options: {
            maintainAspectRatio: false,
            responsive: true,
            layout: {
                padding: {
                    top: 40,
                    bottom: 40,
                    left: 20,
                    right: 20
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: sourceChart.options.plugins.title.text,
                    font: {
                        size: 24,
                        weight: 'bold'
                    }
                },
                subtitle: sourceChart.options.plugins.subtitle ? {
                    display: true,
                    text: sourceChart.options.plugins.subtitle.text,
                    font: {
                        size: 16
                    }
                } : undefined,
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 5,
                    formatter: Math.round,
                    font: {
                        size: 14,
                        weight: 'bold'
                    },
                    padding: 6
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 5,
                        font: {
                            size: 14
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: sourceChart.options.scales.y.title.text,
                        font: {
                            size: 16
                        }
                    },
                    ticks: {
                        font: {
                            size: 14
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    };

    console.log('New chart config:', newConfig);

    // Create the new chart
    modalChart = new Chart(modalCanvas, newConfig);
    console.log('Modal chart created:', modalChart);
}

function initializeMobileHandlers() {
    // Handle pull-to-refresh
    let pullStartY = 0;
    let pullEndY = 0;
    const dashboard = document.querySelector('.dashboard');

    document.addEventListener('touchstart', function (e) {
        pullStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        pullEndY = e.touches[0].clientY;

        // If pulled down at the top of the page
        if (window.scrollY === 0 && pullEndY > pullStartY) {
            dashboard.classList.add('refreshing');
        }
    }, { passive: true });

    document.addEventListener('touchend', function () {
        if (window.scrollY === 0 && pullEndY > pullStartY + 100) {
            // Refresh dashboard data
            filterAndUpdateDashboard();
        }
        dashboard.classList.remove('refreshing');
        pullStartY = 0;
        pullEndY = 0;
    }, { passive: true });

    // Optimize chart interactions for touch devices
    if ('ontouchstart' in window) {
        const chartOptions = {
            onHover: null,
            onClick: null,
            plugins: {
                tooltip: {
                    enabled: true,
                    intersect: false,
                    mode: 'index'
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        };

        // Apply touch-optimized options to all charts
        [uniqueUsersChart, returningUsersChart, returningUsersPercentageChart,
            totalAmountChart, avgVisitsChart, firstTimeUsersChart].forEach(chart => {
                if (chart) {
                    Object.assign(chart.options, chartOptions);
                    chart.update();
                }
            });
    }

    // Add double-tap to zoom for charts
    let lastTap = 0;
    document.querySelectorAll('.metrics-chart').forEach(chart => {
        chart.addEventListener('touchend', function (e) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;

            if (tapLength < 500 && tapLength > 0) {
                // Double tap detected
                e.preventDefault();
                const canvasId = this.querySelector('canvas').id;
                enlargeChart(canvasId);
            }
            lastTap = currentTime;
        });
    });

    // Optimize modal for mobile
    const modal = document.getElementById('chartModal');
    let modalTouchStartX = 0;
    let modalTouchStartY = 0;

    modal.addEventListener('touchstart', function (e) {
        modalTouchStartX = e.touches[0].clientX;
        modalTouchStartY = e.touches[0].clientY;
    }, { passive: true });

    modal.addEventListener('touchmove', function (e) {
        if (!modal.style.display === 'block') return;

        const touchEndX = e.touches[0].clientX;
        const touchEndY = e.touches[0].clientY;
        const deltaX = modalTouchStartX - touchEndX;
        const deltaY = modalTouchStartY - touchEndY;

        // If swiped down
        if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -50) {
            modal.style.display = 'none';
            if (modalChart) {
                modalChart.destroy();
                modalChart = null;
            }
        }
    }, { passive: true });
}

function initializeBusinessSearch() {
    const searchInput = document.getElementById('businessSearch');
    const optionsContainer = document.getElementById('businessOptions');
    let businesses = new Set();

    // Get unique businesses from transaction data
    transactionData.forEach(item => {
        const businessName = extractBusinessName(item.merchant);
        businesses.add(businessName);
    });

    // Convert to sorted array
    const sortedBusinesses = Array.from(businesses).sort();

    // Function to filter businesses
    function filterBusinesses(searchTerm) {
        console.log('Filtering businesses with term:', searchTerm);
        console.log('Available businesses:', sortedBusinesses);

        const normalizedTerm = searchTerm.toLowerCase();
        const filteredBusinesses = sortedBusinesses.filter(business =>
            business.toLowerCase().includes(normalizedTerm)
        );

        console.log('Filtered businesses:', filteredBusinesses);

        // Update options container
        optionsContainer.innerHTML = '';

        // Add "All Businesses" option first
        const allOption = document.createElement('div');
        allOption.className = 'option' + (selectedBusiness === 'all' ? ' selected' : '');
        allOption.dataset.value = 'all';
        allOption.textContent = 'All Businesses';
        allOption.addEventListener('click', () => selectBusiness('all'));
        optionsContainer.appendChild(allOption);

        if (filteredBusinesses.length > 0) {
            filteredBusinesses.forEach(business => {
                const option = document.createElement('div');
                option.className = 'option' + (selectedBusiness === business ? ' selected' : '');
                option.dataset.value = business;
                option.textContent = business;
                option.addEventListener('click', () => selectBusiness(business));
                optionsContainer.appendChild(option);
            });
        } else if (searchTerm) {
            const noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'No matching businesses found';
            optionsContainer.appendChild(noResults);
        }

        optionsContainer.classList.add('show');
    }

    // Function to handle business selection
    function selectBusiness(business) {
        console.log('Selecting business:', business);
        selectedBusiness = business;
        searchInput.value = business === 'all' ? '' : business;
        optionsContainer.classList.remove('show');

        // Update UI
        document.querySelectorAll('#businessOptions .option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === business);
        });

        // Update location filter and refresh dashboard
        updateLocationFilter();
        filterAndUpdateDashboard();
    }

    // Add event listeners
    searchInput.addEventListener('input', (e) => {
        filterBusinesses(e.target.value);
    });

    searchInput.addEventListener('focus', () => {
        filterBusinesses(searchInput.value);
    });

    // Close options when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !optionsContainer.contains(e.target)) {
            optionsContainer.classList.remove('show');
        }
    });

    // Initialize with empty search
    filterBusinesses('');
}

// Function to load pre-built data
function loadPrebuiltData() {
    if (!isAuthenticated()) {
        console.error('Authentication required');
        return;
    }

    console.log('Loading data...');
    fetch('Transactions.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load data');
            }
            return response.text();
        })
        .then(csvText => {
            console.log('Data loaded successfully');
            processData(csvText);
        })
        .catch(error => {
            console.error('Error loading data:', error);
        });
}

// Helper function to mask sensitive data
function maskEmail(email) {
    if (!email) return '';
    const [username, domain] = email.split('@');
    if (!domain) return email;
    return `${username.charAt(0)}${'*'.repeat(username.length - 2)}${username.charAt(username.length - 1)}@${domain}`;
}

function maskBusinessName(name) {
    if (!name) return '';
    const parts = name.split('-');
    if (parts.length > 1) {
        // Keep location part visible but mask business name
        const business = parts.slice(0, -1).join('-');
        const location = parts[parts.length - 1];
        return `${'*'.repeat(Math.max(business.length - 4, 4))}-${location.trim()}`;
    }
    return '*'.repeat(Math.max(name.length - 4, 4));
}

/**
 * Function to handle downloading CSV data from the API
 */
async function handleCsvDownload() {
    try {
        // Show loader or button loading state
        const downloadBtn = document.getElementById('downloadCsvBtn');
        const originalText = downloadBtn.textContent;
        downloadBtn.textContent = 'Descargando...';
        downloadBtn.disabled = true;

        // Fetch CSV data from API
        const csvData = await fetchCsvData();

        // Process the CSV data
        processData(csvData);
        filterAndUpdateDashboard();

        // Restore button state
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;

    } catch (error) {
        console.error('Error downloading CSV data:', error);
        alert(`Error descargando datos: ${error.message}`);

        // Restore button state on error
        const downloadBtn = document.getElementById('downloadCsvBtn');
        downloadBtn.textContent = 'Descargar datos CSV';
        downloadBtn.disabled = false;
    }
}

/**
 * Function to load data from API on page load
 */
async function loadDataFromApi() {
    try {
        console.log('Loading data from API...');

        // Fetch CSV data from API
        const csvData = await fetchCsvData();

        // Process the CSV data
        processData(csvData);
        filterAndUpdateDashboard();

        console.log('Data loaded successfully from API');
    } catch (error) {
        console.error('Error loading data from API:', error);
    }
}