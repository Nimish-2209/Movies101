const express = require('express');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/bootstrap',
  express.static(path.join(__dirname, 'node_modules/bootstrap/dist'))
);

module.exports = app;
