import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AuthWrapper from "./components/AuthWrapper.jsx";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthWrapper>
      <App />
    </AuthWrapper>
  </React.StrictMode>
);
