const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://structureality_admin:oG4qBQnbGLLyBF4f@structureality-cluster.chm4r6c.mongodb.net/?appName=StructuReality-Cluster";
const DB_NAME = "structureality_db";
const USERS_COLLECTION = "users";
const LESSONS_COLLECTION = "lessons";

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

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db(DB_NAME);
        usersCollection = db.collection(USERS_COLLECTION);
        lessonsCollection = db.collection(LESSONS_COLLECTION);
        
        // Create indexes
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await lessonsCollection.createIndex({ topicName: 1, order: 1 });
        
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
        version: '2.1.0',
        database: db ? 'Connected' : 'Disconnected',
        collections: ['users', 'lessons'],
        features: ['User Management', 'Progress Tracking', 'Lesson Management', 'Lesson Completion Tracking'],
        message: 'Server ready for Unity and admin connections'
    });
});

// ==================== USER ENDPOINTS ====================

app.post('/api/users', async (req, res) => {
    try {
        const userData = req.body;
        
        if (!userData.registerDate) {
            userData.registerDate = new Date().toISOString();
        }
        
        if (!userData.progress) {
            userData.progress = {
                Queue: { 
                    tutorialCompleted: false, 
                    puzzleCompleted: false, 
                    score: 0,
                    lessonsCompleted: 0, // NEW
                    progressPercentage: 0,
                    lastAccessed: '',
                    timeSpent: 0
                },
                Stacks: { 
                    tutorialCompleted: false, 
                    puzzleCompleted: false, 
                    score: 0,
                    lessonsCompleted: 0, // NEW
                    progressPercentage: 0,
                    lastAccessed: '',
                    timeSpent: 0
                },
                LinkedLists: { 
                    tutorialCompleted: false, 
                    puzzleCompleted: false, 
                    score: 0,
                    lessonsCompleted: 0, // NEW
                    progressPercentage: 0,
                    lastAccessed: '',
                    timeSpent: 0
                },
                Trees: { 
                    tutorialCompleted: false, 
                    puzzleCompleted: false, 
                    score: 0,
                    lessonsCompleted: 0, // NEW
                    progressPercentage: 0,
                    lastAccessed: '',
                    timeSpent: 0
                },
                Graphs: { 
                    tutorialCompleted: false, 
                    puzzleCompleted: false, 
                    score: 0,
                    lessonsCompleted: 0, // NEW
                    progressPercentage: 0,
                    lastAccessed: '',
                    timeSpent: 0
                }
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

// ==================== PROGRESS SYNC ====================

app.put('/api/progress/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const progressData = req.body;
        
        console.log('📥 Progress sync:', username);
        
        const dbProgress = {};
        
        if (progressData.topics && Array.isArray(progressData.topics)) {
            progressData.topics.forEach(topic => {
                dbProgress[topic.topicName] = {
                    tutorialCompleted: topic.tutorialCompleted || false,
                    puzzleCompleted: topic.puzzleCompleted || false,
                    score: topic.puzzleScore || 0,
                    progressPercentage: topic.progressPercentage || 0,
                    lastAccessed: topic.lastAccessed || new Date().toISOString(),
                    timeSpent: topic.timeSpent || 0,
                    lessonsCompleted: topic.lessonsCompleted || 0 // NEW: Preserve lessons completed
                };
            });
        }
        
        const updateData = {
            progress: dbProgress,
            streak: progressData.streak || 0,
            completedTopics: progressData.completedTopics || 0,
            lastUpdated: progressData.lastUpdated || new Date().toISOString(),
            name: progressData.name,
            email: progressData.email
        };
        
        const result = await usersCollection.updateOne(
            { username: username },
            { $set: updateData },
            { upsert: false }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }
        
        console.log(`✅ Progress synced: ${username}`);
        
        res.json({ 
            success: true, 
            message: 'Progress synced successfully',
            syncedTopics: Object.keys(dbProgress).length
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

// NEW: Update lesson completion for a specific topic
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
        
        // Initialize progress object if it doesn't exist
        if (!user.progress) {
            user.progress = {};
        }
        
        if (!user.progress[topicName]) {
            user.progress[topicName] = {
                tutorialCompleted: false,
                puzzleCompleted: false,
                score: 0,
                progressPercentage: 0,
                lastAccessed: new Date().toISOString(),
                timeSpent: 0
            };
        }
        
        // Update lessons completed
        user.progress[topicName].lessonsCompleted = lessonsCompleted;
        user.progress[topicName].lastAccessed = new Date().toISOString();
        
        // Update in database
        const result = await usersCollection.updateOne(
            { username },
            { 
                $set: { 
                    [`progress.${topicName}.lessonsCompleted`]: lessonsCompleted,
                    [`progress.${topicName}.lastAccessed`]: new Date().toISOString()
                } 
            }
        );
        
        console.log(`✅ Lessons updated for ${username}: ${topicName} = ${lessonsCompleted}`);
        
        res.json({ 
            success: true, 
            message: 'Lesson completion updated',
            topicName,
            lessonsCompleted 
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
                    lessonsCompleted: topic.lessonsCompleted || 0 // NEW: Include lessons completed
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
                        lessonsCompleted: topic.lessonsCompleted || 0 // NEW
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

// ==================== START SERVER ====================

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log('\n==================================================');
        console.log('🚀 StructuReality Server v2.1 - With Lesson Tracking');
        console.log('==================================================');
        console.log(`📡 Server: http://localhost:${PORT}`);
        console.log(`🎛️ Admin: http://localhost:${PORT}/admin.html`);
        console.log(`💾 Database: ${DB_NAME}`);
        console.log(`📚 Collections: users, lessons`);
        console.log(`✨ New Feature: Lesson completion tracking`);
        console.log('==================================================\n');
    });
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await client.close();
    process.exit(0);
});