const axios = require('axios');
const cheerio = require('cheerio');
const { parseStringPromise } = require('xml2js');

class FeedService {
  constructor() {
    this.feeds = [];
    this.newsCache = new Map();
  }

  async addFeed(url, name) {
    try {
      // Validar que el feed sea accesible
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FeedAggregator/1.0)'
        },
        timeout: 10000
      });

      const contentType = response.headers['content-type'] || '';
      let feedData;

      if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
        feedData = response.data;
      } else {
        throw new Error('La URL no parece ser un feed RSS/Atom válido');
      }

      const feed = {
        id: Date.now().toString(),
        url,
        name: name || this.extractFeedName(feedData),
        lastUpdate: new Date().toISOString(),
        itemCount: 0
      };

      this.feeds.push(feed);
      return feed;
    } catch (error) {
      throw new Error(`Error al agregar feed: ${error.message}`);
    }
  }

  extractFeedName(xml) {
    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      const title = $('channel > title, feed > title').first().text();
      return title || 'Feed sin nombre';
    } catch {
      return 'Feed sin nombre';
    }
  }

  async fetchFeedNews(feed) {
    try {
      const response = await axios.get(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FeedAggregator/1.0)'
        },
        timeout: 10000
      });

      const feedData = response.data;
      const newsItems = await this.parseFeed(feedData, feed.id);
      
      // Actualizar cache
      const existingNews = this.newsCache.get(feed.id) || [];
      const allNews = [...newsItems, ...existingNews];
      
      // Eliminar duplicados por enlace
      const uniqueNews = allNews.filter((item, index, self) =>
        index === self.findIndex(t => t.link === item.link)
      );
      
      // Ordenar por fecha (más recientes primero)
      uniqueNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      
      // Limitar a 100 noticias por feed
      this.newsCache.set(feed.id, uniqueNews.slice(0, 100));
      
      feed.lastUpdate = new Date().toISOString();
      feed.itemCount = uniqueNews.length;
      
      return newsItems.length;
    } catch (error) {
      console.error(`Error al obtener noticias del feed ${feed.name}:`, error.message);
      return 0;
    }
  }

  async parseFeed(xml, feedId) {
    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      const items = [];
      
      // Detectar tipo de feed (RSS o Atom)
      const isAtom = $('feed').length > 0;
      
      if (isAtom) {
        // Parsear Atom feed
        $('entry').each((i, elem) => {
          const title = $(elem).find('title').text() || '';
          const link = $(elem).find('link').attr('href') || $(elem).find('link').text() || '';
          const content = $(elem).find('content').text() || $(elem).find('summary').text() || '';
          const published = $(elem).find('published, updated').first().text() || '';
          
          items.push({
            id: `${feedId}-${i}`,
            title: this.cleanText(title),
            link: this.cleanText(link),
            content: this.cleanText(content),
            pubDate: published,
            feedId: feedId
          });
        });
      } else {
        // Parsear RSS feed
        $('item').each((i, elem) => {
          const title = $(elem).find('title').text() || '';
          const link = $(elem).find('link').text() || '';
          const description = $(elem).find('description').text() || '';
          const pubDate = $(elem).find('pubDate').text() || '';
          
          items.push({
            id: `${feedId}-${i}`,
            title: this.cleanText(title),
            link: this.cleanText(link),
            content: this.cleanText(description),
            pubDate: pubDate,
            feedId: feedId
          });
        });
      }
      
      return items;
    } catch (error) {
      console.error('Error parsing feed:', error.message);
      return [];
    }
  }

  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, '') // Eliminar tags HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  getAllFeeds() {
    return this.feeds;
  }

  getFeedById(id) {
    return this.feeds.find(f => f.id === id);
  }

  removeFeed(id) {
    this.feeds = this.feeds.filter(f => f.id !== id);
    this.newsCache.delete(id);
  }

  getAllNews() {
    const allNews = [];
    this.newsCache.forEach((news, feedId) => {
      const feed = this.getFeedById(feedId);
      if (feed) {
        news.forEach(item => {
          allNews.push({
            ...item,
            feedName: feed.name,
            feedUrl: feed.url
          });
        });
      }
    });
    
    return allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  }

  getNewsByFeed(feedId) {
    const news = this.newsCache.get(feedId) || [];
    const feed = this.getFeedById(feedId);
    return news.map(item => ({
      ...item,
      feedName: feed ? feed.name : 'Feed desconocido'
    }));
  }

  async refreshAllFeeds() {
    const results = [];
    for (const feed of this.feeds) {
      const count = await this.fetchFeedNews(feed);
      results.push({
        feedId: feed.id,
        feedName: feed.name,
        newItems: count
      });
    }
    return results;
  }
}

module.exports = new FeedService();