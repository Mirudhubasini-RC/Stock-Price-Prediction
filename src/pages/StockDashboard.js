import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import StockChart from "./StockChart"; // Custom StockChart component
import "../styles/StockDashboard.css"; // Ensure the path to styles is correct
import logo from "../assets/logo.png";
import logo_icon from "../assets/logo-icon.png";
import user_icon from "../assets/user-icon.png";


const StockDashboard = () => {
  const [marketData, setMarketData] = useState([]);
  const [selectedStock, setSelectedStock] = useState(""); // Default stock
  const [chartData, setChartData] = useState([]);
  const [searchTermSummary, setSearchTermSummary] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [userIcon, setUserIcon] = useState(null);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchTermChart, setSearchTermChart] = useState("");
  const [gainers, setGainers] = useState([]);
  const [losers, setLosers] = useState([]);
  const [defaultStocks] = useState([
    "AAPL", "AMD", "AMZN", "TSLA", "META", "FANG", "UBER", "MSFT"
  ]);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // State for toggling the menu
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const menuRef = useRef(null);
  const profileRef = useRef(null);




  useEffect(() => {
    // Retrieve user info from localStorage
    const user = JSON.parse(localStorage.getItem("user"));
    if (user) {
      setIsLoggedIn(true);
      setUsername(user.username);
      setUserIcon(user.userIcon);
    }
  }, []); // Empty dependency array to only run once on mount


  // Function to fetch the market data and summaries
  const fetchActiveStocks = async () => {
    try {
      const activeStocksResponse = await axios.get("http://localhost:8000/api/active-stocks");
      console.log("Active Stocks Response:", activeStocksResponse.data);
      setGainers(activeStocksResponse.data.gainers);
      setLosers(activeStocksResponse.data.losers);
    } catch (error) {
      console.error("Error fetching active stocks:", error);
    }
  };
  
  const fetchMarketData = async () => {
    try {
      const marketDataResponse = await Promise.all(
        defaultStocks.map((stock) => {
          return axios.get(`http://localhost:8000/api/stocks/${stock}`);
        })
      );
      setMarketData(marketDataResponse.map((response) => response.data)); // Update the marketData
    } catch (error) {
      console.error("Error fetching market data:", error);
    }
  };

  
  
  
  useEffect(() => {
    // Fetch active stocks (gainers and losers) when the component mounts
    fetchActiveStocks();
    // Fetch market data for the default stocks
    fetchMarketData();
  }, []); 

  const handleSearchSummary = async () => {
    try {
      // Otherwise, perform search
      const marketDataResponse = await axios.get(`http://localhost:8000/api/stocks/${searchTermSummary}`);
      setMarketData([marketDataResponse.data]);  // Only set this single result
      setIsSearchActive(true);  // Mark search as active
    } catch (error) {
      console.error("Error searching for stock:", error);
    }
  };

  const [selectedTimeFrame, setSelectedTimeFrame] = useState("1mo"); // Track the selected time frame

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

  const handleSearchChart = async () => {
    try {
      if (!searchTermChart) {
        // If no chart search term entered, set to default stock (e.g., TSLA)
        setSelectedStock("TSLA");
        const defaultChartData = await axios.get(
          `http://localhost:8000/api/stock/TSLA/historical?timeframe=${selectedTimeFrame}`
        );
        setChartData(defaultChartData.data);
        return;
      }
  
      const response = await axios.get(
        `http://localhost:8000/api/stock/${searchTermChart}/historical?timeframe=${selectedTimeFrame}`
      );
  
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        setChartData(response.data);
        setSelectedStock(searchTermChart); // update stock for chart
      } else {
        console.log("No data found for the selected stock.");
        setChartData([]); // Clear chart if no data
      }
    } catch (error) {
      console.error("Error fetching stock chart:", error);
    }
  };
  
  

  const handleKeyPressSummary = (e) => {
    if (e.key === "Enter") {
      handleSearchSummary();
    } else if (e.key === "Backspace" && !searchTermSummary.trim()) {
      // If the search term is empty, reset to default stock data
      setSearchTermSummary(""); // Reset the search term
      fetchMarketData();  // Re-fetch the default stock data
      setIsSearchActive(false);  // Set search to inactive
    }
  };

const handleLogout = () => {
  localStorage.removeItem("user"); // Remove user data from localStorage
  setIsLoggedIn(false);
  setUsername("");
  setUserIcon(null); // Optionally clear user icon on logout
};

  const handleKeyPressChart = (e) => {
    if (e.key === "Enter") handleSearchChart();
  };

  const handleScroll = (sectionId) => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleProfile = () => {
    setIsProfileOpen(!isProfileOpen); // Toggle profile dropdown
  };

  const navigate = useNavigate();

  return (
    <div className="stock-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <img src={logo_icon} alt="App Icon" className="app-icon" />
          <img src={logo} alt="App Name" className="app-name" />
        </div>
        <div className="header-right">
          <div className="navigation-buttons">
            <span onClick={() => handleScroll('market-summary')} className="nav-link">Market Summary</span>
            <span onClick={() => handleScroll('stock-chart')} className="nav-link">Stock Chart</span>
            <span onClick={() => handleScroll('gainers')} className="nav-link">Biggest Gainers</span>
            <span onClick={() => handleScroll('losers')} className="nav-link">Biggest Losers</span>
          </div>
          <button className="hamburger-menu" onClick={toggleMenu}>
            <span className="bar"></span>
            <span className="bar"></span>
            <span className="bar"></span>
          </button>
          {isMenuOpen && (
            <div className="hamburger-links" ref={menuRef}>
              <span onClick={() =>  navigate("/prediction")} className="nav-link">Prediction</span>
              <span onClick={() =>  navigate("/watchlist")} className="nav-link">Watchlist</span>
            </div>
          )}
        {!isLoggedIn ? (
          <button className="login-button" onClick={() => navigate("/signin")}>Login</button>
        ) : (
          <div>
            <img
              src={userIcon} 
              alt="User" 
              className="user-icon"
              onClick={toggleProfile} 
            />
            {isProfileOpen && (
              <div className="user-info" ref={profileRef}>
                <img src={user_icon} alt="User Icon" className="user-icon" />
                <span className="username">{username}</span>
                <button onClick={handleLogout} className="logout-button">Logout</button>
              </div>
            )}
          </div>
        )}
      </div>
      </header>

      {/* Market Summary Card */}
      <section id="market-summary" className="market-summary-section">
        <div className="card-container">
          <h3 className="card-title">Market Summary</h3>
          <input
            type="text"
            placeholder="Search for stocks..."
            className="summary-search-container"
            value={searchTermSummary} // Use searchTermSummary state
            onChange={(e) => setSearchTermSummary(e.target.value.toUpperCase())} // Update searchTermSummary state
            onKeyPress={handleKeyPressSummary} // Trigger summary search on Enter
          />
          <table className="market-summary">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>% Change</th>
              </tr>
            </thead>
            <tbody>
            {marketData.slice(0, 8).map((stock, idx) => {
                console.log(`Stock: ${stock.symbol}`);
                console.log(`Full Stock Data:`, stock); 
                console.log(`Price: ${stock.price}`);
                console.log(`Price Change Percent: ${stock.percentChange}`);

                return (
                  <tr key={idx} onClick={() => setSelectedStock(stock.symbol)}>
                    <td>{stock.symbol}</td>
                    <td>${(stock.price || 0).toFixed(2)}</td>
                    <td
                      style={{
                        color:
                          (stock.percentChange * 100 || 0) > 0 ? "green" : "red",
                      }}
                    >
                      {(stock.percentChange * 100|| 0).toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stock Chart Section */}
      <section id="stock-chart" className="stock-chart-section">
        <div className="card-container">
          <h3 className="card-title">Closing Price Stock Chart</h3>
          <input
            type="text"
            placeholder="Search for stocks..."
            className="chart-search"
            value={searchTermChart}
            onChange={(e) => setSearchTermChart(e.target.value.toUpperCase())}
            onKeyPress={handleKeyPressChart}
          />

                  {/* Buttons for Time Frame Selection */}
        <div className="chart-time-frame-options">
          <button
            className={`time-frame-btn ${selectedTimeFrame === "1d" ? "selected" : ""}`}
            onClick={() => handleTimeFrameChange('1d')}
          >
            1 Day
          </button>
          <button
            className={`time-frame-btn ${selectedTimeFrame === "1wk" ? "selected" : ""}`}
            onClick={() => handleTimeFrameChange('1wk')}
          >
            1 Week
          </button>
          <button
            className={`time-frame-btn ${selectedTimeFrame === "1mo" ? "selected" : ""}`}
            onClick={() => handleTimeFrameChange('1mo')}
          >
            1 Month
          </button>
          <button
            className={`time-frame-btn ${selectedTimeFrame === "1y" ? "selected" : ""}`}
            onClick={() => handleTimeFrameChange('1y')}
          >
            1 Year
          </button>
        </div>

        {selectedStock && (
          <div>
            <h3>{searchTermChart ? `${selectedStock} Chart` : "Search to display"}</h3>
            <StockChart data={chartData} />
          </div>
        )}

        </div>
      </section>

      {/* Biggest Gainers Section */}
      <section id="gainers" className="gainers-section">
        <div className="card-container">
          <h3 className="card-title">Biggest Gainers</h3>
          <table className="gainers-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Price</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
            {gainers.map((stock, idx) => {
                console.log("stock object:", stock);  // To check the whole stock object
                console.log("price:", stock.price);  // To check the value of price
                console.log("change:", stock.change);  // To check the value of change
                
                return (
                  <tr key={idx}>
                    <td>{stock.ticker}</td>
                    <td>${(stock.price || 0).toFixed(2)}</td>
                    <td
                      style={{
                        color:
                          (stock.change || 0) > 0 ? "green" : "red",
                      }}
                    >
                      {(stock.change || 0).toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>


{/* Biggest Losers Section */}
<section id="losers" className="losers-section">
  <div className="card-container">
    <h3 className="card-title">Biggest Losers</h3>
    <table className="losers-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Price</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        {losers.map((stock, idx) => (
          <tr key={idx}>
            <td>{stock.ticker}</td>
            <td>${(stock.price || 0).toFixed(2)}</td>
            <td style={{ color: 'red' }}>
            {(Number(stock.changePercent || 0).toFixed(2))}%

            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>

    </div>
  );
};

export default StockDashboard;
