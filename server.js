require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const Workout = require('./models/Workout');

const app = express();

// CORS liberado para o Swagger local e para o deploy
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Log simples de requisições (ajuda a depurar)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Swagger (opcional no local; se o openapi.yaml existir, carrega)
try {
  const swaggerDoc = YAML.load('./openapi.yaml');
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} catch (e) {
  console.warn('Swagger não carregado:', e.message);
}

const router = express.Router();

// ============================
// CREATE
// ============================
router.post('/workouts', async (req, res) => {
  try {
    const workout = await Workout.create(req.body);
    res.status(201).json(workout);
  } catch (err) {
    res.status(400).json({
      message: 'Dados inválidos',
      errors: Object.values(err.errors || {}).map(e => e.message)
    });
  }
});

// ============================
// READ - lista (filtros + paginação)
// ============================
router.get('/workouts', async (req, res) => {
  try {
    const { muscleGroup, from, to, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (muscleGroup) filter['exercises.muscleGroup'] = muscleGroup;

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to)   filter.date.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [data, total] = await Promise.all([
      Workout.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)),
      Workout.countDocuments(filter)
    ]);

    res.json({ total, page: Number(page), limit: Number(limit), data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================
// READ - estatísticas (agregação)
// IMPORTANTE: deve vir ANTES de /workouts/:id
// ============================
router.get('/workouts/stats', async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = {};

    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to)   match.date.$lte = new Date(to);
    }

    const stats = await Workout.aggregate([
      { $match: match },
      { $unwind: '$exercises' },
      {
        $group: {
          _id: '$exercises.muscleGroup',
          totalVolumeKg: {
            $sum: {
              $multiply: ['$exercises.sets', '$exercises.reps', '$exercises.weightKg']
            }
          },
          totalSets: { $sum: '$exercises.sets' }
        }
      },
      { $project: { _id: 0, muscleGroup: '$_id', totalVolumeKg: 1, totalSets: 1 } },
      { $sort: { totalVolumeKg: -1 } }
    ]);

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================
// READ - por ID
// ============================
router.get('/workouts/:id', async (req, res) => {
  try {
    const w = await Workout.findById(req.params.id);
    if (!w) return res.status(404).json({ message: 'Treino não encontrado' });
    res.json(w);
  } catch (err) {
    res.status(400).json({ message: 'ID inválido' });
  }
});

// ============================
// UPDATE - substituição total
// ============================
router.put('/workouts/:id', async (req, res) => {
  try {
    const w = await Workout.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );
    if (!w) return res.status(404).json({ message: 'Treino não encontrado' });
    res.json(w);
  } catch (err) {
    res.status(400).json({
      message: 'Dados inválidos',
      errors: Object.values(err.errors || {}).map(e => e.message)
    });
  }
});

// ============================
// UPDATE - parcial
// ============================
router.patch('/workouts/:id', async (req, res) => {
  try {
    const w = await Workout.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { returnDocument: 'after', runValidators: true }
    );
    if (!w) return res.status(404).json({ message: 'Treino não encontrado' });
    res.json(w);
  } catch (err) {
    res.status(400).json({
      message: 'Dados inválidos',
      errors: Object.values(err.errors || {}).map(e => e.message)
    });
  }
});

// ============================
// DELETE - treino
// ============================
router.delete('/workouts/:id', async (req, res) => {
  try {
    const w = await Workout.findByIdAndDelete(req.params.id);
    if (!w) return res.status(404).json({ message: 'Treino não encontrado' });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ message: 'ID inválido' });
  }
});

// ============================
// SUBROTA - adicionar exercício ($push)
// ============================
router.post('/workouts/:id/exercises', async (req, res) => {
  try {
    const w = await Workout.findByIdAndUpdate(
      req.params.id,
      { $push: { exercises: req.body } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!w) return res.status(404).json({ message: 'Treino não encontrado' });
    res.status(201).json(w);
  } catch (err) {
    res.status(400).json({
      message: 'Dados inválidos',
      errors: Object.values(err.errors || {}).map(e => e.message)
    });
  }
});

// ============================
// SUBROTA - atualizar exercício (arrayFilters)
// ============================
router.patch('/workouts/:id/exercises/:exerciseId', async (req, res) => {
  try {
    const w = await Workout.findOneAndUpdate(
      { _id: req.params.id, 'exercises._id': req.params.exerciseId },
      { $set: { 'exercises.$[ex]': { ...req.body, _id: req.params.exerciseId } } },
      {
        arrayFilters: [{ 'ex._id': req.params.exerciseId }],
        returnDocument: 'after',
        runValidators: true
      }
    );
    if (!w) return res.status(404).json({ message: 'Treino ou exercício não encontrado' });
    res.json(w);
  } catch (err) {
    res.status(400).json({
      message: 'Dados inválidos',
      errors: Object.values(err.errors || {}).map(e => e.message)
    });
  }
});

// ============================
// SUBROTA - remover exercício ($pull)
// ============================
router.delete('/workouts/:id/exercises/:exerciseId', async (req, res) => {
  try {
    const w = await Workout.findByIdAndUpdate(
      req.params.id,
      { $pull: { exercises: { _id: req.params.exerciseId } } },
      { returnDocument: 'after' }
    );
    if (!w) return res.status(404).json({ message: 'Treino não encontrado' });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ message: 'ID inválido' });
  }
});

app.use('/api', router);

// ============================
// Conexão com MongoDB + start
// ============================
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`API on http://localhost:${PORT}/api`));
  })
  .catch(err => {
    console.error('Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  });