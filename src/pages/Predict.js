import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "/Users/mirudhubasinirc/Documents/Stock Closing Price Prediction/stock-prediction/src/styles/Predict.css";
import logo from "../assets/logo.png";
import logo_icon from "../assets/logo-icon.png";
import user_icon from "../assets/user-icon.png";

const stockMetrics = {
  ORCL: { RMSE: 3.7270, MAPE: "1.55%" },
  GOOG: { RMSE: 3.17945, MAPE: "1.30%" },
  AMZN: { RMSE: 5.5617, MAPE: "2.49%" },
  AAPL: { RMSE: 3.2686, MAPE: "1.11%" },
  RYCEY: { RMSE: 0.1622, MAPE: "1.61%" },
};

const stockMetricsArimaGarch = {
  ORCL: { RMSE: 10.5182, MAPE: "2.85%" },
  GOOG: { RMSE: 3.0787, MAPE: "1.31%" },
  AMZN: { RMSE: 3.3717, MAPE: "1.33%" },
  AAPL: { RMSE: 3.1890, MAPE: "1.10%" },
  RYCEY: { RMSE: 0.1563, MAPE: "1.62%" },
};



const Predict = () => {
  const [selectedStock, setSelectedStock] = useState("AAPL");
  const [selectedTimeframe, setSelectedTimeframe] = useState("tomorrow");
  const [predictionData, setPredictionData] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userIcon, setUserIcon] = useState(null);
  const [submittedTimeframe, setSubmittedTimeframe] = useState(selectedTimeframe);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [username, setUsername] = useState("User");
  const [stockDecision, setStockDecision] = useState(""); 
  const [stockMetricsData, setStockMetricsData] = useState(null); // Store RMSE & MAPE

  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (user) {
      setIsLoggedIn(true);
      setUsername(user.username);
      setUserIcon(user.userIcon);
    }
  }, []);

  // Fetch Stock Price Prediction
  const handleSubmit = async (e) => {
    e.preventDefault();
    setPredictionData(null);
    setSubmittedTimeframe(selectedTimeframe);
    setStockMetricsData(stockMetrics[selectedStock]); // Set LSTM accuracy for selected stock

    const formattedTimeframe = selectedTimeframe.replace("_", " ");
  
    try {
      const response = await fetch("http://127.0.0.1:3001/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stock: selectedStock, timeframe: formattedTimeframe }),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
  
      const data = await response.json();
      console.log("Received Prediction Data:", data);
  
      setPredictionData(data);
      setStockDecision(data.decision);
  
    } catch (error) {
      console.error("Error fetching predictions:", error);
    }
  };

  return (
    <div className="watchlist-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <img src={logo_icon} alt="App Icon" className="app-icon" />
          <img src={logo} alt="App Name" className="app-name" />
        </div>
        <div className="header-right">
          <button className="hamburger-menu" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <span className="bar"></span>
            <span className="bar"></span>
            <span className="bar"></span>
          </button>
          {isMenuOpen && (
            <div className="hamburger-links">
              <span onClick={() => navigate("/")} className="nav-link">Home</span>
              <span onClick={() => navigate("/watchlist")} className="nav-link">Watchlist</span>
            </div>
          )}
          {!isLoggedIn ? (
            <button className="login-button" onClick={() => navigate("/signin")}>Login</button>
          ) : (
            <div>
              <img src={user_icon} alt="User" className="user-icon" onClick={() => setIsProfileOpen(!isProfileOpen)} />
              {isProfileOpen && (
                <div className="user-info">
                  <img src={user_icon} alt="User Icon" className="user-icon" />
                  <span className="username">{username}</span>
                  <button onClick={() => setIsLoggedIn(false)} className="logout-button">Logout</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="form">
        <h2 className="title">Stock Prediction</h2>

        <label className="label">Select a Stock:</label>
        <select value={selectedStock} onChange={(e) => setSelectedStock(e.target.value)} className="select">
          {["AAPL", "GOOG", "ORCL", "RYCEY", "AMZN"].map((stock) => (
            <option key={stock} value={stock}>{stock}</option>
          ))}
        </select>

        <label className="label">Select Timeframe:</label>
        <select value={selectedTimeframe} onChange={(e) => setSelectedTimeframe(e.target.value)} className="select">
          {["tomorrow", "1_week", "1_month"].map((timeframe) => (
            <option key={timeframe} value={timeframe}>{timeframe.replace("_", " ")}</option>
          ))}
        </select>

        <button type="submit" className="button">Predict</button>
      </form>

      {predictionData && (
        <div className="prediction-container">
          <div className="decision-box">
            <h3>Stock Decision</h3>
            <p className={`decision ${stockDecision.toLowerCase()}`}>{stockDecision}</p>
          </div>
          <h2>Prediction Results for {selectedStock} ({selectedTimeframe.replace("_", " ")})</h2>

          <div className="prediction-box-container">
            {/* LSTM Model Prediction */}
            <div className="prediction-box">
              <h3>LSTM</h3>
              <table className="prediction-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Predicted Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{predictionData.lstm.Date}</td>
                    <td>${predictionData.lstm.Predicted_Close}</td>
                  </tr>
                </tbody>
              </table>

              {/* LSTM Model Accuracy */}
              {stockMetricsData && (
                <div className="accuracy-box">
                  <h4>Model Accuracy (LSTM)</h4>
                  <p><strong>RMSE:</strong> {stockMetricsData.RMSE}</p>
                  <p><strong>MAPE:</strong> {stockMetricsData.MAPE}</p>
                </div>
              )}
            </div>

            {/* ARIMA-GARCH Model Prediction */}
            <div className="prediction-box">
              <h3>ARIMA-GARCH</h3>
              {predictionData.arima_garch.error ? (
                <p className="error-message">Error: {predictionData.arima_garch.error}</p>
              ) : (
                <table className="prediction-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Predicted Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{predictionData.arima_garch.Date}</td>
                      <td>${predictionData.arima_garch.Predicted_Close}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {/* ARIMA-GARCH Model Accuracy */}
              {stockMetricsArimaGarch[selectedStock] && (
                <div className="accuracy-box">
                  <h4>Model Accuracy (ARIMA-GARCH)</h4>
                  <p><strong>RMSE:</strong> {stockMetricsArimaGarch[selectedStock].RMSE}</p>
                  <p><strong>MAPE:</strong> {stockMetricsArimaGarch[selectedStock].MAPE}</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Predict;
