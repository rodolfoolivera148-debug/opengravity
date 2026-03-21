const express = require('express');
const router = express.Router();
const feedService = require('../services/feedService');

// Obtener todos los feeds
router.get('/', (req, res) => {
  try {
    const feeds = feedService.getAllFeeds();
    res.json({ success: true, feeds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Agregar un nuevo feed
router.post('/', async (req, res) => {
  try {
    const { url, name } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL del feed es requerida' 
      });
    }

    const feed = await feedService.addFeed(url, name);
    res.status(201).json({ success: true, feed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener un feed específico
router.get('/:id', (req, res) => {
  try {
    const feed = feedService.getFeedById(req.params.id);
    if (!feed) {
      return res.status(404).json({ 
        success: false, 
        error: 'Feed no encontrado' 
      });
    }
    res.json({ success: true, feed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar un feed
router.delete('/:id', (req, res) => {
  try {
    const feed = feedService.getFeedById(req.params.id);
    if (!feed) {
      return res.status(404).json({ 
        success: false, 
        error: 'Feed no encontrado' 
      });
    }
    
    feedService.removeFeed(req.params.id);
    res.json({ success: true, message: 'Feed eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refrescar todos los feeds
router.post('/refresh', async (req, res) => {
  try {
    const results = await feedService.refreshAllFeeds();
    res.json({ 
      success: true, 
      message: 'Feeds actualizados', 
      results 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refrescar un feed específico
router.post('/:id/refresh', async (req, res) => {
  try {
    const feed = feedService.getFeedById(req.params.id);
    if (!feed) {
      return res.status(404).json({ 
        success: false, 
        error: 'Feed no encontrado' 
      });
    }
    
    const count = await feedService.fetchFeedNews(feed);
    res.json({ 
      success: true, 
      message: `Feed actualizado`, 
      newItems: count,
      feed: feedService.getFeedById(req.params.id)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;