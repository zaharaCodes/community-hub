require('dotenv').config();
const mongoose = require('mongoose');
const Resource = require('./models/Resource');

const sampleResources = [
    {
        name: "Downtown Food Pantry",
        category: "food",
        location: "Seattle, WA",
        contact: "(206) 555-0100",
        description: "Free groceries available Monday, Wednesday, Friday 10am-2pm. No ID required. Serving 200+ families weekly."
    },
    {
        name: "Hope Shelter",
        category: "shelter",
        location: "Portland, OR",
        contact: "www.hopeshelter.org",
        description: "Emergency shelter with 50 beds. Hot meals provided. Case management and job placement assistance available."
    },
    {
        name: "Community Health Center",
        category: "health",
        location: "San Francisco, CA",
        contact: "(415) 555-0200",
        description: "Free and low-cost healthcare. Walk-in clinic open Mon-Fri 8am-6pm. No insurance needed."
    },
    {
        name: "Crisis Counseling Hotline",
        category: "mental",
        location: "Nationwide",
        contact: "1-800-555-0300",
        description: "24/7 free mental health support. Trained counselors available. Text or call anytime. Completely confidential."
    },
    {
        name: "Tech Skills Training Center",
        category: "job",
        location: "Austin, TX",
        contact: "www.techskills.org",
        description: "Free coding bootcamp and job placement program. No experience needed. 12-week program with guaranteed interviews."
    },
    {
        name: "Free Legal Aid Society",
        category: "legal",
        location: "Chicago, IL",
        contact: "(312) 555-0400",
        description: "Pro bono legal services for housing, family law, and immigration. Free consultations every Tuesday 9am-12pm."
    },
    {
        name: "Adult Learning Center",
        category: "education",
        location: "Boston, MA",
        contact: "www.adultlearning.edu",
        description: "Free GED classes, ESL courses, and computer literacy. Evening classes available. Childcare provided."
    },
    {
        name: "Veterans Support Network",
        category: "other",
        location: "Denver, CO",
        contact: "(303) 555-0500",
        description: "Comprehensive support for veterans. Housing assistance, job placement, mental health services, and peer support groups."
    }
];

async function seedDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        // Clear existing resources
        await Resource.deleteMany({});
        console.log('🗑️  Cleared existing resources');
        
        // Insert sample data
        const inserted = await Resource.insertMany(sampleResources);
        console.log(`✨ Added ${inserted.length} sample resources`);
        
        console.log('\n📋 Sample Resources:');
        inserted.forEach((resource, index) => {
            console.log(`${index + 1}. ${resource.name} (${resource.category})`);
        });
        
        mongoose.connection.close();
        console.log('\n✅ Database seeding completed!');
    } catch (error) {
        console.error('❌ Seeding error:', error);
        process.exit(1);
    }
}

seedDatabase();