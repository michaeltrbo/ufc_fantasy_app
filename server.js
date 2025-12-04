require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
// Ensure PORT is not MySQL port (3306) - default to 3000 for HTTP server
let PORT = parseInt(process.env.PORT) || 3000;
if (PORT === 3306) {
    console.warn('⚠️  PORT is set to 3306 (MySQL port). Using 3000 instead.');
    PORT = 3000;
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ufc_fantasy_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Database initialization - check and fix AUTO_INCREMENT
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
        
        // Fix all INT primary keys that should have AUTO_INCREMENT
        // Note: Using lowercase table names to match actual database
        const tablesToFix = [
            { table: 'user', column: 'UserID' },
            { table: 'league', column: 'LeagueID' },
            { table: 'pick', column: 'PickID' }
        ];
        
        for (const { table, column } of tablesToFix) {
            const [columns] = await connection.execute(
                `SELECT COLUMN_NAME, DATA_TYPE, EXTRA 
                 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = ? 
                 AND TABLE_NAME = ? 
                 AND COLUMN_NAME = ?`,
                [process.env.DB_NAME || 'ufc_fantasy_db', table, column]
            );
            
            if (columns.length > 0) {
                const col = columns[0];
                if (col.DATA_TYPE === 'int' && (!col.EXTRA || !col.EXTRA.includes('auto_increment'))) {
                    console.log(`⚠️  ${table}.${column} missing AUTO_INCREMENT. Attempting to fix...`);
                    try {
                        // Temporarily disable foreign key checks to allow column modification
                        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
                        await connection.execute(`ALTER TABLE ${table} MODIFY ${column} INT AUTO_INCREMENT`);
                        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
                        console.log(`✅ Fixed ${table}.${column} AUTO_INCREMENT`);
                    } catch (alterError) {
                        // Re-enable foreign key checks in case of error
                        await connection.execute('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
                        console.warn(`⚠️  Could not automatically fix ${table}.${column} AUTO_INCREMENT:`, alterError.message);
                        console.warn(`   This is not critical - the server will still work.`);
                        console.warn(`   To fix manually, run: ALTER TABLE ${table} MODIFY ${column} INT AUTO_INCREMENT;`);
                    }
                }
            }
        }
        
        connection.release();
    } catch (error) {
        console.warn('⚠️  Database initialization warning:', error.message);
        console.warn('   Server will continue to run. Some features may require manual database setup.');
    }
}

// Test database connection and initialize (non-blocking)
pool.getConnection()
    .then(async (connection) => {
        console.log('✅ Database connected successfully!');
        connection.release();
        // Run initialization in background - don't block server startup
        initializeDatabase().catch(err => {
            console.warn('⚠️  Database initialization completed with warnings (server still running)');
        });
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.message);
        console.error('   Server will start but database features will not work.');
    });

// ==================== API ROUTES ====================

// 1. Register User (INSERT) - Updated with password hashing
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Username, email, and password are required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        
        // Hash the password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        const [result] = await connection.execute(
            'INSERT INTO user (Username, Email, PasswordHash, RegistrationDate) VALUES (?, ?, ?, CURDATE())',
            [username, email, passwordHash]
        );
        connection.release();
        
        console.log(`✅ User registered: ${username} (ID: ${result.insertId})`);
        res.json({ 
            success: true, 
            message: 'User registered successfully',
            userId: result.insertId,
            username: username
        });
    } catch (error) {
        console.error('❌ Register user error:', error.message);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ 
                success: false, 
                error: 'Username or email already exists' 
            });
        } else if (error.code === 'ER_BAD_NULL_ERROR' || error.message.includes("doesn't have a default value") || error.message.includes('cannot be null')) {
            res.status(500).json({ 
                success: false, 
                error: 'Database configuration error: UserID column may not have AUTO_INCREMENT set. Please run: ALTER TABLE user MODIFY UserID INT AUTO_INCREMENT;' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
});

// 1b. Login User
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Username and password are required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        const [users] = await connection.execute(
            'SELECT UserID, Username, Email, PasswordHash FROM user WHERE Username = ?',
            [username]
        );
        connection.release();
        
        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid username or password' 
            });
        }
        
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.PasswordHash);
        
        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid username or password' 
            });
        }
        
        console.log(`✅ User logged in: ${username} (ID: ${user.UserID})`);
        res.json({ 
            success: true, 
            message: 'Login successful',
            userId: user.UserID,
            username: user.Username,
            email: user.Email
        });
    } catch (error) {
        console.error('❌ Login error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 2. Create League (INSERT)
app.post('/api/league/create', async (req, res) => {
    const { name, ownerID, scoringRules, leagueCode } = req.body;
    
    if (!name || !ownerID) {
        return res.status(400).json({ 
            success: false, 
            error: 'League name and OwnerID are required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        
        // Generate league code if not provided
        const finalLeagueCode = leagueCode || Math.random().toString(36).substring(2, 12).toUpperCase();
        
        const [result] = await connection.execute(
            'INSERT INTO league (Name, OwnerID, ScoringRules, CreationDate, LeagueCode) VALUES (?, ?, ?, CURDATE(), ?)',
            [name, ownerID, scoringRules || null, finalLeagueCode]
        );
        
        // Add owner as member with 'Owner' role
        await connection.execute(
            'INSERT INTO membership (UserID, LeagueID, JoinDate, Role) VALUES (?, ?, CURDATE(), ?)',
            [ownerID, result.insertId, 'Owner']
        );
        
        connection.release();
        
        console.log(`✅ League created: ${name} (ID: ${result.insertId}, Code: ${finalLeagueCode})`);
        res.json({ 
            success: true, 
            message: 'League created successfully',
            leagueId: result.insertId,
            leagueCode: finalLeagueCode
        });
    } catch (error) {
        console.error('❌ Create league error:', error.message);
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            res.status(400).json({ 
                success: false, 
                error: 'OwnerID does not exist' 
            });
        } else if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ 
                success: false, 
                error: 'League code already exists' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
});

// 3. Delete League (DELETE with FK constraint handling)
app.delete('/api/league/:leagueId', async (req, res) => {
    const leagueId = req.params.leagueId;
    
    if (!leagueId) {
        return res.status(400).json({ 
            success: false, 
            error: 'League ID is required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        
        // Check if league has members
        const [members] = await connection.execute(
            'SELECT COUNT(*) as count FROM membership WHERE LeagueID = ?',
            [leagueId]
        );
        
        if (members[0].count > 0) {
            connection.release();
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete league because it has members. Please remove all members first.' 
            });
        }
        
        // Check if league has picks
        const [picks] = await connection.execute(
            'SELECT COUNT(*) as count FROM pick WHERE LeagueID = ?',
            [leagueId]
        );
        
        if (picks[0].count > 0) {
            connection.release();
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete league because it has picks. Please remove all picks first.' 
            });
        }
        
        // Delete the league
        const [result] = await connection.execute(
            'DELETE FROM league WHERE LeagueID = ?',
            [leagueId]
        );
        
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'League not found' 
            });
        }
        
        console.log(`✅ League deleted: ID ${leagueId}`);
        res.json({ 
            success: true, 
            message: 'League deleted successfully' 
        });
    } catch (error) {
        console.error('❌ Delete league error:', error.message);
        
        // Handle foreign key constraint errors
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2') {
            res.status(400).json({ 
                success: false, 
                error: 'Cannot delete league because it has associated records (members or picks). Please remove all associated data first.' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
});

// 4. League Leaderboard (Complex SELECT with JOINs)
app.get('/api/leaderboard/:leagueId', async (req, res) => {
    const leagueId = req.params.leagueId;
    
    if (!leagueId) {
        return res.status(400).json({ 
            success: false, 
            error: 'League ID is required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        
        const [results] = await connection.execute(
            `SELECT 
                u.UserID,
                u.Username,
                u.Email,
                COALESCE(SUM(p.PointsEarned), 0) as TotalPoints
            FROM user u
            INNER JOIN membership m ON u.UserID = m.UserID
            LEFT JOIN pick p ON u.UserID = p.UserID AND p.LeagueID = ?
            WHERE m.LeagueID = ?
            GROUP BY u.UserID, u.Username, u.Email
            ORDER BY TotalPoints DESC, u.Username ASC`,
            [leagueId, leagueId]
        );
        
        connection.release();
        
        console.log(`✅ Leaderboard retrieved for League ID: ${leagueId}`);
        res.json({ 
            success: true, 
            data: results 
        });
    } catch (error) {
        console.error('❌ Leaderboard error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 5. Fighter History Lookup (Fixed: Correct Column Names for Dump Data)
app.get('/api/fighter/history', async (req, res) => {
    const fighterName = req.query.name;
    
    if (!fighterName) {
        return res.status(400).json({ success: false, error: 'Fighter name is required' });
    }

    try {
        const connection = await pool.getConnection();
        
        // 1. Find the fighter ID first (Using 'fighter_id' and 'name')
        const [fighters] = await connection.execute(
            'SELECT fighter_id, name FROM fighter WHERE name LIKE ?',
            [`%${fighterName}%`]
        );
        
        if (fighters.length === 0) {
            connection.release();
            return res.json({ success: true, data: [], message: 'No fighters found' });
        }

        // Get IDs of all matching fighters
        const fighterIds = fighters.map(f => f.fighter_id);
        const placeholders = fighterIds.map(() => '?').join(',');

        // 2. Find all fights involving these IDs
        // FIXED: Using 'event_name', 'red_fighter_id', 'blue_fighter_id', 'finish_round'
        const [results] = await connection.execute(
            `SELECT 
                f.fight_id,
                e.event_name as EventName,  -- Fixed from e.name
                e.date as EventDate,
                e.location,
                f.red_fighter_id,           -- Fixed from fighter_a_id
                f.blue_fighter_id,          -- Fixed from fighter_b_id
                fa.name as FighterAName,
                fb.name as FighterBName,
                f.winner_id,                -- Used to determine result
                f.method,
                f.finish_round as Round     -- Fixed from round
            FROM fight f
            JOIN event e ON f.event_id = e.event_id
            JOIN fighter fa ON f.red_fighter_id = fa.fighter_id
            JOIN fighter fb ON f.blue_fighter_id = fb.fighter_id
            WHERE f.red_fighter_id IN (${placeholders}) OR f.blue_fighter_id IN (${placeholders})
            ORDER BY e.date DESC`,
            [...fighterIds, ...fighterIds]
        );
        
        // 3. Process results to determine W/L relative to the searched fighter
        const processedResults = results.map(fight => {
            // Did the searched fighter match Red (A)?
            const isFighterA = fighterIds.includes(fight.red_fighter_id);
            
            let opponent = isFighterA ? fight.FighterBName : fight.FighterAName;
            let result = 'Pending';

            // Determine Win/Loss based on winner_id
            if (fight.winner_id) {
                const myId = isFighterA ? fight.red_fighter_id : fight.blue_fighter_id;
                if (fight.winner_id === myId) {
                    result = 'Win';
                } else if (fight.winner_id) {
                    result = 'Loss';
                }
            } else if (fight.method === 'Draw' || fight.method === 'No Contest') {
                result = fight.method;
            }
            
            return {
                EventName: fight.EventName,
                EventDate: fight.EventDate,
                Location: fight.location,
                Opponent: opponent,
                Result: result,
                Method: fight.method,
                Round: fight.Round
            };
        });
        
        connection.release();
        res.json({ 
            success: true, 
            data: processedResults,
            fighters: fighters 
        });

    } catch (error) {
        console.error('❌ Fighter history error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Diagnostic endpoint to check table structure
app.get('/api/diagnose', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        // Get all columns for event and fighter tables
        const [eventColumns] = await connection.execute(
            `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? 
             AND TABLE_NAME = 'event'
             ORDER BY ORDINAL_POSITION`,
            [process.env.DB_NAME || 'ufc_fantasy_db']
        );
        
        const [fighterColumns] = await connection.execute(
            `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? 
             AND TABLE_NAME = 'fighter'
             ORDER BY ORDINAL_POSITION`,
            [process.env.DB_NAME || 'ufc_fantasy_db']
        );
        
        const [fightColumns] = await connection.execute(
            `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? 
             AND TABLE_NAME = 'fight'
             ORDER BY ORDINAL_POSITION`,
            [process.env.DB_NAME || 'ufc_fantasy_db']
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'Table structure diagnostic',
            event_columns: eventColumns,
            fighter_columns: fighterColumns,
            fight_columns: fightColumns
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== NEW FEATURE ROUTES ====================

// Join League by LeagueCode
app.post('/api/join-league', async (req, res) => {
    const { leagueCode, userId } = req.body;
    
    if (!leagueCode || !userId) {
        return res.status(400).json({ 
            success: false, 
            error: 'League code and user ID are required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        
        // Find league by code
        const [leagues] = await connection.execute(
            'SELECT LeagueID, Name FROM league WHERE LeagueCode = ?',
            [leagueCode]
        );
        
        if (leagues.length === 0) {
            connection.release();
            return res.status(404).json({ 
                success: false, 
                error: 'Invalid league code' 
            });
        }
        
        const league = leagues[0];
        
        // Check if user is already a member
        const [existing] = await connection.execute(
            'SELECT * FROM membership WHERE UserID = ? AND LeagueID = ?',
            [userId, league.LeagueID]
        );
        
        if (existing.length > 0) {
            connection.release();
            return res.status(400).json({ 
                success: false, 
                error: 'You are already a member of this league' 
            });
        }
        
        // Add user to league
        await connection.execute(
            'INSERT INTO membership (UserID, LeagueID, JoinDate, Role) VALUES (?, ?, CURDATE(), ?)',
            [userId, league.LeagueID, 'Member']
        );
        
        connection.release();
        
        console.log(`✅ User ${userId} joined league: ${league.Name} (ID: ${league.LeagueID})`);
        res.json({ 
            success: true, 
            message: `Successfully joined league: ${league.Name}`,
            leagueId: league.LeagueID,
            leagueName: league.Name
        });
    } catch (error) {
        console.error('❌ Join league error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get user's leagues
app.get('/api/user-leagues/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const connection = await pool.getConnection();
        const [leagues] = await connection.execute(
            `SELECT l.LeagueID, l.Name, l.LeagueCode, l.CreationDate, m.Role, m.JoinDate
             FROM league l
             INNER JOIN membership m ON l.LeagueID = m.LeagueID
             WHERE m.UserID = ?
             ORDER BY l.CreationDate DESC`,
            [userId]
        );
        connection.release();
        
        res.json({ 
            success: true, 
            data: leagues 
        });
    } catch (error) {
        console.error('❌ Get user leagues error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get upcoming events (Fixed: Universal Column Mapper)
app.get('/api/events', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        // 1. Select EVERYTHING (SELECT *) to avoid "Unknown Column" SQL errors
        const [rows] = await connection.execute('SELECT * FROM event LIMIT 50');
        connection.release();

        if (rows.length > 0) {
            console.log("🔍 DIAGNOSTIC - First Event Row:", rows[0]); // Check your terminal for this!
        }

        // 2. Smart Mapping: Find the right data regardless of column name
        const events = rows.map(row => {
            // Helper to find a key case-insensitively
            const keys = Object.keys(row);
            const findKey = (search) => keys.find(k => k.toLowerCase().includes(search));

            return {
                // Look for 'event_id', 'EventID', 'id', etc.
                EventID: row.event_id || row.EventID || row[findKey('id')],
                
                // Look for 'name', 'event_name', 'Name', etc.
                Name: row.name || row.Name || row.event_name || row[findKey('name')] || 'Unknown Event',
                
                // Look for 'date', 'event_date', 'Date', etc.
                Date: row.date || row.Date || row.event_date || row[findKey('date')],
                
                // Look for 'location', 'event_location', etc.
                Location: row.location || row.Location || row[findKey('location')]
            };
        });

        // 3. Sort by Date in JavaScript (safer than SQL ORDER BY if column name is unknown)
        events.sort((a, b) => new Date(b.Date) - new Date(a.Date));

        res.json({ success: true, data: events });

    } catch (error) {
        console.error('❌ Get events error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get fights for an event (Fixed: Exact Column Names from Diagnostic)
app.get('/api/event/:eventId/fights', async (req, res) => {
    const eventId = req.params.eventId;
    
    try {
        const connection = await pool.getConnection();

        // 1. Get Fights and Fighters
        const [fights] = await connection.execute('SELECT * FROM fight WHERE event_id = ?', [eventId]);
        const [allFighters] = await connection.execute('SELECT * FROM fighter');
        
        connection.release();

        if (fights.length === 0) return res.json({ success: true, data: [] });

        // 2. Create Fighter Map (ID -> Name & Record)
        const fighterMap = {};
        allFighters.forEach(f => {
            // Map ID to an object containing Name and Record
            // Construct record string from wins-losses-draws
            const record = (f.wins !== undefined) ? `${f.wins}-${f.losses}-${f.draws}` : 'N/A';
            
            fighterMap[f.fighter_id] = {
                name: f.name,
                record: record
            };
        });

        // 3. Map Fights using known columns: red_fighter_id, blue_fighter_id, division
        const mappedFights = fights.map(row => {
            const idA = row.red_fighter_id;
            const idB = row.blue_fighter_id;
            
            const fighterA = fighterMap[idA] || { name: 'Unknown', record: '' };
            const fighterB = fighterMap[idB] || { name: 'Unknown', record: '' };

            // Determine Result string based on winner_id
            let resultText = 'Pending';
            if (row.winner_id) {
                if (row.winner_id === idA) resultText = `${fighterA.name} Win`;
                else if (row.winner_id === idB) resultText = `${fighterB.name} Win`;
                else resultText = 'Draw/No Contest';
            }

            return {
                FightID: row.fight_id,
                FighterA_ID: idA,
                FighterB_ID: idB,
                FighterAName: fighterA.name,
                FighterARecord: fighterA.record,
                FighterBName: fighterB.name,
                FighterBRecord: fighterB.record,
                // Use 'division' for weight class as seen in your logs
                WeightClass: row.division || 'Catchweight', 
                Result: resultText, 
                Method: row.method || '-',
                Round: row.finish_round || '-'
            };
        });

        res.json({ success: true, data: mappedFights });

    } catch (error) {
        console.error('❌ Get fights error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save picks (Fixed: Resilient Loop & Data Types)
app.post('/api/save-picks', async (req, res) => {
    console.log("📨 RECEIVED SAVE REQUEST");
    
    const { userId, leagueId, eventId, picks } = req.body;
    
    if (!userId || !leagueId || !eventId || !picks) {
        return res.status(400).json({ success: false, error: 'Missing required data' });
    }

    try {
        const connection = await pool.getConnection();
        
        // 1. Delete old picks for this specific event
        // We force IDs to strings to match the new schema types
        const strUserId = String(userId);
        const strLeagueId = String(leagueId);
        const strEventId = String(eventId);

        console.log(`🔄 Deleting old picks for User ${strUserId}, Event ${strEventId}...`);
        
        await connection.execute(
            'DELETE FROM Pick WHERE UserID = ? AND LeagueID = ? AND EventID = ?',
            [strUserId, strLeagueId, strEventId]
        );
        
        // 2. Insert new picks (Resilient Loop)
        let savedCount = 0;
        let errorCount = 0;

        for (const pick of picks) {
            if (pick.fighterId) {
                try {
                    // Force FighterID to string (handles both UUIDs and Integers)
                    const strFighterId = String(pick.fighterId).trim();

                    await connection.execute(
                        'INSERT INTO Pick (UserID, LeagueID, EventID, FighterID, PointsEarned) VALUES (?, ?, ?, ?, 0)',
                        [strUserId, strLeagueId, strEventId, strFighterId]
                    );
                    savedCount++;
                } catch (innerError) {
                    console.error(`⚠️ Failed to save pick for fighter ${pick.fighterId}:`, innerError.message);
                    errorCount++;
                }
            }
        }
        
        connection.release();
        
        console.log(`✅ RESULT: ${savedCount} saved, ${errorCount} failed.`);
        
        if (savedCount === 0 && errorCount > 0) {
            return res.status(500).json({ success: false, error: "All picks failed to save. Check server logs." });
        }

        res.json({ 
            success: true, 
            message: `Saved ${savedCount} picks${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 
            picksCount: savedCount 
        });

    } catch (error) {
        console.error('❌ FATAL SAVE ERROR:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get league members
app.get('/api/league-members/:leagueId', async (req, res) => {
    const leagueId = req.params.leagueId;
    
    try {
        const connection = await pool.getConnection();
        const [members] = await connection.execute(
            `SELECT u.UserID, u.Username, u.Email, m.Role, m.JoinDate,
                    COALESCE(SUM(p.PointsEarned), 0) as TotalPoints
             FROM membership m
             INNER JOIN user u ON m.UserID = u.UserID
             LEFT JOIN pick p ON u.UserID = p.UserID AND p.LeagueID = ?
             WHERE m.LeagueID = ?
             GROUP BY u.UserID, u.Username, u.Email, m.Role, m.JoinDate
             ORDER BY TotalPoints DESC, u.Username ASC`,
            [leagueId, leagueId]
        );
        connection.release();
        
        res.json({ 
            success: true, 
            data: members 
        });
    } catch (error) {
        console.error('❌ Get league members error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get ALL user picks for a league (Fixed: Correct Columns & Grouping Data)
app.get('/api/user-picks/:userId/:leagueId', async (req, res) => {
    const { userId, leagueId } = req.params;
    
    try {
        const connection = await pool.getConnection();

        // 1. Get Picks
        const [picks] = await connection.execute(
            'SELECT * FROM Pick WHERE UserID = ? AND LeagueID = ?',
            [userId, leagueId]
        );
        
        // 2. Get Reference Data (Using KNOWN snake_case columns from your dump)
        const [allFighters] = await connection.execute('SELECT fighter_id, name, weight, wins, losses, draws FROM fighter');
        const [allEvents] = await connection.execute('SELECT event_id, event_name, date, location FROM event');
        
        connection.release();

        if (picks.length === 0) return res.json({ success: true, data: [] });

        // 3. Create Lookup Maps
        const fighterMap = {};
        allFighters.forEach(f => {
            const strId = String(f.fighter_id).trim(); 
            fighterMap[strId] = {
                name: f.name,
                weight: f.weight || 'N/A',
                record: `${f.wins}-${f.losses}-${f.draws}`
            };
        });

        const eventMap = {};
        allEvents.forEach(e => {
            const strId = String(e.event_id).trim();
            eventMap[strId] = {
                name: e.event_name,
                date: e.date,
                location: e.location
            };
        });

        // 4. Map Results
        const mappedPicks = picks.map(p => {
            const fighterId = String(p.FighterID).trim();
            const eventId = String(p.EventID).trim();

            const fighter = fighterMap[fighterId];
            const event = eventMap[eventId];

            return {
                PickID: p.PickID,
                EventID: eventId,
                EventName: event ? event.name : `Unknown Event (ID: ${eventId})`,
                EventDate: event ? event.date : '',
                FighterName: fighter ? fighter.name : `Unknown (ID: ${fighterId})`,
                FighterRecord: fighter ? fighter.record : '0-0-0',
                WeightClass: fighter ? fighter.weight : 'N/A',
                PointsEarned: p.PointsEarned || 0
            };
        });
        
        res.json({ success: true, data: mappedPicks });

    } catch (error) {
        console.error('❌ Get user picks error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get league details including code
app.get('/api/league/:leagueId', async (req, res) => {
    const leagueId = req.params.leagueId;
    
    try {
        const connection = await pool.getConnection();
        const [leagues] = await connection.execute(
            'SELECT LeagueID, Name, LeagueCode, ScoringRules, CreationDate, OwnerID FROM league WHERE LeagueID = ?',
            [leagueId]
        );
        connection.release();
        
        if (leagues.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'League not found' 
            });
        }
        
        res.json({ 
            success: true, 
            data: leagues[0] 
        });
    } catch (error) {
        console.error('❌ Get league error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME || 'ufc_fantasy_db'}`);
});

