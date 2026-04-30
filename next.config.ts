import type { NextConfig } from "next";

/**
 * Static export config.
 *
 * `output: 'export'` produces a `out/` folder containing pure HTML/JS/CSS
 * — no server runtime needed. The folder can be zipped and emailed; the
 * recipient unzips it and serves it locally (see scripts/serve.* helpers).
 *
 * Why not `file://` straight from index.html? Modern browsers block ES
 * module loading under the file: protocol. The included serve scripts
 * spin up a local static server in one click, no Node required for users
 * who already have Python (most macs do; Windows users may need Python or
 * the Node serve script).
 */
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Trailing slashes make file paths work consistently when served from
  // arbitrary local folders (Windows-friendly).
  trailingSlash: true,
};

export default nextConfig;
