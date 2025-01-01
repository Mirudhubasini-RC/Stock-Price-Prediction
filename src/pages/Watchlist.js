import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import StockChart from "./StockChart";
import "../styles/Watchlist.css";

const Watchlist = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [watchlist, setWatchlist] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [selectedTimeFrame, setSelectedTimeFrame] = useState("1d");
  const navigate = useNavigate();


  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    
    if (user && user.userId) {  // Check for user.userId (not user.id)
      setIsLoggedIn(true);
      setUsername(user.username);
      
      // Fetch the watchlist using the userId
      axios
        .get(`http://localhost:8000/api/watchlist?userId=${user.userId}`)
        .then((res) => {
          setWatchlist(res.data);
        })
        .catch((err) => {
          console.error("Error fetching watchlist:", err);
          setWatchlist([]);  // Or show an error message
        });
    }
  }, [isLoggedIn]);  // Run this effect when isLoggedIn is updated
  

  const searchStocks = async () => {
    if (!searchTerm) return;
    console.log("Searching for:", searchTerm);
    try {
      const res = await axios.get(`http://localhost:8000/api/stocks/${searchTerm}`);
      console.log("Search results:", res.data);
      setSearchResults(res.data);
    } catch (err) {
      console.error("Error searching stocks:", err);
    }
  };

  const addStockToWatchlist = async (stock) => {
    try {
      await axios.post("http://localhost:8000/api/watchlist/add", { stock });
      setWatchlist((prev) => [...prev, stock]);
      setSearchResults([]);
      setSearchTerm("");
    } catch (err) {
      console.error("Error adding stock:", err);
    }
  };

  const fetchChartData = async (stockSymbol, timeframe) => {
    try {
      const res = await axios.get(`http://localhost:8000/api/stock/${stockSymbol}/historical?timeframe=${timeframe}`);
      setChartData(res.data);
    } catch (err) {
      console.error("Error fetching chart data:", err);
    }
  };

  const handleStockSelect = (stock) => {
    setSelectedStock(stock);
    fetchChartData(stock.symbol, selectedTimeFrame);
  };

  const handleTimeFrameChange = (timeframe) => {
    setSelectedTimeFrame(timeframe);
    if (selectedStock) {
      fetchChartData(selectedStock.symbol, timeframe);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="not-logged-in">
        <p>
          Please <span onClick={() => navigate("/signin")}>log in</span> to view your watchlist.
        </p>
      </div>
    );
  }

  return (
    <div className="watchlist-container">
      <div className="sidebar">
        <h3>{username}'s Watchlist</h3>
        <input
          type="text"
          placeholder="Search for stocks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
          onKeyPress={(e) => e.key === "Enter" && searchStocks()}
        />
        <button onClick={searchStocks} className="search-btn">Search</button>

        {searchResults.length > 0 && (
          <div className="search-results">
            <h4>Search Results</h4>
            <ul>
              {searchResults.map((stock) => (
                <li key={stock.symbol} onClick={() => addStockToWatchlist(stock)}>
                  {stock.symbol} - {stock.name}
                  <span style={{ color: stock.changePercent > 0 ? "green" : "red" }}>
                    {stock.changePercent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>% Change</th>
            </tr>
          </thead>
          <tbody>
            {watchlist.map((stock) => (
              <tr
                key={stock.symbol}
                onClick={() => handleStockSelect(stock)}
                className={selectedStock?.symbol === stock.symbol ? "selected-row" : ""}
              >
                <td>{stock.symbol}</td>
                <td>${stock.price}</td>
                <td
                  style={{
                    color: stock.changePercent > 0 ? "green" : "red",
                  }}
                >
                  {stock.changePercent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chart-section">
        {selectedStock ? (
          <>
            <h3>{selectedStock.symbol} - Stock Chart</h3>
            <div className="time-frame-options">
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
            <StockChart data={chartData} />
          </>
        ) : (
          <h3>Select a stock from the watchlist to view the chart.</h3>
        )}
      </div>
    </div>
  );
};

export default Watchlist;