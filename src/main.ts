import "./ui/hmos/tokens.css";
import { startApp } from "./ui/flow/app.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  startApp(app);
}
