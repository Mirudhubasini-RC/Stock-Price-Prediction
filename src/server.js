const express = require('express');
const session = require('express-session');
require('dotenv').config(); // Adjust the path to your .env file location

const bcrypt = require('bcryptjs');
const yahooFinance = require('yahoo-finance2').default;
const cors = require('cors');
const mysql = require('mysql2');
const sessionSecret = process.env.SECRET_KEY;
console.log('SESSION_SECRET:', sessionSecret); 
const app = express();
const port = 8000;  // Port for the server

app.use(cors({
  origin: 'http://localhost:3000',  // Frontend URL
  methods: ['POST', 'GET'],
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
app.get("/api/watchlist", (req, res) => {
  const userId = req.query.userId; // Get userId from the query parameter (logged-in user)

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
app.post("/api/watchlist/add", (req, res) => {
  const { symbol, name, price, changePercent, userId } = req.body;  // Get the stock data from the request body

  if (!userId || !symbol || !name || !price || !changePercent) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const query = `
    INSERT INTO watchlist (symbol, name, price, changePercent, user_id) 
    VALUES (?, ?, ?, ?, ?) 
    ON DUPLICATE KEY UPDATE price = ?, changePercent = ?`; // On duplicate, update price and changePercent
  db.query(
    query,
    [symbol, name, price, changePercent, userId, price, changePercent],
    (err, results) => {
      if (err) {
        console.error("Error adding stock to watchlist:", err);
        return res.status(500).json({ message: "Error adding stock" });
      }
      res.status(200).json({ message: "Stock added to watchlist" });
    }
  );
});


app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;  // Get the stock symbol from the URL
    console.log(`Fetching stock data for symbol: ${symbol}`);

    // Fetch stock data for the provided symbol
    const result = await yahooFinance.quoteSummary(symbol, { modules: ['price', 'summaryDetail'] });

    // Extract the price and percentage change
    const price = result.price.regularMarketPrice; // Stock price
    const percentChange = result.price.regularMarketChangePercent; // Percentage change
    console.log(`Stock Price: ${price}, Percentage Change: ${percentChange}`);

    // Check if the data exists and return the result
    if (price && percentChange !== undefined) {
      console.log(`Returning data for symbol: ${symbol}`);
      res.json({
        symbol: symbol,
        price: price,
        percentChange: percentChange
      });
    } else {
      console.log(`Data not found for symbol: ${symbol}`);
      res.status(404).json({ error: 'Data not found for the given symbol' });
    }
  } catch (err) {
    console.error("Error fetching stock data:", err.message);
    res.status(500).json({ error: "Unable to fetch stock data. Please try again later." });
  }
});



// Endpoint to fetch historical stock data
app.get('/api/stock/:symbol/historical', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe } = req.query;  // Use timeframe instead of period

  // Validate timeframe parameter
  const validTimeFrames = ['1d', '1w', '1mo', '1y'];
  if (!validTimeFrames.includes(timeframe)) {
    return res.status(400).json({ error: 'Invalid timeframe. Allowed values: 1d, 1w, 1mo, 1y' });
  }

  // Calculate the start date based on the timeframe
  let startDate, endDate;
  switch (timeframe) {
    case '1d':
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);  // 1 day ago
      break;
    case '1w':
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);  // Get data for the last month
      break;
    case '1mo':
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);  // 1 month ago
      break;
    case '1y':
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);  // 1 year ago
      break;
    default:
      break;
  }
  endDate = new Date();

  // Format dates in the appropriate way for Yahoo Finance
  const startIsoDate = startDate.toISOString().split('T')[0]; // Format to 'yyyy-mm-dd'
  const endIsoDate = endDate.toISOString().split('T')[0]; // Format to 'yyyy-mm-dd'

  // Fetch daily historical data from Yahoo Finance
  try {
    const historicalData = await yahooFinance.historical(symbol, {
      period1: startIsoDate,  // Start date (yyyy-mm-dd)
      period2: endIsoDate,    // End date (yyyy-mm-dd)
    });

    if (!historicalData || historicalData.length === 0) {
      return res.status(404).json({ error: `No historical data found for symbol: ${symbol} for the timeframe: ${timeframe}` });
    }

    // If timeframe is '1w' (Weekly), aggregate daily data into weekly data
    if (timeframe === '1w') {
      const weeklyData = aggregateDataIntoWeeks(historicalData);
      return res.json(weeklyData);
    }

    res.json(historicalData);
  } catch (error) {
    console.error("Error fetching historical data:", error);
    return res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Helper function to aggregate daily data into weekly data
function aggregateDataIntoWeeks(dailyData) {
  const weeklyData = [];
  let week = [];
  let weekStartDate = null;

  // Group data into weeks
  for (let i = 0; i < dailyData.length; i++) {
    const day = dailyData[i];
    if (i % 5 === 0) { // Start of a new week (assuming 5 trading days per week)
      if (week.length) {
        // Add the aggregate of the previous week (e.g., using the closing price)
        const avgClosePrice = week.reduce((sum, data) => sum + data.close, 0) / week.length;
        weeklyData.push({
          weekStartDate,
          avgClosePrice,
        });
      }
      // Reset for the new week
      week = [day];
      weekStartDate = day.date;
    } else {
      week.push(day);
    }
  }
  
  // For the last week
  if (week.length) {
    const avgClosePrice = week.reduce((sum, data) => sum + data.close, 0) / week.length;
    weeklyData.push({
      weekStartDate,
      avgClosePrice,
    });
  }

  return weeklyData;
}

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
