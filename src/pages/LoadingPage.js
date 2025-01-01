// Import necessary modules
import React from 'react';
import '../styles/LoadingPage.css'; // Import the corresponding CSS file

const LoadingPage = () => {
  React.useEffect(() => {
    // Simulate dynamic progress (optional)
    const progressBar = document.querySelector('.progress');
    let progress = 0;
    const interval = setInterval(() => {
      if (progress < 100) {
        progress += 10;
        progressBar.style.width = `${progress}%`;
      } else {
        clearInterval(interval);
      }
    }, 300); // Adjust the interval time as needed

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-container">
      {/* Background Image */}
      <div className="background-image">
        {/* Add a dynamic stock-related image or graph here */}
      </div>

      {/* Loading Bar */}
      <div className="loading-bar-container">
        <div className="loading-bar">
          <div className="progress"></div>
        </div>
        <p className="loading-text">Loading... Analyzing market data and patterns.</p>
      </div>
    </div>
  );
};

export default LoadingPage;
