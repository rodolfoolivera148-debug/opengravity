const express = require('express');
const router = express.Router();
const feedService = require('../services/feedService');

// Obtener todas las noticias
router.get('/', (req, res) => {
  try {
    const news = feedService.getAllNews();
    const { page = 1, limit = 20 } = req.query;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedNews = news.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      news: paginatedNews,
      total: news.length,
      page: parseInt(page),
      totalPages: Math.ceil(news.length / limit)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener noticias de un feed específico
router.get('/feed/:feedId', (req, res) => {
  try {
    const news = feedService.getNewsByFeed(req.params.feedId);
    const { page = 1, limit = 20 } = req.query;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedNews = news.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      news: paginatedNews,
      total: news.length,
      page: parseInt(page),
      totalPages: Math.ceil(news.length / limit)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar noticias por texto
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parámetro de búsqueda requerido' 
      });
    }
    
    const allNews = feedService.getAllNews();
    const searchTerm = q.toLowerCase();
    const filteredNews = allNews.filter(item => 
      item.title.toLowerCase().includes(searchTerm) ||
      item.content.toLowerCase().includes(searchTerm)
    );
    
    res.json({
      success: true,
      news: filteredNews,
      total: filteredNews.length,
      query: q
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;