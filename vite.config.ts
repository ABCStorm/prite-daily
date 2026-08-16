import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  if (mode === "production") {
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter((key) => !env[key]);
    if (missing.length) {
      throw new Error(
        `Production build requires ${missing.join(" and ")}. Add .env.local or pass the variables explicitly; refusing to build the unauthenticated local-preview app.`,
      );
    }
  }

  return {
    plugins: [react()],
    server: { port: Number(process.env.PORT) || 5173 },
  };
});
