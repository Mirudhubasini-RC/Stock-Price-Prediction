import os
import numpy as np
import pandas as pd
import joblib
import tensorflow as tf
from flask import Flask, jsonify, request
from flask_cors import CORS
from tensorflow.keras.models import load_model
from tensorflow.keras.utils import custom_object_scope
import yfinance as yf
from datetime import datetime, timedelta
import requests


app = Flask(__name__)
CORS(app, resources={r"/predict": {"origins": "http://localhost:3000"}})



DATA_DIR = os.path.join(os.getcwd(), "data")
os.makedirs(DATA_DIR, exist_ok=True)

SUPPORTED_STOCKS = ["AAPL", "GOOG", "AMZN", "RYCEY", "ORCL"]

def update_stock_data(stock):
    if stock not in SUPPORTED_STOCKS:
        return {"error": f"Unsupported stock symbol: {stock}"}

    csv_file = os.path.join(DATA_DIR, f"stock_market_data_{stock}_4years.csv")

    if os.path.exists(csv_file):
        df = pd.read_csv(csv_file, parse_dates=["date"])
        df["date"] = pd.to_datetime(df["date"])
        last_date = df["date"].max().date()
    else:
        last_date = (datetime.today() - timedelta(days=4*365)).date()
        df = pd.DataFrame()

    today = datetime.today().date()

    if last_date < today - timedelta(days=1):
        new_data = yf.download(stock, start=last_date + timedelta(days=1), end=today)

        if not new_data.empty:
            new_data.reset_index(inplace=True)
            new_data.rename(columns={"Date": "date", "High": "high", "Low": "low",
                                     "Open": "open", "Close": "close", "Volume": "volume"}, inplace=True)

            new_data["H-L"] = new_data["high"] - new_data["low"]
            new_data["O-C"] = new_data["open"] - new_data["close"]
            new_data["7_DAYS_MA"] = new_data["close"].rolling(7).mean()
            new_data["14_DAYS_MA"] = new_data["close"].rolling(14).mean()
            new_data["21_DAYS_MA"] = new_data["close"].rolling(21).mean()
            new_data["7_DAYS_STD_DEV"] = new_data["close"].rolling(7).std()
            new_data.ffill(inplace=True)  # ✅ Fixed

            new_data.to_csv(csv_file, mode="a", header=not os.path.exists(csv_file), index=False)

    print(f"✅ Updated stock data for {stock}")

class AttentionLayer(tf.keras.layers.Layer):
    def __init__(self, units, **kwargs):
        super().__init__(**kwargs)
        self.units = units
        self.W = tf.keras.layers.Dense(units, activation="tanh")
        self.V = tf.keras.layers.Dense(1)

    def call(self, inputs):
        score = self.V(tf.nn.tanh(self.W(inputs)))
        attention_weights = tf.nn.softmax(score, axis=1)
        context_vector = attention_weights * inputs
        return tf.reduce_sum(context_vector, axis=1)

    def get_config(self):
        config = super().get_config()
        config.update({"units": self.units})
        return config

LSTM_MODEL_PATH = os.path.join(DATA_DIR, "lstm_aro_stock_predictor_AAPL_fixed.h5")
try:
    with custom_object_scope({'AttentionLayer': AttentionLayer}):
        lstm_model = load_model(LSTM_MODEL_PATH)
        lstm_model.compile(optimizer="adam", loss="mse", metrics=["mae"])  
    print("LSTM Model Loaded Successfully")
except Exception as e:
    raise FileNotFoundError(f"Error loading LSTM model: {e}")

def convert_numpy(obj):
    if isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    if isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    if isinstance(obj, list):
        return [convert_numpy(item) for item in obj]
    if isinstance(obj, dict):
        return {key: convert_numpy(value) for key, value in obj.items()}
    return obj

def perform_arima_garch_forecast(stock, horizon):
    if stock not in SUPPORTED_STOCKS:
        return {"error": f"Unsupported stock symbol: {stock}"}
    
    try:
        update_stock_data(stock)
        csv_file = os.path.join(DATA_DIR, f"stock_market_data_{stock}_4years.csv")
        arima_model_file = os.path.join(DATA_DIR, f"arima_model_{stock}.pkl")
        garch_model_file = os.path.join(DATA_DIR, f"garch_model_{stock}.pkl")

        if not all(map(os.path.exists, [csv_file, arima_model_file, garch_model_file])):
            return {"error": "Missing required model files."}

        df = pd.read_csv(csv_file, parse_dates=["date"])
        df.set_index("date", inplace=True)  # ✅ Fixed
        df.sort_values("date", inplace=True)
        stock_prices = df["close"].astype(float)

        arima_model = joblib.load(arima_model_file)
        step_map = {"tomorrow": 1, "1 week": 7, "1 month": 30, "1 year": 365}
        steps = step_map.get(horizon, 7)

        arima_forecast = arima_model.forecast(steps=steps).tolist()

        garch_model = joblib.load(garch_model_file)
        returns = np.log(stock_prices / stock_prices.shift(1)).dropna()
        garch_forecast = garch_model.forecast(horizon=steps)

        return {
            "Date": str(datetime.today().date() + timedelta(days=steps)),
            "Predicted_Close": round(arima_forecast[-1], 2)
        }
    except Exception as e:
        return {"error": f"Exception: {repr(e)}"}

import os
import numpy as np
import pandas as pd

def perform_lstm_forecast(stock, horizon):
    try:
        update_stock_data(stock)
        csv_file = os.path.join(DATA_DIR, f"stock_market_data_{stock}_4years.csv")

        if not os.path.exists(csv_file):
            return {"error": "Stock data file is missing!"}

        df = pd.read_csv(csv_file, parse_dates=["date"])
        df.sort_values("date", inplace=True)

        feature_columns = ["high", "low", "open", "close", "H-L", "O-C", "7_DAYS_MA", "14_DAYS_MA", "21_DAYS_MA", "7_DAYS_STD_DEV"]

        if not all(col in df.columns for col in feature_columns):
            return {"error": "Missing required columns in CSV!"}

        df.fillna(method="ffill", inplace=True)

        available_days = df.shape[0]
        window_size = min(30, available_days)

        last_X_days = df[feature_columns].values[-window_size:].reshape(1, window_size, len(feature_columns))

        step_map = {"tomorrow": 1, "1 week": 7, "1 month": 30}
        steps = step_map.get(horizon, 7)

        predictions, next_dates = [], []

        last_known_date = pd.Timestamp.today().normalize()

        for i in range(steps):
            prediction = lstm_model.predict(last_X_days)[0, 0]
            predicted_close = max(0, round(float(prediction), 2))

            predictions.append(predicted_close)
            next_date = last_known_date + pd.Timedelta(days=i + 1)  # Increment by 1 day for each step
            next_dates.append(str(next_date.date()))

            # Update the feature set with predicted values
            new_features = last_X_days[0, 1:, :].tolist()  # Shift past values
            new_row = list(last_X_days[0, -1, :])  # Take the last row

            new_row[3] = predicted_close  # Update "close" value
            new_row[4] = new_row[0] - new_row[1]  # Recalculate H-L
            new_row[5] = new_row[2] - new_row[3]  # Recalculate O-C

            new_features.append(new_row)
            last_X_days = np.array(new_features).reshape(1, window_size, len(feature_columns))

        return {
            "Date": next_dates[-1],
            "Predicted_Close": predictions[-1]
        }

    except Exception as e:
        return {"error": f"Exception: {repr(e)}"}
    
def fetch_news_sentiment(stock):
    API_KEY = "6P1VJGFWKQKS824B"  # Replace with your actual API key
    url = f"https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={stock}&apikey={API_KEY}"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        if "feed" in data:
            filtered_news = []
            sentiment_scores = []
            
            for article in data["feed"]:
                tickers = {item["ticker"] for item in article.get("ticker_sentiment", [])}
                
                if tickers == {stock}:  # Ensure only the selected stock is considered
                    sentiment_score = float(article.get("overall_sentiment_score", 0))
                    sentiment_scores.append(sentiment_score)
                    
                    filtered_news.append({
                        "title": article["title"],
                        "summary": article["summary"],
                        "url": article["url"],
                        "sentiment_score": sentiment_score
                    })
            
            # Calculate average sentiment
            avg_sentiment = round(sum(sentiment_scores) / len(sentiment_scores), 4) if sentiment_scores else 0
            
            # Buy/Sell decision based on sentiment
            decision = "Buy" if avg_sentiment >= 0.2 else "Sell"
            
            return {
                "average_sentiment": avg_sentiment,
                "decision": decision,
                "articles": filtered_news[:5]  # Return top 5 articles
            }
        
        return {"error": "No relevant news found for this stock"}
    
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}


@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    stock = data.get("stock", "AAPL").upper()
    timeframe = data.get("timeframe", "tomorrow")

    news_sentiment = fetch_news_sentiment(stock)
    decision = news_sentiment.get("decision", "Neutral")  # Extracting only 'decision'

    return jsonify(convert_numpy({
        "arima_garch": perform_arima_garch_forecast(stock, timeframe),
        "lstm": perform_lstm_forecast(stock, timeframe),
        "decision": decision  # Returning only the decision
    }))


if __name__ == '__main__':
    app.run(debug=True, port=3001)
