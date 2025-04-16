import React, { useRef } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, TimeScale, Tooltip, Legend } from "chart.js";
import { CandlestickController, CandlestickElement } from "chartjs-chart-financial";
import zoomPlugin from "chartjs-plugin-zoom";
import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";

ChartJS.register(CategoryScale, LinearScale, TimeScale, Tooltip, Legend, CandlestickController, CandlestickElement, zoomPlugin);

const StockChart = ({ data }) => {
  const chartRef = useRef(null);

  if (!data || data.length === 0) {
    return <p style={{ color: 'white', textAlign: 'center' }}>📉 No data available</p>;
  } else if (data.length === 1) {
    const point = data[0];
    return (
      <div style={{ color: 'white', textAlign: 'center', marginTop: '1rem' }}>
        <p>📅 Date: {new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        <p>📈 Open: {point.open.toFixed(2)}</p>
        <p>📊 High: {point.high.toFixed(2)}</p>
        <p>📉 Low: {point.low.toFixed(2)}</p>
        <p>🔻 Close: {point.close.toFixed(2)}</p>
      </div>
    );
  }

  // **Format Data**
  const chartData = {
    datasets: [
      {
        label: "Stock Prices",
        data: data.map((point) => ({
          x: new Date(point.date).getTime(), // Convert to timestamp (milliseconds)
          o: parseFloat(point.open.toFixed(3)), // Round to 3 decimal places
          h: parseFloat(point.high.toFixed(3)),
          l: parseFloat(point.low.toFixed(3)),
          c: parseFloat(point.close.toFixed(3)),
        })),
        borderColor: "rgba(75, 192, 192, 1)",
        barPercentage: 0.4,
        categoryPercentage: 0.6,
        upColor: "green",
        borderUpColor: "green",
        downColor: "red",
        borderDownColor: "red",
      },
    ],
  };

  console.log("Chart Data:", chartData.datasets[0].data); // Debugging output

  // **Chart Options**
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function (context) {
            const { dataset, dataIndex } = context;
            const { x, o, h, l, c } = dataset.data[dataIndex];
            return [
              `📅 Date: ${new Date(x).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
              `📈 Open: ${o}`,
              `📊 High: ${h}`,
              `📉 Low: ${l}`,
              `🔻 Close: ${c}`,
            ];
          },
        },
      },
      zoom: {
        pan: { enabled: true, mode: "x" },
        zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: "x" },
      },
    },
    scales: {
      x: {
        type: "time",
        time: {
          unit: "day",
          tooltipFormat: "yyyy-MM-dd",
          displayFormats: {
            day: "MMM d", // Show dates as "Feb 18"
          },
        },
        title: { display: true, text: "Date", color: "white" },
        ticks: {
          color: "white",
          autoSkip: true, // Avoid overlapping labels
          maxTicksLimit: 10, // Ensure only a few labels are shown
          callback: function (value) {
            return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          },
        },
        grid: { display: true, color: "rgba(255, 255, 255, 0.2)" },
      },
      y: {
        title: { display: true, text: "Price (USD)", color: "white" },
        ticks: { color: "white" },
        min: Math.min(...data.map((d) => d.low)) * 0.95,
        max: Math.max(...data.map((d) => d.high)) * 1.05,
        grid: { display: true, color: "rgba(255, 255, 255, 0.2)" },
      },
    },
  };

  // **Zoom Functions**
  const zoomIn = () => {
    if (chartRef.current) chartRef.current.zoom(1.2);
  };

  const zoomOut = () => {
    if (chartRef.current) chartRef.current.zoom(0.8);
  };

  return (
    <div className="stock-chart-container" style={{ textAlign: "center" }}>
      <div style={{ marginBottom: "10px" }}>
        <button onClick={zoomIn} style={{ marginRight: "10px", padding: "5px 10px" }}>🔍 Zoom In</button>
        <button onClick={zoomOut} style={{ padding: "5px 10px" }}>🔎 Zoom Out</button>
      </div>
      <Chart ref={chartRef} type="candlestick" data={chartData} options={chartOptions} />
    </div>
  );
};

export default StockChart;
