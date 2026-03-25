const express = require('express');
const path = require('path');
const feedRoutes = require('./routes/feeds');
const newsRoutes = require('./routes/news');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/feeds', feedRoutes);
app.use('/api/news', newsRoutes);

// Ruta principal - servir la interfaz HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado en puerto: ${PORT}`);
    console.log(`📡 Accesible en red local: http://0.0.0.0:${PORT}`);
    console.log(`📱 Para Android: Usa la IP de tu PC (ej: 192.168.1.15:${PORT})`);
});