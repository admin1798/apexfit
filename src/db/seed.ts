import { calculateMacroTargets } from '../services/nutritionCalc';
import { calculateSessionVolume, offsetDateKey, stampPersonalRecords, toLocalDateKey } from '../services/workoutMetrics';
import type {
  BodyMeasurementEntry,
  Exercise,
  FoodLogEntry,
  PreferredSplit,
  RecoveryLogEntry,
  Routine,
  SavedMeal,
  UserProfile,
  WaterLogEntry,
  WeightLogEntry,
  WorkoutSession,
} from '../types';
import { db } from './database';

export const DEFAULT_PROFILE_ID = 'default-user';

export const BUILTIN_EXERCISES: Exercise[] = [
  // Chest
  {
    id: 'ex-bench-press',
    name: 'Barbell Bench Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Arms'],
    equipment: 'Barbell',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Retract and depress shoulder blades into the bench with feet planted firmly.',
      'Grip slightly wider than shoulder width and unrack over mid-chest.',
      'Lower with control to the lower sternum, pause briefly, then press up and slightly back.',
    ],
    formCues: ['Arch upper back naturally', 'Tuck elbows ~45°', 'Drive heels into the floor'],
    commonMistakes: ['Flaring elbows 90°', 'Bouncing bar off chest', 'Lifting glutes off bench'],
    alternatives: ['ex-incline-db-press', 'ex-machine-chest-press'],
  },
  {
    id: 'ex-incline-db-press',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Arms'],
    equipment: 'Dumbbell',
    category: 'Compound',
    difficulty: 'Beginner',
    instructions: [
      'Set bench to a 30° incline to bias the clavicular (upper) chest.',
      'Lower dumbbells slowly alongside upper chest until elbows sit slightly below torso.',
      'Press smoothly back up without clanging weights together at lockout.',
    ],
    formCues: ['Keep wrists stacked over elbows', 'Control 2–3s eccentric'],
    commonMistakes: ['Bench angle too steep (>45°)', 'Half-rep bouncing at bottom'],
    alternatives: ['ex-bench-press', 'ex-machine-chest-press'],
  },
  {
    id: 'ex-cable-fly',
    name: 'Cable Chest Fly',
    muscleGroup: 'Chest',
    equipment: 'Cable',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Set pulleys at chest height, step forward into a staggered stance.',
      'Keep a soft bend in elbows and sweep hands together in an arc.',
    ],
    formCues: ['Lead with elbows', 'Squeeze pecs for 1s at midline'],
    commonMistakes: ['Turning fly into a press', 'Over-stretching shoulder capsule'],
    alternatives: ['ex-pushups', 'ex-incline-db-press'],
  },
  {
    id: 'ex-chest-dips',
    name: 'Weighted Chest Dips',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Arms', 'Shoulders'],
    equipment: 'Bodyweight',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Lean torso forward ~25° on parallel dip bars.',
      'Lower until upper arms are parallel to floor, then drive through palms.',
    ],
    formCues: ['Depress shoulders away from ears', 'Maintain forward lean'],
    commonMistakes: ['Shrugging shoulders upward', 'Going too deep with poor mobility'],
    alternatives: ['ex-bench-press', 'ex-cable-fly'],
  },
  {
    id: 'ex-machine-chest-press',
    name: 'Machine Chest Press',
    muscleGroup: 'Chest',
    equipment: 'Machine',
    category: 'Compound',
    difficulty: 'Beginner',
    instructions: [
      'Adjust seat so handles align with mid-chest.',
      'Press forward smoothly without letting shoulders roll off the pad.',
    ],
    formCues: ['Pin shoulder blades to seat pad', 'Control return'],
    commonMistakes: ['Seat too high', 'Locking elbows aggressively'],
    alternatives: ['ex-bench-press', 'ex-incline-db-press'],
  },
  {
    id: 'ex-pushups',
    name: 'Push-Ups',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Core', 'Arms'],
    equipment: 'Bodyweight',
    category: 'Bodyweight',
    difficulty: 'Beginner',
    instructions: [
      'Brace glutes and abs into a rigid plank, hands slightly wider than shoulders.',
      'Lower chest near floor with elbows ~45°, then push away.',
    ],
    formCues: ['Body moves as one unit', 'Full range of motion'],
    commonMistakes: ['Sagging hips', 'Flaring elbows out'],
    alternatives: ['ex-machine-chest-press', 'ex-cable-fly'],
  },

  // Back
  {
    id: 'ex-pullups',
    name: 'Pull-Ups',
    muscleGroup: 'Back',
    secondaryMuscles: ['Arms'],
    equipment: 'Bodyweight',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Hang from bar slightly wider than shoulders, engage lats first.',
      'Pull chest toward bar by driving elbows down to hips.',
    ],
    formCues: ['Initiate with scapular depression', 'Avoid kipping/swinging'],
    commonMistakes: ['Half reps without dead-hang stretch', 'Craning neck over bar'],
    alternatives: ['ex-lat-pulldown', 'ex-single-arm-db-row'],
  },
  {
    id: 'ex-lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroup: 'Back',
    secondaryMuscles: ['Arms'],
    equipment: 'Cable',
    category: 'Compound',
    difficulty: 'Beginner',
    instructions: [
      'Lock thighs snugly under pads and grip bar slightly wider than shoulders.',
      'Pull bar cleanly to upper chest while leaning back slightly (~15°).',
    ],
    formCues: ['Pull with elbows, not biceps', 'Full overhead stretch at top'],
    commonMistakes: ['Swinging torso backward for momentum', 'Pulling behind neck'],
    alternatives: ['ex-pullups', 'ex-seated-cable-row'],
  },
  {
    id: 'ex-barbell-row',
    name: 'Barbell Bent-Over Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Arms', 'Core'],
    equipment: 'Barbell',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Hinge hips back until torso is ~45°, keeping spine neutral.',
      'Row bar into lower ribs/upper belly, squeeze back, lower under control.',
    ],
    formCues: ['Brace core hard', 'Keep bar close to thighs'],
    commonMistakes: ['Rounding lower back', 'Standing too upright and shrugging'],
    alternatives: ['ex-seated-cable-row', 'ex-single-arm-db-row'],
  },
  {
    id: 'ex-seated-cable-row',
    name: 'Seated Cable Row',
    muscleGroup: 'Back',
    secondaryMuscles: ['Arms'],
    equipment: 'Cable',
    category: 'Compound',
    difficulty: 'Beginner',
    instructions: [
      'Sit tall with knees slightly bent and chest lifted.',
      'Pull handle toward navel, squeezing shoulder blades together.',
    ],
    formCues: ['Allow protraction at stretch', 'Avoid excessive torso rock'],
    commonMistakes: ['Using lower back swing', 'Elevating traps'],
    alternatives: ['ex-barbell-row', 'ex-single-arm-db-row'],
  },
  {
    id: 'ex-single-arm-db-row',
    name: 'Single-Arm Dumbbell Row',
    muscleGroup: 'Back',
    equipment: 'Dumbbell',
    category: 'Compound',
    difficulty: 'Beginner',
    instructions: [
      'Brace one hand on bench with flat back.',
      'Arc dumbbell back toward hip pocket rather than straight up to armpit.',
    ],
    formCues: ['Row to hip', 'Pause briefly at top'],
    commonMistakes: ['Rotating spine excessively', 'Shortening stretch'],
    alternatives: ['ex-seated-cable-row', 'ex-barbell-row'],
  },
  {
    id: 'ex-face-pull',
    name: 'Rope Face Pull',
    muscleGroup: 'Back',
    secondaryMuscles: ['Shoulders'],
    equipment: 'Cable',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Set rope at upper-chest/eye level.',
      'Pull rope apart toward forehead/ears with thumbs pointing back.',
    ],
    formCues: ['External rotation at finish', 'Light-moderate controlled weight'],
    commonMistakes: ['Using heavy weight and leaning back', 'Elbows dropping below wrists'],
    alternatives: ['ex-reverse-pec-deck'],
  },

  // Shoulders
  {
    id: 'ex-ohp',
    name: 'Barbell Overhead Press',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Arms', 'Core'],
    equipment: 'Barbell',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Grip bar just outside shoulders, squeeze glutes and abs.',
      'Press vertically past face and push head slightly through once bar clears.',
    ],
    formCues: ['Keep forearms vertical', 'Lock ribs down'],
    commonMistakes: ['Overarching lower back', 'Bar path drifting forward'],
    alternatives: ['ex-db-shoulder-press'],
  },
  {
    id: 'ex-db-shoulder-press',
    name: 'Seated Dumbbell Shoulder Press',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Arms'],
    equipment: 'Dumbbell',
    category: 'Compound',
    difficulty: 'Beginner',
    instructions: [
      'Set bench slightly reclined (~80°), bring elbows slightly forward in scapular plane.',
      'Press overhead smoothly without hyperextending lumbar spine.',
    ],
    formCues: ['Scapular plane (~30° forward)', 'Touch dumbbells softly above'],
    commonMistakes: ['Elbows flared straight out', 'Incomplete range of motion'],
    alternatives: ['ex-ohp'],
  },
  {
    id: 'ex-lateral-raise',
    name: 'Dumbbell Lateral Raise',
    muscleGroup: 'Shoulders',
    equipment: 'Dumbbell',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Stand tall with slight lean forward, raise arms out to sides slightly ahead of torso.',
      'Stop around shoulder height and lower slowly.',
    ],
    formCues: ['Push weights away toward walls', 'Relax upper traps'],
    commonMistakes: ['Swinging torso', 'Shrugging shoulders up'],
    alternatives: ['ex-cable-lateral-raise'],
  },
  {
    id: 'ex-cable-lateral-raise',
    name: 'Cable Lateral Raise',
    muscleGroup: 'Shoulders',
    equipment: 'Cable',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Set pulley to wrist height, cross cable behind or in front of body.',
      'Sweep arm outward smoothly with constant cable tension.',
    ],
    formCues: ['Smooth tempo', 'Keep wrist neutral'],
    commonMistakes: ['Going too heavy', 'Jerking out of bottom'],
    alternatives: ['ex-lateral-raise'],
  },
  {
    id: 'ex-reverse-pec-deck',
    name: 'Reverse Pec Deck Fly',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back'],
    equipment: 'Machine',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Sit facing pad with arms extended at shoulder height.',
      'Sweep arms outward using rear delts without slamming shoulder blades.',
    ],
    formCues: ['Reach wide', 'Pause 1s at peak contraction'],
    commonMistakes: ['Hyperextending back', 'Bending elbows too much'],
    alternatives: ['ex-face-pull'],
  },

  // Legs
  {
    id: 'ex-squat',
    name: 'Barbell Back Squat',
    muscleGroup: 'Legs',
    secondaryMuscles: ['Core'],
    equipment: 'Barbell',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Set bar comfortably across upper traps, brace 360° around waist.',
      'Break knees and hips together to parallel or below, then drive up evenly.',
    ],
    formCues: ['Knees track over toes', 'Keep mid-foot pressure'],
    commonMistakes: ['Heels lifting', 'Knees caving inward (valgus)', 'Cutting depth short'],
    alternatives: ['ex-leg-press', 'ex-bulgarian-split-squat'],
  },
  {
    id: 'ex-rdl',
    name: 'Romanian Deadlift (RDL)',
    muscleGroup: 'Legs',
    secondaryMuscles: ['Back'],
    equipment: 'Barbell',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Hold bar at thighs with soft knee bend and lats engaged.',
      'Push hips straight back until hamstrings reach full stretch (mid-shin), then drive hips through.',
    ],
    formCues: ['Bar shaves thighs/shins', 'Stop hinge when hips stop moving back'],
    commonMistakes: ['Rounding lumbar spine', 'Turning into a squat'],
    alternatives: ['ex-leg-curl'],
  },
  {
    id: 'ex-leg-press',
    name: '45° Leg Press',
    muscleGroup: 'Legs',
    equipment: 'Machine',
    category: 'Compound',
    difficulty: 'Beginner',
    instructions: [
      'Place feet shoulder-width on sled, keep lower back glued to pad.',
      'Lower sled deep without pelvis curling off pad, press smoothly.',
    ],
    formCues: ['Keep glutes pinned to seat', 'Avoid locking knees hard'],
    commonMistakes: ['Lower back lifting off pad', 'Shallow quarter reps'],
    alternatives: ['ex-squat', 'ex-bulgarian-split-squat'],
  },
  {
    id: 'ex-bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    muscleGroup: 'Legs',
    equipment: 'Dumbbell',
    category: 'Compound',
    difficulty: 'Intermediate',
    instructions: [
      'Rest rear laces on bench, take comfortable forward stride.',
      'Drop back knee toward floor with controlled torso lean, drive through front foot.',
    ],
    formCues: ['Front foot stays flat', 'Smooth vertical descent'],
    commonMistakes: ['Standing on a tightrope (narrow stance)', 'Pushing mainly off rear foot'],
    alternatives: ['ex-leg-press', 'ex-squat'],
  },
  {
    id: 'ex-leg-extension',
    name: 'Leg Extension',
    muscleGroup: 'Legs',
    equipment: 'Machine',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Align knee joint with machine pivot, pad resting above ankles.',
      'Extend legs smoothly, pause at top, lower over 2 seconds.',
    ],
    formCues: ['Grip side handles tightly', 'Squeeze quads at top'],
    commonMistakes: ['Swinging weights upward', 'Dropping stack fast'],
    alternatives: ['ex-bulgarian-split-squat'],
  },
  {
    id: 'ex-leg-curl',
    name: 'Seated / Lying Leg Curl',
    muscleGroup: 'Legs',
    equipment: 'Machine',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Align knees with pivot, secure thigh pad.',
      'Curl heels under control and resist the return.',
    ],
    formCues: ['Keep hips pinned', 'Full knee extension at start'],
    commonMistakes: ['Hips lifting off bench', 'Partial range'],
    alternatives: ['ex-rdl'],
  },
  {
    id: 'ex-standing-calf-raise',
    name: 'Standing Calf Raise',
    muscleGroup: 'Legs',
    equipment: 'Machine',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Balls of feet on step, drop heels for a 2-second stretch at bottom.',
      'Rise high onto big toes and hold 1 second at top.',
    ],
    formCues: ['Pause at bottom to kill bounce', 'Full ankle flexion'],
    commonMistakes: ['Bouncing rapidly using Achilles tendon'],
    alternatives: [],
  },

  // Arms
  {
    id: 'ex-barbell-curl',
    name: 'EZ-Bar / Barbell Curl',
    muscleGroup: 'Arms',
    equipment: 'Barbell',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Pin elbows lightly at sides, curl bar without swinging hips.',
      'Lower to full arm extension on every rep.',
    ],
    formCues: ['Elbows stay quiet', 'Control eccentric'],
    commonMistakes: ['Leaning back with momentum', 'Elbows drifting far forward early'],
    alternatives: ['ex-incline-db-curl', 'ex-hammer-curl'],
  },
  {
    id: 'ex-incline-db-curl',
    name: 'Incline Dumbbell Curl',
    muscleGroup: 'Arms',
    equipment: 'Dumbbell',
    category: 'Isolation',
    difficulty: 'Intermediate',
    instructions: [
      'Sit on 45–60° incline bench letting arms hang straight behind torso.',
      'Curl while keeping upper arms perpendicular to floor.',
    ],
    formCues: ['Deep biceps stretch at bottom', 'Supinate pinkies up'],
    commonMistakes: ['Bringing elbows forward', 'Using excessive weight'],
    alternatives: ['ex-barbell-curl', 'ex-hammer-curl'],
  },
  {
    id: 'ex-hammer-curl',
    name: 'Hammer Curl',
    muscleGroup: 'Arms',
    equipment: 'Dumbbell',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Hold dumbbells with neutral palms-facing-in grip.',
      'Curl cleanly toward shoulders targeting brachialis & forearms.',
    ],
    formCues: ['Neutral wrist', 'Steady torso'],
    commonMistakes: ['Swinging weights'],
    alternatives: ['ex-barbell-curl'],
  },
  {
    id: 'ex-tricep-pushdown',
    name: 'Cable Tricep Pushdown',
    muscleGroup: 'Arms',
    equipment: 'Cable',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Pin elbows by ribcage and hinge very slightly forward.',
      'Extend forearms completely down and squeeze triceps.',
    ],
    formCues: ['Only forearms move', 'Full lockout'],
    commonMistakes: ['Elbows flaring outward', 'Leaning body over bar'],
    alternatives: ['ex-overhead-tricep-ext', 'ex-skullcrusher'],
  },
  {
    id: 'ex-overhead-tricep-ext',
    name: 'Overhead Cable Tricep Extension',
    muscleGroup: 'Arms',
    equipment: 'Cable',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Face away from cable stack holding rope overhead.',
      'Allow elbows to bend deeply behind head, then extend smoothly.',
    ],
    formCues: ['Loaded long-head stretch', 'Keep elbows pointing forward'],
    commonMistakes: ['Overarching lower back'],
    alternatives: ['ex-tricep-pushdown', 'ex-skullcrusher'],
  },
  {
    id: 'ex-skullcrusher',
    name: 'EZ-Bar Skullcrushers',
    muscleGroup: 'Arms',
    equipment: 'Barbell',
    category: 'Isolation',
    difficulty: 'Intermediate',
    instructions: [
      'Lie on flat bench, angle arms slightly back behind vertical.',
      'Lower bar behind forehead, then extend cleanly.',
    ],
    formCues: ['Slight backward arm angle keeps tension', 'Controlled tempo'],
    commonMistakes: ['Elbows flaring wide'],
    alternatives: ['ex-overhead-tricep-ext', 'ex-tricep-pushdown'],
  },

  // Core
  {
    id: 'ex-hanging-leg-raise',
    name: 'Hanging Leg Raise',
    muscleGroup: 'Core',
    equipment: 'Bodyweight',
    category: 'Bodyweight',
    difficulty: 'Intermediate',
    instructions: [
      'Hang from pull-up bar and posterior-tilt pelvis (curl tailbone up) as legs rise.',
    ],
    formCues: ['Curl pelvis, not just hip flexors', 'Control descent without swinging'],
    commonMistakes: ['Swinging legs with momentum'],
    alternatives: ['ex-cable-crunch', 'ex-ab-wheel'],
  },
  {
    id: 'ex-cable-crunch',
    name: 'Kneeling Cable Crunch',
    muscleGroup: 'Core',
    equipment: 'Cable',
    category: 'Isolation',
    difficulty: 'Beginner',
    instructions: [
      'Hold rope near temples, keep hips fixed over knees.',
      'Flex spine by curling ribs down toward pelvis.',
    ],
    formCues: ['Round thoracic spine', 'Hips stay still'],
    commonMistakes: ['Sitting back onto heels instead of spinal flexion'],
    alternatives: ['ex-hanging-leg-raise', 'ex-ab-wheel'],
  },
  {
    id: 'ex-plank',
    name: 'Weighted Plank (sec)',
    muscleGroup: 'Core',
    equipment: 'Bodyweight',
    category: 'Bodyweight',
    difficulty: 'Beginner',
    instructions: [
      'Forearms under shoulders, squeeze glutes and pull ribs down.',
    ],
    formCues: ['Breathe behind braced abs', 'Straight line head to heels'],
    commonMistakes: ['Lower back sagging', 'Piking hips high'],
    alternatives: ['ex-ab-wheel'],
  },
  {
    id: 'ex-ab-wheel',
    name: 'Ab Wheel Rollout',
    muscleGroup: 'Core',
    equipment: 'Bodyweight',
    category: 'Bodyweight',
    difficulty: 'Advanced',
    instructions: [
      'Kneel on mat, tuck pelvis slightly, roll wheel forward without lumbar arch.',
      'Pull back using abs rather than sitting back into hips.',
    ],
    formCues: ['Posterior pelvic tilt', 'Only roll as far as core holds neutral'],
    commonMistakes: ['Hyperextending lower back'],
    alternatives: ['ex-hanging-leg-raise', 'ex-cable-crunch'],
  },
];

export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'routine-push',
    name: 'Push Day (Chest / Shoulders / Tri)',
    dayLabel: 'Push',
    programType: 'push',
    scheduledWeekdays: [1, 4], // Mon, Thu
    accentColor: '#B7F36B',
    items: [
      { exerciseId: 'ex-bench-press', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-incline-db-press', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-db-shoulder-press', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-lateral-raise', defaultSets: 3, restSeconds: 60 },
      { exerciseId: 'ex-tricep-pushdown', defaultSets: 3, restSeconds: 60 },
    ],
  },
  {
    id: 'routine-pull',
    name: 'Pull Day (Back / Rear Delt / Bi)',
    dayLabel: 'Pull',
    programType: 'pull',
    scheduledWeekdays: [2, 5], // Tue, Fri
    accentColor: '#79B8F5',
    items: [
      { exerciseId: 'ex-lat-pulldown', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-barbell-row', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-seated-cable-row', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-face-pull', defaultSets: 3, restSeconds: 60 },
      { exerciseId: 'ex-incline-db-curl', defaultSets: 3, restSeconds: 60 },
    ],
  },
  {
    id: 'routine-legs',
    name: 'Legs & Core (Quad / Ham / Calves)',
    dayLabel: 'Legs',
    programType: 'legs',
    scheduledWeekdays: [3, 6], // Wed, Sat
    accentColor: '#EAB765',
    items: [
      { exerciseId: 'ex-squat', defaultSets: 3, restSeconds: 180 },
      { exerciseId: 'ex-rdl', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-leg-press', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-leg-curl', defaultSets: 3, restSeconds: 60 },
      { exerciseId: 'ex-hanging-leg-raise', defaultSets: 3, restSeconds: 60 },
    ],
  },
  {
    id: 'routine-upper',
    name: 'Upper Body Power',
    dayLabel: 'Upper',
    programType: 'upper',
    scheduledWeekdays: [],
    accentColor: '#75D69A',
    items: [
      { exerciseId: 'ex-ohp', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-pullups', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-incline-db-press', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-single-arm-db-row', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-hammer-curl', defaultSets: 3, restSeconds: 60 },
    ],
  },
  {
    id: 'routine-lower',
    name: 'Lower Body Hypertrophy',
    dayLabel: 'Lower',
    programType: 'lower',
    scheduledWeekdays: [],
    accentColor: '#79B8F5',
    items: [
      { exerciseId: 'ex-leg-press', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-rdl', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-bulgarian-split-squat', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-leg-extension', defaultSets: 3, restSeconds: 60 },
      { exerciseId: 'ex-standing-calf-raise', defaultSets: 3, restSeconds: 60 },
    ],
  },
  {
    id: 'routine-full',
    name: 'Full Body Express',
    dayLabel: 'Full Body',
    programType: 'full_body',
    scheduledWeekdays: [],
    accentColor: '#B7F36B',
    items: [
      { exerciseId: 'ex-squat', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-bench-press', defaultSets: 3, restSeconds: 120 },
      { exerciseId: 'ex-barbell-row', defaultSets: 3, restSeconds: 90 },
      { exerciseId: 'ex-lateral-raise', defaultSets: 3, restSeconds: 60 },
      { exerciseId: 'ex-cable-crunch', defaultSets: 3, restSeconds: 60 },
    ],
  },
];

export function createDefaultProfile(): UserProfile {
  const targets = calculateMacroTargets({
    sex: 'male',
    age: 26,
    heightCm: 176,
    weightKg: 74.5,
    activityLevel: 'moderate',
    goal: 'lean_bulk',
  });

  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Athlete',
    sex: 'male',
    age: 26,
    heightCm: 176,
    weightKg: 74.5,
    goalWeightKg: 77.0,
    activityLevel: 'moderate',
    goal: 'lean_bulk',
    weeklyRateKg: 0.25,
    experienceLevel: 'intermediate',
    dietType: 'bengali_indian',
    preferredWorkoutSplit: 'push_pull_legs',
    onboardingCompleted: true,
    unitSystem: 'metric',
    calorieTarget: targets.calorieTarget,
    proteinTarget: targets.proteinTarget,
    carbsTarget: targets.carbsTarget,
    fatsTarget: targets.fatsTarget,
    fiberTarget: targets.fiberTarget,
    waterGoalMl: 3000,
    stepsGoal: 8500,
    sleepGoalHours: 7.5,
    defaultRestSeconds: 90,
    trainingDaysPerWeek: 5,
    preferredSplit: 'push',
    equipmentAvailable: ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight'],
    dashboardWidgets: [
      'today_workout',
      'nutrition_summary',
      'hydration',
      'steps_sleep',
      'weight_energy',
      'weekly_activity',
      'recent_prs',
    ],
    restSoundEnabled: true,
    restVibrateEnabled: true,
    privacyBlurPhotos: false,
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
    geminiApiKey: '',
    sampleDataSeeded: true,
  };
}

function buildSampleSessions(todayKey: string): WorkoutSession[] {
  const exMap = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

  const mkSession = (
    id: string,
    daysAgo: number,
    routineId: string,
    routineName: string,
    durationSeconds: number,
    exerciseBlocks: Array<{
      exerciseId: string;
      restSeconds: number;
      sets: Array<{ weightKg: number; reps: number; rpe?: number; setType?: 'warmup' | 'working' }>;
    }>
  ): WorkoutSession => {
    const dateKey = offsetDateKey(todayKey, -daysAgo);
    const start = `${dateKey}T18:15:00`;
    const end = new Date(new Date(start).getTime() + durationSeconds * 1000).toISOString();

    const exercises = exerciseBlocks.map((b) => {
      const ex = exMap.get(b.exerciseId)!;
      return {
        exerciseId: ex.id,
        exerciseName: ex.name,
        muscleGroup: ex.muscleGroup,
        restSeconds: b.restSeconds,
        sets: b.sets.map((s, idx) => ({
          id: `${id}-${ex.id}-${idx + 1}`,
          weightKg: s.weightKg,
          reps: s.reps,
          rpe: s.rpe ?? 8,
          setType: s.setType ?? 'working',
          completed: true,
        })),
      };
    });

    return {
      id,
      routineId,
      routineName,
      startedAt: start,
      endedAt: end,
      durationSeconds,
      totalVolumeKg: calculateSessionVolume({ exercises }),
      exercises,
    };
  };

  const rawSessions: WorkoutSession[] = [
    mkSession('sess-1', 13, 'routine-push', 'Push Day (Chest / Shoulders / Tri)', 3180, [
      {
        exerciseId: 'ex-bench-press',
        restSeconds: 120,
        sets: [
          { weightKg: 40, reps: 10, rpe: 6, setType: 'warmup' },
          { weightKg: 70, reps: 8, rpe: 8 },
          { weightKg: 70, reps: 8, rpe: 8.5 },
          { weightKg: 70, reps: 7, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-incline-db-press',
        restSeconds: 90,
        sets: [
          { weightKg: 24, reps: 10, rpe: 8 },
          { weightKg: 24, reps: 10, rpe: 8.5 },
          { weightKg: 24, reps: 9, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-db-shoulder-press',
        restSeconds: 90,
        sets: [
          { weightKg: 20, reps: 10, rpe: 8 },
          { weightKg: 20, reps: 9, rpe: 8.5 },
          { weightKg: 20, reps: 9, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-lateral-raise',
        restSeconds: 60,
        sets: [
          { weightKg: 10, reps: 15, rpe: 8 },
          { weightKg: 10, reps: 14, rpe: 8.5 },
          { weightKg: 10, reps: 13, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-tricep-pushdown',
        restSeconds: 60,
        sets: [
          { weightKg: 25, reps: 12, rpe: 8 },
          { weightKg: 25, reps: 12, rpe: 8.5 },
          { weightKg: 25, reps: 11, rpe: 9 },
        ],
      },
    ]),
    mkSession('sess-2', 12, 'routine-pull', 'Pull Day (Back / Rear Delt / Bi)', 3040, [
      {
        exerciseId: 'ex-lat-pulldown',
        restSeconds: 90,
        sets: [
          { weightKg: 55, reps: 10, rpe: 8 },
          { weightKg: 55, reps: 10, rpe: 8.5 },
          { weightKg: 55, reps: 9, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-barbell-row',
        restSeconds: 120,
        sets: [
          { weightKg: 65, reps: 8, rpe: 8 },
          { weightKg: 65, reps: 8, rpe: 8.5 },
          { weightKg: 65, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-seated-cable-row',
        restSeconds: 90,
        sets: [
          { weightKg: 50, reps: 12, rpe: 8 },
          { weightKg: 50, reps: 11, rpe: 8.5 },
          { weightKg: 50, reps: 10, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-face-pull',
        restSeconds: 60,
        sets: [
          { weightKg: 18, reps: 15, rpe: 8 },
          { weightKg: 18, reps: 15, rpe: 8 },
          { weightKg: 18, reps: 14, rpe: 8.5 },
        ],
      },
      {
        exerciseId: 'ex-incline-db-curl',
        restSeconds: 60,
        sets: [
          { weightKg: 12.5, reps: 12, rpe: 8 },
          { weightKg: 12.5, reps: 11, rpe: 8.5 },
          { weightKg: 12.5, reps: 10, rpe: 9 },
        ],
      },
    ]),
    mkSession('sess-3', 10, 'routine-legs', 'Legs & Core (Quad / Ham / Calves)', 3420, [
      {
        exerciseId: 'ex-squat',
        restSeconds: 180,
        sets: [
          { weightKg: 60, reps: 8, rpe: 6, setType: 'warmup' },
          { weightKg: 90, reps: 6, rpe: 8 },
          { weightKg: 90, reps: 6, rpe: 8.5 },
          { weightKg: 90, reps: 6, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-rdl',
        restSeconds: 120,
        sets: [
          { weightKg: 80, reps: 8, rpe: 8 },
          { weightKg: 80, reps: 8, rpe: 8.5 },
          { weightKg: 80, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-leg-press',
        restSeconds: 90,
        sets: [
          { weightKg: 140, reps: 12, rpe: 8 },
          { weightKg: 140, reps: 12, rpe: 8.5 },
          { weightKg: 140, reps: 11, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-leg-curl',
        restSeconds: 60,
        sets: [
          { weightKg: 45, reps: 12, rpe: 8 },
          { weightKg: 45, reps: 12, rpe: 8.5 },
          { weightKg: 45, reps: 11, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-hanging-leg-raise',
        restSeconds: 60,
        sets: [
          { weightKg: 0, reps: 12, rpe: 8 },
          { weightKg: 0, reps: 12, rpe: 8.5 },
          { weightKg: 0, reps: 10, rpe: 9 },
        ],
      },
    ]),
    mkSession('sess-4', 8, 'routine-push', 'Push Day (Chest / Shoulders / Tri)', 3250, [
      {
        exerciseId: 'ex-bench-press',
        restSeconds: 120,
        sets: [
          { weightKg: 45, reps: 8, rpe: 6, setType: 'warmup' },
          { weightKg: 72.5, reps: 8, rpe: 8 },
          { weightKg: 72.5, reps: 8, rpe: 8.5 },
          { weightKg: 72.5, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-incline-db-press',
        restSeconds: 90,
        sets: [
          { weightKg: 26, reps: 10, rpe: 8 },
          { weightKg: 26, reps: 9, rpe: 8.5 },
          { weightKg: 26, reps: 9, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-db-shoulder-press',
        restSeconds: 90,
        sets: [
          { weightKg: 22, reps: 9, rpe: 8 },
          { weightKg: 22, reps: 9, rpe: 8.5 },
          { weightKg: 22, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-lateral-raise',
        restSeconds: 60,
        sets: [
          { weightKg: 10, reps: 16, rpe: 8 },
          { weightKg: 10, reps: 15, rpe: 8.5 },
          { weightKg: 10, reps: 15, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-tricep-pushdown',
        restSeconds: 60,
        sets: [
          { weightKg: 27.5, reps: 12, rpe: 8 },
          { weightKg: 27.5, reps: 11, rpe: 8.5 },
          { weightKg: 27.5, reps: 10, rpe: 9 },
        ],
      },
    ]),
    mkSession('sess-5', 6, 'routine-pull', 'Pull Day (Back / Rear Delt / Bi)', 3100, [
      {
        exerciseId: 'ex-lat-pulldown',
        restSeconds: 90,
        sets: [
          { weightKg: 60, reps: 10, rpe: 8 },
          { weightKg: 60, reps: 10, rpe: 8.5 },
          { weightKg: 60, reps: 9, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-barbell-row',
        restSeconds: 120,
        sets: [
          { weightKg: 67.5, reps: 8, rpe: 8 },
          { weightKg: 67.5, reps: 8, rpe: 8.5 },
          { weightKg: 67.5, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-seated-cable-row',
        restSeconds: 90,
        sets: [
          { weightKg: 55, reps: 12, rpe: 8 },
          { weightKg: 55, reps: 11, rpe: 8.5 },
          { weightKg: 55, reps: 10, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-face-pull',
        restSeconds: 60,
        sets: [
          { weightKg: 20, reps: 15, rpe: 8 },
          { weightKg: 20, reps: 15, rpe: 8.5 },
          { weightKg: 20, reps: 15, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-incline-db-curl',
        restSeconds: 60,
        sets: [
          { weightKg: 14, reps: 11, rpe: 8 },
          { weightKg: 14, reps: 10, rpe: 8.5 },
          { weightKg: 14, reps: 10, rpe: 9 },
        ],
      },
    ]),
    mkSession('sess-6', 4, 'routine-legs', 'Legs & Core (Quad / Ham / Calves)', 3490, [
      {
        exerciseId: 'ex-squat',
        restSeconds: 180,
        sets: [
          { weightKg: 60, reps: 8, rpe: 6, setType: 'warmup' },
          { weightKg: 95, reps: 6, rpe: 8 },
          { weightKg: 95, reps: 6, rpe: 8.5 },
          { weightKg: 95, reps: 6, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-rdl',
        restSeconds: 120,
        sets: [
          { weightKg: 85, reps: 8, rpe: 8 },
          { weightKg: 85, reps: 8, rpe: 8.5 },
          { weightKg: 85, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-leg-press',
        restSeconds: 90,
        sets: [
          { weightKg: 150, reps: 12, rpe: 8 },
          { weightKg: 150, reps: 12, rpe: 8.5 },
          { weightKg: 150, reps: 12, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-leg-curl',
        restSeconds: 60,
        sets: [
          { weightKg: 47.5, reps: 12, rpe: 8 },
          { weightKg: 47.5, reps: 12, rpe: 8.5 },
          { weightKg: 47.5, reps: 11, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-hanging-leg-raise',
        restSeconds: 60,
        sets: [
          { weightKg: 0, reps: 14, rpe: 8 },
          { weightKg: 0, reps: 12, rpe: 8.5 },
          { weightKg: 0, reps: 12, rpe: 9 },
        ],
      },
    ]),
    mkSession('sess-7', 2, 'routine-push', 'Push Day (Chest / Shoulders / Tri)', 3310, [
      {
        exerciseId: 'ex-bench-press',
        restSeconds: 120,
        sets: [
          { weightKg: 50, reps: 8, rpe: 6, setType: 'warmup' },
          { weightKg: 75, reps: 8, rpe: 8.5 },
          { weightKg: 75, reps: 8, rpe: 9 },
          { weightKg: 77.5, reps: 6, rpe: 9.5 },
        ],
      },
      {
        exerciseId: 'ex-incline-db-press',
        restSeconds: 90,
        sets: [
          { weightKg: 28, reps: 10, rpe: 8.5 },
          { weightKg: 28, reps: 9, rpe: 9 },
          { weightKg: 28, reps: 8, rpe: 9.5 },
        ],
      },
      {
        exerciseId: 'ex-db-shoulder-press',
        restSeconds: 90,
        sets: [
          { weightKg: 22, reps: 10, rpe: 8 },
          { weightKg: 22, reps: 10, rpe: 8.5 },
          { weightKg: 24, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-lateral-raise',
        restSeconds: 60,
        sets: [
          { weightKg: 12.5, reps: 14, rpe: 8.5 },
          { weightKg: 12.5, reps: 13, rpe: 9 },
          { weightKg: 12.5, reps: 12, rpe: 9.5 },
        ],
      },
      {
        exerciseId: 'ex-tricep-pushdown',
        restSeconds: 60,
        sets: [
          { weightKg: 30, reps: 12, rpe: 8.5 },
          { weightKg: 30, reps: 12, rpe: 9 },
          { weightKg: 30, reps: 11, rpe: 9.5 },
        ],
      },
    ]),
    mkSession('sess-8', 1, 'routine-pull', 'Pull Day (Back / Rear Delt / Bi)', 3140, [
      {
        exerciseId: 'ex-lat-pulldown',
        restSeconds: 90,
        sets: [
          { weightKg: 62.5, reps: 10, rpe: 8 },
          { weightKg: 62.5, reps: 10, rpe: 8.5 },
          { weightKg: 65, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-barbell-row',
        restSeconds: 120,
        sets: [
          { weightKg: 70, reps: 8, rpe: 8.5 },
          { weightKg: 70, reps: 8, rpe: 9 },
          { weightKg: 70, reps: 8, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-seated-cable-row',
        restSeconds: 90,
        sets: [
          { weightKg: 57.5, reps: 12, rpe: 8 },
          { weightKg: 57.5, reps: 12, rpe: 8.5 },
          { weightKg: 60, reps: 10, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-face-pull',
        restSeconds: 60,
        sets: [
          { weightKg: 22.5, reps: 15, rpe: 8 },
          { weightKg: 22.5, reps: 15, rpe: 8.5 },
          { weightKg: 22.5, reps: 14, rpe: 9 },
        ],
      },
      {
        exerciseId: 'ex-incline-db-curl',
        restSeconds: 60,
        sets: [
          { weightKg: 15, reps: 11, rpe: 8.5 },
          { weightKg: 15, reps: 10, rpe: 9 },
          { weightKg: 15, reps: 9, rpe: 9.5 },
        ],
      },
    ]),
  ];

  const stamped: WorkoutSession[] = [];
  for (const s of rawSessions) {
    stamped.push(stampPersonalRecords(s, stamped));
  }
  return stamped;
}

function buildSampleNutritionAndHealth(todayKey: string): {
  foodLogs: FoodLogEntry[];
  waterLogs: WaterLogEntry[];
  weightLogs: WeightLogEntry[];
  measurements: BodyMeasurementEntry[];
  recoveryLogs: RecoveryLogEntry[];
  savedMeals: SavedMeal[];
} {
  const foodLogs: FoodLogEntry[] = [];
  const waterLogs: WaterLogEntry[] = [];
  const weightLogs: WeightLogEntry[] = [];
  const recoveryLogs: RecoveryLogEntry[] = [];

  const weightCurve = [74.0, 74.1, 73.9, 74.2, 74.1, 74.3, 74.2, 74.4, 74.3, 74.5, 74.4, 74.5, 74.6, 74.5];

  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const dateKey = offsetDateKey(todayKey, -daysAgo);
    const idx = 13 - daysAgo;

    weightLogs.push({
      id: `wt-${dateKey}`,
      date: dateKey,
      weightKg: weightCurve[idx] ?? 74.5,
      note: daysAgo === 0 ? 'Morning fasted weigh-in' : undefined,
    });

    recoveryLogs.push({
      id: `rec-${dateKey}`,
      date: dateKey,
      sleepHours: Number((6.9 + ((idx * 3) % 5) * 0.25).toFixed(1)),
      sleepQuality: 3 + (idx % 3),
      steps: 7200 + (idx % 4) * 950,
      activeMinutes: idx % 2 === 0 ? 65 : 40,
      fatigue: 2 + (idx % 2),
      soreness: 2 + (idx % 3),
      stress: 2,
      mood: 4,
      habits: {
        creatine: true,
        electrolytes: idx % 2 === 0,
        mobility: idx % 3 === 0,
        sunlight: true,
      },
    });

    if (daysAgo === 0) {
      waterLogs.push(
        { id: `w-${dateKey}-1`, date: dateKey, amountMl: 500, createdAt: `${dateKey}T07:45:00` },
        { id: `w-${dateKey}-2`, date: dateKey, amountMl: 500, createdAt: `${dateKey}T11:30:00` },
        { id: `w-${dateKey}-3`, date: dateKey, amountMl: 250, createdAt: `${dateKey}T14:15:00` }
      );
    } else {
      waterLogs.push(
        { id: `w-${dateKey}-1`, date: dateKey, amountMl: 1000, createdAt: `${dateKey}T09:00:00` },
        { id: `w-${dateKey}-2`, date: dateKey, amountMl: 1000, createdAt: `${dateKey}T15:00:00` },
        { id: `w-${dateKey}-3`, date: dateKey, amountMl: 750 + (idx % 2) * 250, createdAt: `${dateKey}T20:00:00` }
      );
    }

    const variance = (idx % 3) - 1;
    foodLogs.push(
      {
        id: `f-${dateKey}-bf1`,
        date: dateKey,
        mealSlot: 'breakfast',
        name: 'Rolled Oats + Whey Protein',
        servingSize: '60g oats + 1 scoop whey',
        calories: 350,
        protein: 33,
        carbs: 42,
        fats: 5.5,
        fiber: 6.5,
        source: 'offline',
        createdAt: `${dateKey}T08:15:00`,
      },
      {
        id: `f-${dateKey}-bf2`,
        date: dateKey,
        mealSlot: 'breakfast',
        name: 'Whole Boiled Eggs',
        servingSize: '3 pieces',
        calories: 216,
        protein: 18.9,
        carbs: 1.2,
        fats: 15,
        fiber: 0,
        source: 'offline',
        createdAt: `${dateKey}T08:16:00`,
      },
      {
        id: `f-${dateKey}-ln1`,
        date: dateKey,
        mealSlot: 'lunch',
        name: idx % 2 === 0 ? 'Grilled Chicken Breast' : 'Bengali Rohu Machher Jhol',
        servingSize: idx % 2 === 0 ? `${180 + variance * 20}g` : '1 bowl (220g)',
        calories: idx % 2 === 0 ? 297 + variance * 33 : 245,
        protein: idx % 2 === 0 ? 55.8 + variance * 6.2 : 24,
        carbs: idx % 2 === 0 ? 0 : 8,
        fats: idx % 2 === 0 ? 6.5 + variance * 0.7 : 12.5,
        fiber: idx % 2 === 0 ? 0 : 1.4,
        source: 'offline',
        createdAt: `${dateKey}T13:20:00`,
      },
      {
        id: `f-${dateKey}-ln2`,
        date: dateKey,
        mealSlot: 'lunch',
        name: 'Steamed Basmati Rice + Masoor Dal',
        servingSize: '1.5 cup rice + 1 bowl dal',
        calories: 482,
        protein: 18,
        carbs: 92.8,
        fats: 3.1,
        fiber: 6.7,
        source: 'offline',
        createdAt: `${dateKey}T13:22:00`,
      },
      {
        id: `f-${dateKey}-sn1`,
        date: dateKey,
        mealSlot: 'snacks',
        name: 'Banana + Whey Shake',
        servingSize: '1 piece + 1 scoop',
        calories: 227,
        protein: 26.3,
        carbs: 29.5,
        fats: 1.9,
        fiber: 3.6,
        source: 'offline',
        createdAt: `${dateKey}T17:30:00`,
      }
    );

    if (daysAgo > 0) {
      foodLogs.push(
        {
          id: `f-${dateKey}-dn1`,
          date: dateKey,
          mealSlot: 'dinner',
          name: idx % 2 === 0 ? 'Grilled Paneer Bhurji' : 'Soya Chunks Masala',
          servingSize: idx % 2 === 0 ? '150g paneer' : '60g dry soya',
          calories: idx % 2 === 0 ? 398 : 206,
          protein: idx % 2 === 0 ? 27 : 31.2,
          carbs: idx % 2 === 0 ? 5.2 : 19.8,
          fats: idx % 2 === 0 ? 30 : 0.4,
          fiber: idx % 2 === 0 ? 0 : 7.8,
          source: 'offline',
          createdAt: `${dateKey}T21:00:00`,
        },
        {
          id: `f-${dateKey}-dn2`,
          date: dateKey,
          mealSlot: 'dinner',
          name: 'Whole Wheat Roti + Tok Doi',
          servingSize: '2 rotis + 1 cup curd',
          calories: 308,
          protein: 12.5,
          carbs: 47.5,
          fats: 7.4,
          fiber: 5.6,
          source: 'offline',
          createdAt: `${dateKey}T21:02:00`,
        }
      );
    }
  }

  const measurements: BodyMeasurementEntry[] = [
    {
      id: `meas-${offsetDateKey(todayKey, -14)}`,
      date: offsetDateKey(todayKey, -14),
      chestCm: 101.5,
      waistCm: 79.8,
      shouldersCm: 118.0,
      armsCm: 37.2,
      forearmsCm: 29.5,
      hipsCm: 95.0,
      thighsCm: 57.5,
      calvesCm: 37.0,
      neckCm: 38.2,
    },
    {
      id: `meas-${todayKey}`,
      date: todayKey,
      chestCm: 102.2,
      waistCm: 79.4,
      shouldersCm: 118.8,
      armsCm: 37.6,
      forearmsCm: 29.8,
      hipsCm: 95.2,
      thighsCm: 58.1,
      calvesCm: 37.2,
      neckCm: 38.2,
    },
  ];

  const savedMeals: SavedMeal[] = [
    {
      id: 'meal-proats',
      name: 'Morning High-Protein Oats Bowl',
      isRecipe: true,
      servingsYield: 1,
      items: [
        { name: 'Rolled Oats (Dry)', servingSize: '60g', calories: 228, protein: 8.2, carbs: 40.2, fats: 4.1, fiber: 6.1 },
        { name: 'Whey Protein Isolate', servingSize: '1 scoop (32g)', calories: 122, protein: 25, carbs: 2.5, fats: 1.5, fiber: 0.5 },
        { name: 'Banana (Medium)', servingSize: '1 piece', calories: 105, protein: 1.3, carbs: 27, fats: 0.4, fiber: 3.1 },
      ],
      totalCalories: 455,
      totalProtein: 34.5,
      totalCarbs: 69.7,
      totalFats: 6,
      totalFiber: 9.7,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'meal-bengali-lunch',
      name: 'Bengali Fish & Rice High-Protein Lunch',
      isRecipe: false,
      servingsYield: 1,
      items: [
        { name: 'Bengali Rohu Machher Jhol', servingSize: '1 bowl', calories: 245, protein: 24, carbs: 8, fats: 12.5, fiber: 1.4 },
        { name: 'Bengali Masoor Dal', servingSize: '1 bowl', calories: 175, protein: 11.5, carbs: 26, fats: 2.5, fiber: 5.8 },
        { name: 'Steamed Basmati Rice (Bhat)', servingSize: '1 cup', calories: 205, protein: 4.3, carbs: 44.5, fats: 0.4, fiber: 0.6 },
      ],
      totalCalories: 625,
      totalProtein: 39.8,
      totalCarbs: 78.5,
      totalFats: 15.4,
      totalFiber: 7.8,
      createdAt: new Date().toISOString(),
    },
  ];

  return { foodLogs, waterLogs, weightLogs, measurements, recoveryLogs, savedMeals };
}

export function generateStarterRoutinesForSplit(
  split: PreferredSplit,
  trainingDaysPerWeek: number
): Routine[] {
  if (split === 'upper_lower') {
    const upper = DEFAULT_ROUTINES.find((r) => r.id === 'routine-upper')!;
    const lower = DEFAULT_ROUTINES.find((r) => r.id === 'routine-lower')!;
    return [
      { ...upper, scheduledWeekdays: trainingDaysPerWeek >= 4 ? [1, 4] : [1, 5] },
      { ...lower, scheduledWeekdays: trainingDaysPerWeek >= 4 ? [2, 5] : [3] },
    ];
  }
  if (split === 'full_body') {
    const full = DEFAULT_ROUTINES.find((r) => r.id === 'routine-full')!;
    const days = trainingDaysPerWeek >= 4 ? [1, 3, 5, 6] : [1, 3, 5];
    return [
      { ...full, id: 'routine-full-a', name: 'Full Body A (Squat & Press)', scheduledWeekdays: days },
      {
        ...full,
        id: 'routine-full-b',
        name: 'Full Body B (RDL & Pull)',
        dayLabel: 'Full B',
        accentColor: '#79B8F5',
        items: [
          { exerciseId: 'ex-rdl', defaultSets: 3, restSeconds: 120 },
          { exerciseId: 'ex-incline-db-press', defaultSets: 3, restSeconds: 90 },
          { exerciseId: 'ex-lat-pulldown', defaultSets: 3, restSeconds: 90 },
          { exerciseId: 'ex-db-shoulder-press', defaultSets: 3, restSeconds: 90 },
          { exerciseId: 'ex-hanging-leg-raise', defaultSets: 3, restSeconds: 60 },
        ],
        scheduledWeekdays: [],
      },
    ];
  }
  if (split === 'bro_split') {
    return [
      {
        id: 'routine-bro-chest',
        name: 'Chest & Triceps',
        dayLabel: 'Chest/Tri',
        programType: 'push',
        scheduledWeekdays: [1],
        accentColor: '#B7F36B',
        items: [
          { exerciseId: 'ex-bench-press', defaultSets: 4, restSeconds: 120 },
          { exerciseId: 'ex-incline-db-press', defaultSets: 3, restSeconds: 90 },
          { exerciseId: 'ex-cable-fly', defaultSets: 3, restSeconds: 60 },
          { exerciseId: 'ex-tricep-pushdown', defaultSets: 3, restSeconds: 60 },
          { exerciseId: 'ex-overhead-tricep-ext', defaultSets: 3, restSeconds: 60 },
        ],
      },
      {
        id: 'routine-bro-back',
        name: 'Back & Biceps',
        dayLabel: 'Back/Bi',
        programType: 'pull',
        scheduledWeekdays: [2],
        accentColor: '#79B8F5',
        items: [
          { exerciseId: 'ex-lat-pulldown', defaultSets: 4, restSeconds: 90 },
          { exerciseId: 'ex-barbell-row', defaultSets: 3, restSeconds: 120 },
          { exerciseId: 'ex-seated-cable-row', defaultSets: 3, restSeconds: 90 },
          { exerciseId: 'ex-barbell-curl', defaultSets: 3, restSeconds: 60 },
          { exerciseId: 'ex-hammer-curl', defaultSets: 3, restSeconds: 60 },
        ],
      },
      {
        id: 'routine-bro-shoulders',
        name: 'Shoulders & Core',
        dayLabel: 'Shoulders',
        programType: 'custom',
        scheduledWeekdays: [4],
        accentColor: '#75D69A',
        items: [
          { exerciseId: 'ex-ohp', defaultSets: 4, restSeconds: 120 },
          { exerciseId: 'ex-lateral-raise', defaultSets: 4, restSeconds: 60 },
          { exerciseId: 'ex-face-pull', defaultSets: 3, restSeconds: 60 },
          { exerciseId: 'ex-hanging-leg-raise', defaultSets: 3, restSeconds: 60 },
        ],
      },
      {
        id: 'routine-bro-legs',
        name: 'Legs Power',
        dayLabel: 'Legs',
        programType: 'legs',
        scheduledWeekdays: [5],
        accentColor: '#EAB765',
        items: [
          { exerciseId: 'ex-squat', defaultSets: 4, restSeconds: 180 },
          { exerciseId: 'ex-rdl', defaultSets: 3, restSeconds: 120 },
          { exerciseId: 'ex-leg-press', defaultSets: 3, restSeconds: 90 },
          { exerciseId: 'ex-leg-curl', defaultSets: 3, restSeconds: 60 },
          { exerciseId: 'ex-standing-calf-raise', defaultSets: 3, restSeconds: 60 },
        ],
      },
    ];
  }
  // Default: Push / Pull / Legs
  const ppl = DEFAULT_ROUTINES.slice(0, 3);
  return ppl.map((r, idx) => ({
    ...r,
    scheduledWeekdays:
      trainingDaysPerWeek >= 6
        ? [idx + 1, idx + 4]
        : trainingDaysPerWeek >= 4 && idx === 0
          ? [1, 5]
          : [idx + 1],
  }));
}

export async function completeOnboardingWithProfile(
  userProfile: UserProfile,
  mode: 'fresh' | 'demo'
): Promise<void> {
  const todayKey = toLocalDateKey(new Date());
  const starterRoutines = generateStarterRoutinesForSplit(
    userProfile.preferredWorkoutSplit ?? 'push_pull_legs',
    userProfile.trainingDaysPerWeek ?? 4
  );

  if (mode === 'demo') {
    await resetToSampleData();
    await db.profile.put({
      ...userProfile,
      id: DEFAULT_PROFILE_ID,
      onboardingCompleted: true,
      sampleDataSeeded: true,
    });
    await db.routines.bulkPut(starterRoutines);
    return;
  }

  await db.transaction(
    'rw',
    [
      db.profile,
      db.exercises,
      db.routines,
      db.workoutSessions,
      db.foodLogs,
      db.customFoods,
      db.savedMeals,
      db.waterLogs,
      db.weightLogs,
      db.measurements,
      db.progressPhotos,
      db.recoveryLogs,
      db.coachMessages,
      db.coachConversations,
      db.coachMemories,
      db.syncQueue,
    ],
    async () => {
      await Promise.all([
        db.workoutSessions.clear(),
        db.foodLogs.clear(),
        db.customFoods.clear(),
        db.savedMeals.clear(),
        db.waterLogs.clear(),
        db.weightLogs.clear(),
        db.measurements.clear(),
        db.progressPhotos.clear(),
        db.recoveryLogs.clear(),
        db.coachMessages.clear(),
        db.coachConversations.clear(),
        db.coachMemories.clear(),
        db.syncQueue.clear(),
        db.routines.clear(),
      ]);
      await db.profile.put({
        ...userProfile,
        id: DEFAULT_PROFILE_ID,
        onboardingCompleted: true,
        sampleDataSeeded: false,
      });
      await db.exercises.bulkPut(BUILTIN_EXERCISES);
      await db.routines.bulkPut(starterRoutines);
      await db.weightLogs.put({
        id: `wt-${todayKey}`,
        date: todayKey,
        weightKg: userProfile.weightKg,
        note: 'Starting weight',
      });
    }
  );
}

export async function ensureDatabaseSeeded(): Promise<void> {
  const existingProfile = await db.profile.get(DEFAULT_PROFILE_ID);
  if (existingProfile) {
    // Upgrade v1/v2/v3 profiles smoothly without wiping user data
    const defaults = createDefaultProfile();
    const needsUpgrade =
      existingProfile.unitSystem === undefined ||
      existingProfile.dashboardWidgets === undefined ||
      existingProfile.fiberTarget === undefined ||
      existingProfile.onboardingCompleted === undefined;

    if (needsUpgrade) {
      await db.profile.update(DEFAULT_PROFILE_ID, {
        onboardingCompleted: existingProfile.onboardingCompleted ?? true,
        weeklyRateKg: existingProfile.weeklyRateKg ?? defaults.weeklyRateKg,
        experienceLevel: existingProfile.experienceLevel ?? defaults.experienceLevel,
        dietType: existingProfile.dietType ?? defaults.dietType,
        preferredWorkoutSplit: existingProfile.preferredWorkoutSplit ?? defaults.preferredWorkoutSplit,
        unitSystem: existingProfile.unitSystem ?? defaults.unitSystem,
        goalWeightKg: existingProfile.goalWeightKg ?? defaults.goalWeightKg,
        fiberTarget: existingProfile.fiberTarget ?? defaults.fiberTarget,
        stepsGoal: existingProfile.stepsGoal ?? defaults.stepsGoal,
        sleepGoalHours: existingProfile.sleepGoalHours ?? defaults.sleepGoalHours,
        trainingDaysPerWeek: existingProfile.trainingDaysPerWeek ?? defaults.trainingDaysPerWeek,
        preferredSplit: existingProfile.preferredSplit ?? defaults.preferredSplit,
        equipmentAvailable: existingProfile.equipmentAvailable ?? defaults.equipmentAvailable,
        dashboardWidgets: existingProfile.dashboardWidgets ?? defaults.dashboardWidgets,
        restSoundEnabled: existingProfile.restSoundEnabled ?? true,
        restVibrateEnabled: existingProfile.restVibrateEnabled ?? true,
        privacyBlurPhotos: existingProfile.privacyBlurPhotos ?? false,
      });
    }

    const customExercises = (await db.exercises.toArray()).filter((e) => e.isCustom);
    await db.exercises.bulkPut([...BUILTIN_EXERCISES, ...customExercises]);

    const recCount = await db.recoveryLogs.count();
    if (recCount === 0 && existingProfile.sampleDataSeeded) {
      const todayKey = toLocalDateKey(new Date());
      const { measurements, recoveryLogs, savedMeals } = buildSampleNutritionAndHealth(todayKey);
      await db.measurements.bulkPut(measurements);
      await db.recoveryLogs.bulkPut(recoveryLogs);
      await db.savedMeals.bulkPut(savedMeals);
    }
    return;
  }

  // First launch: ensure exercise library is ready, and let OnboardingWizard create the profile
  const exCount = await db.exercises.count();
  if (exCount === 0) {
    await db.exercises.bulkPut(BUILTIN_EXERCISES);
  }
}

export async function resetToSampleData(): Promise<void> {
  const todayKey = toLocalDateKey(new Date());
  const existingProfile = await db.profile.get(DEFAULT_PROFILE_ID);
  const preservedApiKey = existingProfile?.geminiApiKey ?? '';

  const profile = createDefaultProfile();
  profile.geminiApiKey = preservedApiKey;

  const sessions = buildSampleSessions(todayKey);
  const { foodLogs, waterLogs, weightLogs, measurements, recoveryLogs, savedMeals } =
    buildSampleNutritionAndHealth(todayKey);

  const routines = DEFAULT_ROUTINES.map((r) => {
    const matching = sessions
      .filter((s) => s.routineId === r.id)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return {
      ...r,
      lastPerformedAt: matching[0]?.startedAt,
    };
  });

  await db.transaction(
    'rw',
    [
      db.profile,
      db.exercises,
      db.routines,
      db.workoutSessions,
      db.foodLogs,
      db.customFoods,
      db.savedMeals,
      db.waterLogs,
      db.weightLogs,
      db.measurements,
      db.progressPhotos,
      db.recoveryLogs,
      db.coachMessages,
      db.coachConversations,
      db.coachMemories,
      db.syncQueue,
    ],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.exercises.clear(),
        db.routines.clear(),
        db.workoutSessions.clear(),
        db.foodLogs.clear(),
        db.customFoods.clear(),
        db.savedMeals.clear(),
        db.waterLogs.clear(),
        db.weightLogs.clear(),
        db.measurements.clear(),
        db.progressPhotos.clear(),
        db.recoveryLogs.clear(),
        db.coachMessages.clear(),
        db.coachConversations.clear(),
        db.coachMemories.clear(),
        db.syncQueue.clear(),
      ]);
      await db.profile.put(profile);
      await db.exercises.bulkPut(BUILTIN_EXERCISES);
      await db.routines.bulkPut(routines);
      await db.workoutSessions.bulkPut(sessions);
      await db.foodLogs.bulkPut(foodLogs);
      await db.savedMeals.bulkPut(savedMeals);
      await db.waterLogs.bulkPut(waterLogs);
      await db.weightLogs.bulkPut(weightLogs);
      await db.measurements.bulkPut(measurements);
      await db.recoveryLogs.bulkPut(recoveryLogs);
    }
  );
}

export async function clearAllUserData(): Promise<void> {
  const existingProfile = await db.profile.get(DEFAULT_PROFILE_ID);
  const blankProfile = createDefaultProfile();
  blankProfile.geminiApiKey = existingProfile?.geminiApiKey ?? '';
  blankProfile.sampleDataSeeded = false;

  await db.transaction(
    'rw',
    [
      db.profile,
      db.exercises,
      db.routines,
      db.workoutSessions,
      db.foodLogs,
      db.customFoods,
      db.savedMeals,
      db.waterLogs,
      db.weightLogs,
      db.measurements,
      db.progressPhotos,
      db.recoveryLogs,
      db.coachMessages,
      db.coachConversations,
      db.coachMemories,
      db.syncQueue,
    ],
    async () => {
      await Promise.all([
        db.workoutSessions.clear(),
        db.foodLogs.clear(),
        db.customFoods.clear(),
        db.savedMeals.clear(),
        db.waterLogs.clear(),
        db.weightLogs.clear(),
        db.measurements.clear(),
        db.progressPhotos.clear(),
        db.recoveryLogs.clear(),
        db.coachMessages.clear(),
        db.coachConversations.clear(),
        db.coachMemories.clear(),
        db.syncQueue.clear(),
      ]);
      await db.profile.put(blankProfile);
      const exCount = await db.exercises.count();
      if (exCount === 0) await db.exercises.bulkPut(BUILTIN_EXERCISES);
      const rCount = await db.routines.count();
      if (rCount === 0) await db.routines.bulkPut(DEFAULT_ROUTINES);
    }
  );
}
