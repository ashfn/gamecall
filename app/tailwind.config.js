/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "minty": {
          1: "#42b342",
          2: "#4fab4f",
          3: "#78cc78",
          4: "#96e396"
        },
        "bg":"#0a0a0a"
      },
    }
  },
  plugins: [],
}

