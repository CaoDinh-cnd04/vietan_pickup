import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

// NEXT_DIST_DIR: cổng QA e2e build ra thư mục riêng để không đè .next của server dev đang chạy
// Dev dùng thư mục riêng để npm run build không làm mất CSS/JavaScript đang phục vụ.
const nextConfig = (phase) => ({
  distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'),
});

export default nextConfig;
