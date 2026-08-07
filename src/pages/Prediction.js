import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Brush
} from "recharts";
import StatusBlock from "../components/StatusBlock";
import { API_BASE } from "../config";

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: "rgba(0, 0, 0, 0.8)", 
        color: "#fff", 
        padding: "10px", 
        borderRadius: "5px",
        border: "1px solid #fff",
        boxShadow: "2px 2px 5px rgba(0,0,0,0.3)"
      }}>
        <p><strong>Date:</strong> {label}</p>
        <p><strong>Forecasted:</strong> {payload[0]?.value}</p>
        <p><strong>Actual:</strong> {payload[1]?.value}</p>
      </div>
    );
  }
  return null;
};


const Prediction = () => {
  const [forecastData, setForecastData] = useState([]);
  const [stockPredictionData, setStockPredictionData] = useState([]);
  const [loadingForecast, setLoadingForecast] = useState(true);
  const [loadingPredictions, setLoadingPredictions] = useState(true);
  const [forecastError, setForecastError] = useState("");
  const [predictionsError, setPredictionsError] = useState("");

  useEffect(() => {
    setLoadingForecast(true);
    setForecastError("");
    fetch(`${API_BASE}/api/ml/forecast_data.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((jsonData) => {
        setForecastData(Array.isArray(jsonData) ? jsonData : []);
      })
      .catch((error) => {
        console.error("Error loading forecast data:", error);
        setForecastData([]);
        setForecastError("Could not load forecast chart data.");
      })
      .finally(() => setLoadingForecast(false));

    setLoadingPredictions(true);
    setPredictionsError("");
    fetch(`${API_BASE}/api/ml/stock_predictions.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((jsonData) => {
        setStockPredictionData(Array.isArray(jsonData) ? jsonData : []);
      })
      .catch((error) => {
        console.error("Error loading stock prediction data:", error);
        setStockPredictionData([]);
        setPredictionsError("Could not load stock prediction chart data.");
      })
      .finally(() => setLoadingPredictions(false));
  }, []);
  

  return (
    <div style={{ width: "100%", height: "auto", display: "flex", flexDirection: "column", gap: "30px" }}>
      {/* Forecast Data Chart */}
      <div style={{ width: "100%", height: 500 }}>
        <h2>Forecast Data</h2>
        {loadingForecast ? (
          <StatusBlock loading loadingText="Loading forecast data…" />
        ) : forecastError ? (
          <StatusBlock error={forecastError} />
        ) : forecastData.length === 0 ? (
          <StatusBlock empty emptyText="No forecast data available." />
        ) : (
          <ResponsiveContainer>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="forecasted" stroke="blue" name="Forecasted" />
              <Line type="monotone" dataKey="actual" stroke="red" name="Actual" />
              <Brush dataKey="date" height={30} stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stock Prediction Data Chart */}
      <div style={{ width: "100%", height: 500 }}>
        <h2>Stock Prediction Data</h2>
        {loadingPredictions ? (
          <StatusBlock loading loadingText="Loading prediction data…" />
        ) : predictionsError ? (
          <StatusBlock error={predictionsError} />
        ) : stockPredictionData.length === 0 ? (
          <StatusBlock empty emptyText="No stock prediction data available." />
        ) : (
          <ResponsiveContainer>
            <LineChart data={stockPredictionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="forecasted" stroke="blue" name="Forecasted" />
              <Line type="monotone" dataKey="actual" stroke="red" name="Actual" />
              <Brush dataKey="date" height={30} stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default Prediction;
