import React from "react";
import "./StatusBlock.css";

export default function StatusBlock({
  loading = false,
  empty = false,
  error = "",
  loadingText = "Loading…",
  emptyText = "Nothing to show yet.",
  errorText = "",
  compact = false,
}) {
  if (loading) {
    return (
      <div className={`status-block ${compact ? "status-block--compact" : ""}`} role="status">
        <div className="status-spinner" aria-hidden="true" />
        <p className="status-text">{loadingText}</p>
      </div>
    );
  }

  if (error || errorText) {
    return (
      <div className={`status-block status-block--error ${compact ? "status-block--compact" : ""}`} role="alert">
        <p className="status-text">{error || errorText}</p>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={`status-block status-block--empty ${compact ? "status-block--compact" : ""}`}>
        <p className="status-text">{emptyText}</p>
      </div>
    );
  }

  return null;
}
