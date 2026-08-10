import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && mode === "production") {
    const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
    const missing = required.filter((name) => !env[name]?.trim());
    if (missing.length) {
      throw new Error(
        `Refusing to build PRITE Daily without production authentication: missing ${missing.join(", ")}`,
      );
    }
  }

  return {
    plugins: [react()],
    server: { port: Number(process.env.PORT) || 5173 },
  };
});
