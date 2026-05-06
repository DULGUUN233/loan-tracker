const path = require('path');
const express = require('express');
const app = require('./api/index.js');

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
