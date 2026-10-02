export {};

declare global {
  interface Window {
    ZAFClient: {
      init: () => any;
    };
  }
}