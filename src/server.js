const express = require('express');
const session = require('express-session');
require('dotenv').config({ path: '../.env' }); // Go up one level to find .env
 // Adjust the path to your .env file location

const bcrypt = require('bcryptjs');
const yahooFinance = require('yahoo-finance2').default;
const cors = require('cors');
const mysql = require('mysql2');
const sessionSecret = process.env.SECRET_KEY;
console.log('SESSION_SECRET:', sessionSecret); 
const app = express();
const port = 8001;  // Port for the server

app.use(cors({
  origin: 'http://localhost:3000',  // Frontend URL
  methods: ['POST', 'GET','DELETE'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,   // securely load the secret from the .env file
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' },  // In production, cookies are sent only over HTTPS
}));

// Set up MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',  // Use your root password if any
  database: 'stock_prediction'
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
    const symbol = req.params.symbol;
    console.log(`Fetching stock data for symbol: ${symbol}`);

    // Fetch stock data from Yahoo Finance
    const result = await yahooFinance.quoteSummary(symbol, { modules: ['price', 'summaryDetail'] });

    if (!result || !result.price) {
      console.log(`Data not found for symbol: ${symbol}`);
      return res.status(404).json({ error: 'Data not found for the given symbol' });
    }

    // Extract stock details
    const stockData = {
      symbol: symbol,
      companyName: result.price.longName || result.price.shortName || "N/A", // Company name
      currentPrice: result.price.regularMarketPrice || "N/A", // Current stock price
      previousClose: result.price.regularMarketPreviousClose || "N/A", // Previous close price
      openPrice: result.price.regularMarketOpen || "N/A", // Opening price
      dayRange: `${result.price.regularMarketDayLow || "N/A"} - ${result.price.regularMarketDayHigh || "N/A"}`, // Day's range
      volume: result.price.regularMarketVolume || "N/A", // Trading volume
      percentChange: result.price.regularMarketChangePercent || "N/A" // Percentage change
    };

    console.log(`Returning data for symbol: ${symbol}`, stockData);
    res.json(stockData);

  } catch (err) {
    console.error("Error fetching stock data:", err.message);
    res.status(500).json({ error: "Unable to fetch stock data. Please try again later." });
  }
});

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.get('/api/stock/:symbol/historical', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe } = req.query;

  const validTimeFrames = ['1w', '1mo', '1y'];
  if (!validTimeFrames.includes(timeframe)) {
    return res.status(400).json({ error: 'Invalid timeframe. Allowed values: 1w, 1mo, 1y' });
  }

  let startDate = new Date();
  let endDate = new Date();

  // Always fetch at least 1 month of data to extract smaller timeframes
  if (timeframe === '1y') {
    startDate.setFullYear(startDate.getFullYear() - 1);
  } else {
    startDate.setMonth(startDate.getMonth() - 1);
  }

  const startIsoDate = startDate.toISOString().split('T')[0];
  const endIsoDate = endDate.toISOString().split('T')[0];

  try {
    const historicalData = await yahooFinance.historical(symbol, {
      period1: startIsoDate,
      period2: endIsoDate,
    });

    if (!historicalData || historicalData.length === 0) {
      return res.status(404).json({ error: `No historical data found for symbol: ${symbol} for the timeframe: ${timeframe}` });
    }

    // Sort data in ascending order
    historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));


    if (timeframe === '1w') {
      // Return last 5 trading days (raw OHLC)
      const lastFiveDays = [];
      const seenDates = new Set();

      for (let i = historicalData.length - 1; i >= 0 && lastFiveDays.length < 5; i--) {
        const dateStr = new Date(historicalData[i].date).toISOString().split('T')[0];
        if (!seenDates.has(dateStr)) {
          lastFiveDays.unshift({
            date: historicalData[i].date,
            open: historicalData[i].open,
            high: historicalData[i].high,
            low: historicalData[i].low,
            close: historicalData[i].close,
          });
          seenDates.add(dateStr);
        }
      }

      if (lastFiveDays.length < 5) {
        return res.status(404).json({ error: `Not enough trading data found for 1w view.` });
      }

      return res.json(lastFiveDays);
    }

    if (timeframe === '1mo') {
      return res.json(historicalData);
    }

    if (timeframe === '1y') {
      return res.json(historicalData);
    }

  } catch (error) {
    console.error("Error fetching historical data:", error);
    return res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});



// Endpoint to fetch active gainers and losers dynamically
app.get('/api/active-stocks', async (req, res) => {
  try {
    // Fetch trending stocks from Yahoo Finance
    const trendingData = await yahooFinance.trendingSymbols("US");
  
    // Extract symbols from the quotes array
    const symbols = trendingData.quotes.map((item) => item.symbol);

    if (symbols.length === 0) {
      return res.status(404).json({ error: "No active stocks found." });
    }

    // Fetch quote data for these symbols
    const results = await Promise.all(symbols.map((symbol) => yahooFinance.quote(symbol)));

    // Separate into gainers and losers with extended data
    const gainers = results
      .filter((stock) => stock && stock.regularMarketChangePercent > 0)
      .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
      .slice(0, 10)
      .map((stock) => ({
        ticker: stock.symbol || 'N/A',  // Ticker Symbol
        price: stock.regularMarketPrice || 'N/A',  // Current Price
        change: stock.regularMarketChange || 'N/A',  // Price Change
        changePercent: stock.regularMarketChangePercent || 'N/A',  // Price Change Percentage
      }));

    const losers = results
      .filter((stock) => stock && stock.regularMarketChangePercent < 0)
      .sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent)
      .slice(0, 10)
      .map((stock) => ({
        ticker: stock.symbol || 'N/A',
        price: stock.regularMarketPrice || 'N/A',
        change: stock.regularMarketChange || 'N/A',
        changePercent: stock.regularMarketChangePercent || 'N/A',
      }));

    res.json({ gainers, losers });
  } catch (error) {
    console.error("Error fetching active stocks:", error);
    res.status(500).json({ error: "Unable to fetch active stock data." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
