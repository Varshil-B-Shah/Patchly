# Patchly

**Select any area of your running localhost app. Describe the change. Watch the code update.**

No hunting through files. No searching for classNames. Just point and fix.

<!-- TODO: record a GIF of the full workflow and embed it here -->

---

## Quick start (2 steps)

**1. In your React + Vite project:**
```bash
npx patchly init
```
Follow the printed instructions to add `patchlyPlugin()` to your `vite.config.js`
(skipped automatically if it's already there).

**2. Load the Chrome extension:**
Open `chrome://extensions`, enable Developer Mode, and "Load unpacked" the
`extension/` folder. Click the Patchly icon and add your Azure OpenAI credentials
under Settings — no JSON editing required.

---

## Usage

1. Run `npx patchly` in your project folder
2. Open your app at `http://localhost:5173`
3. Press `Alt+Shift+P` to activate selection mode
4. Draw a box around anything you want to change
5. Describe the change in plain English and hit Enter
6. Review the preview, click **Apply** — your code updates and the browser hot-reloads

Made a mistake? Click **Undo** in the success toast to revert instantly.

---

## Requirements

- React + Vite + Tailwind CSS (the AI is instructed to write Tailwind classes only)
- Node.js 18+
- Chrome browser
- Azure OpenAI API key (add it from the extension popup's Settings section)

---

## How it works

Patchly instruments your JSX at dev-server startup to tag every element with its
source location. When you select an element, Patchly finds the exact line in your
source file, sends it to the LLM with your instruction, and applies the returned
change directly to the file. Vite picks up the change and hot-reloads the page.

Your code stays on your machine. Your API key stays on your machine. Zero telemetry.

---

## Status

v0.1.0 — React + Vite + Tailwind. Early release.
[Report issues →](#)
