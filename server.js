const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://structureality_admin:oG4qBQnbGLLyBF4f@structureality-cluster.chm4r6c.mongodb.net/?appName=StructuReality-Cluster";
const DB_NAME = "structureality_db";
const COLLECTION_NAME = "users";

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

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db(DB_NAME);
        usersCollection = db.collection(COLLECTION_NAME);
        
        // Create indexes for better performance
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        
        console.log("✅ Connected to MongoDB Atlas!");
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error);
        process.exit(1);
    }
}

// ==================== ROOT & HEALTH CHECK ROUTES ====================

app.get('/', (req, res) => {
    res.json({
        status: '✅ StructuReality Server is running',
        version: '1.0.0',
        database: db ? 'Connected' : 'Disconnected',
        endpoints: {
            health: '/',
            api: '/api',
            progress: '/api/progress',
            users: '/api/users',
            stats: '/api/stats',
            admin: '/admin.html'
        },
        message: 'Server is ready to accept Unity connections'
    });
});

app.get('/api', (req, res) => {
    res.json({
        status: '✅ API is running',
        version: '1.0.0',
        endpoints: {
            'GET  /api/progress': 'Get all users progress',
            'GET  /api/progress/:username': 'Get specific user progress',
            'PUT  /api/progress/:username': 'Sync user progress from Unity',
            'POST /api/users': 'Register new user',
            'GET  /api/users': 'Get all users (admin)',
            'POST /api/login': 'Login user',
            'GET  /api/stats': 'Get server statistics',
            'DELETE /api/users/:username': 'Delete user (admin)'
        }
    });
});

// ==================== API ENDPOINTS ====================

// 1. Register New User
app.post('/api/users', async (req, res) => {
    try {
        const userData = req.body;
        
        if (!userData.registerDate) {
            userData.registerDate = new Date().toISOString();
        }
        
        // ✅ FIXED: Topic names now match Unity
        if (!userData.progress) {
            userData.progress = {
                Queue: { tutorialCompleted: false, puzzleCompleted: false, score: 0 },
                Stacks: { tutorialCompleted: false, puzzleCompleted: false, score: 0 },
                LinkedLists: { tutorialCompleted: false, puzzleCompleted: false, score: 0 },
                Trees: { tutorialCompleted: false, puzzleCompleted: false, score: 0 },
                Graphs: { tutorialCompleted: false, puzzleCompleted: false, score: 0 }
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
        
        console.log(`✅ New user registered: ${userData.username} (${userData.name})`);
        res.status(201).json({ 
            success: true, 
            message: 'User registered successfully',
            userId: result.insertedId 
        });
        
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to register user',
            details: error.message 
        });
    }
});

// 2. Login User
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
                    lastLogin: new Date().toISOString(),
                    streak: calculateStreak(user.lastLogin, user.streak)
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
        console.error('Error logging in:', error);
        res.status(500).json({ 
            success: false,
            error: 'Login failed',
            details: error.message 
        });
    }
});

// ==================== UNITY PROGRESS SYNC ENDPOINTS ====================

// Unity Progress Sync - PUT /api/progress/:username
app.put('/api/progress/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const progressData = req.body;
        
        console.log('📥 Unity progress sync received:', username);
        console.log('Data:', JSON.stringify(progressData, null, 2));
        
        // Transform Unity progress format to database format
        const dbProgress = {};
        
        if (progressData.topics && Array.isArray(progressData.topics)) {
            progressData.topics.forEach(topic => {
                dbProgress[topic.topicName] = {
                    tutorialCompleted: topic.tutorialCompleted || false,
                    puzzleCompleted: topic.puzzleCompleted || false,
                    score: topic.puzzleScore || 0,
                    progressPercentage: topic.progressPercentage || 0,
                    lastAccessed: topic.lastAccessed || new Date().toISOString(),
                    timeSpent: topic.timeSpent || 0
                };
            });
        }
        
        const result = await usersCollection.updateOne(
            { username: username },
            { 
                $set: { 
                    progress: dbProgress,
                    streak: progressData.streak || 0,
                    completedTopics: progressData.completedTopics || 0,
                    lastUpdated: progressData.lastUpdated || new Date().toISOString()
                } 
            },
            { upsert: false }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found. Please register first.' 
            });
        }
        
        console.log(`✅ Progress synced for: ${username}`);
        res.json({ 
            success: true, 
            message: 'Progress synced successfully',
            syncedTopics: Object.keys(dbProgress).length
        });
        
    } catch (error) {
        console.error('❌ Error syncing Unity progress:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to sync progress',
            details: error.message 
        });
    }
});

// Get Progress for User
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
                    timeSpent: topic.timeSpent || 0
                });
            });
        }
        
        res.json({
            success: true,
            username: user.username,
            name: user.name || '',
            streak: user.streak || 0,
            completedTopics: user.completedTopics || 0,
            lastUpdated: user.lastUpdated || '',
            topics: topics
        });
        
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch progress' 
        });
    }
});

// Get All Users Progress
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
                        timeSpent: topic.timeSpent || 0
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
        console.error('Error fetching all progress:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch progress data' 
        });
    }
});

// ==================== ADMIN ENDPOINTS ====================

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
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch users' 
        });
    }
});

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
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch statistics' 
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
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to delete user' 
        });
    }
});

function calculateStreak(lastLogin, currentStreak) {
    if (!lastLogin) return 1;
    
    const lastLoginDate = new Date(lastLogin);
    const now = new Date();
    const diffDays = Math.floor((now - lastLoginDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return (currentStreak || 0) + 1;
    } else if (diffDays > 1) {
        return 1;
    }
    return currentStreak || 1;
}

// ==================== START SERVER ====================

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log('\n==================================================');
        console.log('🚀 StructuReality Server Running with MongoDB!');
        console.log('==================================================');
        console.log(`📡 Server: http://localhost:${PORT}`);
        console.log(`🎛️ Admin Panel: http://localhost:${PORT}/admin.html`);
        console.log(`💾 Database: MongoDB Atlas (${DB_NAME})`);
        console.log('==================================================');
        console.log('📍 Topic Names: Queue, Stacks, LinkedLists, Trees, Graphs');
        console.log('==================================================\n');
    });
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await client.close();
    process.exit(0);
});