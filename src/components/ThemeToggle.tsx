"use client";
import { useTheme } from "./ThemeProvider";
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all text-sm"
      title={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
