/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '.dark-mode'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
    "./src/js/**/*.js",
    "./src/app.js"
  ],
  theme: {
    extend: {
      fontSize: {
        'xxs': '0.625rem',
      }
    },
  },
  plugins: [],
}
