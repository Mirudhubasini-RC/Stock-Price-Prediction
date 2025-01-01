import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Watchlist.css"; // Ensure the path to styles is correct
import StockChart from "./StockChart"; // Custom StockChart component
import logo from "../assets/logo.png";
import logo_icon from "../assets/logo-icon.png";
import user_icon from "../assets/user-icon.png";

const Watchlist = () => {
  const [marketData, setMarketData] = useState([]);
  const [selectedStock, setSelectedStock] = useState(""); // Default stock
  const [chartData, setChartData] = useState([]);
  const [watchlist, setWatchlist] = useState([]);  // State to hold the user's watchlist
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [userIcon, setUserIcon] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    // Retrieve user info from localStorage
    const user = JSON.parse(localStorage.getItem("user"));
    if (user) {
      setIsLoggedIn(true);
      setUsername(user.username);
      setUserIcon(user.userIcon);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      const fetchWatchlist = async () => {
        const user = JSON.parse(localStorage.getItem("user"));
        const userId = user ? user.userId : null;
  
        if (!userId) {
          console.error("No user ID found. Cannot fetch watchlist.");
          return; // Exit if there is no valid user ID
        }
        console.log(userId);
        try {
          // Pass the userId (or any relevant user data) to the API
          const response = await axios.get(`http://localhost:8000/api/watchlist/${userId}`); // Fetch the user's watchlist using the user ID
          setWatchlist(response.data);
  
          // After the watchlist is fetched, now fetch the market data for each stock
          fetchMarketData(response.data); // Assuming this function works with a list of stock symbols
        } catch (error) {
          console.error("Error fetching watchlist:", error);
        }
      };
  
      fetchWatchlist();
    }
  }, [isLoggedIn]);
  

  const [selectedTimeFrame, setSelectedTimeFrame] = useState("1mo"); // Track the selected time frame
  useEffect(() => {
    const fetchChartData = async () => {
      if (selectedStock) {
        try {
          const response = await axios.get(
            `http://localhost:8000/api/stock/${selectedStock}/historical?timeframe=${selectedTimeFrame}`
          );
          setChartData(response.data);
        } catch (error) {
          console.error("Error fetching chart data:", error);
        }
      }
    };
  
    fetchChartData();
  }, [selectedStock, selectedTimeFrame]);

  const fetchMarketData = async (watchlistSymbols) => {
    console.log(watchlistSymbols);
    try {
      const marketDataResponse = await Promise.all(
        watchlistSymbols.map((stock) => {
          return axios.get(`http://localhost:8000/api/stocks/${stock.symbol}`);
        })
      );
      setMarketData(marketDataResponse.map((response) => response.data));
    } catch (error) {
      console.error("Error fetching market data:", error);
    }
  };


  const handleTimeFrameChange = async (timeFrame) => {
    setSelectedTimeFrame(timeFrame); // Update the selected time frame
  
    try {
      // Fetch the historical data for the selected time frame
      const historicalDataResponse = await axios.get(`http://localhost:8000/api/stock/${selectedStock}/historical?timeframe=${timeFrame}`);
      setChartData(historicalDataResponse.data);
    } catch (error) {
      console.error("Error fetching historical data for time frame:", error);
    }
  };

    const handleSearch = async () => {
      try {
        // Fetch stock details
        const marketDataResponse = await axios.get(
          `http://localhost:8000/api/stocks/${searchTerm}`
        );
        console.log('Market Data Response:', marketDataResponse.data);
    
        // Add the fetched data to the state directly and check if it exists in the watchlist
        setMarketData(prevData => [...prevData, marketDataResponse.data]);  // Append to the existing data
    
        // Extract the stock object
        const stock = marketDataResponse.data;
        
        // Check if stock is already in the watchlist
        if (!watchlist.some(w => w.symbol === searchTerm)) {  // Use 'some' to check if it's already in the watchlist
          // Add stock to watchlist if not already present
          await handleAddToWatchlist(stock);
        }
      } catch (error) {
        console.error("Error fetching stock data:", error);
      }
    };
      
  
  const handleAddToWatchlist = async (stock) => {
    console.log("Stock:", stock);  // Ensure the stock object is found
    
    const user = JSON.parse(localStorage.getItem("user"));  // Get user info from localStorage
    const userId = user ? user.userId : null;
    const username = user ? user.username : 'Guest';  // Get username from localStorage or default to 'Guest'
  
    if (!userId) {
      alert("You must be logged in to add to the watchlist");
      return;
    }
    try {
      const response = await axios.post('http://localhost:8000/api/watchlist/add', {
        symbol: stock.symbol,
        username: username,
        userId: userId
      });
      console.log('Response from backend:', response);
    } catch (error) {
      console.error("Error adding stock to watchlist:", error);
      console.error("Error details:", error.response ? error.response.data : error);
    }
  };
  

  const handleRemoveFromWatchlist = async (stockSymbol) => {
    try {
      // Call API to remove stock from the watchlist
      const user = JSON.parse(localStorage.getItem("user"));
      const userId = user ? user.userId : null;
  
      if (!userId) {
        alert("You must be logged in to remove stocks from the watchlist");
        return;
      }
  
      const response = await axios.delete(
        `http://localhost:8000/api/watchlist/delete/${userId}/${stockSymbol}`
      );
  
      // Check for a successful response (based on message content)
      if (response.data.message === "Stock deleted from watchlist") {
        // Remove stock from the frontend watchlist state (updating the watchlist immediately)
        setWatchlist((prevWatchlist) =>
          prevWatchlist.filter((stock) => stock.symbol !== stockSymbol)
        );  // Immediately update watchlist
  
        // Remove stock from the frontend market data if it exists there too
        setMarketData((prevMarketData) =>
          prevMarketData.filter((stock) => stock.symbol !== stockSymbol)
        );  // Immediately update marketData to reflect removal
  
        // Provide feedback to the user
        alert(`${stockSymbol} removed from watchlist.`);
      } else {
        alert(response.data.message);  // Show the message from the backend (e.g., stock not found)
      }
    } catch (error) {
      console.error("Error removing stock from watchlist:", error);
      alert("There was an error while removing the stock from your watchlist.");
    }
  };
  
  

  const handleLogout = () => {
    localStorage.removeItem("user"); // Remove user data from localStorage
    setIsLoggedIn(false);
    setUsername("");
    setUserIcon(null); // Optionally clear user icon on logout
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleProfile = () => {
    setIsProfileOpen(!isProfileOpen); // Toggle profile dropdown
  };

  const navigate = useNavigate();

  return (
    <div className="watchlist-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <img src={logo_icon} alt="App Icon" className="app-icon" />
          <img src={logo} alt="App Name" className="app-name" />
        </div>
        <div className="header-right">
          <button className="hamburger-menu" onClick={toggleMenu}>
            <span className="bar"></span>
            <span className="bar"></span>
            <span className="bar"></span>
          </button>
          {isMenuOpen && (
            <div className="hamburger-links">
              <span onClick={() => navigate("/prediction")} className="nav-link">Prediction</span>
              <span onClick={() => navigate("/")} className="nav-link">Home</span>
            </div>
          )}
          {!isLoggedIn ? (
            <button className="login-button" onClick={() => navigate("/signin")}>Login</button>
          ) : (
            <div>
              <img
                src={user_icon}
                alt="User"
                className="user-icon"
                onClick={toggleProfile}
              />
              {isProfileOpen && (
                <div className="user-info">
                  <img src={user_icon} alt="User Icon" className="user-icon" />
                  <span className="username">{username}</span>
                  <button onClick={handleLogout} className="logout-button">Logout</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Search for Stocks */}
      <div className="serach-area">
        <section className="search-section">
          <input
            type="text"
            placeholder="Search for stocks..."
            className="summary-search-container"
            value={searchTerm} // Use searchTerm state
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())} // Update searchTerm state
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()} // Trigger search on Enter
          />
        </section>
      </div>

      {/* Conditional Render */}
      {!isLoggedIn ? (
        <section className="login-card">
          <h2>Login to Add to Watchlist</h2>
          <p>Please log in to save stocks to your watchlist.</p>
          <button className="login-button" onClick={() => navigate("/signin")}>Login</button>
        </section>
      ) : (
        // Watchlist Section
        <section id="watchlist-summary" className="market-summary-section">
          <h3>Your Watchlist</h3>
          <table className="market-summary">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>% Change</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {marketData.length > 0 &&
                marketData.map((stock, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelectedStock(stock.symbol)} // Update selected stock
                    className={selectedStock === stock.symbol ? "selected-row" : ""} // Add selected-row class conditionally
                    style={{
                      cursor: "pointer",
                    }}
                  >
                    <td>{stock.symbol}</td>
                    <td>${(stock.price || 0).toFixed(2)}</td>
                    <td
                      style={{
                        color: (stock.percentChange * 100 || 0) > 0 ? "green" : "red",
                      }}
                    >
                      {(stock.percentChange * 100 || 0).toFixed(2)}%
                    </td>
                    <td>
                      <button
                        className="remove-from-watchlist-btn"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row click
                          handleRemoveFromWatchlist(stock.symbol);
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>

                ))}
            </tbody>
          </table>
        </section>
      )}

      {isLoggedIn && selectedStock ? (
        <>
          <section id="stock-chart" className="stock-chart-section">
            <div className="card-container">
              <h3 className="card-title">Closing Price Stock Chart</h3>
              {/* Buttons for Time Frame Selection */}
              <div className="chart-time-frame-options">
                <button
                  className={`time-frame-btn ${selectedTimeFrame === "1d" ? "selected" : ""}`}
                  onClick={() => handleTimeFrameChange("1d")}
                >
                  1 Day
                </button>
                <button
                  className={`time-frame-btn ${selectedTimeFrame === "1wk" ? "selected" : ""}`}
                  onClick={() => handleTimeFrameChange("1wk")}
                >
                  1 Week
                </button>
                <button
                  className={`time-frame-btn ${selectedTimeFrame === "1mo" ? "selected" : ""}`}
                  onClick={() => handleTimeFrameChange("1mo")}
                >
                  1 Month
                </button>
                <button
                  className={`time-frame-btn ${selectedTimeFrame === "1y" ? "selected" : ""}`}
                  onClick={() => handleTimeFrameChange("1y")}
                >
                  1 Year
                </button>
              </div>
              {/* Render chart data */}
              <div className="chart-container">
                {chartData.length > 0 ? (
                  <StockChart data={chartData} /> // Replace with your chart library/component
                ) : (
                  <p>Loading chart data...</p>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <p>Select a stock from your watchlist to view its chart.</p>
      )}
    </div>
  );
};

export default Watchlist;
