const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from 'public' directory
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://structureality_admin:oG4qBQnbGLLyBF4f@structureality-cluster.chm4r6c.mongodb.net/?appName=StructuReality-Cluster";
const DB_NAME = "structureality_db";
const USERS_COLLECTION = "users";
const LESSONS_COLLECTION = "lessons";
const ADMINS_COLLECTION = "admins";

// MongoDB Client
const client = new MongoClient(MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;
let usersCollection;
let lessonsCollection;
let adminsCollection;

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db(DB_NAME);
        usersCollection = db.collection(USERS_COLLECTION);
        lessonsCollection = db.collection(LESSONS_COLLECTION);
        adminsCollection = db.collection(ADMINS_COLLECTION);

        // Create indexes
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await lessonsCollection.createIndex({ topicName: 1, order: 1 });
        await adminsCollection.createIndex({ username: 1 }, { unique: true });

        console.log("✅ Connected to MongoDB Atlas!");
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error);
        process.exit(1);
    }
}

// ==================== ROOT & HEALTH CHECK ====================
app.get('/', (req, res) => {
    res.json({
        status: '✅ StructuReality Server is running',
        version: '2.5.0', // Updated Version for Fixes
        database: db ? 'Connected' : 'Disconnected',
        collections: ['users', 'lessons', 'admins'],
        features: ['User Management', 'Progress Tracking', 'Lesson Management', 'Lesson Completion Tracking', 'Streak Fixes', 'Admin Login', 'Robust Analytics'],
        message: 'Server ready for Unity and admin connections',
        adminPages: {
            login: '/login.html',
            dashboard: '/index.html',
            users: '/users.html',
            lessons: '/lessons.html',
            analytics: '/analytics.html'
        }
    });
});

// Serve admin pages explicitly
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/users.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'users.html'));
});
app.get('/lessons.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'lessons.html'));
});
app.get('/analytics.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

// ==================== ADMIN ENDPOINTS ====================
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await adminsCollection.findOne({ username: username });

        if (!admin) {
            console.log(`❌ Admin login failed: User not found for ${username}`);
            return res.status(404).json({
                success: false,
                error: 'Admin user not found'
            });
        }

        if (admin.password !== password) {
            console.log(`❌ Admin login failed: Incorrect password for ${username}`);
            return res.status(401).json({
                success: false,
                error: 'Incorrect password'
            });
        }

        console.log(`🔐 Admin logged in: ${admin.username}`);
        const { password: _, ...adminWithoutPassword } = admin;
        res.json({
            success: true,
            message: 'Admin login successful',
            admin: adminWithoutPassword
        });
    } catch (error) {
        console.error('❌ Admin login error:', error);
        res.status(500).json({
            success: false,
            error: 'Admin login failed',
            details: error.message
        });
    }
});

// ==================== USER ENDPOINTS ====================
app.post('/api/users', async (req, res) => {
    try {
        const userData = req.body;

        if (!userData.registerDate) {
            userData.registerDate = new Date().toISOString();
        }

        // Initialize empty progress structure if missing
        if (!userData.progress) {
            userData.progress = {
                Queue: { tutorialCompleted: false, puzzleCompleted: false, score: 0, lessonsCompleted: 0, progressPercentage: 0, lastAccessed: '', timeSpent: 0 },
                Stacks: { tutorialCompleted: false, puzzleCompleted: false, score: 0, lessonsCompleted: 0, progressPercentage: 0, lastAccessed: '', timeSpent: 0 },
                LinkedLists: { tutorialCompleted: false, puzzleCompleted: false, score: 0, lessonsCompleted: 0, progressPercentage: 0, lastAccessed: '', timeSpent: 0 },
                Trees: { tutorialCompleted: false, puzzleCompleted: false, score: 0, lessonsCompleted: 0, progressPercentage: 0, lastAccessed: '', timeSpent: 0 },
                Graphs: { tutorialCompleted: false, puzzleCompleted: false, score: 0, lessonsCompleted: 0, progressPercentage: 0, lastAccessed: '', timeSpent: 0 }
            };
        }

        const existingUser = await usersCollection.findOne({
            $or: [
                { username: userData.username },
                { email: userData.email }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Username or email already exists',
                field: existingUser.username === userData.username ? 'username' : 'email'
            });
        }

        const result = await usersCollection.insertOne(userData);
        console.log(`✅ New user registered: ${userData.username}`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            userId: result.insertedId
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register user',
            details: error.message
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const user = await usersCollection.findOne({
            $or: [
                { username: username },
                { email: email }
            ]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Incorrect password'
            });
        }

        await usersCollection.updateOne(
            { _id: user._id },
            {
                $set: {
                    lastLogin: new Date().toISOString()
                }
            }
        );

        console.log(`🔐 User logged in: ${user.username}`);
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            message: 'Login successful',
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message
        });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await usersCollection.find({})
            .project({ password: 0 })
            .toArray();

        res.json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

app.get('/api/users/:username', async (req, res) => {
    try {
        const user = await usersCollection.findOne(
            { username: req.params.username },
            { projection: { password: 0 } }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // IMPORTANT: Return format that matches UserDataResponse in Unity
        res.json({
            username: user.username,
            name: user.name || user.username,
            email: user.email,  // Ensure correct email is sent
            streak: user.streak || 0,
            completedTopics: user.completedTopics || 0
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user'
        });
    }
});

app.delete('/api/users/:username', async (req, res) => {
    try {
        const result = await usersCollection.deleteOne({ username: req.params.username });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log(`🗑️ User deleted: ${req.params.username}`);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
});

// ==================== PASSWORD CHANGE ====================
app.put('/api/users/:username/change-password', async (req, res) => {
    try {
        const { username } = req.params;
        const { currentPassword, newPassword } = req.body;

        console.log(`🔐 Password change request for: ${username}`);

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Current password and new password are required'
            });
        }

        const user = await usersCollection.findOne({ username });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.password !== currentPassword) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        await usersCollection.updateOne(
            { username },
            {
                $set: {
                    password: newPassword,
                    lastUpdated: new Date().toISOString()
                }
            }
        );

        console.log(`✅ Password changed successfully for ${username}`);
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('❌ Error changing password:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change password',
            details: error.message
        });
    }
});

// ==================== PROGRESS SYNC ====================
app.put('/api/progress/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const progressData = req.body;
        console.log('📥 Progress sync:', username);

        // --- DATA LOSS FIX START ---
        // Fetch existing user first to get current progress
        const existingUser = await usersCollection.findOne({ username: username });

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Initialize with existing progress or empty object
        const mergedProgress = existingUser.progress || {};

        // Merge new topic data into existing progress
        if (progressData.topics && Array.isArray(progressData.topics)) {
            progressData.topics.forEach(topic => {
                // Only update the topics included in the request
                // Preserve others
                mergedProgress[topic.topicName] = {
                    tutorialCompleted: topic.tutorialCompleted === true,
                    puzzleCompleted: topic.puzzleCompleted === true,
                    score: parseInt(topic.puzzleScore || topic.score || 0),
                    progressPercentage: parseFloat(topic.progressPercentage || 0),
                    lastAccessed: topic.lastAccessed || new Date().toISOString(),
                    timeSpent: parseFloat(topic.timeSpent || 0),
                    lessonsCompleted: parseInt(topic.lessonsCompleted || 0)
                };
            });
        }
        // --- DATA LOSS FIX END ---

        let newStreak = existingUser.streak || 0; // Default to 0 if undefined
        if (newStreak === 0 && existingUser.streak === undefined) newStreak = 1; // Start streak if new user

        const now = new Date();

        if (existingUser.lastActivity) {
            const lastActivity = new Date(existingUser.lastActivity);

            // --- STREAK FIX START ---
            // Use Calendar Date comparison instead of 24h window

            // Helper to get date string YYYY-MM-DD
            const toDateString = (d) => d.toISOString().split('T')[0];

            const todayStr = toDateString(now);
            const lastActiveStr = toDateString(lastActivity);

            const msPerDay = 1000 * 60 * 60 * 24;
            // Floor dates to ignore time component
            const todayDate = new Date(todayStr);
            const lastActiveDate = new Date(lastActiveStr);

            const diffDays = Math.floor((todayDate - lastActiveDate) / msPerDay);

            if (diffDays === 1) {
                // Yesterday was active -> Increment
                newStreak = (existingUser.streak || 0) + 1;
                console.log(`🔥 Streak incremented to ${newStreak} (Yesterday: ${lastActiveStr}, Today: ${todayStr})`);
            } else if (diffDays === 0) {
                // Already active today -> Keep same
                newStreak = existingUser.streak || 1;
                console.log(`✓ Streak maintained at ${newStreak} (Active today)`);
            } else {
                // Missed a day or more -> Reset
                if (existingUser.streak > 0) {
                    console.log(`❌ Streak broken. Reset to 1 (Last active: ${lastActiveStr}, Today: ${todayStr}, Diff: ${diffDays} days)`);
                }
                newStreak = 1;
            }
            // --- STREAK FIX END ---
        } else {
            newStreak = 1;
        }

        // Use the MERGED progress dictionary
        const updateData = {
            progress: mergedProgress,
            streak: newStreak,
            completedTopics: parseInt(progressData.completedTopics || 0),
            lastUpdated: progressData.lastUpdated || new Date().toISOString(),
            lastActivity: now.toISOString(),
            // Only update name/email if provided
        };

        if (progressData.name) updateData.name = progressData.name;
        if (progressData.email) updateData.email = progressData.email;

        // Only use specific fields in $set to be safer, though we merged 'progress' object above
        const result = await usersCollection.updateOne(
            { username: username },
            { $set: updateData },
            { upsert: false }
        );

        console.log(`✅ Progress synced: ${username}, Streak: ${newStreak}`);

        res.json({
            success: true,
            message: 'Progress synced successfully',
            syncedTopics: progressData.topics ? progressData.topics.length : 0,
            streak: newStreak
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync progress',
            details: error.message
        });
    }
});

app.put('/api/progress/:username/lessons', async (req, res) => {
    try {
        const { username } = req.params;
        const { topicName, lessonsCompleted } = req.body;

        console.log(`📚 Updating lessons for ${username}: ${topicName} - ${lessonsCompleted} lessons`);

        if (!topicName || lessonsCompleted === undefined) {
            return res.status(400).json({
                success: false,
                error: 'topicName and lessonsCompleted are required'
            });
        }

        const user = await usersCollection.findOne({ username });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const lessonsCount = parseInt(lessonsCompleted);

        await usersCollection.updateOne(
            { username },
            {
                $set: {
                    [`progress.${topicName}.lessonsCompleted`]: lessonsCount,
                    [`progress.${topicName}.lastAccessed`]: new Date().toISOString()
                }
            }
        );

        console.log(`✅ Lessons updated for ${username}: ${topicName} = ${lessonsCount}`);

        res.json({
            success: true,
            message: 'Lesson completion updated',
            topicName,
            lessonsCompleted: lessonsCount
        });
    } catch (error) {
        console.error('Error updating lessons:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update lesson completion',
            details: error.message
        });
    }
});

app.get('/api/progress/:username', async (req, res) => {
    try {
        const user = await usersCollection.findOne({ username: req.params.username });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const topics = [];
        if (user.progress) {
            Object.keys(user.progress).forEach(topicName => {
                const topic = user.progress[topicName];
                topics.push({
                    topicName: topicName,
                    tutorialCompleted: topic.tutorialCompleted || false,
                    puzzleCompleted: topic.puzzleCompleted || false,
                    puzzleScore: topic.score || 0,
                    progressPercentage: topic.progressPercentage || 0,
                    lastAccessed: topic.lastAccessed || '',
                    timeSpent: topic.timeSpent || 0,
                    lessonsCompleted: topic.lessonsCompleted || 0
                });
            });
        }

        res.json({
            success: true,
            data: {
                username: user.username,
                name: user.name || '',
                email: user.email || '',
                streak: user.streak || 0,
                completedTopics: user.completedTopics || 0,
                lastUpdated: user.lastUpdated || '',
                topics: topics
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch progress'
        });
    }
});

app.get('/api/progress', async (req, res) => {
    try {
        const users = await usersCollection.find({})
            .project({ password: 0 })
            .toArray();

        const progressData = users.map(user => {
            const topics = [];
            if (user.progress) {
                Object.keys(user.progress).forEach(topicName => {
                    const topic = user.progress[topicName];
                    topics.push({
                        topicName: topicName,
                        tutorialCompleted: topic.tutorialCompleted || false,
                        puzzleCompleted: topic.puzzleCompleted || false,
                        puzzleScore: topic.score || 0,
                        progressPercentage: topic.progressPercentage || 0,
                        lastAccessed: topic.lastAccessed || '',
                        timeSpent: topic.timeSpent || 0,
                        lessonsCompleted: topic.lessonsCompleted || 0
                    });
                });
            }

            return {
                username: user.username,
                name: user.name || '',
                email: user.email || '',
                streak: user.streak || 0,
                completedTopics: user.completedTopics || 0,
                lastUpdated: user.lastUpdated || '',
                topics: topics
            };
        });

        res.json({
            success: true,
            count: progressData.length,
            data: progressData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch progress data'
        });
    }
});

// ==================== LESSON MANAGEMENT ====================
app.get('/api/lessons', async (req, res) => {
    try {
        const lessons = await lessonsCollection.find({})
            .sort({ topicName: 1, order: 1 })
            .toArray();

        res.json({
            success: true,
            count: lessons.length,
            lessons: lessons
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch lessons'
        });
    }
});

app.get('/api/lessons/:topicName', async (req, res) => {
    try {
        const lessons = await lessonsCollection.find({
            topicName: req.params.topicName
        })
            .sort({ order: 1 })
            .toArray();

        res.json({
            success: true,
            topicName: req.params.topicName,
            count: lessons.length,
            lessons: lessons
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch lessons'
        });
    }
});

app.post('/api/lessons', async (req, res) => {
    try {
        const lessonData = {
            topicName: req.body.topicName,
            title: req.body.title,
            description: req.body.description,
            content: req.body.content || '',
            order: req.body.order || 1,
            createdAt: new Date().toISOString()
        };

        if (!lessonData.topicName || !lessonData.title || !lessonData.description) {
            return res.status(400).json({
                success: false,
                error: 'Topic name, title, and description are required'
            });
        }

        const result = await lessonsCollection.insertOne(lessonData);
        console.log(`✅ New lesson added: ${lessonData.title} (${lessonData.topicName})`);

        res.status(201).json({
            success: true,
            message: 'Lesson added successfully',
            lessonId: result.insertedId
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add lesson',
            details: error.message
        });
    }
});

app.put('/api/lessons/:lessonId', async (req, res) => {
    try {
        const updateData = {
            title: req.body.title,
            description: req.body.description,
            content: req.body.content,
            order: req.body.order,
            updatedAt: new Date().toISOString()
        };

        Object.keys(updateData).forEach(key =>
            updateData[key] === undefined && delete updateData[key]
        );

        const result = await lessonsCollection.updateOne(
            { _id: new ObjectId(req.params.lessonId) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Lesson not found'
            });
        }

        console.log(`✅ Lesson updated: ${req.params.lessonId}`);
        res.json({
            success: true,
            message: 'Lesson updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to update lesson'
        });
    }
});

app.post('/api/lessons/complete', async (req, res) => {
    try {
        const { username, topicName, lessonsCompleted } = req.body;
        console.log(`📚 ${username} - ${topicName}: ${lessonsCompleted} lessons`);

        if (!username || !topicName || lessonsCompleted === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        await usersCollection.updateOne(
            { username },
            {
                $set: {
                    [`progress.${topicName}.lessonsCompleted`]: parseInt(lessonsCompleted),
                    [`progress.${topicName}.lastAccessed`]: new Date().toISOString()
                }
            }
        );

        console.log(`✅ Updated: ${username} - ${topicName} = ${lessonsCompleted}`);
        res.json({
            success: true,
            message: 'Lesson completion updated',
            username,
            topicName,
            lessonsCompleted
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update',
            details: error.message
        });
    }
});

app.delete('/api/lessons/:lessonId', async (req, res) => {
    try {
        const result = await lessonsCollection.deleteOne({
            _id: new ObjectId(req.params.lessonId)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Lesson not found'
            });
        }

        console.log(`🗑️ Lesson deleted: ${req.params.lessonId}`);
        res.json({
            success: true,
            message: 'Lesson deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to delete lesson'
        });
    }
});

// ==================== STATS ====================
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await usersCollection.countDocuments();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activeUsers = await usersCollection.countDocuments({
            lastLogin: { $gte: sevenDaysAgo.toISOString() }
        });

        const users = await usersCollection.find({}).toArray();
        let totalStreak = 0;
        let totalCompletedTopics = 0;

        users.forEach(user => {
            totalStreak += user.streak || 0;
            totalCompletedTopics += user.completedTopics || 0;
        });

        const avgStreak = totalUsers > 0 ? (totalStreak / totalUsers).toFixed(1) : 0;
        const avgCompletion = totalUsers > 0 ? (totalCompletedTopics / totalUsers).toFixed(1) : 0;

        res.json({
            success: true,
            totalUsers,
            activeUsers,
            avgStreak,
            avgCompletion
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

// ==================== ANALYTICS ====================
app.get('/api/analytics', async (req, res) => {
    try {
        const users = await usersCollection.find({}).toArray();
        const lessons = await lessonsCollection.find({}).toArray();

        const totalUsers = users.length;
        const totalLessons = lessons.length;

        // Calculate active users (last 24 hours)
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        let activeUsers = 0;
        let idleUsers = 0;
        let inactiveUsers = 0;

        // Topic statistics
        const topicStats = {
            Queue: { completions: 0, totalLessons: 0, totalScore: 0, totalTime: 0, users: 0 },
            Stacks: { completions: 0, totalLessons: 0, totalScore: 0, totalTime: 0, users: 0 },
            LinkedLists: { completions: 0, totalLessons: 0, totalScore: 0, totalTime: 0, users: 0 },
            Trees: { completions: 0, totalLessons: 0, totalScore: 0, totalTime: 0, users: 0 },
            Graphs: { completions: 0, totalLessons: 0, totalScore: 0, totalTime: 0, users: 0 }
        };

        const progressRanges = {
            '0-20': 0,
            '21-40': 0,
            '41-60': 0,
            '61-80': 0,
            '81-100': 0
        };

        const streakRanges = {
            '1-3': 0,
            '4-7': 0,
            '8-14': 0,
            '15-30': 0,
            '30+': 0
        };

        const activityByDay = Array(7).fill(0);
        const lessonsCompletedByDay = Array(7).fill(0);

        let totalStreak = 0;
        let totalCompletedTopics = 0;
        let totalLessonsCompleted = 0;
        let totalTimeSpent = 0;

        users.forEach(user => {
            // Calculate overall progress
            let userProgress = 0;
            if (user.progress) {
                const topicCount = Object.keys(user.progress).length;
                Object.values(user.progress).forEach(topic => {
                    userProgress += parseFloat(topic.progressPercentage || 0);
                });
                userProgress = topicCount > 0 ? userProgress / topicCount : 0;
            }

            // Progress distribution
            if (userProgress <= 20) progressRanges['0-20']++;
            else if (userProgress <= 40) progressRanges['21-40']++;
            else if (userProgress <= 60) progressRanges['41-60']++;
            else if (userProgress <= 80) progressRanges['61-80']++;
            else progressRanges['81-100']++;

            // Streak distribution
            const streak = parseInt(user.streak || 0);
            totalStreak += streak;
            if (streak >= 1 && streak <= 3) streakRanges['1-3']++;
            else if (streak >= 4 && streak <= 7) streakRanges['4-7']++;
            else if (streak >= 8 && streak <= 14) streakRanges['8-14']++;
            else if (streak >= 15 && streak <= 30) streakRanges['15-30']++;
            else if (streak > 30) streakRanges['30+']++;

            totalCompletedTopics += parseInt(user.completedTopics || 0);

            // User activity status based on lastActivity
            let mostRecentActivity = null;

            if (user.progress) {
                Object.entries(user.progress).forEach(([topicName, topic]) => {
                    // Safety check for topic existence
                    if (topicStats[topicName]) {
                        const tLessons = parseInt(topic.lessonsCompleted || 0);
                        const tScore = parseInt(topic.score || 0);
                        const tTime = parseFloat(topic.timeSpent || 0);

                        topicStats[topicName].totalLessons += tLessons;
                        topicStats[topicName].totalScore += tScore;
                        topicStats[topicName].totalTime += tTime;

                        if (topic.puzzleCompleted) {
                            topicStats[topicName].completions++;
                        }

                        if (tLessons > 0 || topic.tutorialCompleted) {
                            topicStats[topicName].users++;
                        }

                        totalLessonsCompleted += tLessons;
                        totalTimeSpent += tTime;

                        if (topic.lastAccessed) {
                            const accessDate = new Date(topic.lastAccessed);
                            if (!mostRecentActivity || accessDate > mostRecentActivity) {
                                mostRecentActivity = accessDate;
                            }

                            const daysDiff = Math.floor((new Date() - accessDate) / (1000 * 60 * 60 * 24));
                            if (daysDiff >= 0 && daysDiff < 7) {
                                activityByDay[6 - daysDiff]++;
                                lessonsCompletedByDay[6 - daysDiff] += tLessons;
                            }
                        }
                    }
                });
            }

            // Check lastActivity for user status
            if (user.lastActivity) {
                const lastActivityDate = new Date(user.lastActivity);
                const hoursSince = (new Date() - lastActivityDate) / (1000 * 60 * 60);

                if (hoursSince < 24) activeUsers++;
                else if (hoursSince < 168) idleUsers++;
                else inactiveUsers++;
            } else if (mostRecentActivity) {
                const hoursSince = (new Date() - mostRecentActivity) / (1000 * 60 * 60);
                if (hoursSince < 24) activeUsers++;
                else if (hoursSince < 168) idleUsers++;
                else inactiveUsers++;
            } else {
                inactiveUsers++;
            }
        });

        const avgStreak = totalUsers > 0 ? (totalStreak / totalUsers).toFixed(1) : 0;
        const avgCompletion = totalUsers > 0 ? (totalCompletedTopics / totalUsers).toFixed(1) : 0;

        const avgTimePerUser = totalUsers > 0 ? (totalTimeSpent / totalUsers) : 0;

        const totalPossibleLessons = totalUsers * totalLessons;
        const completionRate = totalPossibleLessons > 0
            ? ((totalLessonsCompleted / totalPossibleLessons) * 100).toFixed(1)
            : 0;

        // Custom engagement score algorithm
        const engagementScore = totalUsers > 0
            ? Math.min(10, ((activeUsers / totalUsers) * 5 + (parseFloat(completionRate) / 10))).toFixed(1)
            : 0;

        // Calculate percentages for topic popularity
        const totalTopicUsers = Object.values(topicStats).reduce((sum, topic) => sum + topic.users, 0);
        const topicPopularity = {};
        Object.entries(topicStats).forEach(([topic, stats]) => {
            topicPopularity[topic] = totalTopicUsers > 0
                ? Math.round((stats.users / totalTopicUsers) * 100)
                : 0;
        });

        // Prepare lesson performance data
        const lessonPerformance = [];
        const topicColors = {
            Queue: 'blue',
            Stacks: 'green',
            LinkedLists: 'purple',
            Trees: 'yellow',
            Graphs: 'red'
        };

        // Aggregate lesson completions
        const lessonCompletionMap = new Map();
        users.forEach(user => {
            if (user.progress) {
                Object.entries(user.progress).forEach(([topicName, topic]) => {
                    const completions = parseInt(topic.lessonsCompleted || 0);
                    if (!lessonCompletionMap.has(topicName)) {
                        lessonCompletionMap.set(topicName, 0);
                    }
                    lessonCompletionMap.set(topicName, lessonCompletionMap.get(topicName) + completions);
                });
            }
        });

        lessons.slice(0, 10).forEach(lesson => {
            const topicStat = topicStats[lesson.topicName];
            if (topicStat) {
                const avgScore = topicStat.users > 0
                    ? ((topicStat.totalScore / topicStat.users)).toFixed(1)
                    : 0;

                const avgTimeSeconds = topicStat.users > 0
                    ? (topicStat.totalTime / topicStat.users)
                    : 0;

                // Format time as "Xh Ym" or "Xm"
                const avgTimeFormatted = formatTime(avgTimeSeconds);

                const rating = (parseFloat(avgScore) / 20).toFixed(1); // 5-star based on score

                lessonPerformance.push({
                    name: lesson.title,
                    topic: lesson.topicName,
                    color: topicColors[lesson.topicName] || 'gray',
                    completions: lessonCompletionMap.get(lesson.topicName) || 0,
                    avgScore: avgScore + '%',
                    avgTime: avgTimeFormatted,
                    rating: rating
                });
            }
        });

        // Day labels
        const dayLabels = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dayLabels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        }

        res.json({
            success: true,
            data: {
                metrics: {
                    completionRate: parseFloat(completionRate),
                    avgTimePerUser: avgTimePerUser,
                    totalTimeSpent: totalTimeSpent,
                    engagementScore: parseFloat(engagementScore),
                    totalUsers: totalUsers,
                    activeUsers: activeUsers,
                    totalLessons: totalLessons,
                    avgStreak: parseFloat(avgStreak)
                },
                activity: {
                    labels: dayLabels,
                    activeUsers: activityByDay,
                    lessonsCompleted: lessonsCompletedByDay
                },
                topicPopularity: topicPopularity,
                progressDistribution: progressRanges,
                streakDistribution: streakRanges,
                lessonPerformance: lessonPerformance,
                userStatus: {
                    active: activeUsers,
                    idle: idleUsers,
                    inactive: inactiveUsers
                }
            }
        });
    } catch (error) {
        console.error('❌ Analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics data',
            details: error.message
        });
    }
});

function formatTime(seconds) {
    if (!seconds || seconds === 0) return '0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

// ==================== START SERVER ====================
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log('\n==================================================');
        console.log('🚀 StructuReality Server v2.5 - Fixes & Analytics');
        console.log('==================================================');
        console.log(`📡 Server: http://localhost:${PORT}`);
        console.log(`🔐 Login: http://localhost:${PORT}/login.html`);
        console.log(`📊 Dashboard: http://localhost:${PORT}/index.html`);
        console.log(`👥 Users: http://localhost:${PORT}/users.html`);
        console.log(`📚 Lessons: http://localhost:${PORT}/lessons.html`);
        console.log(`💾 Database: ${DB_NAME}`);
        console.log(`📚 Collections: users, lessons, admins`);
        console.log('==================================================\n');
    });
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await client.close();
    process.exit(0);
});
