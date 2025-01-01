import React, { useState } from "react";
import axios from "axios";  // Import axios for API calls
import { useNavigate } from "react-router-dom";  // Import useNavigate for navigation
import "../styles/SignInPage.css";
import Side from "../assets/giphy.webp";
import logo from "../assets/logo.png";
import logo_icon from "../assets/logo-icon.png";

const SignInPage = () => {
  const navigate = useNavigate(); // Initialize navigate
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); // New state for confirm password
  const [username, setUsername] = useState("");
  const [error, setError] = useState(""); // To handle errors
  const [loading, setLoading] = useState(false); // To manage loading state
  const [passwordMatch, setPasswordMatch] = useState(true); // To check if passwords match
  const [successMessage, setSuccessMessage] = useState(""); // For success message

  const toggleForm = () => {
    setIsSignUp(!isSignUp);
    setError(""); // Clear error when toggling
    setSuccessMessage(""); // Clear success message when toggling
  };

  // Function to handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setPasswordMatch(true); // Reset password match state
    setSuccessMessage(""); // Clear any previous success message

    // Validate if passwords match
    if (isSignUp && password !== confirmPassword) {
      setPasswordMatch(false);
      setLoading(false);
      return;
    }

    const url = isSignUp
    ? "http://localhost:8000/api/signup"
    : "http://localhost:8000/api/signin";
  
  const data = isSignUp
    ? { username, email, password }
    : { email, password };
  
  try {
    const response = await axios.post(url, data);
    console.log(response.data);
  
    if (isSignUp) {
      setSuccessMessage("Account Created Successfully!"); // Display success message after sign-up
    } else {
      // On successful sign-in, store the user ID and email
      const userData = response.data.user || response.data.token; // Adjust based on your API response
      const { id, email } = userData;  // Assuming the response contains the 'id' and 'email'
  
      // Store user data (id and email) in localStorage   // Store email
      localStorage.setItem("user", JSON.stringify(userData)); // Optionally, store full user data
      
      navigate("/dashboard"); // Redirect to the dashboard after successful sign-in
    }
  
    // Handle other response logic if needed
  
  } catch (err) {
    setError("Error occurred: " + err.response?.data?.message || err.message);
  } finally {
    setLoading(false);
  }
}
  

  return (
    <div className="signin-container">
      {/* Form Section */}
      <div className="form-container">
        <div className="top-logo">
          <img src={logo_icon} alt="logo-icon" className="logo_icon" />
          <img src={logo} alt="logo" className="logo" />
        </div>

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {isSignUp && (
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {!passwordMatch && <p className="error-message">Passwords do not match</p>}
            </div>
          )}

          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        {/* Display success message */}
        {successMessage && <p className="success-message">{successMessage}</p>}

        {/* Display error message */}
        {error && <p className="error-message">{error}</p>}

        <p onClick={toggleForm} className="toggle-link">
          {isSignUp
            ? "Already have an account? Sign In"
            : "Don't have an account? Sign Up"}
        </p>
      </div>

      {/* Image Section with Text Overlay */}
      <div className="image-container">
        <img src={Side} alt="Description" />
        <div className="text-overlay"></div>
      </div>
    </div>
  );
};

export default SignInPage;
