import os
from pathlib import Path
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


def _load_dotenv():
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

app = Flask(__name__)
_cors_origin = os.getenv("CORS_ORIGIN", "http://localhost:3000")
CORS(app, resources={
    r"/predict": {"origins": _cors_origin},
    r"/*.json": {"origins": _cors_origin},
})

DATA_DIR = str(Path(__file__).resolve().parent / "data")
os.makedirs(DATA_DIR, exist_ok=True)

SUPPORTED_STOCKS = ["AAPL", "GOOG", "AMZN", "RYCEY", "ORCL"]


def fetch_yahoo_chart_daily(symbol, range_="1y"):
    """Live daily OHLCV via Yahoo chart API (avoids yfinance crumb rate limits)."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        f"?range={range_}&interval=1d"
    )
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        raise RuntimeError("Yahoo chart returned no result")
    result = result[0]
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    rows = []
    for i, ts in enumerate(timestamps):
        close = (quote.get("close") or [None])[i]
        if close is None:
            continue
        rows.append({
            "date": datetime.utcfromtimestamp(ts).date(),
            "open": float((quote.get("open") or [close])[i] or close),
            "high": float((quote.get("high") or [close])[i] or close),
            "low": float((quote.get("low") or [close])[i] or close),
            "close": float(close),
            "volume": float((quote.get("volume") or [0])[i] or 0),
        })
    if not rows:
        raise RuntimeError("Yahoo chart had no usable rows")
    return pd.DataFrame(rows)


def fetch_alpha_vantage_daily(symbol):
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        raise RuntimeError("ALPHA_VANTAGE_API_KEY is not set")
    url = (
        "https://www.alphavantage.co/query"
        f"?function=TIME_SERIES_DAILY&symbol={symbol}&outputsize=compact&apikey={api_key}"
    )
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get("Note") or data.get("Information"):
        raise RuntimeError(data.get("Note") or data.get("Information"))
    series = data.get("Time Series (Daily)") or {}
    rows = []
    for day, vals in series.items():
        rows.append({
            "date": datetime.strptime(day, "%Y-%m-%d").date(),
            "open": float(vals["1. open"]),
            "high": float(vals["2. high"]),
            "low": float(vals["3. low"]),
            "close": float(vals["4. close"]),
            "volume": float(vals["5. volume"]),
        })
    if not rows:
        raise RuntimeError("Alpha Vantage returned no rows")
    return pd.DataFrame(rows).sort_values("date")


def _add_features(df):
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    df["H-L"] = df["high"] - df["low"]
    df["O-C"] = df["open"] - df["close"]
    df["7_DAYS_MA"] = df["close"].rolling(7).mean()
    df["14_DAYS_MA"] = df["close"].rolling(14).mean()
    df["21_DAYS_MA"] = df["close"].rolling(21).mean()
    df["7_DAYS_STD_DEV"] = df["close"].rolling(7).std()
    df["adj_close"] = df["close"]
    df.ffill(inplace=True)
    return df


def update_stock_data(stock):
    """Refresh CSV with live market data before forecasting."""
    if stock not in SUPPORTED_STOCKS:
        return {"error": f"Unsupported stock symbol: {stock}"}

    csv_file = os.path.join(DATA_DIR, f"stock_market_data_{stock}_4years.csv")
    existing = pd.DataFrame()
    if os.path.exists(csv_file):
        existing = pd.read_csv(csv_file, parse_dates=["date"])
        existing["date"] = pd.to_datetime(existing["date"])

    fresh = None
    source = None
    try:
        fresh = fetch_yahoo_chart_daily(stock, range_="2y")
        source = "yahoo-chart"
    except Exception as e:
        print(f"⚠️ Yahoo chart update failed for {stock}: {e}")
        try:
            fresh = fetch_alpha_vantage_daily(stock)
            source = "alphavantage"
        except Exception as e2:
            print(f"⚠️ Alpha Vantage update failed for {stock}: {e2}")

    if fresh is None or fresh.empty:
        print(f"⚠️ No live update for {stock}; forecasting from existing CSV")
        return {"ok": True, "updated": False, "source": "csv"}

    fresh["date"] = pd.to_datetime(fresh["date"])
    if not existing.empty:
        combined = pd.concat(
            [existing[["date", "open", "high", "low", "close", "volume"]], fresh],
            ignore_index=True,
        )
    else:
        combined = fresh

    updated = _add_features(combined)
    # Keep a stable column order for downstream models
    cols = [
        "date", "open", "high", "low", "close", "adj_close", "volume",
        "H-L", "O-C", "7_DAYS_MA", "14_DAYS_MA", "21_DAYS_MA", "7_DAYS_STD_DEV",
    ]
    for c in cols:
        if c not in updated.columns:
            updated[c] = np.nan
    updated[cols].to_csv(csv_file, index=False)
    print(f"✅ Updated {stock} CSV from {source} through {updated['date'].max().date()}")
    return {"ok": True, "updated": True, "source": source}

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
    # Models were saved with Lambda layers; Keras 3 blocks that unless opted in.
    try:
        import keras
        keras.config.enable_unsafe_deserialization()
    except Exception:
        pass

    with custom_object_scope({'AttentionLayer': AttentionLayer}):
        try:
            lstm_model = load_model(LSTM_MODEL_PATH, safe_mode=False)
        except TypeError:
            # Older TF/Keras without safe_mode kwarg
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
        df.set_index("date", inplace=True)
        df.sort_values("date", inplace=True)
        stock_prices = df["close"].astype(float)

        arima_model = joblib.load(arima_model_file)
        step_map = {"tomorrow": 1, "1 week": 7, "1 month": 30, "1 year": 365}
        steps = step_map.get(horizon, 7)

        arima_forecast = arima_model.forecast(steps=steps).tolist()

        garch_model = joblib.load(garch_model_file)
        returns = np.log(stock_prices / stock_prices.shift(1)).dropna()
        garch_forecast = garch_model.forecast(horizon=steps)

        print(f"ARIMA Forecast ({steps} steps):", arima_forecast)
        print(f"GARCH Forecast (variance - {steps} steps):", garch_forecast.variance.values.tolist())

        forecast_date = datetime.today().date() + timedelta(days=steps)

        return {
            "Date": str(forecast_date),
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

        df.ffill(inplace=True)

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
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        return {"error": "ALPHA_VANTAGE_API_KEY is not set"}

    url = f"https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={stock}&apikey={api_key}"

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


@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "ticker-trend-ml"})


@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    stock = data.get("stock", "AAPL").upper()
    timeframe = data.get("timeframe", "tomorrow")

    news_sentiment_data = fetch_news_sentiment(stock)
    decision = news_sentiment_data.get("decision", "Neutral")  # Extracting only 'decision'

    return jsonify(convert_numpy({
        "arima_garch": perform_arima_garch_forecast(stock, timeframe),
        "lstm": perform_lstm_forecast(stock, timeframe),
        "decision": decision,
        "sentiment": news_sentiment_data.get("average_sentiment"), # Return average sentiment
        "sentiment_decision": news_sentiment_data.get("decision"), # Return sentiment based decision
        "news_articles": news_sentiment_data.get("articles") # Return top news articles
    }))


@app.route("/forecast_data.json")
def forecast_data_file():
    from flask import send_from_directory
    return send_from_directory(DATA_DIR, "forecast_data.json")


@app.route("/stock_predictions.json")
def stock_predictions_file():
    from flask import send_from_directory
    return send_from_directory(DATA_DIR, "stock_predictions.json")


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3001))
    app.run(host="0.0.0.0", debug=True, port=port)
