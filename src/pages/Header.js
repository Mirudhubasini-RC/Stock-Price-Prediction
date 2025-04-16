// Header.js
import React from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";  // Adjust path if needed
import logo_icon from "../assets/logo-icon.png";  // Adjust path if needed
import user_icon from "../assets/user-icon.png";  // Adjust path if needed

const Header = ({ isLoggedIn, username, userIcon }) => {
  const navigate = useNavigate();

  return (
    <header className="header">
      <img src={logo_icon} alt="logo" className="logo-icon" />
      <h1 className="header-title">Stock Prediction</h1>
      <nav className="nav">
        <span onClick={() => navigate("/")} className="nav-link">Home</span>
        <span onClick={() => navigate("/watchlist")} className="nav-link">Watchlist</span>
        <span onClick={() => navigate("/prediction")} className="nav-link">Prediction</span>
      </nav>
      {isLoggedIn && (
        <div className="user-info">
          <img
            src={userIcon || user_icon}  // Default user icon if none available
            alt="User Icon"
            className="user-icon"
          />
          <span className="username">{username}</span>
        </div>
      )}
    </header>
  );
};

export default Header;
