import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const StockChart = ({ data }) => {
  // Process chart data for rendering
  const chartData = {
    labels: data.map((point) => new Date(point.date).toLocaleDateString()), // X-axis labels
    datasets: [
      {
        label: "Stock Price (Close)",
        data: data.map((point) => point.close), // Y-axis data (close price)
        borderColor: "rgba(75, 192, 192, 1)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
        tension: 0.4, // Curves the line
        pointRadius: 3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: true,
        position: "top",
      },
      tooltip: {
        mode: "index",
        intersect: false,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Date",
        },
      },
      y: {
        title: {
          display: true,
          text: "Price (USD)",
        },
        beginAtZero: false,
      },
    },
  };

  return (
    <div className="stock-chart-container">
      <Line data={chartData} options={chartOptions} />
    </div>
  );
};

export default StockChart;
