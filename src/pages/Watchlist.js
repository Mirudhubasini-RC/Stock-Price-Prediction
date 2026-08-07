import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Watchlist.css"; // Ensure the path to styles is correct
import StockChart from "./StockChart"; // Custom StockChart component
import StatusBlock from "../components/StatusBlock";
import logo from "../assets/logo.png";
import logo_icon from "../assets/logo-icon.png";
import user_icon from "../assets/user-icon.png";
import { API_BASE } from "../config";

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
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [watchlistError, setWatchlistError] = useState("");
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState("");
  const [searchError, setSearchError] = useState("");

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
          setWatchlistError("Could not load watchlist — missing user ID.");
          return;
        }
        setLoadingWatchlist(true);
        setWatchlistError("");
        try {
          const response = await axios.get(`${API_BASE}/api/watchlist/${userId}`);
          setWatchlist(response.data || []);
          await fetchMarketData(response.data || []);
        } catch (error) {
          console.error("Error fetching watchlist:", error);
          setWatchlist([]);
          setMarketData([]);
          setWatchlistError("Could not load your watchlist. Please try again.");
        } finally {
          setLoadingWatchlist(false);
        }
      };
  
      fetchWatchlist();
    }
  }, [isLoggedIn]);
  

  const [selectedTimeFrame, setSelectedTimeFrame] = useState("1mo"); // Track the selected time frame
  useEffect(() => {
    const fetchChartData = async () => {
      if (!selectedStock) return;
      setLoadingChart(true);
      setChartError("");
      try {
        const response = await axios.get(
          `${API_BASE}/api/stock/${selectedStock}/historical?timeframe=${selectedTimeFrame}`
        );
        setChartData(Array.isArray(response.data) ? response.data : []);
        if (!Array.isArray(response.data) || response.data.length === 0) {
          setChartError(`No chart data found for ${selectedStock}.`);
        }
      } catch (error) {
        console.error("Error fetching chart data:", error);
        setChartData([]);
        setChartError(`Could not load chart for ${selectedStock}.`);
      } finally {
        setLoadingChart(false);
      }
    };
  
    fetchChartData();
  }, [selectedStock, selectedTimeFrame]);

  const fetchMarketData = async (watchlistSymbols) => {
    if (!watchlistSymbols.length) {
      setMarketData([]);
      return;
    }
    try {
      const marketDataResponse = await Promise.all(
        watchlistSymbols.map((stock) =>
          axios.get(`${API_BASE}/api/stocks/${stock.symbol}`)
        )
      );
  
      setMarketData(
        marketDataResponse.map((response) => ({
          symbol: response.data.symbol,
          companyName: response.data.companyName,
          currentPrice: response.data.currentPrice,
          previousClose: response.data.previousClose,
          openPrice: response.data.openPrice,
          dayRange: response.data.dayRange,
          volume: response.data.volume,
          percentChange: response.data.percentChange,
        }))
      );
    } catch (error) {
      console.error("Error fetching market data:", error);
      setMarketData([]);
      setWatchlistError("Could not load prices for watchlist stocks.");
    }
  };
  


  const handleTimeFrameChange = async (timeFrame) => {
    setSelectedTimeFrame(timeFrame);
    if (!selectedStock) return;
    setLoadingChart(true);
    setChartError("");
  
    try {
      const historicalDataResponse = await axios.get(`${API_BASE}/api/stock/${selectedStock}/historical?timeframe=${timeFrame}`);
      setChartData(Array.isArray(historicalDataResponse.data) ? historicalDataResponse.data : []);
    } catch (error) {
      console.error("Error fetching historical data for time frame:", error);
      setChartData([]);
      setChartError("Could not load chart data for this timeframe.");
    } finally {
      setLoadingChart(false);
    }
  };

    const handleSearch = async () => {
      if (!searchTerm.trim()) return;
      setSearchError("");
      setLoadingWatchlist(true);
      try {
        const marketDataResponse = await axios.get(
          `${API_BASE}/api/stocks/${searchTerm}`
        );
    
        setMarketData(prevData => {
          if (prevData.some((s) => s.symbol === marketDataResponse.data.symbol)) {
            return prevData;
          }
          return [...prevData, marketDataResponse.data];
        });
    
        const stock = marketDataResponse.data;
        
        if (!watchlist.some(w => w.symbol === searchTerm)) {
          await handleAddToWatchlist(stock);
          setWatchlist((prev) => [...prev, { symbol: stock.symbol }]);
        }
      } catch (error) {
        console.error("Error fetching stock data:", error);
        setSearchError(`Could not find stock "${searchTerm}".`);
      } finally {
        setLoadingWatchlist(false);
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
      const response = await axios.post(`${API_BASE}/api/watchlist/add`, {
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
        `${API_BASE}/api/watchlist/delete/${userId}/${stockSymbol}`
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
          {searchError && <StatusBlock error={searchError} compact />}
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
              <th>Company Name</th>
              <th>Symbol</th>
              <th>Current Price</th>
              <th>Previous Close</th>
              <th>Open Price</th>
              <th>Day's Range</th>
              <th>Volume</th>
              <th>% Change</th>
              <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {loadingWatchlist ? (
                <tr>
                  <td colSpan="9">
                    <StatusBlock loading loadingText="Loading your watchlist…" compact />
                  </td>
                </tr>
              ) : watchlistError ? (
                <tr>
                  <td colSpan="9">
                    <StatusBlock error={watchlistError} compact />
                  </td>
                </tr>
              ) : marketData.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <StatusBlock empty emptyText="Your watchlist is empty. Search a symbol to add one." compact />
                  </td>
                </tr>
              ) : (
                marketData.map((stock, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelectedStock(stock.symbol)}
                    className={selectedStock === stock.symbol ? "selected-row" : ""}
                    style={{
                      cursor: "pointer",
                    }}
                  >
                    <td>{stock.companyName}</td>
                    <td>{stock.symbol}</td>
                    <td>${(stock.currentPrice || 0).toFixed(2)}</td>
                    <td>${(stock.previousClose || 0).toFixed(2)}</td>
                    <td>${(stock.openPrice || 0).toFixed(2)}</td>
                    <td>{stock.dayRange}</td>
                    <td>{stock.volume?.toLocaleString()}</td>
                    <td
                      style={{
                        color: (stock.percentChange || 0) > 0 ? "green" : "red",
                      }}
                    >
                      {Number(stock.percentChange || 0).toFixed(2)}%
                    </td>
                    <td>
                      <button
                        className="remove-from-watchlist-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFromWatchlist(stock.symbol);
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {isLoggedIn && selectedStock ? (
        <>
          <section id="stock-chart" className="stock-chart-section">
            <div className="card-container">
              <h3 className="card-title">Closing Price Stock Chart</h3>
              <div className="chart-time-frame-options">
                
                <button
                  className={`time-frame-btn ${selectedTimeFrame === "1w" ? "selected" : ""}`}
                  onClick={() => handleTimeFrameChange("1w")}
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
              <div className="chart-container">
                {loadingChart ? (
                  <StatusBlock loading loadingText="Loading chart…" />
                ) : chartError ? (
                  <StatusBlock error={chartError} />
                ) : chartData.length > 0 ? (
                  <StockChart data={chartData} />
                ) : (
                  <StatusBlock empty emptyText="No chart data for this stock." />
                )}
              </div>
            </div>
          </section>
        </>
      ) : isLoggedIn ? (
        <StatusBlock empty emptyText="Select a stock from your watchlist to view its chart." />
      ) : null}
    </div>
  );
};

export default Watchlist;
