// Agregador de Feeds de Noticias
// Proyecto 5

// Dependencias
const express = require('express');
const app = express();
const port = 3000;

// Configuración
app.use(express.json());

// Rutas
app.get('/', (req, res) => {
  res.send('Agregador de Feeds de Noticias');
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor iniciado en el puerto ${port}`);
});