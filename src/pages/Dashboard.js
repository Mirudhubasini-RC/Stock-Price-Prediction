import React, { useState, useEffect } from "react";
import axios from "axios";
import "/Users/mirudhubasinirc/Documents/Stock Closing Price Prediction/stock-prediction/src/styles/Dashboard.css";

const Dashboard = () => {
  const [marketData, setMarketData] = useState([]);
  const [screenerData, setScreenerData] = useState([]);

  useEffect(() => {
    fetchMarketData();
    fetchMarketScreener();
  }, []);

  const fetchMarketData = async () => {
    try {
      const symbols = ["AAPL", "AMD", "AMZN", "META", "TSLA"]; // List of symbols
  
      // Fetch market data for each symbol
      const responses = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const response = await axios.get(
              `https://yahoo-finance15.p.rapidapi.com/api/v1/stock/${symbol}/quote`, // Ensure endpoint is correct
              {
                headers: {
                  "x-rapidapi-host": "yahoo-finance15.p.rapidapi.com",
                  "x-rapidapi-key": "a5ef3e69c6mshda497e2a0913a70p1f0eccjsnba3012b15afc",
                },
              }
            );
  
            // Extract required data
            return {
              symbol: response.data.symbol || symbol,
              price: response.data.regularMarketPrice || null,  // Set default to null if not available
              change: response.data.regularMarketChangePercent || null,  // Set default to null if not available
            };
          } catch (error) {
            console.error(`Error fetching data for symbol ${symbol}:`, error);
  
            // Return default values if fetching fails
            return {
              symbol,
              price: null,
              change: null,
            };
          }
        })
      );
  
      // Update state with fetched data
      setMarketData(responses);
    } catch (error) {
      console.error("Error fetching market data:", error);
    }
  };

  

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-header">Markets Today</h1>

      <div className="market-summary">
        <h2>Market Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>% Change</th>
            </tr>
          </thead>
          <tbody>
            {marketData.map((data, index) => (
              <tr key={index}>
                <td>{data.symbol}</td>
                <td>{data.price != null ? data.price.toFixed(2) : "N/A"}</td>
                <td
                  style={{
                    color: data.change > 0 ? "green" : "red",
                  }}
                >
                  {data.change != null ? (data.change > 0 ? `+${data.change.toFixed(2)}%` : `${data.change.toFixed(2)}%`) : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Market Screener Section */}
      <div className="market-screener">
        <h2>Market Screener</h2>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company Name</th>
              <th>Price</th>
              <th>% Change</th>
            </tr>
          </thead>
          <tbody>
            {screenerData.map((data, index) => (
              <tr key={index}>
                <td>{data.symbol}</td>
                <td>{data.name}</td>
                <td>{data.price != null ? data.price.toFixed(2) : "N/A"}</td>
                <td
                  style={{
                    color: data.changePercent > 0 ? "green" : "red",
                  }}
                >
                  {data.changePercent != null ? (data.changePercent > 0 ? `+${data.changePercent.toFixed(2)}%` : `${data.changePercent.toFixed(2)}%`) : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
