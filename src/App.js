
import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoadingPage from "./pages/LoadingPage"; // Displays loading UI
import StockDashboard from "./pages/StockDashboard"; // Main Stock Dashboard page
import SignInPage from "./pages/SignInPage"; 
import Watchlist from "./pages/Watchlist";
const App = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate an initial loading effect (e.g., fetching initial data, app setup)
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000); // Simulate a 2-second loading state

    return () => clearTimeout(timer); // Cleanup timer when the component unmounts
  }, []);

  return (
    <Router>
      <Routes>
        {/* Render LoadingPage during loading, then transition to StockDashboard */}
        {isLoading ? (
          <Route path="/" element={<LoadingPage />} />
        ) : (
          <Route path="/" element={<StockDashboard />} />
        )}
        {/* Redirect any unknown routes back to "/" */}
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/signin" element={<SignInPage />} /> 
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

export default App;
