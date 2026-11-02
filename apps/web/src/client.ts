import { mountApp } from "./app.js";

declare global {
  interface Window {
    ethereum?: import("./app.js").EthereumProvider;
  }
}

mountApp(document, { fetch: globalThis.fetch.bind(globalThis), ethereum: window.ethereum });
