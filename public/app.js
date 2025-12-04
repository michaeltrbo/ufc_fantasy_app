// ==================== AUTHENTICATION STATE MANAGEMENT ====================
let currentUser = null;

// Load user from localStorage on page load
function loadUser() {
    const userStr = localStorage.getItem('ufc_user');
    if (userStr) {
        currentUser = JSON.parse(userStr);
        updateUIForAuth();
    } else {
        showLoginSection();
    }
}

// Save user to localStorage
function saveUser(user) {
    currentUser = user;
    localStorage.setItem('ufc_user', JSON.stringify(user));
    updateUIForAuth();
}

// Clear user from localStorage
function clearUser() {
    currentUser = null;
    localStorage.removeItem('ufc_user');
    updateUIForAuth(); // <--- This handles EVERYTHING (hides dashboard, shows login, resets nav)
}

// Update UI based on authentication state
function updateUIForAuth() {
    const navbar = document.getElementById('navbar');
    const navAuth = document.getElementById('navAuth');
    const loginSection = document.getElementById('login-section');
    const dashboard = document.getElementById('dashboard');
    const registerSection = document.getElementById('register');

    if (currentUser) {
        // User is logged in
        loginSection.style.display = 'none';
        registerSection.style.display = 'none';
        dashboard.style.display = 'block';
        navAuth.innerHTML = `
            <span style="margin-right: 15px;">Welcome, <strong>${escapeHtml(currentUser.username)}</strong></span>
            <button class="btn btn-secondary" id="logoutBtn">Logout</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        loadUserLeagues();
    } else {
        // User is logged out
        dashboard.style.display = 'none';
        loginSection.style.display = 'block';
        registerSection.style.display = 'none';
        navAuth.innerHTML = '<button class="btn btn-secondary" id="loginBtn">Login</button>';
    }
}

function showLoginSection() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('register').style.display = 'none';
}

function showRegisterSection() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register').style.display = 'block';
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    loadUser();
    setupEventListeners();
});

function setupEventListeners() {
    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    // Form submissions
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('joinLeagueForm').addEventListener('submit', handleJoinLeague);
    document.getElementById('createLeagueForm').addEventListener('submit', handleCreateLeague);
    document.getElementById('leaderboardForm').addEventListener('submit', handleLeaderboard);
    document.getElementById('fighterHistoryForm').addEventListener('submit', handleFighterHistory);

    // Links
    document.getElementById('showRegisterLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterSection();
    });
    document.getElementById('showLoginLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginSection();
    });

    // Make picks
    document.getElementById('loadFightsBtn').addEventListener('click', loadFightsForPicks);
    document.getElementById('savePicksBtn').addEventListener('click', savePicks);

    // Modals
    setupModals();

    // Load events for picks dropdown
    if (currentUser) {
        loadEvents();
    }
}

function switchTab(tabName) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(tabName);

    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    clearResults();

    // Load data when switching to specific tabs
    if (tabName === 'my-leagues' && currentUser) {
        loadUserLeagues();
    } else if (tabName === 'make-picks' && currentUser) {
        loadUserLeaguesForPicks();
        loadEvents();
    } else if (tabName === 'leaderboard' && currentUser) {
        loadUserLeaguesForLeaderboard();
    }
}

function setupModals() {
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close-modal');

    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modals.forEach(modal => modal.style.display = 'none');
        });
    });

    window.addEventListener('click', (e) => {
        modals.forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

// ==================== AUTHENTICATION ====================
async function handleLogin(e) {
    e.preventDefault();
    const resultDiv = document.getElementById('loginResult');
    resultDiv.innerHTML = '<p class="loading">Logging in...</p>';

    const formData = {
        username: document.getElementById('loginUsername').value,
        password: document.getElementById('loginPassword').value
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            saveUser({ userId: data.userId, username: data.username, email: data.email });
            resultDiv.innerHTML = '<p class="success">✅ Login successful! Redirecting...</p>';
            document.getElementById('loginForm').reset();
        } else {
            resultDiv.innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        clearUser();
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const resultDiv = document.getElementById('registerResult');
    resultDiv.innerHTML = '<p class="loading">Registering user...</p>';

    const formData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            resultDiv.innerHTML = `<p class="success">✅ ${data.message}<br>User ID: ${data.userId}</p>`;
            document.getElementById('registerForm').reset();
            setTimeout(() => {
                showLoginSection();
            }, 2000);
        } else {
            resultDiv.innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

// ==================== LEAGUE MANAGEMENT ====================
async function loadUserLeagues() {
    if (!currentUser) return;

    try {
        const response = await fetch(`/api/user-leagues/${currentUser.userId}`);
        const data = await response.json();

        if (data.success) {
            displayUserLeagues(data.data);
        }
    } catch (error) {
        console.error('Error loading user leagues:', error);
    }
}

function displayUserLeagues(leagues) {
    const container = document.getElementById('myLeaguesList');
    
    if (leagues.length === 0) {
        container.innerHTML = '<p class="info">You are not a member of any leagues yet. Create one or join one!</p>';
        return;
    }

    let html = '<div class="leagues-grid">';
    leagues.forEach(league => {
        html += `
            <div class="league-card">
                <h3>${escapeHtml(league.Name)}</h3>
                <p><strong>Code:</strong> <span class="league-code">${escapeHtml(league.LeagueCode)}</span></p>
                <p><strong>Role:</strong> ${escapeHtml(league.Role)}</p>
                <p><strong>Joined:</strong> ${formatDate(league.JoinDate)}</p>
                <button class="btn btn-primary" onclick="viewLeagueDetails(${league.LeagueID})">View Details</button>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

async function viewLeagueDetails(leagueId) {
    try {
        const [leagueRes, membersRes] = await Promise.all([
            fetch(`/api/league/${leagueId}`),
            fetch(`/api/league-members/${leagueId}`)
        ]);

        const leagueData = await leagueRes.json();
        const membersData = await membersRes.json();

        if (leagueData.success && membersData.success) {
            const modal = document.getElementById('leagueDetailsModal');
            document.getElementById('modalLeagueName').textContent = leagueData.data.Name;
            document.getElementById('modalLeagueCode').innerHTML = `
                <div class="league-code-display">
                    <strong>League Code:</strong> 
                    <span class="league-code-large">${escapeHtml(leagueData.data.LeagueCode)}</span>
                    <button class="btn btn-secondary" onclick="copyLeagueCode('${escapeHtml(leagueData.data.LeagueCode)}')">Copy</button>
                </div>
            `;

            // Display members
            let membersHtml = '<table class="data-table"><thead><tr><th>Username</th><th>Role</th><th>Points</th><th>Actions</th></tr></thead><tbody>';
            membersData.data.forEach(member => {
                membersHtml += `
                    <tr>
                        <td>${escapeHtml(member.Username)}</td>
                        <td>${escapeHtml(member.Role)}</td>
                        <td>${member.TotalPoints}</td>
                        <td>
                            <button class="btn btn-small" onclick="viewUserPicks(${member.UserID}, ${leagueId})">View Picks</button>
                        </td>
                    </tr>
                `;
            });
            membersHtml += '</tbody></table>';
            document.getElementById('modalLeagueMembers').innerHTML = membersHtml;

            modal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading league details:', error);
        alert('Error loading league details');
    }
}

// Updated to accept username for better UX
async function viewUserPicks(userId, leagueId, username = 'User') {
    try {
        // Use the route we already fixed
        const picksRes = await fetch(`/api/user-picks/${userId}/${leagueId}`);
        const picksData = await picksRes.json();

        if (picksData.success) {
            const modal = document.getElementById('viewPicksModal');
            
            // Dynamic Title
            const isMe = currentUser && String(userId) === String(currentUser.userId);
            document.getElementById('modalPicksTitle').textContent = isMe ? 'My Picks' : `Picks for ${username}`;
            
            const contentDiv = document.getElementById('modalPicksContent');

            if (picksData.data.length === 0) {
                contentDiv.innerHTML = '<p class="info">No picks made by this user yet.</p>';
            } else {
                // 1. Group Picks by Event Name
                const picksByEvent = {};
                picksData.data.forEach(pick => {
                    if (!picksByEvent[pick.EventName]) {
                        picksByEvent[pick.EventName] = {
                            date: pick.EventDate,
                            picks: []
                        };
                    }
                    picksByEvent[pick.EventName].picks.push(pick);
                });

                // 2. Build HTML (Accordion Style)
                let html = '<div class="events-list">';
                
                for (const [eventName, eventData] of Object.entries(picksByEvent)) {
                    html += `
                        <div class="event-item">
                            <div class="event-header" onclick="toggleEventDetails(this)">
                                <span class="event-title">📅 ${escapeHtml(eventName)}</span>
                                <span class="event-arrow">▼</span>
                            </div>
                            <div class="event-picks" style="display: none;">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Fighter Picked</th>
                                            <th>Weight Class</th>
                                            <th>Points</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                    `;

                    eventData.picks.forEach(pick => {
                        // Make row clickable for stats
                        html += `
                            <tr class="clickable-row" onclick="showFightStats('${escapeHtml(pick.FighterName)}', '${escapeHtml(eventName)}')">
                                <td><strong>${escapeHtml(pick.FighterName)}</strong></td>
                                <td>${escapeHtml(pick.WeightClass)}</td>
                                <td class="points">${pick.PointsEarned}</td>
                            </tr>
                        `;
                    });

                    html += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }
                html += '</div>';
                contentDiv.innerHTML = html;
            }
            modal.style.display = 'block';
        } else {
            alert('Failed to load picks: ' + picksData.error);
        }
    } catch (error) {
        console.error('Error loading user picks:', error);
        alert('Error loading user picks');
    }
}

// Helper: Toggle the accordion
function toggleEventDetails(headerElement) {
    const picksDiv = headerElement.nextElementSibling;
    const arrow = headerElement.querySelector('.event-arrow');
    
    if (picksDiv.style.display === 'none') {
        picksDiv.style.display = 'block';
        arrow.textContent = '▲';
        headerElement.classList.add('active');
    } else {
        picksDiv.style.display = 'none';
        arrow.textContent = '▼';
        headerElement.classList.remove('active');
    }
}

// Helper: Show the stats popup
function showFightStats(fighterName, eventName) {
    const modal = document.getElementById('fightStatsModal');
    document.getElementById('statsTitle').textContent = `Match Stats: ${fighterName}`;
    
    document.getElementById('statsContent').innerHTML = `
        <div class="stats-box">
            <p><strong>Event:</strong> ${eventName}</p>
            <p><strong>Fighter:</strong> ${fighterName}</p>
            <hr>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="label">Strikes Landed</span>
                    <span class="value">--</span>
                </div>
                <div class="stat-item">
                    <span class="label">Takedowns</span>
                    <span class="value">--</span>
                </div>
                <div class="stat-item">
                    <span class="label">Control Time</span>
                    <span class="value">--:--</span>
                </div>
                <div class="stat-item">
                    <span class="label">Knockdowns</span>
                    <span class="value">--</span>
                </div>
            </div>
            <p class="note"><i>* Detailed fight statistics are not yet available for this match.</i></p>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // Handle close button specifically for this modal
    document.getElementById('closeStatsModal').onclick = function() {
        modal.style.display = 'none';
    }
}

// Expose functions globally
window.toggleEventDetails = toggleEventDetails;
window.showFightStats = showFightStats;

function copyLeagueCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        alert('League code copied to clipboard!');
    });
}

async function handleJoinLeague(e) {
    e.preventDefault();
    if (!currentUser) return;

    const resultDiv = document.getElementById('joinLeagueResult');
    resultDiv.innerHTML = '<p class="loading">Joining league...</p>';

    const formData = {
        leagueCode: document.getElementById('leagueCodeInput').value,
        userId: currentUser.userId
    };

    try {
        const response = await fetch('/api/join-league', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            resultDiv.innerHTML = `<p class="success">✅ ${data.message}</p>`;
            document.getElementById('joinLeagueForm').reset();
            loadUserLeagues();
            setTimeout(() => switchTab('my-leagues'), 1500);
        } else {
            resultDiv.innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

async function handleCreateLeague(e) {
    e.preventDefault();
    if (!currentUser) return;

    const resultDiv = document.getElementById('createLeagueResult');
    resultDiv.innerHTML = '<p class="loading">Creating league...</p>';

    const formData = {
        name: document.getElementById('leagueName').value,
        ownerID: currentUser.userId,
        scoringRules: document.getElementById('scoringRules').value || null,
        leagueCode: document.getElementById('leagueCode').value || null
    };

    try {
        const response = await fetch('/api/league/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            resultDiv.innerHTML = `<p class="success">✅ ${data.message}<br>League ID: ${data.leagueId}<br>League Code: ${data.leagueCode}</p>`;
            document.getElementById('createLeagueForm').reset();
            loadUserLeagues();
            setTimeout(() => switchTab('my-leagues'), 1500);
        } else {
            resultDiv.innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

// ==================== MAKING PICKS ====================
async function loadUserLeaguesForPicks() {
    if (!currentUser) return;

    try {
        const response = await fetch(`/api/user-leagues/${currentUser.userId}`);
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('picksLeagueSelect');
            select.innerHTML = '<option value="">-- Select a League --</option>';
            data.data.forEach(league => {
                select.innerHTML += `<option value="${league.LeagueID}">${escapeHtml(league.Name)}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading leagues:', error);
    }
}

async function loadEvents() {
    try {
        const response = await fetch('/api/events');
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('picksEventSelect');
            select.innerHTML = '<option value="">-- Select an Event --</option>';
            data.data.forEach(event => {
                select.innerHTML += `<option value="${event.EventID}">${escapeHtml(event.Name)} - ${formatDate(event.Date)}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading events:', error);
    }
}

// Fixed: Generates unique radio group names even if IDs are messy
async function loadFightsForPicks() {
    const leagueId = document.getElementById('picksLeagueSelect').value;
    const eventId = document.getElementById('picksEventSelect').value;

    if (!leagueId || !eventId) {
        document.getElementById('picksResult').innerHTML = '<p class="error">Please select both a league and an event.</p>';
        return;
    }

    document.getElementById('picksResult').innerHTML = '<p class="loading">Loading fights...</p>';

    try {
        const response = await fetch(`/api/event/${eventId}/fights`);
        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('fightsContainer');
            const saveContainer = document.getElementById('savePicksContainer');

            if (data.data.length === 0) {
                container.innerHTML = '<p class="info">No fights found for this event.</p>';
                saveContainer.style.display = 'none';
                return;
            }

            let html = '<h3>Select Your Picks</h3>';
            
            // Use index 'i' to guarantee unique group names
            data.data.forEach((fight, i) => {
                // Fallback ID if FightID is missing
                const safeFightID = fight.FightID || `fight_index_${i}`;
                
                html += `
                    <div class="fight-pick-card">
                        <h4>${escapeHtml(fight.FighterAName)} vs ${escapeHtml(fight.FighterBName)}</h4>
                        <p class="fight-info">${escapeHtml(fight.WeightClass || 'N/A')}</p>
                        <div class="pick-options">
                            <label class="pick-option">
                                <input type="radio" name="fight_group_${i}" value="${fight.FighterA_ID}" data-fight-id="${safeFightID}">
                                <span>${escapeHtml(fight.FighterAName)} (${escapeHtml(fight.FighterARecord || 'N/A')})</span>
                            </label>
                            <label class="pick-option">
                                <input type="radio" name="fight_group_${i}" value="${fight.FighterB_ID}" data-fight-id="${safeFightID}">
                                <span>${escapeHtml(fight.FighterBName)} (${escapeHtml(fight.FighterBRecord || 'N/A')})</span>
                            </label>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
            saveContainer.style.display = 'block';
            saveContainer.setAttribute('data-league-id', leagueId);
            saveContainer.setAttribute('data-event-id', eventId);
            document.getElementById('picksResult').innerHTML = '';
        } else {
            document.getElementById('picksResult').innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        document.getElementById('picksResult').innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

function displayFightsForPicks(fights, leagueId, eventId) {
    const container = document.getElementById('fightsContainer');
    const saveContainer = document.getElementById('savePicksContainer');

    if (fights.length === 0) {
        container.innerHTML = '<p class="info">No fights found for this event.</p>';
        saveContainer.style.display = 'none';
        return;
    }

    let html = '<h3>Select Your Picks</h3>';
    fights.forEach(fight => {
        html += `
            <div class="fight-pick-card">
                <h4>${escapeHtml(fight.FighterAName)} vs ${escapeHtml(fight.FighterBName)}</h4>
                <p class="fight-info">${escapeHtml(fight.WeightClass || 'N/A')}</p>
                <div class="pick-options">
                    <label class="pick-option">
                        <input type="radio" name="fight_${fight.FightID}" value="${fight.FighterA_ID}" data-fight-id="${fight.FightID}">
                        <span>${escapeHtml(fight.FighterAName)} (${escapeHtml(fight.FighterARecord || 'N/A')})</span>
                    </label>
                    <label class="pick-option">
                        <input type="radio" name="fight_${fight.FightID}" value="${fight.FighterB_ID}" data-fight-id="${fight.FightID}">
                        <span>${escapeHtml(fight.FighterBName)} (${escapeHtml(fight.FighterBRecord || 'N/A')})</span>
                    </label>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    saveContainer.style.display = 'block';
    saveContainer.setAttribute('data-league-id', leagueId);
    saveContainer.setAttribute('data-event-id', eventId);
    document.getElementById('picksResult').innerHTML = '';
}

// Fixed: Removes parseInt to support string/UUID IDs
async function savePicks() {
    if (!currentUser) return;

    const container = document.getElementById('savePicksContainer');
    const leagueId = container.getAttribute('data-league-id');
    const eventId = container.getAttribute('data-event-id');

    if (!leagueId || !eventId) {
        alert('Please load fights first');
        return;
    }

    // Collect all picks
    const picks = [];
    const radioButtons = document.querySelectorAll('input[type="radio"]:checked');
    
    radioButtons.forEach(radio => {
        picks.push({
            // DO NOT use parseInt here. Keep them as strings.
            fightId: radio.getAttribute('data-fight-id'),
            fighterId: radio.value
        });
    });

    if (picks.length === 0) {
        alert('Please select at least one pick');
        return;
    }

    document.getElementById('picksResult').innerHTML = '<p class="loading">Saving picks...</p>';

    try {
        const response = await fetch('/api/save-picks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.userId,
                // Keep IDs as strings
                leagueId: leagueId,
                eventId: eventId,
                picks: picks
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('picksResult').innerHTML = `<p class="success">✅ ${data.message}</p>`;
        } else {
            document.getElementById('picksResult').innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        document.getElementById('picksResult').innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

// ==================== LEADERBOARD ====================
async function loadUserLeaguesForLeaderboard() {
    if (!currentUser) return;

    try {
        const response = await fetch(`/api/user-leagues/${currentUser.userId}`);
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('leaderboardLeagueSelect');
            select.innerHTML = '<option value="">-- Select a League --</option>';
            data.data.forEach(league => {
                select.innerHTML += `<option value="${league.LeagueID}">${escapeHtml(league.Name)}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading leagues:', error);
    }
}

async function handleLeaderboard(e) {
    e.preventDefault();
    const leagueId = document.getElementById('leaderboardLeagueSelect').value;
    const resultDiv = document.getElementById('leaderboardResult');
    const tableDiv = document.getElementById('leaderboardTable');
    
    if (!leagueId) {
        alert("Please select a league first.");
        return;
    }

    resultDiv.innerHTML = '<p class="loading">Loading leaderboard...</p>';
    tableDiv.innerHTML = '';

    try {
        const response = await fetch(`/api/leaderboard/${leagueId}`);
        const data = await response.json();

        if (data.success) {
            if (data.data.length === 0) {
                resultDiv.innerHTML = '<p class="info">ℹ️ No members found in this league.</p>';
            } else {
                resultDiv.innerHTML = `<p class="success">✅ Leaderboard loaded (${data.data.length} members)</p>`;
                
                let tableHTML = `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Username</th>
                                <th>Total Points</th>
                                <th>Actions</th> </tr>
                        </thead>
                        <tbody>`;

                data.data.forEach((user, index) => {
                    // Highlight the current user
                    const isMe = currentUser && user.UserID === currentUser.userId;
                    const rowClass = isMe ? 'style="background-color: rgba(99, 102, 241, 0.1);"' : '';
                    
                    tableHTML += `
                        <tr ${rowClass}>
                            <td>#${index + 1}</td>
                            <td>
                                ${escapeHtml(user.Username)} 
                                ${isMe ? '<span style="font-size:0.8em; color:var(--accent-primary)">(You)</span>' : ''}
                            </td>
                            <td class="points">${user.TotalPoints}</td>
                            <td>
                                <button class="btn btn-small btn-secondary" 
                                    onclick="viewUserPicks(${user.UserID}, ${leagueId}, '${escapeHtml(user.Username)}')">
                                    View Picks
                                </button>
                            </td>
                        </tr>`;
                });

                tableHTML += '</tbody></table>';
                tableDiv.innerHTML = tableHTML;
            }
        } else {
            resultDiv.innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

// ==================== FIGHTER HISTORY ====================
async function handleFighterHistory(e) {
    e.preventDefault();
    const resultDiv = document.getElementById('fighterHistoryResult');
    const tableDiv = document.getElementById('fighterHistoryTable');
    resultDiv.innerHTML = '<p class="loading">Searching fighter history...</p>';
    tableDiv.innerHTML = '';

    const fighterName = document.getElementById('fighterName').value;

    try {
        const response = await fetch(`/api/fighter/history?name=${encodeURIComponent(fighterName)}`);
        const data = await response.json();

        if (data.success) {
            if (data.data.length === 0) {
                resultDiv.innerHTML = `<p class="info">ℹ️ ${data.message || 'No fight history found for this fighter.'}</p>`;
                tableDiv.innerHTML = '';
            } else {
                const fighterInfo = data.fighters.length > 0 
                    ? `Found ${data.fighters.length} fighter(s): ${data.fighters.map(f => f.Name).join(', ')}`
                    : '';
                resultDiv.innerHTML = `<p class="success">✅ Found ${data.data.length} fight(s) ${fighterInfo ? '<br>' + fighterInfo : ''}</p>`;
                
                let tableHTML = '<table class="data-table"><thead><tr>';
                tableHTML += '<th>Event Name</th><th>Date</th><th>Location</th><th>Opponent</th><th>Result</th><th>Method</th><th>Round</th>';
                tableHTML += '</tr></thead><tbody>';

                data.data.forEach(fight => {
                    tableHTML += '<tr>';
                    tableHTML += `<td>${escapeHtml(fight.EventName || 'N/A')}</td>`;
                    tableHTML += `<td>${formatDate(fight.EventDate)}</td>`;
                    tableHTML += `<td>${escapeHtml(fight.Location || 'N/A')}</td>`;
                    tableHTML += `<td>${escapeHtml(fight.Opponent || 'N/A')}</td>`;
                    tableHTML += `<td class="result-${fight.Result.toLowerCase()}">${fight.Result || 'Pending'}</td>`;
                    tableHTML += `<td>${escapeHtml(fight.Method || 'N/A')}</td>`;
                    tableHTML += `<td>${fight.Round || 'N/A'}</td>`;
                    tableHTML += '</tr>';
                });

                tableHTML += '</tbody></table>';
                tableDiv.innerHTML = tableHTML;
            }
        } else {
            resultDiv.innerHTML = `<p class="error">❌ ${data.error}</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

// ==================== UTILITY FUNCTIONS ====================
function clearResults() {
    document.querySelectorAll('.result').forEach(el => el.innerHTML = '');
    document.querySelectorAll('.table-container').forEach(el => el.innerHTML = '');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return dateString;
    }
}

// Make functions available globally for onclick handlers
window.viewLeagueDetails = viewLeagueDetails;
window.viewUserPicks = viewUserPicks;
window.copyLeagueCode = copyLeagueCode;
