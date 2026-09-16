import { defineConfig } from "vite";

// GitHub Pages serves the site under /training-plan-builder/, so asset URLs
// must be relative, not absolute (/assets/...). base './' fixes subpath deploys.
export default defineConfig({
  base: "./",
});
