import { defineConfig } from "vite";

// Сборка без @vitejs/plugin-react (классический JSX), БЕЗ jsxInject
export default defineConfig({
  esbuild: {
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment"
  },
  server: { port: 5173 }
});
