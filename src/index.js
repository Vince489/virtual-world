import 'dotenv/config';
import express from 'express';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

const PORT = process.env.PORT;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.use('/auth', authRoutes);

connectDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
