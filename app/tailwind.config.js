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
        "pastel": {
          1: "#abffe3",
          2: "#abf0ff",
          3: "#abc5ff",
          4: "#b0abff",
        },
        "bg":"#0a0a0a",
        "bg2": "#1c1b1b",
        "bg3": "#2b2a2a"
      },
    }
  },
  plugins: [],
}

