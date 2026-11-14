import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// কোনো component crash হলে পুরো page blank না হয়ে এই message দেখাবে
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("GUI error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: "#fca5a5", fontFamily: "system-ui" }}>
          <h2>⚠️ GUI-তে একটা error হয়েছে</h2>
          <p style={{ color: "#cbd5e1" }}>
            Page blank হয়ে যাওয়ার বদলে এই message দেখানো হচ্ছে। Browser refresh করুন — data আবার load হবে।
          </p>
          <pre style={{ background: "#0c1628", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#3b82f6", color: "#fff", border: 0, padding: "8px 18px", borderRadius: 8, cursor: "pointer" }}
          >
            🔄 Refresh করুন
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
