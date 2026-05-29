# Patchly

Select any area of your running localhost React+Vite app, describe a change in plain English, and watch the source code update with instant hot-reload.

## Usage

```bash
# In your React+Vite project
npx patchly
```

Then load the Chrome extension, open your localhost app, and press Alt+Shift+P to activate.

## Development

```bash
npm install
node agent/index.js   # start the agent
```

Requires a `.patchlyrc.json` in your project root — see setup instructions.
