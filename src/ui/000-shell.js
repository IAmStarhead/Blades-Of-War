import "../styles/main.css";
import interfaceHtml from "./interface.html?raw";

if (typeof document !== "undefined" && !document.getElementById("bow-app")) {
  var mount = document.getElementById("bow-root") || document.body;
  if (mount) {
    mount.innerHTML = interfaceHtml;
  }
}
