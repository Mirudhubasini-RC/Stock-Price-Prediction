const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const yahooFinance = require('yahoo-finance2').default;
const cors = require('cors');
const mysql = require('mysql2');

try {
  yahooFinance.suppressNotices(['yahooSurvey', 'ripHistorical']);
} catch (_) {
  // older yahoo-finance2 versions may not support this
}

const app = express();
const PORT = process.env.PORT || 8000;
const DATA_DIR = path.join(__dirname, 'Pyth', 'data');

const DEFAULT_STOCKS = ['AAPL', 'AMD', 'AMZN', 'TSLA', 'META', 'FANG', 'UBER', 'MSFT'];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const YAHOO_GAP_MS = 1500;
const YAHOO_COOLDOWN_MS = 15 * 60 * 1000; // stop calling Yahoo for 15 min after a 429
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

const cache = new Map();
let yahooQueue = Promise.resolve();
let yahooCooldownUntil = 0; // try live sources first on deploy

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) return null;
  return entry.value;
}

function setCache(key, value) {
  cache.set(key, { at: Date.now(), value });
  return value;
}

function getStaleCache(key) {
  const entry = cache.get(key);
  return entry ? entry.value : null;
}

function isRateLimited(err) {
  const msg = String(err && (err.message || err));
  return /too many requests|429|unexpected token 't'/i.test(msg);
}

function markYahooCooldown(reason) {
  yahooCooldownUntil = Date.now() + YAHOO_COOLDOWN_MS;
  console.warn(`Yahoo cooldown (${reason}) until ${new Date(yahooCooldownUntil).toLocaleTimeString()}`);
}

function yahooAvailable() {
  return Date.now() >= yahooCooldownUntil;
}

function readCsvRows(symbol) {
  const file = path.join(DATA_DIR, `stock_market_data_${symbol}_4years.csv`);
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 5) continue;
    const open = parseFloat(parts[1]);
    const high = parseFloat(parts[2]);
    const low = parseFloat(parts[3]);
    const close = parseFloat(parts[4]);
    if (!parts[0] || Number.isNaN(close)) continue;
    rows.push({ date: parts[0], open, high, low, close });
  }
  return rows.length ? rows : null;
}

function quoteFromCsv(symbol) {
  const rows = readCsvRows(symbol);
  if (!rows || rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const changePct = prev.close ? (last.close - prev.close) / prev.close : 0;
  return {
    symbol,
    companyName: symbol,
    currentPrice: last.close,
    previousClose: prev.close,
    openPrice: last.open,
    dayRange: `${last.low} - ${last.high}`,
    volume: 'N/A',
    percentChange: changePct,
    price: last.close,
  };
}

function historicalFromCsv(symbol, timeframe) {
  const rows = readCsvRows(symbol);
  if (!rows || !rows.length) return null;
  let count = 22;
  if (timeframe === '1w') count = 5;
  if (timeframe === '1y') count = 252;
  return rows.slice(-count).map((r) => ({
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
  }));
}

function yahooRangeForTimeframe(timeframe) {
  if (timeframe === '1w') return '5d';
  if (timeframe === '1y') return '1y';
  return '1mo';
}

/** Direct Yahoo chart API — avoids crumb/cookie rate limits from yahoo-finance2. */
async function fetchYahooChart(symbol, timeframe = '1mo') {
  const range = yahooRangeForTimeframe(timeframe);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo chart empty');

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const rows = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null) continue;
    const d = new Date(timestamps[i] * 1000);
    rows.push({
      date: d.toISOString().slice(0, 10),
      open: quote.open?.[i] ?? close,
      high: quote.high?.[i] ?? close,
      low: quote.low?.[i] ?? close,
      close,
    });
  }
  if (!rows.length) throw new Error('Yahoo chart no rows');

  const meta = result.meta || {};
  return { rows, meta };
}

async function quoteFromYahooChart(symbol) {
  const { rows, meta } = await fetchYahooChart(symbol, '5d');
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2] || last;
  const price = meta.regularMarketPrice ?? last.close;
  const prevClose = meta.chartPreviousClose ?? prev.close;
  const changePct = prevClose ? (price - prevClose) / prevClose : 0;
  return {
    symbol,
    companyName: meta.longName || meta.shortName || symbol,
    currentPrice: price,
    previousClose: prevClose,
    openPrice: last.open,
    dayRange: `${meta.regularMarketDayLow ?? last.low} - ${meta.regularMarketDayHigh ?? last.high}`,
    volume: meta.regularMarketVolume ?? 'N/A',
    percentChange: changePct,
    price,
    source: 'yahoo-chart',
  };
}

async function quoteFromAlphaVantage(symbol) {
  if (!ALPHA_VANTAGE_API_KEY) throw new Error('No Alpha Vantage key');
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const data = await res.json();
  if (data.Note || data.Information) throw new Error(data.Note || data.Information);
  const q = data['Global Quote'];
  if (!q || !q['05. price']) throw new Error('Alpha Vantage empty quote');
  const price = parseFloat(q['05. price']);
  const prev = parseFloat(q['08. previous close']);
  const open = parseFloat(q['02. open']);
  const high = parseFloat(q['03. high']);
  const low = parseFloat(q['04. low']);
  const changePct = parseFloat(String(q['10. change percent'] || '').replace('%', '')) / 100;
  return {
    symbol,
    companyName: symbol,
    currentPrice: price,
    previousClose: prev,
    openPrice: open,
    dayRange: `${low} - ${high}`,
    volume: parseFloat(q['06. volume']) || 'N/A',
    percentChange: Number.isFinite(changePct) ? changePct : 0,
    price,
    source: 'alphavantage',
  };
}

async function fetchAlphaVantageActive() {
  if (!ALPHA_VANTAGE_API_KEY) return null;
  const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHA_VANTAGE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const data = await res.json();
  if (data.Note || data.Information) {
    throw new Error(data.Note || data.Information);
  }
  const mapRow = (row) => ({
    ticker: row.ticker,
    price: parseFloat(row.price) || 0,
    change: parseFloat(row.change_amount) || 0,
    changePercent: parseFloat(String(row.change_percentage || '').replace('%', '')) || 0,
  });
  const gainers = (data.top_gainers || []).slice(0, 10).map(mapRow);
  const losers = (data.top_losers || []).slice(0, 10).map(mapRow);
  if (!gainers.length && !losers.length) return null;
  return { gainers, losers, source: 'alphavantage' };
}

/** Run Yahoo-finance2 calls one-at-a-time (legacy path). */
function enqueueYahoo(fn) {
  if (!yahooAvailable()) {
    return Promise.reject(new Error('Too Many Requests'));
  }
  const run = yahooQueue.then(async () => {
    if (!yahooAvailable()) throw new Error('Too Many Requests');
    await sleep(YAHOO_GAP_MS);
    return fn();
  });
  yahooQueue = run.catch(() => {});
  return run;
}

function mapQuoteToStock(symbol, quote) {
  return {
    symbol,
    companyName: quote.longName || quote.shortName || symbol,
    currentPrice: quote.regularMarketPrice ?? 'N/A',
    previousClose: quote.regularMarketPreviousClose ?? 'N/A',
    openPrice: quote.regularMarketOpen ?? 'N/A',
    dayRange: `${quote.regularMarketDayLow ?? 'N/A'} - ${quote.regularMarketDayHigh ?? 'N/A'}`,
    volume: quote.regularMarketVolume ?? 'N/A',
    percentChange: quote.regularMarketChangePercent ?? 0,
    price: quote.regularMarketPrice ?? 'N/A',
    source: 'yahoo',
  };
}

const FALLBACK_MARKET = DEFAULT_STOCKS.map((symbol, i) => {
  const fromCsv = quoteFromCsv(symbol);
  if (fromCsv) return fromCsv;
  return {
    symbol,
    companyName: symbol,
    currentPrice: 100 + i * 10,
    previousClose: 99 + i * 10,
    openPrice: 100 + i * 10,
    dayRange: 'N/A - N/A',
    volume: 'N/A',
    percentChange: i % 2 === 0 ? 0.012 : -0.008,
    price: 100 + i * 10,
  };
});

const FALLBACK_ACTIVE = {
  gainers: [
    { ticker: 'AAPL', price: quoteFromCsv('AAPL')?.currentPrice || 197, change: 2.1, changePercent: 1.1 },
    { ticker: 'AMZN', price: quoteFromCsv('AMZN')?.currentPrice || 173, change: 1.8, changePercent: 1.0 },
    { ticker: 'GOOG', price: quoteFromCsv('GOOG')?.currentPrice || 157, change: 1.2, changePercent: 0.8 },
  ],
  losers: [
    { ticker: 'ORCL', price: quoteFromCsv('ORCL')?.currentPrice || 140, change: -2.1, changePercent: -1.5 },
    { ticker: 'RYCEY', price: quoteFromCsv('RYCEY')?.currentPrice || 8, change: -0.2, changePercent: -1.2 },
    { ticker: 'TSLA', price: 180, change: -4.5, changePercent: -2.4 },
  ],
};

function localQuote(symbol) {
  return quoteFromCsv(symbol)
    || FALLBACK_MARKET.find((s) => s.symbol === symbol)
    || { ...FALLBACK_MARKET[0], symbol };
}

async function fetchQuoteCached(symbol) {
  const key = `quote:${symbol}`;
  const hit = getCache(key);
  if (hit) return hit;

  // 1) Direct Yahoo chart API (works when yahoo-finance2 is blocked)
  try {
    const q = await quoteFromYahooChart(symbol);
    return setCache(key, q);
  } catch (err) {
    console.warn(`Yahoo chart quote failed for ${symbol}:`, err.message);
  }

  // 2) Alpha Vantage GLOBAL_QUOTE (uses your key; limited daily calls)
  try {
    const q = await quoteFromAlphaVantage(symbol);
    return setCache(key, q);
  } catch (err) {
    console.warn(`Alpha Vantage quote failed for ${symbol}:`, err.message);
  }

  // 3) Local CSV / static fallback
  const stale = getStaleCache(key);
  if (stale) return stale;
  return setCache(key, localQuote(symbol));
}

app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
  methods: ['POST', 'GET', 'DELETE'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || process.env.SECRET_KEY || 'dev-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' },
}));

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stock_prediction'
});

db.connect((err) => {
  if (err) {
    console.error('Database connection error:', err.stack);
    return;
  }
  console.log('Connected to MySQL database.');
});

// Welcome / SPA root — prefer React build when present
app.get('/', (req, res) => {
  const indexHtml = path.join(__dirname, '..', 'build', 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.send('Welcome to the stock prediction server (React build not found — run npm run build)');
});

// Sign-up endpoint
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;

  console.log('Sign-up request received:', { username, email });

  if (!username || !email || !password) {
    console.log('Error: Missing required fields');
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Check if the username or email already exists
  db.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, result) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (result.length > 0) {
      console.log('Error: Username or email already exists');
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash the password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Password hashing error:', err);
        return res.status(500).json({ error: 'Password hashing error' });
      }

      // Store user details in the database
      db.query(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [username, email, hashedPassword],
        (err, result) => {
          if (err) {
            console.error('Database insertion error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          console.log('User created successfully');
          res.status(201).json({ message: 'User created successfully' });
        }
      );
    });
  });
});

// Sign-in endpoint
app.post('/api/signin', (req, res) => {
  const { email, password } = req.body;

  console.log('Sign-in request received:', { email });

  // Check if the user exists
  db.query('SELECT * FROM users WHERE email = ?', [email], (err, result) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (result.length === 0) {
      console.log('Error: User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    // Compare the provided password with the stored hashed password
    bcrypt.compare(password, result[0].password, (err, isMatch) => {
      if (err) {
        console.error('Password comparison error:', err);
        return res.status(500).json({ error: 'Password comparison error' });
      }

      if (!isMatch) {
        console.log('Error: Invalid password');
        return res.status(401).json({ error: 'Invalid password' });
      }

      // Set session (this will maintain the session for the user)
      req.session.userId = result[0].id;
      req.session.username = result[0].username;

      res.json({
        message: 'Sign-in successful',
        user: {
          userId: result[0].id,  // Include userId
          username: result[0].username,
          email: result[0].email  // Include email
        }
      });
    });
  });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to log out' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Get the user's watchlist
app.get("/api/watchlist/:userId", (req, res) => {
  const userId = req.params.userId;  // Get userId from URL parameter

  console.log("Received userId:", userId);  // Log the userId

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  const query = "SELECT * FROM watchlist WHERE user_id = ?";
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching watchlist:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
    res.json(results); // Send the watchlist data to the frontend
  });
});

// Add a stock to the user's watchlist
// Add a stock to the user's watchlist
app.post("/api/watchlist/add", (req, res) => {
  const { symbol, userId, username } = req.body;

  console.log("Adding to watchlist:", { symbol, userId, username }); // Log the data

  // Validate required fields
  if (!userId || !symbol || !username) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Query to insert or update the record
  const query = `
    INSERT INTO watchlist (symbol, user_id, username) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      username = VALUES(username)
  `;

  db.query(query, [symbol, userId, username], (err, results) => {
    if (err) {
      console.error("Error adding stock to watchlist:", err);
      return res.status(500).json({ message: "Error adding stock" });
    }
    res.status(200).json({ message: "Stock added to watchlist" });
  });
});

// Delete a stock from the user's watchlist
app.delete("/api/watchlist/delete/:userId/:symbol", (req, res) => {
  const { symbol, userId } = req.params;  // Get symbol and userId from URL params

  console.log("Deleting from watchlist:", { symbol, userId }); // Log the data

  // Validate required fields
  if (!userId || !symbol) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Query to delete the stock from the watchlist
  const query = `
    DELETE FROM watchlist 
    WHERE symbol = ? AND user_id = ?
  `;

  db.query(query, [symbol, userId], (err, results) => {
    if (err) {
      console.error("Error deleting stock from watchlist:", err);
      return res.status(500).json({ message: "Error deleting stock" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ message: "Stock not found in the watchlist" });
    }

    res.status(200).json({ message: "Stock deleted from watchlist" });
  });
});

app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').toUpperCase();
    const stockData = await fetchQuoteCached(symbol);
    res.json(stockData);
  } catch (err) {
    console.error('Error fetching stock data:', err.message);
    res.status(500).json({ error: 'Unable to fetch stock data. Please try again later.' });
  }
});

app.get('/api/stock/:symbol/historical', async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const { timeframe } = req.query;

  const validTimeFrames = ['1w', '1mo', '1y'];
  if (!validTimeFrames.includes(timeframe)) {
    return res.status(400).json({ error: 'Invalid timeframe. Allowed values: 1w, 1mo, 1y' });
  }

  const cacheKey = `hist:${symbol}:${timeframe}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  // Direct Yahoo chart API first (live dates)
  try {
    const { rows } = await fetchYahooChart(symbol, timeframe);
    if (rows.length) return res.json(setCache(cacheKey, rows));
  } catch (err) {
    console.warn(`Yahoo chart history failed for ${symbol}:`, err.message);
  }

  const local = historicalFromCsv(symbol, timeframe);
  if (local && local.length) {
    return res.json(setCache(cacheKey, local));
  }

  return res.status(503).json({ error: 'No history available for this symbol right now.' });
});

async function buildActiveStocks() {
  const cacheKey = 'active-stocks';
  const hit = getCache(cacheKey);
  if (hit) return hit;

  // Alpha Vantage: one call for gainers + losers (uses your existing key)
  try {
    const av = await fetchAlphaVantageActive();
    if (av) return setCache(cacheKey, av);
  } catch (err) {
    console.warn('Alpha Vantage active stocks failed:', err.message);
  }

  if (!yahooAvailable()) {
    return setCache(cacheKey, FALLBACK_ACTIVE);
  }

  try {
    const trendingData = await enqueueYahoo(() => yahooFinance.trendingSymbols('US'));
    const symbols = (trendingData.quotes || []).map((item) => item.symbol).slice(0, 6);
    if (symbols.length === 0) return setCache(cacheKey, FALLBACK_ACTIVE);

    const results = [];
    for (const symbol of symbols) {
      if (!yahooAvailable()) break;
      try {
        const quote = await enqueueYahoo(() => yahooFinance.quote(symbol));
        if (quote) results.push(quote);
      } catch (err) {
        if (isRateLimited(err)) {
          markYahooCooldown(symbol);
          break;
        }
      }
    }

    const gainers = results
      .filter((stock) => stock && stock.regularMarketChangePercent > 0)
      .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
      .slice(0, 10)
      .map((stock) => ({
        ticker: stock.symbol || 'N/A',
        price: stock.regularMarketPrice || 0,
        change: stock.regularMarketChange || 0,
        changePercent: stock.regularMarketChangePercent || 0,
      }));

    const losers = results
      .filter((stock) => stock && stock.regularMarketChangePercent < 0)
      .sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent)
      .slice(0, 10)
      .map((stock) => ({
        ticker: stock.symbol || 'N/A',
        price: stock.regularMarketPrice || 0,
        change: stock.regularMarketChange || 0,
        changePercent: stock.regularMarketChangePercent || 0,
      }));

    const payload = {
      gainers: gainers.length ? gainers : FALLBACK_ACTIVE.gainers,
      losers: losers.length ? losers : FALLBACK_ACTIVE.losers,
    };
    return setCache(cacheKey, payload);
  } catch (error) {
    if (isRateLimited(error)) markYahooCooldown('active-stocks');
    return getStaleCache(cacheKey) || FALLBACK_ACTIVE;
  }
}

app.get('/api/active-stocks', async (req, res) => {
  try {
    res.json(await buildActiveStocks());
  } catch (error) {
    console.error('Error fetching active stocks:', error);
    res.json(FALLBACK_ACTIVE);
  }
});

/** One request for the whole dashboard — Yahoo → Stooq → local CSV. */
app.get('/api/market-overview', async (req, res) => {
  try {
    const marketData = [];
    let source = 'mixed';
    for (const symbol of DEFAULT_STOCKS) {
      try {
        const q = await fetchQuoteCached(symbol);
        marketData.push(q);
        if (q.source) source = q.source;
      } catch (err) {
        marketData.push(localQuote(symbol));
      }
    }
    const active = await buildActiveStocks();
    res.json({
      marketData: marketData.length ? marketData : FALLBACK_MARKET,
      gainers: active.gainers,
      losers: active.losers,
      source: active.source || source,
    });
  } catch (error) {
    console.error('Error building market overview:', error.message);
    res.json({
      marketData: FALLBACK_MARKET,
      gainers: FALLBACK_ACTIVE.gainers,
      losers: FALLBACK_ACTIVE.losers,
      source: 'fallback',
    });
  }
});

// Proxy ML Flask service so the browser always calls same-origin /api/predict
const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL
  || (process.env.NODE_ENV === 'production'
    ? 'https://ticker-trend-ml.onrender.com'
    : 'http://127.0.0.1:3001')
).replace(/\/$/, '');

async function proxyToMl(req, res, mlPath) {
  const url = `${ML_SERVICE_URL}${mlPath}`;
  const maxAttempts = 2;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`ML proxy ${mlPath} → ${url} (attempt ${attempt}/${maxAttempts})`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 110000); // under gunicorn 120s
      const upstream = await fetch(url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body || {}),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await upstream.text();
      const contentType = upstream.headers.get('content-type') || 'application/json';
      if (!upstream.ok) {
        console.warn(`ML upstream ${upstream.status}:`, text.slice(0, 300));
      }
      return res.status(upstream.status).type(contentType).send(text);
    } catch (err) {
      lastErr = err;
      console.error(`ML proxy ${mlPath} attempt ${attempt} failed:`, err.message);
      if (attempt < maxAttempts) {
        await sleep(3000); // give free-tier cold start a moment
      }
    }
  }

  res.status(502).json({
    error: 'Prediction service is waking up or unavailable. Open ticker-trend-ml once, wait ~60s, then try Predict again.',
    detail: lastErr ? String(lastErr.message || lastErr) : undefined,
    target: ML_SERVICE_URL,
  });
}

app.post('/api/predict', (req, res) => proxyToMl(req, res, '/predict'));
app.post('/predict', (req, res) => proxyToMl(req, res, '/predict'));
app.get('/api/ml/forecast_data.json', (req, res) => proxyToMl(req, res, '/forecast_data.json'));
app.get('/api/ml/stock_predictions.json', (req, res) => proxyToMl(req, res, '/stock_predictions.json'));

// Serve React build in production (Render single web service)
const buildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(buildPath)) {
  console.log('Serving React frontend from', buildPath);
  app.use(express.static(buildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/predict') return next();
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.warn('React build folder not found at', buildPath, '- run: npm run build');
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`ML proxy target: ${ML_SERVICE_URL}`);
});
