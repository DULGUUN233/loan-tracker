const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

const txnSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, default: 'other', index: true },
  merchant: { type: String, default: '' },
  description: { type: String, default: '' },
  statementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Statement', index: true },
  hash: { type: String, index: true }
});
const Txn = mongoose.models.Txn || mongoose.model('Txn', txnSchema);

const stmtSchema = new mongoose.Schema({
  fileName: String,
  uploadedAt: { type: Date, default: Date.now },
  periodStart: Date,
  periodEnd: Date,
  totalIncome: Number,
  totalExpense: Number,
  txCount: Number
});
const Statement = mongoose.models.Statement || mongoose.model('Statement', stmtSchema);

const codeSchema = new mongoose.Schema({
  appName: { type: String, required: true },
  username: { type: String, default: '' },
  code: { type: String, required: true },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const AppCode = mongoose.models.AppCode || mongoose.model('AppCode', codeSchema);

function categorize(desc, type) {
  const d = (desc || '').toUpperCase();
  if (type === 'income') {
    if (d.includes('ЦАЛИН') || d.includes('SALARY')) return 'salary';
    if (d.includes('W-') || d.includes('SOCIALPAY')) return 'transfer_in';
    return 'income';
  }
  if (d.includes('ШИМТГЭЛ') || d.includes('CHARGES FOR') || d.includes('CHARGE')) return 'fee';
  if (d.includes('STOREPAY') || d.includes('LENDMN') || d.includes('POCKET')) return 'loan';
  if (d.includes('TAKSI') || d.includes('TAXI') || d.includes('UBCAB') || d.includes('YANGO')) return 'transport';
  if (d.includes('QPAY')) return 'qpay';
  if (d.includes('SUBWAY') || d.includes('KFC') || d.includes('PIZZA') || d.includes('BURGER') || d.includes('TANAN') || d.includes('CADECA') || d.includes('FOOD') || d.includes('CAFE') || d.includes('REST')) return 'food';
  if (d.includes('CU-') || d.includes('STORE 12') || d.includes('NANDIN') || d.includes('BOLOR') || d.includes('SUPER') || d.includes('MART') || d.includes('GS25') || d.includes('CIRCLE')) return 'grocery';
  if (d.includes('URGOO') || d.includes('CINEMA') || d.includes('PGAMING') || d.includes('META E-SP') || d.includes('SPOTIFY') || d.includes('NETFLIX') || d.includes('YOUTUBE')) return 'entertainment';
  if (d.includes('MOBICOM') || d.includes('UNITEL') || d.includes('SKYTEL') || d.includes('GMOBILE')) return 'telecom';
  if (d.includes('MONOS') || d.includes('OTOCH') || d.includes('PHARMACY') || d.includes('EMNELE')) return 'health';
  if (d.includes('LAUNDRY') || d.includes('CAR WASH') || d.includes('УГААЛГА')) return 'service';
  if (d.includes('SOCIALPAY')) return 'transfer_out';
  if (d.includes('BAIR') || d.includes('TUREES') || d.includes('TURE') || d.includes('ТҮРЭЭС')) return 'rent';
  return 'other';
}

function extractMerchant(desc) {
  const d = desc || '';
  let m;
  if ((m = d.match(/SocialPay гүйлгээ,([^,]+)/i))) return m[1].trim();
  if ((m = d.match(/W-([А-ЯЁӨҮ\s]+)/))) return m[1].trim();
  if ((m = d.match(/POS:([A-Z0-9\- ]+)/))) return m[1].trim();
  if ((m = d.match(/BOM:([A-Z0-9\- ]+)/))) return m[1].trim();
  if ((m = d.match(/ОРЛОГО\s+([А-ЯЁӨҮ\-\s]+)\s+\(/))) return m[1].trim();
  return '';
}

function parseStatement(text) {
  const txns = [];
  const re = /(\d{4}-\d{2}-\d{2})(?=\s)|(\d{1,3}(?:,\d{3})*\.\d{2})\s+(ЗАРЛАГА|ОРЛОГО)\s+(.+?)\s*\(Ханш:\s*[\d.]+\s*\)/g;
  let curDate = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) { curDate = m[1]; continue; }
    if (!curDate) continue;
    const type = m[3] === 'ОРЛОГО' ? 'income' : 'expense';
    const desc = m[4].trim().replace(/\s+/g, ' ');
    const amount = parseFloat(m[2].replace(/,/g, ''));
    const t = {
      date: new Date(curDate + 'T00:00:00Z'),
      amount, type, description: desc,
      category: categorize(desc, type),
      merchant: extractMerchant(desc),
      hash: `${curDate}|${amount}|${type}|${desc.slice(0,80)}`
    };
    txns.push(t);
  }
  return txns;
}

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

app.post('/api/statements/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const { extractText } = await import('unpdf');
    const { text } = await extractText(new Uint8Array(req.file.buffer), { mergePages: true });
    const txns = parseStatement(text);
    if (txns.length === 0) return res.status(400).json({ error: 'No transactions parsed. Make sure it is a Goloth bank statement.' });
    const dates = txns.map(t => t.date.getTime());
    const totalIncome = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const stmt = await Statement.create({
      fileName: req.file.originalname,
      periodStart: new Date(Math.min(...dates)),
      periodEnd: new Date(Math.max(...dates)),
      totalIncome, totalExpense,
      txCount: txns.length
    });
    let inserted = 0, dupes = 0;
    for (const t of txns) {
      const exists = await Txn.findOne({ hash: t.hash });
      if (exists) { dupes++; continue; }
      await Txn.create({ ...t, statementId: stmt._id });
      inserted++;
    }
    res.json({ ok: true, statement: stmt, inserted, duplicates: dupes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/statements', async (req, res) => {
  try { res.json(await Statement.find().sort({ periodStart: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/statements/:id', async (req, res) => {
  try {
    await Txn.deleteMany({ statementId: req.params.id });
    await Statement.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const q = {};
    if (req.query.from) q.date = { ...(q.date || {}), $gte: new Date(req.query.from) };
    if (req.query.to) q.date = { ...(q.date || {}), $lte: new Date(req.query.to) };
    if (req.query.category) q.category = req.query.category;
    if (req.query.type) q.type = req.query.type;
    res.json(await Txn.find(q).sort({ date: -1 }).limit(parseInt(req.query.limit) || 5000));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const txn = await Txn.findByIdAndUpdate(req.params.id, { category: req.body.category }, { new: true });
    res.json(txn);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/codes', async (req, res) => {
  try { res.json(await AppCode.find().sort({ appName: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/codes', async (req, res) => {
  try {
    const c = new AppCode(req.body);
    await c.save();
    res.json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/codes/:id', async (req, res) => {
  try {
    const c = await AppCode.findByIdAndUpdate(req.params.id,
      { ...req.body, updatedAt: new Date() }, { new: true });
    res.json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/codes/:id', async (req, res) => {
  try { await AppCode.findByIdAndDelete(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = app;
