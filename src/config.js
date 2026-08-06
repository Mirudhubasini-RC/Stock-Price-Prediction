// API bases — set at build time on Render via REACT_APP_* env vars
const isProd = process.env.NODE_ENV === 'production';

export const API_BASE =
  process.env.REACT_APP_API_URL !== undefined
    ? process.env.REACT_APP_API_URL
    : isProd
      ? ''
      : 'http://localhost:8000';

export const ML_API_BASE =
  process.env.REACT_APP_ML_API_URL ||
  (isProd ? '' : 'http://127.0.0.1:3001');
