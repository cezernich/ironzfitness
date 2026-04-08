/*
  workouts.js — Everything related to the Workouts feature.

  This file handles:
    1. EXERCISE LIBRARY   — a big list of exercises organized by workout type
    2. PLAN GENERATOR     — builds a weekly plan based on your selections
    3. LOGGING WORKOUTS   — saving a workout entry to localStorage
    4. DISPLAYING HISTORY — reading saved workouts and showing them on screen

  HOW localStorage WORKS:
    Think of it like a simple key-value notebook that lives in your browser.
    - localStorage.setItem('key', value)  → write/save data
    - localStorage.getItem('key')         → read data
    - Data persists even after closing the browser tab.
    - Since it only stores text (strings), we use JSON.stringify() to convert
      JavaScript objects to text before saving, and JSON.parse() to convert
      them back when reading.
*/


/* =====================================================================
   SECTION 1: EXERCISE LIBRARY
   A collection of exercises organized by workout type and level.
   Each exercise has: name, sets, reps, and weight (or distance/notes).
   ===================================================================== */

const EXERCISE_LIBRARY = {

  weightlifting: {
    // Push = chest, shoulders, triceps
    push: {
      beginner: [
        { name: "Push-ups",          sets: 3, reps: 10, weight: "Bodyweight" },
        { name: "Dumbbell Chest Press", sets: 3, reps: 10, weight: "Light (2×15lb)" },
        { name: "Dumbbell Shoulder Press", sets: 3, reps: 10, weight: "Light (2×10lb)" },
        { name: "Tricep Pushdowns",  sets: 3, reps: 12, weight: "Light cable" },
      ],
      intermediate: [
        { name: "Barbell Bench Press", sets: 4, reps: 8, weight: "Bar + 45lbs" },
        { name: "Incline Dumbbell Press", sets: 3, reps: 10, weight: "2×30lb" },
        { name: "Overhead Press",    sets: 3, reps: 8,  weight: "Bar + 20lbs" },
        { name: "Lateral Raises",    sets: 3, reps: 12, weight: "2×15lb" },
        { name: "Tricep Dips",       sets: 3, reps: 10, weight: "Bodyweight" },
      ],
      advanced: [
        { name: "Barbell Bench Press", sets: 5, reps: 5, weight: "Bar + 90lbs" },
        { name: "Weighted Dips",     sets: 4, reps: 8,  weight: "+25lb belt" },
        { name: "Overhead Press",    sets: 4, reps: 6,  weight: "Bar + 50lbs" },
        { name: "Cable Crossovers",  sets: 3, reps: 15, weight: "Moderate" },
        { name: "Skull Crushers",    sets: 3, reps: 10, weight: "Bar + 30lbs" },
      ],
    },
    // Pull = back, biceps
    pull: {
      beginner: [
        { name: "Assisted Pull-ups", sets: 3, reps: 8,  weight: "Assisted machine" },
        { name: "Seated Cable Row",  sets: 3, reps: 12, weight: "Light" },
        { name: "Dumbbell Row",      sets: 3, reps: 10, weight: "2×20lb" },
        { name: "Dumbbell Bicep Curl", sets: 3, reps: 12, weight: "2×12lb" },
      ],
      intermediate: [
        { name: "Pull-ups",          sets: 4, reps: 8,  weight: "Bodyweight" },
        { name: "Barbell Bent-over Row", sets: 4, reps: 8, weight: "Bar + 40lbs" },
        { name: "Lat Pulldown",      sets: 3, reps: 10, weight: "Moderate" },
        { name: "Face Pulls",        sets: 3, reps: 15, weight: "Light cable" },
        { name: "Barbell Bicep Curl", sets: 3, reps: 10, weight: "Bar + 20lbs" },
      ],
      advanced: [
        { name: "Weighted Pull-ups", sets: 5, reps: 5,  weight: "+35lb belt" },
        { name: "Pendlay Row",       sets: 4, reps: 6,  weight: "Bar + 70lbs" },
        { name: "Single-arm Row",    sets: 3, reps: 8,  weight: "60lb dumbbell" },
        { name: "Straight-arm Pulldown", sets: 3, reps: 12, weight: "Moderate" },
        { name: "Hammer Curls",      sets: 3, reps: 10, weight: "2×30lb" },
      ],
    },
    // Legs = quads, hamstrings, glutes, calves
    legs: {
      beginner: [
        { name: "Bodyweight Squats", sets: 3, reps: 15, weight: "Bodyweight" },
        { name: "Leg Press",         sets: 3, reps: 12, weight: "Light" },
        { name: "Lunges",            sets: 3, reps: 10, weight: "Bodyweight" },
        { name: "Calf Raises",       sets: 3, reps: 15, weight: "Bodyweight" },
      ],
      intermediate: [
        { name: "Barbell Squat",     sets: 4, reps: 8,  weight: "Bar + 60lbs" },
        { name: "Romanian Deadlift", sets: 3, reps: 10, weight: "Bar + 40lbs" },
        { name: "Walking Lunges",    sets: 3, reps: 12, weight: "2×20lb" },
        { name: "Leg Curl",          sets: 3, reps: 12, weight: "Moderate" },
        { name: "Weighted Calf Raises", sets: 4, reps: 15, weight: "Moderate" },
      ],
      advanced: [
        { name: "Barbell Back Squat", sets: 5, reps: 5, weight: "Bar + 120lbs" },
        { name: "Conventional Deadlift", sets: 4, reps: 5, weight: "Bar + 135lbs" },
        { name: "Bulgarian Split Squat", sets: 3, reps: 8, weight: "2×35lb" },
        { name: "Leg Press",         sets: 3, reps: 12, weight: "Heavy" },
        { name: "Nordic Hamstring Curl", sets: 3, reps: 8, weight: "Bodyweight" },
      ],
    },
  },

  hiit: {
    beginner: [
      { day: "Day 1", name: "Bodyweight Circuit", format: "circuit", rounds: 3, restBetweenRounds: "90s", exercises: [
        { name: "Jumping Jacks",    sets: 1, reps: "30 sec", weight: "Bodyweight", rest: "15s" },
        { name: "Bodyweight Squats", sets: 1, reps: 12, weight: "Bodyweight", rest: "15s" },
        { name: "Push-ups",          sets: 1, reps: 8,  weight: "Bodyweight", rest: "15s" },
        { name: "Mountain Climbers", sets: 1, reps: "20 sec", weight: "Bodyweight", rest: "15s" },
        { name: "Plank Hold",        sets: 1, reps: "20 sec", weight: "Bodyweight", rest: "15s" },
      ]},
      { day: "Day 2", name: "Tabata Basics", format: "tabata", rounds: 4, exercises: [
        { name: "High Knees",    sets: 1, reps: "20s on / 10s off", weight: "Bodyweight", rest: "10s" },
        { name: "Bodyweight Squats", sets: 1, reps: "20s on / 10s off", weight: "Bodyweight", rest: "10s" },
        { name: "Burpees (modified)", sets: 1, reps: "20s on / 10s off", weight: "Bodyweight", rest: "10s" },
        { name: "Bicycle Crunches", sets: 1, reps: "20s on / 10s off", weight: "Bodyweight", rest: "10s" },
      ]},
      { day: "Day 3", name: "AMRAP 15", format: "amrap", rounds: 1, exercises: [
        { name: "Air Squats",   sets: 1, reps: 15, weight: "Bodyweight", rest: "0s" },
        { name: "Push-ups",     sets: 1, reps: 10, weight: "Bodyweight", rest: "0s" },
        { name: "Lunges",       sets: 1, reps: 10, weight: "Bodyweight", rest: "0s" },
        { name: "Sit-ups",      sets: 1, reps: 15, weight: "Bodyweight", rest: "0s" },
        { name: "Burpees",      sets: 1, reps: 5,  weight: "Bodyweight", rest: "0s" },
      ]},
    ],
    intermediate: [
      { day: "Day 1", name: "Full Body Circuit", format: "circuit", rounds: 4, restBetweenRounds: "60s", exercises: [
        { name: "Burpees",           sets: 1, reps: 10, weight: "Bodyweight", rest: "15s" },
        { name: "Dumbbell Thrusters", sets: 1, reps: 12, weight: "2x20 lbs",  rest: "15s" },
        { name: "Box Jumps",          sets: 1, reps: 10, weight: "Bodyweight", rest: "15s" },
        { name: "Renegade Rows",      sets: 1, reps: 10, weight: "2x20 lbs",  rest: "15s" },
        { name: "Mountain Climbers",  sets: 1, reps: "30 sec", weight: "Bodyweight", rest: "15s" },
        { name: "Kettlebell Swings",  sets: 1, reps: 15, weight: "35 lbs",    rest: "15s" },
      ]},
      { day: "Day 2", name: "EMOM 20", format: "emom", rounds: 5, exercises: [
        { name: "Min 1: Kettlebell Swings", sets: 1, reps: 15, weight: "35 lbs",    rest: "remaining" },
        { name: "Min 2: Push-ups",           sets: 1, reps: 15, weight: "Bodyweight", rest: "remaining" },
        { name: "Min 3: Goblet Squats",      sets: 1, reps: 12, weight: "35 lbs",    rest: "remaining" },
        { name: "Min 4: Plank Hold",         sets: 1, reps: "40 sec", weight: "Bodyweight", rest: "remaining" },
      ]},
      { day: "Day 3", name: "Tabata Power", format: "tabata", rounds: 8, exercises: [
        { name: "Jump Squats",       sets: 1, reps: "20s on / 10s off", weight: "Bodyweight", rest: "10s" },
        { name: "Push-up to Renegade Row", sets: 1, reps: "20s on / 10s off", weight: "2x15 lbs", rest: "10s" },
        { name: "Burpees",            sets: 1, reps: "20s on / 10s off", weight: "Bodyweight", rest: "10s" },
        { name: "Dumbbell Snatches",   sets: 1, reps: "20s on / 10s off", weight: "25 lbs",    rest: "10s" },
      ]},
    ],
    advanced: [
      { day: "Day 1", name: "Killer Circuit", format: "circuit", rounds: 5, restBetweenRounds: "45s", exercises: [
        { name: "Devil Press",         sets: 1, reps: 10, weight: "2x35 lbs",  rest: "10s" },
        { name: "Box Jump Overs",      sets: 1, reps: 12, weight: "Bodyweight", rest: "10s" },
        { name: "Barbell Thrusters",   sets: 1, reps: 10, weight: "95 lbs",    rest: "10s" },
        { name: "Toes to Bar",         sets: 1, reps: 12, weight: "Bodyweight", rest: "10s" },
        { name: "Assault Bike",        sets: 1, reps: "30 sec", weight: "Max effort", rest: "10s" },
        { name: "Wall Balls",          sets: 1, reps: 15, weight: "20 lbs",    rest: "10s" },
      ]},
      { day: "Day 2", name: "EMOM 30", format: "emom", rounds: 6, exercises: [
        { name: "Min 1: Power Cleans",    sets: 1, reps: 5,  weight: "135 lbs",   rest: "remaining" },
        { name: "Min 2: Burpee Box Jumps", sets: 1, reps: 8,  weight: "Bodyweight", rest: "remaining" },
        { name: "Min 3: Kettlebell Snatches", sets: 1, reps: 8, weight: "53 lbs", rest: "remaining" },
        { name: "Min 4: Handstand Push-ups", sets: 1, reps: 8, weight: "Bodyweight", rest: "remaining" },
        { name: "Min 5: Calorie Row",     sets: 1, reps: "12 cal", weight: "Max effort", rest: "remaining" },
      ]},
      { day: "Day 3", name: "AMRAP 20", format: "amrap", rounds: 1, exercises: [
        { name: "Thrusters",      sets: 1, reps: 10, weight: "95 lbs",    rest: "0s" },
        { name: "Pull-ups",       sets: 1, reps: 10, weight: "Bodyweight", rest: "0s" },
        { name: "Box Jumps",      sets: 1, reps: 10, weight: "Bodyweight", rest: "0s" },
        { name: "Kettlebell Swings", sets: 1, reps: 15, weight: "53 lbs", rest: "0s" },
        { name: "Burpees",        sets: 1, reps: 10, weight: "Bodyweight", rest: "0s" },
      ]},
    ],
  },

  running: {
    beginner: [
      { day: "Day 1", name: "Easy Walk/Run",  details: "20 min — alternate 2 min walking / 1 min jogging" },
      { day: "Day 2", name: "Rest or Walk",   details: "Light 20 min walk, or full rest" },
      { day: "Day 3", name: "Easy Walk/Run",  details: "25 min — alternate 2 min walking / 2 min jogging" },
      { day: "Day 4", name: "Rest",           details: "Full rest day" },
      { day: "Day 5", name: "Slightly Longer Run", details: "30 min — walk when needed, run as much as comfortable" },
      { day: "Day 6", name: "Rest or Cross-Train", details: "Swim, bike, or light stretching" },
    ],
    intermediate: [
      { day: "Day 1", name: "Easy Run",   details: "3 miles @ comfortable pace (can hold a conversation)" },
      { day: "Day 2", name: "Tempo Run",  details: "2 miles @ comfortably hard pace (breathing hard but controlled)" },
      { day: "Day 3", name: "Rest or Cross-Train", details: "Swim, bike, or yoga" },
      { day: "Day 4", name: "Intervals",  details: "6×400m fast with 90 sec rest between each" },
      { day: "Day 5", name: "Easy Run",   details: "3 miles @ easy pace" },
      { day: "Day 6", name: "Long Run",   details: "5 miles @ easy/conversational pace" },
    ],
    advanced: [
      { day: "Day 1", name: "Easy Run",       details: "5 miles @ easy pace" },
      { day: "Day 2", name: "Tempo Run",      details: "5 miles with middle 3 at threshold pace" },
      { day: "Day 3", name: "Recovery Run",   details: "3 miles @ very easy pace" },
      { day: "Day 4", name: "Track Intervals", details: "10×400m at 5K pace with 60 sec rest" },
      { day: "Day 5", name: "Easy Run",       details: "5 miles @ easy pace" },
      { day: "Day 6", name: "Long Run",       details: "10 miles @ easy/marathon pace" },
    ],
  },

  triathlon: {
    beginner: [
      { day: "Day 1", name: "Swim",  details: "20 min — 6×50m with 30 sec rest, focus on technique" },
      { day: "Day 2", name: "Bike",  details: "30 min easy spin — low resistance, comfortable pace" },
      { day: "Day 3", name: "Run",   details: "20 min easy walk/run" },
      { day: "Day 4", name: "Rest",  details: "Full rest or light stretching" },
      { day: "Day 5", name: "Swim",  details: "25 min — 8×50m continuous effort" },
      { day: "Day 6", name: "Brick Workout (Bike + Run)", details: "20 min easy bike immediately followed by 10 min run" },
    ],
    intermediate: [
      { day: "Day 1", name: "Swim",  details: "1500m — 6×250m with 20 sec rest" },
      { day: "Day 2", name: "Bike",  details: "60 min moderate effort — aim for steady power output" },
      { day: "Day 3", name: "Run",   details: "4 miles at easy pace" },
      { day: "Day 4", name: "Rest or Yoga", details: "Active recovery, light stretching" },
      { day: "Day 5", name: "Swim",  details: "1800m continuous or broken into 300m sets" },
      { day: "Day 6", name: "Brick Workout", details: "45 min bike at moderate effort + 20 min run at race pace" },
    ],
    advanced: [
      { day: "Day 1", name: "Swim",  details: "3000m — 10×300m at race pace, 15 sec rest" },
      { day: "Day 2", name: "Bike",  details: "90 min with 40 min at threshold in the middle" },
      { day: "Day 3", name: "Run",   details: "7 miles — tempo miles in the middle" },
      { day: "Day 4", name: "Recovery Swim", details: "1000m easy technique work" },
      { day: "Day 5", name: "Bike",  details: "60 min high intensity intervals (5×8 min hard, 3 min easy)" },
      { day: "Day 6", name: "Long Brick", details: "2.5 hr bike + 45 min run at race pace" },
    ],
  },

  cycling: {
    beginner: [
      { day: "Day 1", name: "Easy Spin",  details: "30 min — low resistance, 70–80 RPM cadence" },
      { day: "Day 2", name: "Rest",       details: "Full rest" },
      { day: "Day 3", name: "Moderate Ride", details: "40 min — comfortable effort, slight resistance" },
      { day: "Day 4", name: "Rest",       details: "Full rest or walk" },
      { day: "Day 5", name: "Longer Easy Ride", details: "50 min — enjoy the effort, keep it conversational" },
      { day: "Day 6", name: "Core & Stretch", details: "20 min core work + full body stretch" },
    ],
    intermediate: [
      { day: "Day 1", name: "Endurance Ride", details: "60 min moderate steady effort" },
      { day: "Day 2", name: "Intervals", details: "45 min — 6×3 min hard, 3 min easy" },
      { day: "Day 3", name: "Rest",       details: "Rest or light walk" },
      { day: "Day 4", name: "Tempo Ride", details: "50 min — 30 min at comfortably hard pace" },
      { day: "Day 5", name: "Easy Spin",  details: "30 min recovery spin, very low effort" },
      { day: "Day 6", name: "Long Ride",  details: "90 min at easy to moderate pace" },
    ],
    advanced: [
      { day: "Day 1", name: "VO2 Max Intervals", details: "60 min — 5×5 min at max sustainable effort, 5 min easy between" },
      { day: "Day 2", name: "Endurance Ride", details: "90 min steady state" },
      { day: "Day 3", name: "Recovery Ride", details: "40 min very easy spin" },
      { day: "Day 4", name: "Climbing Simulation", details: "60 min — 4×8 min heavy resistance seated climb" },
      { day: "Day 5", name: "Rest",        details: "Full rest day" },
      { day: "Day 6", name: "Long Ride",   details: "2.5–3 hr endurance ride" },
    ],
  },

  yoga: {
    beginner: [
      { day: "Day 1", name: "Morning Flow",         details: "Sun salutations A & B × 3, Child's Pose, Cat-Cow — 30 min total", yogaType: "vinyasa" },
      { day: "Day 2", name: "Hip Opener",           details: "Pigeon Pose, Lizard Pose, Butterfly stretch, Supine twist — hold each 2 min", yogaType: "mobility" },
      { day: "Day 3", name: "Balance & Breath",     details: "Tree Pose, Warrior I & II, Mountain Pose — focus on steady breath throughout", yogaType: "balance" },
      { day: "Day 4", name: "Gentle Yin",           details: "Reclined Butterfly, Supported Bridge, Legs Up the Wall — hold each 3 min, 30 min total", yogaType: "yin" },
      { day: "Day 5", name: "Intro Sculpt",          details: "Light weights + Chair Pose pulses, Warrior II bicep curls, Plank shoulder taps — 30 min", yogaType: "sculpt" },
      { day: "Day 6", name: "Full Body Stretch",     details: "Standing forward fold, seated hamstring stretch, quad stretch, shoulder stretch, Cat-Cow — hold each 30–60s, 20 min", yogaType: "mobility" },
      { day: "Day 7", name: "Lower Body Mobility",   details: "90/90 hip switches, ankle circles, calf stretch, figure-4 stretch, gentle lunges — 20 min", yogaType: "mobility" },
    ],
    intermediate: [
      { day: "Day 1", name: "Vinyasa Flow",         details: "45 min flowing vinyasa — Warrior I, II, III, Side Angle, Downward Dog sequences", yogaType: "vinyasa" },
      { day: "Day 2", name: "Yin & Restore",        details: "Yin yoga — Sleeping Swan, Dragonfly, Reclined Butterfly — hold each 3–5 min", yogaType: "yin" },
      { day: "Day 3", name: "Core & Twist",         details: "Boat Pose, Twisted Chair, Revolved Crescent, Plank holds — 45 min", yogaType: "power" },
      { day: "Day 4", name: "Yoga Sculpt",           details: "45 min — light dumbbells through Warrior flows, Chair squats, Chaturanga push-ups, tricep kickbacks in Crescent", yogaType: "sculpt" },
      { day: "Day 5", name: "Mobility & Release",    details: "Foam roll + pigeon, lizard, 90/90 hip — hold each 2 min, 35 min total", yogaType: "mobility" },
      { day: "Day 6", name: "Balance & Breathwork",  details: "Tree, Eagle, Half Moon, Warrior III — slow transitions with box breathing", yogaType: "balance" },
      { day: "Day 7", name: "Upper Body Mobility",   details: "Thoracic spine rotations, doorway chest stretch, band pull-aparts, shoulder CARs, wrist circles — 25 min", yogaType: "mobility" },
      { day: "Day 8", name: "Active Recovery Stretch", details: "Easy walk 5 min then standing quad stretch, wall calf stretch, seated spinal twist, child's pose — hold each 90s, 30 min", yogaType: "mobility" },
    ],
    advanced: [
      { day: "Day 1", name: "Power Vinyasa",        details: "60 min power flow — arm balances, inversions, advanced transitions", yogaType: "power" },
      { day: "Day 2", name: "Inversion Practice",   details: "Headstand, Shoulderstand, Handstand kick-ups against wall — 45 min", yogaType: "power" },
      { day: "Day 3", name: "Deep Yin",             details: "60 min yin — Dragon, Melting Heart, Sleeping Swan — hold 5–7 min each", yogaType: "yin" },
      { day: "Day 4", name: "Sculpt Burn",           details: "60 min — heavy weights through Sun Sal B, Warrior series curls & presses, weighted lunges, plank rows", yogaType: "sculpt" },
      { day: "Day 5", name: "Advanced Flow",         details: "60 min vinyasa — Firefly, Eight-Angle, Flying Pigeon transitions", yogaType: "vinyasa" },
      { day: "Day 6", name: "Deep Mobility",         details: "Loaded progressive stretching — Jefferson curls, pancake, shoulder CARs — 45 min", yogaType: "mobility" },
      { day: "Day 7", name: "Hip & Spine Mobility",  details: "90/90 rotations, couch stretch, spinal waves, thoracic bridge — hold each 2 min, 40 min", yogaType: "mobility" },
      { day: "Day 8", name: "Recovery & Release",    details: "Foam roll IT band, lats, quads + pigeon, figure-4, supine twist — 35 min", yogaType: "mobility" },
    ],
  },

  general: {
    beginner: [
      { day: "Day 1", name: "Full Body A", exercises: [
        { name: "Bodyweight Squat", sets: 3, reps: 12, weight: "Bodyweight" },
        { name: "Push-ups",         sets: 3, reps: 8,  weight: "Bodyweight" },
        { name: "Dumbbell Row",     sets: 3, reps: 10, weight: "2×15lb" },
        { name: "Plank",            sets: 3, reps: "30 sec", weight: "Bodyweight" },
      ]},
      { day: "Day 2", name: "Cardio + Core", exercises: [
        { name: "Brisk Walk or Light Jog", sets: 1, reps: "25 min", weight: "—" },
        { name: "Bicycle Crunches", sets: 3, reps: 15, weight: "Bodyweight" },
        { name: "Glute Bridges",    sets: 3, reps: 15, weight: "Bodyweight" },
        { name: "Bird-Dogs",        sets: 3, reps: 10, weight: "Bodyweight" },
      ]},
      { day: "Day 3", name: "Full Body B", exercises: [
        { name: "Reverse Lunges",   sets: 3, reps: 10, weight: "Bodyweight" },
        { name: "Dumbbell Chest Press", sets: 3, reps: 10, weight: "2×15lb" },
        { name: "Lat Pulldown",     sets: 3, reps: 12, weight: "Light" },
        { name: "Side Plank",       sets: 3, reps: "20 sec each", weight: "Bodyweight" },
      ]},
    ],
  },

};


/* =====================================================================
   ALTERNATE EXERCISE LIBRARY — Block 2 rotation (every even refresh cycle)
   ===================================================================== */

const WEIGHTLIFTING_ALT = {
  push: {
    beginner: [
      { name: "Machine Chest Press",  sets: 3, reps: 12, weight: "Light machine" },
      { name: "Pike Push-ups",        sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Arnold Press",         sets: 3, reps: 10, weight: "Light (2×10lb)" },
      { name: "Tricep Kickbacks",     sets: 3, reps: 12, weight: "Light (2×8lb)" },
    ],
    intermediate: [
      { name: "Incline Barbell Press",  sets: 4, reps: 8,  weight: "Bar + 35lbs" },
      { name: "Cable Chest Flyes",      sets: 3, reps: 12, weight: "Light cable" },
      { name: "Push Press",             sets: 3, reps: 6,  weight: "Bar + 30lbs" },
      { name: "Overhead Tricep Ext",    sets: 3, reps: 10, weight: "2×20lb" },
      { name: "Front Raises",           sets: 3, reps: 12, weight: "2×15lb" },
    ],
    advanced: [
      { name: "Close Grip Bench Press", sets: 4, reps: 6,  weight: "Bar + 70lbs" },
      { name: "Decline Bench Press",    sets: 4, reps: 8,  weight: "Bar + 65lbs" },
      { name: "Bradford Press",         sets: 3, reps: 8,  weight: "Bar + 20lbs" },
      { name: "Cable Tricep Overhead",  sets: 3, reps: 12, weight: "Moderate" },
      { name: "Lateral Raise Drop Set", sets: 4, reps: 15, weight: "2×20lb → 2×12lb" },
    ],
  },
  pull: {
    beginner: [
      { name: "Ring Rows",              sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Cable Face Pulls",       sets: 3, reps: 15, weight: "Light cable" },
      { name: "Reverse Dumbbell Fly",   sets: 3, reps: 12, weight: "2×10lb" },
      { name: "Incline Dumbbell Curl",  sets: 3, reps: 10, weight: "2×10lb" },
    ],
    intermediate: [
      { name: "Chest-Supported Row",    sets: 4, reps: 10, weight: "Moderate" },
      { name: "Wide Grip Pulldown",     sets: 3, reps: 10, weight: "Moderate" },
      { name: "Straight Arm Pulldown",  sets: 3, reps: 12, weight: "Light cable" },
      { name: "Incline Dumbbell Curl",  sets: 3, reps: 10, weight: "2×20lb" },
      { name: "Rear Delt Flyes",        sets: 3, reps: 15, weight: "Light" },
    ],
    advanced: [
      { name: "T-Bar Row",              sets: 4, reps: 6,  weight: "Heavy" },
      { name: "Meadows Row",            sets: 3, reps: 8,  weight: "Moderate" },
      { name: "Neutral Grip Pull-ups",  sets: 4, reps: 8,  weight: "Bodyweight" },
      { name: "Preacher Curl",          sets: 3, reps: 8,  weight: "Bar + 30lbs" },
      { name: "Cable Rope Pull-apart",  sets: 3, reps: 15, weight: "Light cable" },
    ],
  },
  legs: {
    beginner: [
      { name: "Step-ups",               sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Box Squats",             sets: 3, reps: 12, weight: "Bodyweight" },
      { name: "Glute Bridge",           sets: 3, reps: 15, weight: "Bodyweight" },
      { name: "Seated Calf Raises",     sets: 3, reps: 15, weight: "Light" },
    ],
    intermediate: [
      { name: "Hack Squat",             sets: 4, reps: 10, weight: "Moderate" },
      { name: "Stiff Leg Deadlift",     sets: 3, reps: 10, weight: "Bar + 40lbs" },
      { name: "Goblet Squat",           sets: 3, reps: 12, weight: "40lb kettlebell" },
      { name: "Leg Extension",          sets: 3, reps: 15, weight: "Moderate" },
      { name: "Seated Calf Raises",     sets: 4, reps: 15, weight: "Moderate" },
    ],
    advanced: [
      { name: "Pause Squat",            sets: 4, reps: 5,  weight: "Bar + 100lbs" },
      { name: "Sumo Deadlift",          sets: 4, reps: 5,  weight: "Bar + 155lbs" },
      { name: "Pistol Squat Prog",      sets: 3, reps: 6,  weight: "Assisted" },
      { name: "Glute Ham Raise",        sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Box Jumps",              sets: 4, reps: 6,  weight: "Bodyweight" },
    ],
  },
};

/* =====================================================================
   BODYWEIGHT EXERCISE LIBRARY — used when equipment restriction is active
   ===================================================================== */

const BODYWEIGHT_LIBRARY = {
  push: {
    beginner: [
      { name: "Push-ups",               sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Pike Push-ups",           sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Tricep Dips (chair)",     sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Wall Push-ups",           sets: 3, reps: 15, weight: "Bodyweight" },
    ],
    intermediate: [
      { name: "Diamond Push-ups",        sets: 4, reps: 10, weight: "Bodyweight" },
      { name: "Decline Push-ups",        sets: 3, reps: 12, weight: "Bodyweight" },
      { name: "Pike Push-ups",           sets: 4, reps: 10, weight: "Bodyweight" },
      { name: "Tricep Dips",             sets: 3, reps: 12, weight: "Bodyweight" },
      { name: "Plank to Push-up",        sets: 3, reps: 10, weight: "Bodyweight" },
    ],
    advanced: [
      { name: "Archer Push-ups",         sets: 4, reps: 8,  weight: "Bodyweight" },
      { name: "Pseudo Planche Push-ups", sets: 4, reps: 8,  weight: "Bodyweight" },
      { name: "Pike Push-ups",           sets: 4, reps: 12, weight: "Bodyweight" },
      { name: "Handstand Push-up Prog",  sets: 3, reps: 6,  weight: "Bodyweight" },
      { name: "Close-grip Push-ups",     sets: 4, reps: 10, weight: "Bodyweight" },
    ],
  },
  pull: {
    beginner: [
      { name: "Dead Hang",               sets: 3, reps: "20 sec", weight: "Bodyweight" },
      { name: "Negative Pull-ups",       sets: 3, reps: 5,        weight: "Bodyweight" },
      { name: "Bodyweight Row (table)",  sets: 3, reps: 10,       weight: "Bodyweight" },
      { name: "Superman Hold",           sets: 3, reps: "30 sec", weight: "Bodyweight" },
    ],
    intermediate: [
      { name: "Pull-ups",                sets: 4, reps: 8,  weight: "Bodyweight" },
      { name: "Chin-ups",                sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Bodyweight Row",          sets: 3, reps: 12, weight: "Bodyweight" },
      { name: "Scapular Pull-ups",       sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Superman Pulls",          sets: 3, reps: 12, weight: "Bodyweight" },
    ],
    advanced: [
      { name: "L-Sit Pull-ups",          sets: 4, reps: 6,  weight: "Bodyweight" },
      { name: "Commando Pull-ups",       sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Typewriter Pull-ups",     sets: 3, reps: 6,  weight: "Bodyweight" },
      { name: "Archer Pull-ups",         sets: 3, reps: 5,  weight: "Bodyweight" },
      { name: "Hollow Body Row",         sets: 3, reps: 10, weight: "Bodyweight" },
    ],
  },
  legs: {
    beginner: [
      { name: "Bodyweight Squats",       sets: 3, reps: 15, weight: "Bodyweight" },
      { name: "Lunges",                  sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Glute Bridges",           sets: 3, reps: 15, weight: "Bodyweight" },
      { name: "Calf Raises",             sets: 3, reps: 20, weight: "Bodyweight" },
    ],
    intermediate: [
      { name: "Bulgarian Split Squats",  sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Jump Squats",             sets: 4, reps: 10, weight: "Bodyweight" },
      { name: "Single-leg RDL",          sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Nordic Hamstring Curl",   sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Single-leg Glute Bridge", sets: 3, reps: 12, weight: "Bodyweight" },
    ],
    advanced: [
      { name: "Pistol Squats",           sets: 4, reps: 6,  weight: "Bodyweight" },
      { name: "Shrimp Squats",           sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Plyometric Lunges",       sets: 4, reps: 10, weight: "Bodyweight" },
      { name: "Natural Leg Curl",        sets: 3, reps: 8,  weight: "Bodyweight" },
      { name: "Box Jumps",               sets: 4, reps: 8,  weight: "Bodyweight" },
    ],
  },
};

/* =====================================================================
   EQUIPMENT HELPERS
   ===================================================================== */

/**
 * Infers the equipment category required by an exercise from its weight field.
 * Returns: "bodyweight" | "dumbbells" | "barbell" | "cables"
 */
function inferEquipment(exercise) {
  const w = (exercise.weight || "").toLowerCase().trim();
  if (!w || w === "bodyweight" || w === "—" || w === "-" || w.startsWith("bodyweight")) return "bodyweight";
  if (w.includes("bar ") || w.includes("barbell") || w.includes("belt")) return "barbell";
  if (w.includes("cable") || w.includes("machine") || w.includes("assisted") ||
      w === "light" || w === "moderate" || w === "heavy") return "cables";
  return "dumbbells";
}

/**
 * Parses the per-dumbbell weight from an exercise weight string.
 * "2×30lb" → 30, "60lb dumbbell" → 60, "Light (2×15lb)" → 15
 */
function parseDumbbellWeight(weightStr) {
  const w = (weightStr || "").toLowerCase();
  const cross = w.match(/\d+\s*[x×]\s*([\d.]+)/);
  if (cross) return parseFloat(cross[1]);
  const lbs = w.match(/([\d.]+)\s*lb/);
  if (lbs) return parseFloat(lbs[1]);
  return null;
}

/**
 * Filters exercises to only those compatible with the equipment restriction.
 * equipmentRestriction: { available: ["dumbbells", ...], dumbbellMaxWeight?: number }  Bodyweight is always allowed.
 */
function filterByEquipment(exercises, equipmentRestriction) {
  if (!equipmentRestriction) return exercises;
  const allowed = new Set(["bodyweight", ...(equipmentRestriction.available || [])]);
  return exercises.filter(ex => {
    const equip = inferEquipment(ex);
    if (!allowed.has(equip)) return false;
    if (equip === "dumbbells" && equipmentRestriction.dumbbellMaxWeight) {
      const w = parseDumbbellWeight(ex.weight);
      if (w !== null && w > equipmentRestriction.dumbbellMaxWeight) return false;
    }
    return true;
  });
}

/**
 * Returns an equipment-adjusted exercise list for a scheduled weightlifting workout.
 * Falls back to BODYWEIGHT_LIBRARY for the same focus/level if too few exercises remain.
 */
function getEquipmentAdjustedExercises(exercises, focus, level, equipmentRestriction) {
  if (!equipmentRestriction) return exercises;
  const filtered = filterByEquipment(exercises, equipmentRestriction);
  if (filtered.length >= 2) return filterAvoidedExercises(filtered);
  const bw = (BODYWEIGHT_LIBRARY[focus] || {})[level]
          || (BODYWEIGHT_LIBRARY[focus] || {}).intermediate
          || [];
  return filterAvoidedExercises(bw);
}

/** Returns the list of exercises the athlete wants to avoid (lowercase, trimmed) */
function getAvoidedExercises() {
  try {
    const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
    return (prefs.avoidedExercises || []).map(e => e.toLowerCase().trim());
  } catch { return []; }
}

/** Filters an exercise list against the avoided-exercises preference */
function filterAvoidedExercises(exercises) {
  const avoided = getAvoidedExercises();
  if (!avoided.length) return exercises;
  return exercises.filter(ex => !avoided.includes((ex.name || "").toLowerCase().trim()));
}

/** Returns exercises for a weightlifting session, alternating phases each refresh block.
 *  Pass an equipmentRestriction object to filter/substitute for available equipment. */
function getWeightliftingExercises(focus, level, blockIndex, equipmentRestriction) {
  const phase = blockIndex % 2;
  const lib = phase === 0 ? EXERCISE_LIBRARY.weightlifting : WEIGHTLIFTING_ALT;
  let exercises = ((lib[focus] || {})[level]) || [];
  if (equipmentRestriction) exercises = getEquipmentAdjustedExercises(exercises, focus, level, equipmentRestriction);
  else exercises = filterAvoidedExercises(exercises);
  return _personalizeWeights(exercises);
}

/**
 * Personalizes exercise weights using the athlete's reference lifts from their profile.
 * Maps each exercise to a reference lift (bench/squat/deadlift/ohp/row), converts
 * the reference to a 1RM estimate, then scales to a working weight for the given reps.
 */
function _personalizeWeights(exercises) {
  let refs = null;
  try {
    const all = JSON.parse(localStorage.getItem("trainingZones")) || {};
    refs = all.strength || null;
  } catch {}
  if (!refs) return exercises;

  const liftMap = [
    { key: "bench", patterns: [/bench/i, /chest press/i, /close.?grip/i, /decline press/i] },
    { key: "squat", patterns: [/squat/i, /hack squat/i, /leg press/i] },
    { key: "deadlift", patterns: [/deadlift/i, /rdl/i, /romanian/i, /stiff.?leg/i, /sumo/i] },
    { key: "ohp", patterns: [/overhead press/i, /shoulder press/i, /push press/i, /arnold press/i, /bradford/i, /military/i] },
    { key: "row", patterns: [/row(?!n)/i, /pendlay/i, /t.?bar/i, /meadows/i] },
  ];

  function to1RM(ref) {
    if (!ref?.weight) return null;
    const w = parseFloat(ref.weight);
    if (!w || isNaN(w)) return null;
    const t = ref.type || "1rm";
    if (t === "1rm") return w;
    if (t === "3rm") return w * 1.08;
    if (t === "5rm") return w * 1.15;
    if (t === "10rm") return w * 1.33;
    return w;
  }

  function workingWeight(oneRM, reps) {
    const r = parseInt(reps) || 10;
    const pct = (1 / (1 + r / 30)) * 0.95;
    return oneRM * pct;
  }

  function roundLbs(val) { return Math.round(val / 5) * 5; }

  const accessoryScale = {
    bench: [
      { pattern: /incline/i, factor: 0.85 },
      { pattern: /decline/i, factor: 0.95 },
      { pattern: /close.?grip/i, factor: 0.85 },
      { pattern: /chest press/i, factor: 0.90 },
    ],
    squat: [
      { pattern: /hack/i, factor: 0.80 },
      { pattern: /leg press/i, factor: 1.3 },
      { pattern: /goblet/i, factor: 0.35 },
      { pattern: /pause/i, factor: 0.85 },
      { pattern: /bulgarian|split/i, factor: 0.50 },
    ],
    deadlift: [
      { pattern: /romanian|rdl|stiff/i, factor: 0.70 },
      { pattern: /sumo/i, factor: 0.95 },
    ],
    ohp: [
      { pattern: /push press/i, factor: 1.10 },
      { pattern: /arnold/i, factor: 0.55 },
      { pattern: /bradford/i, factor: 0.70 },
    ],
    row: [
      { pattern: /pendlay/i, factor: 0.90 },
      { pattern: /t.?bar/i, factor: 0.95 },
      { pattern: /single|meadows/i, factor: 0.45 },
      { pattern: /cable|seated/i, factor: 0.65 },
    ],
  };

  return exercises.map(ex => {
    if (/bodyweight|bw|assisted|plank|bird|crunch/i.test(ex.weight || "")) return ex;
    if (/bodyweight/i.test(ex.name)) return ex;

    let refKey = null;
    for (const m of liftMap) {
      if (m.patterns.some(p => p.test(ex.name))) { refKey = m.key; break; }
    }
    if (!refKey) return ex;

    const oneRM = to1RM(refs[refKey]);
    if (!oneRM) return ex;

    let factor = 1.0;
    const scaleRules = accessoryScale[refKey] || [];
    for (const rule of scaleRules) {
      if (rule.pattern.test(ex.name)) { factor = rule.factor; break; }
    }

    const targetWeight = roundLbs(workingWeight(oneRM * factor, ex.reps));
    if (targetWeight <= 0) return ex;

    const isDumbbell = /dumbbell|2×|arnold|goblet/i.test(ex.name) || /2×/i.test(ex.weight || "");
    let weightStr;
    if (isDumbbell) {
      const perHand = roundLbs(targetWeight / 2);
      weightStr = perHand > 0 ? `2x${perHand} lbs` : ex.weight;
    } else {
      weightStr = `${targetWeight} lbs`;
    }

    return { ...ex, weight: weightStr };
  });
}

/* ── Training Preferences UI ─────────────────────────────────────────────── */

function loadTrainingPreferences() {
  try { return JSON.parse(localStorage.getItem("trainingPreferences") || "{}"); } catch { return {}; }
}

function saveTrainingPreferences(prefs) {
  localStorage.setItem("trainingPreferences", JSON.stringify(prefs)); if (typeof DB !== 'undefined') DB.syncKey('trainingPreferences');
}

function renderAvoidedExercisesList() {
  const container = document.getElementById("avoided-exercises-list");
  if (!container) return;
  const prefs = loadTrainingPreferences();
  const list = prefs.avoidedExercises || [];
  if (list.length === 0) {
    container.innerHTML = `<span class="pref-empty">None added yet</span>`;
    return;
  }
  container.innerHTML = list.map((name, i) => `
    <span class="pref-tag">
      ${name}
      <button class="pref-tag-remove" onclick="removeAvoidedExercise(${i})" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
    </span>`).join("");
}

function addAvoidedExercise() {
  const input = document.getElementById("avoided-exercise-input");
  const name = (input?.value || "").trim();
  if (!name) return;
  const prefs = loadTrainingPreferences();
  if (!prefs.avoidedExercises) prefs.avoidedExercises = [];
  // Avoid duplicates (case-insensitive)
  if (!prefs.avoidedExercises.some(e => e.toLowerCase() === name.toLowerCase())) {
    prefs.avoidedExercises.push(name);
    saveTrainingPreferences(prefs);
  }
  input.value = "";
  renderAvoidedExercisesList();
  refreshGeneratedWorkouts();
}

function removeAvoidedExercise(index) {
  const prefs = loadTrainingPreferences();
  if (!prefs.avoidedExercises) return;
  prefs.avoidedExercises.splice(index, 1);
  saveTrainingPreferences(prefs);
  renderAvoidedExercisesList();
  refreshGeneratedWorkouts();
}

function refreshGeneratedWorkouts() {
  const today = getTodayString ? getTodayString() : new Date().toISOString().slice(0, 10);
  const lib = EXERCISE_LIBRARY;
  let changed = false;
  let equipRestrictions = {};
  try { equipRestrictions = JSON.parse(localStorage.getItem("equipmentRestrictions")) || {}; } catch {}

  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}

  schedule = schedule.map(w => {
    if (w.source !== "generated" || w.date < today) return w;

    if (w.type === "weightlifting") {
      const idMatch = String(w.id).match(/weightlifting-(\w+)-b(\d+)/);
      if (!idMatch) return w;
      const focus      = idMatch[1];
      const blockIndex = parseInt(idMatch[2]);
      const level      = w.level || "intermediate";
      const eqRestr    = equipRestrictions[w.date] || equipRestrictions["permanent"] || null;
      changed = true;
      return { ...w, exercises: getWeightliftingExercises(focus, level, blockIndex, eqRestr) };
    }

    if (w.type === "bodyweight" && w.exercises) {
      const idMatch = String(w.id).match(/bodyweight-(\w+)-b(\d+)/);
      if (!idMatch) return { ...w, exercises: filterAvoidedExercises(w.exercises) };
      const focus = idMatch[1];
      const level = w.level || "intermediate";
      const exercises = (BODYWEIGHT_LIBRARY[focus] || {})[level]
                     || (BODYWEIGHT_LIBRARY[focus] || {}).beginner || [];
      changed = true;
      return { ...w, exercises: filterAvoidedExercises(exercises) };
    }

    if (w.type === "general" && w.exercises) {
      const level    = w.level || "beginner";
      const sessions = ((lib["general"] || {})[level]) || ((lib["general"] || {})["beginner"]) || [];
      const idMatch  = String(w.id).match(/general-(\d+)-b(\d+)/);
      if (!idMatch) return { ...w, exercises: filterAvoidedExercises(w.exercises) };
      const slotIdx    = parseInt(idMatch[1]);
      const blockIndex = parseInt(idMatch[2]);
      const sessionIdx = (slotIdx + blockIndex * 2) % (sessions.length || 1);
      const s          = sessions[sessionIdx];
      changed = true;
      return { ...w, exercises: s && s.exercises ? filterAvoidedExercises(s.exercises) : w.exercises };
    }

    return w;
  });

  if (changed) {
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
    if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
      renderDayDetail(selectedDate);
    }
  }
}


/* =====================================================================
   SECTION 2: PLAN GENERATOR
   Reads the user's selections (type, days, level) and builds a plan.
   ===================================================================== */

/**
 * generatePlan() is called when the user clicks "Generate Plan".
 * It reads the dropdown values from the HTML, picks the right exercises,
 * and writes the HTML output into the #generated-plan div.
 */
/** Returns sorted array of selected day-of-week numbers (0=Sun…6=Sat) from the day picker */
function getSelectedPlanDays() {
  const picker = document.getElementById("plan-day-picker");
  if (!picker) return [1, 3, 5]; // Mon/Wed/Fri default
  const boxes = picker.querySelectorAll("input[type=checkbox]:checked");
  return Array.from(boxes).map(cb => parseInt(cb.value)).sort((a, b) => a - b);
}

/** Updates the hint text below the day picker */
function updateDayPickerHint() {
  const hint = document.getElementById("day-picker-hint");
  if (!hint) return;
  const count = getSelectedPlanDays().length;
  hint.textContent = `${count} day${count !== 1 ? "s" : ""} selected`;
}

/* ── Strength plan flow: goal, split, per-day muscle customization ──────── */

let _planGoal = "maintain";
let _planSplitDays = []; // [{ label, muscles: ["chest","shoulders","triceps"] }, ...]

const SPLIT_PRESETS = {
  ppl: ["Push", "Pull", "Legs"],
  "upper-lower": ["Upper Body", "Lower Body"],
  "full-body": ["Full Body"],
};

const SPLIT_MUSCLES = {
  "Push":        ["chest", "shoulders", "triceps"],
  "Pull":        ["back", "biceps"],
  "Legs":        ["quads", "hamstrings", "glutes", "calves"],
  "Upper Body":  ["chest", "back", "shoulders", "biceps", "triceps"],
  "Lower Body":  ["quads", "hamstrings", "glutes", "calves"],
  "Full Body":   ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "core"],
  "Chest":       ["chest", "triceps"],
  "Back":        ["back", "biceps"],
  "Shoulders":   ["shoulders"],
  "Arms":        ["biceps", "triceps"],
};

const ALL_MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "core", "calves"];

function onPlanTypeChange() {
  const type = document.getElementById("workout-type")?.value;
  const strengthOpts = document.getElementById("plan-strength-options");
  const otherOpts = document.getElementById("plan-other-options");
  if (type === "weightlifting") {
    strengthOpts.style.display = "";
    otherOpts.style.display = "none";
    updateSplitPreview();
  } else {
    strengthOpts.style.display = "none";
    otherOpts.style.display = "";
  }
}

function selectPlanGoal(btn) {
  document.querySelectorAll(".plan-goal-btn").forEach(b => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  _planGoal = btn.dataset.goal;
}

function updateSplitPreview() {
  const preset = document.getElementById("plan-split-preset")?.value || "ppl";
  const numDays = getSelectedPlanDays().length || 3;
  const splitNames = SPLIT_PRESETS[preset] || SPLIT_PRESETS.ppl;
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const selectedDows = getSelectedPlanDays();

  _planSplitDays = [];
  for (let i = 0; i < numDays; i++) {
    const splitName = splitNames[i % splitNames.length];
    _planSplitDays.push({
      label: splitName,
      muscles: [...(SPLIT_MUSCLES[splitName] || ["full body"])],
      dow: selectedDows[i],
    });
  }

  _renderSplitPreview();
}

function _renderSplitPreview() {
  const container = document.getElementById("plan-split-preview");
  if (!container) return;
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const preset = document.getElementById("plan-split-preset")?.value || "ppl";
  const isCustom = preset === "custom";

  container.innerHTML = _planSplitDays.map((day, i) => {
    const dowLabel = DOW_SHORT[day.dow] || `Day ${i + 1}`;
    const muscleStr = day.muscles.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(", ");
    const isOpen = document.getElementById(`plan-muscle-picker-${i}`)?.style.display === "flex";
    const nameDisplay = isOpen
      ? `<input type="text" class="plan-split-name-input" id="plan-split-name-${i}" value="${escHtml(day.label)}" placeholder="e.g. Push Day" onchange="renameSplitDay(${i}, this.value)" />`
      : `<strong>${escHtml(day.label)}</strong>`;
    return `<div class="plan-split-day" id="plan-split-day-${i}">
      <span class="plan-split-day-label">${dowLabel}</span>
      <span class="plan-split-day-muscles" id="plan-split-muscles-${i}">${nameDisplay} <span style="color:var(--color-text-muted);font-size:0.72rem">(${muscleStr})</span></span>
      <button class="plan-split-day-edit" onclick="toggleSplitDayEdit(${i})">${isOpen ? "Done" : "Choose"}</button>
    </div>
    <div class="plan-muscle-picker" id="plan-muscle-picker-${i}" style="display:${isOpen ? "flex" : "none"}">
      ${ALL_MUSCLES.map(m => `<button class="plan-muscle-chip${day.muscles.includes(m) ? " is-active" : ""}" data-muscle="${m}" onclick="toggleSplitMuscle(${i},'${m}',this)">${m.charAt(0).toUpperCase() + m.slice(1)}</button>`).join("")}
    </div>`;
  }).join("");
}

function toggleSplitDayEdit(dayIdx) {
  const picker = document.getElementById(`plan-muscle-picker-${dayIdx}`);
  if (!picker) return;
  const opening = picker.style.display === "none";
  // If closing, grab the name input value first
  if (!opening) {
    const nameInput = document.getElementById(`plan-split-name-${dayIdx}`);
    if (nameInput && nameInput.value.trim()) _planSplitDays[dayIdx].label = nameInput.value.trim();
  }
  _renderSplitPreview();
  // Toggle after re-render
  const newPicker = document.getElementById(`plan-muscle-picker-${dayIdx}`);
  if (newPicker) newPicker.style.display = opening ? "flex" : "none";
  // Re-render again to update button text and name field
  _renderSplitPreview();
  const finalPicker = document.getElementById(`plan-muscle-picker-${dayIdx}`);
  if (finalPicker) finalPicker.style.display = opening ? "flex" : "none";
}

function renameSplitDay(dayIdx, name) {
  if (_planSplitDays[dayIdx] && name.trim()) {
    _planSplitDays[dayIdx].label = name.trim();
  }
}

function toggleSplitMuscle(dayIdx, muscle, btn) {
  const day = _planSplitDays[dayIdx];
  if (!day) return;
  const idx = day.muscles.indexOf(muscle);
  if (idx >= 0) day.muscles.splice(idx, 1);
  else day.muscles.push(muscle);
  btn.classList.toggle("is-active");
  // Update label to "Custom"
  day.label = "Custom";
  // Also switch preset to custom
  const presetEl = document.getElementById("plan-split-preset");
  if (presetEl) presetEl.value = "custom";
  _renderSplitPreview();
  // Re-open the picker since render replaces DOM
  const picker = document.getElementById(`plan-muscle-picker-${dayIdx}`);
  if (picker) picker.style.display = "flex";
}

function _getOtherPlanDays() {
  const picker = document.getElementById("plan-day-picker-other");
  if (!picker) return [1, 3, 5];
  const boxes = picker.querySelectorAll("input[type=checkbox]:checked");
  return Array.from(boxes).map(cb => parseInt(cb.value)).sort((a, b) => a - b);
}

/* ── Goal-based exercise parameter adjustments ─────────────────────────── */

const GOAL_PARAMS = {
  bulk:     { setsAdj: 1, repRange: [4, 8],  restSec: 90,  weightPct: 1.05 },
  cut:      { setsAdj: 0, repRange: [10, 15], restSec: 45,  weightPct: 0.80 },
  maintain: { setsAdj: 0, repRange: [8, 12], restSec: 60,  weightPct: 1.00 },
  lose:     { setsAdj: 0, repRange: [12, 20], restSec: 30,  weightPct: 0.65 },
};

function _applyGoalToExercises(exercises, goal) {
  const params = GOAL_PARAMS[goal] || GOAL_PARAMS.maintain;
  return exercises.map(ex => {
    const newEx = { ...ex };
    // Adjust sets
    if (typeof newEx.sets === "number") newEx.sets = Math.max(1, newEx.sets + params.setsAdj);
    // Adjust reps to goal range (pick midpoint if current reps is numeric)
    const curReps = parseInt(newEx.reps);
    if (!isNaN(curReps)) {
      const midRep = Math.round((params.repRange[0] + params.repRange[1]) / 2);
      newEx.reps = midRep;
    }
    // Adjust weight — skip dumbbell count prefix like "2×" and target the actual weight number
    if (newEx.weight && !/bodyweight|bw/i.test(newEx.weight)) {
      const wStr = String(newEx.weight);
      const wMatch = wStr.match(/(\d+\s*[×x]\s*)?([\d.]+)\s*(lb|kg|lbs)?/i);
      if (wMatch && wMatch[2]) {
        const adjusted = Math.round(parseFloat(wMatch[2]) * params.weightPct / 5) * 5;
        const prefix = wMatch[1] || "";
        const suffix = wStr.slice(wStr.indexOf(wMatch[2]) + wMatch[2].length);
        newEx.weight = prefix + String(adjusted) + suffix;
      }
    }
    // Adjust rest
    newEx.rest = params.restSec + "s";
    return newEx;
  });
}

function generatePlan() {
  // Read the values from the form
  const type           = document.getElementById("workout-type").value;
  const selectedDays   = type === "weightlifting" ? getSelectedPlanDays() : _getOtherPlanDays();
  const days           = selectedDays.length || 3;
  const level          = document.getElementById("fitness-level").value;

  // Conflict check: warn if an active race of the same category already exists
  if (typeof TRAINING_CATEGORY !== "undefined" && typeof CATEGORY_LABELS !== "undefined") {
    const schedCat = TRAINING_CATEGORY[type];
    if (schedCat) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const events = (() => { try { return JSON.parse(localStorage.getItem("events")) || []; } catch { return []; } })();
      const conflictingRace = events.find(e => e.date > todayStr && TRAINING_CATEGORY[e.type] === schedCat);
      if (conflictingRace) {
        const catLabel = CATEGORY_LABELS[schedCat] || schedCat;
        if (!confirm(`You already have an active ${catLabel} race plan ("${conflictingRace.name}"). Adding a standalone workout schedule for the same sport may cause overtraining. Continue anyway?`)) return;
      }
    }
  }

  // Get the container where we'll display the plan
  const container = document.getElementById("generated-plan");

  // Build the HTML string for the plan
  let html = `<div style="margin-top:16px; padding-top:16px; border-top:1px solid #e2e8f0;">
    <strong style="font-size:0.95rem;">Your ${days}-Day ${capitalize(type)} Plan (${capitalize(level)})</strong>
  </div>`;

  // ----- Weight Lifting -----
  if (type === "weightlifting") {
    const goalLabel = { bulk: "Bulk", cut: "Cut", maintain: "Maintain", lose: "Weight Loss" }[_planGoal] || "Maintain";
    html = `<div style="margin-top:16px; padding-top:16px; border-top:1px solid #e2e8f0;">
      <strong style="font-size:0.95rem;">Your ${days}-Day Strength Plan (${capitalize(level)} · ${goalLabel})</strong>
    </div>`;
    for (let i = 0; i < days; i++) {
      const split = _planSplitDays[i % _planSplitDays.length];
      const muscles = split.muscles || ["chest", "back", "shoulders"];
      // Map muscles to library focuses and collect exercises
      const focusMap = {
        chest: "push", shoulders: "push", triceps: "push",
        back: "pull", biceps: "pull",
        quads: "legs", hamstrings: "legs", glutes: "legs", calves: "legs",
        core: "legs",
      };
      const focusesUsed = new Set();
      muscles.forEach(m => { if (focusMap[m]) focusesUsed.add(focusMap[m]); });
      let exList = [];
      focusesUsed.forEach(focus => {
        const candidates = getWeightliftingExercises(focus, level, 0);
        // Filter to only exercises targeting selected muscles
        exList = exList.concat(candidates);
      });
      // If "full body" or empty, grab a mix
      if (!exList.length) {
        exList = [
          ...getWeightliftingExercises("push", level, 0).slice(0, 2),
          ...getWeightliftingExercises("pull", level, 0).slice(0, 2),
          ...getWeightliftingExercises("legs", level, 0).slice(0, 2),
        ];
      }
      // Apply goal adjustments
      exList = _applyGoalToExercises(exList, _planGoal);
      const dayLabel = split.label || muscles.map(m => capitalize(m)).join(" / ");
      html += buildLiftingDay(`Day ${i + 1} — ${dayLabel}`, exList);
    }
  }

  // ----- HIIT -----
  else if (type === "hiit") {
    const sessions = EXERCISE_LIBRARY.hiit[level] || EXERCISE_LIBRARY.hiit.beginner;
    const fmtLabels = { circuit: "Circuit", tabata: "Tabata", emom: "EMOM", amrap: "AMRAP" };
    for (let i = 0; i < days; i++) {
      const s = sessions[i % sessions.length];
      const fmtLabel = fmtLabels[s.format] || s.format;
      let header = `Day ${i + 1}: ${s.name} <span style="font-size:0.75rem;color:var(--color-text-muted);font-weight:500">${fmtLabel}`;
      if (s.rounds > 1) header += ` · ${s.rounds} rounds`;
      if (s.restBetweenRounds && s.restBetweenRounds !== "0s") header += ` · ${s.restBetweenRounds} rest`;
      header += `</span>`;
      const previewExercises = filterAvoidedExercises(s.exercises).map(ex => ({
        ...ex, sets: s.format === "amrap" ? 1 : (s.rounds || 1),
      }));
      html += buildLiftingDay(header, previewExercises);
    }
  }

  // ----- Running -----
  else if (type === "running") {
    const sessions = EXERCISE_LIBRARY.running[level];
    for (let i = 0; i < days; i++) {
      // Wrap around if days > available sessions
      const s = sessions[i % sessions.length];
      html += buildCardioDay(`Day ${i + 1}: ${s.name}`, s.details);
    }
  }

  // ----- Triathlon -----
  else if (type === "triathlon") {
    const sessions = EXERCISE_LIBRARY.triathlon[level];
    for (let i = 0; i < days; i++) {
      const s = sessions[i % sessions.length];
      html += buildCardioDay(`Day ${i + 1}: ${s.name}`, s.details);
    }
  }

  // ----- Cycling -----
  else if (type === "cycling") {
    const sessions = EXERCISE_LIBRARY.cycling[level];
    for (let i = 0; i < days; i++) {
      const s = sessions[i % sessions.length];
      html += buildCardioDay(`Day ${i + 1}: ${s.name}`, s.details);
    }
  }

  // ----- Bodyweight -----
  else if (type === "bodyweight") {
    const focuses = ["push", "pull", "legs"];
    for (let i = 0; i < days; i++) {
      const focus = focuses[i % focuses.length];
      const exercises = (BODYWEIGHT_LIBRARY[focus] || {})[level]
                     || (BODYWEIGHT_LIBRARY[focus] || {}).beginner
                     || [];
      html += buildLiftingDay(`Day ${i + 1}: ${capitalize(focus)} (Bodyweight)`, filterAvoidedExercises(exercises));
    }
  }

  // ----- General Fitness -----
  else if (type === "general") {
    const templates = EXERCISE_LIBRARY.general[level] || EXERCISE_LIBRARY.general.beginner;
    for (let i = 0; i < days; i++) {
      const t = templates[i % templates.length];
      if (t.exercises) {
        html += buildLiftingDay(`Day ${i + 1}: ${t.name}`, filterAvoidedExercises(t.exercises));
      } else {
        html += buildCardioDay(`Day ${i + 1}: ${t.name}`, t.details);
      }
    }
  }

  container.innerHTML = html;

  // Save to calendar
  const startDate    = document.getElementById("plan-start-date").value;
  const weeksRaw     = document.getElementById("plan-weeks").value;
  const isIndefinite = weeksRaw === "indefinite";
  const weeks        = isIndefinite ? 104 : parseInt(weeksRaw);
  const refreshWeeks = parseInt(document.getElementById("plan-refresh").value) || 4;
  const msgEl        = document.getElementById("plan-save-msg");
  if (startDate && weeks) {
    const count = saveWorkoutSchedule(type, selectedDays, level, startDate, weeks, refreshWeeks);
    if (msgEl) {
      msgEl.style.color = "var(--color-success)";
      msgEl.textContent = isIndefinite
        ? `✓ ${count} sessions scheduled. Exercises refresh every ${refreshWeeks} weeks automatically.`
        : `✓ ${count} sessions scheduled on your calendar.`;
      setTimeout(() => { msgEl.textContent = ""; }, 4000);
    }
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
  }
}

/** Updates the hint text below the duration/refresh selectors */
function updateWeeksDurationHint() {
  const hint = document.getElementById("plan-weeks-hint");
  if (!hint) return;
  const programVal  = document.getElementById("plan-weeks").value;
  const refreshEl   = document.getElementById("plan-refresh");
  const refreshWeeks = refreshEl ? (parseInt(refreshEl.value) || 4) : 4;

  if (programVal === "indefinite") {
    hint.textContent = `Sessions scheduled 2 years out. Exercises refresh every ${refreshWeeks} weeks for continuous variety.`;
  } else {
    const totalWeeks = parseInt(programVal);
    const blocks     = Math.ceil(totalWeeks / refreshWeeks);
    hint.textContent = `${totalWeeks} weeks of sessions, exercises refresh every ${refreshWeeks} weeks (${blocks} block${blocks !== 1 ? "s" : ""}).`;
  }
}

/** Builds the HTML for a single strength/lifting day */
function buildLiftingDay(title, exercises) {
  let rows = exercises.map(e =>
    `<tr>
      <td>${escHtml(e.name)}</td>
      <td>${escHtml(String(e.sets))}</td>
      <td>${escHtml(String(e.reps))}</td>
      <td>${escHtml(_normalizeWeightDisplay(e.weight))}</td>
    </tr>`
  ).join("");

  return `
    <div class="plan-day">
      <h3>${title}</h3>
      <table class="exercise-table">
        <thead>
          <tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Builds the HTML for a single cardio / endurance day */
function buildCardioDay(title, details) {
  return `
    <div class="plan-day">
      <h3>${title}</h3>
      <p>${details}</p>
    </div>`;
}


/* =====================================================================
   SECTION 3: LOGGING WORKOUTS
   Handles the "Log a Workout" form — adding exercise rows and saving.
   ===================================================================== */

/** Shows/hides the intensity selector when "Generate workout" checkbox changes */

/* --- Drag-to-reorder helpers for exercise / segment rows --- */
let _logDragEl = null;
function _initRowDrag(row, container) {
  row.draggable = true;
  row.addEventListener("dragstart", (e) => { _logDragEl = row; row.classList.add("drag-active"); e.dataTransfer.effectAllowed = "move"; });
  row.addEventListener("dragend",   ()  => { row.classList.remove("drag-active"); _logDragEl = null; });
  row.addEventListener("dragover",  (e) => {
    if (!_logDragEl || _logDragEl === row) return;
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    row.classList.toggle("drag-insert-above", e.clientY < mid);
    row.classList.toggle("drag-insert-below", e.clientY >= mid);
  });
  row.addEventListener("dragleave", () => { row.classList.remove("drag-insert-above", "drag-insert-below"); });
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drag-insert-above", "drag-insert-below");
    if (!_logDragEl || _logDragEl === row) return;
    const rect = row.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    if (e.clientY < mid) container.insertBefore(_logDragEl, row);
    else                 container.insertBefore(_logDragEl, row.nextSibling);
  });
  // Touch support for mobile
  TouchDrag.attach(row, container, {
    hintClasses: ["drag-insert-above", "drag-insert-below"],
    rowSelector: "[draggable]",
    handleSelector: ".drag-handle",
    onDrop(dragEl, targetEl, clientY) {
      const rect = targetEl.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) container.insertBefore(dragEl, targetEl);
      else               container.insertBefore(dragEl, targetEl.nextSibling);
    }
  });
}

const LOG_ENDURANCE_TYPES = ["running", "cycling", "swimming", "triathlon", "walking", "rowing"];

function _isLogBrickType() {
  return document.getElementById("log-workout-type")?.value === "triathlon";
}

function logTypeChanged() {
  const type = document.getElementById("log-workout-type")?.value;
  const isEndurance = LOG_ENDURANCE_TYPES.includes(type);
  const strengthSec  = document.getElementById("log-strength-section");
  const enduranceSec = document.getElementById("log-endurance-section");
  const wattsRow     = document.getElementById("log-watts-row");
  if (strengthSec)  strengthSec.style.display  = isEndurance ? "none" : "";
  if (enduranceSec) enduranceSec.style.display = isEndurance ? "" : "none";
  if (wattsRow) wattsRow.style.display = type === "cycling" ? "" : "none";
  // Update discipline selectors visibility on existing segment rows
  document.querySelectorAll("#log-segment-entries .sw-segment-row").forEach(row => {
    const discDiv = row.querySelector(".seg-discipline-wrap");
    if (discDiv) discDiv.style.display = type === "triathlon" ? "" : "none";
    row.classList.toggle("sw-segment-row--brick", type === "triathlon");
  });
}

function addLogSegmentRow(seg) {
  const container = document.getElementById("log-segment-entries");
  if (!container) return;
  const isBrick = _isLogBrickType();
  const row = document.createElement("div");
  row.className = "exercise-row sw-segment-row" + (isBrick ? " sw-segment-row--brick" : "");
  const effort = (seg && seg.effort) || "Z2";
  const disc = (seg && seg.discipline) || "";
  const _sel = v => (effort === v) ? " selected" : "";
  const _dsel = v => disc === v ? " selected" : "";
  row.innerHTML = `
    <div class="seg-discipline-wrap" style="${isBrick ? "" : "display:none"}"><label>Leg</label>
      <select class="seg-discipline">
        <option value="bike"${_dsel("bike")}>Bike</option>
        <option value="transition"${_dsel("transition")}>Transition</option>
        <option value="run"${_dsel("run")}>Run</option>
      </select>
    </div>
    <div><label>Phase</label><input type="text" class="seg-name" placeholder="${isBrick ? "e.g. Steady Ride" : "e.g. Easy Run"}" value="${escHtml((seg && seg.name) || "")}" /></div>
    <div><label>Duration</label><input type="text" class="seg-duration" placeholder="e.g. 20 min" value="${escHtml((seg && seg.duration) || "")}" /></div>
    <div><label>Zone</label>
      <select class="seg-effort">
        <option value="RW"${_sel("RW")}>Rest / Walk</option>
        <option value="Z1"${_sel("Z1")}>Z1 Recovery</option>
        <option value="Z2"${_sel("Z2")}>Z2 Aerobic</option>
        <option value="Z3"${_sel("Z3")}>Z3 Tempo</option>
        <option value="Z4"${_sel("Z4")}>Z4 Threshold</option>
        <option value="Z5"${_sel("Z5")}>Z5 VO2 Max</option>
        <option value="Z6"${_sel("Z6")}>Z6 Max Sprint</option>
      </select>
    </div>
    <button class="remove-exercise-btn" onclick="this.parentElement.remove()" style="align-self:flex-end;margin-bottom:2px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  _initRowDrag(row, container);
  container.appendChild(row);
}

/** Adds a blank exercise input row to the log form */
function addExerciseRow() {
  const container = document.getElementById("exercise-entries");

  // Create a new div with the exercise row layout
  const row = document.createElement("div");
  row.className = "exercise-row";

  row.innerHTML = `
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    <div>
      <label>Exercise Name</label>
      <input type="text" class="ex-name" placeholder="e.g. Bench Press" />
    </div>
    <div>
      <label>Sets</label>
      <input type="number" class="ex-sets" placeholder="3" min="1" onchange="exPyramidSetsChanged(this)" />
    </div>
    <div>
      <label>Reps</label>
      <input type="number" class="ex-reps" placeholder="10" min="1" />
    </div>
    <div>
      <label>Weight</label>
      <input type="text" class="ex-weight" placeholder="45lbs" />
    </div>
    <button class="ex-pyramid-btn" title="Per-set reps & weight" onclick="exTogglePyramid(this)">▾</button>
    <button class="remove-exercise-btn" title="Remove" onclick="removeExerciseRow(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
    <div class="ex-pyramid-detail" style="display:none"></div>
  `;

  _initRowDrag(row, container);
  container.appendChild(row);
}

function exTogglePyramid(btn) {
  const row = btn.closest(".exercise-row");
  const detail = row.querySelector(".ex-pyramid-detail");
  const isOpen = detail.style.display !== "none";

  if (isOpen) {
    detail.style.display = "none";
    btn.textContent = "▾";
    btn.classList.remove("is-active");
    return;
  }

  // Build per-set rows based on current sets count
  const setsVal = parseInt(row.querySelector(".ex-sets")?.value) || 3;
  const defaultReps = row.querySelector(".ex-reps")?.value || "";
  const defaultWeight = row.querySelector(".ex-weight")?.value || "";

  // Preserve existing values if re-opening
  const existing = detail.querySelectorAll(".ex-pyr-row");
  if (existing.length === setsVal) {
    detail.style.display = "";
    btn.textContent = "▴";
    btn.classList.add("is-active");
    return;
  }

  let html = '<div class="ex-pyr-header"><span>Set</span><span>Reps</span><span>Weight</span></div>';
  for (let i = 0; i < setsVal; i++) {
    html += `<div class="ex-pyr-row">
      <span class="ex-pyr-label">${i + 1}</span>
      <input type="text" class="ex-pyr-reps" placeholder="${defaultReps || '10'}" value="${defaultReps}" oninput="_syncPyramidToMain(this)" />
      <input type="text" class="ex-pyr-weight" placeholder="${defaultWeight || 'lbs'}" value="${defaultWeight}" oninput="_syncPyramidToMain(this)" />
    </div>`;
  }
  detail.innerHTML = html;
  detail.style.display = "";
  btn.textContent = "▴";
  btn.classList.add("is-active");
}

function exPyramidSetsChanged(input) {
  const row = input.closest(".exercise-row");
  const detail = row.querySelector(".ex-pyramid-detail");
  if (detail.style.display === "none") return;
  // Re-generate pyramid rows with new set count
  exTogglePyramid(row.querySelector(".ex-pyramid-btn"));
  // Force re-open since toggle would have closed it
  if (detail.style.display === "none") {
    exTogglePyramid(row.querySelector(".ex-pyramid-btn"));
  }
}

/** Syncs pyramid per-set values up to the main reps/weight fields as a range */
function _syncPyramidToMain(input) {
  const row = input.closest(".exercise-row");
  if (!row) return;
  const pyrRows = row.querySelectorAll(".ex-pyr-row");
  if (!pyrRows.length) return;

  const repsVals = [];
  const weightVals = [];
  pyrRows.forEach(pr => {
    const r = pr.querySelector(".ex-pyr-reps")?.value.trim();
    const w = pr.querySelector(".ex-pyr-weight")?.value.trim();
    if (r) repsVals.push(r);
    if (w) weightVals.push(w);
  });

  const mainReps = row.querySelector(".ex-reps");
  const mainWeight = row.querySelector(".ex-weight");

  if (mainReps && repsVals.length) {
    const nums = repsVals.map(v => parseInt(v)).filter(n => !isNaN(n));
    if (nums.length) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      mainReps.value = min === max ? String(min) : `${min}-${max}`;
    }
  }

  if (mainWeight && weightVals.length) {
    // Extract numeric portions for range display
    const nums = weightVals.map(v => {
      const m = v.match(/([\d.]+)/);
      return m ? parseFloat(m[1]) : NaN;
    }).filter(n => !isNaN(n));
    if (nums.length) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      // Preserve the unit suffix from the first value
      const unit = weightVals[0].replace(/[\d.]+/, "").trim() || "lbs";
      mainWeight.value = min === max ? `${min} ${unit}` : `${min}-${max} ${unit}`;
    }
  }
}

/** Removes a specific exercise row when the × button is clicked */
function removeExerciseRow(btn) {
  // btn.parentElement is the .exercise-row div
  btn.parentElement.remove();
}

/**
 * saveWorkout() collects the form data and saves it to localStorage.
 * localStorage can only store strings, so we convert our data to JSON
 * using JSON.stringify(), then parse it back with JSON.parse() when reading.
 */
function saveWorkout() {
  const date  = document.getElementById("log-date").value;
  const name  = (document.getElementById("log-workout-name")?.value || "").trim();
  const type  = document.getElementById("log-workout-type").value;
  const notes = document.getElementById("log-notes").value.trim();
  const msg   = document.getElementById("workout-save-msg");

  if (!date) {
    msg.style.color = "#ef4444";
    msg.textContent = "Please select a date.";
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (date > today) {
    msg.style.color = "#ef4444";
    msg.textContent = "Log a Workout is for past/missed workouts only.";
    return;
  }

  const isEndurance = LOG_ENDURANCE_TYPES.includes(type);
  let exercises = [];
  let segments  = null;

  if (isEndurance) {
    segments = [];
    const isBrick = type === "triathlon";
    document.querySelectorAll("#log-segment-entries .exercise-row").forEach(row => {
      const n = row.querySelector(".seg-name")?.value.trim();
      const d = row.querySelector(".seg-duration")?.value.trim();
      const e = row.querySelector(".seg-effort")?.value;
      if (n || d || isBrick) {
        const seg = { name: n || "", duration: d || "", effort: e || "Z2" };
        if (isBrick) seg.discipline = row.querySelector(".seg-discipline")?.value || "bike";
        segments.push(seg);
      }
    });
  } else {
    document.querySelectorAll("#exercise-entries .exercise-row").forEach(row => {
      const name   = row.querySelector(".ex-name").value.trim();
      const sets   = row.querySelector(".ex-sets").value;
      const reps   = row.querySelector(".ex-reps").value;
      const weight = row.querySelector(".ex-weight").value.trim();
      if (!name) return;
      const ex = { name, sets, reps, weight };

      // Collect per-set pyramid details if expanded
      const detail = row.querySelector(".ex-pyramid-detail");
      if (detail && detail.style.display !== "none") {
        const pyrRows = detail.querySelectorAll(".ex-pyr-row");
        if (pyrRows.length > 0) {
          const setDetails = [];
          let hasDiff = false;
          pyrRows.forEach(pr => {
            const r = pr.querySelector(".ex-pyr-reps")?.value.trim() || reps;
            const w = pr.querySelector(".ex-pyr-weight")?.value.trim() || weight;
            setDetails.push({ reps: r, weight: w });
            if (r !== reps || w !== weight) hasDiff = true;
          });
          // Only save setDetails if values actually differ across sets
          if (hasDiff) ex.setDetails = setDetails;
        }
      }
      exercises.push(ex);
    });
  }

  // Build the workout entry object
  const workout = {
    id: generateId("workout"),
    date,
    name,
    type,
    notes,
    exercises,
  };
  if (segments) workout.segments = segments;
  // Bike watt logging
  if (type === "cycling") {
    const watts = parseInt(document.getElementById("log-watts")?.value);
    if (watts > 0) workout.avgWatts = watts;
  }

  // Load existing workouts from localStorage (or start with an empty array)
  const workouts = loadWorkouts();

  // Add the new workout to the beginning of the list (newest first)
  workouts.unshift(workout);

  // Save the updated array back to localStorage as a JSON string
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  // Show success message and refresh the history display
  msg.style.color = "#22c55e";
  msg.textContent = "Workout saved!";
  setTimeout(() => { msg.textContent = ""; }, 3000);

  // Reset the form
  const logDateEl2 = document.getElementById("log-date");
  logDateEl2.value = "";
  const yesterday2 = new Date();
  yesterday2.setDate(yesterday2.getDate() - 1);
  logDateEl2.max = yesterday2.toISOString().slice(0, 10);
  const logNameEl = document.getElementById("log-workout-name");
  if (logNameEl) logNameEl.value = "";
  document.getElementById("log-notes").value = "";
  document.getElementById("exercise-entries").innerHTML = "";
  document.getElementById("log-segment-entries").innerHTML = "";
  // Reset to strength view
  document.getElementById("log-workout-type").value = "weightlifting";
  logTypeChanged();
  addExerciseRow();
  addLogSegmentRow();

  renderWorkoutHistory();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }

  // Show rating modal after logging a workout
  if (typeof showRatingModal === "function") {
    setTimeout(() => showRatingModal(String(workout.id), date), 400);
  }
}

/** Loads the saved workouts array from localStorage */
function loadWorkouts() {
  try { return JSON.parse(localStorage.getItem("workouts") || "[]"); } catch { return []; }
}

/** Deletes a specific workout by its ID */
function deleteWorkout(id) {
  if (!confirm("Delete this workout?")) return;

  let workouts = loadWorkouts();
  const deleted = workouts.find(w => String(w.id) === String(id));
  workouts = workouts.filter(w => String(w.id) !== String(id));

  // Also remove any isCompletion record generated from this workout (keyed as session-log-<id>)
  const sessionKey = `session-log-${id}`;
  workouts = workouts.filter(w => w.completedSessionId !== sessionKey);

  // If the deleted workout had a date, clean up orphaned completion records for that date
  if (deleted?.date) {
    const dateStr = deleted.date;
    const hasRealSession = workouts.some(w => w.date === dateStr && !w.isCompletion);
    if (!hasRealSession) {
      // Remove all completion-only records for this date
      const orphaned = workouts.filter(w => w.date === dateStr && w.isCompletion);
      orphaned.forEach(w => {
        if (w.completedSessionId) {
          try {
            const m = JSON.parse(localStorage.getItem("completedSessions") || "{}");
            delete m[w.completedSessionId];
            localStorage.setItem("completedSessions", JSON.stringify(m)); if (typeof DB !== 'undefined') DB.syncKey('completedSessions');
          } catch {}
        }
      });
      workouts = workouts.filter(w => !(w.date === dateStr && w.isCompletion));
    }
  }

  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  // Clear completedSessions entries
  try {
    const meta = JSON.parse(localStorage.getItem("completedSessions") || "{}");
    if (deleted?.completedSessionId) delete meta[deleted.completedSessionId];
    delete meta[sessionKey];
    localStorage.setItem("completedSessions", JSON.stringify(meta)); if (typeof DB !== 'undefined') DB.syncKey('completedSessions');
  } catch {}

  // Clear workout rating for this workout
  try {
    const ratings = JSON.parse(localStorage.getItem("workoutRatings") || "{}");
    if (ratings[String(id)]) { delete ratings[String(id)]; localStorage.setItem("workoutRatings", JSON.stringify(ratings)); if (typeof DB !== 'undefined') DB.syncKey('workoutRatings'); }
  } catch {}

  renderWorkoutHistory();
  if (typeof renderCalendar  === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }
  if (typeof renderStats === "function") renderStats();
}

/** Clears ALL saved workouts after confirmation */
function clearWorkouts() {
  if (!confirm("Delete all workout history? This cannot be undone.")) return;
  localStorage.removeItem("workouts");
  renderWorkoutHistory();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }
}


/* =====================================================================
   SECTION 4: DISPLAYING WORKOUT HISTORY
   Reads saved workouts and renders them as HTML cards.
   ===================================================================== */

// ── Star / save to saved workouts ─────────────────────────────────────────────
function isWorkoutStarred(workoutId) {
  return loadSavedWorkouts().some(s => s.fromLoggedId === String(workoutId));
}

function toggleWorkoutStar(workoutId) {
  const workouts = loadWorkouts();
  const w = workouts.find(x => String(x.id) === String(workoutId));
  if (!w) return;

  const list = loadSavedWorkouts();
  const already = list.find(s => s.fromLoggedId === String(workoutId));

  if (already) {
    localStorage.setItem("savedWorkouts", JSON.stringify(list.filter(s => s.fromLoggedId !== String(workoutId)))); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
  } else {
    if (list.length >= SW_MAX) { alert(`Max ${SW_MAX} saved workouts reached. Remove one first.`); return; }
    list.unshift({
      id:              String(Date.now()),
      name:            w.name || w.notes || `${capitalize(w.type)} – ${formatDate(w.date)}`,
      type:            w.type,
      notes:           w.notes || "",
      exercises:       w.exercises || [],
      aiSession:       w.aiSession       || undefined,
      generatedSession:w.generatedSession|| undefined,
      duration:        w.duration        || undefined,
      fromLoggedId:    String(workoutId),
    });
    localStorage.setItem("savedWorkouts", JSON.stringify(list)); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
  }
  renderWorkoutHistory();
  if (typeof renderSavedWorkouts === "function") renderSavedWorkouts();
}

// ── Star a plan session (from day detail) ─────────────────────────────────────
function starPlanSession(id, name, type, exercises, notes) {
  const list = loadSavedWorkouts();
  if (list.some(s => s.fromScheduledId === String(id))) return; // already starred
  if (list.length >= SW_MAX) { alert(`Max ${SW_MAX} saved workouts reached.`); return; }
  list.unshift({
    id:               String(Date.now()),
    name:             name || "Scheduled Session",
    type:             type || "general",
    notes:            notes || "",
    exercises:        exercises || [],
    fromScheduledId:  String(id),
  });
  localStorage.setItem("savedWorkouts", JSON.stringify(list)); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
  if (typeof renderSavedWorkouts === "function") renderSavedWorkouts();
}

function isPlanSessionStarred(id) {
  return loadSavedWorkouts().some(s => s.fromScheduledId === String(id));
}

function unstarPlanSession(id) {
  const list = loadSavedWorkouts().filter(s => s.fromScheduledId !== String(id));
  localStorage.setItem("savedWorkouts", JSON.stringify(list)); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
  if (typeof renderSavedWorkouts === "function") renderSavedWorkouts();
}

function filterWorkoutHistory(query) {
  const q = (query || "").toLowerCase().trim();
  const today = new Date().toISOString().slice(0, 10);
  const allWorkouts = loadWorkouts();
  // Build a map of completion records keyed by the original session they completed
  const completionMap = {};
  allWorkouts.forEach(w => {
    if (w.isCompletion && w.completedSessionId && w.liveTracked) {
      completionMap[w.completedSessionId] = w;
    }
  });
  // Show only past/today workouts, exclude completion records
  // But overlay live-tracked completion data onto the original workout
  const all = allWorkouts.filter(w => !w.isCompletion && w.date <= today).map(w => {
    const sessionKey = `session-log-${w.id}`;
    const comp = completionMap[sessionKey];
    if (comp && comp.exercises && comp.exercises.length) {
      return Object.assign({}, w, {
        exercises: comp.exercises,
        duration: comp.duration || w.duration,
        notes: comp.notes || w.notes,
      });
    }
    return w;
  });
  const filtered = q
    ? all.filter(w => (w.name||"").toLowerCase().includes(q) || (w.type||"").toLowerCase().includes(q) || (w.notes||"").toLowerCase().includes(q))
    : all;
  _renderWorkoutHistoryList(filtered);
}

function renderWorkoutHistory() {
  const query = document.getElementById("workout-history-search")?.value || "";
  filterWorkoutHistory(query);
}

function _renderWorkoutHistoryCore(workouts) {
  const container = document.getElementById("workout-history");
  if (!container) return;
  _renderWorkoutHistoryList(workouts);
}

function _renderWorkoutHistoryList(workouts) {
  const container = document.getElementById("workout-history");
  if (!container) return;

  if (workouts.length === 0) {
    container.innerHTML = `<p class="empty-msg">No completed or saved workouts yet. Complete a session from your calendar or star a workout to see it here.</p>`;
    return;
  }

  // Build an HTML card for each saved workout
  container.innerHTML = workouts.map(w => {
    const cardId     = `hist-card-${w.id}`;
    const notesHtml  = w.notes ? `<p class="history-notes">"${escHtml(w.notes)}"</p>` : "";
    const _fallbackName = !w.name ? capitalize(w.type || "Workout") : "";
    const nameHtml   = `<span class="history-workout-name">${escHtml(w.name || _fallbackName)}</span>`;
    const starred    = isWorkoutStarred(w.id);
    const hasContent = (w.exercises && w.exercises.length) || (w.segments && w.segments.length);
    const _eid = escHtml(String(w.id));
    const btnHtml   = `
      <button class="star-btn ${starred ? "is-starred" : ""}" title="${starred ? "Remove from saved" : "Save workout"}" onclick="toggleWorkoutStar('${_eid}')">★</button>
      ${hasContent ? `<button class="edit-workout-btn" title="Share to Community" onclick="openShareWorkout('${_eid}')">Share</button>` : ""}
      <button class="edit-workout-btn" title="Edit" onclick="openEditWorkout('${_eid}')">Edit</button>
      <button class="delete-btn" title="Delete" onclick="deleteWorkout('${_eid}')">${ICONS.trash}</button>
      <span class="card-chevron">▾</span>`;

    // Helper: build collapsed-view summary pill
    const _histSummary = parts => {
      const str = parts.filter(Boolean).join(" · ");
      return str ? `<span class="history-summary">${str}</span>` : "";
    };

    // AI-generated cardio session (intervals)
    if (w.aiSession && w.aiSession.intervals) {
      const parseDur = str => { const m = String(str||"").match(/([\d.]+)/); return m ? parseFloat(m[1]) : 0; };
      const totalMin = Math.round((w.aiSession.intervals).reduce((sum, iv) => {
        const reps = iv.reps || 1;
        return sum + parseDur(iv.duration) * reps + (iv.restDuration ? parseDur(iv.restDuration) * Math.max(reps - 1, 0) : 0);
      }, 0));
      const summaryHtml = _histSummary([
        totalMin ? `${totalMin} min` : "",
        w.distance ? String(w.distance) : "",
      ]);
      const intervals = buildAiIntervalsList(w.aiSession, w.type);
      return `
        <div class="history-entry collapsible is-collapsed" id="${cardId}">
          <div class="history-header card-toggle" onclick="toggleSection('${cardId}')">
            <div class="history-header-left">
              <span class="workout-tag tag-${w.type}">${w.type}</span>
              <span class="history-date">${formatDate(w.date)}</span>
              ${nameHtml}${summaryHtml}
            </div>
            <div class="history-header-right" onclick="event.stopPropagation()">${btnHtml}</div>
          </div>
          <div class="card-body"><div style="margin-top:8px">${intervals || notesHtml}</div></div>
        </div>`;
    }

    // Endurance session with segments
    if (w.segments && w.segments.length > 0) {
      const totalMin = w.segments.reduce((sum, s) => {
        const m = String(s.duration || "").match(/([\d.]+)/);
        return sum + (m ? parseFloat(m[1]) : 0);
      }, 0);
      const summaryHtml = _histSummary([
        totalMin ? `${Math.round(totalMin)} min` : "",
        `${w.segments.length} segment${w.segments.length !== 1 ? "s" : ""}`,
        w.avgWatts ? `${w.avgWatts}W avg` : "",
      ]);
      const segTable = `<table class="exercise-table" style="margin-top:8px">
        <thead><tr><th>Phase</th><th>Duration</th><th>Zone</th></tr></thead>
        <tbody>${w.segments.map(s => `<tr><td>${escHtml(s.name)}</td><td>${escHtml(s.duration)}</td><td>${escHtml(s.effort || "—")}</td></tr>`).join("")}</tbody></table>`;
      return `
        <div class="history-entry collapsible is-collapsed" id="${cardId}">
          <div class="history-header card-toggle" onclick="toggleSection('${cardId}')">
            <div class="history-header-left">
              <span class="workout-tag tag-${w.type}">${w.type}</span>
              <span class="history-date">${formatDate(w.date)}</span>
              ${nameHtml}${summaryHtml}
            </div>
            <div class="history-header-right" onclick="event.stopPropagation()">${btnHtml}</div>
          </div>
          <div class="card-body">${notesHtml}${segTable}</div>
        </div>`;
    }

    // Hyrox session
    if ((w.type === "hyrox" || w.isHyrox) && w.exercises && w.exercises.length > 0) {
      const stationCount = w.exercises.filter(e => !/^run\s/i.test(e.name)).length;
      const summaryHtml = _histSummary([
        w.duration ? `${w.duration} min` : "",
        stationCount ? `${stationCount} station${stationCount !== 1 ? "s" : ""}` : "",
      ]);
      const _fmtMs = ms => {
        const sec = Math.floor((ms || 0) / 1000);
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
      };
      const hd = w.hyroxData;
      const hasTimes = hd || w.exercises.some(e => e.splitTime);
      const splitSummary = hd ? `
        <div style="display:flex;gap:12px;margin:8px 0 12px">
          <div style="flex:1;text-align:center;padding:6px 8px;border-radius:6px;background:rgba(59,130,246,0.1)">
            <div style="font-size:0.7rem;opacity:0.7">Running</div>
            <div style="font-weight:700;font-variant-numeric:tabular-nums">${_fmtMs(hd.totalRunMs)}</div>
          </div>
          <div style="flex:1;text-align:center;padding:6px 8px;border-radius:6px;background:rgba(245,158,11,0.1)">
            <div style="font-size:0.7rem;opacity:0.7">Stations</div>
            <div style="font-weight:700;font-variant-numeric:tabular-nums">${_fmtMs(hd.totalStationMs)}</div>
          </div>
          <div style="flex:1;text-align:center;padding:6px 8px;border-radius:6px;background:rgba(34,197,94,0.1)">
            <div style="font-size:0.7rem;opacity:0.7">Total</div>
            <div style="font-weight:700;font-variant-numeric:tabular-nums">${_fmtMs(hd.totalMs)}</div>
          </div>
        </div>` : "";
      const hyroxRows = w.exercises.map(e => {
        const isRun = /^run\s/i.test(e.name);
        const weightStr = e.weight ? escHtml(e.weight) : "";
        return `<tr${isRun ? ' style="opacity:0.75"' : ""}>
          <td>${escHtml(e.name)}</td>
          <td>${escHtml(String(e.reps || "—"))}${weightStr ? ` <span style="opacity:0.6">@ ${weightStr}</span>` : ""}</td>
          ${hasTimes ? `<td style="font-variant-numeric:tabular-nums;text-align:right">${e.splitTime ? _fmtMs(e.splitTime) : "—"}</td>` : ""}
        </tr>`;
      }).join("");
      const hyroxHeader = hasTimes
        ? `<th>Station</th><th>Distance</th><th style="text-align:right">Time</th>`
        : `<th>Station</th><th>Distance</th>`;
      const hyroxTable = `<table class="exercise-table"><thead><tr>${hyroxHeader}</tr></thead><tbody>${hyroxRows}</tbody></table>`;
      return `
        <div class="history-entry collapsible is-collapsed" id="${cardId}">
          <div class="history-header card-toggle" onclick="toggleSection('${cardId}')">
            <div class="history-header-left">
              <span class="workout-tag tag-${w.type}">${w.type}</span>
              <span class="history-date">${formatDate(w.date)}</span>
              ${nameHtml}${summaryHtml}
            </div>
            <div class="history-header-right" onclick="event.stopPropagation()">${btnHtml}</div>
          </div>
          <div class="card-body">${notesHtml}${splitSummary}${hyroxTable}</div>
        </div>`;
    }

    // Strength / exercise-based session
    if (w.exercises && w.exercises.length > 0) {
      const uniqueCount = new Set(w.exercises.map(e => e.name).filter(Boolean)).size;
      const summaryHtml = _histSummary([
        uniqueCount ? `${uniqueCount} exercise${uniqueCount !== 1 ? "s" : ""}` : "",
        w.duration ? `${w.duration} min` : "",
      ]);
      return `
        <div class="history-entry collapsible is-collapsed" id="${cardId}">
          <div class="history-header card-toggle" onclick="toggleSection('${cardId}')">
            <div class="history-header-left">
              <span class="workout-tag tag-${w.type}">${w.type}</span>
              <span class="history-date">${formatDate(w.date)}</span>
              ${nameHtml}${summaryHtml}
            </div>
            <div class="history-header-right" onclick="event.stopPropagation()">${btnHtml}</div>
          </div>
          <div class="card-body">${notesHtml}${buildExerciseTableHTML(w.exercises, { hiit: w.type === "hiit" || !!w.hiitMeta })}</div>
        </div>`;
    }

    // Cardio / minimal session
    const summaryHtml = _histSummary([
      w.duration ? `${w.duration} min` : "",
      w.distance ? String(w.distance) : "",
      w.avgWatts ? `${w.avgWatts}W avg` : "",
    ]);
    return `
      <div class="history-entry collapsible is-collapsed" id="${cardId}">
        <div class="history-header card-toggle" onclick="toggleSection('${cardId}')">
          <div class="history-header-left">
            <span class="workout-tag tag-${w.type}">${w.type}</span>
            <span class="history-date">${formatDate(w.date)}</span>
            ${nameHtml}${summaryHtml}
          </div>
          <div class="history-header-right" onclick="event.stopPropagation()">${btnHtml}</div>
        </div>
        <div class="card-body">${notesHtml}</div>
      </div>`;
  }).join("");
}


/* =====================================================================
   UTILITIES (small helper functions used above)
   ===================================================================== */

/**
 * Renders an exercise list as an HTML table, grouping exercises that share a
 * supersetId under a "Superset" label so they're clearly delineated.
 */
function _roundWeight(val) {
  const sys = typeof getMeasurementSystem === "function" ? getMeasurementSystem() : "imperial";
  if (sys === "metric") {
    const kg = val * 0.453592;
    return Math.round(kg / 2) * 2 + " kg";
  }
  return Math.round(val / 5) * 5 + " lbs";
}

function _normalizeWeightDisplay(raw) {
  const w = String(raw || "").trim();
  if (!w || w === "—") return w;
  if (/bodyweight/i.test(w)) return "BW";
  if (/bar\s*\+\s*([\d.]+)/i.test(w)) {
    const m = w.match(/bar\s*\+\s*([\d.]+)/i);
    return _roundWeight(45 + parseFloat(m[1]));
  }
  if (/^([\d.]+)\s*[x×]\s*([\d.]+)/i.test(w)) {
    const m = w.match(/^([\d.]+)\s*[x×]\s*([\d.]+)/i);
    return _roundWeight(parseFloat(m[2]));
  }
  // Try to extract a bare number with lbs/lb suffix
  const bareLbs = w.match(/^([\d.]+)\s*(?:lbs?)?$/i);
  if (bareLbs) return _roundWeight(parseFloat(bareLbs[1]));
  return w;
}

function buildExerciseTableHTML(exercises, opts) {
  const isHiit = opts?.hiit || false;
  const isHyrox = opts?.hyrox || false;
  const _fmtSplitMs = ms => {
    const sec = Math.floor((ms || 0) / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
  };
  const hyroxHasTimes = isHyrox && exercises && exercises.some(e => e.splitTime);
  const cols = isHyrox ? (hyroxHasTimes ? 3 : 2) : isHiit ? 3 : 4;
  const headerRow = isHyrox
    ? (hyroxHasTimes ? `<th>Station</th><th>Distance</th><th style="text-align:right">Time</th>` : `<th>Station</th><th>Distance</th>`)
    : isHiit
    ? `<th>Exercise</th><th>Reps / Time / Distance</th><th>Weight</th>`
    : `<th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th>`;

  if (!exercises || exercises.length === 0) {
    return `<table class="exercise-table">
      <thead><tr>${headerRow}</tr></thead>
      <tbody><tr><td colspan="${cols}" style="color:var(--color-text-muted);font-style:italic">No exercises logged</td></tr></tbody>
    </table>`;
  }

  // Group into segments: { supersetId, exercises[] } or { supersetId: null, exercises: [single] }
  const segments = [];
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.supersetId) {
      const gid = ex.supersetId;
      const group = [];
      while (i < exercises.length && exercises[i].supersetId === gid) {
        group.push(exercises[i]);
        i++;
      }
      segments.push({ supersetId: gid, items: group });
    } else {
      segments.push({ supersetId: null, items: [ex] });
      i++;
    }
  }

  let rows = "";
  segments.forEach(seg => {
    if (seg.supersetId) {
      const ssSets = seg.items[0]?.sets || "—";
      rows += `<tr class="superset-label-row"><td colspan="${cols}">Superset &mdash; ${ssSets} sets</td></tr>`;
      seg.items.forEach(e => {
        rows += `<tr class="superset-ex-row"><td>${escHtml(e.name)}</td><td></td><td>${escHtml(String(e.reps||"—"))}</td><td>${escHtml(_normalizeWeightDisplay(e.weight)||"—")}</td></tr>`;
        if (e.setDetails && e.setDetails.length) {
          e.setDetails.forEach((sd, si) => {
            rows += `<tr class="superset-ex-row set-detail-row"><td class="set-detail-label">Set ${si+1}</td><td></td><td>${escHtml(String(sd.reps||"—"))}</td><td>${escHtml(_normalizeWeightDisplay(sd.weight)||"—")}</td></tr>`;
          });
        }
      });
      rows += `<tr class="superset-end-row"><td colspan="${cols}"></td></tr>`;
    } else {
      const e = seg.items[0];
      if (isHyrox) {
        const _isRun = /^run\s/i.test(e.name);
        const _wtStr = e.weight ? ` <span style="opacity:0.6">@ ${escHtml(e.weight)}</span>` : "";
        rows += `<tr${_isRun ? ' style="opacity:0.75"' : ""}>`;
        rows += `<td>${escHtml(e.name)}</td><td>${escHtml(String(e.reps||"—"))}${_wtStr}</td>`;
        if (hyroxHasTimes) rows += `<td style="font-variant-numeric:tabular-nums;text-align:right">${e.splitTime ? _fmtSplitMs(e.splitTime) : "—"}</td>`;
        rows += `</tr>`;
      } else if (isHiit) {
        rows += `<tr><td>${escHtml(e.name)}</td><td>${escHtml(String(e.reps||"—"))}</td><td>${escHtml(_normalizeWeightDisplay(e.weight)||"—")}</td></tr>`;
      } else {
        rows += `<tr><td>${escHtml(e.name)}</td><td>${escHtml(String(e.sets||"—"))}</td><td>${escHtml(String(e.reps||"—"))}</td><td>${escHtml(_normalizeWeightDisplay(e.weight)||"—")}</td></tr>`;
      }
      if (e.setDetails && e.setDetails.length) {
        e.setDetails.forEach((sd, si) => {
          rows += `<tr class="set-detail-row"><td class="set-detail-label">Set ${si+1}</td><td></td><td>${escHtml(String(sd.reps||"—"))}</td><td>${escHtml(_normalizeWeightDisplay(sd.weight)||"—")}</td></tr>`;
        });
      }
    }
  });

  return `<table class="exercise-table">
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** Capitalizes the first letter of a string: "running" → "Running" */
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

/**
 * Formats a date string for display.
 * "2025-06-15" → "Sun, Jun 15, 2025"
 * We add "T12:00:00" to avoid timezone issues that could shift the date by one day.
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}


/* =====================================================================
   WORKOUT SCHEDULE — persists generated plans to the calendar
   ===================================================================== */

function loadWorkoutSchedule() {
  try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; }
  catch { return []; }
}

/**
 * Distributes sessions across real calendar dates for the selected days-of-week
 * and saves them to localStorage("workoutSchedule") so the calendar can display them.
 *
 * @param {string}   type         - workout type key
 * @param {number[]} selectedDays  - day-of-week numbers (0=Sun…6=Sat), sorted
 * @param {string}   level        - "beginner" | "intermediate" | "advanced"
 * @param {string}   startDate    - "YYYY-MM-DD" of the first day of the first week
 * @param {number}   totalWeeks   - how many weeks to schedule
 * @param {number}   refreshWeeks - how many weeks per exercise block before rotating
 */
function saveWorkoutSchedule(type, selectedDays, level, startDate, totalWeeks, refreshWeeks = 4, append = false) {
  const dowList  = Array.isArray(selectedDays) ? selectedDays : [1, 3, 5];
  const lib      = EXERCISE_LIBRARY;
  const rotation = ["push", "pull", "legs"];
  const schedule = [];
  const start    = new Date(startDate + "T00:00:00");
  const startDow = start.getDay();

  for (let week = 0; week < totalWeeks; week++) {
    const blockIndex = Math.floor(week / refreshWeeks);

    dowList.forEach((dow, slotIdx) => {
      let delta = (dow - startDow + 7) % 7 + week * 7;
      const date    = new Date(start);
      date.setDate(date.getDate() + delta);
      const dateStr = date.toISOString().slice(0, 10);
      const absSlot = week * dowList.length + slotIdx;

      let entry;
      if (type === "weightlifting") {
        // Use the split-based muscle groups from the plan builder
        const split = (_planSplitDays.length > 0) ? _planSplitDays[slotIdx % _planSplitDays.length] : null;
        const focusMap = { chest: "push", shoulders: "push", triceps: "push", back: "pull", biceps: "pull", quads: "legs", hamstrings: "legs", glutes: "legs", calves: "legs", core: "legs" };
        let exercises;
        let sessionLabel;
        if (split) {
          const focusesUsed = new Set();
          (split.muscles || []).forEach(m => { if (focusMap[m]) focusesUsed.add(focusMap[m]); });
          exercises = [];
          focusesUsed.forEach(focus => {
            exercises = exercises.concat(getWeightliftingExercises(focus, level, blockIndex));
          });
          if (!exercises.length) {
            exercises = [
              ...getWeightliftingExercises("push", level, blockIndex).slice(0, 2),
              ...getWeightliftingExercises("pull", level, blockIndex).slice(0, 2),
              ...getWeightliftingExercises("legs", level, blockIndex).slice(0, 2),
            ];
          }
          exercises = _applyGoalToExercises(exercises, _planGoal);
          sessionLabel = split.label || split.muscles.map(m => capitalize(m)).join(" / ");
        } else {
          const focus = rotation[absSlot % 3];
          exercises = _applyGoalToExercises(getWeightliftingExercises(focus, level, blockIndex), _planGoal);
          sessionLabel = `${capitalize(focus)} Day`;
        }
        entry = {
          id:          `ws-${dateStr}-${type}-${sessionLabel.replace(/\s/g,"")}-b${blockIndex}`,
          date:        dateStr,
          type,
          level,
          sessionName: sessionLabel,
          exercises,
          source:      "generated",
        };
      } else if (type === "hiit") {
        const sessions = ((lib.hiit || {})[level]) || ((lib.hiit || {})["beginner"]) || [];
        const sessionIdx = (slotIdx + blockIndex * 2) % (sessions.length || 1);
        const s = sessions[sessionIdx];
        if (!s) return;
        entry = {
          id:          `ws-${dateStr}-${type}-${slotIdx}-b${blockIndex}`,
          date:        dateStr,
          type,
          level,
          sessionName: s.name || `HIIT Session`,
          exercises:   s.exercises ? filterAvoidedExercises(s.exercises).map(ex => ({
            ...ex, sets: s.format === "amrap" ? 1 : (s.rounds || 1),
          })) : null,
          hiitMeta:    { format: s.format, rounds: s.rounds, restBetweenRounds: s.restBetweenRounds || null },
          source:      "generated",
        };
      } else if (type === "bodyweight") {
        const bwFocuses = ["push", "pull", "legs"];
        const focus = bwFocuses[absSlot % 3];
        // Alternate block index for variety (same pattern as weightlifting alt)
        const bwLib = blockIndex % 2 === 0 ? BODYWEIGHT_LIBRARY : BODYWEIGHT_LIBRARY;
        const exercises = filterAvoidedExercises(
          (bwLib[focus] || {})[level] || (bwLib[focus] || {}).beginner || []
        );
        entry = {
          id:          `ws-${dateStr}-${type}-${focus}-b${blockIndex}`,
          date:        dateStr,
          type,
          level,
          sessionName: `${capitalize(focus)} (Bodyweight)`,
          exercises,
          source:      "generated",
        };
      } else {
        // Fall back to beginner if this type doesn't have the requested level
        let sessions   = ((lib[type] || {})[level]) || ((lib[type] || {})["beginner"]) || [];
        // Filter yoga sessions by preferred types if set
        if (type === "yoga") {
          let yogaPrefs = [];
          try { yogaPrefs = JSON.parse(localStorage.getItem("yogaTypes")) || []; } catch {}
          if (yogaPrefs.length > 0) {
            const filtered = sessions.filter(s => yogaPrefs.includes(s.yogaType));
            if (filtered.length > 0) sessions = filtered;
          }
        }
        // Offset session start index each block for natural variety
        const sessionIdx = (slotIdx + blockIndex * 2) % (sessions.length || 1);
        const s          = sessions[sessionIdx];
        if (!s) return;
        const name = s.name || s.day || `Day ${slotIdx + 1}`;
        // Skip rest/recovery days — they shouldn't appear as scheduled sessions
        if (/^rest$/i.test(name.trim())) return;
        entry = {
          id:          `ws-${dateStr}-${type}-${slotIdx}-b${blockIndex}`,
          date:        dateStr,
          type,
          level,
          sessionName: name,
          exercises:   s.exercises ? filterAvoidedExercises(s.exercises) : null,
          details:     s.details   || null,
          source:      "generated",
        };
      }
      schedule.push(entry);
    });
  }

  const existing = append
    ? loadWorkoutSchedule()
    : loadWorkoutSchedule().filter(e => e.source !== "generated");
  // Deduplicate by ID — new entries win over stale ones with the same ID
  const merged = [...existing, ...schedule];
  const seen = new Set();
  const deduped = merged.filter(e => {
    const key = e.id || `${e.date}-${e.type}-${e.sessionName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  localStorage.setItem("workoutSchedule", JSON.stringify(deduped)); if (typeof DB !== 'undefined') DB.syncSchedule();
  return schedule.length;
}

/**
 * Saves a "just training" endurance schedule using structured loads
 * (easy / moderate / hard / long) that map to SESSION_DESCRIPTIONS,
 * rather than flat text from EXERCISE_LIBRARY.
 * Supports: running, cycling, swimming.
 */
function saveEnduranceTrainingSchedule(type, dows, level, startDate, totalWeeks, append = false) {
  const LOAD_ROTATION = {
    beginner:     ["easy", "easy", "long"],
    intermediate: ["easy", "moderate", "easy", "hard", "long"],
    advanced:     ["easy", "hard", "easy", "moderate", "easy", "long"],
  };
  const DISCIPLINE_MAP = { running: "run", cycling: "bike", swimming: "swim" };
  const LOAD_NAMES_MAP = {
    running:  { easy: "Easy Run",  moderate: "Tempo Run",  hard: "Interval Run",  long: "Long Run" },
    cycling:  { easy: "Easy Ride", moderate: "Tempo Ride", hard: "Interval Ride", long: "Long Ride" },
    swimming: { easy: "Easy Swim", moderate: "Tempo Swim", hard: "Interval Swim", long: "Long Swim" },
  };

  const discipline = DISCIPLINE_MAP[type] || "run";
  const loadNames  = LOAD_NAMES_MAP[type] || LOAD_NAMES_MAP.running;
  const dowList    = Array.isArray(dows) ? dows : [1, 3, 5];
  const rotation   = LOAD_ROTATION[level] || LOAD_ROTATION.intermediate;
  const schedule   = [];
  const start      = new Date(startDate + "T00:00:00");
  const startDow   = start.getDay();

  for (let week = 0; week < totalWeeks; week++) {
    dowList.forEach((dow, slotIdx) => {
      const absSlot = week * dowList.length + slotIdx;
      const load    = rotation[absSlot % rotation.length];
      const delta   = (dow - startDow + 7) % 7 + week * 7;
      const date    = new Date(start);
      date.setDate(date.getDate() + delta);
      const dateStr = date.toISOString().slice(0, 10);
      schedule.push({
        id:          `ws-${dateStr}-${type}-${slotIdx}-w${week}`,
        date:        dateStr,
        type,
        discipline,
        load,
        sessionName: loadNames[load] || "Easy Session",
        source:      "generated",
      });
    });
  }

  const existing = append
    ? loadWorkoutSchedule()
    : loadWorkoutSchedule().filter(e => e.source !== "generated");
  const merged = [...existing, ...schedule];
  const seen   = new Set();
  const deduped = merged.filter(e => {
    const key = e.id || `${e.date}-${e.type}-${e.sessionName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  localStorage.setItem("workoutSchedule", JSON.stringify(deduped)); if (typeof DB !== 'undefined') DB.syncSchedule();
  return schedule.length;
}

// Backward compatibility alias
function saveRunningTrainingSchedule(dows, level, startDate, totalWeeks, append) {
  return saveEnduranceTrainingSchedule("running", dows, level, startDate, totalWeeks, append);
}


/* =====================================================================
   SECTION 5: SAVED WORKOUTS (reusable templates)
   ===================================================================== */

const SW_MAX = 20;

function loadSavedWorkouts() {
  try { return JSON.parse(localStorage.getItem("savedWorkouts")) || []; }
  catch { return []; }
}

function filterSavedWorkouts(query) {
  const q = (query || "").toLowerCase().trim();
  const list = loadSavedWorkouts();
  const filtered = q ? list.filter(sw => (sw.name||"").toLowerCase().includes(q) || (sw.type||"").toLowerCase().includes(q)) : list;
  _renderSavedWorkoutsList(filtered);
}

function renderSavedWorkouts() {
  const container = document.getElementById("saved-workouts-list");
  if (!container) return;
  const query = document.getElementById("sw-search")?.value || "";
  filterSavedWorkouts(query);
  const total = loadSavedWorkouts().length;
  const counterEl = document.getElementById("sw-counter");
  if (counterEl) counterEl.textContent = `${total}/20`;
}

function buildSegmentTableHTML(segments) {
  if (!segments || segments.length === 0) return '';
  const hasDiscipline = segments.some(s => s.discipline);
  const discLabel = { bike: "Bike", run: "Run", transition: "T" };
  const rows = segments.map(s => {
    const discTd = hasDiscipline ? `<td><span class="seg-disc-tag seg-disc-${s.discipline || "bike"}">${discLabel[s.discipline] || s.discipline || '—'}</span></td>` : '';
    return `<tr>${discTd}<td>${escHtml(s.name || '—')}</td><td>${escHtml(s.duration || '—')}</td><td>${escHtml(s.effort || '—')}</td></tr>`;
  }).join('');
  const discTh = hasDiscipline ? '<th>Leg</th>' : '';
  return `<table class="exercise-table">
    <thead><tr>${discTh}<th>Phase</th><th>Duration</th><th>Effort</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _renderSavedWorkoutsList(list) {
  const container = document.getElementById("saved-workouts-list");
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<p class="empty-msg">No saved workouts yet. Star a workout or create one to get started.</p>`;
    return;
  }

  container.innerHTML = list.map(sw => {
    const cardId    = `sw-card-${sw.id}`;
    const exHtml = (sw.segments && sw.segments.length)
      ? buildSegmentTableHTML(sw.segments)
      : buildExerciseTableHTML(sw.exercises, { hiit: sw.type === "hiit" || !!sw.hiitMeta });
    const notesHtml = sw.notes ? `<p class="history-notes">"${escHtml(sw.notes)}"</p>` : "";
    return `
      <div class="history-entry collapsible is-collapsed" id="${cardId}">
        <div class="history-header card-toggle" onclick="toggleSection('${cardId}')">
          <div class="history-header-left">
            <span class="star-btn is-starred" title="Saved workout">★</span>
            <span class="workout-tag tag-${sw.type}" style="margin-left:6px">${sw.type}</span>
            <strong style="margin-left:8px">${escHtml(sw.name)}</strong>
          </div>
          <div class="history-header-right" onclick="event.stopPropagation()">
            <button class="edit-workout-btn" onclick="openSaveWorkoutModal('${sw.id}')">Edit</button>
            <button class="edit-workout-btn" onclick="openAssignSavedWorkout('${sw.id}')">Assign to Day</button>
            <button class="delete-btn" onclick="deleteSavedWorkout('${sw.id}')">${ICONS.trash}</button>
            <span class="card-chevron">▾</span>
          </div>
        </div>
        <div class="card-body" style="padding:8px 0 0">
          ${notesHtml}
          ${exHtml}
        </div>
      </div>`;
  }).join("");
}

let _swEditId = null;

function openSaveWorkoutModal(editId) {
  _swEditId = editId || null;
  const modal = document.getElementById("saved-workout-modal");
  const title = document.getElementById("sw-modal-title");
  document.getElementById("sw-name").value  = "";
  document.getElementById("sw-type").value  = "weightlifting";
  document.getElementById("sw-notes").value = "";
  if (document.getElementById("sw-exercise-entries")) document.getElementById("sw-exercise-entries").innerHTML = "";
  if (document.getElementById("sw-segment-entries"))  document.getElementById("sw-segment-entries").innerHTML  = "";
  document.getElementById("sw-save-msg").textContent = "";

  if (editId) {
    const sw = loadSavedWorkouts().find(s => s.id === editId);
    if (sw) {
      document.getElementById("sw-name").value  = sw.name  || "";
      document.getElementById("sw-type").value  = sw.type  || "weightlifting";
      document.getElementById("sw-notes").value = sw.notes || "";
      swTypeChanged();
      if (SW_ENDURANCE_TYPES.includes(sw.type)) {
        (sw.segments || []).forEach(s => addSwSegmentRow(s));
        if (!(sw.segments && sw.segments.length)) addSwSegmentRow();
      } else {
        (sw.exercises || []).forEach(() => addSwExerciseRow());
        document.querySelectorAll("#sw-exercise-entries .exercise-row").forEach((row, i) => {
          const e = sw.exercises[i];
          if (!e) return;
          row.querySelector(".ex-name").value   = e.name   || "";
          const setsInput = row.querySelector(".ex-sets");
          if (setsInput) setsInput.value = e.sets || "";
          row.querySelector(".ex-reps").value   = e.reps   || "";
          row.querySelector(".ex-weight").value = e.weight || "";
        });
        if (!sw.exercises || !sw.exercises.length) addSwExerciseRow();
        // Populate HIIT metadata
        if (sw.type === "hiit" && sw.hiitMeta) {
          const m = sw.hiitMeta;
          if (document.getElementById("sw-hiit-format")) document.getElementById("sw-hiit-format").value = m.format || "circuit";
          if (document.getElementById("sw-hiit-rounds")) document.getElementById("sw-hiit-rounds").value = m.rounds || 3;
          if (document.getElementById("sw-hiit-rest-ex")) document.getElementById("sw-hiit-rest-ex").value = m.restBetweenExercises || "";
          if (document.getElementById("sw-hiit-rest-rnd")) document.getElementById("sw-hiit-rest-rnd").value = m.restBetweenRounds || "";
        }
      }
      title.textContent = "Edit Saved Workout";
    }
  } else {
    title.textContent = "New Saved Workout";
    swTypeChanged();
    addSwExerciseRow();
  }

  modal.style.display = "flex";
}

function closeSaveWorkoutModal() {
  const modal = document.getElementById("saved-workout-modal");
  if (modal) modal.style.display = "none";
  _swEditId = null;
}

const SW_ENDURANCE_TYPES = ["running", "cycling", "swimming", "triathlon"];

function swTypeChanged() {
  const type = document.getElementById("sw-type")?.value;
  const isEndurance = SW_ENDURANCE_TYPES.includes(type);
  const isHiit = type === "hiit";
  const strengthSec = document.getElementById("sw-strength-section");
  const enduranceSec = document.getElementById("sw-endurance-section");
  const hiitMeta = document.getElementById("sw-hiit-meta");
  if (strengthSec) strengthSec.style.display = isEndurance ? "none" : "";
  if (enduranceSec) enduranceSec.style.display = isEndurance ? "" : "none";
  if (hiitMeta) hiitMeta.style.display = isHiit ? "" : "none";
  // Rebuild exercise rows when switching to/from HIIT (header changes)
  const entries = document.getElementById("sw-exercise-entries");
  if (entries) {
    // Clear header rows when type changes
    entries.querySelectorAll(".exercise-row-header").forEach(h => h.remove());
    if (entries.querySelectorAll(".exercise-row").length === 0) {
      entries.innerHTML = "";
      addSwExerciseRow();
    }
  }
  // Update discipline selectors visibility and grid class on existing segment rows
  document.querySelectorAll("#sw-segment-entries .sw-segment-row").forEach(row => {
    const discDiv = row.querySelector(".seg-discipline-wrap");
    if (discDiv) discDiv.style.display = type === "triathlon" ? "" : "none";
    row.classList.toggle("sw-segment-row--brick", type === "triathlon");
  });
}

function _isBrickType() {
  return document.getElementById("sw-type")?.value === "triathlon";
}

function addSwSegmentRow(seg) {
  const container = document.getElementById("sw-segment-entries");
  if (!container) return;
  const row = document.createElement("div");
  const isBrick = _isBrickType();
  row.className = "exercise-row sw-segment-row" + (isBrick ? " sw-segment-row--brick" : "");
  const effort = (seg && seg.effort) || "Z2";
  const disc = (seg && seg.discipline) || "";
  const _sel = v => (effort === v || (v === "Z1" && effort === "Easy") || (v === "Z2" && effort === "Moderate") || (v === "Z4" && effort === "Hard") || (v === "Z5" && effort === "Max")) ? " selected" : "";
  const _dsel = v => disc === v ? " selected" : "";
  row.innerHTML = `
    <div class="seg-discipline-wrap" style="${isBrick ? "" : "display:none"}"><label>Leg</label>
      <select class="seg-discipline">
        <option value="bike"${_dsel("bike")}>Bike</option>
        <option value="transition"${_dsel("transition")}>Transition</option>
        <option value="run"${_dsel("run")}>Run</option>
      </select>
    </div>
    <div><label>Phase</label><input type="text" class="seg-name" placeholder="${isBrick ? "e.g. Steady Ride" : "e.g. Easy Run"}" value="${escHtml((seg && seg.name) || "")}" /></div>
    <div><label>Duration</label><input type="text" class="seg-duration" placeholder="e.g. 20 min" value="${escHtml((seg && seg.duration) || "")}" /></div>
    <div><label>Zone</label>
      <select class="seg-effort">
        <option value="RW"${_sel("RW")}>Rest / Walk</option>
        <option value="Z1"${_sel("Z1")}>Z1 Recovery</option>
        <option value="Z2"${_sel("Z2")}>Z2 Aerobic</option>
        <option value="Z3"${_sel("Z3")}>Z3 Tempo</option>
        <option value="Z4"${_sel("Z4")}>Z4 Threshold</option>
        <option value="Z5"${_sel("Z5")}>Z5 VO2 Max</option>
        <option value="Z6"${_sel("Z6")}>Z6 Max Sprint</option>
      </select>
    </div>
    <button class="remove-exercise-btn" onclick="this.parentElement.remove()" style="align-self:flex-end;margin-bottom:2px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  // Auto-set phase placeholder based on discipline selection
  const discSel = row.querySelector(".seg-discipline");
  const nameInput = row.querySelector(".seg-name");
  if (discSel && nameInput) {
    discSel.addEventListener("change", () => {
      const placeholders = { bike: "e.g. Steady Ride", transition: "e.g. T1", run: "e.g. Easy Run" };
      nameInput.placeholder = placeholders[discSel.value] || "e.g. Easy Run";
    });
  }
  _initRowDrag(row, container);
  container.appendChild(row);
}

function addSwExerciseRow() {
  const container = document.getElementById("sw-exercise-entries");
  const isHiit = document.getElementById("sw-type")?.value === "hiit";

  // Add a header row if this is the first exercise
  if (container.children.length === 0) {
    const header = document.createElement("div");
    header.className = "exercise-row-header" + (isHiit ? " hiit-row-header" : "");
    if (isHiit) {
      header.innerHTML = `<span>Exercise</span><span>Reps / Time</span><span>Weight</span><span></span>`;
    } else {
      header.innerHTML = `<span>Exercise</span><span>Sets</span><span>Reps</span><span>Weight</span><span></span>`;
    }
    container.appendChild(header);
  }

  const row = document.createElement("div");
  row.className = "exercise-row exercise-row--compact" + (isHiit ? " hiit-row" : "");
  if (isHiit) {
    row.innerHTML = `
      <input type="text" class="ex-name" placeholder="e.g. Burpees" />
      <input type="text" class="ex-reps" placeholder="e.g. 10, 45s" />
      <input type="text" class="ex-weight" placeholder="optional" />
      <button class="remove-exercise-btn" onclick="this.parentElement.remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  } else {
    row.innerHTML = `
      <input type="text" class="ex-name" placeholder="e.g. Bench Press" />
      <input type="number" class="ex-sets" placeholder="3" min="1" />
      <input type="number" class="ex-reps" placeholder="10" min="1" />
      <input type="text" class="ex-weight" placeholder="45lbs" />
      <button class="remove-exercise-btn" onclick="this.parentElement.remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  }
  _initRowDrag(row, container);
  container.appendChild(row);
}

function saveSavedWorkout() {
  const name  = document.getElementById("sw-name").value.trim();
  const type  = document.getElementById("sw-type").value;
  const notes = document.getElementById("sw-notes").value.trim();
  const msg   = document.getElementById("sw-save-msg");

  if (!name) {
    msg.style.color = "#ef4444";
    msg.textContent = "Please enter a workout name.";
    return;
  }

  let exercises = null;
  let segments  = null;

  if (SW_ENDURANCE_TYPES.includes(type)) {
    segments = [];
    const isBrick = type === "triathlon";
    document.querySelectorAll("#sw-segment-entries .sw-segment-row").forEach(row => {
      const n = row.querySelector(".seg-name")?.value.trim();
      const seg = {
        name:     n || "",
        duration: row.querySelector(".seg-duration")?.value.trim() || "",
        effort:   row.querySelector(".seg-effort")?.value || "Easy",
      };
      if (isBrick) seg.discipline = row.querySelector(".seg-discipline")?.value || "bike";
      if (n || seg.duration || isBrick) segments.push(seg);
    });
  } else {
    const isHiit = type === "hiit";
    exercises = [];
    document.querySelectorAll("#sw-exercise-entries .exercise-row").forEach(row => {
      const n = row.querySelector(".ex-name").value.trim();
      if (!n) return;
      const ex = {
        name:   n,
        reps:   row.querySelector(".ex-reps").value,
        weight: row.querySelector(".ex-weight").value.trim(),
      };
      const setsInput = row.querySelector(".ex-sets");
      if (setsInput) ex.sets = setsInput.value;
      exercises.push(ex);
    });
  }

  let hiitMeta = null;
  if (type === "hiit") {
    hiitMeta = {
      format: document.getElementById("sw-hiit-format")?.value || "circuit",
      rounds: parseInt(document.getElementById("sw-hiit-rounds")?.value) || 1,
      restBetweenExercises: (document.getElementById("sw-hiit-rest-ex")?.value || "").trim() || undefined,
      restBetweenRounds: (document.getElementById("sw-hiit-rest-rnd")?.value || "").trim() || undefined,
    };
  }

  const list = loadSavedWorkouts();

  if (_swEditId) {
    const idx = list.findIndex(s => s.id === _swEditId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], name, type, notes, exercises, segments, hiitMeta };
    }
  } else {
    if (list.length >= SW_MAX) {
      msg.style.color = "#ef4444";
      msg.textContent = `Max ${SW_MAX} saved workouts reached. Delete one first.`;
      return;
    }
    const entry = { id: String(Date.now()), name, type, notes, exercises, segments };
    if (hiitMeta) entry.hiitMeta = hiitMeta;
    list.unshift(entry);
  }

  localStorage.setItem("savedWorkouts", JSON.stringify(list)); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
  closeSaveWorkoutModal();
  renderSavedWorkouts();
}

function deleteSavedWorkout(id) {
  if (!confirm("Delete this saved workout?")) return;
  const list = loadSavedWorkouts().filter(s => s.id !== id);
  localStorage.setItem("savedWorkouts", JSON.stringify(list)); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
  renderSavedWorkouts();
}

function openAssignSavedWorkout(id) {
  const panelId = `sw-assign-panel-${id}`;
  const existing = document.getElementById(panelId);
  if (existing) { existing.remove(); return; } // toggle off

  // Close any other open assign panels
  document.querySelectorAll(".sw-assign-panel").forEach(p => p.remove());

  const btn = document.querySelector(`[onclick="openAssignSavedWorkout('${id}')"]`);
  if (!btn) return;

  const today = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  const panel = document.createElement("div");
  panel.className = "sw-assign-panel";
  panel.id = panelId;
  panel.innerHTML = `
    <label>Pick a date</label>
    <input type="date" id="sw-assign-date-${id}" value="${today}" />
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn-primary" style="flex:1" onclick="confirmAssignSavedWorkout('${id}')">Add to Calendar</button>
      <button class="btn-secondary" style="flex:0 0 auto" onclick="document.getElementById('${panelId}').remove()">Cancel</button>
    </div>
    <p class="sw-assign-msg" id="sw-assign-msg-${id}"></p>`;

  // Insert panel after the card header
  const card = document.getElementById(`sw-card-${id}`);
  if (card) {
    const body = card.querySelector(".card-body");
    if (body) body.insertBefore(panel, body.firstChild);
    else card.appendChild(panel);
    // Expand the card if collapsed
    if (card.classList.contains("is-collapsed")) toggleSection(`sw-card-${id}`);
  }
}

function confirmAssignSavedWorkout(id) {
  const sw = loadSavedWorkouts().find(s => s.id === id);
  if (!sw) return;

  const dateStr = document.getElementById(`sw-assign-date-${id}`)?.value;
  const msgEl   = document.getElementById(`sw-assign-msg-${id}`);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    if (msgEl) msgEl.textContent = "Please select a valid date.";
    return;
  }

  const workouts = loadWorkouts();
  const entry = {
    id:        generateId("workout"),
    date:      dateStr,
    type:      sw.type,
    notes:     sw.name || sw.notes || "",
    exercises: sw.exercises || [],
    fromSaved: sw.name,
  };
  if (sw.aiSession) {
    entry.aiSession = { ...sw.aiSession, title: sw.name || sw.aiSession.title };
  }
  if (sw.generatedSession) {
    entry.generatedSession = { ...sw.generatedSession, name: sw.name || sw.generatedSession.name };
  }
  if (sw.duration)         entry.duration         = sw.duration;
  if (sw.hiitMeta)         entry.hiitMeta         = sw.hiitMeta;
  workouts.unshift(entry);
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  if (msgEl) { msgEl.textContent = `Added to ${dateStr}`; msgEl.style.color = "var(--color-success)"; }
  setTimeout(() => {
    const panel = document.getElementById(`sw-assign-panel-${id}`);
    if (panel) panel.remove();
    renderWorkoutHistory();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof renderDayDetail === "function" && typeof selectedDate !== "undefined") renderDayDetail(selectedDate);
  }, 800);
}


/* =====================================================================
   COMMUNITY WORKOUTS
   ===================================================================== */

const COMMUNITY_WORKOUTS = [
  // --- Strength ---
  { id: "c-ppl-push", category: "Strength", name: "PPL: Push Day", author: "IronZ Team", difficulty: "Intermediate", type: "weightlifting",
    exercises: [
      { name: "Barbell Bench Press", sets: 4, reps: 8, weight: "Bar + 45lbs" },
      { name: "Overhead Press", sets: 3, reps: 8, weight: "Bar + 25lbs" },
      { name: "Incline Dumbbell Press", sets: 3, reps: 10, weight: "2×30lb" },
      { name: "Lateral Raises", sets: 4, reps: 12, weight: "2×15lb" },
      { name: "Tricep Pushdowns", sets: 3, reps: 12, weight: "Moderate" },
      { name: "Overhead Tricep Ext", sets: 3, reps: 12, weight: "2×20lb" },
    ]},
  { id: "c-ppl-pull", category: "Strength", name: "PPL: Pull Day", author: "IronZ Team", difficulty: "Intermediate", type: "weightlifting",
    exercises: [
      { name: "Pull-ups", sets: 4, reps: 8, weight: "Bodyweight" },
      { name: "Barbell Bent-over Row", sets: 4, reps: 8, weight: "Bar + 40lbs" },
      { name: "Lat Pulldown", sets: 3, reps: 10, weight: "Moderate" },
      { name: "Face Pulls", sets: 3, reps: 15, weight: "Light cable" },
      { name: "Barbell Bicep Curl", sets: 3, reps: 10, weight: "Bar + 20lbs" },
      { name: "Hammer Curls", sets: 3, reps: 10, weight: "2×25lb" },
    ]},
  { id: "c-ppl-legs", category: "Strength", name: "PPL: Leg Day", author: "IronZ Team", difficulty: "Intermediate", type: "weightlifting",
    exercises: [
      { name: "Barbell Back Squat", sets: 4, reps: 8, weight: "Bar + 60lbs" },
      { name: "Romanian Deadlift", sets: 3, reps: 10, weight: "Bar + 40lbs" },
      { name: "Walking Lunges", sets: 3, reps: 12, weight: "2×25lb" },
      { name: "Leg Press", sets: 3, reps: 12, weight: "Moderate" },
      { name: "Leg Curl", sets: 3, reps: 12, weight: "Moderate" },
      { name: "Calf Raises", sets: 4, reps: 15, weight: "Moderate" },
    ]},
  { id: "c-upper-lower-u", category: "Strength", name: "Upper Body Blast", author: "Coach Marcus", difficulty: "Advanced", type: "weightlifting",
    exercises: [
      { name: "Barbell Bench Press", sets: 5, reps: 5, weight: "Bar + 90lbs" },
      { name: "Weighted Pull-ups", sets: 4, reps: 6, weight: "+25lb belt" },
      { name: "Overhead Press", sets: 4, reps: 6, weight: "Bar + 50lbs" },
      { name: "Pendlay Row", sets: 4, reps: 6, weight: "Bar + 70lbs" },
      { name: "Weighted Dips", sets: 3, reps: 8, weight: "+25lb belt" },
      { name: "Barbell Curl", sets: 3, reps: 10, weight: "Bar + 30lbs" },
    ]},
  { id: "c-strength-full", category: "Strength", name: "Full Body Strength", author: "IronZ Team", difficulty: "Beginner", type: "weightlifting",
    exercises: [
      { name: "Goblet Squat", sets: 3, reps: 12, weight: "30lb kettlebell" },
      { name: "Dumbbell Bench Press", sets: 3, reps: 10, weight: "2×20lb" },
      { name: "Dumbbell Row", sets: 3, reps: 10, weight: "2×20lb" },
      { name: "Dumbbell Shoulder Press", sets: 3, reps: 10, weight: "2×15lb" },
      { name: "Plank", sets: 3, reps: "30 sec", weight: "Bodyweight" },
    ]},
  { id: "c-strength-531", category: "Strength", name: "5/3/1 Squat Day", author: "Coach Marcus", difficulty: "Advanced", type: "weightlifting",
    exercises: [
      { name: "Barbell Back Squat", sets: 3, reps: "5/3/1", weight: "65-95% 1RM" },
      { name: "Front Squat", sets: 3, reps: 8, weight: "Bar + 50lbs" },
      { name: "Leg Press", sets: 4, reps: 10, weight: "Heavy" },
      { name: "Glute Ham Raise", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Ab Wheel Rollout", sets: 3, reps: 10, weight: "Bodyweight" },
    ]},

  // --- Bodyweight ---
  { id: "c-bw-upper", category: "Bodyweight", name: "Upper Body Calisthenics", author: "Alex K.", difficulty: "Intermediate", type: "bodyweight",
    exercises: [
      { name: "Diamond Push-ups", sets: 4, reps: 12, weight: "Bodyweight" },
      { name: "Pull-ups", sets: 4, reps: 8, weight: "Bodyweight" },
      { name: "Pike Push-ups", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Chin-ups", sets: 3, reps: 8, weight: "Bodyweight" },
      { name: "Tricep Dips", sets: 3, reps: 12, weight: "Bodyweight" },
    ]},
  { id: "c-bw-lower", category: "Bodyweight", name: "Legs No Equipment", author: "Alex K.", difficulty: "Intermediate", type: "bodyweight",
    exercises: [
      { name: "Bulgarian Split Squats", sets: 4, reps: 10, weight: "Bodyweight" },
      { name: "Jump Squats", sets: 3, reps: 12, weight: "Bodyweight" },
      { name: "Single-leg RDL", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Glute Bridges", sets: 3, reps: 15, weight: "Bodyweight" },
      { name: "Wall Sit", sets: 3, reps: "45 sec", weight: "Bodyweight" },
    ]},
  { id: "c-bw-full", category: "Bodyweight", name: "Hotel Room Full Body", author: "IronZ Team", difficulty: "Beginner", type: "bodyweight",
    exercises: [
      { name: "Push-ups", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Bodyweight Squats", sets: 3, reps: 15, weight: "Bodyweight" },
      { name: "Plank", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "Lunges", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Superman Hold", sets: 3, reps: "20 sec", weight: "Bodyweight" },
    ]},

  // --- HIIT ---
  { id: "c-hiit-burner", category: "HIIT", name: "20-Min Burner", author: "Coach Jen", difficulty: "Intermediate", type: "hiit",
    exercises: [
      { name: "Burpees", sets: 4, reps: 10, weight: "Bodyweight" },
      { name: "Kettlebell Swings", sets: 4, reps: 15, weight: "35lb" },
      { name: "Box Jumps", sets: 4, reps: 10, weight: "Bodyweight" },
      { name: "Battle Ropes", sets: 4, reps: "30 sec", weight: "—" },
      { name: "Mountain Climbers", sets: 4, reps: 20, weight: "Bodyweight" },
    ]},
  { id: "c-hiit-tabata", category: "HIIT", name: "Tabata Circuit", author: "Coach Jen", difficulty: "Advanced", type: "hiit",
    exercises: [
      { name: "Jump Squats", sets: 8, reps: "20 sec on / 10 sec off", weight: "Bodyweight" },
      { name: "Push-ups", sets: 8, reps: "20 sec on / 10 sec off", weight: "Bodyweight" },
      { name: "High Knees", sets: 8, reps: "20 sec on / 10 sec off", weight: "Bodyweight" },
      { name: "Plank Jacks", sets: 8, reps: "20 sec on / 10 sec off", weight: "Bodyweight" },
    ]},

  // --- Running ---
  { id: "c-run-easy5k", category: "Running", name: "Easy 5K Prep", author: "IronZ Team", difficulty: "Beginner", type: "running",
    segments: [
      { name: "Warm-up Walk", duration: "5 min", effort: "Z1" },
      { name: "Easy Jog", duration: "15 min", effort: "Z2" },
      { name: "Walk Break", duration: "2 min", effort: "Z1" },
      { name: "Easy Jog", duration: "10 min", effort: "Z2" },
      { name: "Cool-down Walk", duration: "3 min", effort: "Z1" },
    ]},
  { id: "c-run-tempo", category: "Running", name: "Tempo Run", author: "Coach Dave", difficulty: "Intermediate", type: "running",
    segments: [
      { name: "Warm-up", duration: "10 min", effort: "Z2" },
      { name: "Tempo", duration: "20 min", effort: "Z3" },
      { name: "Cool-down", duration: "10 min", effort: "Z1" },
    ]},
  { id: "c-run-intervals", category: "Running", name: "800m Repeats", author: "Coach Dave", difficulty: "Advanced", type: "running",
    segments: [
      { name: "Warm-up", duration: "10 min", effort: "Z2" },
      { name: "800m Hard", duration: "3 min", effort: "Z4" },
      { name: "Jog Recovery", duration: "2 min", effort: "Z1" },
      { name: "800m Hard", duration: "3 min", effort: "Z4" },
      { name: "Jog Recovery", duration: "2 min", effort: "Z1" },
      { name: "800m Hard", duration: "3 min", effort: "Z4" },
      { name: "Jog Recovery", duration: "2 min", effort: "Z1" },
      { name: "800m Hard", duration: "3 min", effort: "Z4" },
      { name: "Cool-down", duration: "10 min", effort: "Z1" },
    ]},
  { id: "c-run-long", category: "Running", name: "Long Run Builder", author: "IronZ Team", difficulty: "Intermediate", type: "running",
    segments: [
      { name: "Easy Pace", duration: "50 min", effort: "Z2" },
      { name: "Moderate Push", duration: "10 min", effort: "Z3" },
      { name: "Cool-down", duration: "5 min", effort: "Z1" },
    ]},

  // --- Cycling ---
  { id: "c-bike-endurance", category: "Cycling", name: "Endurance Base", author: "IronZ Team", difficulty: "Beginner", type: "cycling",
    segments: [
      { name: "Easy Spin", duration: "45 min", effort: "Z2" },
      { name: "Cool-down", duration: "5 min", effort: "Z1" },
    ]},
  { id: "c-bike-ss", category: "Cycling", name: "Sweet Spot Intervals", author: "Coach Lisa", difficulty: "Intermediate", type: "cycling",
    segments: [
      { name: "Warm-up", duration: "10 min", effort: "Z2" },
      { name: "Sweet Spot", duration: "10 min", effort: "Z3" },
      { name: "Recovery", duration: "5 min", effort: "Z1" },
      { name: "Sweet Spot", duration: "10 min", effort: "Z3" },
      { name: "Recovery", duration: "5 min", effort: "Z1" },
      { name: "Sweet Spot", duration: "10 min", effort: "Z3" },
      { name: "Cool-down", duration: "10 min", effort: "Z1" },
    ]},
  { id: "c-bike-vo2", category: "Cycling", name: "VO2 Max Blaster", author: "Coach Lisa", difficulty: "Advanced", type: "cycling",
    segments: [
      { name: "Warm-up", duration: "15 min", effort: "Z2" },
      { name: "VO2 Interval", duration: "4 min", effort: "Z5" },
      { name: "Recovery", duration: "4 min", effort: "Z1" },
      { name: "VO2 Interval", duration: "4 min", effort: "Z5" },
      { name: "Recovery", duration: "4 min", effort: "Z1" },
      { name: "VO2 Interval", duration: "4 min", effort: "Z5" },
      { name: "Recovery", duration: "4 min", effort: "Z1" },
      { name: "VO2 Interval", duration: "4 min", effort: "Z5" },
      { name: "Cool-down", duration: "10 min", effort: "Z1" },
    ]},

  // --- Yoga ---
  { id: "c-yoga-morning", category: "Yoga", name: "Morning Flow", author: "IronZ Team", difficulty: "Beginner", type: "yoga",
    segments: [
      { name: "Cat-Cow + Breathing", duration: "5 min", effort: "Z1" },
      { name: "Sun Salutation A x3", duration: "8 min", effort: "Z2" },
      { name: "Warrior I & II Flow", duration: "8 min", effort: "Z2" },
      { name: "Standing Balance", duration: "5 min", effort: "Z2" },
      { name: "Seated Stretch + Savasana", duration: "5 min", effort: "Z1" },
    ]},
  { id: "c-yoga-power", category: "Yoga", name: "Power Vinyasa", author: "Coach Maya", difficulty: "Advanced", type: "yoga",
    segments: [
      { name: "Breath Work", duration: "3 min", effort: "Z1" },
      { name: "Sun Sal A+B Flow", duration: "10 min", effort: "Z3" },
      { name: "Warrior Sequence", duration: "12 min", effort: "Z3" },
      { name: "Arm Balances + Inversions", duration: "10 min", effort: "Z4" },
      { name: "Hip Openers", duration: "8 min", effort: "Z2" },
      { name: "Savasana", duration: "5 min", effort: "Z1" },
    ]},

  // --- Fun ---
  { id: "c-fun-obstacle", category: "Fun", name: "Obstacle Course Prep", author: "IronZ Team", difficulty: "Intermediate", type: "general",
    exercises: [
      { name: "Bear Crawl", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "Burpees", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Box Jumps", sets: 3, reps: 8, weight: "Bodyweight" },
      { name: "Farmer's Carry", sets: 3, reps: "40 yd", weight: "2×40lb" },
      { name: "Dead Hang", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "Sled Push", sets: 3, reps: "20 yd", weight: "Moderate" },
    ]},
  { id: "c-fun-partner", category: "Fun", name: "Partner Throwdown", author: "Coach Jen", difficulty: "Intermediate", type: "general",
    exercises: [
      { name: "Med Ball Chest Pass", sets: 4, reps: 12, weight: "15lb ball" },
      { name: "Partner Plank High-Five", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "Wheelbarrow Walk", sets: 3, reps: "20 yd", weight: "Bodyweight" },
      { name: "Band Resisted Sprint", sets: 4, reps: "15 sec", weight: "Band" },
      { name: "Synchro Burpees", sets: 3, reps: 8, weight: "Bodyweight" },
    ]},
  { id: "c-fun-emom", category: "Fun", name: "EMOM Challenge (20 min)", author: "Coach Jen", difficulty: "Advanced", type: "hiit",
    exercises: [
      { name: "Min 1: Thrusters", sets: 1, reps: 12, weight: "Bar + 25lbs" },
      { name: "Min 2: Pull-ups", sets: 1, reps: 10, weight: "Bodyweight" },
      { name: "Min 3: Box Jumps", sets: 1, reps: 12, weight: "Bodyweight" },
      { name: "Min 4: Kettlebell Swings", sets: 1, reps: 15, weight: "35lb" },
      { name: "Repeat 5 rounds", sets: "—", reps: "—", weight: "—" },
    ]},
  { id: "c-fun-playground", category: "Fun", name: "Playground Workout", author: "Alex K.", difficulty: "Beginner", type: "bodyweight",
    exercises: [
      { name: "Monkey Bar Traverse", sets: 3, reps: "1 crossing", weight: "Bodyweight" },
      { name: "Bench Step-ups", sets: 3, reps: 12, weight: "Bodyweight" },
      { name: "Swing Set Rows", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Slide Plank Hold", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "Sprint to Next Station", sets: 4, reps: "30 sec", weight: "Bodyweight" },
    ]},
  { id: "c-fun-dance-hiit", category: "Fun", name: "Dance HIIT", author: "Coach Maya", difficulty: "Beginner", type: "hiit",
    exercises: [
      { name: "Shuffle Side-to-Side", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "Jump Squat Twist", sets: 3, reps: 10, weight: "Bodyweight" },
      { name: "Grapevine + Clap", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "High Knee March", sets: 3, reps: "30 sec", weight: "Bodyweight" },
      { name: "Freestyle Combo", sets: 3, reps: "45 sec", weight: "Bodyweight" },
    ]},
];

/* ── Community workouts — merged list (hardcoded + Supabase) ────────────── */

let _commActiveCategory = "All";
let _commDbWorkouts = [];      // fetched from Supabase
let _commIsAdmin = false;

/** Fetch community workouts from Supabase and merge with defaults */
async function _commFetchFromDb() {
  const client = window.supabaseClient;
  if (!client || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") return; // not configured

  try {
    const { data, error } = await client.from("community_workouts").select("*").order("created_at", { ascending: true });
    if (!error && data) _commDbWorkouts = data;
  } catch {}

  // Check admin role
  try {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      const { data: profile } = await client.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      _commIsAdmin = profile?.role === "admin";
    }
  } catch {}
}

// TODO: remove this hidden-IDs feature before launch
function _commGetHiddenIds() {
  try { return JSON.parse(localStorage.getItem("commHiddenIds") || "[]"); } catch { return []; }
}

function _commGetAll() {
  const hidden = new Set(_commGetHiddenIds());
  const dbIds = new Set(_commDbWorkouts.map(w => w.id));
  const fromDefaults = COMMUNITY_WORKOUTS.filter(w => !dbIds.has(w.id));
  let userShared = [];
  try { userShared = JSON.parse(localStorage.getItem("userSharedWorkouts") || "[]"); } catch {}
  return [...fromDefaults, ..._commDbWorkouts, ...userShared].filter(w => !hidden.has(w.id));
}

// TODO: remove before launch
function hideCommWorkout(id) {
  const hidden = _commGetHiddenIds();
  if (!hidden.includes(id)) hidden.push(id);
  localStorage.setItem("commHiddenIds", JSON.stringify(hidden));
  renderCommunityWorkouts();
}

function unhideAllCommWorkouts() {
  localStorage.removeItem("commHiddenIds");
  renderCommunityWorkouts();
}

async function renderCommunityWorkouts(filter) {
  await _commFetchFromDb();

  filter = filter || _commActiveCategory;
  _commActiveCategory = filter;

  const all = _commGetAll();
  let userShared = [];
  try { userShared = JSON.parse(localStorage.getItem("userSharedWorkouts") || "[]"); } catch {}
  const userIds = new Set(userShared.map(w => w.id));

  const categories = ["All", ...Array.from(new Set(all.map(w => w.category)))];
  if (userShared.length > 0) categories.push("Yours");

  // Filter row
  const filterRow = document.getElementById("comm-filter-row");
  if (filterRow) {
    filterRow.innerHTML = categories.map(c =>
      `<button class="comm-filter-btn${c === filter ? " active" : ""}" onclick="renderCommunityWorkouts('${c}')">${c}</button>`
    ).join("");
  }

  const list = document.getElementById("community-workouts-list");
  if (!list) return;

  const workouts = filter === "Yours"
    ? all.filter(w => userIds.has(w.id))
    : filter === "All" ? all : all.filter(w => w.category === filter);

  // Group by category
  const groups = {};
  workouts.forEach(w => {
    if (!groups[w.category]) groups[w.category] = [];
    groups[w.category].push(w);
  });

  const saved = JSON.parse(localStorage.getItem("savedWorkouts") || "[]");
  const savedIds = new Set(saved.map(s => s.communityId));

  let html = "";

  // Admin: add workout button
  if (_commIsAdmin) {
    html += `<button class="btn-primary" style="margin-bottom:12px" onclick="openCommAdminForm()">+ Add Community Workout</button>`;
  }


  for (const [cat, items] of Object.entries(groups)) {
    html += `<div class="comm-group">`;
    if (filter === "All") html += `<h3 class="comm-group-title">${cat}</h3>`;
    html += items.map(w => {
      const isSaved = savedIds.has(w.id);
      const diffClass = w.difficulty === "Beginner" ? "diff-beg" : w.difficulty === "Intermediate" ? "diff-int" : "diff-adv";
      const hasExercises = w.exercises && w.exercises.length;
      const hasSegments  = w.segments  && w.segments.length;
      const isDbWorkout  = _commDbWorkouts.some(d => d.id === w.id);

      let detailHTML = "";
      if (hasExercises) {
        detailHTML = `<table class="exercise-table comm-ex-table">
          <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th></tr></thead>
          <tbody>${w.exercises.map(e => `<tr><td>${escHtml(e.name)}</td><td>${escHtml(String(e.sets))}</td><td>${escHtml(String(e.reps))}</td><td>${escHtml(_normalizeWeightDisplay(e.weight))}</td></tr>`).join("")}</tbody></table>`;
      } else if (hasSegments) {
        detailHTML = `<table class="exercise-table comm-ex-table">
          <thead><tr><th>Phase</th><th>Duration</th><th>Zone</th></tr></thead>
          <tbody>${w.segments.map(s => `<tr><td>${escHtml(s.name)}</td><td>${escHtml(s.duration)}</td><td>${escHtml(s.effort)}</td></tr>`).join("")}</tbody></table>`;
      }

      // Admin delete button for DB-sourced workouts
      const adminDel = (_commIsAdmin && isDbWorkout)
        ? `<button class="btn-secondary comm-del-btn" onclick="event.stopPropagation(); deleteCommWorkout('${w.id}')" title="Delete">Del</button>`
        : "";

      const isUserShared = userIds.has(w.id);
      const unshareBtn = isUserShared
        ? `<button class="btn-secondary comm-del-btn" onclick="event.stopPropagation(); unshareWorkout('${w.id}')" title="Remove your shared workout">Unshare</button>`
        : "";

      return `<div class="comm-card">
        <div class="comm-card-header" onclick="this.parentElement.classList.toggle('expanded')">
          <div class="comm-card-info">
            <span class="comm-card-name">${escHtml(w.name)}</span>
            <span class="comm-card-meta"><span class="comm-diff ${diffClass}">${escHtml(w.difficulty)}</span> &middot; ${escHtml(w.author)}${isUserShared ? " (you)" : ""}</span>
          </div>
          <div class="comm-card-actions">
            ${adminDel}
            ${unshareBtn}
            ${isUserShared ? "" : `<button class="btn-secondary comm-save-btn${isSaved ? " comm-saved" : ""}" onclick="event.stopPropagation(); saveCommunityWorkout('${w.id}')">${isSaved ? "Saved" : "Save"}</button>`}
            <button class="btn-secondary comm-hide-btn" onclick="event.stopPropagation(); hideCommWorkout('${w.id}')" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="comm-card-detail">${detailHTML}</div>
      </div>`;
    }).join("");
    html += `</div>`;
  }

  list.innerHTML = html;
}

function saveCommunityWorkout(communityId) {
  const cw = _commGetAll().find(w => w.id === communityId);
  if (!cw) return;

  const saved = JSON.parse(localStorage.getItem("savedWorkouts") || "[]");
  if (saved.some(s => s.communityId === communityId)) {
    const updated = saved.filter(s => s.communityId !== communityId);
    localStorage.setItem("savedWorkouts", JSON.stringify(updated)); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
    renderCommunityWorkouts();
    return;
  }

  if (saved.length >= 20) {
    alert("You have 20 saved workouts (max). Remove one first.");
    return;
  }

  const entry = {
    id: String(Date.now()),
    communityId: cw.id,
    name: cw.name,
    type: cw.type,
    notes: `From Community — by ${cw.author}`,
  };
  if (cw.exercises) entry.exercises = JSON.parse(JSON.stringify(cw.exercises));
  if (cw.segments)  entry.segments  = JSON.parse(JSON.stringify(cw.segments));

  saved.push(entry);
  localStorage.setItem("savedWorkouts", JSON.stringify(saved)); if (typeof DB !== 'undefined') DB.syncKey('savedWorkouts');
  renderCommunityWorkouts();
}

/* ── Share logged workout to Community ───────────────────────────────── */

function openShareWorkout(workoutId) {
  const workouts = JSON.parse(localStorage.getItem("workouts") || "[]");
  const w = workouts.find(x => x.id === workoutId);
  if (!w) return;

  const modal = document.getElementById("share-workout-modal");
  if (!modal) return;

  document.getElementById("share-workout-id").value = workoutId;
  document.getElementById("share-workout-name").value = w.name || capitalize(w.type || "Workout");

  // Auto-pick category based on type
  const typeToCategory = {
    weightlifting: "Strength", bodyweight: "Bodyweight", hiit: "Strength",
    run: "Cardio", bike: "Cardio", swim: "Cardio", cardio: "Cardio",
    yoga: "Flexibility", stretch: "Flexibility", flexibility: "Flexibility",
  };
  document.getElementById("share-workout-category").value = typeToCategory[w.type] || "Strength";

  // Preview
  const preview = document.getElementById("share-workout-preview");
  if (preview) {
    let previewHtml = "";
    if (w.exercises && w.exercises.length) {
      previewHtml = `<p class="hint" style="margin:0 0 4px">${w.exercises.length} exercise${w.exercises.length !== 1 ? "s" : ""} will be shared</p>`;
    } else if (w.segments && w.segments.length) {
      previewHtml = `<p class="hint" style="margin:0 0 4px">${w.segments.length} segment${w.segments.length !== 1 ? "s" : ""} will be shared</p>`;
    }
    preview.innerHTML = previewHtml;
  }

  modal.style.display = "";
  modal.classList.add("is-open");
}

function closeShareWorkout() {
  const modal = document.getElementById("share-workout-modal");
  if (modal) { modal.classList.remove("is-open"); modal.style.display = "none"; }
}

function submitShareWorkout() {
  const workoutId = parseInt(document.getElementById("share-workout-id").value);
  const workouts = JSON.parse(localStorage.getItem("workouts") || "[]");
  const w = workouts.find(x => x.id === workoutId);
  if (!w) return;

  const name = document.getElementById("share-workout-name").value.trim();
  if (!name) { alert("Please enter a workout name."); return; }

  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile") || "{}"); } catch { profile = {}; }
  const author = (profile.name || "").trim() || "Anonymous";

  const category = document.getElementById("share-workout-category").value;
  const difficulty = document.getElementById("share-workout-difficulty").value;

  const communityEntry = {
    id: "user-" + Date.now(),
    category,
    name,
    author,
    difficulty,
    type: w.type || "general",
  };
  if (w.exercises && w.exercises.length) {
    communityEntry.exercises = JSON.parse(JSON.stringify(w.exercises));
  }
  if (w.segments && w.segments.length) {
    communityEntry.segments = JSON.parse(JSON.stringify(w.segments));
  }

  // Save to localStorage user-shared workouts list
  const shared = JSON.parse(localStorage.getItem("userSharedWorkouts") || "[]");
  shared.push(communityEntry);
  localStorage.setItem("userSharedWorkouts", JSON.stringify(shared)); if (typeof DB !== 'undefined') DB.syncKey('userSharedWorkouts');

  closeShareWorkout();
  renderWorkoutHistory();

  // If on community tab, refresh it
  if (typeof renderCommunityWorkouts === "function") renderCommunityWorkouts();
}

function unshareWorkout(id) {
  let shared = [];
  try { shared = JSON.parse(localStorage.getItem("userSharedWorkouts") || "[]"); } catch {}
  shared = shared.filter(w => w.id !== id);
  localStorage.setItem("userSharedWorkouts", JSON.stringify(shared)); if (typeof DB !== 'undefined') DB.syncKey('userSharedWorkouts');
  renderCommunityWorkouts();
}

/* ── Create custom workout in Community ──────────────────────────────── */

let _ccRowCount = 0;

function openCreateCommunityWorkout() {
  const modal = document.getElementById("create-comm-modal");
  if (!modal) return;

  document.getElementById("cc-name").value = "";
  document.getElementById("cc-category").value = "Strength";
  document.getElementById("cc-difficulty").value = "Intermediate";
  document.getElementById("cc-type").value = "weightlifting";
  document.getElementById("cc-exercise-rows").innerHTML = "";
  document.getElementById("cc-segment-rows").innerHTML = "";
  document.getElementById("cc-exercises-section").style.display = "";
  document.getElementById("cc-segments-section").style.display = "none";
  const msg = document.getElementById("cc-msg");
  if (msg) msg.textContent = "";

  _ccRowCount = 0;
  _ccAddExRow();
  _ccAddExRow();

  modal.style.display = "";
  modal.classList.add("is-open");
}

function closeCreateCommunityWorkout() {
  const modal = document.getElementById("create-comm-modal");
  if (modal) { modal.classList.remove("is-open"); modal.style.display = "none"; }
}

function _ccTypeChanged() {
  const type = document.getElementById("cc-type")?.value;
  const isEndurance = ["running", "cycling", "yoga"].includes(type);
  const isHiit = type === "hiit";
  const exSec  = document.getElementById("cc-exercises-section");
  const segSec = document.getElementById("cc-segments-section");
  const hiitRow = document.getElementById("cc-hiit-format-row");
  if (exSec)  exSec.style.display  = isEndurance ? "none" : "";
  if (segSec) {
    segSec.style.display = isEndurance ? "" : "none";
    // Seed segment rows if empty
    if (isEndurance && !document.querySelectorAll("#cc-segment-rows .exercise-row").length) {
      _ccAddSegRow();
      _ccAddSegRow();
    }
  }
  if (hiitRow) hiitRow.style.display = isHiit ? "" : "none";
}

function _ccAddExRow() {
  _ccRowCount++;
  const id = _ccRowCount;
  const container = document.getElementById("cc-exercise-rows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "exercise-row";
  row.innerHTML = `
    <div><label>Exercise</label><input type="text" id="cc-ex-${id}" placeholder="e.g. Bench Press" /></div>
    <div><label>Sets</label><input type="text" id="cc-sets-${id}" placeholder="3" /></div>
    <div><label>Reps</label><input type="text" id="cc-reps-${id}" placeholder="10" /></div>
    <div><label>Weight</label><input type="text" id="cc-wt-${id}" placeholder="lbs / BW" /></div>
    <button class="remove-exercise-btn" onclick="this.parentElement.remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  if (typeof _initRowDrag === "function") _initRowDrag(row, container);
  container.appendChild(row);
}

function _ccAddSegRow() {
  _ccRowCount++;
  const id = _ccRowCount;
  const container = document.getElementById("cc-segment-rows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "exercise-row sw-segment-row";
  row.innerHTML = `
    <div><label>Phase</label><input type="text" id="cc-seg-${id}" placeholder="e.g. Warm-up" /></div>
    <div><label>Duration</label><input type="text" id="cc-dur-${id}" placeholder="e.g. 10 min" /></div>
    <div><label>Zone</label>
      <select id="cc-eff-${id}">
        <option value="RW">Rest / Walk</option>
        <option value="Z1">Z1 Recovery</option>
        <option value="Z2" selected>Z2 Aerobic</option>
        <option value="Z3">Z3 Tempo</option>
        <option value="Z4">Z4 Threshold</option>
        <option value="Z5">Z5 VO2 Max</option>
        <option value="Z6">Z6 Max Sprint</option>
      </select>
    </div>
    <button class="remove-exercise-btn" onclick="this.parentElement.remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  if (typeof _initRowDrag === "function") _initRowDrag(row, container);
  container.appendChild(row);
}

function saveCreateCommunityWorkout() {
  const msg = document.getElementById("cc-msg");
  const name       = document.getElementById("cc-name")?.value.trim();
  const category   = document.getElementById("cc-category")?.value;
  const difficulty = document.getElementById("cc-difficulty")?.value;
  const type       = document.getElementById("cc-type")?.value;

  if (!name) { if (msg) { msg.textContent = "Name is required."; msg.style.color = "#ef4444"; } return; }

  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile") || "{}"); } catch { profile = {}; }
  const author = (profile.name || "").trim() || "Anonymous";

  const isEndurance = ["running", "cycling", "yoga"].includes(type);
  let exercises = null, segments = null;

  if (isEndurance) {
    segments = [];
    document.querySelectorAll("#cc-segment-rows .exercise-row").forEach(row => {
      const inputs = row.querySelectorAll("input, select");
      const n = inputs[0]?.value.trim();
      const d = inputs[1]?.value.trim();
      const e = inputs[2]?.value;
      if (n && d) segments.push({ name: n, duration: d, effort: e || "Z2" });
    });
    if (!segments.length) { if (msg) { msg.textContent = "Add at least one segment."; msg.style.color = "#ef4444"; } return; }
  } else {
    exercises = [];
    document.querySelectorAll("#cc-exercise-rows .exercise-row").forEach(row => {
      const inputs = row.querySelectorAll("input");
      const n = inputs[0]?.value.trim();
      const s = inputs[1]?.value.trim();
      const r = inputs[2]?.value.trim();
      const w = inputs[3]?.value.trim();
      if (n) exercises.push({ name: n, sets: s || "3", reps: r || "10", weight: w || "Bodyweight" });
    });
    if (!exercises.length) { if (msg) { msg.textContent = "Add at least one exercise."; msg.style.color = "#ef4444"; } return; }
  }

  const entry = {
    id: "user-" + Date.now(),
    category, name, author, difficulty, type: type || "general",
  };
  if (type === "hiit") {
    entry.format = document.getElementById("cc-hiit-format")?.value || "circuit";
  }
  if (exercises) entry.exercises = exercises;
  if (segments)  entry.segments  = segments;

  const shared = JSON.parse(localStorage.getItem("userSharedWorkouts") || "[]");
  shared.push(entry);
  localStorage.setItem("userSharedWorkouts", JSON.stringify(shared)); if (typeof DB !== 'undefined') DB.syncKey('userSharedWorkouts');

  closeCreateCommunityWorkout();
  renderCommunityWorkouts();
}

/* ── Admin: add / delete community workouts via Supabase ──────────────── */

let _commAdminRowCount = 0;
const COMM_STRENGTH_TYPES = ["weightlifting", "bodyweight", "hiit", "general"];

function openCommAdminForm() {
  const list = document.getElementById("community-workouts-list");
  if (!list) return;

  // Don't open twice
  if (document.getElementById("comm-admin-form")) return;

  _commAdminRowCount = 0;

  const formHTML = `
    <div class="card comm-admin-form" id="comm-admin-form">
      <h3 style="margin:0 0 12px">Add Community Workout</h3>
      <div class="form-row">
        <label>Name</label>
        <input type="text" id="ca-name" placeholder="e.g. Murph Challenge" />
      </div>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div>
          <label>Category</label>
          <select id="ca-category">
            <option value="Strength">Strength</option>
            <option value="Bodyweight">Bodyweight</option>
            <option value="HIIT">HIIT</option>
            <option value="Running">Running</option>
            <option value="Cycling">Cycling</option>
            <option value="Yoga">Yoga</option>
            <option value="Fun">Fun</option>
          </select>
        </div>
        <div>
          <label>Difficulty</label>
          <select id="ca-difficulty">
            <option value="Beginner">Beginner</option>
            <option value="Intermediate" selected>Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>
        <div>
          <label>Type</label>
          <select id="ca-type" onchange="_caTypeChanged()">
            <option value="weightlifting">Strength / Lifting</option>
            <option value="bodyweight">Bodyweight</option>
            <option value="hiit">HIIT</option>
            <option value="running">Running</option>
            <option value="cycling">Cycling</option>
            <option value="yoga">Yoga</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <label>Author</label>
        <input type="text" id="ca-author" placeholder="e.g. Coach Dave" value="IronZ Team" />
      </div>

      <div id="ca-exercises-section">
        <p class="sw-section-label" style="margin:8px 0 4px;font-weight:600;font-size:0.82rem">Exercises</p>
        <div id="ca-exercise-rows"></div>
        <button class="btn-secondary" onclick="_caAddExRow()" style="margin-bottom:8px">+ Add Exercise</button>
      </div>

      <div id="ca-segments-section" style="display:none">
        <p class="sw-section-label" style="margin:8px 0 4px;font-weight:600;font-size:0.82rem">Segments</p>
        <div id="ca-segment-rows"></div>
        <button class="btn-secondary" onclick="_caAddSegRow()" style="margin-bottom:8px">+ Add Segment</button>
      </div>

      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-primary" style="flex:1" onclick="saveCommAdminWorkout()">Publish</button>
        <button class="btn-secondary" style="flex:1" onclick="document.getElementById('comm-admin-form').remove()">Cancel</button>
      </div>
      <p id="ca-msg" class="save-msg" style="margin-top:6px"></p>
    </div>`;

  list.insertAdjacentHTML("afterbegin", formHTML);
  _caAddExRow();
  _caAddExRow();
  _caAddSegRow();
  _caAddSegRow();
}

function _caTypeChanged() {
  const type = document.getElementById("ca-type")?.value;
  const isEndurance = ["running", "cycling", "yoga"].includes(type);
  const exSec  = document.getElementById("ca-exercises-section");
  const segSec = document.getElementById("ca-segments-section");
  if (exSec)  exSec.style.display  = isEndurance ? "none" : "";
  if (segSec) segSec.style.display = isEndurance ? "" : "none";
}

function _caAddExRow() {
  _commAdminRowCount++;
  const id = _commAdminRowCount;
  const container = document.getElementById("ca-exercise-rows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "exercise-row";
  row.innerHTML = `
    <div><label>Exercise</label><input type="text" id="ca-ex-${id}" placeholder="e.g. Bench Press" /></div>
    <div><label>Sets</label><input type="text" id="ca-sets-${id}" placeholder="3" /></div>
    <div><label>Reps</label><input type="text" id="ca-reps-${id}" placeholder="10" /></div>
    <div><label>Weight</label><input type="text" id="ca-wt-${id}" placeholder="lbs / BW" /></div>
    <button class="remove-exercise-btn" onclick="this.parentElement.remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  _initRowDrag(row, container);
  container.appendChild(row);
}

function _caAddSegRow() {
  _commAdminRowCount++;
  const id = _commAdminRowCount;
  const container = document.getElementById("ca-segment-rows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "exercise-row sw-segment-row";
  row.innerHTML = `
    <div><label>Phase</label><input type="text" id="ca-seg-${id}" placeholder="e.g. Warm-up" /></div>
    <div><label>Duration</label><input type="text" id="ca-dur-${id}" placeholder="e.g. 10 min" /></div>
    <div><label>Zone</label>
      <select id="ca-eff-${id}">
        <option value="RW">Rest / Walk</option>
        <option value="Z1">Z1 Recovery</option>
        <option value="Z2" selected>Z2 Aerobic</option>
        <option value="Z3">Z3 Tempo</option>
        <option value="Z4">Z4 Threshold</option>
        <option value="Z5">Z5 VO2 Max</option>
        <option value="Z6">Z6 Max Sprint</option>
      </select>
    </div>
    <button class="remove-exercise-btn" onclick="this.parentElement.remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  _initRowDrag(row, container);
  container.appendChild(row);
}

async function saveCommAdminWorkout() {
  const msg = document.getElementById("ca-msg");
  const name       = document.getElementById("ca-name")?.value.trim();
  const category   = document.getElementById("ca-category")?.value;
  const difficulty = document.getElementById("ca-difficulty")?.value;
  const type       = document.getElementById("ca-type")?.value;
  const author     = document.getElementById("ca-author")?.value.trim() || "IronZ Team";

  if (!name) { msg.textContent = "Name is required."; msg.style.color = "#ef4444"; return; }

  const isEndurance = ["running", "cycling", "yoga"].includes(type);
  let exercises = null, segments = null;

  if (isEndurance) {
    segments = [];
    document.querySelectorAll("#ca-segment-rows .exercise-row").forEach(row => {
      const inputs = row.querySelectorAll("input, select");
      const n = inputs[0]?.value.trim();
      const d = inputs[1]?.value.trim();
      const e = inputs[2]?.value;
      if (n && d) segments.push({ name: n, duration: d, effort: e || "Z2" });
    });
    if (!segments.length) { msg.textContent = "Add at least one segment."; msg.style.color = "#ef4444"; return; }
  } else {
    exercises = [];
    document.querySelectorAll("#ca-exercise-rows .exercise-row").forEach(row => {
      const inputs = row.querySelectorAll("input");
      const n = inputs[0]?.value.trim();
      const s = inputs[1]?.value.trim();
      const r = inputs[2]?.value.trim();
      const w = inputs[3]?.value.trim();
      if (n) exercises.push({ name: n, sets: s || "3", reps: r || "10", weight: w || "Bodyweight" });
    });
    if (!exercises.length) { msg.textContent = "Add at least one exercise."; msg.style.color = "#ef4444"; return; }
  }

  const id = "c-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + "-" + Date.now();

  const record = { id, category, name, author, difficulty, type };
  if (exercises) record.exercises = exercises;
  if (segments)  record.segments  = segments;

  const client = window.supabaseClient;
  if (!client || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    // Dev mode: add to in-memory DB list
    _commDbWorkouts.push(record);
    document.getElementById("comm-admin-form")?.remove();
    renderCommunityWorkouts();
    return;
  }

  msg.textContent = "Publishing..."; msg.style.color = "var(--color-text-muted)";
  const { error } = await client.from("community_workouts").insert(record);
  if (error) {
    msg.textContent = error.message; msg.style.color = "#ef4444";
    return;
  }

  document.getElementById("comm-admin-form")?.remove();
  renderCommunityWorkouts();
}

async function deleteCommWorkout(workoutId) {
  if (!confirm("Delete this community workout for all users?")) return;
  const client = window.supabaseClient;
  if (!client || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    _commDbWorkouts = _commDbWorkouts.filter(w => w.id !== workoutId);
    renderCommunityWorkouts();
    return;
  }
  await client.from("community_workouts").delete().eq("id", workoutId);
  renderCommunityWorkouts();
}
