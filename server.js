// Zero-dependency local development server to test path-based redirects without 404s
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Clean up url (strip query parameters or hashes for routing)
    const cleanUrl = req.url.split('?')[0].split('#')[0];
    
    let filePath = path.join(__dirname, cleanUrl === '/' ? 'index.html' : cleanUrl);
    const ext = path.extname(filePath);
    
    // Check if the file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (!err) {
            // Check if it's a directory
            if (fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }
            
            // File exists, serve it
            const fileExt = path.extname(filePath);
            const contentType = MIME_TYPES[fileExt] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        } else {
            // File doesn't exist (this is a short code path, e.g. /abcde)
            // Serve index.html so the client-side router (redirect.js) can run and handle the redirect
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\x1b[32m[Enly Dev Server]\x1b[0m Running at http://localhost:${PORT}`);
    console.log(`\x1b[33m[Enly Dev Server]\x1b[0m Any path like http://localhost:${PORT}/abcde will now route correctly to index.html for redirect handling.`);
});
