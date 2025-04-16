# Stock-Price-Prediction

A machine learning-based web application that predicts future stock prices using historical data and deep learning models. Built with Python, Flask, and React.

- Upload CSV data for stock prices
- Predict future values using LSTM-ARO and ARIMA-GARCH models
- Visualize trends with interactive charts
- Backend powered by Flask and TensorFlow
- Clean and responsive React frontend

  
To set up react :
Prerequisites
Node.js and npm must be installed. You can verify with:
node -v
npm -v

cd Stock Closing Price Prediction/stock-price-prediction
npm install
npm start

To set up virtual env and run python:
cd src/Pyth
python3 -m venv venv
For macOS/Linux:
source venv/bin/activate
For Windows:
.\venv\Scripts\activate
Install below packages using pip install :
Flask==2.2.2
Flask-CORS==3.1.1
Flask-MySQLdb==1.0.1
Flask-SQLAlchemy==2.5.1
tensorflow==2.10.0
pandas==1.5.3
numpy==1.23.3
scikit-learn==1.1.2
requests==2.28.1
python-dotenv==0.21.0
pillow==9.2.0
werkzeug==2.2.2
matplotlib==3.6.2
gunicorn==20.1.0


To run the backend :
activate the venv and move to
cd Stock Closing Price Prediction/stock-prediction/src/Pyth 
then run :
python3 app.py
