// vite.config.js
import { defineConfig } from 'vite';
import { exec } from 'child_process';

function rebuildPlugin() {
  return {
    name: 'rebuild-config',
    configureServer(server) {
      server.middlewares.use('/api/rebuild', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        exec('node convert-csv-to-json.cjs', (error, stdout, stderr) => {
          if (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error.message }));
            return;
          }
          res.end(JSON.stringify({ ok: true }));
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [rebuildPlugin()],
});
