import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BackToTopButton } from "./components/common/BackToTopButton";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <>
      <App />
      <BackToTopButton />
    </>
  </React.StrictMode>,
);
