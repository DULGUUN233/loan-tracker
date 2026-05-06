const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://bae123:123test123@cluster0.ebnpu.mongodb.net/Dulguun?retryWrites=true&w=majority';

let cached = global._mongo;
if (!cached) cached = global._mongo = { conn: null, promise: null };
async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, { bufferCommands: false }).then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  note: { type: String, default: '' }
}, { _id: true });

const loanSchema = new mongoose.Schema({
  appName: { type: String, required: true },
  amount: { type: Number, required: true },
  interestRate: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  note: { type: String, default: '' },
  paid: { type: Boolean, default: false },
  payments: { type: [paymentSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const Loan = mongoose.models.Loan || mongoose.model('Loan', loanSchema);

app.use(async (req, res, next) => {
  try { await dbConnect(); next(); }
  catch (e) { res.status(500).json({ error: 'db: ' + e.message }); }
});

app.get('/api/loans', async (req, res) => {
  try { res.json(await Loan.find().sort({ dueDate: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/loans', async (req, res) => {
  try { const loan = new Loan(req.body); await loan.save(); res.json(loan); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/loans/:id', async (req, res) => {
  try {
    const loan = await Loan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(loan);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/loans/:id/payments', async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'not found' });
    loan.payments.push({
      amount: parseFloat(req.body.amount),
      date: req.body.date ? new Date(req.body.date) : new Date(),
      note: req.body.note || ''
    });
    await loan.save();
    res.json(loan);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/loans/:id/payments/:pid', async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'not found' });
    loan.payments = loan.payments.filter(p => p._id.toString() !== req.params.pid);
    await loan.save();
    res.json(loan);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/loans/:id', async (req, res) => {
  try { await Loan.findByIdAndDelete(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = app;
