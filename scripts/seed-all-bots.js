#!/usr/bin/env node

/**
 * ===========================================
 * SMUPPY COMPREHENSIVE BOT SEEDING SCRIPT
 * Creates 50+ bot accounts covering all categories
 * ===========================================
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

// ============================================
// BOT PROFILES - 55 PROFILES COVERING ALL CATEGORIES
// ============================================

const BOT_PROFILES = [
  // ========== FITNESS & GYM ==========
  {
    email: "fitcoach.sarah@smuppy.bot",
    username: "FitCoach_Sarah",
    full_name: "Sarah Mitchell",
    bio: "Certified fitness coach helping you reach your goals",
    avatar_url: "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400",
    interests: ["Gym", "Fitness", "Cardio", "HIIT"],
    expertise: ["General Fitness", "Weight Loss", "Toning"]
  },
  {
    email: "strength.king@smuppy.bot",
    username: "StrengthKing",
    full_name: "James Power",
    bio: "Powerlifting champion. Lift heavy, stay humble",
    avatar_url: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400",
    interests: ["Weightlifting", "Gym", "Fitness"],
    expertise: ["Strength Training", "Muscle Building", "Powerlifting"]
  },
  {
    email: "bodytransform@smuppy.bot",
    username: "BodyTransformPro",
    full_name: "Mike Stevens",
    bio: "Body transformation specialist. 1000+ success stories",
    avatar_url: "https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=400",
    interests: ["Gym", "Fitness", "Nutrition"],
    expertise: ["Body Transformation", "Fat Loss Specialist", "Muscle Building"]
  },

  // ========== YOGA & PILATES ==========
  {
    email: "yoga.with.mia@smuppy.bot",
    username: "YogaWithMia",
    full_name: "Mia Chen",
    bio: "Yoga instructor & wellness advocate. Namaste",
    avatar_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400",
    interests: ["Yoga", "Meditation", "Mindfulness"],
    expertise: ["Hatha Yoga", "Vinyasa Flow", "Yin Yoga"]
  },
  {
    email: "power.yoga.pro@smuppy.bot",
    username: "PowerYogaPro",
    full_name: "David Zen",
    bio: "Power yoga instructor. Build strength through flow",
    avatar_url: "https://images.unsplash.com/photo-1545389336-cf090694435e?w=400",
    interests: ["Yoga", "Fitness", "Stretching"],
    expertise: ["Power Yoga", "Hot Yoga", "Flexibility"]
  },
  {
    email: "pilates.queen@smuppy.bot",
    username: "PilatesQueen",
    full_name: "Emma Rose",
    bio: "Certified Pilates instructor. Core strength is everything",
    avatar_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400",
    interests: ["Pilates", "Stretching", "Fitness"],
    expertise: ["Mat Pilates", "Reformer Pilates", "Core Training"]
  },

  // ========== RUNNING & CARDIO ==========
  {
    email: "runner.max@smuppy.bot",
    username: "RunnerMax",
    full_name: "Max Johnson",
    bio: "Marathon runner. 42K is just the beginning",
    avatar_url: "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=400",
    interests: ["Running", "Long Distance", "Sprinting"],
    expertise: ["Running Coach", "Marathon Training", "Endurance"]
  },
  {
    email: "cardio.queen@smuppy.bot",
    username: "CardioQueen",
    full_name: "Lisa Burns",
    bio: "HIIT specialist. Burn calories, build endurance",
    avatar_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400",
    interests: ["Cardio", "HIIT", "Running"],
    expertise: ["HIIT Classes", "Cardio Boxing", "Aerobics"]
  },
  {
    email: "trail.runner.pro@smuppy.bot",
    username: "TrailRunnerPro",
    full_name: "Jake Mountain",
    bio: "Trail running enthusiast. Nature is my gym",
    avatar_url: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400",
    interests: ["Trail Running", "Hiking", "Running"],
    expertise: ["Trail Running", "Outdoor Fitness", "Endurance"]
  },

  // ========== NUTRITION ==========
  {
    email: "nutrition.pro@smuppy.bot",
    username: "NutritionPro",
    full_name: "Dr. Emma White",
    bio: "Nutritionist helping you fuel your body right",
    avatar_url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400",
    interests: ["Nutrition", "Healthy Eating"],
    expertise: ["Sports Nutrition", "Meal Planning", "Weight Management"]
  },
  {
    email: "keto.coach@smuppy.bot",
    username: "KetoCoach",
    full_name: "Ryan Ketosis",
    bio: "Keto lifestyle expert. Low carb, high energy",
    avatar_url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400",
    interests: ["Nutrition", "Healthy Eating"],
    expertise: ["Keto/Low Carb", "Fat Loss Specialist", "Macro Coaching"]
  },
  {
    email: "plant.based.fit@smuppy.bot",
    username: "PlantBasedFit",
    full_name: "Lily Green",
    bio: "Vegan athlete. Plants power everything",
    avatar_url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=400",
    interests: ["Nutrition", "Healthy Eating", "Wellness"],
    expertise: ["Vegan/Plant-Based", "Gut Health", "Performance Nutrition"]
  },

  // ========== COMBAT SPORTS ==========
  {
    email: "boxing.champ@smuppy.bot",
    username: "BoxingChamp",
    full_name: "Marcus Punch",
    bio: "Pro boxer turned coach. Float like a butterfly",
    avatar_url: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400",
    interests: ["Boxing", "MMA", "Cardio"],
    expertise: ["Boxing", "Cardio Boxing", "Combat Conditioning"]
  },
  {
    email: "mma.warrior@smuppy.bot",
    username: "MMAWarrior",
    full_name: "Alex Fighter",
    bio: "MMA athlete & coach. Train like a warrior",
    avatar_url: "https://images.unsplash.com/photo-1555597673-b21d5c935865?w=400",
    interests: ["MMA", "Boxing", "BJJ"],
    expertise: ["MMA", "Wrestling", "BJJ/Jiu-Jitsu"]
  },
  {
    email: "bjj.master@smuppy.bot",
    username: "BJJMaster",
    full_name: "Carlos Gracie Jr",
    bio: "Brazilian Jiu-Jitsu black belt. Ground game specialist",
    avatar_url: "https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=400",
    interests: ["BJJ", "MMA", "Judo"],
    expertise: ["BJJ/Jiu-Jitsu", "Wrestling", "Self-Defense"]
  },
  {
    email: "kickboxing.pro@smuppy.bot",
    username: "KickboxingPro",
    full_name: "Nina Strike",
    bio: "World kickboxing champion. Kicks that count",
    avatar_url: "https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=400",
    interests: ["Kickboxing", "Muay Thai", "Boxing"],
    expertise: ["Kickboxing", "Muay Thai", "Combat Fitness"]
  },

  // ========== CROSSFIT & FUNCTIONAL ==========
  {
    email: "crossfit.beast@smuppy.bot",
    username: "CrossFitBeast",
    full_name: "Tyler WOD",
    bio: "CrossFit Level 3 Trainer. WODs are my religion",
    avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
    interests: ["CrossFit", "Weightlifting", "HIIT"],
    expertise: ["CrossFit", "Functional Movement", "Kettlebells"]
  },
  {
    email: "functional.fit@smuppy.bot",
    username: "FunctionalFit",
    full_name: "Sam Move",
    bio: "Move better, live better. Functional training expert",
    avatar_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400",
    interests: ["Calisthenics", "Fitness", "Stretching"],
    expertise: ["Functional Movement", "Mobility Work", "TRX/Suspension"]
  },

  // ========== SWIMMING & WATER SPORTS ==========
  {
    email: "swim.coach@smuppy.bot",
    username: "SwimCoachPro",
    full_name: "Michael Phelps Jr",
    bio: "Olympic-trained swim coach. Dive into excellence",
    avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400",
    interests: ["Swimming", "Water Polo"],
    expertise: ["Swim Coaching", "Pool Fitness", "Aqua Fitness"]
  },
  {
    email: "surf.life@smuppy.bot",
    username: "SurfLife",
    full_name: "Kai Wave",
    bio: "Pro surfer. Catch waves, spread stoke",
    avatar_url: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400",
    interests: ["Surfing", "Paddle Board", "Water Sports"],
    expertise: ["Surf Instructor", "Water Sports", "Balance Training"]
  },
  {
    email: "scuba.adventure@smuppy.bot",
    username: "ScubaAdventure",
    full_name: "Deep Dan",
    bio: "PADI Master Diver. Exploring the deep",
    avatar_url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400",
    interests: ["Scuba Diving", "Snorkeling", "Swimming"],
    expertise: ["Diving", "Water Sports", "Outdoor Fitness"]
  },

  // ========== CYCLING ==========
  {
    email: "cycling.pro@smuppy.bot",
    username: "CyclingPro",
    full_name: "Lance Pedal",
    bio: "Professional cyclist. Life behind bars (handlebars)",
    avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400",
    interests: ["Cycling", "Cardio", "Outdoor"],
    expertise: ["Cycling Coach", "Spin/Cycling", "Endurance"]
  },
  {
    email: "mtb.shredder@smuppy.bot",
    username: "MTBShredder",
    full_name: "Rocky Trail",
    bio: "Mountain biker. Shredding trails since 2010",
    avatar_url: "https://images.unsplash.com/photo-1544191696-102dbdaeeaa0?w=400",
    interests: ["Mountain Biking", "Cycling", "Outdoor"],
    expertise: ["Mountain Biking", "Trail Running", "Outdoor Fitness"]
  },

  // ========== DANCE ==========
  {
    email: "dance.queen@smuppy.bot",
    username: "DanceQueen",
    full_name: "Sofia Moves",
    bio: "Professional dancer. Express yourself through movement",
    avatar_url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400",
    interests: ["Hip Hop", "Contemporary", "Dance"],
    expertise: ["Hip Hop", "Contemporary", "Latin Dance"]
  },
  {
    email: "zumba.party@smuppy.bot",
    username: "ZumbaParty",
    full_name: "Maria Fiesta",
    bio: "Licensed Zumba instructor. Fitness is a party",
    avatar_url: "https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=400",
    interests: ["Zumba", "Latin Dance", "Cardio"],
    expertise: ["Zumba", "Latin Dance", "Aerobics"]
  },
  {
    email: "ballet.grace@smuppy.bot",
    username: "BalletGrace",
    full_name: "Clara Swan",
    bio: "Classical ballet dancer. Elegance in motion",
    avatar_url: "https://images.unsplash.com/photo-1518834107812-67b0b7c58434?w=400",
    interests: ["Ballet", "Contemporary", "Stretching"],
    expertise: ["Ballet", "Barre", "Flexibility"]
  },

  // ========== MEDITATION & MINDFULNESS ==========
  {
    email: "mindset.guru@smuppy.bot",
    username: "MindsetGuru",
    full_name: "Alex Motivation",
    bio: "Your daily dose of motivation and mental strength",
    avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400",
    interests: ["Meditation", "Mindfulness", "Mental Health"],
    expertise: ["Meditation", "Mindfulness", "Mental Performance"]
  },
  {
    email: "breathwork.master@smuppy.bot",
    username: "BreathworkMaster",
    full_name: "Wim Hoff Jr",
    bio: "Breathwork facilitator. The power of breath",
    avatar_url: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400",
    interests: ["Breathwork", "Meditation", "Wellness"],
    expertise: ["Breathwork", "Stress Management", "Relaxation"]
  },

  // ========== WELLNESS & RECOVERY ==========
  {
    email: "wellness.wave@smuppy.bot",
    username: "WellnessWave",
    full_name: "Sophie Calm",
    bio: "Holistic wellness & meditation guide",
    avatar_url: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400",
    interests: ["Spa & Recovery", "Wellness", "Self-Care"],
    expertise: ["Massage Therapy", "Recovery Specialist", "Relaxation"]
  },
  {
    email: "flex.master@smuppy.bot",
    username: "FlexMaster",
    full_name: "Tony Stretch",
    bio: "Flexibility & mobility coach. Move better, feel better",
    avatar_url: "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=400",
    interests: ["Stretching", "Yoga", "Recovery"],
    expertise: ["Static Stretching", "Dynamic Stretching", "Mobility Work"]
  },

  // ========== OUTDOOR & ADVENTURE ==========
  {
    email: "outdoor.adventures@smuppy.bot",
    username: "OutdoorAdventures",
    full_name: "Jake Wild",
    bio: "Hiking, climbing, outdoor fitness enthusiast",
    avatar_url: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400",
    interests: ["Hiking", "Climbing", "Camping"],
    expertise: ["Hiking Guide", "Rock Climbing", "Outdoor Fitness"]
  },
  {
    email: "climbing.high@smuppy.bot",
    username: "ClimbingHigh",
    full_name: "Alex Summit",
    bio: "Professional rock climber. Reach new heights",
    avatar_url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400",
    interests: ["Climbing", "Hiking", "Outdoor"],
    expertise: ["Rock Climbing", "Outdoor Fitness", "Core Training"]
  },

  // ========== TEAM SPORTS ==========
  {
    email: "football.star@smuppy.bot",
    username: "FootballStar",
    full_name: "Cristiano Jr",
    bio: "Pro footballer. The beautiful game",
    avatar_url: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=400",
    interests: ["Football", "Team Sports", "Cardio"],
    expertise: ["Football Coach", "Speed Training", "Agility"]
  },
  {
    email: "basketball.king@smuppy.bot",
    username: "BasketballKing",
    full_name: "LeBron Lite",
    bio: "Basketball coach. Shoot for the stars",
    avatar_url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400",
    interests: ["Basketball", "Team Sports", "Fitness"],
    expertise: ["Basketball Coach", "Agility", "Speed Training"]
  },
  {
    email: "volleyball.ace@smuppy.bot",
    username: "VolleyballAce",
    full_name: "Sandy Spike",
    bio: "Beach volleyball pro. Sun, sand, spikes",
    avatar_url: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400",
    interests: ["Volleyball", "Beach Sports", "Team Sports"],
    expertise: ["Sports Coaching", "Agility", "Jump Training"]
  },

  // ========== TENNIS & RACKET SPORTS ==========
  {
    email: "tennis.ace@smuppy.bot",
    username: "TennisAce",
    full_name: "Roger Federer Jr",
    bio: "Tennis coach. Game, set, match",
    avatar_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400",
    interests: ["Tennis", "Racket Sports"],
    expertise: ["Tennis Coach", "Speed Training", "Agility"]
  },
  {
    email: "padel.pro@smuppy.bot",
    username: "PadelPro",
    full_name: "Carlos Padel",
    bio: "Padel instructor. The fastest growing sport",
    avatar_url: "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=400",
    interests: ["Padel", "Tennis", "Racket Sports"],
    expertise: ["Sports Coaching", "Agility", "Speed Training"]
  },

  // ========== GOLF ==========
  {
    email: "golf.master@smuppy.bot",
    username: "GolfMaster",
    full_name: "Tiger Woods Jr",
    bio: "PGA certified instructor. Master your swing",
    avatar_url: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=400",
    interests: ["Golf", "Outdoor"],
    expertise: ["Golf Instructor", "Flexibility", "Core Training"]
  },

  // ========== WINTER SPORTS ==========
  {
    email: "ski.instructor@smuppy.bot",
    username: "SkiInstructor",
    full_name: "Lindsey Snow",
    bio: "Certified ski instructor. Carve your path",
    avatar_url: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400",
    interests: ["Skiing", "Snowboarding", "Winter Sports"],
    expertise: ["Ski/Snowboard", "Balance Training", "Core Training"]
  },
  {
    email: "snowboard.shred@smuppy.bot",
    username: "SnowboardShred",
    full_name: "Shaun White Jr",
    bio: "Pro snowboarder. Shred the powder",
    avatar_url: "https://images.unsplash.com/photo-1478700485868-972b69dc3fc4?w=400",
    interests: ["Snowboarding", "Skiing", "Extreme Sports"],
    expertise: ["Ski/Snowboard", "Balance Training", "Extreme Sports"]
  },

  // ========== EXTREME SPORTS ==========
  {
    email: "skateboard.pro@smuppy.bot",
    username: "SkateboardPro",
    full_name: "Tony Hawk Jr",
    bio: "Pro skateboarder. Tricks and kicks",
    avatar_url: "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=400",
    interests: ["Skateboarding", "BMX", "Extreme Sports"],
    expertise: ["Skateboarding", "Balance Training", "Parkour"]
  },
  {
    email: "parkour.ninja@smuppy.bot",
    username: "ParkourNinja",
    full_name: "David Belle Jr",
    bio: "Parkour athlete. No obstacles, only opportunities",
    avatar_url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400",
    interests: ["Parkour", "Calisthenics", "Extreme Sports"],
    expertise: ["Parkour", "Obstacle Course", "Bodyweight"]
  },

  // ========== SPECIALIZED POPULATIONS ==========
  {
    email: "senior.fit@smuppy.bot",
    username: "SeniorFitPro",
    full_name: "Robert Active",
    bio: "Fitness for 50+. Age is just a number",
    avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400",
    interests: ["Fitness", "Wellness", "Walking"],
    expertise: ["Senior Fitness", "Balance Training", "Gentle Movement"]
  },
  {
    email: "prenatal.fit@smuppy.bot",
    username: "PrenatalFit",
    full_name: "Jessica Mom",
    bio: "Pre & postnatal fitness specialist. Strong mamas",
    avatar_url: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400",
    interests: ["Yoga", "Pilates", "Wellness"],
    expertise: ["Pre/Postnatal", "Prenatal Yoga", "Women's Fitness"]
  },
  {
    email: "kids.fitness@smuppy.bot",
    username: "KidsFitnessFun",
    full_name: "Coach Tommy",
    bio: "Making fitness fun for kids. Active childhood",
    avatar_url: "https://images.unsplash.com/photo-1472162072942-cd5147eb3902?w=400",
    interests: ["Sports", "Fitness", "Team Sports"],
    expertise: ["Youth/Kids", "Sports Coaching", "Fun Fitness"]
  },

  // ========== REHAB & PHYSIO ==========
  {
    email: "physio.pro@smuppy.bot",
    username: "PhysioPro",
    full_name: "Dr. Sarah Heal",
    bio: "Sports physiotherapist. Recover stronger",
    avatar_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400",
    interests: ["Recovery", "Stretching", "Wellness"],
    expertise: ["Physical Therapy", "Sports Injury", "Post-Surgery Rehab"]
  },
  {
    email: "injury.prevent@smuppy.bot",
    username: "InjuryPrevent",
    full_name: "Mark Prevention",
    bio: "Injury prevention specialist. Stay in the game",
    avatar_url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400",
    interests: ["Recovery", "Fitness", "Stretching"],
    expertise: ["Injury Prevention", "Corrective Exercise", "Mobility Work"]
  },

  // ========== CORPORATE & ONLINE ==========
  {
    email: "corporate.wellness@smuppy.bot",
    username: "CorporateWellness",
    full_name: "Chris Office",
    bio: "Corporate wellness consultant. Healthy workplace",
    avatar_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400",
    interests: ["Wellness", "Fitness", "Work-Life Balance"],
    expertise: ["Corporate Wellness", "Office Fitness", "Stress Workshops"]
  },
  {
    email: "online.coach@smuppy.bot",
    username: "OnlineCoachPro",
    full_name: "Digital Dave",
    bio: "Online fitness coach. Train anywhere, anytime",
    avatar_url: "https://images.unsplash.com/photo-1593352589290-7d6f7a14ba1e?w=400",
    interests: ["Fitness", "Home Fitness"],
    expertise: ["Virtual Training", "Online Classes", "App-Based Coaching"]
  },
  {
    email: "home.workout@smuppy.bot",
    username: "HomeWorkout",
    full_name: "Nina Fit",
    bio: "No gym? No problem! Home workout specialist",
    avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400",
    interests: ["Home Fitness", "Calisthenics", "HIIT"],
    expertise: ["Bodyweight", "Circuit Training", "Home Workouts"]
  },

  // ========== HOLISTIC & ALTERNATIVE ==========
  {
    email: "holistic.health@smuppy.bot",
    username: "HolisticHealth",
    full_name: "Harmony Lee",
    bio: "Holistic health practitioner. Mind, body, spirit",
    avatar_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400",
    interests: ["Holistic Health", "Wellness", "Meditation"],
    expertise: ["Holistic Health", "Ayurveda", "Energy Healing"]
  },
  {
    email: "tai.chi.master@smuppy.bot",
    username: "TaiChiMaster",
    full_name: "Master Chen",
    bio: "Tai Chi & Qigong instructor. Ancient wisdom, modern wellness",
    avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400",
    interests: ["Tai Chi", "Qigong", "Mind & Body"],
    expertise: ["Tai Chi", "Qigong", "Body Awareness"]
  },

  // ========== TRIATHLON & MULTI-SPORT ==========
  {
    email: "triathlon.coach@smuppy.bot",
    username: "TriathlonCoach",
    full_name: "Iron Mike",
    bio: "Ironman finisher & coach. Swim, bike, run, repeat",
    avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400",
    interests: ["Swimming", "Cycling", "Running"],
    expertise: ["Triathlon Coach", "Endurance", "Competition Prep"]
  },

  // ========== SPORTS NEWS ==========
  {
    email: "sports.daily@smuppy.bot",
    username: "SportsDaily",
    full_name: "Chris Athletic",
    bio: "All things sports. News, tips, and highlights",
    avatar_url: "https://images.unsplash.com/photo-1461896836934-eca07ce68773?w=400",
    interests: ["Sports", "Football", "Basketball", "Tennis"],
    expertise: ["Sports News", "Sports Analysis"]
  }
];

// ============================================
// SAMPLE POSTS FOR EACH BOT CATEGORY
// ============================================

const CATEGORY_POSTS = {
  fitness: [
    { media_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800", caption: "Morning workout complete! Remember: consistency beats intensity every time" },
    { media_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800", caption: "New week, new goals. What are you working on this week?" },
    { media_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800", caption: "Form tip: Keep your core engaged during every exercise for better results" },
  ],
  yoga: [
    { media_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800", caption: "Start your day with 10 minutes of sun salutations. Your body will thank you" },
    { media_url: "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=800", caption: "Breathe in peace, breathe out stress. Happy Monday everyone!" },
    { media_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800", caption: "Balance is not something you find, its something you create" },
  ],
  running: [
    { media_url: "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800", caption: "5K this morning before sunrise. Best way to start the day!" },
    { media_url: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800", caption: "Trail running is therapy. Find your path!" },
    { media_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800", caption: "Recovery run today. Listen to your body, it knows what it needs" },
  ],
  nutrition: [
    { media_url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800", caption: "Meal prep Sunday! Fuel your week with whole foods" },
    { media_url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800", caption: "Hydration tip: Add lemon to your water for extra benefits" },
    { media_url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800", caption: "Protein-packed breakfast ideas for busy mornings" },
  ],
  strength: [
    { media_url: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800", caption: "Leg day is the best day. No excuses!" },
    { media_url: "https://images.unsplash.com/photo-1581009137042-c552e485697a?w=800", caption: "Progress takes time. Trust the process!" },
    { media_url: "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800", caption: "Back and biceps today. Lets get it!" },
  ],
  combat: [
    { media_url: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800", caption: "Boxing session done! Nothing clears the mind like hitting the bag" },
    { media_url: "https://images.unsplash.com/photo-1555597673-b21d5c935865?w=800", caption: "Train hard, fight easy. Discipline is freedom" },
    { media_url: "https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=800", caption: "Ground work fundamentals. The floor is your friend" },
  ],
  swimming: [
    { media_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800", caption: "Early morning laps. The pool is my happy place" },
    { media_url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800", caption: "Underwater is another world. Pure meditation" },
    { media_url: "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=800", caption: "Swim technique tip: Focus on your catch and pull phase" },
  ],
  cycling: [
    { media_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800", caption: "100km ride done! The road is calling" },
    { media_url: "https://images.unsplash.com/photo-1544191696-102dbdaeeaa0?w=800", caption: "Mountain trails are the best trails" },
    { media_url: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800", caption: "Cycling is meditation in motion" },
  ],
  dance: [
    { media_url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800", caption: "Dance like nobody is watching. Express yourself!" },
    { media_url: "https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=800", caption: "Zumba class was fire today! Best cardio ever" },
    { media_url: "https://images.unsplash.com/photo-1518834107812-67b0b7c58434?w=800", caption: "Grace and strength. Ballet teaches both" },
  ],
  meditation: [
    { media_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800", caption: "5 minutes of meditation can change your whole day" },
    { media_url: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800", caption: "Inner peace is the ultimate strength" },
    { media_url: "https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=800", caption: "Mindfulness is a superpower. Practice daily" },
  ],
  outdoor: [
    { media_url: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800", caption: "Mountain hike this weekend. Nature is the best gym!" },
    { media_url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800", caption: "Climbing challenges everything. Physical and mental" },
    { media_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800", caption: "Beach workout: sand makes everything harder!" },
  ],
  team_sports: [
    { media_url: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800", caption: "Game day! Nothing like team sports energy" },
    { media_url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800", caption: "Practice makes perfect. Drill, drill, drill!" },
    { media_url: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800", caption: "Team spirit is everything. We win together!" },
  ],
  tennis: [
    { media_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800", caption: "Serve practice. 100 serves a day keeps losses away" },
    { media_url: "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800", caption: "Padel is addictive! Whos playing this weekend?" },
    { media_url: "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800", caption: "Footwork is the foundation of every great shot" },
  ],
  winter: [
    { media_url: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800", caption: "Fresh powder today! Carving through perfection" },
    { media_url: "https://images.unsplash.com/photo-1478700485868-972b69dc3fc4?w=800", caption: "Snowboard season is the best season" },
    { media_url: "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?w=800", caption: "Mountain views never get old" },
  ],
  extreme: [
    { media_url: "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=800", caption: "New trick landed! Persistence pays off" },
    { media_url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800", caption: "Parkour is freedom of movement" },
    { media_url: "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=800", caption: "Push your limits every single day" },
  ],
  wellness: [
    { media_url: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800", caption: "Self-care Sunday: meditation, healthy food, early bed" },
    { media_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800", caption: "Mental health is just as important as physical health" },
    { media_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800", caption: "Take time to relax and recharge" },
  ],
  home: [
    { media_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800", caption: "No equipment needed! Bodyweight workout for today" },
    { media_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800", caption: "Your living room is your gym. No excuses!" },
    { media_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800", caption: "5 exercises you can do while watching TV" },
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

async function apiCall(endpoint, method, body) {
  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method,
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getCategoryForProfile(profile) {
  const interests = profile.interests.join(' ').toLowerCase();
  const expertise = profile.expertise.join(' ').toLowerCase();
  const combined = interests + ' ' + expertise;

  if (combined.includes('yoga') || combined.includes('pilates')) return 'yoga';
  if (combined.includes('running') || combined.includes('marathon') || combined.includes('trail')) return 'running';
  if (combined.includes('nutrition') || combined.includes('meal') || combined.includes('keto')) return 'nutrition';
  if (combined.includes('strength') || combined.includes('muscle') || combined.includes('powerlifting')) return 'strength';
  if (combined.includes('boxing') || combined.includes('mma') || combined.includes('bjj') || combined.includes('kickbox')) return 'combat';
  if (combined.includes('swim') || combined.includes('water') || combined.includes('surf') || combined.includes('diving')) return 'swimming';
  if (combined.includes('cycling') || combined.includes('bike') || combined.includes('mtb')) return 'cycling';
  if (combined.includes('dance') || combined.includes('zumba') || combined.includes('ballet')) return 'dance';
  if (combined.includes('meditation') || combined.includes('mindfulness') || combined.includes('breathwork')) return 'meditation';
  if (combined.includes('hiking') || combined.includes('climbing') || combined.includes('outdoor')) return 'outdoor';
  if (combined.includes('football') || combined.includes('basketball') || combined.includes('volleyball')) return 'team_sports';
  if (combined.includes('tennis') || combined.includes('padel') || combined.includes('racket')) return 'tennis';
  if (combined.includes('ski') || combined.includes('snow') || combined.includes('winter')) return 'winter';
  if (combined.includes('skateboard') || combined.includes('parkour') || combined.includes('bmx')) return 'extreme';
  if (combined.includes('wellness') || combined.includes('recovery') || combined.includes('spa')) return 'wellness';
  if (combined.includes('home') || combined.includes('bodyweight')) return 'home';
  return 'fitness';
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('===========================================');
  console.log('SMUPPY BOT SEEDING SCRIPT');
  console.log(`Creating ${BOT_PROFILES.length} bot accounts...`);
  console.log('===========================================\n');

  const createdBots = [];
  let successCount = 0;
  let errorCount = 0;

  for (const profile of BOT_PROFILES) {
    process.stdout.write(`Creating ${profile.username}... `);

    try {
      // 1. Create auth user
      const authResult = await apiCall('/auth/v1/admin/users', 'POST', {
        email: profile.email,
        password: 'SmuppyBot2026!',
        email_confirm: true,
        user_metadata: {
          username: profile.username,
          full_name: profile.full_name
        }
      });

      const userId = authResult?.id;

      if (!userId) {
        // Check if user already exists
        if (authResult?.message?.includes('already') || authResult?.error?.includes('already')) {
          console.log('(already exists, skipping)');
          continue;
        }
        console.log(`FAILED: ${JSON.stringify(authResult).substring(0, 100)}`);
        errorCount++;
        continue;
      }

      // 2. Create profile
      const profileResult = await apiCall('/rest/v1/profiles', 'POST', {
        id: userId,
        username: profile.username,
        full_name: profile.full_name,
        bio: profile.bio,
        avatar_url: profile.avatar_url,
        account_type: 'personal',
        is_verified: true
      });

      if (profileResult && !profileResult.error) {
        console.log(`OK (${userId.substring(0, 8)}...)`);
        createdBots.push({
          id: userId,
          username: profile.username,
          category: getCategoryForProfile(profile),
          interests: profile.interests,
          expertise: profile.expertise
        });
        successCount++;
      } else {
        console.log(`Profile error: ${JSON.stringify(profileResult).substring(0, 100)}`);
        errorCount++;
      }

    } catch (error) {
      console.log(`ERROR: ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n===========================================');
  console.log(`Profiles created: ${successCount}/${BOT_PROFILES.length}`);
  console.log(`Errors: ${errorCount}`);
  console.log('===========================================\n');

  // 3. Create posts for each bot
  if (createdBots.length > 0) {
    console.log('Creating posts for bots...\n');

    let postCount = 0;
    for (const bot of createdBots) {
      const posts = CATEGORY_POSTS[bot.category] || CATEGORY_POSTS.fitness;

      for (const post of posts) {
        try {
          const result = await apiCall('/rest/v1/posts', 'POST', {
            author_id: bot.id,
            media_url: post.media_url,
            media_type: 'photo',
            caption: post.caption,
            visibility: 'public',
            likes_count: Math.floor(Math.random() * 500) + 50,
            comments_count: Math.floor(Math.random() * 30) + 5
          });

          if (result && !result.error) {
            postCount++;
          }
        } catch (error) {
          // Ignore post errors
        }
      }
      process.stdout.write(`  ${bot.username}: 3 posts\n`);
    }

    console.log(`\nTotal posts created: ${postCount}`);
  }

  console.log('\n===========================================');
  console.log('SEEDING COMPLETE!');
  console.log('===========================================');
}

main().catch(console.error);
