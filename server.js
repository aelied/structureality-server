const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const crypto = require('crypto'); // ← ADD THIS - Required for token generation
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from 'public' directory
app.use(express.static('public'));

// ==================== SENDGRID CONFIGURATION ====================
// Configure SendGrid with API key
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid API key configured');
} else {
    console.error('❌ SENDGRID_API_KEY not found in environment variables!');
}

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://structureality_admin:oG4qBQnbGLLyBF4f@structureality-cluster.chm4r6c.mongodb.net/?appName=StructuReality-Cluster";
const DB_NAME = "structureality_db";
const USERS_COLLECTION = "users";
const LESSONS_COLLECTION = "lessons";
const QUIZZES_COLLECTION = "quizzes";
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
let quizzesCollection;

// Store reset tokens temporarily (in production, use Redis or database)
const resetTokens = new Map();

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db(DB_NAME);
        usersCollection = db.collection(USERS_COLLECTION);
        lessonsCollection = db.collection(LESSONS_COLLECTION);
        adminsCollection = db.collection(ADMINS_COLLECTION);
        quizzesCollection = db.collection(QUIZZES_COLLECTION);  // ✅ ADD THIS LINE

        // Create indexes
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await lessonsCollection.createIndex({ topicName: 1, order: 1 });
        await quizzesCollection.createIndex({ topicName: 1, order: 1 });  // ✅ ADD THIS LINE
        await adminsCollection.createIndex({ username: 1 }, { unique: true });

        console.log("✅ Connected to MongoDB Atlas!");
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error);
        process.exit(1);
    }
}


// ==================== UPDATED QUIZ ENDPOINTS WITH DIFFICULTY ====================

// Get quizzes by topic and difficulty (UPDATED)
app.get('/api/quizzes/:topicName/:difficulty?', async (req, res) => {
    try {
        const { topicName, difficulty } = req.params;
        
        let query = { topicName: topicName };
        
        // Filter by difficulty if provided
        if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty.toLowerCase())) {
            query.difficulty = difficulty.toLowerCase();
        }
        
        const quizzes = await quizzesCollection.find(query)
            .sort({ difficulty: 1, order: 1 })  // Sort by difficulty then order
            .toArray();

        res.json({
            success: true,
            topicName: topicName,
            difficulty: difficulty || 'all',
            count: quizzes.length,
            quizzes: quizzes
        });
    } catch (error) {
        console.error('Error fetching topic quizzes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch quizzes',
            details: error.message
        });
    }
});

// ==================== QUIZ ENDPOINTS ====================

// Get all quizzes
app.get('/api/quizzes', async (req, res) => {
    try {
        const quizzes = await quizzesCollection.find({})
            .sort({ topicName: 1, order: 1 })
            .toArray();

        res.json({
            success: true,
            count: quizzes.length,
            quizzes: quizzes
        });
    } catch (error) {
        console.error('Error fetching quizzes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch quizzes',
            details: error.message
        });
    }
});

// Get quizzes by topic
app.get('/api/quizzes/:topicName', async (req, res) => {
    try {
        const quizzes = await quizzesCollection.find({
            topicName: req.params.topicName
        })
            .sort({ order: 1 })
            .toArray();

        res.json({
            success: true,
            topicName: req.params.topicName,
            count: quizzes.length,
            quizzes: quizzes
        });
    } catch (error) {
        console.error('Error fetching topic quizzes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch quizzes',
            details: error.message
        });
    }
});

// Add new quiz question
app.post('/api/quizzes', async (req, res) => {
    try {
        const quizData = {
            topicName: req.body.topicName,
            questionText: req.body.questionText,
            answerOptions: req.body.answerOptions,
            correctAnswerIndex: parseInt(req.body.correctAnswerIndex),
            explanation: req.body.explanation,
            difficulty: (req.body.difficulty || 'medium').toLowerCase(), // Default to medium
            order: req.body.order || 1,
            createdAt: new Date().toISOString()
        };

        // Validation
        if (!quizData.topicName || !quizData.questionText || !quizData.answerOptions || 
            quizData.correctAnswerIndex === undefined || !quizData.explanation) {
            return res.status(400).json({
                success: false,
                error: 'Topic name, question, answers, correct answer index, and explanation are required'
            });
        }

        if (!['easy', 'medium', 'hard'].includes(quizData.difficulty)) {
            return res.status(400).json({
                success: false,
                error: 'Difficulty must be easy, medium, or hard'
            });
        }

        if (!Array.isArray(quizData.answerOptions) || quizData.answerOptions.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 answer options are required'
            });
        }

        if (quizData.correctAnswerIndex < 0 || quizData.correctAnswerIndex >= quizData.answerOptions.length) {
            return res.status(400).json({
                success: false,
                error: 'Invalid correct answer index'
            });
        }

        const result = await quizzesCollection.insertOne(quizData);
        console.log(`✅ New quiz added: ${quizData.questionText.substring(0, 50)}... (${quizData.topicName} - ${quizData.difficulty})`);

        res.status(201).json({
            success: true,
            message: 'Quiz question added successfully',
            quizId: result.insertedId
        });
    } catch (error) {
        console.error('Error adding quiz:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add quiz question',
            details: error.message
        });
    }
});

// Update quiz question
app.put('/api/quizzes/:quizId', async (req, res) => {
    try {
        const updateData = {
            questionText: req.body.questionText,
            answerOptions: req.body.answerOptions,
            correctAnswerIndex: parseInt(req.body.correctAnswerIndex),
            explanation: req.body.explanation,
            difficulty: req.body.difficulty ? req.body.difficulty.toLowerCase() : undefined,
            order: req.body.order,
            updatedAt: new Date().toISOString()
        };

        // Remove undefined fields
        Object.keys(updateData).forEach(key =>
            updateData[key] === undefined && delete updateData[key]
        );

        // Validate difficulty if provided
        if (updateData.difficulty && !['easy', 'medium', 'hard'].includes(updateData.difficulty)) {
            return res.status(400).json({
                success: false,
                error: 'Difficulty must be easy, medium, or hard'
            });
        }

        const result = await quizzesCollection.updateOne(
            { _id: new ObjectId(req.params.quizId) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Quiz question not found'
            });
        }

        console.log(`✅ Quiz updated: ${req.params.quizId}`);
        res.json({
            success: true,
            message: 'Quiz question updated successfully'
        });
    } catch (error) {
        console.error('Error updating quiz:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update quiz question',
            details: error.message
        });
    }
});

// Delete quiz question
app.delete('/api/quizzes/:quizId', async (req, res) => {
    try {
        const result = await quizzesCollection.deleteOne({
            _id: new ObjectId(req.params.quizId)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Quiz question not found'
            });
        }

        console.log(`🗑️ Quiz deleted: ${req.params.quizId}`);
        res.json({
            success: true,
            message: 'Quiz question deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting quiz:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete quiz question',
            details: error.message
        });
    }
});

// Get quiz statistics
app.get('/api/quizzes-stats', async (req, res) => {
    try {
        const quizzes = await quizzesCollection.find({}).toArray();
        
        const stats = {
            total: quizzes.length,
            byTopic: {},
            byDifficulty: {
                easy: 0,
                medium: 0,
                hard: 0
            }
        };

        quizzes.forEach(quiz => {
            // Count by topic
            if (!stats.byTopic[quiz.topicName]) {
                stats.byTopic[quiz.topicName] = {
                    total: 0,
                    easy: 0,
                    medium: 0,
                    hard: 0
                };
            }
            stats.byTopic[quiz.topicName].total++;
            
            // Count by difficulty
            const difficulty = quiz.difficulty || 'medium';
            stats.byTopic[quiz.topicName][difficulty]++;
            stats.byDifficulty[difficulty]++;
        });

        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch quiz statistics'
        });
    }
});


// ==================== ROOT & HEALTH CHECK ====================
app.get('/', (req, res) => {
    res.json({
        status: '✅ StructuReality Server is running',
        version: '2.6.0', // Updated version with SendGrid
        database: db ? 'Connected' : 'Disconnected',
        email: process.env.SENDGRID_API_KEY ? 'SendGrid Ready' : 'Email Not Configured',
        collections: ['users', 'lessons', 'admins'],
        features: ['User Management', 'Progress Tracking', 'Password Reset', 'Lesson Management'],
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

// ==================== PASSWORD RESET ENDPOINTS ====================

// Request password reset
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        console.log(`🔑 Password reset requested for: ${email}`);

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // Check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.error('❌ SendGrid not configured - cannot send email');
            return res.status(500).json({
                success: false,
                error: 'Email service not configured. Please contact support.'
            });
        }

        // Find user by email
        const user = await usersCollection.findOne({ email: email });

        if (!user) {
            // For security, don't reveal if email exists
            console.log(`⚠️ Password reset requested for non-existent email: ${email}`);
            return res.json({
                success: true,
                message: 'If that email exists, a reset link has been sent'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour

        // Store token
        resetTokens.set(resetToken, {
            username: user.username,
            email: user.email,
            expiry: resetTokenExpiry
        });

        // Create reset link
        const resetLink = `https://structureality-admin.onrender.com/reset-password.html?token=${resetToken}`;
        
        // SendGrid email message
        const msg = {
            to: email,
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'quelangliezl@gmail.com',
                name: 'StructuReality'
            },
            subject: 'StructuReality - Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Password Reset</h1>
                    </div>
                    
                    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                        <p style="font-size: 16px; color: #333;">Hello <strong>${user.name || user.username}</strong>,</p>
                        
                        <p style="font-size: 14px; color: #666; line-height: 1.6;">
                            You requested to reset your password for your StructuReality account. 
                            Click the button below to create a new password:
                        </p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetLink}" 
                               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                      color: white; 
                                      padding: 14px 40px; 
                                      text-decoration: none; 
                                      border-radius: 8px;
                                      display: inline-block;
                                      font-weight: bold;
                                      font-size: 16px;">
                                Reset My Password
                            </a>
                        </div>
                        
                        <p style="font-size: 12px; color: #999; margin-top: 20px;">
                            Or copy and paste this link into your browser:
                        </p>
                        <p style="font-size: 11px; color: #667eea; word-break: break-all; background: white; padding: 10px; border-radius: 5px;">
                            ${resetLink}
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #999;">
                            ⏱️ This link will expire in <strong>1 hour</strong><br>
                            🔒 If you didn't request this, please ignore this email<br>
                            📧 This is an automated message, please do not reply
                        </p>
                    </div>
                </div>
            `
        };

        console.log('📤 Attempting to send email via SendGrid...');
        console.log(`   To: ${email}`);
        console.log(`   From: ${msg.from.email}`);
        
        try {
            await sgMail.send(msg);
            console.log(`✅ Password reset email sent successfully to: ${email}`);
            
            res.json({
                success: true,
                message: 'If that email exists, a reset link has been sent'
            });
        } catch (emailError) {
            console.error('❌ SendGrid error:', emailError.response?.body?.errors || emailError.message);
            
            // Still return success for security (don't reveal if email exists)
            res.json({
                success: true,
                message: 'If that email exists, a reset link has been sent'
            });
        }

    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process password reset request',
            details: error.message
        });
    }
});

// Verify reset token
app.get('/api/verify-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const tokenData = resetTokens.get(token);

        if (!tokenData) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }

        if (Date.now() > tokenData.expiry) {
            resetTokens.delete(token);
            return res.status(400).json({
                success: false,
                error: 'Reset token has expired'
            });
        }

        res.json({
            success: true,
            username: tokenData.username
        });

    } catch (error) {
        console.error('❌ Token verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify token'
        });
    }
});

// Reset password with token
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        console.log(`🔑 Password reset attempt with token`);

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Token and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters'
            });
        }

        const tokenData = resetTokens.get(token);

        if (!tokenData) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }

        if (Date.now() > tokenData.expiry) {
            resetTokens.delete(token);
            return res.status(400).json({
                success: false,
                error: 'Reset token has expired'
            });
        }

        // Update password in database
        await usersCollection.updateOne(
            { username: tokenData.username },
            {
                $set: {
                    password: newPassword,
                    lastUpdated: new Date().toISOString()
                }
            }
        );

        // Delete used token
        resetTokens.delete(token);

        console.log(`✅ Password reset successful for: ${tokenData.username}`);

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('❌ Password reset error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset password',
            details: error.message
        });
    }
});

// Clean up expired tokens periodically (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, data] of resetTokens.entries()) {
        if (now > data.expiry) {
            resetTokens.delete(token);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} expired reset tokens`);
    }
}, 600000);
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
        // ✅ FIX: Accept loginIdentifier OR fallback to old format
        const { loginIdentifier, username, email, password } = req.body;
        
        // Use new format if available, otherwise fallback to old format
        const identifier = loginIdentifier || username || email;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                error: 'Username or email is required'
            });
        }

        // Search by EITHER username OR email
        const user = await usersCollection.findOne({
            $or: [
                { username: identifier },
                { email: identifier }
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

        // Update last login
        await usersCollection.updateOne(
            { _id: user._id },
            {
                $set: {
                    lastLogin: new Date().toISOString()
                }
            }
        );

        console.log(`🔐 User logged in: ${user.username}`);
        
        // ✅ FIX: Return ACTUAL database values, never use input as fallback
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                username: user.username,           // From database
                name: user.name || user.username,  // From database
                email: user.email || '',           // From database - empty if not set
                streak: user.streak || 0,
                completedTopics: user.completedTopics || 0
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
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

        // ✅ FIX: Validate email before sending
        let validEmail = user.email || '';
        
        // Check if email is actually valid (not placeholder, not same as username)
        if (validEmail && (
            validEmail === user.username || 
            !validEmail.includes('@') || 
            validEmail.includes('@example.com')
        )) {
            console.log(`⚠️ User ${user.username} has invalid email: '${validEmail}' - returning empty`);
            validEmail = '';
        }

        // IMPORTANT: Return format that matches UserDataResponse in Unity
        res.json({
            username: user.username,
            name: user.name || user.username,
            email: validEmail,  // ✅ Only send valid email or empty string
            streak: user.streak || 0,
            completedTopics: user.completedTopics || 0
        });
    } catch (error) {
        console.error('Error fetching user:', error);
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

        const existingUser = await usersCollection.findOne({ username: username });

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Initialize with existing progress or empty object
        const mergedProgress = existingUser.progress || {};

        // ✅ Fetch lesson counts from database
        const lessonCounts = {};
        const allLessons = await lessonsCollection.find({}).toArray();
        
        allLessons.forEach(lesson => {
            const normalizedTopic = lesson.topicName.trim();
            if (!lessonCounts[normalizedTopic]) {
                lessonCounts[normalizedTopic] = 0;
            }
            lessonCounts[normalizedTopic]++;
        });

        console.log('📚 Lesson counts per topic:', lessonCounts);

        // ✅ CALCULATE STREAK FIRST (before using it)
        let newStreak = existingUser.streak || 0;
        if (newStreak === 0 && existingUser.streak === undefined) newStreak = 1;

        const now = new Date();

        if (existingUser.lastActivity) {
            const lastActivity = new Date(existingUser.lastActivity);
            const toDateString = (d) => d.toISOString().split('T')[0];
            const todayStr = toDateString(now);
            const lastActiveStr = toDateString(lastActivity);
            const msPerDay = 1000 * 60 * 60 * 24;
            const todayDate = new Date(todayStr);
            const lastActiveDate = new Date(lastActiveStr);
            const diffDays = Math.floor((todayDate - lastActiveDate) / msPerDay);

            if (diffDays === 1) {
                newStreak = (existingUser.streak || 0) + 1;
                console.log(`🔥 Streak incremented to ${newStreak}`);
            } else if (diffDays === 0) {
                newStreak = existingUser.streak || 1;
                console.log(`✓ Streak maintained at ${newStreak}`);
            } else {
                if (existingUser.streak > 0) {
                    console.log(`❌ Streak broken. Reset to 1`);
                }
                newStreak = 1;
            }
        } else {
            newStreak = 1;
        }

        // ✅ NOW process topics (after streak is calculated)
        if (progressData.topics && Array.isArray(progressData.topics)) {
            progressData.topics.forEach(topic => {
                const totalLessonsForTopic = lessonCounts[topic.topicName] || 5;
                
                // ✅ CRITICAL FIX: Get existing difficulty scores or initialize
                const existingTopic = mergedProgress[topic.topicName] || {};
                const existingDifficultyScores = existingTopic.difficultyScores || {
                    easy: 0,
                    medium: 0,
                    hard: 0,
                    mixed: 0
                };
                
                // ✅ Merge incoming difficulty scores with existing ones (keep highest)
                const finalDifficultyScores = {
                    easy: Math.max(existingDifficultyScores.easy, topic.difficultyScores?.easy || 0),
                    medium: Math.max(existingDifficultyScores.medium, topic.difficultyScores?.medium || 0),
                    hard: Math.max(existingDifficultyScores.hard, topic.difficultyScores?.hard || 0),
                    mixed: Math.max(existingDifficultyScores.mixed, topic.difficultyScores?.mixed || 0)
                };
                
                let lessonProgress = 0;
                let puzzleProgress = 0;
                
                // 50% weight for lessons
                if (topic.lessonsCompleted > 0 && totalLessonsForTopic > 0) {
                    lessonProgress = (topic.lessonsCompleted / totalLessonsForTopic) * 50;
                    lessonProgress = Math.min(50, lessonProgress);
                }
                
                // ✅ 50% weight for puzzles - Count how many difficulties are completed (> 0%)
                // ANY score above 0 means the difficulty was attempted and completed
                const difficulties = ['easy', 'medium', 'hard', 'mixed'];
                let completedDifficulties = 0;
                
                difficulties.forEach(diff => {
                    if (finalDifficultyScores[diff] > 0) {
                        completedDifficulties++;
                        puzzleProgress += 12.5; // Each difficulty = 12.5%
                    }
                });
                
                const calculatedProgress = Math.min(100, lessonProgress + puzzleProgress);
                
                console.log(`📊 ${topic.topicName}:`);
                console.log(`   Lessons: ${topic.lessonsCompleted}/${totalLessonsForTopic} = ${lessonProgress.toFixed(1)}%`);
                console.log(`   Puzzle Scores: Easy=${finalDifficultyScores.easy}%, Med=${finalDifficultyScores.medium}%, Hard=${finalDifficultyScores.hard}%, Mix=${finalDifficultyScores.mixed}%`);
                console.log(`   Completed Difficulties: ${completedDifficulties}/4`);
                console.log(`   Puzzle Progress: ${puzzleProgress}%`);
                console.log(`   Total: ${calculatedProgress.toFixed(1)}%`);
                
                // ✅ Use the preserved/merged difficulty scores
                mergedProgress[topic.topicName] = {
                    tutorialCompleted: topic.tutorialCompleted === true,
                    puzzleCompleted: completedDifficulties >= 4, // All 4 difficulties done
                    score: Math.max(
                        parseInt(topic.puzzleScore || topic.score || 0),
                        finalDifficultyScores.easy,
                        finalDifficultyScores.medium,
                        finalDifficultyScores.hard,
                        finalDifficultyScores.mixed
                    ),
                    progressPercentage: calculatedProgress,
                    lastAccessed: topic.lastAccessed || new Date().toISOString(),
                    timeSpent: parseFloat(topic.timeSpent || 0),
                    lessonsCompleted: parseInt(topic.lessonsCompleted || 0),
                    difficultyScores: finalDifficultyScores // ✅ USE MERGED SCORES!
                };
            });
        }

        const updateData = {
            progress: mergedProgress,
            streak: newStreak,
            completedTopics: parseInt(progressData.completedTopics || 0),
            lastUpdated: progressData.lastUpdated || new Date().toISOString(),
            lastActivity: now.toISOString(),
        };

        if (progressData.name) updateData.name = progressData.name;
        if (progressData.email) updateData.email = progressData.email;

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


app.post('/api/admin/migrate-difficulty-scores', async (req, res) => {
    try {
        console.log('🔄 Starting difficultyScores migration...');
        
        const users = await usersCollection.find({}).toArray();
        let updated = 0;
        
        for (const user of users) {
            if (user.progress) {
                const updates = {};
                
                Object.keys(user.progress).forEach(topicName => {
                    // If difficultyScores doesn't exist, add it
                    if (!user.progress[topicName].difficultyScores) {
                        updates[`progress.${topicName}.difficultyScores`] = {
                            easy: 0,
                            medium: 0,
                            hard: 0,
                            mixed: 0
                        };
                    }
                });
                
                if (Object.keys(updates).length > 0) {
                    await usersCollection.updateOne(
                        { _id: user._id },
                        { $set: updates }
                    );
                    updated++;
                    console.log(`✅ Updated user: ${user.username}`);
                }
            }
        }
        
        console.log(`✅ Migration complete: ${updated} users updated`);
        
        res.json({
            success: true,
            message: 'Migration completed',
            usersUpdated: updated
        });
    } catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({
            success: false,
            error: 'Migration failed',
            details: error.message
        });
    }
});

app.post('/api/progress/:username/difficulty', async (req, res) => {
    try {
        const { username } = req.params;
        const { topicName, difficulty, score } = req.body;

        // ✅ Normalize difficulty to lowercase
        const normalizedDifficulty = (difficulty || '').toLowerCase().trim();
        
        console.log(`🎯 Difficulty score update: ${username} - ${topicName} - ${normalizedDifficulty} - ${score}%`);

        if (!topicName || !normalizedDifficulty || score === undefined) {
            return res.status(400).json({
                success: false,
                error: 'topicName, difficulty, and score are required'
            });
        }

        // ✅ Validate normalized difficulty
        const validDifficulties = ['easy', 'medium', 'hard', 'mixed'];
        if (!validDifficulties.includes(normalizedDifficulty)) {
            return res.status(400).json({
                success: false,
                error: `Invalid difficulty: ${difficulty}. Must be one of: ${validDifficulties.join(', ')}`
            });
        }

        const user = await usersCollection.findOne({ username });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Initialize if missing
        if (!user.progress || !user.progress[topicName]) {
            await usersCollection.updateOne(
                { username },
                {
                    $set: {
                        [`progress.${topicName}`]: {
                            tutorialCompleted: false,
                            puzzleCompleted: false,
                            score: 0,
                            progressPercentage: 0,
                            lastAccessed: new Date().toISOString(),
                            timeSpent: 0,
                            lessonsCompleted: 0,
                            difficultyScores: {
                                easy: 0,
                                medium: 0,
                                hard: 0,
                                mixed: 0
                            }
                        }
                    }
                }
            );
        } else if (!user.progress[topicName].difficultyScores) {
            await usersCollection.updateOne(
                { username },
                {
                    $set: {
                        [`progress.${topicName}.difficultyScores`]: {
                            easy: 0,
                            medium: 0,
                            hard: 0,
                            mixed: 0
                        }
                    }
                }
            );
        }

        // ✅ Update the specific difficulty score (only if new score is higher)
        const currentScore = user.progress[topicName]?.difficultyScores?.[normalizedDifficulty] || 0;
        const newScore = Math.max(currentScore, parseInt(score));
        
        const updateResult = await usersCollection.updateOne(
            { username },
            {
                $set: {
                    [`progress.${topicName}.difficultyScores.${normalizedDifficulty}`]: newScore,
                    [`progress.${topicName}.lastAccessed`]: new Date().toISOString()
                }
            }
        );

        console.log(`📝 Update result: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);

        // ✅ Fetch updated user to recalculate progress
        const updatedUser = await usersCollection.findOne({ username });
        const topicProgress = updatedUser.progress[topicName];
        
        // Get lesson count
        const lessonCount = await lessonsCollection.countDocuments({ topicName: topicName });
        
        // Calculate lesson progress (50%)
        let lessonProgress = 0;
        if (lessonCount > 0 && topicProgress.lessonsCompleted > 0) {
            lessonProgress = (topicProgress.lessonsCompleted / lessonCount) * 50;
            lessonProgress = Math.min(50, lessonProgress);
        }
        
        // ✅ Calculate puzzle progress - Count completed difficulties (> 0%)
        let puzzleProgress = 0;
        let completedDifficulties = 0;
        const difficulties = ['easy', 'medium', 'hard', 'mixed'];
        
        difficulties.forEach(diff => {
            if (topicProgress.difficultyScores && topicProgress.difficultyScores[diff] > 0) {
                puzzleProgress += 12.5;
                completedDifficulties++;
            }
        });
        
        const totalProgress = Math.min(100, lessonProgress + puzzleProgress);
        const allDifficultiesDone = completedDifficulties >= 4; // All 4 completed
        
        // Update progress percentage and puzzleCompleted flag
        await usersCollection.updateOne(
            { username },
            {
                $set: {
                    [`progress.${topicName}.progressPercentage`]: totalProgress,
                    [`progress.${topicName}.puzzleCompleted`]: allDifficultiesDone,
                    [`progress.${topicName}.score`]: Math.max(
                        topicProgress.score || 0,
                        topicProgress.difficultyScores.easy,
                        topicProgress.difficultyScores.medium,
                        topicProgress.difficultyScores.hard,
                        topicProgress.difficultyScores.mixed
                    )
                }
            }
        );

        console.log(`✅ Difficulty score updated: ${topicName} ${normalizedDifficulty} = ${newScore}%`);
        console.log(`📊 Progress breakdown:`);
        console.log(`   Lesson progress: ${lessonProgress.toFixed(1)}%`);
        console.log(`   Puzzle progress: ${puzzleProgress}% (${completedDifficulties}/4 difficulties)`);
        console.log(`   Total progress: ${totalProgress.toFixed(1)}%`);

        res.json({
            success: true,
            message: 'Difficulty score updated',
            topicName,
            difficulty: normalizedDifficulty,
            score: newScore,
            totalProgress: totalProgress,
            puzzleCompleted: allDifficultiesDone,
            completedDifficulties: completedDifficulties
        });
    } catch (error) {
        console.error('❌ Error updating difficulty score:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update difficulty score',
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
        
        // ✅ FIX: If user has no progress, return EMPTY array (not null)
        if (user.progress && typeof user.progress === 'object') {
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
                    lessonsCompleted: topic.lessonsCompleted || 0,
                    difficultyScores: topic.difficultyScores || {
                        easy: 0,
                        medium: 0,
                        hard: 0,
                        mixed: 0
                    }
                });
            });
        }

        // ✅ CRITICAL: Always return success with data (even if empty)
        res.json({
            success: true,
            data: {
                username: user.username,
                name: user.name || '',
                email: user.email || '',
                streak: user.streak || 0,
                completedTopics: user.completedTopics || 0,
                lastUpdated: user.lastUpdated || '',
                topics: topics // ✅ Will be empty array [] for new users
            }
        });
        
        console.log(`📤 Sent progress for ${user.username}: ${topics.length} topics`);
        
    } catch (error) {
        console.error('❌ Error fetching progress:', error);
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

app.put('/api/users/:username/fix-email', async (req, res) => {
    try {
        const { username } = req.params;
        const { email } = req.body;
        
        console.log(`🔧 Fixing email for user: ${username}`);
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }
        
        // Check if email is already taken by another user
        const existingUser = await usersCollection.findOne({
            email: email,
            username: { $ne: username } // Not the current user
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Email is already registered to another user'
            });
        }
        
        // Update the email
        const result = await usersCollection.updateOne(
            { username: username },
            {
                $set: {
                    email: email,
                    lastUpdated: new Date().toISOString()
                }
            }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        console.log(`✅ Email fixed for ${username}: ${email}`);
        
        res.json({
            success: true,
            message: 'Email updated successfully',
            email: email
        });
    } catch (error) {
        console.error('❌ Error fixing email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update email',
            details: error.message
        });
    }
});

app.put('/api/users/:username/update-profile', async (req, res) => {
    try {
        const { username } = req.params;
        const { name, username: newUsername, email } = req.body;
        
        console.log(`🔧 Profile update request for user: ${username}`);
        console.log(`New data - Name: ${name}, Username: ${newUsername}, Email: ${email}`);
        
        // Validate required fields
        if (!name || !newUsername || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name, username, and email are required'
            });
        }
        
        // Check if user exists
        const existingUser = await usersCollection.findOne({ username: username });
        
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // If username is changing, check if new username is available
        if (newUsername !== username) {
            const usernameExists = await usersCollection.findOne({ 
                username: newUsername 
            });
            
            if (usernameExists) {
                return res.status(400).json({
                    success: false,
                    error: 'Username is already taken'
                });
            }
        }
        
        // If email is changing, check if new email is available
        if (email !== existingUser.email) {
            const emailExists = await usersCollection.findOne({ 
                email: email,
                username: { $ne: username } // Exclude current user
            });
            
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is already registered to another user'
                });
            }
        }
        
        // Prepare update data
        const updateData = {
            name: name,
            email: email,
            lastUpdated: new Date().toISOString()
        };
        
        // If username is changing, we need to update the username field too
        if (newUsername !== username) {
            updateData.username = newUsername;
        }
        
        // Update the user document
        const result = await usersCollection.updateOne(
            { username: username },
            { $set: updateData }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        console.log(`✅ Profile updated successfully for ${username}`);
        if (newUsername !== username) {
            console.log(`   Username changed: ${username} -> ${newUsername}`);
        }
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                username: newUsername,
                name: name,
                email: email
            }
        });
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile',
            details: error.message
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
            Arrays: { completions: 0, totalLessons: 0, totalScore: 0, totalTime: 0, users: 0 },
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
            Arrays: 'indigo',
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

// ==================== BULK QUIZ IMPORT (OPTIONAL) ====================
app.post('/api/quizzes/bulk', async (req, res) => {
    try {
        const { quizzes } = req.body;
        
        if (!Array.isArray(quizzes) || quizzes.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Quizzes array is required'
            });
        }
        
        const quizzesToInsert = quizzes.map(quiz => ({
            topicName: quiz.topicName,
            questionText: quiz.questionText,
            answerOptions: quiz.answerOptions,
            correctAnswerIndex: quiz.correctAnswerIndex,
            explanation: quiz.explanation,
            difficulty: (quiz.difficulty || 'medium').toLowerCase(),
            order: quiz.order || 1,
            createdAt: new Date().toISOString()
        }));
        
        const result = await quizzesCollection.insertMany(quizzesToInsert);
        
        console.log(`✅ Bulk imported ${result.insertedCount} quizzes`);
        
        res.json({
            success: true,
            message: `${result.insertedCount} quizzes added successfully`,
            insertedCount: result.insertedCount
        });
    } catch (error) {
        console.error('Error bulk importing quizzes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk import quizzes',
            details: error.message
        });
    }
});


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
