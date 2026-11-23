const mongoose = require('mongoose');

const ExerciseSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  muscleGroup: { type: String, required: true, enum: ['Peito','Costas','Pernas','Ombros','Bíceps','Tríceps','Abdômen','Cardio'] },
  equipment:   { type: String, trim: true },
  sets:        { type: Number, required: true, min: 1 },
  reps:        { type: Number, required: true, min: 1 },
  weightKg:    { type: Number, min: 0, default: 0 }
}, { _id: true });

const WorkoutSchema = new mongoose.Schema({
  title:           { type: String, required: true, trim: true },
  date:            { type: Date,   required: true },
  durationMinutes: { type: Number, min: 1 },
  notes:           { type: String, trim: true },
  exercises:       { type: [ExerciseSchema], validate: v => Array.isArray(v) && v.length > 0 }
}, { timestamps: true });

module.exports = mongoose.model('Workout', WorkoutSchema);