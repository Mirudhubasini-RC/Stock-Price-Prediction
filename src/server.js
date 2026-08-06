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

const cache = new Map();
let yahooQueue = Promise.resolve();
// Start in local mode so deploy/demo works while Yahoo is rate-limited
let yahooCooldownUntil = Date.now() + YAHOO_COOLDOWN_MS;

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

/** Run Yahoo calls one-at-a-time with a gap between them. */
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

  // Prefer local CSV / fallback while Yahoo is cooling down
  if (!yahooAvailable()) {
    return setCache(key, localQuote(symbol));
  }

  try {
    const quote = await enqueueYahoo(() => yahooFinance.quote(symbol));
    if (!quote) throw new Error(`No quote for ${symbol}`);
    return setCache(key, mapQuoteToStock(symbol, quote));
  } catch (err) {
    if (isRateLimited(err)) markYahooCooldown(symbol);
    const stale = getStaleCache(key);
    if (stale) return stale;
    return setCache(key, localQuote(symbol));
  }
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

// Welcome endpoint
app.get('/', (req, res) => {
  res.send('Welcome to the stock prediction server');
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

  // Prefer local CSV so charts work even when Yahoo is blocked
  const local = historicalFromCsv(symbol, timeframe);
  if (local && local.length) {
    return res.json(setCache(cacheKey, local));
  }

  if (!yahooAvailable()) {
    return res.status(503).json({
      error: 'No local history for this symbol and Yahoo is rate-limited. Try AAPL, AMZN, GOOG, ORCL, or RYCEY.',
    });
  }

  let startDate = new Date();
  const endDate = new Date();
  if (timeframe === '1y') {
    startDate.setFullYear(startDate.getFullYear() - 1);
  } else {
    startDate.setMonth(startDate.getMonth() - 1);
  }

  try {
    const chart = await enqueueYahoo(() =>
      yahooFinance.chart(symbol, {
        period1: startDate.toISOString().split('T')[0],
        period2: endDate.toISOString().split('T')[0],
        interval: '1d',
      })
    );

    const quotes = (chart && chart.quotes) || [];
    const historicalData = quotes
      .filter((q) => q && q.close != null)
      .map((q) => ({
        date: q.date,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
      }));

    if (!historicalData.length) {
      return res.status(404).json({
        error: `No historical data found for symbol: ${symbol} for the timeframe: ${timeframe}`,
      });
    }

    let payload = historicalData;
    if (timeframe === '1w') {
      payload = historicalData.slice(-5);
      if (payload.length < 5) {
        return res.status(404).json({ error: 'Not enough trading data found for 1w view.' });
      }
    }

    return res.json(setCache(cacheKey, payload));
  } catch (error) {
    if (isRateLimited(error)) markYahooCooldown('historical');
    const stale = getStaleCache(cacheKey);
    if (stale) return res.json(stale);
    console.error('Error fetching historical data:', error.message || error);
    return res.status(isRateLimited(error) ? 429 : 500).json({
      error: isRateLimited(error)
        ? 'Yahoo Finance rate limit hit. Try AAPL/AMZN/GOOG from local data.'
        : 'Failed to fetch historical data',
    });
  }
});

async function buildActiveStocks() {
  const cacheKey = 'active-stocks';
  const hit = getCache(cacheKey);
  if (hit) return hit;

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

/** One request for the whole dashboard — avoids parallel Yahoo bursts from the browser. */
app.get('/api/market-overview', async (req, res) => {
  try {
    // While rate-limited, serve local CSV / fallback instantly (no Yahoo calls)
    if (!yahooAvailable()) {
      return res.json({
        marketData: DEFAULT_STOCKS.map((s) => localQuote(s)),
        gainers: FALLBACK_ACTIVE.gainers,
        losers: FALLBACK_ACTIVE.losers,
        source: 'local',
      });
    }

    const marketData = [];
    for (const symbol of DEFAULT_STOCKS) {
      if (!yahooAvailable()) {
        marketData.push(localQuote(symbol));
        continue;
      }
      try {
        marketData.push(await fetchQuoteCached(symbol));
      } catch (err) {
        marketData.push(localQuote(symbol));
      }
    }
    const active = await buildActiveStocks();
    res.json({
      marketData: marketData.length ? marketData : FALLBACK_MARKET,
      gainers: active.gainers,
      losers: active.losers,
      source: yahooAvailable() ? 'yahoo' : 'local',
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

// Serve React build in production (Render single web service)
const buildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
