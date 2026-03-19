# 🚀 Deploying to Netlify via GitHub

This app is ready for deployment to Netlify! Follow these steps to get it live:

## 1. Push to GitHub
If you haven't already, push your code to a new GitHub repository.

## 2. Connect to Netlify
1. Log in to [Netlify](https://app.netlify.com/).
2. Click **"Add new site"** -> **"Import an existing project"**.
3. Select **GitHub** and choose your repository.

## 3. Configure Build Settings
Netlify should automatically detect the settings from `netlify.toml`, but double-check:
- **Build command:** `npm run build`
- **Publish directory:** `dist`

## 4. Set Environment Variables
This is **CRITICAL** for the AI features to work.
1. In Netlify, go to **Site settings** -> **Environment variables**.
2. Add the following variable:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
3. (Optional) Add `APP_URL`: The URL of your Netlify site (e.g., `https://your-site.netlify.app`).

## ⚠️ Important Note on Data Persistence
This app uses a local `reports.json` file for storage in development. **Netlify is a static hosting platform** and does not support a persistent file system or a running Node.js server.

- **Fallback:** I have added a `localStorage` fallback. Reports you generate will be saved to your browser's local storage if the backend is unavailable.
- **Real Persistence:** If you need reports to be shared across different browsers/users, I recommend setting up **Firebase** as the backend. I can help you with this if you're interested!

## 🛠 Troubleshooting
If you see a "404 Not Found" when refreshing the page, don't worry! The `netlify.toml` and `_redirects` files I added handle this for Single Page Applications (SPAs).
