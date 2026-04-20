import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack ve Next.js Webpack'in bu native C++/Rust kütüphanelerini
  // bundle (paketleme) işlemine sokmamasını, doğrudan node_modules'den çalıştırmasını sağlar.
  serverExternalPackages: ['@lancedb/lancedb', 'better-sqlite3'],
};

export default nextConfig;
