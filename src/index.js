import 'dotenv/config';
import express from 'express';
import connectDB from './config/db.js';

const app = express();

const PORT = process.env.PORT;

app.get('/', (req, res) => {
  res.send('Hello World');
});

connectDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
