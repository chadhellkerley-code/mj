// Servidor local: la misma API que en Vercel más los archivos de public/.
const path = require('path');
const express = require('express');
const api = require('./lib/app');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(api);

app.listen(PORT, '127.0.0.1', () => console.log(`\n  Abre http://localhost:${PORT} en tu navegador\n`));
