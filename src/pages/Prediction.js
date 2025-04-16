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

  useEffect(() => {
    // Fetch Forecast Data
    fetch("http://localhost:3001/forecast_data.json")
      .then((response) => response.json())
      .then((jsonData) => {
        console.log("Forecast Data:", jsonData);
        setForecastData(jsonData);
      })
      .catch((error) => console.error("Error loading forecast data:", error));
  
    // Fetch Stock Prediction Data
    fetch("http://localhost:3001/stock_prediction.json")
      .then((response) => response.json())
      .then((jsonData) => {
        console.log("Stock Prediction Data:", jsonData);
        setStockPredictionData(jsonData);
      })
      .catch((error) => console.error("Error loading stock prediction data:", error));
  }, []);
  

  return (
    <div style={{ width: "100%", height: "auto", display: "flex", flexDirection: "column", gap: "30px" }}>
      {/* Forecast Data Chart */}
      <div style={{ width: "100%", height: 500 }}>
        <h2>Forecast Data</h2>
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
      </div>

      {/* Stock Prediction Data Chart */}
      <div style={{ width: "100%", height: 500 }}>
        <h2>Stock Prediction Data</h2>
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
      </div>
    </div>
  );
};

export default Prediction;
