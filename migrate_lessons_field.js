// Migration Script: Add lessonsCompleted field to existing users
// Run this once to update your database

const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGODB_URI = "mongodb+srv://structureality_admin:oG4qBQnbGLLyBF4f@structureality-cluster.chm4r6c.mongodb.net/?appName=StructuReality-Cluster";
const DB_NAME = "structureality_db";
const USERS_COLLECTION = "users";

async function migrateDatabase() {
    const client = new MongoClient(MONGODB_URI, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });

    try {
        console.log('🔄 Connecting to MongoDB...');
        await client.connect();
        
        const db = client.db(DB_NAME);
        const usersCollection = db.collection(USERS_COLLECTION);
        
        console.log('📊 Fetching all users...');
        const users = await usersCollection.find({}).toArray();
        
        console.log(`✓ Found ${users.length} users to migrate`);
        
        let migratedCount = 0;
        
        for (const user of users) {
            let needsUpdate = false;
            const updates = {};
            
            // Check each topic in progress
            if (user.progress) {
                for (const topicName of Object.keys(user.progress)) {
                    const topic = user.progress[topicName];
                    
                    // Add lessonsCompleted if it doesn't exist
                    if (topic.lessonsCompleted === undefined) {
                        updates[`progress.${topicName}.lessonsCompleted`] = 0;
                        needsUpdate = true;
                    }
                    
                    // Add other missing fields with defaults
                    if (topic.progressPercentage === undefined) {
                        updates[`progress.${topicName}.progressPercentage`] = 0;
                        needsUpdate = true;
                    }
                    
                    if (topic.lastAccessed === undefined) {
                        updates[`progress.${topicName}.lastAccessed`] = '';
                        needsUpdate = true;
                    }
                    
                    if (topic.timeSpent === undefined) {
                        updates[`progress.${topicName}.timeSpent`] = 0;
                        needsUpdate = true;
                    }
                }
            }
            
            if (needsUpdate) {
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: updates }
                );
                
                migratedCount++;
                console.log(`✓ Migrated user: ${user.username}`);
            }
        }
        
        console.log('\n==================================================');
        console.log(`✅ Migration complete!`);
        console.log(`📊 Total users: ${users.length}`);
        console.log(`🔄 Users migrated: ${migratedCount}`);
        console.log(`✓ Users already up-to-date: ${users.length - migratedCount}`);
        console.log('==================================================\n');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await client.close();
        console.log('🔌 Database connection closed');
    }
}

// Run migration
migrateDatabase();