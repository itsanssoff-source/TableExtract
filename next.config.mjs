import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Initialize local development bindings safely without top-level await
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Keep any of your existing configuration options here */
};

export default nextConfig;